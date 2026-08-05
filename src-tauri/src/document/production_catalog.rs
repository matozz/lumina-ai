use super::project_validation::resolve_target_set;
use super::validation::{validate_effect_definition_document, validate_parameter_value_contract};
use super::{
    AssetRef, CenterEdgesRegion, CueCapabilitySummary, CueDefinition, CueLayer, CueQuantize,
    CueRiskSummary, CueTriggerMode, CueTriggerPolicy, DirectionDSL, EffectDefinitionDSL,
    EffectDefinitionDocument, EffectFamilyDSL, EffectInstanceDSL, EffectNodeDSL, GeneratorDSL,
    GroupDSL, GroupFixturesDSL, GroupRangeDSL, LayoutCapabilityDSL, LayoutDSL, LayoutDefinition,
    LayoutGeometry, LayoutType, MetaDSL, OscillatorWaveformDSL, ParameterOverridePolicyDSL,
    ParameterValueDSL, PatchDSL, ProjectBundle, ShowDocumentV4, StageDocument, StrobeRiskDSL,
    TargetSetDefinition, TargetSetRef, TargetSetSelector, TargetingSceneDefinition,
    TargetingSceneRef, TargetingTransition, CUE_DEFINITION_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION,
};
use crate::compiler::diagnostic::{
    Diagnostic, CATALOG_METADATA_INVALID, CATALOG_OUTPUT_INVALID, CATALOG_PARAMETER_INVALID,
    CUE_LAYER_ATTRIBUTE_CONFLICT, CUE_RECIPE_INVALID, CUE_RECIPE_UNRESOLVED,
};
use crate::compiler::Compiler;
use crate::engine::profile::profile_by_id;
use crate::engine::profile::AttributeValue;
use crate::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const PRODUCTION_CATALOG_SCHEMA_VERSION: u32 = 1;
pub const CUE_RECIPE_SCHEMA_VERSION: u32 = 1;
pub const PRODUCTION_CATALOG_GOLDEN_SCHEMA_VERSION: u32 = 1;
pub const PRODUCTION_COMPATIBILITY_SCHEMA_VERSION: u32 = 1;
const GOLDEN_PPQ: u32 = 960;
const GOLDEN_TICKS: [u32; 6] = [0, 120, 480, 960, 1_440, 2_880];

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ProductionCatalog {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub effects: Vec<EffectDefinitionDocument>,
    pub cue_recipes: Vec<CueRecipeDefinition>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Eq, Hash)]
#[serde(deny_unknown_fields)]
pub struct CueRecipeRef {
    pub id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueRecipeDefinition {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub name: String,
    pub description: String,
    #[schemars(range(min = 1))]
    pub nominal_length_ticks: u32,
    pub layers: Vec<CueRecipeLayer>,
    pub trigger_policy: CueTriggerPolicy,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueRecipeLayer {
    pub id: String,
    pub effect_ref: AssetRef,
    pub target: CueRecipeTargetDSL,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene: Option<CueRecipeSceneDSL>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub parameter_overrides: BTreeMap<String, ParameterValueDSL>,
    pub phase: f64,
    pub seed: String,
    #[serde(default)]
    pub layer: i32,
    #[serde(default)]
    pub priority: i32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum CueRecipeTargetDSL {
    AnyCompatible,
    All,
    Rows,
    Columns,
    GridZones,
    Checkerboard,
    Center,
    Edges,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct CueRecipeSceneDSL {
    #[schemars(range(min = 1))]
    pub minimum_steps: u32,
    #[serde(default)]
    pub requires_weighted_transition: bool,
}

pub fn builtin_production_catalog() -> Result<ProductionCatalog, Diagnostic> {
    serde_json::from_str(include_str!("../../../catalog/production-catalog-v1.json")).map_err(
        |error| {
            Diagnostic::error(
                CATALOG_METADATA_INVALID,
                "catalog/production-catalog-v1.json",
                error.to_string(),
                "Regenerate the checked-in Production Catalog from the Rust authority.",
            )
        },
    )
}

pub fn validate_production_catalog(catalog: &ProductionCatalog) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    if catalog.schema_version != PRODUCTION_CATALOG_SCHEMA_VERSION {
        diagnostics.push(Diagnostic::error(
            CATALOG_METADATA_INVALID,
            "schema_version",
            format!(
                "Expected Production Catalog schema version {PRODUCTION_CATALOG_SCHEMA_VERSION}."
            ),
            "Migrate the Catalog before loading it.",
        ));
    }

    let mut effect_identities = BTreeSet::new();
    for (index, effect) in catalog.effects.iter().enumerate() {
        let path = format!("effects[{index}]");
        if !effect_identities.insert((effect.id.as_str(), effect.revision)) {
            diagnostics.push(
                Diagnostic::error(
                    CATALOG_METADATA_INVALID,
                    format!("{path}.id"),
                    "Production Effect identity must be unique.",
                    "Use one immutable asset per ID and revision.",
                )
                .with_asset("effect", effect.id.clone(), effect.revision),
            );
        }
        if !matches!(effect.source, super::EffectSourceDSL::BuiltIn) {
            diagnostics.push(
                Diagnostic::error(
                    CATALOG_METADATA_INVALID,
                    format!("{path}.source"),
                    "Production Catalog Effects must use built_in source.",
                    "Fork custom content into a project_local revision.",
                )
                .with_asset("effect", effect.id.clone(), effect.revision),
            );
        }
        let start = diagnostics.len();
        validate_effect_definition_document(effect, &path, &mut diagnostics);
        for diagnostic in &mut diagnostics[start..] {
            if diagnostic.asset.is_none() {
                diagnostic.asset = Some(Box::new(crate::compiler::diagnostic::DiagnosticAsset {
                    kind: "effect".to_string(),
                    id: effect.id.clone(),
                    revision: effect.revision,
                }));
            }
        }
    }

    let mut recipe_identities = BTreeSet::new();
    for (index, recipe) in catalog.cue_recipes.iter().enumerate() {
        validate_cue_recipe(
            catalog,
            recipe,
            index,
            &mut recipe_identities,
            &mut diagnostics,
        );
    }
    diagnostics.sort_by(|left, right| {
        (
            left.asset.as_ref().map(|asset| asset.id.as_str()),
            left.asset.as_ref().map(|asset| asset.revision),
            left.path.as_str(),
            left.code.as_str(),
        )
            .cmp(&(
                right.asset.as_ref().map(|asset| asset.id.as_str()),
                right.asset.as_ref().map(|asset| asset.revision),
                right.path.as_str(),
                right.code.as_str(),
            ))
    });
    diagnostics
}

pub fn validate_production_catalog_runtime(catalog: &ProductionCatalog) -> Vec<Diagnostic> {
    const SAMPLE_BEATS: [f64; 8] = [0.0, 0.125, 0.25, 0.375, 0.5, 0.75, 1.0, 1.5];
    let mut diagnostics = Vec::new();
    let mut signatures = BTreeMap::<String, (String, u32)>::new();
    for effect in &catalog.effects {
        let document = effect_sample_document(effect, BTreeMap::new());
        let show = match Compiler::compile_document(document) {
            Ok(show) => show,
            Err(mut errors) => {
                for diagnostic in &mut errors {
                    diagnostic.asset =
                        Some(Box::new(crate::compiler::diagnostic::DiagnosticAsset {
                            kind: "effect".to_string(),
                            id: effect.id.clone(),
                            revision: effect.revision,
                        }));
                }
                diagnostics.extend(errors);
                continue;
            }
        };
        let active = effect_sample_live(&show);
        let samples: Vec<_> = SAMPLE_BEATS
            .iter()
            .map(|beat| {
                render_at(
                    &show,
                    RenderTime { beat: *beat },
                    RenderSource::Live(&active),
                )
            })
            .collect();
        if !samples.iter().flatten().any(|frame| {
            frame.to_payload().attributes.iter().any(|attribute| {
                attribute.id == "intensity"
                    && matches!(attribute.value, AttributeValue::Scalar(value) if value > 0.01)
            })
        }) {
            diagnostics.push(output_diagnostic(
                effect,
                "sampled_output",
                "Sampled Effect output remains black.",
                "Write a visible intensity value during the sampled loop.",
            ));
        }
        if samples.windows(2).all(|pair| pair[0] == pair[1]) {
            diagnostics.push(output_diagnostic(
                effect,
                "sampled_output",
                "Sampled Effect output is static across the preview loop.",
                "Connect time or spatial phase to a visible writer.",
            ));
        }
        if matches!(effect.catalog.family, Some(EffectFamilyDSL::Strobe)) {
            match sampled_maximum_strobe_risk(effect) {
                Ok(observed) if strobe_rank(effect.catalog.strobe_risk) < strobe_rank(observed) => {
                    diagnostics.push(
                        Diagnostic::error(
                            CATALOG_METADATA_INVALID,
                            "catalog.strobe_risk",
                            format!(
                                "Declared strobe risk {:?} understates sampled maximum {:?}.",
                                effect.catalog.strobe_risk, observed
                            ),
                            "Raise the declared risk or reduce the maximum flash rate.",
                        )
                        .with_asset(
                            "effect",
                            effect.id.clone(),
                            effect.revision,
                        ),
                    );
                }
                Ok(_) => {}
                Err(mut errors) => {
                    for diagnostic in &mut errors {
                        diagnostic.asset =
                            Some(Box::new(crate::compiler::diagnostic::DiagnosticAsset {
                                kind: "effect".to_string(),
                                id: effect.id.clone(),
                                revision: effect.revision,
                            }));
                    }
                    diagnostics.extend(errors);
                }
            }
        }
        let signature = serde_json::to_string(
            &samples
                .iter()
                .map(|frames| {
                    frames
                        .iter()
                        .map(|frame| frame.to_payload())
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>(),
        )
        .expect("sample output serializes");
        if let Some((duplicate_id, duplicate_revision)) =
            signatures.insert(signature, (effect.id.clone(), effect.revision))
        {
            diagnostics.push(output_diagnostic(
                effect,
                "sampled_output",
                &format!("Sampled output duplicates {duplicate_id} revision {duplicate_revision}."),
                "Make the Production Effect behavior observably distinct.",
            ));
        }
        for parameter in effect.parameters.iter().filter(|parameter| {
            matches!(
                parameter.override_policy,
                Some(ParameterOverridePolicyDSL::CueOverride)
            )
        }) {
            let Some(alternate) = alternate_parameter_value(parameter) else {
                continue;
            };
            let changed =
                effect_sample_document(effect, BTreeMap::from([(parameter.id.clone(), alternate)]));
            let Ok(changed_show) = Compiler::compile_document(changed) else {
                diagnostics.push(output_diagnostic(
                    effect,
                    &format!("parameters.{}", parameter.id),
                    "A valid Cue override failed preview compilation.",
                    "Repair the parameter runtime binding.",
                ));
                continue;
            };
            let changed_active = effect_sample_live(&changed_show);
            let changed_samples: Vec<_> = SAMPLE_BEATS
                .iter()
                .map(|beat| {
                    render_at(
                        &changed_show,
                        RenderTime { beat: *beat },
                        RenderSource::Live(&changed_active),
                    )
                })
                .collect();
            if changed_samples == samples {
                diagnostics.push(output_diagnostic(
                    effect,
                    &format!("parameters.{}", parameter.id),
                    "Changing a Cue-overridable parameter has no sampled output effect.",
                    "Connect the runtime parameter to rendering or mark it effect_only.",
                ));
            }
        }
    }
    diagnostics.sort_by(|left, right| {
        (
            left.asset.as_ref().map(|asset| asset.id.as_str()),
            left.path.as_str(),
        )
            .cmp(&(
                right.asset.as_ref().map(|asset| asset.id.as_str()),
                right.path.as_str(),
            ))
    });
    diagnostics
}

pub fn production_catalog_golden(
    catalog: &ProductionCatalog,
) -> Result<serde_json::Value, Vec<Diagnostic>> {
    let mut effects = Vec::with_capacity(catalog.effects.len());
    let mut diagnostics = Vec::new();
    for effect in &catalog.effects {
        let document = effect_sample_document(effect, BTreeMap::new());
        let show = match Compiler::compile_document(document) {
            Ok(show) => show,
            Err(mut errors) => {
                for diagnostic in &mut errors {
                    diagnostic.asset =
                        Some(Box::new(crate::compiler::diagnostic::DiagnosticAsset {
                            kind: "effect".to_string(),
                            id: effect.id.clone(),
                            revision: effect.revision,
                        }));
                }
                diagnostics.extend(errors);
                continue;
            }
        };
        let active = effect_sample_live(&show);
        let samples = GOLDEN_TICKS
            .iter()
            .map(|tick| {
                let frames = render_at(
                    &show,
                    RenderTime {
                        beat: f64::from(*tick) / f64::from(GOLDEN_PPQ),
                    },
                    RenderSource::Live(&active),
                )
                .iter()
                .map(golden_fixture_row)
                .collect::<Vec<_>>();
                serde_json::json!({ "tick": tick, "frames": frames })
            })
            .collect::<Vec<_>>();
        effects.push(serde_json::json!({
            "effect_ref": { "id": effect.id, "revision": effect.revision },
            "name": effect.name,
            "samples": samples,
        }));
    }
    if diagnostics.is_empty() {
        let fixture_profile = profile_by_id("generic-moving-head")
            .expect("checked-in generic moving-head profile exists");
        Ok(serde_json::json!({
            "schema_version": PRODUCTION_CATALOG_GOLDEN_SCHEMA_VERSION,
            "ppq": GOLDEN_PPQ,
            "ticks": GOLDEN_TICKS,
            "fixture_count": 16,
            "fixture_profile": fixture_profile.id.as_str(),
            "frame_encoding": "[fixture_id, attribute values in attribute_order]",
            "attribute_order": fixture_profile.attributes.iter().map(|attribute| attribute.id.as_str()).collect::<Vec<_>>(),
            "effects": effects,
        }))
    } else {
        diagnostics.sort_by(|left, right| {
            (
                left.asset.as_ref().map(|asset| asset.id.as_str()),
                left.path.as_str(),
            )
                .cmp(&(
                    right.asset.as_ref().map(|asset| asset.id.as_str()),
                    right.path.as_str(),
                ))
        });
        Err(diagnostics)
    }
}

fn golden_fixture_row(frame: &crate::engine::attribute::FixtureFrame) -> serde_json::Value {
    let mut row = Vec::with_capacity(frame.values().len() + 1);
    row.push(serde_json::json!(frame.id));
    row.extend(frame.values().iter().map(|value| match value {
        AttributeValue::Scalar(value) | AttributeValue::Angle(value) => {
            serde_json::json!(f64::from(*value))
        }
        AttributeValue::Color(value) => serde_json::json!(value),
        AttributeValue::Enum(value) => serde_json::json!(value),
        AttributeValue::Boolean(value) => serde_json::json!(value),
    }));
    serde_json::Value::Array(row)
}

pub fn production_catalog_compatibility(catalog: &ProductionCatalog) -> serde_json::Value {
    const LAYOUTS: [(&str, &str, LayoutCapabilityDSL); 4] = [
        ("matrix", "Matrix", LayoutCapabilityDSL::Matrix),
        ("strip_bar", "Strip / Bar", LayoutCapabilityDSL::Linear),
        ("circle", "Circle", LayoutCapabilityDSL::Radial),
        ("frame", "Frame", LayoutCapabilityDSL::Matrix),
    ];
    let layouts = LAYOUTS
        .iter()
        .map(|(id, label, native)| {
            serde_json::json!({
                "id": id,
                "label": label,
                "native_capability": native,
                "coordinate_fallback": true,
            })
        })
        .collect::<Vec<_>>();
    let effects = catalog
        .effects
        .iter()
        .map(|effect| {
            let layout_status = LAYOUTS
                .iter()
                .map(|(id, _, native)| {
                    let (status, matched) =
                        compatibility_status(&effect.catalog.layout_capabilities, *native);
                    (
                        (*id).to_string(),
                        serde_json::json!({
                            "supported": status != "incompatible",
                            "status": status,
                            "matched_capability": matched,
                        }),
                    )
                })
                .collect::<BTreeMap<_, _>>();
            serde_json::json!({
                "effect_ref": { "id": effect.id, "revision": effect.revision },
                "name": effect.name,
                "declared_capabilities": effect.catalog.layout_capabilities,
                "layouts": layout_status,
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "schema_version": PRODUCTION_COMPATIBILITY_SCHEMA_VERSION,
        "policy": "native capability first, then universal or coordinate fallback",
        "layouts": layouts,
        "effects": effects,
    })
}

pub fn validate_effect_draft(
    mut effect: EffectDefinitionDocument,
) -> Result<EffectDefinitionDocument, Vec<Diagnostic>> {
    let mut diagnostics = materialize_effect_graph_bindings(&mut effect);
    validate_effect_definition_document(&effect, "effect", &mut diagnostics);
    if diagnostics.is_empty() {
        diagnostics.extend(validate_production_catalog_runtime(&ProductionCatalog {
            schema_version: PRODUCTION_CATALOG_SCHEMA_VERSION,
            effects: vec![effect.clone()],
            cue_recipes: Vec::new(),
        }));
    }
    if diagnostics.is_empty() {
        Ok(effect)
    } else {
        diagnostics.sort_by(|left, right| {
            (left.path.as_str(), left.code.as_str())
                .cmp(&(right.path.as_str(), right.code.as_str()))
        });
        Err(diagnostics)
    }
}

pub fn materialize_effect_graph_bindings(effect: &mut EffectDefinitionDocument) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    for (index, parameter) in effect.parameters.iter().enumerate() {
        let Some(binding) = &parameter.graph_binding else {
            continue;
        };
        let Some(node) = effect
            .graph
            .nodes
            .iter_mut()
            .find(|node| node.id() == binding.node_id)
        else {
            continue;
        };
        let applied = match (binding.property, node, &parameter.default_value) {
            (
                super::EffectNodePropertyDSL::Waveform,
                super::EffectNodeDSL::Oscillator { waveform, .. },
                ParameterValueDSL::Enum(value),
            ) => parse_waveform(value)
                .map(|value| *waveform = value)
                .is_some(),
            (
                super::EffectNodePropertyDSL::Attack,
                super::EffectNodeDSL::Envelope { attack, .. },
                ParameterValueDSL::Scalar(value),
            ) => {
                *attack = *value;
                true
            }
            (
                super::EffectNodePropertyDSL::Release,
                super::EffectNodeDSL::Envelope { release, .. },
                ParameterValueDSL::Scalar(value),
            ) => {
                *release = *value;
                true
            }
            (
                super::EffectNodePropertyDSL::ColorStops,
                super::EffectNodeDSL::ColorGradient { stops, .. },
                ParameterValueDSL::ColorStops(value),
            ) => {
                *stops = value.clone();
                true
            }
            _ => false,
        };
        if !applied {
            diagnostics.push(
                Diagnostic::error(
                    CATALOG_PARAMETER_INVALID,
                    format!("effect.parameters[{index}].graph_binding"),
                    "Typed graph binding cannot be materialized from this parameter value.",
                    "Restore the safe fallback or repair the binding contract.",
                )
                .with_asset("effect", effect.id.clone(), effect.revision)
                .with_recovery(
                    "restore_safe_fallback",
                    "Restore safe fallback",
                    Some(format!("effect.parameters[{index}].default_value")),
                ),
            );
        }
    }
    diagnostics
}

fn parse_waveform(value: &str) -> Option<OscillatorWaveformDSL> {
    match value {
        "sine" => Some(OscillatorWaveformDSL::Sine),
        "triangle" => Some(OscillatorWaveformDSL::Triangle),
        "saw" => Some(OscillatorWaveformDSL::Saw),
        "pulse" => Some(OscillatorWaveformDSL::Pulse),
        _ => None,
    }
}

fn effect_sample_live(show: &crate::compiler::CompiledShow) -> [LivePhaser; 1] {
    let multiplier = show
        .effect_instances
        .get("catalog-preview")
        .and_then(|instance| {
            let definition = show.effect_definitions.get(instance.definition.index())?;
            let handle = definition.parameter_handle("speed")?;
            instance
                .resolve_parameter(definition, handle)
                .and_then(|value| value.as_scalar())
        })
        .unwrap_or(1.0);
    [LivePhaser {
        id: "catalog-preview".to_string(),
        start_beat: 0.0,
        phase_offset: 0.0,
        multiplier,
    }]
}

fn effect_sample_document(
    effect: &EffectDefinitionDocument,
    parameter_overrides: BTreeMap<String, ParameterValueDSL>,
) -> ShowDocumentV4 {
    ShowDocumentV4 {
        schema_version: CURRENT_SCHEMA_VERSION,
        meta: MetaDSL {
            name: format!("Catalog sample · {}", effect.name),
        },
        patch: vec![PatchDSL {
            profile_id: "generic-moving-head".to_string(),
            id_range: (1, 16),
        }],
        layout: LayoutDSL {
            type_: LayoutType::Generator,
            generator: GeneratorDSL::Matrix {
                rows: 4,
                columns: 4,
                spacing: 1.0,
                origin: Some((0.0, 0.0)),
            },
        },
        groups: vec![GroupDSL {
            id: "all".to_string(),
            name: "All".to_string(),
            fixtures: GroupFixturesDSL::Range(GroupRangeDSL { range: (1, 16) }),
            sort_by: None,
        }],
        effect_definitions: vec![EffectDefinitionDSL {
            id: effect.id.clone(),
            name: effect.name.clone(),
            revision: effect.revision,
            source: effect.source,
            parameters: effect.parameters.clone(),
            graph: effect.graph.clone(),
            catalog: effect.catalog.clone(),
        }],
        effect_instances: vec![EffectInstanceDSL {
            id: "catalog-preview".to_string(),
            definition_id: effect.id.clone(),
            definition_revision: effect.revision,
            target_group_id: "all".to_string(),
            parameter_overrides,
            seed: "0000000000000001".to_string(),
        }],
        timeline: None,
    }
}

fn alternate_parameter_value(
    parameter: &super::ParameterDefinitionDSL,
) -> Option<ParameterValueDSL> {
    match (&parameter.default_value, parameter.range) {
        (ParameterValueDSL::Scalar(default), Some((minimum, maximum))) => {
            let candidate = if parameter.id == "speed" {
                [0.25, 0.5, 1.0, 2.0, 4.0, 8.0].into_iter().find(|value| {
                    (*value - default).abs() > f64::EPSILON
                        && *value >= minimum
                        && *value <= maximum
                })?
            } else if parameter.id == "phase" {
                (*default + 0.25).clamp(minimum, maximum)
            } else if (*default - minimum).abs() > (*default - maximum).abs() {
                minimum
            } else {
                maximum
            };
            Some(ParameterValueDSL::Scalar(candidate))
        }
        (ParameterValueDSL::Direction(DirectionDSL::Forward), _) => {
            Some(ParameterValueDSL::Direction(DirectionDSL::Reverse))
        }
        (ParameterValueDSL::Direction(DirectionDSL::Reverse), _) => {
            Some(ParameterValueDSL::Direction(DirectionDSL::Forward))
        }
        (ParameterValueDSL::Boolean(value), _) => Some(ParameterValueDSL::Boolean(!value)),
        (ParameterValueDSL::Enum(value), _) => parameter
            .enum_values
            .iter()
            .find(|candidate| *candidate != value)
            .cloned()
            .map(ParameterValueDSL::Enum),
        _ => None,
    }
}

fn sampled_maximum_strobe_risk(
    effect: &EffectDefinitionDocument,
) -> Result<StrobeRiskDSL, Vec<Diagnostic>> {
    const SAMPLE_BEATS: u32 = 4;
    const SAMPLES_PER_BEAT: u32 = 64;
    let maximum_speed = effect
        .parameters
        .iter()
        .find(|parameter| parameter.id == "speed")
        .and_then(|parameter| parameter.range.map(|(_, maximum)| maximum));
    let overrides = maximum_speed.map_or_else(BTreeMap::new, |maximum| {
        BTreeMap::from([("speed".to_string(), ParameterValueDSL::Scalar(maximum))])
    });
    let show = Compiler::compile_document(effect_sample_document(effect, overrides))?;
    let active = effect_sample_live(&show);
    let states = (0..=SAMPLE_BEATS * SAMPLES_PER_BEAT)
        .map(|sample| {
            let frames = render_at(
                &show,
                RenderTime {
                    beat: f64::from(sample) / f64::from(SAMPLES_PER_BEAT),
                },
                RenderSource::Live(&active),
            );
            frames
                .first()
                .and_then(frame_intensity)
                .is_some_and(|value| value > 0.1)
        })
        .collect::<Vec<_>>();
    let crossings = states.windows(2).filter(|pair| pair[0] != pair[1]).count();
    let flashes_per_second = crossings as f64 / 2.0 / f64::from(SAMPLE_BEATS) * 2.0;
    Ok(if flashes_per_second <= f64::EPSILON {
        StrobeRiskDSL::None
    } else if flashes_per_second < 3.0 {
        StrobeRiskDSL::Low
    } else if flashes_per_second < 8.0 {
        StrobeRiskDSL::Medium
    } else {
        StrobeRiskDSL::High
    })
}

fn frame_intensity(frame: &crate::engine::attribute::FixtureFrame) -> Option<f64> {
    frame
        .to_payload()
        .attributes
        .into_iter()
        .find(|attribute| attribute.id == "intensity")
        .and_then(|attribute| match attribute.value {
            AttributeValue::Scalar(value) => Some(f64::from(value)),
            _ => None,
        })
}

fn compatibility_status(
    declared: &[LayoutCapabilityDSL],
    native: LayoutCapabilityDSL,
) -> (&'static str, Option<LayoutCapabilityDSL>) {
    if declared.is_empty() || declared.contains(&LayoutCapabilityDSL::Any) {
        ("universal", Some(LayoutCapabilityDSL::Any))
    } else if declared.contains(&native) {
        ("native", Some(native))
    } else if declared.contains(&LayoutCapabilityDSL::Coordinates) {
        (
            "coordinate_fallback",
            Some(LayoutCapabilityDSL::Coordinates),
        )
    } else {
        ("incompatible", None)
    }
}

fn output_diagnostic(
    effect: &EffectDefinitionDocument,
    path: &str,
    message: &str,
    hint: &str,
) -> Diagnostic {
    Diagnostic::error(CATALOG_OUTPUT_INVALID, path, message, hint).with_asset(
        "effect",
        effect.id.clone(),
        effect.revision,
    )
}

fn validate_cue_recipe<'a>(
    catalog: &'a ProductionCatalog,
    recipe: &'a CueRecipeDefinition,
    index: usize,
    identities: &mut BTreeSet<(&'a str, u32)>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let path = format!("cue_recipes[{index}]");
    let asset = || ("cue_recipe", recipe.id.clone(), recipe.revision);
    if recipe.schema_version != CUE_RECIPE_SCHEMA_VERSION
        || recipe.id.trim().is_empty()
        || recipe.revision == 0
        || !identities.insert((recipe.id.as_str(), recipe.revision))
    {
        diagnostics.push(
            Diagnostic::error(
                CUE_RECIPE_INVALID,
                format!("{path}.id"),
                "Cue recipe identity and schema version must be stable and unique.",
                "Use a non-empty ID, positive revision, and supported schema version.",
            )
            .with_asset(asset().0, asset().1, asset().2),
        );
    }
    if recipe.name.trim().is_empty()
        || recipe.description.trim().is_empty()
        || recipe.nominal_length_ticks == 0
        || recipe.layers.is_empty()
    {
        diagnostics.push(
            Diagnostic::error(
                CUE_RECIPE_INVALID,
                path.clone(),
                "Cue recipe requires name, description, duration, and at least one layer.",
                "Complete the user-facing recipe metadata.",
            )
            .with_asset(asset().0, asset().1, asset().2),
        );
    }
    let mut layer_ids = BTreeSet::new();
    for (layer_index, layer) in recipe.layers.iter().enumerate() {
        let layer_path = format!("{path}.layers[{layer_index}]");
        if layer.id.trim().is_empty() || !layer_ids.insert(layer.id.as_str()) {
            diagnostics.push(
                Diagnostic::error(
                    CUE_RECIPE_INVALID,
                    format!("{layer_path}.id"),
                    "Cue recipe layer IDs must be non-empty and unique.",
                    "Use stable layer IDs within the recipe.",
                )
                .with_asset(asset().0, asset().1, asset().2),
            );
        }
        if !layer.phase.is_finite()
            || layer.seed.len() != 16
            || !layer.seed.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            diagnostics.push(
                Diagnostic::error(
                    CUE_RECIPE_INVALID,
                    layer_path.clone(),
                    "Cue recipe phase and deterministic seed are invalid.",
                    "Use a finite phase and a 16-digit hexadecimal seed.",
                )
                .with_asset(asset().0, asset().1, asset().2),
            );
        }
        let Some(effect) = catalog.effects.iter().find(|effect| {
            effect.id == layer.effect_ref.id && effect.revision == layer.effect_ref.revision
        }) else {
            diagnostics.push(
                Diagnostic::error(
                    CUE_RECIPE_INVALID,
                    format!("{layer_path}.effect_ref"),
                    "Cue recipe references an Effect outside the Production Catalog.",
                    "Pin an exact built-in Effect revision.",
                )
                .with_asset(asset().0, asset().1, asset().2),
            );
            continue;
        };
        for (parameter_id, value) in &layer.parameter_overrides {
            let Some(parameter) = effect
                .parameters
                .iter()
                .find(|parameter| parameter.id == *parameter_id)
            else {
                diagnostics.push(
                    Diagnostic::error(
                        CATALOG_PARAMETER_INVALID,
                        format!("{layer_path}.parameter_overrides.{parameter_id}"),
                        "Cue recipe override references an unknown Effect parameter.",
                        "Use a parameter from the pinned Effect revision.",
                    )
                    .with_asset(asset().0, asset().1, asset().2),
                );
                continue;
            };
            if !matches!(
                parameter.override_policy,
                Some(ParameterOverridePolicyDSL::CueOverride)
            ) {
                diagnostics.push(
                    Diagnostic::error(
                        CATALOG_PARAMETER_INVALID,
                        format!("{layer_path}.parameter_overrides.{parameter_id}"),
                        "Cue recipe cannot override an Effect-only or locked parameter.",
                        "Remove the override or customize the Effect revision.",
                    )
                    .with_asset(asset().0, asset().1, asset().2),
                );
            }
            validate_parameter_value_contract(
                value,
                parameter.value_type,
                parameter.range,
                &parameter.enum_values,
                &format!("{layer_path}.parameter_overrides.{parameter_id}"),
                diagnostics,
            );
        }
    }
    validate_recipe_layer_composition(catalog, recipe, &path, diagnostics);
}

fn validate_recipe_layer_composition(
    catalog: &ProductionCatalog,
    recipe: &CueRecipeDefinition,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for (left_index, left) in recipe.layers.iter().enumerate() {
        let Some(left_effect) = catalog.effects.iter().find(|effect| {
            effect.id == left.effect_ref.id && effect.revision == left.effect_ref.revision
        }) else {
            continue;
        };
        let left_attributes = effect_writer_attributes(left_effect);
        for (right_index, right) in recipe.layers.iter().enumerate().skip(left_index + 1) {
            let Some(right_effect) = catalog.effects.iter().find(|effect| {
                effect.id == right.effect_ref.id && effect.revision == right.effect_ref.revision
            }) else {
                continue;
            };
            let right_attributes = effect_writer_attributes(right_effect);
            let conflicts = left_attributes
                .intersection(&right_attributes)
                .cloned()
                .collect::<Vec<_>>();
            if conflicts.is_empty() {
                continue;
            }
            diagnostics.push(
                Diagnostic::error(
                    CUE_LAYER_ATTRIBUTE_CONFLICT,
                    format!("{path}.layers[{right_index}].effect_ref"),
                    format!(
                        "Production recipe layers {:?} and {:?} both write {}.",
                        left.id,
                        right.id,
                        conflicts.join(", ")
                    ),
                    "Use one coherent Effect per default recipe, or compose orthogonal attributes in a dedicated typed Effect.",
                )
                .with_asset("cue_recipe", recipe.id.clone(), recipe.revision),
            );
        }
    }
}

fn effect_writer_attributes(effect: &EffectDefinitionDocument) -> BTreeSet<String> {
    let mut attributes = BTreeSet::new();
    let mut has_attribute_set_writer = false;
    for node in &effect.graph.nodes {
        if let EffectNodeDSL::AttributeWriter { attribute_id, .. } = node {
            if let Some(attribute_id) = attribute_id {
                attributes.insert(attribute_id.clone());
            } else {
                has_attribute_set_writer = true;
            }
        }
    }
    if has_attribute_set_writer || attributes.is_empty() {
        attributes.extend(effect.catalog.required_attributes.iter().cloned());
    }
    attributes
}

pub fn resolve_cue_recipe(
    catalog: &ProductionCatalog,
    bundle: &ProjectBundle,
    recipe_ref: &CueRecipeRef,
    stage_ref: &AssetRef,
    cue_id: String,
    cue_revision: u32,
    cue_name: String,
) -> Result<CueDefinition, Vec<Diagnostic>> {
    let Some(recipe) = catalog
        .cue_recipes
        .iter()
        .find(|recipe| recipe.id == recipe_ref.id && recipe.revision == recipe_ref.revision)
    else {
        return Err(vec![unresolved_recipe(
            recipe_ref,
            "recipe_ref",
            "Cue recipe revision is not available.",
            "Choose an exact recipe revision from the Production Catalog.",
        )]);
    };
    let Some(stage) = bundle
        .stages
        .iter()
        .find(|stage| stage.id == stage_ref.id && stage.revision == stage_ref.revision)
    else {
        return Err(vec![unresolved_recipe(
            recipe_ref,
            "stage_ref",
            "Active Stage revision is not available.",
            "Choose an exact Stage revision from the Project.",
        )]);
    };
    let Some(layout) = bundle.layouts.iter().find(|layout| {
        layout.id == stage.layout_ref.id && layout.revision == stage.layout_ref.revision
    }) else {
        return Err(vec![unresolved_recipe(
            recipe_ref,
            "stage_ref",
            "Active Stage Layout revision is not available.",
            "Repair the Stage Layout reference before resolving a recipe.",
        )]);
    };

    let mut diagnostics = Vec::new();
    let mut layers = Vec::with_capacity(recipe.layers.len());
    let mut required_attributes = BTreeSet::new();
    let mut strobe_risk = StrobeRiskDSL::None;
    for (index, recipe_layer) in recipe.layers.iter().enumerate() {
        let path = format!("layers[{index}]");
        let Some(effect) = catalog.effects.iter().find(|effect| {
            effect.id == recipe_layer.effect_ref.id
                && effect.revision == recipe_layer.effect_ref.revision
        }) else {
            diagnostics.push(unresolved_recipe(
                recipe_ref,
                &format!("{path}.effect_ref"),
                "Pinned Production Effect is unavailable.",
                "Restore the exact built-in Effect revision.",
            ));
            continue;
        };
        if !layout_supports_effect(layout, &effect.catalog.layout_capabilities) {
            diagnostics.push(unresolved_recipe(
                recipe_ref,
                &format!("{path}.effect_ref"),
                "Active Stage Layout does not satisfy the Effect layout capability.",
                "Choose a compatible Stage or customize the Cue recipe.",
            ));
            continue;
        }
        let Some(target) = resolve_target(stage, recipe_layer.target) else {
            diagnostics.push(
                unresolved_recipe(
                    recipe_ref,
                    &format!("{path}.target"),
                    "Active Stage has no TargetSet matching the recipe selector type.",
                    "Choose or create a compatible TargetSet.",
                )
                .with_recovery(
                    "choose_target",
                    "Choose compatible target",
                    Some(format!("{path}.target")),
                ),
            );
            continue;
        };
        if !target_supports_effect(stage, layout, target, &effect.catalog.required_attributes) {
            diagnostics.push(
                unresolved_recipe(
                    recipe_ref,
                    &format!("{path}.target"),
                    "Resolved TargetSet contains fixtures without required Effect attributes.",
                    "Choose a capability-compatible target or Stage.",
                )
                .with_recovery(
                    "choose_target",
                    "Choose compatible target",
                    Some(format!("{path}.target")),
                ),
            );
            continue;
        }
        let scene = recipe_layer
            .scene
            .and_then(|query| resolve_scene(stage, query));
        if recipe_layer.scene.is_some() && scene.is_none() {
            diagnostics.push(
                unresolved_recipe(
                    recipe_ref,
                    &format!("{path}.scene"),
                    "Active Stage has no TargetingScene matching the recipe capability.",
                    "Choose or create a compatible TargetingScene.",
                )
                .with_recovery(
                    "choose_targeting_scene",
                    "Choose targeting scene",
                    Some(format!("{path}.scene")),
                ),
            );
            continue;
        }
        required_attributes.extend(effect.catalog.required_attributes.iter().cloned());
        if strobe_rank(effect.catalog.strobe_risk) > strobe_rank(strobe_risk) {
            strobe_risk = effect.catalog.strobe_risk;
        }
        layers.push(CueLayer {
            id: recipe_layer.id.clone(),
            effect_ref: recipe_layer.effect_ref.clone(),
            target_set_ref: TargetSetRef {
                stage_id: stage.id.clone(),
                stage_revision: stage.revision,
                target_set_id: target.id.clone(),
            },
            targeting_scene_ref: scene.map(|scene| TargetingSceneRef {
                stage_id: stage.id.clone(),
                stage_revision: stage.revision,
                targeting_scene_id: scene.id.clone(),
            }),
            parameter_overrides: recipe_layer.parameter_overrides.clone(),
            phase: recipe_layer.phase,
            seed: recipe_layer.seed.to_lowercase(),
            layer: recipe_layer.layer,
            priority: recipe_layer.priority,
            mix_overrides: Vec::new(),
            trigger_policy: recipe.trigger_policy,
        });
    }
    if !diagnostics.is_empty() {
        diagnostics.sort_by(|left, right| left.path.cmp(&right.path));
        return Err(diagnostics);
    }

    Ok(CueDefinition {
        schema_version: CUE_DEFINITION_SCHEMA_VERSION,
        id: cue_id,
        revision: cue_revision,
        name: cue_name,
        compatible_stage_ref: stage_ref.clone(),
        nominal_length_ticks: recipe.nominal_length_ticks,
        layers,
        automation_lanes: Vec::new(),
        trigger_policy: recipe.trigger_policy,
        capability_summary: CueCapabilitySummary {
            required_attributes: required_attributes.into_iter().collect(),
        },
        risk_summary: CueRiskSummary { strobe_risk },
    })
}

fn resolve_target(
    stage: &StageDocument,
    query: CueRecipeTargetDSL,
) -> Option<&TargetSetDefinition> {
    let mut targets: Vec<_> = stage
        .target_sets
        .iter()
        .filter(|target| target_matches(&target.selector, query))
        .collect();
    targets.sort_by(|left, right| left.id.cmp(&right.id));
    targets.into_iter().next()
}

fn target_matches(selector: &TargetSetSelector, query: CueRecipeTargetDSL) -> bool {
    match query {
        CueRecipeTargetDSL::AnyCompatible => true,
        CueRecipeTargetDSL::All => matches!(selector, TargetSetSelector::All),
        CueRecipeTargetDSL::Rows => matches!(selector, TargetSetSelector::Rows { .. }),
        CueRecipeTargetDSL::Columns => matches!(selector, TargetSetSelector::Columns { .. }),
        CueRecipeTargetDSL::GridZones => matches!(selector, TargetSetSelector::GridZones { .. }),
        CueRecipeTargetDSL::Checkerboard => {
            matches!(selector, TargetSetSelector::Checkerboard { .. })
        }
        CueRecipeTargetDSL::Center => matches!(
            selector,
            TargetSetSelector::CenterEdges {
                region: CenterEdgesRegion::Center,
                ..
            }
        ),
        CueRecipeTargetDSL::Edges => matches!(
            selector,
            TargetSetSelector::CenterEdges {
                region: CenterEdgesRegion::Edges,
                ..
            }
        ),
    }
}

fn target_supports_effect(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
    required_attributes: &[String],
) -> bool {
    resolve_target_set(stage, layout, target)
        .fixture_ids
        .into_iter()
        .all(|fixture_id| {
            stage
                .patch
                .iter()
                .find(|patch| (patch.id_range.0..=patch.id_range.1).contains(&fixture_id))
                .and_then(|patch| profile_by_id(&patch.profile_id))
                .is_some_and(|profile| {
                    required_attributes.iter().all(|required| {
                        profile
                            .attributes
                            .iter()
                            .any(|attribute| attribute.id == *required)
                    })
                })
        })
}

fn resolve_scene(
    stage: &StageDocument,
    query: CueRecipeSceneDSL,
) -> Option<&TargetingSceneDefinition> {
    let mut scenes: Vec<_> = stage
        .targeting_scenes
        .iter()
        .filter(|scene| {
            scene.steps.len() >= query.minimum_steps as usize
                && (!query.requires_weighted_transition
                    || scene.steps.iter().any(|step| {
                        matches!(step.transition, TargetingTransition::Weighted { .. })
                    }))
        })
        .collect();
    scenes.sort_by(|left, right| left.id.cmp(&right.id));
    scenes.into_iter().next()
}

fn layout_supports_effect(layout: &LayoutDefinition, required: &[LayoutCapabilityDSL]) -> bool {
    if required.is_empty() || required.contains(&LayoutCapabilityDSL::Any) {
        return true;
    }
    required
        .iter()
        .any(|capability| layout_has_capability(layout, *capability))
}

fn layout_has_capability(layout: &LayoutDefinition, capability: LayoutCapabilityDSL) -> bool {
    match capability {
        LayoutCapabilityDSL::Any | LayoutCapabilityDSL::Coordinates => true,
        LayoutCapabilityDSL::Linear => matches!(layout.geometry, LayoutGeometry::Strip { .. }),
        LayoutCapabilityDSL::Matrix => matches!(
            layout.geometry,
            LayoutGeometry::Matrix { .. }
                | LayoutGeometry::Wall { .. }
                | LayoutGeometry::Frame { .. }
        ),
        LayoutCapabilityDSL::Radial => matches!(layout.geometry, LayoutGeometry::Circle { .. }),
        LayoutCapabilityDSL::TargetingScene => false,
    }
}

fn strobe_rank(risk: StrobeRiskDSL) -> u8 {
    match risk {
        StrobeRiskDSL::None => 0,
        StrobeRiskDSL::Low => 1,
        StrobeRiskDSL::Medium => 2,
        StrobeRiskDSL::High => 3,
    }
}

fn unresolved_recipe(
    recipe_ref: &CueRecipeRef,
    path: &str,
    message: &str,
    hint: &str,
) -> Diagnostic {
    Diagnostic::error(CUE_RECIPE_UNRESOLVED, path, message, hint).with_asset(
        "cue_recipe",
        recipe_ref.id.clone(),
        recipe_ref.revision,
    )
}

pub const DEFAULT_CUE_TRIGGER: CueTriggerPolicy = CueTriggerPolicy {
    mode: CueTriggerMode::Timeline,
    quantize: CueQuantize::Beat,
    one_shot_ticks: None,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::diagnostic::CUE_RECIPE_UNRESOLVED;
    use crate::document::valid_bundle;

    #[test]
    fn checked_in_catalog_meets_production_contract() {
        let catalog = builtin_production_catalog().expect("checked-in catalog parses");
        assert!(catalog.effects.len() >= 12);
        assert!(catalog.cue_recipes.len() >= 6);
        let diagnostics = validate_production_catalog(&catalog);
        assert!(diagnostics.is_empty(), "{diagnostics:#?}");
        let runtime_diagnostics = validate_production_catalog_runtime(&catalog);
        assert!(runtime_diagnostics.is_empty(), "{runtime_diagnostics:#?}");
    }

    #[test]
    fn production_recipes_reject_implicit_shared_attribute_writers() {
        let mut catalog = builtin_production_catalog().expect("catalog");
        let mut overlapping = catalog.cue_recipes[2].layers[0].clone();
        overlapping.id = "implicit-gradient".to_string();
        catalog.cue_recipes[0].layers.push(overlapping);

        let diagnostics = validate_production_catalog(&catalog);
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == CUE_LAYER_ATTRIBUTE_CONFLICT
                && diagnostic.path == "cue_recipes[0].layers[1].effect_ref"
                && diagnostic.message.contains("intensity")
        }));
    }

    #[test]
    fn recipe_resolution_is_stage_bound_and_deterministic() {
        let catalog = builtin_production_catalog().expect("catalog");
        let bundle = valid_bundle();
        let recipe_ref = CueRecipeRef {
            id: "recipe.four-on-floor".to_string(),
            revision: 1,
        };
        let stage_ref = bundle.manifest.stage_ref.clone();
        let first = resolve_cue_recipe(
            &catalog,
            &bundle,
            &recipe_ref,
            &stage_ref,
            "cue-from-recipe".to_string(),
            1,
            "Resolved Cue".to_string(),
        )
        .expect("starter Stage resolves pulse recipe");
        let replay = resolve_cue_recipe(
            &catalog,
            &bundle,
            &recipe_ref,
            &stage_ref,
            "cue-from-recipe".to_string(),
            1,
            "Resolved Cue".to_string(),
        )
        .expect("same inputs resolve");
        assert_eq!(
            serde_json::to_value(first).expect("first serializes"),
            serde_json::to_value(replay).expect("replay serializes")
        );
    }

    #[test]
    fn recipe_resolution_fails_closed_on_fixture_capability() {
        let catalog = builtin_production_catalog().expect("catalog");
        let bundle = valid_bundle();
        let diagnostics = resolve_cue_recipe(
            &catalog,
            &bundle,
            &CueRecipeRef {
                id: "recipe.moving-sweep".to_string(),
                revision: 2,
            },
            &bundle.manifest.stage_ref,
            "moving".to_string(),
            1,
            "Moving".to_string(),
        )
        .expect_err("generic RGB fixtures do not expose pan/tilt");
        assert!(diagnostics.iter().all(|diagnostic| {
            diagnostic.code == CUE_RECIPE_UNRESOLVED
                && diagnostic
                    .recovery
                    .as_ref()
                    .is_some_and(|recovery| recovery.action == "choose_target")
        }));
    }
}

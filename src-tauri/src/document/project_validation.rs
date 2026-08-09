use super::validation::{validate_effect_definition_document, validate_parameter_value_contract};
use super::{
    layout_capacity, layout_grid_dimensions, validate_layout_geometry, ArrangementAutomationTarget,
    ArrangementDocument, AssetRef, CenterEdgesRegion, CueDefinition, CueLayer, CueMixOverride,
    EffectDefinitionDocument, EffectNodeDSL, LayoutDefinition, LayoutGeometry, ParameterSchemaDSL,
    ParameterScopeDSL, ParameterSectionDSL, ParameterValueDSL, ProjectBundle, StageDocument,
    TargetSetDefinition, TargetSetSelector, TargetingDuration, TargetingDurationUnit,
    TargetingTransition, ARRANGEMENT_DOCUMENT_SCHEMA_VERSION, CUE_DEFINITION_SCHEMA_VERSION,
    EFFECT_DEFINITION_SCHEMA_VERSION, LAYOUT_DEFINITION_SCHEMA_VERSION,
    PROJECT_BUNDLE_SCHEMA_VERSION, PROJECT_MANIFEST_SCHEMA_VERSION, STAGE_DOCUMENT_SCHEMA_VERSION,
};
use crate::compiler::diagnostic::{
    Diagnostic, CUE_LAYER_ATTRIBUTE_CONFLICT, PROJECT_CAPABILITY_MISMATCH, PROJECT_DUPLICATE_ASSET,
    PROJECT_REFERENCE_CYCLE, PROJECT_REFERENCE_NOT_FOUND, PROJECT_REVISION_MISMATCH,
    PROJECT_SCHEMA_INVALID, TARGET_SET_INVALID,
};
use crate::engine::effect::{is_beat_sync_speed_multiplier, COLOR_PARAMETER_ID};
use crate::engine::profile::{profile_by_id, COLOR_RGB_ATTRIBUTE};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
pub(crate) struct ResolvedTargetSet {
    pub fixture_ids: Vec<u32>,
    pub partitions: Vec<Vec<u32>>,
    pub weights: BTreeMap<u32, f32>,
}

#[derive(Debug, Clone)]
pub struct ValidatedProject {
    bundle: ProjectBundle,
}

impl ValidatedProject {
    pub fn validate(bundle: ProjectBundle) -> Result<Self, Vec<Diagnostic>> {
        let mut diagnostics = Vec::new();
        validate_schema_versions(&bundle, &mut diagnostics);
        validate_manifest(&bundle, &mut diagnostics);
        validate_stages(&bundle, &mut diagnostics);
        validate_effects(&bundle, &mut diagnostics);
        validate_cues(&bundle, &mut diagnostics);
        validate_arrangements(&bundle, &mut diagnostics);
        validate_bundle_graph(&bundle, &mut diagnostics);

        if diagnostics.is_empty() {
            Ok(Self { bundle })
        } else {
            Err(diagnostics)
        }
    }

    pub fn into_bundle(self) -> ProjectBundle {
        self.bundle
    }

    pub(crate) fn bundle(&self) -> &ProjectBundle {
        &self.bundle
    }
}

pub fn load_project_bundle(source: &str) -> Result<ValidatedProject, Vec<Diagnostic>> {
    let bundle = serde_json::from_str::<ProjectBundle>(source).map_err(|error| {
        vec![Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            "$",
            error.to_string(),
            "Use a ProjectBundle that matches the current Lumina V1 schema.",
        )]
    })?;
    ValidatedProject::validate(bundle)
}

fn validate_schema_versions(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    for (actual, expected, path) in [
        (
            bundle.schema_version,
            PROJECT_BUNDLE_SCHEMA_VERSION,
            "schema_version".to_string(),
        ),
        (
            bundle.manifest.schema_version,
            PROJECT_MANIFEST_SCHEMA_VERSION,
            "manifest.schema_version".to_string(),
        ),
    ] {
        validate_schema_version(actual, expected, path, diagnostics);
    }
    for (index, stage) in bundle.stages.iter().enumerate() {
        validate_schema_version(
            stage.schema_version,
            STAGE_DOCUMENT_SCHEMA_VERSION,
            format!("stages[{index}].schema_version"),
            diagnostics,
        );
    }
    for (index, layout) in bundle.layouts.iter().enumerate() {
        validate_schema_version(
            layout.schema_version,
            LAYOUT_DEFINITION_SCHEMA_VERSION,
            format!("layouts[{index}].schema_version"),
            diagnostics,
        );
    }
    for (index, effect) in bundle.effects.iter().enumerate() {
        validate_schema_version(
            effect.schema_version,
            EFFECT_DEFINITION_SCHEMA_VERSION,
            format!("effects[{index}].schema_version"),
            diagnostics,
        );
    }
    for (index, cue) in bundle.cues.iter().enumerate() {
        validate_schema_version(
            cue.schema_version,
            CUE_DEFINITION_SCHEMA_VERSION,
            format!("cues[{index}].schema_version"),
            diagnostics,
        );
    }
    for (index, arrangement) in bundle.arrangements.iter().enumerate() {
        validate_schema_version(
            arrangement.schema_version,
            ARRANGEMENT_DOCUMENT_SCHEMA_VERSION,
            format!("arrangements[{index}].schema_version"),
            diagnostics,
        );
    }
}

fn validate_schema_version(
    actual: u32,
    expected: u32,
    path: String,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if actual != expected {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            path,
            format!("Expected schema version {expected}, received {actual}."),
            "Migrate the asset with a supported Lumina version before opening it.",
        ));
    }
}

fn validate_manifest(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    validate_identity(
        &bundle.manifest.project_id,
        bundle.manifest.revision,
        "manifest",
        diagnostics,
    );
    validate_asset_collection(
        &bundle.stages,
        |asset| (&asset.id, asset.revision),
        "stages",
        diagnostics,
    );
    validate_asset_collection(
        &bundle.layouts,
        |asset| (&asset.id, asset.revision),
        "layouts",
        diagnostics,
    );
    validate_asset_collection(
        &bundle.effects,
        |asset| (&asset.id, asset.revision),
        "effects",
        diagnostics,
    );
    validate_asset_collection(
        &bundle.cues,
        |asset| (&asset.id, asset.revision),
        "cues",
        diagnostics,
    );
    validate_asset_collection(
        &bundle.arrangements,
        |asset| (&asset.id, asset.revision),
        "arrangements",
        diagnostics,
    );

    resolve_ref(
        &bundle.manifest.stage_ref,
        &bundle.stages,
        |asset| (&asset.id, asset.revision),
        "manifest.stage_ref",
        diagnostics,
    );
    validate_manifest_refs(
        &bundle.manifest.layout_refs,
        &bundle.layouts,
        |asset| (&asset.id, asset.revision),
        "manifest.layout_refs",
        diagnostics,
    );
    validate_manifest_refs(
        &bundle.manifest.effect_refs,
        &bundle.effects,
        |asset| (&asset.id, asset.revision),
        "manifest.effect_refs",
        diagnostics,
    );
    validate_manifest_refs(
        &bundle.manifest.cue_refs,
        &bundle.cues,
        |asset| (&asset.id, asset.revision),
        "manifest.cue_refs",
        diagnostics,
    );
    validate_manifest_refs(
        &bundle.manifest.arrangement_refs,
        &bundle.arrangements,
        |asset| (&asset.id, asset.revision),
        "manifest.arrangement_refs",
        diagnostics,
    );

    if !bundle
        .manifest
        .arrangement_refs
        .iter()
        .any(|reference| reference.id == bundle.manifest.active_arrangement_id)
    {
        diagnostics.push(Diagnostic::error(
            PROJECT_REFERENCE_NOT_FOUND,
            "manifest.active_arrangement_id",
            format!(
                "Active Arrangement {:?} is not referenced by the manifest.",
                bundle.manifest.active_arrangement_id
            ),
            "Select an Arrangement listed in manifest.arrangement_refs.",
        ));
    }
}

fn validate_stages(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    for (layout_index, layout) in bundle.layouts.iter().enumerate() {
        let path = format!("layouts[{layout_index}]");
        validate_identity(&layout.id, layout.revision, &path, diagnostics);
        if let Err(message) = validate_layout_geometry(layout) {
            diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.geometry"),
                message,
                "Edit the Layout Draft metrics before using it on a Stage.",
            ));
        }
    }
    for (stage_index, stage) in bundle.stages.iter().enumerate() {
        validate_identity(
            &stage.id,
            stage.revision,
            &format!("stages[{stage_index}]"),
            diagnostics,
        );
        let Some(layout) = resolve_ref(
            &stage.layout_ref,
            &bundle.layouts,
            |asset| (&asset.id, asset.revision),
            &format!("stages[{stage_index}].layout_ref"),
            diagnostics,
        ) else {
            continue;
        };
        if !bundle.manifest.layout_refs.contains(&stage.layout_ref) {
            diagnostics.push(reference_not_found(
                format!("stages[{stage_index}].layout_ref"),
                "Stage Layout revision is not part of manifest.layout_refs.".to_string(),
            ));
        }
        let fixture_profiles = stage_fixture_profiles(stage, stage_index, diagnostics);
        if layout_capacity(layout) < fixture_profiles.len() {
            diagnostics.push(Diagnostic::error(
                TARGET_SET_INVALID,
                format!("stages[{stage_index}].layout_ref"),
                format!(
                    "Layout {} r{} can place {} fixtures, but this Stage patches {}.",
                    layout.id,
                    layout.revision,
                    layout_capacity(layout),
                    fixture_profiles.len()
                ),
                "Choose a Layout with enough fixture positions or explicitly remap the Stage topology.",
            ));
        }
        if let LayoutGeometry::Custom { fixtures, .. } = &layout.geometry {
            let expected: BTreeSet<_> = fixture_profiles.keys().copied().collect();
            let actual: BTreeSet<_> = fixtures.iter().map(|fixture| fixture.id).collect();
            if actual != expected || actual.len() != fixtures.len() {
                diagnostics.push(Diagnostic::error(
                    TARGET_SET_INVALID,
                    format!("layouts[{}].geometry.fixtures", layout.id),
                    "Custom Layout fixture IDs must match the Stage Patch exactly and remain unique.",
                    "Remap the custom coordinates to every patched fixture ID before Use on Stage.",
                ));
            }
        }
        let mut target_ids = BTreeSet::new();
        for (target_index, target) in stage.target_sets.iter().enumerate() {
            let path = format!("stages[{stage_index}].target_sets[{target_index}]");
            if target.id.trim().is_empty() || !target_ids.insert(target.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    PROJECT_DUPLICATE_ASSET,
                    format!("{path}.id"),
                    format!("TargetSet ID {:?} is empty or duplicated.", target.id),
                    "Use a stable, unique TargetSet ID within the Stage revision.",
                ));
            }
            validate_target_set(stage, layout, target, &fixture_profiles, &path, diagnostics);
        }
        validate_targeting_scenes(stage, layout, stage_index, diagnostics);
    }
}

fn validate_cues(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    for (cue_index, cue) in bundle.cues.iter().enumerate() {
        let cue_path = format!("cues[{cue_index}]");
        validate_identity(&cue.id, cue.revision, &cue_path, diagnostics);
        let Some(stage) = resolve_ref(
            &cue.compatible_stage_ref,
            &bundle.stages,
            |asset| (&asset.id, asset.revision),
            &format!("{cue_path}.compatible_stage_ref"),
            diagnostics,
        ) else {
            continue;
        };
        let Some(layout) = exact_asset(&bundle.layouts, &stage.layout_ref, |asset| {
            (&asset.id, asset.revision)
        }) else {
            continue;
        };
        if cue.layers.is_empty() {
            diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{cue_path}.layers"),
                "Cue must contain at least one Effect layer.",
                "Add an Effect layer before publishing the Cue.",
            ));
        }
        let mut layer_ids = BTreeSet::new();
        for (layer_index, layer) in cue.layers.iter().enumerate() {
            let path = format!("{cue_path}.layers[{layer_index}]");
            if layer.id.trim().is_empty() || !layer_ids.insert(layer.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    PROJECT_DUPLICATE_ASSET,
                    format!("{path}.id"),
                    format!("Cue layer ID {:?} is empty or duplicated.", layer.id),
                    "Use a stable, unique layer ID within the Cue revision.",
                ));
            }
            validate_cue_layer(bundle, stage, layout, layer, &path, diagnostics);
        }
        validate_cue_layer_composition(bundle, stage, layout, cue, &cue_path, diagnostics);
        validate_cue_summary(bundle, cue, &cue_path, diagnostics);
        let mut lane_ids = BTreeSet::new();
        for (lane_index, lane) in cue.automation_lanes.iter().enumerate() {
            let lane_path = format!("{cue_path}.automation_lanes[{lane_index}]");
            if lane.id.trim().is_empty() || !lane_ids.insert(lane.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    PROJECT_DUPLICATE_ASSET,
                    format!("{lane_path}.id"),
                    format!(
                        "Cue automation lane ID {:?} is empty or duplicated.",
                        lane.id
                    ),
                    "Use a stable, unique automation lane ID within the Cue revision.",
                ));
            }
            let path = format!("{lane_path}.target");
            let Some(layer) = cue
                .layers
                .iter()
                .find(|layer| layer.id == lane.target.layer_id)
            else {
                diagnostics.push(reference_not_found(
                    path,
                    format!("Cue layer {:?} does not exist.", lane.target.layer_id),
                ));
                continue;
            };
            validate_layer_parameter(bundle, layer, &lane.target.parameter_id, &path, diagnostics);
            if lane.target.parameter_id == COLOR_PARAMETER_ID {
                if let Some(target) = stage
                    .target_sets
                    .iter()
                    .find(|target| target.id == layer.target_set_ref.target_set_id)
                {
                    validate_explicit_color_capability(stage, layout, target, &path, diagnostics);
                }
            }
            validate_keyframes(
                &lane.keyframes,
                cue.nominal_length_ticks,
                &lane_path,
                diagnostics,
            );
            if let Some(effect) = exact_asset(&bundle.effects, &layer.effect_ref, |asset| {
                (&asset.id, asset.revision)
            }) {
                for (keyframe_index, keyframe) in lane.keyframes.iter().enumerate() {
                    validate_parameter_value(
                        effect,
                        &lane.target.parameter_id,
                        &keyframe.value,
                        &lane_path,
                        diagnostics,
                    );
                    validate_beat_sync_speed_override(
                        &lane.target.parameter_id,
                        &keyframe.value,
                        &format!("{lane_path}.keyframes[{keyframe_index}].value"),
                        diagnostics,
                    );
                }
            }
        }
    }
}

fn validate_cue_layer_composition(
    bundle: &ProjectBundle,
    stage: &StageDocument,
    layout: &LayoutDefinition,
    cue: &CueDefinition,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for (left_index, left) in cue.layers.iter().enumerate() {
        let Some(left_effect) = exact_asset(&bundle.effects, &left.effect_ref, |asset| {
            (&asset.id, asset.revision)
        }) else {
            continue;
        };
        let left_fixtures = cue_layer_fixture_ids(stage, layout, left);
        let left_attributes =
            effect_writer_attributes(left_effect, cue_layer_has_explicit_color(cue, left));
        for (right_index, right) in cue.layers.iter().enumerate().skip(left_index + 1) {
            let Some(right_effect) = exact_asset(&bundle.effects, &right.effect_ref, |asset| {
                (&asset.id, asset.revision)
            }) else {
                continue;
            };
            let right_fixtures = cue_layer_fixture_ids(stage, layout, right);
            if left_fixtures.is_disjoint(&right_fixtures) {
                continue;
            }
            let right_attributes =
                effect_writer_attributes(right_effect, cue_layer_has_explicit_color(cue, right));
            let conflicts = left_attributes
                .intersection(&right_attributes)
                .filter(|attribute| !has_explicit_mix_policy(right, attribute))
                .cloned()
                .collect::<Vec<_>>();
            if conflicts.is_empty() {
                continue;
            }
            diagnostics.push(
                Diagnostic::error(
                    CUE_LAYER_ATTRIBUTE_CONFLICT,
                    format!("{path}.layers[{right_index}].mix_overrides"),
                    format!(
                        "Cue Layer {} and Layer {} overlap fixtures and both write {}; the later layer has no explicit mix policy.",
                        left_index + 1,
                        right_index + 1,
                        conflicts.join(", ")
                    ),
                    "Keep one visual intent, choose non-overlapping TargetSets, or explicitly select a mix policy for every shared attribute.",
                )
                .with_recovery(
                    "choose_mix_policy",
                    "Choose explicit mix policy",
                    Some(format!("{path}.layers[{right_index}].mix_overrides")),
                ),
            );
        }
    }
}

fn effect_writer_attributes(
    effect: &EffectDefinitionDocument,
    has_explicit_color: bool,
) -> BTreeSet<String> {
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
    if effect.parameters.iter().any(|parameter| {
        parameter.id == COLOR_PARAMETER_ID
            && (parameter.default_value().is_some() || has_explicit_color)
    }) {
        attributes.insert(COLOR_RGB_ATTRIBUTE.to_string());
    }
    attributes
}

fn cue_layer_has_explicit_color(cue: &CueDefinition, layer: &CueLayer) -> bool {
    layer.parameter_overrides.contains_key(COLOR_PARAMETER_ID)
        || cue.automation_lanes.iter().any(|lane| {
            lane.target.layer_id == layer.id && lane.target.parameter_id == COLOR_PARAMETER_ID
        })
}

fn clip_layer_has_explicit_color(
    arrangement: &ArrangementDocument,
    cue: &CueDefinition,
    clip: &super::CueClip,
    layer: &CueLayer,
) -> bool {
    cue_layer_has_explicit_color(cue, layer)
        || clip.layer_overrides.iter().any(|layer_override| {
            layer_override.layer_id == layer.id
                && layer_override
                    .parameter_overrides
                    .contains_key(COLOR_PARAMETER_ID)
        })
        || arrangement.tracks.iter().any(|track| {
            track.automation_lanes.iter().any(|lane| {
                matches!(
                    &lane.target,
                    super::ArrangementAutomationTarget::CueLayer {
                        clip_id,
                        layer_id,
                        parameter_id,
                    } if clip_id == &clip.id
                        && layer_id == &layer.id
                        && parameter_id == COLOR_PARAMETER_ID
                )
            })
        })
}

fn has_explicit_mix_policy(layer: &CueLayer, attribute_id: &str) -> bool {
    layer
        .mix_overrides
        .iter()
        .any(|mix_override| mix_override.attribute_id == attribute_id)
}

fn cue_layer_fixture_ids(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    layer: &CueLayer,
) -> BTreeSet<u32> {
    if let Some(scene_ref) = &layer.targeting_scene_ref {
        if let Some(scene) = stage
            .targeting_scenes
            .iter()
            .find(|scene| scene.id == scene_ref.targeting_scene_id)
        {
            return scene
                .steps
                .iter()
                .filter_map(|step| {
                    let target = stage
                        .target_sets
                        .iter()
                        .find(|target| target.id == step.selection.target_set_id)?;
                    let resolved = resolve_target_set(stage, layout, target);
                    Some(
                        step.selection
                            .partition_index
                            .and_then(|index| resolved.partitions.get(index as usize).cloned())
                            .unwrap_or(resolved.fixture_ids),
                    )
                })
                .flatten()
                .collect();
        }
    }
    stage
        .target_sets
        .iter()
        .find(|target| target.id == layer.target_set_ref.target_set_id)
        .map(|target| {
            target_fixture_ids(stage, layout, target)
                .into_iter()
                .collect()
        })
        .unwrap_or_default()
}

fn validate_cue_summary(
    bundle: &ProjectBundle,
    cue: &CueDefinition,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut required_attributes = BTreeSet::new();
    for layer in &cue.layers {
        let Some(effect) = exact_asset(&bundle.effects, &layer.effect_ref, |asset| {
            (&asset.id, asset.revision)
        }) else {
            continue;
        };
        required_attributes.extend(effect.catalog.required_attributes.iter().cloned());
    }
    let expected_attributes: Vec<_> = required_attributes.into_iter().collect();
    let mut actual_attributes = cue.capability_summary.required_attributes.clone();
    actual_attributes.sort();
    actual_attributes.dedup();
    if actual_attributes != expected_attributes {
        diagnostics.push(
            Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.capability_summary"),
                "Cue capability summary does not match its pinned Effect layers.",
                "Recompute the summary from exact Effect revision metadata.",
            )
            .with_recovery(
                "recompute_cue_summary",
                "Recompute Cue summary",
                Some(format!("{path}.capability_summary")),
            ),
        );
    }
}

fn validate_effects(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    for (effect_index, effect) in bundle.effects.iter().enumerate() {
        let path = format!("effects[{effect_index}]");
        validate_effect_definition_document(effect, &path, diagnostics);
        match effect
            .parameters
            .iter()
            .find(|parameter| parameter.id == COLOR_PARAMETER_ID)
        {
            Some(parameter)
                if matches!(parameter.schema, ParameterSchemaDSL::Color { .. })
                    && matches!(parameter.scope, ParameterScopeDSL::Arrangement)
                    && matches!(parameter.section, ParameterSectionDSL::Main) => {}
            Some(_) => diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.parameters"),
                "The standard Color parameter must use color schema, arrangement scope, and the main section.",
                "Declare id color with schema type color, scope arrangement, and section main.",
            )),
            None => diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.parameters"),
                "Effect is missing the standard Color parameter.",
                "Declare an optional color schema so Lab, Cue, and Arrangement share one Color contract.",
            )),
        }
        for (parameter_index, parameter) in effect.parameters.iter().enumerate() {
            if let Some(default) = parameter.default_value() {
                validate_beat_sync_speed_override(
                    &parameter.id,
                    &default,
                    &format!("{path}.parameters[{parameter_index}].schema.default"),
                    diagnostics,
                );
            }
        }
    }
}

fn validate_cue_layer(
    bundle: &ProjectBundle,
    stage: &StageDocument,
    layout: &LayoutDefinition,
    layer: &CueLayer,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(effect) = resolve_ref(
        &layer.effect_ref,
        &bundle.effects,
        |asset| (&asset.id, asset.revision),
        &format!("{path}.effect_ref"),
        diagnostics,
    ) else {
        return;
    };
    if !bundle.manifest.effect_refs.contains(&layer.effect_ref) {
        diagnostics.push(reference_not_found(
            format!("{path}.effect_ref"),
            "Cue Effect revision is not part of manifest.effect_refs.".to_string(),
        ));
    }
    if layer.target_set_ref.stage_id != stage.id
        || layer.target_set_ref.stage_revision != stage.revision
    {
        diagnostics.push(Diagnostic::error(
            PROJECT_REVISION_MISMATCH,
            format!("{path}.target_set_ref"),
            "Cue layer TargetSet belongs to a different Stage revision.",
            "Select a TargetSet from the Cue compatible Stage revision.",
        ));
        return;
    }
    let Some(target_set) = stage
        .target_sets
        .iter()
        .find(|target| target.id == layer.target_set_ref.target_set_id)
    else {
        diagnostics.push(reference_not_found(
            format!("{path}.target_set_ref.target_set_id"),
            format!(
                "TargetSet {:?} does not exist in Stage {} r{}.",
                layer.target_set_ref.target_set_id, stage.id, stage.revision
            ),
        ));
        return;
    };
    if let Some(scene_ref) = &layer.targeting_scene_ref {
        if scene_ref.stage_id != stage.id || scene_ref.stage_revision != stage.revision {
            diagnostics.push(Diagnostic::error(
                PROJECT_REVISION_MISMATCH,
                format!("{path}.targeting_scene_ref"),
                "Cue layer TargetingScene belongs to a different Stage revision.",
                "Select a TargetingScene from the Cue compatible Stage revision.",
            ));
        } else if !stage
            .targeting_scenes
            .iter()
            .any(|scene| scene.id == scene_ref.targeting_scene_id)
        {
            diagnostics.push(reference_not_found(
                format!("{path}.targeting_scene_ref.targeting_scene_id"),
                format!(
                    "TargetingScene {:?} does not exist in Stage {} r{}.",
                    scene_ref.targeting_scene_id, stage.id, stage.revision
                ),
            ));
        }
    }
    if !layer.phase.is_finite() {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.phase"),
            "Cue layer phase must be finite.",
            "Use a finite phase offset in cycles.",
        ));
    }
    if layer.seed.len() != 16 || !layer.seed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.seed"),
            "Cue layer seed must contain exactly 16 hexadecimal characters.",
            "Generate a stable 64-bit hexadecimal seed for the layer.",
        ));
    }
    for (parameter_id, value) in &layer.parameter_overrides {
        validate_parameter_value(effect, parameter_id, value, path, diagnostics);
        validate_beat_sync_speed_override(
            parameter_id,
            value,
            &format!("{path}.parameter_overrides.{parameter_id}"),
            diagnostics,
        );
    }
    if layer.parameter_overrides.contains_key(COLOR_PARAMETER_ID) {
        validate_explicit_color_capability(
            stage,
            layout,
            target_set,
            &format!("{path}.parameter_overrides.{COLOR_PARAMETER_ID}"),
            diagnostics,
        );
    }
    validate_mix_overrides(
        stage,
        layout,
        target_set,
        &layer.mix_overrides,
        &format!("{path}.mix_overrides"),
        diagnostics,
    );
    validate_effect_capability(stage, layout, target_set, effect, path, diagnostics);
}

fn validate_arrangements(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    for (arrangement_index, arrangement) in bundle.arrangements.iter().enumerate() {
        let path = format!("arrangements[{arrangement_index}]");
        validate_identity(&arrangement.id, arrangement.revision, &path, diagnostics);
        validate_tempo_map(arrangement, &path, diagnostics);
        let mut clip_ids: BTreeMap<&str, (&CueDefinition, &super::CueClip)> = BTreeMap::new();
        let mut automation_targets = BTreeSet::new();
        for (track_index, track) in arrangement.tracks.iter().enumerate() {
            for (clip_index, clip) in track.clips.iter().enumerate() {
                let clip_path = format!("{path}.tracks[{track_index}].clips[{clip_index}]");
                let Some(cue) = resolve_ref(
                    &clip.cue_ref,
                    &bundle.cues,
                    |asset| (&asset.id, asset.revision),
                    &format!("{clip_path}.cue_ref"),
                    diagnostics,
                ) else {
                    continue;
                };
                if !bundle.manifest.cue_refs.contains(&clip.cue_ref) {
                    diagnostics.push(reference_not_found(
                        format!("{clip_path}.cue_ref"),
                        "Cue revision is not part of manifest.cue_refs.".to_string(),
                    ));
                }
                if clip_ids.insert(&clip.id, (cue, clip)).is_some() {
                    diagnostics.push(Diagnostic::error(
                        PROJECT_DUPLICATE_ASSET,
                        format!("{clip_path}.id"),
                        format!("CueClip ID {:?} is duplicated.", clip.id),
                        "Use a unique CueClip ID within the Arrangement revision.",
                    ));
                }
                if clip.start_tick.saturating_add(clip.duration_tick) > arrangement.length_ticks {
                    diagnostics.push(Diagnostic::error(
                        PROJECT_SCHEMA_INVALID,
                        format!("{clip_path}.duration_tick"),
                        "CueClip extends beyond Arrangement length_ticks.",
                        "Extend the Arrangement or trim the CueClip without changing its start tick.",
                    ));
                }
                let mut overridden_layers = BTreeSet::new();
                for (override_index, layer_override) in clip.layer_overrides.iter().enumerate() {
                    let override_path = format!("{clip_path}.layer_overrides[{override_index}]");
                    if !overridden_layers.insert(layer_override.layer_id.as_str()) {
                        diagnostics.push(Diagnostic::error(
                            PROJECT_DUPLICATE_ASSET,
                            format!("{override_path}.layer_id"),
                            format!(
                                "Cue layer {:?} has more than one instance override.",
                                layer_override.layer_id
                            ),
                            "Merge instance overrides for a Cue layer into one entry.",
                        ));
                    }
                    let Some(layer) = cue
                        .layers
                        .iter()
                        .find(|layer| layer.id == layer_override.layer_id)
                    else {
                        diagnostics.push(reference_not_found(
                            format!("{override_path}.layer_id"),
                            format!("Cue layer {:?} does not exist.", layer_override.layer_id),
                        ));
                        continue;
                    };
                    for (parameter_id, value) in &layer_override.parameter_overrides {
                        let Some(effect) =
                            exact_asset(&bundle.effects, &layer.effect_ref, |asset| {
                                (&asset.id, asset.revision)
                            })
                        else {
                            continue;
                        };
                        validate_parameter_value(
                            effect,
                            parameter_id,
                            value,
                            &override_path,
                            diagnostics,
                        );
                        validate_beat_sync_speed_override(
                            parameter_id,
                            value,
                            &format!("{override_path}.parameter_overrides.{parameter_id}"),
                            diagnostics,
                        );
                    }
                    if layer_override.phase.is_some_and(|phase| !phase.is_finite()) {
                        diagnostics.push(Diagnostic::error(
                            PROJECT_SCHEMA_INVALID,
                            format!("{override_path}.phase"),
                            "CueClip layer phase override must be finite.",
                            "Use a finite phase offset in cycles.",
                        ));
                    }
                    if let Some(stage) =
                        exact_asset(&bundle.stages, &cue.compatible_stage_ref, |asset| {
                            (&asset.id, asset.revision)
                        })
                    {
                        if let (Some(layout), Some(target)) = (
                            exact_asset(&bundle.layouts, &stage.layout_ref, |asset| {
                                (&asset.id, asset.revision)
                            }),
                            stage
                                .target_sets
                                .iter()
                                .find(|target| target.id == layer.target_set_ref.target_set_id),
                        ) {
                            if layer_override
                                .parameter_overrides
                                .contains_key(COLOR_PARAMETER_ID)
                            {
                                validate_explicit_color_capability(
                                    stage,
                                    layout,
                                    target,
                                    &format!(
                                        "{override_path}.parameter_overrides.{COLOR_PARAMETER_ID}"
                                    ),
                                    diagnostics,
                                );
                            }
                            validate_mix_overrides(
                                stage,
                                layout,
                                target,
                                &layer_override.mix_overrides,
                                &format!("{override_path}.mix_overrides"),
                                diagnostics,
                            );
                        }
                    }
                }
            }
        }
        for (track_index, track) in arrangement.tracks.iter().enumerate() {
            for (lane_index, lane) in track.automation_lanes.iter().enumerate() {
                let lane_path =
                    format!("{path}.tracks[{track_index}].automation_lanes[{lane_index}]");
                let target_key = format!("{:?}", lane.target);
                if !automation_targets.insert(target_key) {
                    diagnostics.push(Diagnostic::error(
                        PROJECT_DUPLICATE_ASSET,
                        format!("{lane_path}.target"),
                        "An Arrangement automation target is owned by more than one lane.",
                        "Merge keyframes for the target into one AutomationLane.",
                    ));
                }
                if let ArrangementAutomationTarget::CueLayer {
                    clip_id,
                    layer_id,
                    parameter_id,
                } = &lane.target
                {
                    let Some((cue, _)) = clip_ids.get(clip_id.as_str()) else {
                        diagnostics.push(reference_not_found(
                            format!("{lane_path}.target.clip_id"),
                            format!("CueClip {clip_id:?} does not exist."),
                        ));
                        continue;
                    };
                    let Some(layer) = cue.layers.iter().find(|layer| layer.id == *layer_id) else {
                        diagnostics.push(reference_not_found(
                            format!("{lane_path}.target.layer_id"),
                            format!("Cue layer {layer_id:?} does not exist."),
                        ));
                        continue;
                    };
                    validate_layer_parameter(
                        bundle,
                        layer,
                        parameter_id,
                        &format!("{lane_path}.target.parameter_id"),
                        diagnostics,
                    );
                    if parameter_id == COLOR_PARAMETER_ID {
                        if let Some(stage) =
                            exact_asset(&bundle.stages, &cue.compatible_stage_ref, |asset| {
                                (&asset.id, asset.revision)
                            })
                        {
                            if let (Some(layout), Some(target)) = (
                                exact_asset(&bundle.layouts, &stage.layout_ref, |asset| {
                                    (&asset.id, asset.revision)
                                }),
                                stage
                                    .target_sets
                                    .iter()
                                    .find(|target| target.id == layer.target_set_ref.target_set_id),
                            ) {
                                validate_explicit_color_capability(
                                    stage,
                                    layout,
                                    target,
                                    &format!("{lane_path}.target.parameter_id"),
                                    diagnostics,
                                );
                            }
                        }
                    }
                    if let Some(effect) = exact_asset(&bundle.effects, &layer.effect_ref, |asset| {
                        (&asset.id, asset.revision)
                    }) {
                        for (keyframe_index, keyframe) in lane.keyframes.iter().enumerate() {
                            validate_parameter_value(
                                effect,
                                parameter_id,
                                &keyframe.value,
                                &lane_path,
                                diagnostics,
                            );
                            validate_beat_sync_speed_override(
                                parameter_id,
                                &keyframe.value,
                                &format!("{lane_path}.keyframes[{keyframe_index}].value"),
                                diagnostics,
                            );
                        }
                    }
                }
                validate_keyframes(
                    lane.keyframes.as_slice(),
                    arrangement.length_ticks,
                    &lane_path,
                    diagnostics,
                );
            }
        }
        validate_arrangement_clip_composition(bundle, arrangement, &path, diagnostics);
    }
}

struct ArrangementClipContext<'a> {
    track_index: usize,
    clip_index: usize,
    track: &'a super::CueTrack,
    clip: &'a super::CueClip,
    cue: &'a CueDefinition,
}

fn validate_arrangement_clip_composition(
    bundle: &ProjectBundle,
    arrangement: &ArrangementDocument,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut clips = arrangement
        .tracks
        .iter()
        .enumerate()
        .flat_map(|(track_index, track)| {
            track
                .clips
                .iter()
                .enumerate()
                .filter_map(move |(clip_index, clip)| {
                    exact_asset(&bundle.cues, &clip.cue_ref, |asset| {
                        (&asset.id, asset.revision)
                    })
                    .map(|cue| ArrangementClipContext {
                        track_index,
                        clip_index,
                        track,
                        clip,
                        cue,
                    })
                })
        })
        .collect::<Vec<_>>();
    clips.sort_by_key(|context| {
        (
            context.clip.start_tick,
            context.clip.layer,
            context.track_index,
            context.clip_index,
        )
    });
    let mut reported = BTreeSet::new();

    for left_index in 0..clips.len() {
        for right_index in (left_index + 1)..clips.len() {
            let left = &clips[left_index];
            let right = &clips[right_index];
            if !clip_ranges_overlap(left.clip, right.clip) {
                continue;
            }
            let right_path = format!(
                "{path}.tracks[{}].clips[{}]",
                right.track_index, right.clip_index
            );
            if left.track_index == right.track_index
                && right.track.overlap_policy == super::OverlapPolicyDSL::Reject
            {
                diagnostics.push(Diagnostic::error(
                    PROJECT_SCHEMA_INVALID,
                    format!("{right_path}.start_tick"),
                    "CueClips overlap on a track whose overlap policy is reject.",
                    "Move or trim one CueClip, or explicitly choose a compositing overlap policy.",
                ));
                continue;
            }
            if left.cue.compatible_stage_ref != right.cue.compatible_stage_ref {
                continue;
            }
            let Some(stage) =
                exact_asset(&bundle.stages, &right.cue.compatible_stage_ref, |asset| {
                    (&asset.id, asset.revision)
                })
            else {
                continue;
            };
            let Some(layout) = exact_asset(&bundle.layouts, &stage.layout_ref, |asset| {
                (&asset.id, asset.revision)
            }) else {
                continue;
            };

            for left_layer in &left.cue.layers {
                let left_fixtures = cue_layer_fixture_ids(stage, layout, left_layer);
                let Some(left_effect) =
                    exact_asset(&bundle.effects, &left_layer.effect_ref, |asset| {
                        (&asset.id, asset.revision)
                    })
                else {
                    continue;
                };
                let left_attributes = effect_writer_attributes(
                    left_effect,
                    clip_layer_has_explicit_color(arrangement, left.cue, left.clip, left_layer),
                );
                for right_layer in &right.cue.layers {
                    let right_fixtures = cue_layer_fixture_ids(stage, layout, right_layer);
                    if left_fixtures.is_disjoint(&right_fixtures) {
                        continue;
                    }
                    let Some(right_effect) =
                        exact_asset(&bundle.effects, &right_layer.effect_ref, |asset| {
                            (&asset.id, asset.revision)
                        })
                    else {
                        continue;
                    };
                    let right_attributes = effect_writer_attributes(
                        right_effect,
                        clip_layer_has_explicit_color(
                            arrangement,
                            right.cue,
                            right.clip,
                            right_layer,
                        ),
                    );
                    let conflicts = left_attributes
                        .intersection(&right_attributes)
                        .filter(|attribute| {
                            !clip_has_explicit_mix_policy(right.clip, right_layer, attribute)
                        })
                        .cloned()
                        .collect::<Vec<_>>();
                    if conflicts.is_empty()
                        || !reported.insert((
                            right.clip.id.clone(),
                            right_layer.id.clone(),
                            conflicts.join(","),
                        ))
                    {
                        continue;
                    }
                    diagnostics.push(
                        Diagnostic::error(
                            CUE_LAYER_ATTRIBUTE_CONFLICT,
                            format!("{right_path}.layer_overrides"),
                            format!(
                                "Overlapping Cue clips write {} on the same fixtures without an explicit mix policy.",
                                conflicts.join(", ")
                            ),
                            "Use disjoint TargetSets or choose a mix policy on the later Cue layer or CueClip override.",
                        )
                        .with_recovery(
                            "choose_mix_policy",
                            "Choose explicit mix policy",
                            Some(format!("{right_path}.layer_overrides")),
                        ),
                    );
                }
            }
        }
    }
}

fn clip_ranges_overlap(left: &super::CueClip, right: &super::CueClip) -> bool {
    let left_end = u64::from(left.start_tick) + u64::from(left.duration_tick);
    let right_end = u64::from(right.start_tick) + u64::from(right.duration_tick);
    u64::from(left.start_tick) < right_end && u64::from(right.start_tick) < left_end
}

fn clip_has_explicit_mix_policy(
    clip: &super::CueClip,
    layer: &CueLayer,
    attribute_id: &str,
) -> bool {
    has_explicit_mix_policy(layer, attribute_id)
        || clip.layer_overrides.iter().any(|layer_override| {
            layer_override.layer_id == layer.id
                && layer_override
                    .mix_overrides
                    .iter()
                    .any(|mix_override| mix_override.attribute_id == attribute_id)
        })
}

fn validate_tempo_map(
    arrangement: &ArrangementDocument,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let points = &arrangement.tempo_map.points;
    if points.first().is_none_or(|point| point.time_tick != 0)
        || points
            .windows(2)
            .any(|pair| pair[0].time_tick >= pair[1].time_tick)
    {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.tempo_map.points"),
            "TempoMap must start at tick zero and use strictly increasing ticks.",
            "Sort tempo points by their unchanged integer tick positions.",
        ));
    }
    for (index, point) in points.iter().enumerate() {
        if !point.bpm.is_finite() || !(1.0..=1000.0).contains(&point.bpm) {
            diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.tempo_map.points[{index}].bpm"),
                "TempoMap BPM must be finite and between 1 and 1000.",
                "Enter a valid Arrangement tempo without moving its tick position.",
            ));
        }
    }
    if arrangement
        .time_signatures
        .first()
        .is_none_or(|signature| signature.time_tick != 0)
        || arrangement
            .time_signatures
            .windows(2)
            .any(|pair| pair[0].time_tick >= pair[1].time_tick)
    {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.time_signatures"),
            "Time signatures must start at tick zero and use strictly increasing ticks.",
            "Add a tick-zero time signature and keep later changes ordered by tick.",
        ));
    }
    for (index, signature) in arrangement.time_signatures.iter().enumerate() {
        if !signature.denominator.is_power_of_two() {
            diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.time_signatures[{index}].denominator"),
                "Time-signature denominator must be a power of two.",
                "Use 1, 2, 4, 8, 16, or 32.",
            ));
        }
    }
}

fn validate_keyframes(
    keyframes: &[super::KeyframeDSL],
    length_ticks: u32,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if keyframes.is_empty() {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.keyframes"),
            "AutomationLane requires at least one keyframe.",
            "Add a typed keyframe or remove the empty lane.",
        ));
        return;
    }
    if keyframes
        .windows(2)
        .any(|pair| pair[0].time_tick >= pair[1].time_tick)
    {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.keyframes"),
            "Automation keyframes must use strictly increasing tick positions.",
            "Sort keyframes by tick and resolve duplicate positions explicitly.",
        ));
    }
    if keyframes
        .iter()
        .any(|keyframe| keyframe.time_tick > length_ticks)
    {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.keyframes"),
            "Automation keyframe lies beyond Arrangement length_ticks.",
            "Extend the Arrangement or move the keyframe with an explicit edit command.",
        ));
    }
}

fn validate_mix_overrides(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
    mix_overrides: &[CueMixOverride],
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let profiles = stage_fixture_profile_map(stage);
    let fixture_ids = target_fixture_ids(stage, layout, target);
    let mut attribute_ids = BTreeSet::new();
    for (index, mix_override) in mix_overrides.iter().enumerate() {
        if mix_override.attribute_id.trim().is_empty()
            || !attribute_ids.insert(mix_override.attribute_id.as_str())
        {
            diagnostics.push(Diagnostic::error(
                PROJECT_DUPLICATE_ASSET,
                format!("{path}[{index}].attribute_id"),
                format!(
                    "Mix override attribute {:?} is empty or duplicated.",
                    mix_override.attribute_id
                ),
                "Use at most one mix policy override per attribute.",
            ));
            continue;
        }
        for fixture_id in &fixture_ids {
            let supported = profiles
                .get(fixture_id)
                .and_then(|profile_id| profile_by_id(profile_id))
                .is_some_and(|profile| {
                    profile
                        .attributes
                        .iter()
                        .any(|attribute| attribute.id == mix_override.attribute_id)
                });
            if !supported {
                diagnostics.push(Diagnostic::error(
                    PROJECT_CAPABILITY_MISMATCH,
                    format!("{path}[{index}].attribute_id"),
                    format!(
                        "Fixture {fixture_id} does not support mix override attribute {:?}.",
                        mix_override.attribute_id
                    ),
                    "Remove the override or select a capability-compatible TargetSet.",
                ));
                break;
            }
        }
    }
}

fn validate_target_set(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
    fixture_profiles: &BTreeMap<u32, &str>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let matrix = layout_grid_dimensions(layout);
    match &target.selector {
        TargetSetSelector::All => {}
        TargetSetSelector::FixtureIds { fixture_ids } => {
            validate_indices(
                fixture_ids,
                None,
                &format!("{path}.selector.fixture_ids"),
                diagnostics,
            );
            for fixture_id in fixture_ids {
                if !fixture_profiles.contains_key(fixture_id) {
                    diagnostics.push(reference_not_found(
                        format!("{path}.selector.fixture_ids"),
                        format!("Fixture {fixture_id} is not patched by this Stage revision."),
                    ));
                }
            }
        }
        TargetSetSelector::Rows { indices } => {
            let Some((rows, _)) = matrix else {
                diagnostics.push(matrix_target_diagnostic(path));
                return;
            };
            validate_indices(
                indices,
                Some(rows),
                &format!("{path}.selector.indices"),
                diagnostics,
            );
        }
        TargetSetSelector::Columns { indices } => {
            let Some((_, columns)) = matrix else {
                diagnostics.push(matrix_target_diagnostic(path));
                return;
            };
            validate_indices(
                indices,
                Some(columns),
                &format!("{path}.selector.indices"),
                diagnostics,
            );
        }
        TargetSetSelector::GridZones {
            rows,
            columns,
            zones,
        } => {
            if matrix.is_none() {
                diagnostics.push(matrix_target_diagnostic(path));
                return;
            }
            if *rows == 0 || *columns == 0 || zones.is_empty() {
                diagnostics.push(Diagnostic::error(
                    TARGET_SET_INVALID,
                    format!("{path}.selector"),
                    "GridZones requires non-zero rows/columns and at least one selected zone.",
                    "Select one or more deterministic grid zones.",
                ));
            }
            let mut unique = BTreeSet::new();
            for zone in zones {
                if zone.row >= *rows
                    || zone.column >= *columns
                    || !unique.insert((zone.row, zone.column))
                {
                    diagnostics.push(Diagnostic::error(
                        TARGET_SET_INVALID,
                        format!("{path}.selector.zones"),
                        "Grid zone is out of range or duplicated.",
                        "Use unique zero-based zone coordinates inside the declared grid.",
                    ));
                }
            }
        }
        TargetSetSelector::Checkerboard { .. } => {
            if matrix.is_none() {
                diagnostics.push(matrix_target_diagnostic(path));
            }
        }
        TargetSetSelector::CenterEdges { thickness, .. } => {
            let Some((rows, columns)) = matrix else {
                diagnostics.push(matrix_target_diagnostic(path));
                return;
            };
            if *thickness == 0 || thickness.saturating_mul(2) > rows.min(columns) {
                diagnostics.push(Diagnostic::error(
                    TARGET_SET_INVALID,
                    format!("{path}.selector.thickness"),
                    "Center/Edges thickness must fit inside the Stage grid.",
                    "Use a positive thickness no greater than half the shortest grid axis.",
                ));
            }
        }
    }
    let mut weighted = BTreeSet::new();
    let selected_fixture_ids: BTreeSet<_> = target_fixture_ids(stage, layout, target)
        .into_iter()
        .collect();
    for weight in &target.weights {
        if !fixture_profiles.contains_key(&weight.fixture_id)
            || !selected_fixture_ids.contains(&weight.fixture_id)
            || !weight.weight.is_finite()
            || !(0.0..=1.0).contains(&weight.weight)
            || !weighted.insert(weight.fixture_id)
        {
            diagnostics.push(Diagnostic::error(
                TARGET_SET_INVALID,
                format!("{path}.weights"),
                "TargetSet weight has an unknown/duplicate fixture or a value outside 0–1.",
                "Use at most one finite weight per patched fixture.",
            ));
        }
    }
}

fn validate_targeting_scenes(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    stage_index: usize,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut scene_ids = BTreeSet::new();
    for (scene_index, scene) in stage.targeting_scenes.iter().enumerate() {
        let path = format!("stages[{stage_index}].targeting_scenes[{scene_index}]");
        if scene.id.trim().is_empty() || !scene_ids.insert(scene.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                PROJECT_DUPLICATE_ASSET,
                format!("{path}.id"),
                format!("TargetingScene ID {:?} is empty or duplicated.", scene.id),
                "Use a stable, unique TargetingScene ID within the Stage revision.",
            ));
        }
        if scene.steps.is_empty() {
            diagnostics.push(Diagnostic::error(
                TARGET_SET_INVALID,
                format!("{path}.steps"),
                "TargetingScene must contain at least one immutable selection step.",
                "Add an All, TargetSet, or partition step before saving the scene.",
            ));
            continue;
        }
        let mut step_ids = BTreeSet::new();
        for (step_index, step) in scene.steps.iter().enumerate() {
            let step_path = format!("{path}.steps[{step_index}]");
            if step.id.trim().is_empty() || !step_ids.insert(step.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    PROJECT_DUPLICATE_ASSET,
                    format!("{step_path}.id"),
                    format!(
                        "TargetingScene step ID {:?} is empty or duplicated.",
                        step.id
                    ),
                    "Use a stable, unique step ID within the scene.",
                ));
            }
            let Some(target) = stage
                .target_sets
                .iter()
                .find(|target| target.id == step.selection.target_set_id)
            else {
                diagnostics.push(reference_not_found(
                    format!("{step_path}.selection.target_set_id"),
                    format!(
                        "TargetSet {:?} does not exist in Stage {} r{}.",
                        step.selection.target_set_id, stage.id, stage.revision
                    ),
                ));
                continue;
            };
            let resolved = resolve_target_set(stage, layout, target);
            if let Some(partition_index) = step.selection.partition_index {
                if partition_index as usize >= resolved.partitions.len() {
                    diagnostics.push(Diagnostic::error(
                        TARGET_SET_INVALID,
                        format!("{step_path}.selection.partition_index"),
                        format!(
                            "Partition {partition_index} is outside TargetSet {:?} ({} partitions).",
                            target.id,
                            resolved.partitions.len()
                        ),
                        "Choose a compiled partition index from the referenced TargetSet.",
                    ));
                }
            }
            validate_targeting_duration(
                &step.duration,
                &format!("{step_path}.duration"),
                diagnostics,
            );
            if let TargetingTransition::Weighted { duration } = step.transition {
                validate_targeting_duration(
                    &duration,
                    &format!("{step_path}.transition.duration"),
                    diagnostics,
                );
                if duration.unit == step.duration.unit && duration.value > step.duration.value {
                    diagnostics.push(Diagnostic::error(
                        TARGET_SET_INVALID,
                        format!("{step_path}.transition.duration"),
                        "Weighted transition cannot be longer than its TargetingScene step.",
                        "Shorten the transition or extend the step duration.",
                    ));
                }
            }
        }
    }
}

fn validate_targeting_duration(
    duration: &TargetingDuration,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if duration.value == 0 {
        diagnostics.push(Diagnostic::error(
            TARGET_SET_INVALID,
            path,
            "Targeting duration must contain at least one beat or bar.",
            "Use a positive beat/bar duration so step boundaries remain deterministic.",
        ));
    }
    match duration.unit {
        TargetingDurationUnit::Beat | TargetingDurationUnit::Bar => {}
    }
}

fn validate_effect_capability(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
    effect: &EffectDefinitionDocument,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let fixture_profiles = stage_fixture_profile_map(stage);
    let target_fixture_ids = target_fixture_ids(stage, layout, target);
    for attribute_id in &effect.catalog.required_attributes {
        for fixture_id in &target_fixture_ids {
            let supported = fixture_profiles
                .get(fixture_id)
                .and_then(|profile_id| profile_by_id(profile_id))
                .is_some_and(|profile| {
                    profile
                        .attributes
                        .iter()
                        .any(|attribute| attribute.id == *attribute_id)
                });
            if !supported {
                diagnostics.push(Diagnostic::error(
                    PROJECT_CAPABILITY_MISMATCH,
                    format!("{path}.target_set_ref"),
                    format!(
                        "Fixture {fixture_id} does not support required attribute {attribute_id:?}."
                    ),
                    "Choose a compatible TargetSet or remove the incompatible Effect layer.",
                ));
                break;
            }
        }
    }
}

fn validate_explicit_color_capability(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let fixture_profiles = stage_fixture_profile_map(stage);
    for fixture_id in target_fixture_ids(stage, layout, target) {
        let supported = fixture_profiles
            .get(&fixture_id)
            .and_then(|profile_id| profile_by_id(profile_id))
            .is_some_and(|profile| {
                profile
                    .attributes
                    .iter()
                    .any(|attribute| attribute.id == COLOR_RGB_ATTRIBUTE)
            });
        if !supported {
            diagnostics.push(Diagnostic::error(
                PROJECT_CAPABILITY_MISMATCH,
                path,
                format!(
                    "Fixture {fixture_id} does not support color.rgb required by the explicit Color override."
                ),
                "Clear the Color override or choose a TargetSet whose fixtures support color.rgb.",
            ));
            break;
        }
    }
}

fn validate_layer_parameter(
    bundle: &ProjectBundle,
    layer: &CueLayer,
    parameter_id: &str,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(effect) = exact_asset(&bundle.effects, &layer.effect_ref, |asset| {
        (&asset.id, asset.revision)
    }) else {
        return;
    };
    if !effect
        .parameters
        .iter()
        .any(|parameter| parameter.id == parameter_id)
    {
        diagnostics.push(reference_not_found(
            path.to_string(),
            format!(
                "Parameter {parameter_id:?} does not exist in Effect {} r{}.",
                effect.id, effect.revision
            ),
        ));
    }
}

fn validate_parameter_value(
    effect: &EffectDefinitionDocument,
    parameter_id: &str,
    value: &ParameterValueDSL,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(parameter) = effect
        .parameters
        .iter()
        .find(|parameter| parameter.id == parameter_id)
    else {
        diagnostics.push(reference_not_found(
            format!("{path}.parameter_overrides.{parameter_id}"),
            format!(
                "Parameter {parameter_id:?} does not exist in Effect {} r{}.",
                effect.id, effect.revision
            ),
        ));
        return;
    };
    if parameter.value_type() != value.value_type() {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("{path}.parameter_overrides.{parameter_id}"),
            "Parameter override type does not match the pinned Effect parameter schema.",
            "Use the value type declared by the referenced Effect revision.",
        ));
    }
    if !matches!(
        parameter.scope,
        ParameterScopeDSL::Cue | ParameterScopeDSL::Arrangement
    ) {
        diagnostics.push(
            Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("{path}.parameter_overrides.{parameter_id}"),
                "Pinned Effect parameter does not allow Cue overrides.",
                "Customize the Effect or remove the incompatible override.",
            )
            .with_recovery(
                "remove_incompatible_override",
                "Remove incompatible override",
                Some(format!("{path}.parameter_overrides.{parameter_id}")),
            ),
        );
    }
    validate_parameter_value_contract(
        value,
        parameter.value_type(),
        parameter.range(),
        parameter.enum_values(),
        &format!("{path}.parameter_overrides.{parameter_id}"),
        diagnostics,
    );
}

fn validate_beat_sync_speed_override(
    parameter_id: &str,
    value: &ParameterValueDSL,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let ParameterValueDSL::Scalar(value) = value else {
        return;
    };
    if parameter_id == "speed" && !is_beat_sync_speed_multiplier(*value) {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            path.to_string(),
            "Speed override must be a beat-synchronized multiplier.",
            "Choose 0.25, 0.5, 1, 2, 4, or 8 so the Effect remains synchronized to Arrangement BPM.",
        ));
    }
}

fn validate_bundle_graph(bundle: &ProjectBundle, diagnostics: &mut Vec<Diagnostic>) {
    let project = format!(
        "project:{}@{}",
        bundle.manifest.project_id, bundle.manifest.revision
    );
    let mut edges: BTreeMap<String, Vec<String>> = BTreeMap::new();
    edges.insert(
        project,
        std::iter::once(asset_key("stage", &bundle.manifest.stage_ref))
            .chain(
                bundle
                    .manifest
                    .layout_refs
                    .iter()
                    .map(|reference| asset_key("layout", reference)),
            )
            .chain(
                bundle
                    .manifest
                    .effect_refs
                    .iter()
                    .map(|reference| asset_key("effect", reference)),
            )
            .chain(
                bundle
                    .manifest
                    .cue_refs
                    .iter()
                    .map(|reference| asset_key("cue", reference)),
            )
            .chain(
                bundle
                    .manifest
                    .arrangement_refs
                    .iter()
                    .map(|reference| asset_key("arrangement", reference)),
            )
            .collect(),
    );
    for stage in &bundle.stages {
        edges.insert(
            format!("stage:{}@{}", stage.id, stage.revision),
            vec![asset_key("layout", &stage.layout_ref)],
        );
    }
    for cue in &bundle.cues {
        let key = format!("cue:{}@{}", cue.id, cue.revision);
        let dependencies = std::iter::once(asset_key("stage", &cue.compatible_stage_ref))
            .chain(
                cue.layers
                    .iter()
                    .map(|layer| asset_key("effect", &layer.effect_ref)),
            )
            .collect();
        edges.insert(key, dependencies);
    }
    for arrangement in &bundle.arrangements {
        let key = format!("arrangement:{}@{}", arrangement.id, arrangement.revision);
        let dependencies = arrangement
            .tracks
            .iter()
            .flat_map(|track| track.clips.iter())
            .map(|clip| asset_key("cue", &clip.cue_ref))
            .collect();
        edges.insert(key, dependencies);
    }
    if let Some(cycle) = dependency_cycle(&edges) {
        diagnostics.push(Diagnostic::error(
            PROJECT_REFERENCE_CYCLE,
            "manifest",
            format!(
                "Project dependency graph contains a cycle: {}.",
                cycle.join(" -> ")
            ),
            "Remove the circular asset reference before compiling the Project.",
        ));
    }
}

fn dependency_cycle(edges: &BTreeMap<String, Vec<String>>) -> Option<Vec<String>> {
    fn visit(
        node: &str,
        edges: &BTreeMap<String, Vec<String>>,
        visiting: &mut Vec<String>,
        visited: &mut BTreeSet<String>,
    ) -> Option<Vec<String>> {
        if let Some(start) = visiting.iter().position(|candidate| candidate == node) {
            let mut cycle = visiting[start..].to_vec();
            cycle.push(node.to_string());
            return Some(cycle);
        }
        if !visited.insert(node.to_string()) {
            return None;
        }
        visiting.push(node.to_string());
        if let Some(dependencies) = edges.get(node) {
            for dependency in dependencies {
                if let Some(cycle) = visit(dependency, edges, visiting, visited) {
                    return Some(cycle);
                }
            }
        }
        visiting.pop();
        None
    }

    let mut visited = BTreeSet::new();
    for node in edges.keys() {
        if let Some(cycle) = visit(node, edges, &mut Vec::new(), &mut visited) {
            return Some(cycle);
        }
    }
    None
}

fn target_fixture_ids(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
) -> Vec<u32> {
    resolve_target_set(stage, layout, target).fixture_ids
}

pub(crate) fn resolve_target_set(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &TargetSetDefinition,
) -> ResolvedTargetSet {
    let fixture_ids: Vec<_> = stage_fixture_profile_map(stage).into_keys().collect();
    let weights = target
        .weights
        .iter()
        .map(|weight| (weight.fixture_id, weight.weight))
        .collect();
    let Some((rows, columns)) = layout_grid_dimensions(layout) else {
        let selected = match &target.selector {
            TargetSetSelector::All => fixture_ids,
            TargetSetSelector::FixtureIds { fixture_ids } => fixture_ids.clone(),
            _ => Vec::new(),
        };
        return ResolvedTargetSet {
            partitions: vec![selected.clone()],
            fixture_ids: selected,
            weights,
        };
    };
    let cells: Vec<_> = fixture_ids
        .iter()
        .copied()
        .enumerate()
        .map(|(index, fixture_id)| (fixture_id, index as u32 / columns, index as u32 % columns))
        .collect();
    let partitions: Vec<Vec<u32>> = match &target.selector {
        TargetSetSelector::All => vec![fixture_ids.clone()],
        TargetSetSelector::FixtureIds { fixture_ids } => vec![fixture_ids.clone()],
        TargetSetSelector::Rows { indices } => indices
            .iter()
            .map(|selected_row| {
                cells
                    .iter()
                    .filter_map(|(id, row, _)| (row == selected_row).then_some(*id))
                    .collect()
            })
            .collect(),
        TargetSetSelector::Columns { indices } => indices
            .iter()
            .map(|selected_column| {
                cells
                    .iter()
                    .filter_map(|(id, _, column)| (column == selected_column).then_some(*id))
                    .collect()
            })
            .collect(),
        TargetSetSelector::GridZones {
            rows: zone_rows,
            columns: zone_columns,
            zones,
        } => zones
            .iter()
            .map(|zone| {
                cells
                    .iter()
                    .filter_map(|(id, row, column)| {
                        let row = row.saturating_mul(*zone_rows) / rows.max(1);
                        let column = column.saturating_mul(*zone_columns) / columns.max(1);
                        (row == zone.row && column == zone.column).then_some(*id)
                    })
                    .collect()
            })
            .collect(),
        TargetSetSelector::Checkerboard { parity } => vec![cells
            .iter()
            .filter_map(|(id, row, column)| {
                let even = (row + column).is_multiple_of(2);
                (even == matches!(parity, super::CheckerboardParity::Even)).then_some(*id)
            })
            .collect()],
        TargetSetSelector::CenterEdges { region, thickness } => vec![cells
            .iter()
            .filter_map(|(id, row, column)| {
                let edge = *row < *thickness
                    || *column < *thickness
                    || *row >= rows.saturating_sub(*thickness)
                    || *column >= columns.saturating_sub(*thickness);
                let selected = match region {
                    CenterEdgesRegion::Center => !edge,
                    CenterEdgesRegion::Edges => edge,
                };
                selected.then_some(*id)
            })
            .collect()],
    };
    let fixture_ids = partitions
        .iter()
        .flatten()
        .copied()
        .collect::<BTreeSet<_>>();
    ResolvedTargetSet {
        fixture_ids: fixture_ids.into_iter().collect(),
        partitions,
        weights,
    }
}

fn stage_fixture_profiles<'a>(
    stage: &'a StageDocument,
    stage_index: usize,
    diagnostics: &mut Vec<Diagnostic>,
) -> BTreeMap<u32, &'a str> {
    let mut profiles = BTreeMap::new();
    for (patch_index, patch) in stage.patch.iter().enumerate() {
        if patch.id_range.0 == 0 || patch.id_range.0 > patch.id_range.1 {
            diagnostics.push(Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("stages[{stage_index}].patch[{patch_index}].id_range"),
                "Patch range must contain positive ascending fixture IDs.",
                "Use a valid inclusive fixture ID range.",
            ));
            continue;
        }
        if profile_by_id(&patch.profile_id).is_none() {
            diagnostics.push(reference_not_found(
                format!("stages[{stage_index}].patch[{patch_index}].profile_id"),
                format!("Fixture profile {:?} is not registered.", patch.profile_id),
            ));
        }
        for fixture_id in patch.id_range.0..=patch.id_range.1 {
            if profiles
                .insert(fixture_id, patch.profile_id.as_str())
                .is_some()
            {
                diagnostics.push(Diagnostic::error(
                    PROJECT_DUPLICATE_ASSET,
                    format!("stages[{stage_index}].patch[{patch_index}].id_range"),
                    format!("Fixture ID {fixture_id} is patched more than once."),
                    "Use unique fixture IDs across all Stage patch ranges.",
                ));
            }
        }
    }
    profiles
}

fn stage_fixture_profile_map(stage: &StageDocument) -> BTreeMap<u32, &str> {
    stage
        .patch
        .iter()
        .flat_map(|patch| {
            (patch.id_range.0..=patch.id_range.1)
                .map(move |fixture_id| (fixture_id, patch.profile_id.as_str()))
        })
        .collect()
}

fn validate_indices(
    indices: &[u32],
    upper_bound: Option<u32>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let unique: BTreeSet<_> = indices.iter().copied().collect();
    if indices.is_empty()
        || unique.len() != indices.len()
        || upper_bound.is_some_and(|upper| indices.iter().any(|index| *index >= upper))
    {
        diagnostics.push(Diagnostic::error(
            TARGET_SET_INVALID,
            path,
            "TargetSet indices must be unique, non-empty, and inside the Stage matrix.",
            "Use unique zero-based indices within the matrix dimensions.",
        ));
    }
}

fn validate_identity(id: &str, revision: u32, path: &str, diagnostics: &mut Vec<Diagnostic>) {
    if id.trim().is_empty() || revision == 0 {
        diagnostics.push(Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            path,
            "Asset ID must be non-empty and revision must be at least one.",
            "Assign a stable asset ID and positive revision.",
        ));
    }
}

fn validate_asset_collection<T, F>(
    assets: &[T],
    identity: F,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) where
    F: Fn(&T) -> (&String, u32),
{
    let mut exact = BTreeSet::new();
    for (index, asset) in assets.iter().enumerate() {
        let (id, revision) = identity(asset);
        validate_identity(id, revision, &format!("{path}[{index}]"), diagnostics);
        if !exact.insert((id.as_str(), revision)) {
            diagnostics.push(Diagnostic::error(
                PROJECT_DUPLICATE_ASSET,
                format!("{path}[{index}]"),
                format!("Asset {id:?} revision {revision} is duplicated."),
                "Store each immutable asset revision exactly once in the bundle.",
            ));
        }
    }
}

fn validate_manifest_refs<T, F>(
    references: &[AssetRef],
    assets: &[T],
    identity: F,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) where
    F: Copy + Fn(&T) -> (&String, u32),
{
    let mut identities = BTreeSet::new();
    for (index, reference) in references.iter().enumerate() {
        if !identities.insert((reference.id.as_str(), reference.revision)) {
            diagnostics.push(Diagnostic::error(
                PROJECT_DUPLICATE_ASSET,
                format!("{path}[{index}]"),
                format!(
                    "Manifest references asset {:?} revision {} more than once.",
                    reference.id, reference.revision
                ),
                "Reference each exact asset identity at most once in a Project manifest revision.",
            ));
        }
        resolve_ref(
            reference,
            assets,
            identity,
            &format!("{path}[{index}]"),
            diagnostics,
        );
    }
}

fn resolve_ref<'a, T, F>(
    reference: &AssetRef,
    assets: &'a [T],
    identity: F,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<&'a T>
where
    F: Fn(&T) -> (&String, u32),
{
    if let Some(asset) = exact_asset(assets, reference, &identity) {
        return Some(asset);
    }
    let has_id = assets
        .iter()
        .any(|asset| identity(asset).0 == &reference.id);
    let (code, message, hint) = if has_id {
        (
            PROJECT_REVISION_MISMATCH,
            format!(
                "Asset {:?} revision {} is not available.",
                reference.id, reference.revision
            ),
            "Select an available revision explicitly; never substitute latest implicitly.",
        )
    } else {
        (
            PROJECT_REFERENCE_NOT_FOUND,
            format!("Asset {:?} does not exist.", reference.id),
            "Add the referenced asset to the Project bundle or repair the reference.",
        )
    };
    diagnostics.push(Diagnostic::error(code, path, message, hint));
    None
}

fn exact_asset<'a, T, F>(assets: &'a [T], reference: &AssetRef, identity: F) -> Option<&'a T>
where
    F: Fn(&T) -> (&String, u32),
{
    assets.iter().find(|asset| {
        let (id, revision) = identity(asset);
        id == &reference.id && revision == reference.revision
    })
}

fn asset_key(kind: &str, reference: &AssetRef) -> String {
    format!("{kind}:{}@{}", reference.id, reference.revision)
}

fn reference_not_found(path: impl Into<String>, message: String) -> Diagnostic {
    Diagnostic::error(
        PROJECT_REFERENCE_NOT_FOUND,
        path,
        message,
        "Repair the pinned reference before publishing the Project.",
    )
}

fn matrix_target_diagnostic(path: &str) -> Diagnostic {
    Diagnostic::error(
        TARGET_SET_INVALID,
        format!("{path}.selector"),
        "Rows, Columns, GridZones, and Checkerboard require a matrix Stage layout.",
        "Use All/FixtureIds or switch the Stage to a matrix layout.",
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::{json, Value};

    pub(crate) fn valid_bundle() -> ProjectBundle {
        let value = json!({
            "schema_version": 1,
            "manifest": {
                "schema_version": 1,
                "project_id": "project-1",
                "revision": 1,
                "name": "Project",
                "stage_ref": { "id": "stage-1", "revision": 1 },
                "layout_refs": [{ "id": "layout-1", "revision": 1 }],
                "effect_refs": [{ "id": "pulse", "revision": 1 }],
                "cue_refs": [{ "id": "cue-1", "revision": 1 }],
                "arrangement_refs": [{ "id": "arrangement-1", "revision": 1 }],
                "active_arrangement_id": "arrangement-1"
            },
            "stages": [{
                "schema_version": 1,
                "id": "stage-1",
                "revision": 1,
                "name": "Stage",
                "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 4] }],
                "layout_ref": { "id": "layout-1", "revision": 1 },
                "groups": [{
                    "id": "all-fixtures", "name": "All fixtures",
                    "fixtures": { "range": [1, 4] }, "sort_by": "none"
                }],
                "target_sets": [{
                    "id": "all", "name": "All", "selector": { "type": "all" }
                }]
            }],
            "layouts": [{
                "schema_version": 1,
                "id": "layout-1",
                "revision": 1,
                "name": "Matrix 2×2",
                "category": "basic",
                "editor": { "mode": "form" },
                "geometry": {
                    "shape": "matrix",
                    "rows": 2,
                    "columns": 2,
                    "fixture_size": { "width": 12.0, "height": 12.0 },
                    "gap": { "x": 52.0, "y": 52.0 },
                    "pitch": { "x": 64.0, "y": 64.0 },
                    "origin": { "x": 0.0, "y": 0.0 }
                }
            }],
            "effects": [{
                "schema_version": 1,
                "id": "pulse",
                "name": "Pulse",
                "revision": 1,
                "source": "project_local",
                "parameters": [{
                    "id": "intensity", "name": "Intensity",
                    "schema": {
                        "type": "scalar", "default": 1.0,
                        "range": { "min": 0.0, "max": 1.0, "step": 0.05 },
                        "unit": "normalized"
                    },
                    "scope": "arrangement", "section": "main",
                    "help": "Maximum output intensity."
                }, {
                    "id": "color", "name": "Color",
                    "schema": { "type": "color" },
                    "scope": "arrangement", "section": "main",
                    "help": "Optional single-color output override."
                }],
                "graph": { "nodes": [
                    { "type": "time", "id": "time" },
                    {
                        "type": "step_sequence",
                        "id": "sequence",
                        "phase": { "node_id": "time", "port": "scalar" },
                        "steps": [{ "values": { "dimmer": 1.0 } }]
                    },
                    {
                        "type": "attribute_writer",
                        "id": "output",
                        "input": { "node_id": "sequence", "port": "attribute_set" }
                    }
                ] },
                "catalog": {
                    "energy": 0.5, "density": 0.5, "motion": "pulse",
                    "colorfulness": 0.5, "strobe_risk": "low",
                    "required_attributes": ["intensity"]
                }
            }],
            "cues": [{
                "schema_version": 1,
                "id": "cue-1",
                "revision": 1,
                "name": "Cue",
                "compatible_stage_ref": { "id": "stage-1", "revision": 1 },
                "nominal_length_ticks": 3840,
                "layers": [{
                    "id": "pulse-layer",
                    "effect_ref": { "id": "pulse", "revision": 1 },
                    "target_set_ref": {
                        "stage_id": "stage-1", "stage_revision": 1, "target_set_id": "all"
                    },
                    "parameter_overrides": {
                        "intensity": { "type": "scalar", "value": 0.8 }
                    },
                    "phase": 0.0,
                    "seed": "0000000000000001",
                    "trigger_policy": { "mode": "timeline", "quantize": "beat" }
                }],
                "trigger_policy": { "mode": "timeline", "quantize": "beat" },
                "capability_summary": { "required_attributes": ["intensity"] },
                "risk_summary": { "strobe_risk": "low" }
            }],
            "arrangements": [{
                "schema_version": 1,
                "id": "arrangement-1",
                "revision": 1,
                "name": "House 128",
                "ppq": 960,
                "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128.0 }] },
                "time_signatures": [{ "time_tick": 0, "numerator": 4, "denominator": 4 }],
                "length_ticks": 30720,
                "tracks": [{
                    "id": "cues", "name": "Cues", "overlap_policy": "layer",
                    "clips": [{
                        "id": "clip-1", "cue_ref": { "id": "cue-1", "revision": 1 },
                        "start_tick": 0, "duration_tick": 3840
                    }]
                }]
            }]
        });
        serde_json::from_value(value).expect("valid V1 project fixture")
    }

    #[test]
    fn validates_exact_revision_dependency_graph() {
        let validated = ValidatedProject::validate(valid_bundle()).expect("project validates");
        assert_eq!(
            validated.into_bundle().manifest.active_arrangement_id,
            "arrangement-1"
        );
    }

    #[test]
    fn cue_risk_summary_does_not_have_to_mirror_the_highest_effect_risk() {
        let mut bundle = valid_bundle();
        bundle.cues[0].risk_summary.strobe_risk = super::super::StrobeRiskDSL::None;

        ValidatedProject::validate(bundle)
            .expect("Effect metadata remains authoritative for runtime strobe safety");
    }

    #[test]
    fn distinguishes_missing_and_stale_revisions() {
        let mut stale = valid_bundle();
        stale.cues[0].layers[0].effect_ref.revision = 2;
        let stale_diagnostics = ValidatedProject::validate(stale).expect_err("revision is stale");
        assert!(stale_diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == PROJECT_REVISION_MISMATCH));

        let mut missing = valid_bundle();
        missing.cues[0].layers[0].effect_ref.id = "missing".to_string();
        let missing_diagnostics =
            ValidatedProject::validate(missing).expect_err("reference is missing");
        assert!(missing_diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == PROJECT_REFERENCE_NOT_FOUND));
    }

    #[test]
    fn rejects_capability_mismatch_for_pinned_target_set() {
        let mut bundle = valid_bundle();
        bundle.effects[0].catalog.required_attributes = vec!["position.pan".to_string()];
        let diagnostics =
            ValidatedProject::validate(bundle).expect_err("RGB pixels lack pan capability");
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == PROJECT_CAPABILITY_MISMATCH));
    }

    #[test]
    fn rejects_implicit_overlapping_effect_writers_and_accepts_an_explicit_mix() {
        let mut implicit = valid_bundle();
        let mut second_layer = implicit.cues[0].layers[0].clone();
        second_layer.id = "second-intensity".to_string();
        second_layer.layer = 1;
        second_layer.priority = 1;
        implicit.cues[0].layers.push(second_layer);

        let diagnostics = ValidatedProject::validate(implicit.clone())
            .expect_err("implicit overlap is ambiguous");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == CUE_LAYER_ATTRIBUTE_CONFLICT
                && diagnostic.path.ends_with("layers[1].mix_overrides")
                && diagnostic.message.contains("Layer 1 and Layer 2")
                && !diagnostic.message.contains("second-intensity")
                && diagnostic
                    .recovery
                    .as_deref()
                    .is_some_and(|recovery| recovery.action == "choose_mix_policy")
        }));

        implicit.cues[0].layers[1].mix_overrides = vec![CueMixOverride {
            attribute_id: "intensity".to_string(),
            policy: crate::document::MixPolicy::Htp,
        }];
        ValidatedProject::validate(implicit).expect("explicit mix policy documents the intent");

        let mut disjoint = valid_bundle();
        disjoint.stages[0].target_sets[0].selector = TargetSetSelector::FixtureIds {
            fixture_ids: vec![1, 2],
        };
        disjoint.stages[0].target_sets.push(TargetSetDefinition {
            id: "fixtures-3-4".to_string(),
            name: "Fixtures 3–4".to_string(),
            selector: TargetSetSelector::FixtureIds {
                fixture_ids: vec![3, 4],
            },
            weights: Vec::new(),
        });
        let mut disjoint_layer = disjoint.cues[0].layers[0].clone();
        disjoint_layer.id = "disjoint-intensity".to_string();
        disjoint_layer.target_set_ref.target_set_id = "fixtures-3-4".to_string();
        disjoint_layer.layer = 1;
        disjoint_layer.priority = 1;
        disjoint.cues[0].layers.push(disjoint_layer);
        ValidatedProject::validate(disjoint)
            .expect("the same attribute may target disjoint fixtures without a mix policy");
    }

    #[test]
    fn standard_color_parameters_participate_in_layer_conflict_validation() {
        let mut bundle = valid_bundle();
        let color = bundle.effects[0]
            .parameters
            .iter_mut()
            .find(|parameter| parameter.id == COLOR_PARAMETER_ID)
            .expect("standard Color parameter");
        color.schema = ParameterSchemaDSL::Color {
            default: Some("#FFFFFF".to_string()),
        };
        bundle.effects[0]
            .catalog
            .required_attributes
            .push(COLOR_RGB_ATTRIBUTE.to_string());
        bundle.cues[0]
            .capability_summary
            .required_attributes
            .push(COLOR_RGB_ATTRIBUTE.to_string());
        let mut second_layer = bundle.cues[0].layers[0].clone();
        second_layer.id = "second-color".to_string();
        second_layer.layer = 1;
        second_layer.priority = 1;
        second_layer.mix_overrides = vec![CueMixOverride {
            attribute_id: "intensity".to_string(),
            policy: crate::document::MixPolicy::Htp,
        }];
        bundle.cues[0].layers.push(second_layer);

        let diagnostics = ValidatedProject::validate(bundle)
            .expect_err("runtime Color writes require an explicit mix policy");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == CUE_LAYER_ATTRIBUTE_CONFLICT
                && diagnostic.message.contains(COLOR_RGB_ATTRIBUTE)
        }));
    }

    #[test]
    fn requires_the_standard_color_contract_on_project_effects() {
        let mut missing = valid_bundle();
        missing.effects[0]
            .parameters
            .retain(|parameter| parameter.id != COLOR_PARAMETER_ID);
        let diagnostics = ValidatedProject::validate(missing)
            .expect_err("Project Effects must declare the standard Color parameter");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PROJECT_SCHEMA_INVALID
                && diagnostic.path == "effects[0].parameters"
                && diagnostic.message.contains("missing the standard Color")
        }));

        let mut malformed = valid_bundle();
        malformed.effects[0]
            .parameters
            .iter_mut()
            .find(|parameter| parameter.id == COLOR_PARAMETER_ID)
            .expect("standard Color parameter")
            .scope = ParameterScopeDSL::Cue;
        let diagnostics = ValidatedProject::validate(malformed)
            .expect_err("standard Color must use the shared arrangement scope");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PROJECT_SCHEMA_INVALID
                && diagnostic.path == "effects[0].parameters"
                && diagnostic.message.contains("arrangement scope")
        }));
    }

    #[test]
    fn requires_an_explicit_mix_for_overlapping_arrangement_cues() {
        let mut implicit = valid_bundle();
        let mut overlapping = implicit.arrangements[0].tracks[0].clips[0].clone();
        overlapping.id = "clip-2".to_string();
        overlapping.start_tick = 1_920;
        implicit.arrangements[0].tracks[0].clips.push(overlapping);

        let diagnostics = ValidatedProject::validate(implicit.clone())
            .expect_err("overlapping Cue writers need an explicit mix");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == CUE_LAYER_ATTRIBUTE_CONFLICT
                && diagnostic.path.ends_with("clips[1].layer_overrides")
        }));

        implicit.arrangements[0].tracks[0].clips[1].layer_overrides =
            serde_json::from_value(json!([{
                "layer_id": "pulse-layer",
                "mix_overrides": [{ "attribute_id": "intensity", "policy": "htp" }]
            }]))
            .expect("explicit CueClip mix override");
        ValidatedProject::validate(implicit).expect("explicit overlap mix documents the intent");
    }

    #[test]
    fn rejects_non_musical_speed_overrides() {
        let mut bundle = valid_bundle();
        bundle.effects[0].parameters.push(
            serde_json::from_value(json!({
                "id": "speed",
                "name": "Speed",
                "schema": { "type": "scalar", "default": 1.0,
                    "range": { "min": 0.25, "max": 8.0, "step": 0.25 },
                    "unit": "multiplier" },
                "scope": "arrangement", "section": "main",
                "help": "Beat-synced playback speed."
            }))
            .expect("speed parameter"),
        );
        bundle.cues[0].layers[0]
            .parameter_overrides
            .insert("speed".to_string(), ParameterValueDSL::Scalar(0.375));

        let diagnostics = ValidatedProject::validate(bundle).expect_err("speed must stay musical");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PROJECT_SCHEMA_INVALID
                && diagnostic.path.ends_with("parameter_overrides.speed")
                && diagnostic.message.contains("beat-synchronized")
        }));
    }

    #[test]
    fn rejects_non_musical_effect_default_speed() {
        let mut bundle = valid_bundle();
        bundle.effects[0].parameters.push(
            serde_json::from_value(json!({
                "id": "speed",
                "name": "Speed",
                "schema": { "type": "scalar", "default": 0.375,
                    "range": { "min": 0.25, "max": 8.0, "step": 0.25 },
                    "unit": "multiplier" },
                "scope": "arrangement", "section": "main",
                "help": "Beat-synced playback speed."
            }))
            .expect("speed parameter"),
        );

        let diagnostics =
            ValidatedProject::validate(bundle).expect_err("default speed must stay musical");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PROJECT_SCHEMA_INVALID
                && diagnostic.path.ends_with(".schema.default")
                && diagnostic.message.contains("beat-synchronized")
        }));
    }

    #[test]
    fn rejects_non_musical_speed_automation_keyframes() {
        let mut bundle = valid_bundle();
        bundle.effects[0].parameters.push(
            serde_json::from_value(json!({
                "id": "speed",
                "name": "Speed",
                "schema": { "type": "scalar", "default": 1.0,
                    "range": { "min": 0.25, "max": 8.0, "step": 0.25 },
                    "unit": "multiplier" },
                "scope": "arrangement", "section": "main",
                "help": "Beat-synced playback speed."
            }))
            .expect("speed parameter"),
        );
        let layer_id = bundle.cues[0].layers[0].id.clone();
        bundle.cues[0].automation_lanes.push(
            serde_json::from_value(json!({
                "id": "speed-lane",
                "target": { "layer_id": layer_id, "parameter_id": "speed" },
                "keyframes": [{
                    "id": "speed-0",
                    "time_tick": 0,
                    "value": { "type": "scalar", "value": 1.25 },
                    "interpolation": "hold"
                }]
            }))
            .expect("speed automation lane"),
        );

        let diagnostics =
            ValidatedProject::validate(bundle).expect_err("speed keyframe must stay musical");
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PROJECT_SCHEMA_INVALID
                && diagnostic
                    .path
                    .ends_with("automation_lanes[0].keyframes[0].value")
                && diagnostic.message.contains("beat-synchronized")
        }));
    }

    #[test]
    fn detects_generic_dependency_cycles() {
        let edges = BTreeMap::from([
            ("cue:a@1".to_string(), vec!["cue:b@1".to_string()]),
            ("cue:b@1".to_string(), vec!["cue:a@1".to_string()]),
        ]);
        let cycle = dependency_cycle(&edges).expect("cycle is detected");
        assert_eq!(cycle.first(), cycle.last());
    }

    #[test]
    fn parser_rejects_unknown_asset_fields() {
        let mut value = serde_json::to_value(valid_bundle()).expect("bundle serializes");
        value
            .get_mut("manifest")
            .and_then(Value::as_object_mut)
            .expect("manifest object")
            .insert("latest".to_string(), Value::Bool(true));
        let diagnostics = load_project_bundle(&value.to_string()).expect_err("unknown field");
        assert!(diagnostics
            .iter()
            .all(|diagnostic| diagnostic.code == PROJECT_SCHEMA_INVALID));
    }
}

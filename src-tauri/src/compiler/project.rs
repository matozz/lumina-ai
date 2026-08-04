use super::{CompiledShow, Compiler, EffectInstanceHandle, GroupHandle, MusicalTime};
use crate::compiler::diagnostic::{
    Diagnostic, PROJECT_REFERENCE_NOT_FOUND, PROJECT_REVISION_MISMATCH,
};
use crate::document::{
    layout_to_legacy, resolve_target_set, ArrangementAutomationTarget, ArrangementDocument,
    ArrangementMarker, AssetRef, AutomationLaneDSL, AutomationTargetV3DSL, ClipPlaybackDSL,
    CueAutomationLane, CueCapabilitySummary, CueDefinition, CueLayer, CueMixOverride,
    CueRiskSummary, CueTriggerPolicy, EffectClipDSL, EffectDefinitionDSL, EffectInstanceDSL,
    GroupDSL, GroupFixturesDSL, LayoutDefinition, MetaDSL, MixPolicy as CueMixPolicy,
    ProjectBundle, ShowDocumentV4, StageDocument, TargetingDuration, TargetingDurationUnit,
    TargetingSceneDefinition, TargetingTransition, TimeSignaturePoint, TimelineTrackDSL,
    TimelineV4DSL, ValidatedProject,
};
use crate::engine::effect::{CompiledTargetingScene, CompiledTargetingStep, EffectInstance};
use crate::engine::profile::{profile_by_handle, profile_by_id, MixPolicy};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct CompiledCueLayer {
    pub id: String,
    pub instance: EffectInstanceHandle,
    pub target: GroupHandle,
    pub trigger_policy: CueTriggerPolicy,
}

#[derive(Clone, Debug)]
pub struct CompiledCue {
    pub asset_ref: AssetRef,
    pub name: String,
    pub nominal_length: MusicalTime,
    pub layers: Vec<CompiledCueLayer>,
    pub trigger_policy: CueTriggerPolicy,
    pub capability_summary: CueCapabilitySummary,
    pub risk_summary: CueRiskSummary,
}

#[derive(Clone)]
pub struct CompiledProjectSnapshot {
    pub project_ref: AssetRef,
    pub stage_ref: AssetRef,
    pub arrangement_ref: AssetRef,
    pub arrangement_name: String,
    pub arrangement_length: MusicalTime,
    pub time_signatures: Vec<TimeSignaturePoint>,
    pub markers: Vec<ArrangementMarker>,
    pub cues: HashMap<AssetRef, CompiledCue>,
    pub effect_previews: HashMap<(AssetRef, String), EffectInstanceHandle>,
    pub show: Arc<CompiledShow>,
}

#[derive(Clone)]
struct InstanceCustomization {
    phase_offset: f64,
    priority: i32,
    mix_overrides: Vec<CueMixOverride>,
    targeting_scene_id: Option<String>,
    targeting_origin_tick: u32,
}

struct AggregatedAutomation {
    owner_track: usize,
    id: String,
    target: AutomationTargetV3DSL,
    keyframes: BTreeMap<u32, crate::document::KeyframeDSL>,
}

impl Compiler {
    pub fn compile_active_project(
        validated: ValidatedProject,
    ) -> Result<CompiledProjectSnapshot, Vec<Diagnostic>> {
        let arrangement_ref = validated
            .bundle()
            .manifest
            .arrangement_refs
            .iter()
            .find(|reference| reference.id == validated.bundle().manifest.active_arrangement_id)
            .cloned()
            .expect("validated active Arrangement reference");
        Self::compile_project(validated, &arrangement_ref)
    }

    pub fn compile_project(
        validated: ValidatedProject,
        arrangement_ref: &AssetRef,
    ) -> Result<CompiledProjectSnapshot, Vec<Diagnostic>> {
        let bundle = validated.into_bundle();
        let arrangement = select_arrangement(&bundle, arrangement_ref)?.clone();
        let stage = exact_stage(&bundle, &bundle.manifest.stage_ref)
            .expect("validated Project Stage reference")
            .clone();
        let layout = exact_layout(&bundle, &stage.layout_ref)
            .expect("validated Stage Layout reference")
            .clone();

        let incompatible_cues: Vec<_> = arrangement
            .tracks
            .iter()
            .flat_map(|track| track.clips.iter())
            .filter_map(|clip| {
                let cue = exact_cue(&bundle, &clip.cue_ref)?;
                (cue.compatible_stage_ref != bundle.manifest.stage_ref).then_some((clip, cue))
            })
            .collect();
        if let Some((clip, cue)) = incompatible_cues.first() {
            return Err(vec![Diagnostic::error(
                PROJECT_REVISION_MISMATCH,
                format!("arrangements[{}].clips[{}].cue_ref", arrangement.id, clip.id),
                format!(
                    "Cue {} r{} is pinned to Stage {} r{}, but the active Stage is {} r{}.",
                    cue.name,
                    cue.revision,
                    cue.compatible_stage_ref.id,
                    cue.compatible_stage_ref.revision,
                    bundle.manifest.stage_ref.id,
                    bundle.manifest.stage_ref.revision
                ),
                "Use the Stage impact flow to create explicit Cue and Arrangement revisions, select a compatible Arrangement, or keep the old Stage revision.",
            )]);
        }

        let mut groups = stage.groups.clone();
        let mut target_cache = HashMap::new();
        for target in &stage.target_sets {
            let group_id = target_group_id(&stage, &target.id);
            let resolved = resolve_target_set(&stage, &layout, target);
            groups.push(GroupDSL {
                id: group_id.clone(),
                name: format!("TargetSet · {}", target.name),
                fixtures: GroupFixturesDSL::List(resolved.fixture_ids.clone()),
                sort_by: None,
            });
            target_cache.insert(group_id, resolved);
        }
        for scene in &stage.targeting_scenes {
            let mut fixture_ids = BTreeSet::new();
            for step in &scene.steps {
                let target = stage
                    .target_sets
                    .iter()
                    .find(|target| target.id == step.selection.target_set_id)
                    .expect("validated TargetingScene TargetSet");
                let resolved = resolve_target_set(&stage, &layout, target);
                let selected = step
                    .selection
                    .partition_index
                    .and_then(|index| resolved.partitions.get(index as usize))
                    .unwrap_or(&resolved.fixture_ids);
                fixture_ids.extend(selected.iter().copied());
            }
            groups.push(GroupDSL {
                id: targeting_scene_group_id(&stage, &scene.id),
                name: format!("TargetingScene · {}", scene.name),
                fixtures: GroupFixturesDSL::List(fixture_ids.into_iter().collect()),
                sort_by: None,
            });
        }

        let effects: Vec<_> = bundle
            .manifest
            .effect_refs
            .iter()
            .filter_map(|reference| exact_effect(&bundle, reference))
            .map(|effect| EffectDefinitionDSL {
                id: effect.id.clone(),
                name: effect.name.clone(),
                revision: effect.revision,
                source: effect.source,
                parameters: effect.parameters.clone(),
                graph: effect.graph.clone(),
                catalog: effect.catalog.clone(),
            })
            .collect();

        let cues: Vec<_> = bundle
            .manifest
            .cue_refs
            .iter()
            .filter_map(|reference| exact_cue(&bundle, reference))
            .filter(|cue| cue.compatible_stage_ref == bundle.manifest.stage_ref)
            .cloned()
            .collect();
        let mut instances = Vec::new();
        let mut customizations = HashMap::new();
        let mut compiled_cues = HashMap::new();
        let mut effect_previews = HashMap::new();

        for effect in bundle
            .manifest
            .effect_refs
            .iter()
            .filter_map(|reference| exact_effect(&bundle, reference))
        {
            for target in stage
                .target_sets
                .iter()
                .filter(|target| target_supports_effect(&stage, &layout, target, effect))
            {
                let instance_id =
                    effect_preview_instance_id(&effect.id, effect.revision, &target.id);
                let seed = EffectInstance::stable_seed(&instance_id);
                instances.push(EffectInstanceDSL {
                    id: instance_id.clone(),
                    definition_id: effect.id.clone(),
                    definition_revision: effect.revision,
                    target_group_id: target_group_id(&stage, &target.id),
                    parameter_overrides: BTreeMap::new(),
                    seed: format!("{seed:016x}"),
                });
                customizations.insert(
                    instance_id.clone(),
                    InstanceCustomization {
                        phase_offset: 0.0,
                        priority: 0,
                        mix_overrides: Vec::new(),
                        targeting_scene_id: None,
                        targeting_origin_tick: 0,
                    },
                );
                effect_previews.insert(
                    (
                        AssetRef {
                            id: effect.id.clone(),
                            revision: effect.revision,
                        },
                        target.id.clone(),
                    ),
                    instance_id.into(),
                );
            }
        }

        for cue in &cues {
            let mut compiled_layers = Vec::new();
            for layer in &cue.layers {
                let instance_id = cue_preview_instance_id(cue, layer);
                let target_group_id = layer_target_group_id(&stage, layer);
                instances.push(effect_instance(
                    &instance_id,
                    layer,
                    None,
                    target_group_id.clone(),
                ));
                customizations.insert(instance_id.clone(), customization(layer, None, 0));
                compiled_layers.push(CompiledCueLayer {
                    id: layer.id.clone(),
                    instance: instance_id.into(),
                    target: target_group_id.into(),
                    trigger_policy: layer.trigger_policy,
                });
            }
            let asset_ref = AssetRef {
                id: cue.id.clone(),
                revision: cue.revision,
            };
            compiled_cues.insert(
                asset_ref.clone(),
                CompiledCue {
                    asset_ref,
                    name: cue.name.clone(),
                    nominal_length: MusicalTime::from_ticks(u64::from(cue.nominal_length_ticks)),
                    layers: compiled_layers,
                    trigger_policy: cue.trigger_policy,
                    capability_summary: cue.capability_summary.clone(),
                    risk_summary: cue.risk_summary.clone(),
                },
            );
        }

        let mut automation = BTreeMap::<String, AggregatedAutomation>::new();
        let mut timeline_tracks = Vec::with_capacity(arrangement.tracks.len());
        for (track_index, track) in arrangement.tracks.iter().enumerate() {
            let mut clips = Vec::new();
            for clip in &track.clips {
                let cue = exact_cue(&bundle, &clip.cue_ref).expect("validated CueClip reference");
                for layer in &cue.layers {
                    let layer_override = clip
                        .layer_overrides
                        .iter()
                        .find(|candidate| candidate.layer_id == layer.id);
                    let instance_id = cue_clip_instance_id(&arrangement, clip, layer);
                    instances.push(effect_instance(
                        &instance_id,
                        layer,
                        layer_override,
                        layer_target_group_id(&stage, layer),
                    ));
                    customizations.insert(
                        instance_id.clone(),
                        customization(layer, layer_override, clip.start_tick),
                    );
                    clips.push(EffectClipDSL {
                        id: cue_clip_layer_id(&clip.id, &layer.id),
                        instance_id: instance_id.clone(),
                        start_tick: clip.start_tick,
                        duration_tick: clip.duration_tick,
                        source_offset_tick: clip.source_offset_tick,
                        playback: clip.playback,
                        layer: clip.layer.saturating_add(layer.layer),
                    });
                    for cue_lane in cue
                        .automation_lanes
                        .iter()
                        .filter(|lane| lane.target.layer_id == layer.id)
                    {
                        let key = automation_key(&instance_id, &cue_lane.target.parameter_id);
                        let aggregate =
                            automation
                                .entry(key)
                                .or_insert_with(|| AggregatedAutomation {
                                    owner_track: track_index,
                                    id: format!("cue:{}:{}", clip.id, cue_lane.id),
                                    target: AutomationTargetV3DSL::EffectInstance {
                                        instance_id: instance_id.clone(),
                                        parameter_id: cue_lane.target.parameter_id.clone(),
                                    },
                                    keyframes: BTreeMap::new(),
                                });
                        for keyframe in cue_keyframes_for_clip(cue_lane, cue, clip) {
                            aggregate.keyframes.insert(keyframe.time_tick, keyframe);
                        }
                    }
                }
            }
            timeline_tracks.push(TimelineTrackDSL {
                id: track.id.clone(),
                name: track.name.clone(),
                overlap_policy: track.overlap_policy,
                clips,
                automation_lanes: Vec::new(),
            });
        }

        for (track_index, track) in arrangement.tracks.iter().enumerate() {
            for lane in &track.automation_lanes {
                let (key, target) = match &lane.target {
                    ArrangementAutomationTarget::Global { parameter_id } => (
                        format!("global:{parameter_id:?}"),
                        AutomationTargetV3DSL::Global {
                            parameter_id: *parameter_id,
                        },
                    ),
                    ArrangementAutomationTarget::CueLayer {
                        clip_id,
                        layer_id,
                        parameter_id,
                    } => {
                        let (cue, clip) = arrangement
                            .tracks
                            .iter()
                            .flat_map(|candidate| candidate.clips.iter())
                            .find_map(|clip| {
                                (clip.id == *clip_id).then(|| {
                                    (
                                        exact_cue(&bundle, &clip.cue_ref)
                                            .expect("validated CueClip reference"),
                                        clip,
                                    )
                                })
                            })
                            .expect("validated automation CueClip reference");
                        let layer = cue
                            .layers
                            .iter()
                            .find(|layer| layer.id == *layer_id)
                            .expect("validated automation Cue layer reference");
                        let instance_id = cue_clip_instance_id(&arrangement, clip, layer);
                        (
                            automation_key(&instance_id, parameter_id),
                            AutomationTargetV3DSL::EffectInstance {
                                instance_id,
                                parameter_id: parameter_id.clone(),
                            },
                        )
                    }
                };
                let aggregate = automation
                    .entry(key)
                    .or_insert_with(|| AggregatedAutomation {
                        owner_track: track_index,
                        id: lane.id.clone(),
                        target,
                        keyframes: BTreeMap::new(),
                    });
                aggregate.id = lane.id.clone();
                aggregate.owner_track = track_index;
                for keyframe in &lane.keyframes {
                    aggregate
                        .keyframes
                        .insert(keyframe.time_tick, keyframe.clone());
                }
            }
        }

        for aggregate in automation.into_values() {
            if aggregate.keyframes.is_empty() {
                continue;
            }
            timeline_tracks[aggregate.owner_track]
                .automation_lanes
                .push(AutomationLaneDSL {
                    id: aggregate.id,
                    target: aggregate.target,
                    keyframes: aggregate.keyframes.into_values().collect(),
                });
        }

        let document = ShowDocumentV4 {
            schema_version: 4,
            meta: MetaDSL {
                name: format!("{} · {}", bundle.manifest.name, arrangement.name),
            },
            patch: stage.patch.clone(),
            layout: layout_to_legacy(&layout, &stage_fixture_ids(&stage)),
            groups,
            effect_definitions: effects,
            effect_instances: instances,
            timeline: Some(TimelineV4DSL {
                ppq: arrangement.ppq,
                tempo_map: arrangement.tempo_map.clone(),
                tracks: timeline_tracks,
            }),
        };
        let mut show = Compiler::compile_document(document)?;

        for (group_id, resolved) in target_cache {
            let group = show
                .groups
                .get_mut(&group_id)
                .expect("compiled TargetSet group");
            group.rebuild_target_cache(
                &show.fixtures,
                Some(&resolved.partitions),
                &resolved.weights.into_iter().collect(),
            );
        }
        for (instance_id, customization) in customizations {
            let targeting_scene = customization.targeting_scene_id.as_deref().map(|scene_id| {
                let scene = stage
                    .targeting_scenes
                    .iter()
                    .find(|scene| scene.id == scene_id)
                    .expect("validated TargetingScene reference");
                compile_targeting_scene(
                    scene,
                    &stage,
                    &layout,
                    &show,
                    &arrangement,
                    customization.targeting_origin_tick,
                )
            });
            let instance = show
                .effect_instances
                .get_mut(&instance_id)
                .expect("compiled Cue layer instance");
            instance.phase_offset = customization.phase_offset;
            instance.priority = customization.priority;
            instance.targeting_scene = targeting_scene;
            let group = show
                .groups
                .get(&instance.target_group_id)
                .expect("compiled TargetSet group");
            let mut profiles = Vec::new();
            for fixture_id in &group.sorted_fixture_ids {
                if let Some(profile) = show
                    .fixtures
                    .iter()
                    .find(|fixture| fixture.id == *fixture_id)
                    .map(|fixture| fixture.profile)
                {
                    if !profiles.contains(&profile) {
                        profiles.push(profile);
                    }
                }
            }
            for profile in profiles {
                let descriptors = &profile_by_handle(profile).attributes;
                let mut policies = vec![None; descriptors.len()];
                for mix_override in &customization.mix_overrides {
                    if let Some(index) = descriptors
                        .iter()
                        .position(|attribute| attribute.id == mix_override.attribute_id)
                    {
                        policies[index] = Some(compile_mix_policy(mix_override.policy));
                    }
                }
                instance.mix_overrides.insert(profile, policies);
            }
        }

        Ok(CompiledProjectSnapshot {
            project_ref: AssetRef {
                id: bundle.manifest.project_id,
                revision: bundle.manifest.revision,
            },
            stage_ref: bundle.manifest.stage_ref,
            arrangement_ref: AssetRef {
                id: arrangement.id,
                revision: arrangement.revision,
            },
            arrangement_name: arrangement.name,
            arrangement_length: MusicalTime::from_ticks(u64::from(arrangement.length_ticks)),
            time_signatures: arrangement.time_signatures,
            markers: arrangement.markers,
            cues: compiled_cues,
            effect_previews,
            show: Arc::new(show),
        })
    }
}

fn select_arrangement<'a>(
    bundle: &'a ProjectBundle,
    reference: &AssetRef,
) -> Result<&'a ArrangementDocument, Vec<Diagnostic>> {
    if !bundle.manifest.arrangement_refs.contains(reference) {
        let code = if bundle
            .manifest
            .arrangement_refs
            .iter()
            .any(|candidate| candidate.id == reference.id)
        {
            PROJECT_REVISION_MISMATCH
        } else {
            PROJECT_REFERENCE_NOT_FOUND
        };
        return Err(vec![Diagnostic::error(
            code,
            "arrangement_ref",
            format!(
                "Arrangement {:?} revision {} is not pinned by this Project revision.",
                reference.id, reference.revision
            ),
            "Select an exact Arrangement revision from manifest.arrangement_refs.",
        )]);
    }
    exact_arrangement(bundle, reference).ok_or_else(|| {
        vec![Diagnostic::error(
            PROJECT_REFERENCE_NOT_FOUND,
            "arrangement_ref",
            "The pinned Arrangement revision is missing from the Project bundle.",
            "Restore the exact revision or repair the Project manifest.",
        )]
    })
}

fn exact_stage<'a>(bundle: &'a ProjectBundle, reference: &AssetRef) -> Option<&'a StageDocument> {
    bundle
        .stages
        .iter()
        .find(|stage| stage.id == reference.id && stage.revision == reference.revision)
}

fn exact_layout<'a>(
    bundle: &'a ProjectBundle,
    reference: &AssetRef,
) -> Option<&'a LayoutDefinition> {
    bundle
        .layouts
        .iter()
        .find(|layout| layout.id == reference.id && layout.revision == reference.revision)
}

fn exact_effect<'a>(
    bundle: &'a ProjectBundle,
    reference: &AssetRef,
) -> Option<&'a crate::document::EffectDefinitionDocument> {
    bundle
        .effects
        .iter()
        .find(|effect| effect.id == reference.id && effect.revision == reference.revision)
}

fn exact_cue<'a>(bundle: &'a ProjectBundle, reference: &AssetRef) -> Option<&'a CueDefinition> {
    bundle
        .cues
        .iter()
        .find(|cue| cue.id == reference.id && cue.revision == reference.revision)
}

fn exact_arrangement<'a>(
    bundle: &'a ProjectBundle,
    reference: &AssetRef,
) -> Option<&'a ArrangementDocument> {
    bundle
        .arrangements
        .iter()
        .find(|asset| asset.id == reference.id && asset.revision == reference.revision)
}

fn target_group_id(stage: &StageDocument, target_set_id: &str) -> String {
    format!(
        "__target_set__:{}:{}:{}:{}",
        stage.id.len(),
        stage.id,
        stage.revision,
        target_set_id
    )
}

fn targeting_scene_group_id(stage: &StageDocument, scene_id: &str) -> String {
    format!(
        "__targeting_scene__:{}:{}:{}:{}",
        stage.id.len(),
        stage.id,
        stage.revision,
        scene_id
    )
}

fn layer_target_group_id(stage: &StageDocument, layer: &CueLayer) -> String {
    layer.targeting_scene_ref.as_ref().map_or_else(
        || target_group_id(stage, &layer.target_set_ref.target_set_id),
        |reference| targeting_scene_group_id(stage, &reference.targeting_scene_id),
    )
}

fn cue_preview_instance_id(cue: &CueDefinition, layer: &CueLayer) -> String {
    format!(
        "__cue__:{}:{}:{}:{}:{}",
        cue.id.len(),
        cue.id,
        cue.revision,
        layer.id.len(),
        layer.id
    )
}

fn effect_preview_instance_id(effect_id: &str, revision: u32, target_set_id: &str) -> String {
    format!(
        "__effect_preview__:{}:{}:{}:{}:{}",
        effect_id.len(),
        effect_id,
        revision,
        target_set_id.len(),
        target_set_id
    )
}

fn target_supports_effect(
    stage: &StageDocument,
    layout: &LayoutDefinition,
    target: &crate::document::TargetSetDefinition,
    effect: &crate::document::EffectDefinitionDocument,
) -> bool {
    let resolved = resolve_target_set(stage, layout, target);
    resolved.fixture_ids.iter().all(|fixture_id| {
        let profile_id = stage.patch.iter().find_map(|patch| {
            (patch.id_range.0..=patch.id_range.1)
                .contains(fixture_id)
                .then_some(patch.profile_id.as_str())
        });
        profile_id.and_then(profile_by_id).is_some_and(|profile| {
            effect.catalog.required_attributes.iter().all(|required| {
                profile
                    .attributes
                    .iter()
                    .any(|attribute| attribute.id == *required)
            })
        })
    })
}

fn stage_fixture_ids(stage: &StageDocument) -> Vec<u32> {
    stage
        .patch
        .iter()
        .flat_map(|patch| patch.id_range.0..=patch.id_range.1)
        .collect()
}

fn cue_clip_instance_id(
    arrangement: &ArrangementDocument,
    clip: &crate::document::CueClip,
    layer: &CueLayer,
) -> String {
    format!(
        "__arr__:{}:{}:{}:{}:{}:{}:{}",
        arrangement.id.len(),
        arrangement.id,
        arrangement.revision,
        clip.id.len(),
        clip.id,
        layer.id.len(),
        layer.id
    )
}

fn cue_clip_layer_id(clip_id: &str, layer_id: &str) -> String {
    format!(
        "__cue_clip__:{}:{}:{}:{}",
        clip_id.len(),
        clip_id,
        layer_id.len(),
        layer_id
    )
}

fn effect_instance(
    id: &str,
    layer: &CueLayer,
    layer_override: Option<&crate::document::CueLayerOverride>,
    target_group_id: String,
) -> EffectInstanceDSL {
    let mut parameter_overrides = layer.parameter_overrides.clone();
    if let Some(layer_override) = layer_override {
        parameter_overrides.extend(layer_override.parameter_overrides.clone());
    }
    EffectInstanceDSL {
        id: id.to_string(),
        definition_id: layer.effect_ref.id.clone(),
        definition_revision: layer.effect_ref.revision,
        target_group_id,
        parameter_overrides,
        seed: layer.seed.clone(),
    }
}

fn customization(
    layer: &CueLayer,
    layer_override: Option<&crate::document::CueLayerOverride>,
    targeting_origin_tick: u32,
) -> InstanceCustomization {
    let mut mix_overrides: BTreeMap<_, _> = layer
        .mix_overrides
        .iter()
        .map(|mix_override| (mix_override.attribute_id.clone(), mix_override.policy))
        .collect();
    if let Some(layer_override) = layer_override {
        mix_overrides.extend(
            layer_override
                .mix_overrides
                .iter()
                .map(|mix_override| (mix_override.attribute_id.clone(), mix_override.policy)),
        );
    }
    InstanceCustomization {
        phase_offset: layer_override
            .and_then(|layer_override| layer_override.phase)
            .unwrap_or(layer.phase),
        priority: layer.priority,
        mix_overrides: mix_overrides
            .into_iter()
            .map(|(attribute_id, policy)| CueMixOverride {
                attribute_id,
                policy,
            })
            .collect(),
        targeting_scene_id: layer
            .targeting_scene_ref
            .as_ref()
            .map(|reference| reference.targeting_scene_id.clone()),
        targeting_origin_tick,
    }
}

fn compile_targeting_scene(
    scene: &TargetingSceneDefinition,
    stage: &StageDocument,
    layout: &LayoutDefinition,
    show: &CompiledShow,
    arrangement: &ArrangementDocument,
    origin_tick: u32,
) -> CompiledTargetingScene {
    let fixture_indices: HashMap<_, _> = show
        .fixtures
        .iter()
        .enumerate()
        .map(|(index, fixture)| (fixture.id, index))
        .collect();
    let mut cursor = 0_u64;
    let mut steps = Vec::with_capacity(scene.steps.len());
    for step in &scene.steps {
        let target = stage
            .target_sets
            .iter()
            .find(|target| target.id == step.selection.target_set_id)
            .expect("validated TargetingScene TargetSet");
        let resolved = resolve_target_set(stage, layout, target);
        let selected = step
            .selection
            .partition_index
            .and_then(|index| resolved.partitions.get(index as usize))
            .unwrap_or(&resolved.fixture_ids);
        let weights: HashMap<_, _> = target
            .weights
            .iter()
            .map(|weight| (weight.fixture_id, weight.weight))
            .collect();
        let mut fixture_weights = vec![0.0; show.fixtures.len()];
        for fixture_id in selected {
            if let Some(index) = fixture_indices.get(fixture_id).copied() {
                fixture_weights[index] = weights.get(fixture_id).copied().unwrap_or(1.0);
            }
        }
        let absolute_tick = u64::from(origin_tick).saturating_add(cursor);
        let duration_ticks = targeting_duration_ticks(step.duration, absolute_tick, arrangement);
        let transition_ticks = match step.transition {
            TargetingTransition::Hard => 0,
            TargetingTransition::Weighted { duration } => {
                targeting_duration_ticks(duration, absolute_tick, arrangement).min(duration_ticks)
            }
        };
        cursor = cursor.saturating_add(duration_ticks.max(1));
        steps.push(CompiledTargetingStep {
            end_tick: cursor,
            transition_ticks,
            fixture_weights,
        });
    }
    CompiledTargetingScene {
        steps,
        total_ticks: cursor,
        looped: scene.looped,
        phase_continuity: scene.phase_continuity,
    }
}

fn targeting_duration_ticks(
    duration: TargetingDuration,
    absolute_tick: u64,
    arrangement: &ArrangementDocument,
) -> u64 {
    let mut cursor = absolute_tick;
    for _ in 0..duration.value {
        let signature = arrangement
            .time_signatures
            .iter()
            .rev()
            .find(|signature| u64::from(signature.time_tick) <= cursor)
            .unwrap_or(&arrangement.time_signatures[0]);
        let beat_ticks = u64::from(arrangement.ppq)
            .saturating_mul(4)
            .checked_div(u64::from(signature.denominator))
            .unwrap_or(1)
            .max(1);
        let unit_ticks = match duration.unit {
            TargetingDurationUnit::Beat => beat_ticks,
            TargetingDurationUnit::Bar => beat_ticks.saturating_mul(u64::from(signature.numerator)),
        };
        cursor = cursor.saturating_add(unit_ticks);
    }
    cursor.saturating_sub(absolute_tick).max(1)
}

fn compile_mix_policy(policy: CueMixPolicy) -> MixPolicy {
    match policy {
        CueMixPolicy::Htp => MixPolicy::Htp,
        CueMixPolicy::Ltp => MixPolicy::Ltp,
        CueMixPolicy::Add => MixPolicy::Add,
        CueMixPolicy::Multiply => MixPolicy::Multiply,
        CueMixPolicy::Mask => MixPolicy::Mask,
    }
}

fn automation_key(instance_id: &str, parameter_id: &str) -> String {
    format!(
        "effect:{}:{}:{}:{}",
        instance_id.len(),
        instance_id,
        parameter_id.len(),
        parameter_id
    )
}

fn cue_keyframes_for_clip(
    lane: &CueAutomationLane,
    cue: &CueDefinition,
    clip: &crate::document::CueClip,
) -> Vec<crate::document::KeyframeDSL> {
    let start = u64::from(clip.source_offset_tick);
    let end = start.saturating_add(u64::from(clip.duration_tick));
    let cue_length = u64::from(cue.nominal_length_ticks);
    let mut output = Vec::new();
    for keyframe in &lane.keyframes {
        let local_tick = u64::from(keyframe.time_tick);
        let mut occurrences = Vec::new();
        match clip.playback {
            ClipPlaybackDSL::Once => occurrences.push(local_tick),
            ClipPlaybackDSL::Loop => {
                let mut occurrence = local_tick;
                if occurrence < start {
                    let skipped_cycles = (start - occurrence).div_ceil(cue_length);
                    occurrence =
                        occurrence.saturating_add(skipped_cycles.saturating_mul(cue_length));
                }
                while occurrence < end {
                    occurrences.push(occurrence);
                    occurrence = occurrence.saturating_add(cue_length);
                }
            }
        }
        for occurrence in occurrences {
            if occurrence < start || occurrence >= end {
                continue;
            }
            let mut mapped = keyframe.clone();
            mapped.id = format!("{}:{}:{}", clip.id, lane.id, occurrence);
            mapped.time_tick =
                u32::try_from(u64::from(clip.start_tick).saturating_add(occurrence - start))
                    .unwrap_or(u32::MAX);
            output.push(mapped);
        }
    }
    output.sort_by_key(|keyframe| keyframe.time_tick);
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{
        valid_bundle, AssetRef, GridZone, TargetSetDefinition, TargetSetRef, TargetSetSelector,
    };
    use crate::engine::profile::{AttributeValue, INTENSITY_ATTRIBUTE};
    use crate::engine::render::{render_at, RenderSource, RenderTime};
    use std::time::Instant;

    fn matrix_project() -> ProjectBundle {
        let mut bundle = valid_bundle();
        bundle.stages[0].patch[0].id_range = (1, 900);
        bundle.layouts[0].geometry = serde_json::from_value(serde_json::json!({
            "shape": "matrix",
            "rows": 30,
            "columns": 30,
            "fixture_size": { "width": 1.0, "height": 1.0 },
            "gap": { "x": 0.0, "y": 0.0 },
            "pitch": { "x": 1.0, "y": 1.0 },
            "origin": { "x": 0.0, "y": 0.0 }
        }))
        .expect("30x30 layout");
        bundle.stages[0].groups[0].fixtures = GroupFixturesDSL::List((1..=900).collect());
        bundle.stages[0].target_sets.push(TargetSetDefinition {
            id: "zones-3x3".to_string(),
            name: "3×3 Zones".to_string(),
            selector: TargetSetSelector::GridZones {
                rows: 3,
                columns: 3,
                zones: (0..3)
                    .flat_map(|row| (0..3).map(move |column| GridZone { row, column }))
                    .collect(),
            },
            weights: Vec::new(),
        });

        let constant_graph = serde_json::from_value(serde_json::json!({
            "nodes": [
                {
                    "type": "constant",
                    "id": "intensity-value",
                    "value": { "type": "scalar", "value": 0.25 }
                },
                {
                    "type": "attribute_writer",
                    "id": "intensity-output",
                    "input": { "node_id": "intensity-value", "port": "scalar" },
                    "attribute_id": "intensity"
                }
            ]
        }))
        .expect("constant effect graph");
        bundle.effects[0].name = "Pulse".to_string();
        bundle.effects[0].graph = constant_graph;
        let mut gradient = bundle.effects[0].clone();
        gradient.id = "gradient".to_string();
        gradient.name = "Gradient".to_string();
        bundle.effects.push(gradient);
        bundle.manifest.effect_refs.push(AssetRef {
            id: "gradient".to_string(),
            revision: 1,
        });

        bundle.cues[0].layers[0].parameter_overrides.clear();
        let mut gradient_layer = bundle.cues[0].layers[0].clone();
        gradient_layer.id = "gradient-layer".to_string();
        gradient_layer.effect_ref.id = "gradient".to_string();
        gradient_layer.target_set_ref = TargetSetRef {
            stage_id: "stage-1".to_string(),
            stage_revision: 1,
            target_set_id: "zones-3x3".to_string(),
        };
        gradient_layer.phase = 0.25;
        gradient_layer.priority = 2;
        gradient_layer.mix_overrides = vec![CueMixOverride {
            attribute_id: INTENSITY_ATTRIBUTE.to_string(),
            policy: CueMixPolicy::Add,
        }];
        bundle.cues[0].name = "Pulse + Gradient".to_string();
        bundle.cues[0].layers.push(gradient_layer);
        bundle
    }

    fn targeting_project(fixture_count: u32, rows: u32, columns: u32) -> ProjectBundle {
        let mut bundle = matrix_project();
        bundle.stages[0].patch[0].id_range = (1, fixture_count);
        bundle.layouts[0].geometry = serde_json::from_value(serde_json::json!({
            "shape": "matrix",
            "rows": rows,
            "columns": columns,
            "fixture_size": { "width": 1.0, "height": 1.0 },
            "gap": { "x": 0.0, "y": 0.0 },
            "pitch": { "x": 1.0, "y": 1.0 },
            "origin": { "x": 0.0, "y": 0.0 }
        }))
        .expect("targeting matrix layout");
        bundle.stages[0].groups[0].fixtures = GroupFixturesDSL::List((1..=fixture_count).collect());
        bundle.stages[0].targeting_scenes.push(
            serde_json::from_value(serde_json::json!({
                "id": "all-zone-all",
                "name": "All → Zone → All",
                "looped": false,
                "phase_continuity": true,
                "steps": [
                    {
                        "id": "all-in",
                        "selection": { "target_set_id": "all" },
                        "duration": { "value": 1, "unit": "beat" },
                        "transition": { "type": "hard" }
                    },
                    {
                        "id": "zone",
                        "selection": { "target_set_id": "zones-3x3", "partition_index": 0 },
                        "duration": { "value": 1, "unit": "beat" },
                        "transition": { "type": "hard" }
                    },
                    {
                        "id": "all-out",
                        "selection": { "target_set_id": "all" },
                        "duration": { "value": 1, "unit": "beat" },
                        "transition": {
                            "type": "weighted",
                            "duration": { "value": 1, "unit": "beat" }
                        }
                    }
                ]
            }))
            .expect("TargetingScene"),
        );
        bundle.cues[0].layers[1].targeting_scene_ref = Some(
            serde_json::from_value(serde_json::json!({
                "stage_id": "stage-1",
                "stage_revision": 1,
                "targeting_scene_id": "all-zone-all"
            }))
            .expect("TargetingScene ref"),
        );
        bundle
    }

    #[test]
    fn compiles_30_by_30_all_to_zones_with_precomputed_target_caches() {
        let bundle = matrix_project();
        let stage = bundle.stages[0].clone();
        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(bundle).expect("matrix Project validates"),
        )
        .expect("matrix Project compiles");

        let all = snapshot
            .show
            .groups
            .get(&target_group_id(&stage, "all"))
            .expect("All target cache");
        assert_eq!(all.sorted_fixture_ids.len(), 900);
        assert_eq!(all.partitions.len(), 1);
        assert_eq!(all.partitions[0].len(), 900);

        let zones = snapshot
            .show
            .groups
            .get(&target_group_id(&stage, "zones-3x3"))
            .expect("3x3 target cache");
        assert_eq!(zones.sorted_fixture_ids.len(), 900);
        assert_eq!(zones.partitions.len(), 9);
        assert!(zones
            .partitions
            .iter()
            .all(|partition| partition.len() == 100));
        assert!((0..900).all(|fixture_index| zones.contains_fixture_index(fixture_index)));

        let first = render_at(
            &snapshot.show,
            RenderTime { beat: 1.75 },
            RenderSource::Timeline,
        );
        let replay = render_at(
            &snapshot.show,
            RenderTime { beat: 1.75 },
            RenderSource::Timeline,
        );
        assert_eq!(first, replay);
        assert_eq!(first.len(), 900);
        assert!(first.iter().all(|frame| {
            let intensity = crate::engine::attribute::resolve_attribute(
                frame.profile,
                INTENSITY_ATTRIBUTE,
            )
            .expect("RGB intensity");
            matches!(frame.value(intensity), Some(AttributeValue::Scalar(value)) if (*value - 0.5).abs() < f32::EPSILON)
        }));
    }

    #[test]
    fn targeting_scene_hard_switch_and_weighted_return_are_precomputed_and_deterministic() {
        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(targeting_project(900, 30, 30))
                .expect("TargetingScene Project validates"),
        )
        .expect("TargetingScene Project compiles");
        let render = |beat| render_at(&snapshot.show, RenderTime { beat }, RenderSource::Timeline);
        let all_in = render(0.5);
        let zone = render(1.5);
        let weighted = render(2.5);
        let all_out = render(3.5);
        let intensity = |frames: &[crate::engine::attribute::FixtureFrame], index: usize| {
            let frame = &frames[index];
            let handle =
                crate::engine::attribute::resolve_attribute(frame.profile, INTENSITY_ATTRIBUTE)
                    .expect("intensity handle");
            match frame.value(handle) {
                Some(AttributeValue::Scalar(value)) => *value,
                value => panic!("expected intensity, got {value:?}"),
            }
        };

        assert!((intensity(&all_in, 500) - 0.5).abs() < f32::EPSILON);
        assert!((intensity(&zone, 0) - 0.5).abs() < f32::EPSILON);
        assert!((intensity(&zone, 500) - 0.25).abs() < f32::EPSILON);
        assert!((intensity(&weighted, 500) - 0.375).abs() < 0.001);
        let final_intensity = intensity(&all_out, 500);
        assert!(
            (final_intensity - 0.5).abs() < f32::EPSILON,
            "expected 0.5 after weighted return, got {final_intensity}"
        );
        assert_eq!(weighted, render(2.5));

        let scene_instance = snapshot
            .show
            .effect_instances
            .values()
            .find(|instance| instance.targeting_scene.is_some())
            .expect("compiled scene instance");
        let scene = scene_instance
            .targeting_scene
            .as_ref()
            .expect("scene cache");
        assert!(scene.phase_continuity);
        assert_eq!(scene.steps.len(), 3);
        assert_eq!(scene.steps[0].fixture_weights.len(), 900);
    }

    #[test]
    fn targeting_scene_bar_snap_uses_the_full_time_signature_map() {
        let mut bundle = targeting_project(900, 30, 30);
        bundle.arrangements[0].time_signatures = vec![
            TimeSignaturePoint {
                time_tick: 0,
                numerator: 3,
                denominator: 8,
            },
            TimeSignaturePoint {
                time_tick: 1_440,
                numerator: 4,
                denominator: 4,
            },
        ];
        for step in &mut bundle.stages[0].targeting_scenes[0].steps {
            step.duration.unit = TargetingDurationUnit::Bar;
        }
        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(bundle).expect("meter-aware scene validates"),
        )
        .expect("meter-aware scene compiles");
        let scene = snapshot
            .show
            .effect_instances
            .values()
            .find_map(|instance| instance.targeting_scene.as_ref())
            .expect("compiled TargetingScene");

        assert_eq!(scene.steps[0].end_tick, 1_440);
        assert_eq!(scene.steps[1].end_tick, 5_280);
        assert_eq!(scene.steps[2].end_tick, 9_120);
    }

    #[test]
    fn all_to_every_three_by_three_partition_to_all_is_seek_deterministic() {
        let mut bundle = targeting_project(900, 30, 30);
        bundle.stages[0].targeting_scenes[0].steps = serde_json::from_value(serde_json::json!([
            {
                "id": "all-in",
                "selection": { "target_set_id": "all" },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-1",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 0 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-2",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 1 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-3",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 2 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-4",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 3 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-5",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 4 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-6",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 5 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-7",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 6 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-8",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 7 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "zone-9",
                "selection": { "target_set_id": "zones-3x3", "partition_index": 8 },
                "duration": { "value": 1, "unit": "bar" },
                "transition": { "type": "hard" }
            },
            {
                "id": "all-out",
                "selection": { "target_set_id": "all" },
                "duration": { "value": 1, "unit": "bar" },
                "transition": {
                    "type": "weighted",
                    "duration": { "value": 1, "unit": "beat" }
                }
            }
        ]))
        .expect("All/3x3/All steps");
        bundle.arrangements[0].tracks[0].clips[0].duration_tick = 48_000;
        bundle.arrangements[0].length_ticks = 61_440;
        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(bundle).expect("All/3x3/All validates"),
        )
        .expect("All/3x3/All compiles");

        let beats: Vec<_> = (0..9)
            .map(|partition| 4.5 + partition as f64 * 4.0)
            .collect();
        let first: Vec<_> = beats
            .iter()
            .map(|beat| {
                render_at(
                    &snapshot.show,
                    RenderTime { beat: *beat },
                    RenderSource::Timeline,
                )
            })
            .collect();
        let replay: Vec<_> = beats
            .iter()
            .map(|beat| {
                render_at(
                    &snapshot.show,
                    RenderTime { beat: *beat },
                    RenderSource::Timeline,
                )
            })
            .collect();

        assert_eq!(first, replay);
        for frames in first {
            let selected = frames
                .iter()
                .filter(|frame| {
                    let handle = crate::engine::attribute::resolve_attribute(
                        frame.profile,
                        INTENSITY_ATTRIBUTE,
                    )
                    .expect("intensity");
                    matches!(frame.value(handle), Some(AttributeValue::Scalar(value)) if *value > 0.25)
                })
                .count();
            assert_eq!(selected, 100);
        }
        assert_eq!(
            render_at(
                &snapshot.show,
                RenderTime { beat: 44.5 },
                RenderSource::Timeline,
            ),
            render_at(
                &snapshot.show,
                RenderTime { beat: 44.5 },
                RenderSource::Timeline,
            )
        );
    }

    #[test]
    fn one_thousand_fixture_parallel_partitions_fit_the_60hz_average_budget() {
        let mut bundle = targeting_project(1_000, 25, 40);
        let scene_layer = bundle.cues[0].layers[1].clone();
        for index in 2..=4 {
            let mut layer = scene_layer.clone();
            layer.id = format!("scene-layer-{index}");
            layer.phase = index as f64 / 8.0;
            layer.seed = format!("{index:016x}");
            bundle.cues[0].layers.push(layer);
        }
        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(bundle).expect("1,000 fixture Project validates"),
        )
        .expect("1,000 fixture Project compiles");
        let beats: Vec<_> = (0..180)
            .map(|index| ((index * 67) % 127) as f64 / 32.0)
            .collect();
        let _warm = render_at(
            &snapshot.show,
            RenderTime { beat: 0.0 },
            RenderSource::Timeline,
        );
        let started = Instant::now();
        let first: Vec<_> = beats
            .iter()
            .map(|beat| {
                render_at(
                    &snapshot.show,
                    RenderTime { beat: *beat },
                    RenderSource::Timeline,
                )
            })
            .collect();
        let elapsed = started.elapsed();
        let replay: Vec<_> = beats
            .iter()
            .map(|beat| {
                render_at(
                    &snapshot.show,
                    RenderTime { beat: *beat },
                    RenderSource::Timeline,
                )
            })
            .collect();

        assert_eq!(first, replay);
        assert!(first.iter().all(|frame| frame.len() == 1_000));
        assert!(
            elapsed.as_secs_f64() / beats.len() as f64 <= 1.0 / 60.0,
            "1,000 fixture parallel targeting average exceeded 60Hz: {elapsed:?}"
        );
    }

    #[test]
    fn random_seek_and_replay_stay_deterministic_within_the_60hz_average_budget() {
        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(matrix_project()).expect("matrix Project validates"),
        )
        .expect("matrix Project compiles");
        let beats: Vec<_> = (0..120)
            .map(|index| ((index * 73) % 383) as f64 / 32.0)
            .collect();
        let started = Instant::now();
        let first: Vec<_> = beats
            .iter()
            .map(|beat| {
                render_at(
                    &snapshot.show,
                    RenderTime { beat: *beat },
                    RenderSource::Timeline,
                )
            })
            .collect();
        let elapsed = started.elapsed();
        let replay: Vec<_> = beats
            .iter()
            .map(|beat| {
                render_at(
                    &snapshot.show,
                    RenderTime { beat: *beat },
                    RenderSource::Timeline,
                )
            })
            .collect();
        assert_eq!(first, replay);
        assert!(
            elapsed.as_secs_f64() / beats.len() as f64 <= 1.0 / 60.0,
            "30×30 render average exceeded 60Hz: {:?} for {} frames",
            elapsed,
            beats.len()
        );
    }

    #[test]
    fn arrangements_reuse_cue_revisions_without_moving_ticks_when_tempo_changes() {
        let mut bundle = matrix_project();
        bundle.arrangements[0].tracks[0].automation_lanes.push(
            serde_json::from_value(serde_json::json!({
                "id": "master",
                "target": { "scope": "global", "parameter_id": "master_dimmer" },
                "keyframes": [
                    { "id": "start", "time_tick": 0, "value": { "type": "scalar", "value": 1.0 }, "interpolation": "linear" },
                    { "id": "end", "time_tick": 3840, "value": { "type": "scalar", "value": 0.5 }, "interpolation": "linear" }
                ]
            }))
            .expect("Arrangement automation"),
        );
        let mut journey = bundle.arrangements[0].clone();
        journey.id = "tempo-journey".to_string();
        journey.name = "Tempo Journey".to_string();
        journey.tempo_map = serde_json::from_value(serde_json::json!({
            "points": [
                { "time_tick": 0, "bpm": 128.0 },
                { "time_tick": 3840, "bpm": 96.0 },
                { "time_tick": 7680, "bpm": 140.0 }
            ]
        }))
        .expect("multi-segment TempoMap");
        bundle.manifest.arrangement_refs.push(AssetRef {
            id: journey.id.clone(),
            revision: journey.revision,
        });
        bundle.arrangements.push(journey);

        let house = Compiler::compile_project(
            ValidatedProject::validate(bundle.clone()).expect("multi Arrangement validates"),
            &AssetRef {
                id: "arrangement-1".to_string(),
                revision: 1,
            },
        )
        .expect("House compiles");
        let journey = Compiler::compile_project(
            ValidatedProject::validate(bundle).expect("multi Arrangement validates"),
            &AssetRef {
                id: "tempo-journey".to_string(),
                revision: 1,
            },
        )
        .expect("Journey compiles");
        let house_timeline = house.show.timeline.as_ref().expect("House timeline");
        let journey_timeline = journey.show.timeline.as_ref().expect("Journey timeline");
        assert_eq!(house_timeline.tempo_map.points().len(), 1);
        assert_eq!(journey_timeline.tempo_map.points().len(), 3);
        assert_eq!(
            house_timeline.tracks[0].clips[0].start,
            journey_timeline.tracks[0].clips[0].start
        );
        assert_eq!(
            house_timeline.automation_lanes[0].keyframes[1].time,
            journey_timeline.automation_lanes[0].keyframes[1].time
        );
        assert_ne!(
            house_timeline
                .tempo_map
                .micros_at(MusicalTime::from_ticks(9_600)),
            journey_timeline
                .tempo_map
                .micros_at(MusicalTime::from_ticks(9_600))
        );
    }

    #[test]
    fn published_cue_remains_pinned_when_a_new_effect_revision_is_added() {
        let mut bundle = matrix_project();
        let mut revision_two = bundle.effects[0].clone();
        revision_two.revision = 2;
        revision_two.name = "Pulse v2".to_string();
        bundle.effects.push(revision_two);
        bundle.manifest.effect_refs.push(AssetRef {
            id: "pulse".to_string(),
            revision: 2,
        });

        let snapshot = Compiler::compile_active_project(
            ValidatedProject::validate(bundle).expect("multiple revisions validate"),
        )
        .expect("pinned Cue compiles");
        let cue = snapshot
            .cues
            .get(&AssetRef {
                id: "cue-1".to_string(),
                revision: 1,
            })
            .expect("compiled Cue");
        let instance = snapshot
            .show
            .effect_instances
            .get(cue.layers[0].instance.as_str())
            .expect("Cue layer instance");
        assert_eq!(
            snapshot.show.effect_definitions[instance.definition.index()].revision,
            1
        );
    }

    #[test]
    fn selecting_an_unpinned_arrangement_revision_returns_a_structured_diagnostic() {
        let diagnostics = match Compiler::compile_project(
            ValidatedProject::validate(matrix_project()).expect("Project validates"),
            &AssetRef {
                id: "arrangement-1".to_string(),
                revision: 2,
            },
        ) {
            Ok(_) => panic!("unpublished revision must not compile"),
            Err(diagnostics) => diagnostics,
        };
        assert_eq!(diagnostics[0].code, PROJECT_REVISION_MISMATCH);
    }
}

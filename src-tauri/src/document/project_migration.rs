use super::{
    load_document, migrated_layout_definition, ArrangementAutomationLane,
    ArrangementAutomationTarget, ArrangementDocument, AssetRef, CueCapabilitySummary, CueClip,
    CueDefinition, CueLayer, CueQuantize, CueRiskSummary, CueTrack, CueTriggerMode,
    CueTriggerPolicy, EffectDefinitionDocument, GroupFixturesDSL, MigrationChange, ProjectBundle,
    ProjectManifest, ShowDocumentV4, StageDocument, TargetSetDefinition, TargetSetRef,
    TargetSetSelector, TimeSignaturePoint, ARRANGEMENT_DOCUMENT_SCHEMA_VERSION,
    CUE_DEFINITION_SCHEMA_VERSION, EFFECT_DEFINITION_SCHEMA_VERSION, PROJECT_BUNDLE_SCHEMA_VERSION,
    PROJECT_MANIFEST_SCHEMA_VERSION, STAGE_DOCUMENT_SCHEMA_VERSION,
};
use crate::compiler::diagnostic::{Diagnostic, PROJECT_SCHEMA_INVALID};
use serde_json::Value;
use std::collections::BTreeMap;

const MIGRATED_PROJECT_ID: &str = "project-default";
const MIGRATED_STAGE_ID: &str = "stage-default";
const MIGRATED_LAYOUT_ID: &str = "layout-default";
const MIGRATED_ARRANGEMENT_ID: &str = "arrangement-default";
const MIGRATED_LAYER_ID: &str = "effect-layer";
const MIGRATED_ALL_TARGET_ID: &str = "all-fixtures";

#[derive(Debug, serde::Serialize, Clone, PartialEq, Eq)]
pub struct ProjectMigrationReport {
    pub source_schema_version: Option<u32>,
    pub project_bundle_schema_version: u32,
    pub changes: Vec<MigrationChange>,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct MigratedProject {
    pub bundle: ProjectBundle,
    pub migration_report: ProjectMigrationReport,
}

pub fn migrate_project_bundle(source: &str) -> Result<MigratedProject, Vec<Diagnostic>> {
    let mut value: Value = serde_json::from_str(source).map_err(|error| {
        vec![Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            format!("line {}, column {}", error.line(), error.column()),
            error.to_string(),
            "Open a valid Lumina Project bundle or run the supported migration path.",
        )]
    })?;
    let source_schema_version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .and_then(|version| u32::try_from(version).ok());
    let mut changes = Vec::new();
    match source_schema_version {
        Some(PROJECT_BUNDLE_SCHEMA_VERSION) => {}
        Some(1) => migrate_project_bundle_v1_value(&mut value, &mut changes)?,
        Some(version) => {
            return Err(vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                "schema_version",
                format!("Project bundle schema version {version} is not supported."),
                "Migrate the bundle with a Lumina version that supports its schema.",
            )]);
        }
        None => {
            return Err(vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                "schema_version",
                "Project bundle schema_version is missing or invalid.",
                "Use an integer Project bundle schema version.",
            )]);
        }
    }
    let bundle: ProjectBundle = serde_json::from_value(value).map_err(|error| {
        vec![Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            "project_bundle",
            error.to_string(),
            "Repair the reported asset field before opening the Project.",
        )]
    })?;
    super::ValidatedProject::validate(bundle.clone())?;
    Ok(MigratedProject {
        bundle,
        migration_report: ProjectMigrationReport {
            source_schema_version,
            project_bundle_schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
            changes,
        },
    })
}

fn migrate_project_bundle_v1_value(
    value: &mut Value,
    changes: &mut Vec<MigrationChange>,
) -> Result<(), Vec<Diagnostic>> {
    let object = value.as_object_mut().ok_or_else(|| {
        vec![Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            "project_bundle",
            "Project bundle root must be an object.",
            "Open a valid Lumina Project bundle.",
        )]
    })?;
    let stages = object
        .get_mut("stages")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| {
            vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                "stages",
                "Project bundle v1 must contain a Stage asset array.",
                "Restore the Stage assets before migration.",
            )]
        })?;
    let mut layouts = Vec::with_capacity(stages.len());
    let mut layout_refs = Vec::with_capacity(stages.len());
    for (index, stage_value) in stages.iter_mut().enumerate() {
        let stage = stage_value.as_object_mut().ok_or_else(|| {
            vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("stages[{index}]"),
                "Stage asset must be an object.",
                "Repair the Stage before migration.",
            )]
        })?;
        let stage_id = stage
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| {
                vec![Diagnostic::error(
                    PROJECT_SCHEMA_INVALID,
                    format!("stages[{index}].id"),
                    "Stage ID is missing or empty.",
                    "Restore a stable Stage ID before migration.",
                )]
            })?
            .to_string();
        let stage_revision = stage
            .get("revision")
            .and_then(Value::as_u64)
            .and_then(|revision| u32::try_from(revision).ok())
            .unwrap_or(1);
        let stage_name = stage
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Stage")
            .to_string();
        let patch: Vec<super::PatchDSL> = serde_json::from_value(
            stage
                .get("patch")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        )
        .map_err(|error| {
            vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                format!("stages[{index}].patch"),
                error.to_string(),
                "Repair the Stage Patch before migrating its Layout.",
            )]
        })?;
        let fixture_ids: Vec<_> = patch
            .iter()
            .flat_map(|patch| patch.id_range.0..=patch.id_range.1)
            .collect();
        let legacy_layout: super::LayoutDSL =
            serde_json::from_value(stage.remove("layout").ok_or_else(|| {
                vec![Diagnostic::error(
                    PROJECT_SCHEMA_INVALID,
                    format!("stages[{index}].layout"),
                    "Embedded Stage layout is missing.",
                    "Restore the v1 layout before migration.",
                )]
            })?)
            .map_err(|error| {
                vec![Diagnostic::error(
                    PROJECT_SCHEMA_INVALID,
                    format!("stages[{index}].layout"),
                    error.to_string(),
                    "Repair the embedded Layout before migration.",
                )]
            })?;
        let layout_id = format!("layout-{stage_id}");
        let mut layout = migrated_layout_definition(
            layout_id.clone(),
            format!("{stage_name} Layout"),
            legacy_layout,
            &fixture_ids,
        );
        layout.revision = stage_revision;
        let layout_ref = AssetRef {
            id: layout_id,
            revision: layout.revision,
        };
        stage.insert(
            "schema_version".to_string(),
            Value::from(STAGE_DOCUMENT_SCHEMA_VERSION),
        );
        stage.insert(
            "layout_ref".to_string(),
            serde_json::to_value(&layout_ref).expect("Layout ref serializes"),
        );
        stage.insert("targeting_scenes".to_string(), Value::Array(Vec::new()));
        layouts.push(serde_json::to_value(&layout).expect("Layout serializes"));
        layout_refs.push(serde_json::to_value(&layout_ref).expect("Layout ref serializes"));
        changes.push(migration_change(
            "MIGRATION_EXTRACT_LAYOUT_ASSET",
            format!("stages[{index}].layout_ref"),
            "Converted the embedded Stage layout into an exact LayoutDefinition revision; fixture IDs, coordinates, Groups, and TargetSets were preserved. Fixture size defaults to at most 12 units and gap/pitch were derived from legacy spacing.",
        ));
    }
    let manifest = object
        .get_mut("manifest")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| {
            vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                "manifest",
                "Project manifest is missing or invalid.",
                "Restore the v1 Project manifest before migration.",
            )]
        })?;
    manifest.insert(
        "schema_version".to_string(),
        Value::from(PROJECT_MANIFEST_SCHEMA_VERSION),
    );
    manifest.insert("layout_refs".to_string(), Value::Array(layout_refs));
    if let Some(cues) = object.get_mut("cues").and_then(Value::as_array_mut) {
        for cue in cues {
            if let Some(cue) = cue.as_object_mut() {
                cue.insert(
                    "schema_version".to_string(),
                    Value::from(CUE_DEFINITION_SCHEMA_VERSION),
                );
            }
        }
    }
    object.insert(
        "schema_version".to_string(),
        Value::from(PROJECT_BUNDLE_SCHEMA_VERSION),
    );
    object.insert("layouts".to_string(), Value::Array(layouts));
    changes.push(migration_change(
        "MIGRATION_PROJECT_LAYOUT_REFS",
        "manifest.layout_refs",
        "Added exact LayoutDefinition references without changing Stage, Cue, Arrangement, Published, or Live revision identities.",
    ));
    Ok(())
}

pub fn migrate_show_to_project(source: &str) -> Result<MigratedProject, Vec<Diagnostic>> {
    let loaded = load_document(source).map_err(|diagnostic| vec![diagnostic])?;
    let source_schema_version = loaded.migration_report.from_version;
    let mut changes = loaded.migration_report.changes;
    let bundle = split_v4_document(loaded.document, &mut changes);
    super::ValidatedProject::validate(bundle.clone())?;
    Ok(MigratedProject {
        bundle,
        migration_report: ProjectMigrationReport {
            source_schema_version,
            project_bundle_schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
            changes,
        },
    })
}

fn split_v4_document(
    document: ShowDocumentV4,
    changes: &mut Vec<MigrationChange>,
) -> ProjectBundle {
    let fixture_ids: Vec<_> = document
        .patch
        .iter()
        .flat_map(|patch| patch.id_range.0..=patch.id_range.1)
        .collect();
    let mut target_sets: Vec<_> = document
        .groups
        .iter()
        .map(|group| TargetSetDefinition {
            id: group.id.clone(),
            name: group.name.clone(),
            selector: TargetSetSelector::FixtureIds {
                fixture_ids: group_fixture_ids(&group.fixtures),
            },
            weights: Vec::new(),
        })
        .collect();
    if !target_sets
        .iter()
        .any(|target| target.id == MIGRATED_ALL_TARGET_ID)
    {
        target_sets.push(TargetSetDefinition {
            id: MIGRATED_ALL_TARGET_ID.to_string(),
            name: "All fixtures".to_string(),
            selector: TargetSetSelector::All,
            weights: Vec::new(),
        });
    }

    let layout = migrated_layout_definition(
        MIGRATED_LAYOUT_ID.to_string(),
        format!("{} Layout", document.meta.name),
        document.layout,
        &fixture_ids,
    );
    let layout_ref = AssetRef {
        id: layout.id.clone(),
        revision: layout.revision,
    };
    changes.push(migration_change(
        "MIGRATION_EXTRACT_LAYOUT_ASSET",
        "layouts[0]",
        "Created a versioned default LayoutDefinition and preserved the legacy coordinates, fixture order, and generator parameters.",
    ));

    let stage = StageDocument {
        schema_version: STAGE_DOCUMENT_SCHEMA_VERSION,
        id: MIGRATED_STAGE_ID.to_string(),
        revision: 1,
        name: document.meta.name.clone(),
        patch: document.patch,
        layout_ref: layout_ref.clone(),
        groups: document.groups,
        target_sets,
        targeting_scenes: Vec::new(),
    };
    changes.push(migration_change(
        "MIGRATION_SPLIT_STAGE_ASSET",
        "stage",
        "Moved Patch, Layout, Fixture Groups, and deterministic TargetSets into the default Stage revision.",
    ));

    let effects: Vec<_> = document
        .effect_definitions
        .into_iter()
        .map(|effect| EffectDefinitionDocument {
            schema_version: EFFECT_DEFINITION_SCHEMA_VERSION,
            id: effect.id,
            name: effect.name,
            revision: effect.revision,
            source: effect.source,
            parameters: effect.parameters,
            graph: effect.graph,
            catalog: effect.catalog,
        })
        .collect();
    changes.push(migration_change(
        "MIGRATION_SPLIT_EFFECT_ASSETS",
        "effects",
        "Preserved each EffectDefinition ID, revision, graph, parameter contract, and catalog without target ownership.",
    ));

    let timeline = document.timeline;
    let nominal_lengths = migrated_nominal_lengths(timeline.as_ref(), &document.effect_instances);
    let cues: Vec<_> = document
        .effect_instances
        .iter()
        .map(|instance| {
            let effect = effects.iter().find(|effect| {
                effect.id == instance.definition_id
                    && effect.revision == instance.definition_revision
            });
            CueDefinition {
                schema_version: CUE_DEFINITION_SCHEMA_VERSION,
                id: instance.id.clone(),
                revision: 1,
                name: effect.map_or_else(|| instance.id.clone(), |effect| effect.name.clone()),
                compatible_stage_ref: AssetRef {
                    id: stage.id.clone(),
                    revision: stage.revision,
                },
                nominal_length_ticks: nominal_lengths
                    .get(instance.id.as_str())
                    .copied()
                    .unwrap_or(3_840),
                layers: vec![CueLayer {
                    id: MIGRATED_LAYER_ID.to_string(),
                    effect_ref: AssetRef {
                        id: instance.definition_id.clone(),
                        revision: instance.definition_revision,
                    },
                    target_set_ref: TargetSetRef {
                        stage_id: stage.id.clone(),
                        stage_revision: stage.revision,
                        target_set_id: instance.target_group_id.clone(),
                    },
                    targeting_scene_ref: None,
                    parameter_overrides: instance.parameter_overrides.clone(),
                    phase: 0.0,
                    seed: instance.seed.clone(),
                    layer: 0,
                    priority: 0,
                    mix_overrides: Vec::new(),
                    trigger_policy: timeline_trigger_policy(),
                }],
                automation_lanes: Vec::new(),
                trigger_policy: timeline_trigger_policy(),
                capability_summary: CueCapabilitySummary {
                    required_attributes: effect
                        .map(|effect| effect.catalog.required_attributes.clone())
                        .unwrap_or_default(),
                },
                risk_summary: CueRiskSummary {
                    strobe_risk: effect
                        .map(|effect| effect.catalog.strobe_risk)
                        .unwrap_or(super::StrobeRiskDSL::None),
                },
            }
        })
        .collect();
    changes.push(migration_change(
        "MIGRATION_EFFECT_INSTANCES_TO_CUES",
        "cues",
        "Converted each target-bound EffectInstance into a single-layer Cue pinned to its Effect and Stage revisions.",
    ));

    let (ppq, tempo_map, tracks) = if let Some(timeline) = timeline {
        let tracks = timeline
            .tracks
            .into_iter()
            .map(|track| {
                let clips: Vec<_> = track
                    .clips
                    .iter()
                    .map(|clip| CueClip {
                        id: clip.id.clone(),
                        cue_ref: AssetRef {
                            id: clip.instance_id.clone(),
                            revision: 1,
                        },
                        start_tick: clip.start_tick,
                        duration_tick: clip.duration_tick,
                        source_offset_tick: clip.source_offset_tick,
                        playback: clip.playback,
                        layer: clip.layer,
                        layer_overrides: Vec::new(),
                    })
                    .collect();
                let mut automation_lanes = Vec::new();
                for lane in track.automation_lanes {
                    match lane.target {
                        super::AutomationTargetV3DSL::Global { parameter_id } => {
                            automation_lanes.push(ArrangementAutomationLane {
                                id: lane.id,
                                target: ArrangementAutomationTarget::Global { parameter_id },
                                keyframes: lane.keyframes,
                            });
                        }
                        super::AutomationTargetV3DSL::EffectInstance {
                            instance_id,
                            parameter_id,
                        } => {
                            let matching_clips: Vec<_> = clips
                                .iter()
                                .filter(|clip| clip.cue_ref.id == instance_id)
                                .collect();
                            if matching_clips.is_empty() {
                                changes.push(migration_change(
                                    "MIGRATION_DROP_UNBOUND_AUTOMATION",
                                    format!("automation.{}", lane.id),
                                    "Dropped an EffectInstance automation lane with no CueClip occurrence.",
                                ));
                            }
                            for clip in matching_clips {
                                automation_lanes.push(ArrangementAutomationLane {
                                    id: format!("{}-{}", lane.id, clip.id),
                                    target: ArrangementAutomationTarget::CueLayer {
                                        clip_id: clip.id.clone(),
                                        layer_id: MIGRATED_LAYER_ID.to_string(),
                                        parameter_id: parameter_id.clone(),
                                    },
                                    keyframes: lane.keyframes.clone(),
                                });
                            }
                        }
                    }
                }
                CueTrack {
                    id: track.id,
                    name: track.name,
                    overlap_policy: track.overlap_policy,
                    clips,
                    automation_lanes,
                }
            })
            .collect();
        (timeline.ppq, timeline.tempo_map, tracks)
    } else {
        (
            960,
            super::TempoMapDSL {
                points: vec![super::TempoPointDSL {
                    time_tick: 0,
                    bpm: 120.0,
                }],
            },
            vec![CueTrack {
                id: "cues".to_string(),
                name: "Cues".to_string(),
                overlap_policy: super::OverlapPolicyDSL::Layer,
                clips: Vec::new(),
                automation_lanes: Vec::new(),
            }],
        )
    };
    let length_ticks = arrangement_length(ppq, &tracks);
    let arrangement = ArrangementDocument {
        schema_version: ARRANGEMENT_DOCUMENT_SCHEMA_VERSION,
        id: MIGRATED_ARRANGEMENT_ID.to_string(),
        revision: 1,
        name: "Main Arrangement".to_string(),
        ppq,
        tempo_map,
        time_signatures: vec![TimeSignaturePoint {
            time_tick: 0,
            numerator: 4,
            denominator: 4,
        }],
        length_ticks,
        tracks,
        markers: Vec::new(),
    };
    changes.push(migration_change(
        "MIGRATION_TIMELINE_TO_ARRANGEMENT_ASSET",
        "arrangements[0]",
        "Moved TempoMap, PPQ, CueClip tracks, and typed automation into the default Arrangement without changing ticks.",
    ));

    let effect_refs = effects
        .iter()
        .map(|effect| AssetRef {
            id: effect.id.clone(),
            revision: effect.revision,
        })
        .collect();
    let cue_refs = cues
        .iter()
        .map(|cue| AssetRef {
            id: cue.id.clone(),
            revision: cue.revision,
        })
        .collect();
    ProjectBundle {
        schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
        manifest: ProjectManifest {
            schema_version: PROJECT_MANIFEST_SCHEMA_VERSION,
            project_id: MIGRATED_PROJECT_ID.to_string(),
            revision: 1,
            name: document.meta.name,
            stage_ref: AssetRef {
                id: stage.id.clone(),
                revision: stage.revision,
            },
            layout_refs: vec![layout_ref],
            effect_refs,
            cue_refs,
            arrangement_refs: vec![AssetRef {
                id: arrangement.id.clone(),
                revision: arrangement.revision,
            }],
            active_arrangement_id: arrangement.id.clone(),
        },
        stages: vec![stage],
        layouts: vec![layout],
        effects,
        cues,
        arrangements: vec![arrangement],
    }
}

fn group_fixture_ids(fixtures: &GroupFixturesDSL) -> Vec<u32> {
    match fixtures {
        GroupFixturesDSL::List(fixtures) => fixtures.clone(),
        GroupFixturesDSL::Range(range) => (range.range.0..=range.range.1).collect(),
    }
}

fn migrated_nominal_lengths(
    timeline: Option<&super::TimelineV4DSL>,
    instances: &[super::EffectInstanceDSL],
) -> BTreeMap<String, u32> {
    let mut lengths: BTreeMap<_, _> = instances
        .iter()
        .map(|instance| (instance.id.clone(), 3_840))
        .collect();
    if let Some(timeline) = timeline {
        for clip in timeline.tracks.iter().flat_map(|track| &track.clips) {
            lengths
                .entry(clip.instance_id.clone())
                .and_modify(|length| *length = (*length).max(clip.duration_tick));
        }
    }
    lengths
}

fn arrangement_length(ppq: u32, tracks: &[CueTrack]) -> u32 {
    let minimum = ppq.saturating_mul(16);
    tracks.iter().fold(minimum, |length, track| {
        let clip_end = track
            .clips
            .iter()
            .map(|clip| clip.start_tick.saturating_add(clip.duration_tick))
            .max()
            .unwrap_or(0);
        let automation_end = track
            .automation_lanes
            .iter()
            .flat_map(|lane| &lane.keyframes)
            .map(|keyframe| keyframe.time_tick)
            .max()
            .unwrap_or(0);
        length.max(clip_end).max(automation_end)
    })
}

const fn timeline_trigger_policy() -> CueTriggerPolicy {
    CueTriggerPolicy {
        mode: CueTriggerMode::Timeline,
        quantize: CueQuantize::Beat,
        one_shot_ticks: None,
    }
}

fn migration_change(
    code: impl Into<String>,
    path: impl Into<String>,
    message: impl Into<String>,
) -> MigrationChange {
    MigrationChange {
        code: code.into(),
        path: path.into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_v4_into_independent_assets_without_moving_timeline_ticks() {
        let source = r##"{
          "schema_version": 4,
          "meta": { "name": "Legacy V4" },
          "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 4] }],
          "layout": { "type": "generator", "generator": { "shape": "matrix", "rows": 2, "columns": 2, "spacing": 1 } },
          "groups": [{ "id": "all", "name": "All", "fixtures": { "range": [1, 4] } }],
          "effect_definitions": [{
            "id": "pulse", "name": "Pulse", "revision": 3, "source": "project_local",
            "parameters": [],
            "graph": { "nodes": [
              { "type": "constant", "id": "value", "value": { "type": "scalar", "value": 0.5 } },
              { "type": "attribute_writer", "id": "output", "input": { "node_id": "value", "port": "scalar" }, "attribute_id": "intensity" }
            ] },
            "catalog": { "energy": 0.5, "density": 0.5, "motion": "pulse", "colorfulness": 0.0, "strobe_risk": "none", "required_attributes": ["intensity"] }
          }],
          "effect_instances": [{ "id": "pulse-look", "definition_id": "pulse", "definition_revision": 3, "target_group_id": "all", "seed": "0000000000000001" }],
          "timeline": {
            "ppq": 960,
            "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128 }, { "time_tick": 7680, "bpm": 96 }] },
            "tracks": [{ "id": "looks", "name": "Looks", "overlap_policy": "layer", "clips": [{
              "id": "clip-1", "instance_id": "pulse-look", "start_tick": 1920, "duration_tick": 3840
            }] }]
          }
        }"##;
        let migrated = migrate_show_to_project(source).expect("V4 migration");

        assert_eq!(migrated.bundle.stages.len(), 1);
        assert_eq!(migrated.bundle.layouts.len(), 1);
        assert_eq!(
            migrated.bundle.stages[0].layout_ref,
            migrated.bundle.manifest.layout_refs[0]
        );
        assert_eq!(migrated.bundle.effects[0].revision, 3);
        assert_eq!(migrated.bundle.cues[0].layers[0].effect_ref.revision, 3);
        assert_eq!(migrated.bundle.arrangements[0].tempo_map.points.len(), 2);
        assert_eq!(
            migrated.bundle.arrangements[0].tracks[0].clips[0].start_tick,
            1920
        );
        assert_eq!(
            migrated.bundle.arrangements[0].tracks[0].clips[0].duration_tick,
            3840
        );
        assert!(migrated
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_EFFECT_INSTANCES_TO_CUES"));
    }

    #[test]
    fn migrates_v1_through_v4_before_splitting_the_project() {
        let source = r##"{
          "schema_version": 1,
          "meta": { "name": "Legacy V1" },
          "patch": [{ "type": "pixel", "id_range": [1, 1] }],
          "layout": { "type": "generator", "generator": { "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1 } },
          "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
          "phasers": [{
            "id": "pulse", "name": "Pulse", "target": "all", "steps": [{ "values": { "dimmer": 1, "color": "#ffffff" } }],
            "phase": { "mode": "spread", "spread": { "from": 0, "to": 0 } }
          }]
        }"##;
        let migrated = migrate_show_to_project(source).expect("V1 migration");

        assert_eq!(migrated.migration_report.source_schema_version, Some(1));
        assert_eq!(migrated.bundle.cues.len(), 1);
        assert_eq!(migrated.bundle.arrangements.len(), 1);
        assert!(migrated
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_SCHEMA_V3_TO_V4"));
    }

    #[test]
    fn migrates_project_v1_embedded_layout_with_an_explicit_report() {
        let current = crate::document::valid_bundle();
        let legacy_layout =
            crate::document::layout_to_legacy(&current.layouts[0], &(1..=4).collect::<Vec<_>>());
        let mut value = serde_json::to_value(&current).expect("current bundle serializes");
        value["schema_version"] = serde_json::json!(1);
        value["manifest"]["schema_version"] = serde_json::json!(1);
        value["manifest"]
            .as_object_mut()
            .expect("manifest object")
            .remove("layout_refs");
        value["stages"][0]["schema_version"] = serde_json::json!(1);
        value["stages"][0]["layout"] =
            serde_json::to_value(legacy_layout).expect("legacy layout serializes");
        value["stages"][0]
            .as_object_mut()
            .expect("stage object")
            .remove("layout_ref");
        value["stages"][0]
            .as_object_mut()
            .expect("stage object")
            .remove("targeting_scenes");
        value["cues"][0]["schema_version"] = serde_json::json!(1);
        value
            .as_object_mut()
            .expect("bundle object")
            .remove("layouts");

        let migrated = migrate_project_bundle(&value.to_string()).expect("Project v1 migration");

        assert_eq!(migrated.migration_report.source_schema_version, Some(1));
        assert_eq!(migrated.bundle.schema_version, 2);
        assert_eq!(
            migrated.bundle.stages[0].patch[0].id_range,
            current.stages[0].patch[0].id_range
        );
        assert_eq!(
            migrated.bundle.stages[0].groups.len(),
            current.stages[0].groups.len()
        );
        assert_eq!(
            migrated.bundle.stages[0].target_sets.len(),
            current.stages[0].target_sets.len()
        );
        assert!(migrated
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_EXTRACT_LAYOUT_ASSET"));
    }
}

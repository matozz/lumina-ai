use lumina_ai_lib::compiler::{parser::ShowDSL, Compiler};
use lumina_ai_lib::document::load_document;
use lumina_ai_lib::engine::effect::SPEED_PARAMETER_ID;
use lumina_ai_lib::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use std::fs;
use std::path::PathBuf;

#[test]
fn all_templates_render_deterministically_with_the_stage_one_renderer() {
    let template_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/editor/templates");
    let mut paths: Vec<_> = fs::read_dir(template_dir)
        .expect("template directory")
        .map(|entry| entry.expect("template entry").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    paths.sort();
    assert_eq!(paths.len(), 18, "template inventory changed");

    for path in paths {
        let source = fs::read_to_string(&path).expect("template source");
        let loaded = load_document(&source).expect("template document");
        assert!(loaded.migration_report.changes.is_empty());
        let dsl: ShowDSL = loaded.document;
        let show = Compiler::compile_document(dsl).expect("template compile");
        let time = RenderTime { beat: 8.25 };

        let timeline_frame = render_at(&show, time, RenderSource::Timeline);
        assert_eq!(
            timeline_frame,
            render_at(&show, time, RenderSource::Timeline)
        );
        assert_eq!(timeline_frame.len(), show.fixtures.len());
        assert_eq!(
            timeline_frame
                .iter()
                .map(|output| output.id)
                .collect::<Vec<_>>(),
            show.fixtures
                .iter()
                .map(|fixture| fixture.id)
                .collect::<Vec<_>>()
        );

        let live: Vec<_> = show
            .effect_instances
            .values()
            .map(|instance| LivePhaser {
                id: instance.id.clone(),
                start_beat: 0.0,
                phase_offset: 0.0,
                multiplier: show.effect_definitions[instance.definition.index()]
                    .parameter_handle(SPEED_PARAMETER_ID)
                    .and_then(|handle| {
                        instance
                            .resolve_parameter(
                                &show.effect_definitions[instance.definition.index()],
                                handle,
                            )
                            .and_then(|value| value.as_scalar())
                    })
                    .unwrap_or(1.0),
            })
            .collect();
        let live_frame = render_at(&show, time, RenderSource::Live(&live));
        assert_eq!(
            live_frame,
            render_at(&show, time, RenderSource::Live(&live))
        );
        assert_eq!(live_frame.len(), show.fixtures.len());
    }
}

#[test]
fn all_templates_preserve_frames_across_v2_to_v4_effect_migration() {
    let template_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/editor/templates");
    let mut paths: Vec<_> = fs::read_dir(template_dir)
        .expect("template directory")
        .map(|entry| entry.expect("template entry").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    paths.sort();
    assert_eq!(paths.len(), 18, "template inventory changed");

    for path in paths {
        let source = fs::read_to_string(&path).expect("template source");
        let current = load_document(&source).expect("current V4 template");
        let instance_ids: Vec<_> = current
            .document
            .effect_instances
            .iter()
            .map(|instance| instance.id.clone())
            .collect();
        let current_show = Compiler::compile_document(current.document).expect("current compile");
        let legacy_source = downgrade_canonical_v4_to_v2(&source);
        let migrated = load_document(&legacy_source).expect("derived V2 migration");
        assert!(migrated
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_SCHEMA_V2_TO_V3"));
        assert!(migrated
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_SCHEMA_V3_TO_V4"));
        let migrated_show =
            Compiler::compile_document(migrated.document).expect("migrated V2 compile");

        for instance_id in &instance_ids {
            for phase in [0.0, 0.25, 0.5, 0.75, 1.25] {
                let live = [LivePhaser {
                    id: instance_id.clone(),
                    start_beat: 0.0,
                    phase_offset: phase,
                    multiplier: 1.0,
                }];
                let time = RenderTime { beat: 0.0 };
                assert_eq!(
                    render_at(&current_show, time, RenderSource::Live(&live)),
                    render_at(&migrated_show, time, RenderSource::Live(&live)),
                    "{} instance {instance_id} phase {phase}",
                    path.display()
                );
            }
        }
    }
}

fn downgrade_canonical_v4_to_v2(source: &str) -> String {
    let mut document: serde_json::Value = serde_json::from_str(source).expect("V4 JSON");
    let definitions = document["effect_definitions"]
        .as_array()
        .expect("effect definitions")
        .clone();
    let instances = document["effect_instances"]
        .as_array()
        .expect("effect instances")
        .clone();
    let phasers: Vec<_> = instances
        .iter()
        .map(|instance| {
            let definition = definitions
                .iter()
                .find(|definition| definition["id"] == instance["definition_id"])
                .expect("pinned definition");
            let nodes = definition["graph"]["nodes"]
                .as_array()
                .expect("graph nodes");
            let sequence = nodes
                .iter()
                .find(|node| node["type"] == "step_sequence")
                .expect("canonical step sequence");
            let spatial = nodes
                .iter()
                .find(|node| node["type"] == "spatial_phase")
                .expect("canonical spatial phase");
            let speed = instance["parameter_overrides"]["speed"]["value"]
                .as_f64()
                .or_else(|| {
                    definition["parameters"]
                        .as_array()?
                        .iter()
                        .find(|parameter| parameter["id"] == "speed")?["default_value"]["value"]
                        .as_f64()
                })
                .unwrap_or(1.0);
            let from = spatial["from"].as_f64().unwrap_or(0.0) * 100.0;
            let to = spatial["to"].as_f64().unwrap_or(0.0) * 100.0;
            let phase = spatial["group_size"].as_u64().map_or_else(
                || {
                    serde_json::json!({
                        "mode": "spread",
                        "spread": { "from": from, "to": to }
                    })
                },
                |group_size| {
                    serde_json::json!({
                        "mode": "grouped",
                        "grouped": { "group_size": group_size, "spread": [from, to] }
                    })
                },
            );
            serde_json::json!({
                "id": instance["id"],
                "name": definition["name"],
                "target": instance["target_group_id"],
                "multiplier": speed,
                "steps": sequence["steps"],
                "phase": phase
            })
        })
        .collect();
    let object = document.as_object_mut().expect("show object");
    object.insert("schema_version".to_string(), serde_json::Value::from(2));
    object.insert("phasers".to_string(), serde_json::Value::Array(phasers));
    object.remove("effect_definitions");
    object.remove("effect_instances");
    object.remove("timeline");
    serde_json::to_string(&document).expect("derived V2 JSON")
}

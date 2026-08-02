use lumina_ai_lib::compiler::diagnostic::{
    DOC_EFFECT_GRAPH_INVALID, DOC_FIXTURE_REFERENCE_NOT_FOUND, DOC_FORMULA_INVALID,
    DOC_INVALID_COLOR, DOC_INVALID_PHASE_CONFIG, DOC_INVALID_RANGE, DOC_PARAMETER_INVALID,
    DOC_PROFILE_NOT_FOUND, DOC_SVG_PATH_INVALID, DOC_TIMELINE_TARGET_INVALID,
};
use lumina_ai_lib::compiler::Compiler;
use lumina_ai_lib::document::{
    load_document, AutomationLaneDSL, AutomationTargetV3DSL, GlobalParameterDSL, KeyframeDSL,
    KeyframeInterpolationDSL, OverlapPolicyDSL, ParameterValueDSL,
};

const VALID_DOCUMENT: &str = r##"{
  "schema_version": 2,
  "meta": { "name": "Strict contract" },
  "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 2] }],
  "layout": {
    "type": "generator",
    "generator": {
      "shape": "custom",
      "fixtures": [
        { "id": 1, "x": 0.0, "y": 0.0 },
        { "id": 2, "x": 1.0, "y": 0.0 }
      ]
    }
  },
  "groups": [{ "id": "all", "name": "All", "fixtures": [1, 2] }],
  "phasers": [{
    "id": "pulse",
    "name": "Pulse",
    "target": "all",
    "steps": [{ "values": { "color": "#ff0000", "dimmer": 1.0 } }],
    "phase": { "mode": "spread", "spread": { "from": 0.0, "to": 100.0 } }
  }],
  "timeline": {
    "events": [{
      "beat": 0.0,
      "duration": 1.0,
      "action": { "type": "phaser", "phaser": "pulse" }
    }]
  }
}"##;

#[test]
fn rejects_bad_color_reference_range_and_formula_with_stable_diagnostics() {
    let cases = [
        (
            VALID_DOCUMENT.replace("#ff0000", "red"),
            DOC_INVALID_COLOR,
        ),
        (
            VALID_DOCUMENT.replace("generic-rgb", "unknown-profile"),
            DOC_PROFILE_NOT_FOUND,
        ),
        (
            VALID_DOCUMENT.replace("\"fixtures\": [1, 2]", "\"fixtures\": [1, 99]"),
            DOC_FIXTURE_REFERENCE_NOT_FOUND,
        ),
        (
            VALID_DOCUMENT.replace("\"dimmer\": 1.0", "\"dimmer\": 1.5"),
            DOC_INVALID_RANGE,
        ),
        (
            VALID_DOCUMENT.replace(
                "\"shape\": \"custom\",\n      \"fixtures\": [\n        { \"id\": 1, \"x\": 0.0, \"y\": 0.0 },\n        { \"id\": 2, \"x\": 1.0, \"y\": 0.0 }\n      ]",
                "\"shape\": \"formula\", \"formula\": { \"x\": \"sin(\", \"y\": \"t\", \"t_range\": [0, 1], \"count\": 2 }",
            ),
            DOC_FORMULA_INVALID,
        ),
    ];

    for (source, expected_code) in cases {
        let loaded = load_document(&source).expect("case must satisfy the structural schema");
        let diagnostics = compile_errors(loaded.document);
        assert!(
            diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == expected_code),
            "missing {expected_code}: {diagnostics:?}"
        );
    }
}

#[test]
fn rejects_mismatched_phase_payload_before_compilation() {
    let source = VALID_DOCUMENT.replace(
        "\"mode\": \"spread\", \"spread\": { \"from\": 0.0, \"to\": 100.0 }",
        "\"mode\": \"spread\", \"grouped\": { \"group_size\": 1, \"spread\": [0, 100] }",
    );
    let diagnostic = load_document(&source).expect_err("tagged phase payload must be rejected");

    assert_eq!(diagnostic.code, DOC_INVALID_PHASE_CONFIG);
    assert_eq!(diagnostic.path, "phasers[0].phase");
}

#[test]
fn reports_svg_layout_instead_of_silently_falling_back() {
    let source = VALID_DOCUMENT.replace(
        "\"shape\": \"custom\",\n      \"fixtures\": [\n        { \"id\": 1, \"x\": 0.0, \"y\": 0.0 },\n        { \"id\": 2, \"x\": 1.0, \"y\": 0.0 }\n      ]",
        "\"shape\": \"svg_path\", \"svgPath\": { \"d\": \"M 0 0 L 1 0\", \"sample_count\": 2 }",
    );
    let loaded = load_document(&source).expect("SVG document is structurally valid");
    let diagnostics = compile_errors(loaded.document);

    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == DOC_SVG_PATH_INVALID));
}

fn compile_errors(
    document: lumina_ai_lib::document::ShowDocumentV4,
) -> Vec<lumina_ai_lib::compiler::diagnostic::Diagnostic> {
    match Compiler::compile_document(document) {
        Ok(_) => panic!("document must not compile"),
        Err(diagnostics) => diagnostics,
    }
}

#[test]
fn arbitrary_json_and_semantic_mutations_never_panic() {
    let mut state = 0x4d595df4d0f33173_u64;
    for length in 0..512 {
        let mut bytes = Vec::with_capacity(length);
        for _ in 0..length {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            bytes.push((state >> 56) as u8);
        }
        let source = String::from_utf8_lossy(&bytes);
        let result = std::panic::catch_unwind(|| {
            if let Ok(loaded) = load_document(&source) {
                let _ = Compiler::compile_document(loaded.document);
            }
        });
        assert!(result.is_ok(), "input of length {length} panicked");
    }

    for mutation in [
        VALID_DOCUMENT.replace("[1, 2]", "[4294967295, 0]"),
        VALID_DOCUMENT.replace("\"group_size\": 1", "\"group_size\": 0"),
        VALID_DOCUMENT.replace("\"to\": 100.0", "\"to\": 1e999"),
        VALID_DOCUMENT.replace("#ff0000", "#💡"),
    ] {
        let result = std::panic::catch_unwind(|| {
            if let Ok(loaded) = load_document(&mutation) {
                let _ = Compiler::compile_document(loaded.document);
            }
        });
        assert!(result.is_ok(), "semantic mutation panicked");
    }
}

#[test]
fn rejects_invalid_typed_parameters_ports_and_graph_cycles() {
    let mut wrong_default = load_document(VALID_DOCUMENT)
        .expect("valid source")
        .document;
    wrong_default.effect_definitions[0].parameters[0].default_value =
        lumina_ai_lib::document::ParameterValueDSL::Color("#ffffff".to_string());
    assert!(compile_errors(wrong_default)
        .iter()
        .any(|diagnostic| diagnostic.code == DOC_PARAMETER_INVALID));

    let mut wrong_port = load_document(VALID_DOCUMENT)
        .expect("valid source")
        .document;
    if let lumina_ai_lib::document::EffectNodeDSL::StepSequence { phase, .. } =
        &mut wrong_port.effect_definitions[0].graph.nodes[2]
    {
        phase.port = lumina_ai_lib::document::EffectPortDSL::Color;
    }
    assert!(compile_errors(wrong_port)
        .iter()
        .any(|diagnostic| diagnostic.code == DOC_EFFECT_GRAPH_INVALID));

    let mut cycle = load_document(VALID_DOCUMENT)
        .expect("valid source")
        .document;
    let reference = |node_id: &str| lumina_ai_lib::document::EffectPortRefDSL {
        node_id: node_id.to_string(),
        port: lumina_ai_lib::document::EffectPortDSL::Scalar,
    };
    cycle.effect_definitions[0].graph.nodes.extend([
        lumina_ai_lib::document::EffectNodeDSL::Map {
            id: "cycle-a".to_string(),
            input: reference("cycle-b"),
            input_range: (0.0, 1.0),
            output_range: (0.0, 1.0),
        },
        lumina_ai_lib::document::EffectNodeDSL::Map {
            id: "cycle-b".to_string(),
            input: reference("cycle-a"),
            input_range: (0.0, 1.0),
            output_range: (0.0, 1.0),
        },
    ]);
    assert!(compile_errors(cycle)
        .iter()
        .any(|diagnostic| diagnostic.code == DOC_EFFECT_GRAPH_INVALID));
}

#[test]
fn validates_multi_keyframes_and_preserves_layered_overlaps() {
    let mut document = load_document(VALID_DOCUMENT)
        .expect("valid source")
        .document;
    let timeline = document.timeline.as_mut().expect("timeline");
    let effect_track = &mut timeline.tracks[0];
    effect_track.overlap_policy = OverlapPolicyDSL::Layer;
    let mut second_clip = effect_track.clips[0].clone();
    second_clip.id = "second-layer".to_string();
    second_clip.start_tick = 480;
    effect_track.clips.push(second_clip);
    effect_track.automation_lanes.push(AutomationLaneDSL {
        id: "master-dimmer".to_string(),
        target: AutomationTargetV3DSL::Global {
            parameter_id: GlobalParameterDSL::MasterDimmer,
        },
        keyframes: vec![
            KeyframeDSL {
                id: "master-0".to_string(),
                time_tick: 0,
                value: ParameterValueDSL::Scalar(0.0),
                interpolation: KeyframeInterpolationDSL::EaseIn,
                in_tangent: None,
                out_tangent: None,
            },
            KeyframeDSL {
                id: "master-1".to_string(),
                time_tick: 480,
                value: ParameterValueDSL::Scalar(0.25),
                interpolation: KeyframeInterpolationDSL::Bezier,
                in_tangent: None,
                out_tangent: None,
            },
            KeyframeDSL {
                id: "master-2".to_string(),
                time_tick: 960,
                value: ParameterValueDSL::Scalar(1.0),
                interpolation: KeyframeInterpolationDSL::Hold,
                in_tangent: None,
                out_tangent: None,
            },
        ],
    });
    let before = serde_json::to_value(&document).expect("serialize before compile");

    Compiler::compile_document(document.clone()).expect("layered arrangement compiles");

    assert_eq!(
        serde_json::to_value(&document).expect("serialize after compile"),
        before,
        "compilation must not trim or move overlapping clips",
    );
    assert_eq!(
        document.timeline.unwrap().tracks[0].clips.len(),
        2,
        "both layered clips remain in the source arrangement",
    );
}

#[test]
fn reject_overlap_policy_fails_closed_without_rewriting_clips() {
    let mut document = load_document(VALID_DOCUMENT)
        .expect("valid source")
        .document;
    let track = &mut document.timeline.as_mut().expect("timeline").tracks[0];
    track.overlap_policy = OverlapPolicyDSL::Reject;
    let mut second_clip = track.clips[0].clone();
    second_clip.id = "rejected-overlap".to_string();
    second_clip.start_tick = 480;
    track.clips.push(second_clip);
    let original_starts: Vec<_> = track.clips.iter().map(|clip| clip.start_tick).collect();

    let diagnostics = compile_errors(document.clone());

    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == DOC_TIMELINE_TARGET_INVALID));
    assert_eq!(
        document.timeline.unwrap().tracks[0]
            .clips
            .iter()
            .map(|clip| clip.start_tick)
            .collect::<Vec<_>>(),
        original_starts,
    );
}

#[test]
fn rejects_multiple_automation_lanes_for_one_typed_target() {
    let mut document = load_document(VALID_DOCUMENT)
        .expect("valid source")
        .document;
    let lane = AutomationLaneDSL {
        id: "master-a".to_string(),
        target: AutomationTargetV3DSL::Global {
            parameter_id: GlobalParameterDSL::MasterDimmer,
        },
        keyframes: vec![KeyframeDSL {
            id: "master-a-0".to_string(),
            time_tick: 0,
            value: ParameterValueDSL::Scalar(1.0),
            interpolation: KeyframeInterpolationDSL::Hold,
            in_tangent: None,
            out_tangent: None,
        }],
    };
    let track = &mut document.timeline.as_mut().expect("timeline").tracks[0];
    track.automation_lanes.push(lane.clone());
    track.automation_lanes.push(AutomationLaneDSL {
        id: "master-b".to_string(),
        keyframes: vec![KeyframeDSL {
            id: "master-b-0".to_string(),
            ..lane.keyframes[0].clone()
        }],
        ..lane
    });

    assert!(compile_errors(document)
        .iter()
        .any(|diagnostic| diagnostic.code == DOC_TIMELINE_TARGET_INVALID));
}

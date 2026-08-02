use lumina_ai_lib::compiler::diagnostic::{
    DOC_FIXTURE_REFERENCE_NOT_FOUND, DOC_FORMULA_INVALID, DOC_INVALID_COLOR,
    DOC_INVALID_PHASE_CONFIG, DOC_INVALID_RANGE, DOC_SVG_PATH_INVALID,
};
use lumina_ai_lib::compiler::Compiler;
use lumina_ai_lib::document::load_document;

const VALID_DOCUMENT: &str = r##"{
  "schema_version": 1,
  "meta": { "name": "Strict contract" },
  "patch": [{ "type": "pixel", "id_range": [1, 2] }],
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
    document: lumina_ai_lib::document::ShowDocumentV1,
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

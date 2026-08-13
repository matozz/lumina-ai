use lumina_ai_lib::compiler::diagnostic::{CATALOG_METADATA_INVALID, PROJECT_REFERENCE_NOT_FOUND};
use lumina_ai_lib::document::{
    builtin_production_catalog, production_catalog_compatibility, production_catalog_golden,
    validate_production_catalog, validate_production_catalog_runtime, StrobeRiskDSL,
};

#[test]
fn checked_in_multi_tick_golden_matches_deterministic_rendering() {
    let catalog = builtin_production_catalog().expect("catalog parses");
    assert!(catalog
        .layouts
        .iter()
        .any(|layout| layout.id == "builtin.layout.matrix-main-20x20"));
    assert!(catalog
        .arrangements
        .iter()
        .any(|arrangement| arrangement.id == "builtin.arrangement.house-128"));
    assert!(catalog
        .effects
        .iter()
        .any(|effect| effect.id == "builtin.spatial.column-ping-pong"));
    assert!(catalog
        .effects
        .iter()
        .any(|effect| effect.id == "builtin.spatial.column-rain"));
    assert!(!catalog
        .effects
        .iter()
        .any(|effect| effect.id == "builtin.intensity.pulse"));
    assert!(catalog.project_templates.iter().any(|template| {
        template.id == "builtin.project-template.authoring-starter"
            && template.stage.patch[0].id_range == (1, 400)
            && template.arrangement_ref.id == "builtin.arrangement.house-128"
            && template.cues.is_empty()
    }));
    let actual =
        production_catalog_golden(&catalog).expect("catalog compiles at every golden tick");
    let actual: serde_json::Value =
        serde_json::from_str(&serde_json::to_string(&actual).expect("generated golden serializes"))
            .expect("generated golden round-trips");
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/production_catalog_golden_v1.json"))
            .expect("checked-in golden parses");
    assert_eq!(actual, expected);
}

#[test]
fn starter_base_assets_keep_targeting_in_resolved_cue_layers() {
    let catalog = builtin_production_catalog().expect("catalog parses");
    let template = catalog
        .project_templates
        .iter()
        .find(|template| template.id == "builtin.project-template.authoring-starter")
        .expect("authoring starter template");
    assert!(template.cues.is_empty());
    for target_id in ["zone-2x2-1", "zone-2x2-2", "zone-2x2-3", "zone-2x2-4"] {
        assert!(
            template
                .stage
                .target_sets
                .iter()
                .any(|target_set| target_set.id == target_id),
            "missing selectable {target_id}"
        );
    }
    for target_id in ["zone-4x4-1", "zone-4x4-4", "zone-4x4-13", "zone-4x4-16"] {
        assert!(
            template
                .stage
                .target_sets
                .iter()
                .any(|target_set| target_set.id == target_id),
            "missing selectable {target_id}"
        );
    }
    assert_eq!(catalog.arrangements.len(), 1);
    let base = &catalog.arrangements[0];
    assert_eq!(base.id, "builtin.arrangement.house-128");
    assert_eq!(base.tempo_map.points[0].bpm, 128.0);
    assert!(base.tracks[0].clips.is_empty());
}

#[test]
fn catalog_validation_checks_materialized_project_dependencies() {
    let mut catalog = builtin_production_catalog().expect("catalog parses");
    catalog.project_templates[0].arrangement_ref.id = "missing.arrangement".to_string();

    let diagnostics = validate_production_catalog(&catalog);
    assert!(diagnostics.iter().any(|diagnostic| {
        diagnostic.code == PROJECT_REFERENCE_NOT_FOUND
            && diagnostic.path.contains("materialized_project")
            && diagnostic.path.contains("arrangement")
    }));
}

#[test]
fn checked_in_layout_compatibility_matrix_covers_all_production_effects() {
    let catalog = builtin_production_catalog().expect("catalog parses");
    let actual = production_catalog_compatibility(&catalog);
    let expected: serde_json::Value = serde_json::from_str(include_str!(
        "../../catalog/production-compatibility-v1.json"
    ))
    .expect("checked-in compatibility matrix parses");
    assert_eq!(actual, expected);
    assert_eq!(actual["layouts"].as_array().map(Vec::len), Some(4));
    assert_eq!(
        actual["effects"].as_array().map(Vec::len),
        Some(catalog.effects.len())
    );
}

#[test]
fn runtime_validation_rejects_underdeclared_strobe_risk() {
    let mut catalog = builtin_production_catalog().expect("catalog parses");
    let strobe = catalog
        .effects
        .iter_mut()
        .find(|effect| effect.id == "builtin.strobe.safe-pulse")
        .expect("safe strobe is cataloged");
    strobe.catalog.strobe_risk = StrobeRiskDSL::Low;
    let diagnostics = validate_production_catalog_runtime(&catalog);
    assert!(diagnostics.iter().any(|diagnostic| {
        diagnostic.code == CATALOG_METADATA_INVALID
            && diagnostic.path == "catalog.strobe_risk"
            && diagnostic
                .asset
                .as_ref()
                .is_some_and(|asset| asset.id == "builtin.strobe.safe-pulse")
    }));
}

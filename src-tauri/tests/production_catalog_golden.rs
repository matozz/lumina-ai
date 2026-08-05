use lumina_ai_lib::compiler::diagnostic::CATALOG_METADATA_INVALID;
use lumina_ai_lib::document::{
    builtin_production_catalog, production_catalog_compatibility, production_catalog_golden,
    validate_production_catalog_runtime, StrobeRiskDSL,
};

#[test]
fn checked_in_multi_tick_golden_matches_deterministic_rendering() {
    let catalog = builtin_production_catalog().expect("catalog parses");
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

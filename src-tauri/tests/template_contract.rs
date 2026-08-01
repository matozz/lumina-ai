use lumina_ai_lib::compiler::{parser::ShowDSL, Compiler};
use std::fs;
use std::path::PathBuf;

#[test]
fn all_editor_templates_parse_and_compile_with_fixture_outputs() {
    let template_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/editor/templates");
    let mut template_paths: Vec<_> = fs::read_dir(&template_dir)
        .expect("template directory must be readable")
        .map(|entry| entry.expect("template entry must be readable").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    template_paths.sort();

    assert_eq!(template_paths.len(), 18, "template inventory changed");

    for path in template_paths {
        let source = fs::read_to_string(&path).expect("template must be readable");
        let dsl: ShowDSL = serde_json::from_str(&source)
            .unwrap_or_else(|error| panic!("{} must parse: {error}", path.display()));
        let expected_fixture_count: usize = dsl
            .patch
            .iter()
            .map(|patch| (patch.id_range.1 - patch.id_range.0 + 1) as usize)
            .sum();
        let expected_phaser_count = dsl.phasers.len();
        let show = Compiler::compile(dsl)
            .unwrap_or_else(|errors| panic!("{} must compile: {errors:?}", path.display()));

        assert_eq!(
            show.fixtures.len(),
            expected_fixture_count,
            "{} fixture output count",
            path.display()
        );
        assert_eq!(
            show.phasers.len(),
            expected_phaser_count,
            "{} phaser output count",
            path.display()
        );
        assert!(
            show.fixtures.iter().all(|fixture| fixture.id > 0),
            "{} fixture IDs must be positive",
            path.display()
        );
    }
}

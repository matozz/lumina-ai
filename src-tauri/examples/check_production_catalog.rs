use lumina_ai_lib::document::{
    builtin_production_catalog, validate_production_catalog, validate_production_catalog_runtime,
    ProductionCatalog,
};
use std::fs;

fn main() {
    let catalog = match std::env::args().nth(1) {
        Some(path) => match fs::read_to_string(&path)
            .map_err(|error| error.to_string())
            .and_then(|source| {
                serde_json::from_str::<ProductionCatalog>(&source)
                    .map_err(|error| error.to_string())
            }) {
            Ok(catalog) => catalog,
            Err(error) => {
                eprintln!("Production Catalog parse failed: {error}");
                std::process::exit(1);
            }
        },
        None => match builtin_production_catalog() {
            Ok(catalog) => catalog,
            Err(diagnostic) => {
                eprintln!("{diagnostic}");
                std::process::exit(1);
            }
        },
    };
    let mut diagnostics = validate_production_catalog(&catalog);
    diagnostics.extend(validate_production_catalog_runtime(&catalog));
    if diagnostics.is_empty() {
        println!(
            "Production Catalog valid: {} Effects, {} Cue recipes",
            catalog.effects.len(),
            catalog.cue_recipes.len()
        );
        return;
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&diagnostics).expect("diagnostics serialize")
    );
    std::process::exit(1);
}

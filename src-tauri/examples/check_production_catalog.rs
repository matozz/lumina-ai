use lumina_ai_lib::document::{
    builtin_production_catalog, layout_capacity, layout_geometry_shape, layout_positions,
    production_catalog_compatibility, production_catalog_golden,
    production_catalog_temporal_golden, validate_production_catalog,
    validate_production_catalog_runtime, ProductionCatalog,
};
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let mut update_golden = false;
    let mut catalog_path = None;
    for argument in std::env::args().skip(1) {
        if argument == "--update-golden" {
            update_golden = true;
        } else if catalog_path.replace(argument).is_some() {
            eprintln!("Usage: check_production_catalog [--update-golden] [catalog.json]");
            std::process::exit(2);
        }
    }
    let checks_authoritative_artifacts = catalog_path.is_none();
    let catalog = match catalog_path {
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
    if !diagnostics.is_empty() {
        println!(
            "{}",
            serde_json::to_string_pretty(&diagnostics).expect("diagnostics serialize")
        );
        std::process::exit(1);
    }

    if checks_authoritative_artifacts {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let golden_path = manifest_dir.join("tests/fixtures/production_catalog_golden_v1.json");
        let compatibility_path = manifest_dir.join("../catalog/production-compatibility-v1.json");
        let temporal_golden_path =
            manifest_dir.join("tests/fixtures/production_temporal_fingerprint_v1.json");
        let generator_golden_path =
            manifest_dir.join("../catalog/builtin/generators/golden-v1.json");
        let golden = production_catalog_golden(&catalog).unwrap_or_else(|errors| {
            println!(
                "{}",
                serde_json::to_string_pretty(&errors).expect("diagnostics serialize")
            );
            std::process::exit(1);
        });
        let compatibility = production_catalog_compatibility(&catalog);
        let temporal_golden =
            production_catalog_temporal_golden(&catalog).unwrap_or_else(|errors| {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&errors).expect("diagnostics serialize")
                );
                std::process::exit(1);
            });
        let generator_golden = generator_golden(&catalog);
        if update_golden {
            write_artifact(&golden_path, &golden);
            write_artifact(&compatibility_path, &compatibility);
            write_artifact(&temporal_golden_path, &temporal_golden);
            write_artifact(&generator_golden_path, &generator_golden);
            println!(
                "Updated {}, {}, {}, and {}",
                golden_path.display(),
                compatibility_path.display(),
                temporal_golden_path.display(),
                generator_golden_path.display()
            );
        } else {
            check_artifact("multi-tick golden", &golden_path, &golden);
            check_artifact(
                "layout compatibility matrix",
                &compatibility_path,
                &compatibility,
            );
            check_artifact(
                "temporal fingerprint golden",
                &temporal_golden_path,
                &temporal_golden,
            );
            check_artifact(
                "Generator coordinate golden",
                &generator_golden_path,
                &generator_golden,
            );
        }
    }
    println!(
        "Production Catalog valid: {} Effects, {} Cue recipes",
        catalog.effects.len(),
        catalog.cue_recipes.len()
    );
}

fn generator_golden(catalog: &ProductionCatalog) -> serde_json::Value {
    serde_json::json!({
        "schema_version": 1,
        "layouts": catalog.layouts.iter().map(|layout| {
            let capacity = layout_capacity(layout);
            let fixture_ids = (1..=capacity as u32).collect::<Vec<_>>();
            let positions = layout_positions(layout, &fixture_ids);
            let sample_indices = [0, capacity / 2, capacity.saturating_sub(1)];
            serde_json::json!({
                "id": layout.id,
                "shape": layout_geometry_shape(&layout.geometry),
                "capacity": capacity,
                "samples": sample_indices.into_iter().filter_map(|index| positions.get(index)).map(|position| serde_json::json!({
                    "id": position.id,
                    "x": round_six(position.x),
                    "y": round_six(position.y),
                })).collect::<Vec<_>>(),
            })
        }).collect::<Vec<_>>()
    })
}

fn round_six(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

fn write_artifact(path: &Path, value: &serde_json::Value) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("artifact directory must be writable");
    }
    let mut source = serde_json::to_string_pretty(value).expect("artifact serializes");
    source.push('\n');
    fs::write(path, source).expect("artifact must be writable");
}

fn check_artifact(label: &str, path: &Path, actual: &serde_json::Value) {
    let expected = fs::read_to_string(path)
        .unwrap_or_else(|error| panic!("{label} is missing at {}: {error}", path.display()));
    let expected: serde_json::Value = serde_json::from_str(&expected)
        .unwrap_or_else(|error| panic!("{label} is invalid JSON at {}: {error}", path.display()));
    let normalized_actual: serde_json::Value = serde_json::from_str(
        &serde_json::to_string(actual).expect("generated artifact serializes"),
    )
    .expect("generated artifact round-trips");
    if expected != normalized_actual {
        eprintln!(
            "Production Catalog {label} drifted at {}. Review the render change, then run `pnpm catalog:golden:update`.",
            path.display()
        );
        std::process::exit(1);
    }
}

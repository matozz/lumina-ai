use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let repository_root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"))
        .parent()
        .expect("src-tauri has a repository parent")
        .to_path_buf();
    let builtin_root = repository_root.join("catalog/builtin");
    println!("cargo:rerun-if-changed={}", builtin_root.display());

    let catalog = json!({
        "schema_version": 1,
        "effects": read_assets(&builtin_root.join("effects")),
        "cue_recipes": read_assets(&builtin_root.join("cues")),
        "layouts": read_assets(&builtin_root.join("layouts")),
        "arrangements": read_assets(&builtin_root.join("arrangements")),
        "project_templates": read_assets(&builtin_root.join("project-templates")),
    });
    let output = PathBuf::from(std::env::var("OUT_DIR").expect("Cargo OUT_DIR"))
        .join("builtin-catalog-v1.json");
    fs::write(
        output,
        serde_json::to_vec_pretty(&catalog).expect("built-in Catalog serializes"),
    )
    .expect("built-in Catalog aggregate is writable");

    tauri_build::build()
}

fn read_assets(directory: &Path) -> Vec<Value> {
    let mut paths = match fs::read_dir(directory) {
        Ok(entries) => entries
            .map(|entry| entry.expect("built-in Catalog entry").path())
            .filter(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "json")
                    && !path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with('_'))
            })
            .collect::<Vec<_>>(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => panic!("could not read {}: {error}", directory.display()),
    };
    paths.sort();
    let mut assets = paths
        .into_iter()
        .map(|path| {
            let source = fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("could not read {}: {error}", path.display()));
            serde_json::from_str(&source).unwrap_or_else(|error| {
                panic!("invalid built-in asset {}: {error}", path.display())
            })
        })
        .collect::<Vec<Value>>();
    let order_path = directory.join("_order.json");
    if let Ok(source) = fs::read_to_string(order_path) {
        let order = serde_json::from_str::<Vec<String>>(&source)
            .expect("built-in Catalog order must be an array of IDs")
            .into_iter()
            .enumerate()
            .map(|(index, id)| (id, index))
            .collect::<BTreeMap<_, _>>();
        assets.sort_by_key(|asset| {
            let id = asset.get("id").and_then(Value::as_str).unwrap_or_default();
            (order.get(id).copied().unwrap_or(usize::MAX), id.to_string())
        });
    }
    assets
}

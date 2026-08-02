use lumina_ai_lib::document::load_document;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let paths: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
    if paths.is_empty() {
        return Err("usage: migrate_show_document <show.json> [...]".to_string());
    }

    for path in paths {
        let source = fs::read_to_string(&path)
            .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
        let loaded = load_document(&source)
            .map_err(|error| format!("cannot migrate {}: {error}", path.display()))?;
        let mut serialized = serde_json::to_string_pretty(&loaded.document)
            .map_err(|error| format!("cannot serialize {}: {error}", path.display()))?;
        serialized.push('\n');
        atomic_write(&path, serialized.as_bytes())?;
        println!(
            "migrated {} ({} changes)",
            path.display(),
            loaded.migration_report.changes.len()
        );
    }
    Ok(())
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("{} has no file name", path.display()))?;
    let temporary_path = parent.join(format!(
        ".{}.lumina-migration-{}.tmp",
        file_name.to_string_lossy(),
        std::process::id()
    ));
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temporary_path)
            .map_err(|error| format!("cannot create {}: {error}", temporary_path.display()))?;
        file.write_all(contents)
            .map_err(|error| format!("cannot write {}: {error}", temporary_path.display()))?;
        file.sync_all()
            .map_err(|error| format!("cannot sync {}: {error}", temporary_path.display()))?;
        fs::rename(&temporary_path, path)
            .map_err(|error| format!("cannot replace {}: {error}", path.display()))
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result
}

use crate::document::{load_project_bundle, ProjectBundle};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const LATEST_PROJECT_FILE: &str = "lumina-project.json";
const HISTORY_DIRECTORY: &str = "history";
const HISTORY_FILE_PREFIX: &str = "lumina-project-";
const MAX_HISTORY_FILES: usize = 50;

static PROJECT_STORAGE_LOCK: Mutex<()> = Mutex::const_new(());
static HISTORY_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
pub struct ProjectStorageSaveResult {
    pub latest_path: String,
    pub history_count: usize,
    pub changed: bool,
}

#[derive(Debug, Serialize)]
pub struct ProjectStorageLoadResult {
    pub project: ProjectBundle,
    pub latest_path: String,
    pub history_count: usize,
}

#[tauri::command]
pub async fn load_project_storage(
    directory: String,
) -> Result<Option<ProjectStorageLoadResult>, String> {
    let _guard = PROJECT_STORAGE_LOCK.lock().await;
    let directory = existing_directory(&directory).await?;
    let latest_path = directory.join(LATEST_PROJECT_FILE);
    if !tokio::fs::try_exists(&latest_path)
        .await
        .map_err(|error| format!("Project storage check failed: {error}"))?
    {
        return Ok(None);
    }
    let content = tokio::fs::read_to_string(&latest_path)
        .await
        .map_err(|error| format!("Project storage read failed: {error}"))?;
    let project = load_project_bundle(&content)
        .map(crate::document::ValidatedProject::into_bundle)
        .map_err(|diagnostics| {
            format!(
                "The latest project in this folder is invalid:\n{}",
                diagnostics
                    .into_iter()
                    .map(|diagnostic| diagnostic.to_string())
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        })?;
    Ok(Some(ProjectStorageLoadResult {
        project,
        latest_path: display_path(&latest_path),
        history_count: history_files(&directory).await?.len(),
    }))
}

#[tauri::command]
pub async fn save_project_storage(
    directory: String,
    project_json: String,
) -> Result<ProjectStorageSaveResult, String> {
    let validated = load_project_bundle(&project_json).map_err(|diagnostics| {
        diagnostics
            .into_iter()
            .map(|diagnostic| diagnostic.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    let mut serialized = serde_json::to_string_pretty(&validated.into_bundle())
        .map_err(|error| format!("Project serialization error: {error}"))?;
    serialized.push('\n');

    let _guard = PROJECT_STORAGE_LOCK.lock().await;
    let directory = existing_directory(&directory).await?;
    let latest_path = directory.join(LATEST_PROJECT_FILE);
    let existing = if tokio::fs::try_exists(&latest_path)
        .await
        .map_err(|error| format!("Project storage check failed: {error}"))?
    {
        Some(
            tokio::fs::read_to_string(&latest_path)
                .await
                .map_err(|error| format!("Project storage read failed: {error}"))?,
        )
    } else {
        None
    };

    if existing.as_deref() == Some(serialized.as_str()) {
        return Ok(ProjectStorageSaveResult {
            latest_path: display_path(&latest_path),
            history_count: history_files(&directory).await?.len(),
            changed: false,
        });
    }

    if let Some(existing) = existing {
        load_project_bundle(&existing).map_err(|diagnostics| {
            format!(
                "Refusing to replace an invalid latest project:\n{}",
                diagnostics
                    .into_iter()
                    .map(|diagnostic| diagnostic.to_string())
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        })?;
        let history_directory = directory.join(HISTORY_DIRECTORY);
        tokio::fs::create_dir_all(&history_directory)
            .await
            .map_err(|error| format!("Project history directory creation failed: {error}"))?;
        let history_path = history_directory.join(history_file_name());
        atomic_write(&history_path, existing.as_bytes()).await?;
    }

    atomic_write(&latest_path, serialized.as_bytes()).await?;
    let history_count = prune_history(&directory).await?;
    Ok(ProjectStorageSaveResult {
        latest_path: display_path(&latest_path),
        history_count,
        changed: true,
    })
}

async fn existing_directory(directory: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(directory);
    if directory.trim().is_empty() || !path.is_absolute() {
        return Err("Project storage must be an absolute folder path.".to_string());
    }
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| format!("Project storage folder is unavailable: {error}"))?;
    if !metadata.is_dir() {
        return Err("Project storage path must point to a folder.".to_string());
    }
    Ok(path)
}

async fn prune_history(directory: &Path) -> Result<usize, String> {
    let mut files = history_files(directory).await?;
    files.sort();
    let remove_count = files.len().saturating_sub(MAX_HISTORY_FILES);
    for path in files.iter().take(remove_count) {
        tokio::fs::remove_file(path)
            .await
            .map_err(|error| format!("Project history pruning failed: {error}"))?;
    }
    Ok(files.len() - remove_count)
}

async fn history_files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let history_directory = directory.join(HISTORY_DIRECTORY);
    if !tokio::fs::try_exists(&history_directory)
        .await
        .map_err(|error| format!("Project history check failed: {error}"))?
    {
        return Ok(Vec::new());
    }
    let mut entries = tokio::fs::read_dir(&history_directory)
        .await
        .map_err(|error| format!("Project history read failed: {error}"))?;
    let mut files = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| format!("Project history read failed: {error}"))?
    {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(HISTORY_FILE_PREFIX) && name.ends_with(".json") {
            files.push(entry.path());
        }
    }
    Ok(files)
}

fn history_file_name() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = HISTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("{HISTORY_FILE_PREFIX}{timestamp:013}-{sequence:06}.json")
}

async fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Project path must have a parent folder.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Project path must end with a valid UTF-8 file name.".to_string())?;
    let sequence = HISTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary_path = parent.join(format!(
        ".{file_name}.lumina-{}-{sequence}.tmp",
        std::process::id()
    ));
    tokio::fs::write(&temporary_path, contents)
        .await
        .map_err(|error| format!("Temporary project write failed: {error}"))?;
    if let Err(error) = tokio::fs::rename(&temporary_path, path).await {
        let _ = tokio::fs::remove_file(&temporary_path).await;
        return Err(format!("Atomic project replace failed: {error}"));
    }
    Ok(())
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{load_project_storage, save_project_storage, MAX_HISTORY_FILES};
    use crate::document::valid_bundle;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[tokio::test]
    async fn saves_latest_and_reopens_the_validated_project() {
        let directory = test_directory("latest").await;
        let mut bundle = valid_bundle();
        bundle.manifest.name = "Durable Project".to_string();

        let saved = save_project_storage(
            directory.to_string_lossy().into_owned(),
            serde_json::to_string(&bundle).expect("Project JSON"),
        )
        .await
        .expect("save Project storage");
        assert!(saved.changed);
        assert_eq!(saved.history_count, 0);

        let reopened = load_project_storage(directory.to_string_lossy().into_owned())
            .await
            .expect("load Project storage")
            .expect("latest Project");
        assert_eq!(reopened.project.manifest.name, "Durable Project");
        assert_eq!(reopened.history_count, 0);

        tokio::fs::remove_dir_all(directory)
            .await
            .expect("test cleanup");
    }

    #[tokio::test]
    async fn skips_unchanged_writes_and_keeps_only_fifty_history_versions() {
        let directory = test_directory("history").await;
        let mut bundle = valid_bundle();
        let project_json = serde_json::to_string(&bundle).expect("Project JSON");
        save_project_storage(
            directory.to_string_lossy().into_owned(),
            project_json.clone(),
        )
        .await
        .expect("initial save");
        let unchanged =
            save_project_storage(directory.to_string_lossy().into_owned(), project_json)
                .await
                .expect("unchanged save");
        assert!(!unchanged.changed);
        assert_eq!(unchanged.history_count, 0);

        for revision in 2..=u32::try_from(MAX_HISTORY_FILES + 4).expect("history count") {
            bundle.manifest.revision = revision;
            bundle.manifest.name = format!("Project revision {revision}");
            save_project_storage(
                directory.to_string_lossy().into_owned(),
                serde_json::to_string(&bundle).expect("Project JSON"),
            )
            .await
            .expect("versioned save");
        }
        let final_save = save_project_storage(
            directory.to_string_lossy().into_owned(),
            serde_json::to_string(&bundle).expect("Project JSON"),
        )
        .await
        .expect("final unchanged save");
        assert_eq!(final_save.history_count, MAX_HISTORY_FILES);

        tokio::fs::remove_dir_all(directory)
            .await
            .expect("test cleanup");
    }

    #[tokio::test]
    async fn refuses_to_replace_an_invalid_existing_latest_file() {
        let directory = test_directory("invalid-latest").await;
        let latest_path = directory.join(super::LATEST_PROJECT_FILE);
        tokio::fs::write(&latest_path, b"{\"schema_version\":null}\n")
            .await
            .expect("invalid latest fixture");
        let error = save_project_storage(
            directory.to_string_lossy().into_owned(),
            serde_json::to_string(&valid_bundle()).expect("Project JSON"),
        )
        .await
        .expect_err("invalid latest must fail closed");

        assert!(error.contains("Refusing to replace an invalid latest project"));
        assert_eq!(
            tokio::fs::read_to_string(&latest_path)
                .await
                .expect("preserved invalid latest"),
            "{\"schema_version\":null}\n"
        );

        tokio::fs::remove_dir_all(directory)
            .await
            .expect("test cleanup");
    }

    async fn test_directory(label: &str) -> std::path::PathBuf {
        let sequence = TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "lumina-project-storage-{label}-{}-{sequence}",
            std::process::id()
        ));
        tokio::fs::create_dir(&directory)
            .await
            .expect("test directory");
        directory
    }
}

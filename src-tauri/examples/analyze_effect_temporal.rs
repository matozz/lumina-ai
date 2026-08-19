use lumina_ai_lib::document::{
    AssetRef, ProjectBundle, ProjectManifest, UserAssetPack, PROJECT_BUNDLE_SCHEMA_VERSION,
    PROJECT_MANIFEST_SCHEMA_VERSION,
};
use lumina_ai_lib::engine::temporal::{
    analyze_project_temporal_behavior, render_temporal_contact_sheet_svg, TemporalAnalysisRequest,
    TemporalSamplingConfig, LEGAL_TEMPORAL_SPEEDS,
};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    if let Err(message) = run() {
        eprintln!("{message}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let project_path = value(&args, "--project").map(PathBuf::from);
    let pack_path = value(&args, "--pack").map(PathBuf::from);
    if project_path.is_some() == pack_path.is_some() {
        return Err(usage("Provide exactly one of --project or --pack."));
    }
    let source_path = project_path
        .as_ref()
        .or(pack_path.as_ref())
        .expect("one source");
    let source = fs::read_to_string(source_path)
        .map_err(|error| format!("Cannot read {}: {error}", source_path.display()))?;
    let mut project = if project_path.is_some() {
        serde_json::from_str::<ProjectBundle>(&source)
            .map_err(|error| format!("ProjectBundle parse failed: {error}"))?
    } else {
        let pack = serde_json::from_str::<UserAssetPack>(&source)
            .map_err(|error| format!("UserAssetPack parse failed: {error}"))?;
        project_from_pack(pack, value(&args, "--stage-id"))?
    };
    if let Some(stage_id) = value(&args, "--stage-id") {
        let stage = project
            .stages
            .iter()
            .find(|stage| stage.id == stage_id)
            .ok_or_else(|| format!("Stage {stage_id:?} is not present in the input."))?;
        project.manifest.stage_ref = AssetRef {
            id: stage.id.clone(),
            revision: stage.revision,
        };
    }
    let effect_id = required(&args, "--effect-id")?;
    let effect_revision = value(&args, "--revision")
        .map(|value| value.parse::<u32>())
        .transpose()
        .map_err(|error| format!("Invalid --revision: {error}"))?
        .unwrap_or(1);
    let target_set_id = required(&args, "--target-set-id")?;
    let bpm = value(&args, "--bpm")
        .map(|value| value.parse::<f64>())
        .transpose()
        .map_err(|error| format!("Invalid --bpm: {error}"))?
        .unwrap_or(128.0);
    let speeds = value(&args, "--speeds")
        .map(parse_speeds)
        .transpose()?
        .unwrap_or_else(|| LEGAL_TEMPORAL_SPEEDS.to_vec());
    let seed = value(&args, "--seed")
        .unwrap_or("0000000000000001")
        .to_string();
    let preview_fps = value(&args, "--preview-fps")
        .map(|value| value.parse::<f64>())
        .transpose()
        .map_err(|error| format!("Invalid --preview-fps: {error}"))?
        .unwrap_or(30.0);
    let parameter_overrides = value(&args, "--parameter-overrides")
        .map(|path| {
            fs::read_to_string(path)
                .map_err(|error| format!("Cannot read parameter overrides {path}: {error}"))
                .and_then(|source| {
                    serde_json::from_str::<
                        BTreeMap<String, lumina_ai_lib::document::ParameterValueDSL>,
                    >(&source)
                    .map_err(|error| format!("Parameter overrides parse failed: {error}"))
                })
        })
        .transpose()?
        .unwrap_or_default();
    let request = TemporalAnalysisRequest {
        effect_ref: AssetRef {
            id: effect_id.to_string(),
            revision: effect_revision,
        },
        target_set_id: target_set_id.to_string(),
        bpm,
        speeds,
        seed,
        parameter_overrides,
        sampling: TemporalSamplingConfig {
            preview_fps,
            ..TemporalSamplingConfig::default()
        },
    };
    let report = analyze_project_temporal_behavior(&project, &request)
        .map_err(|diagnostics| serde_json::to_string_pretty(&diagnostics).unwrap_or_default())?;
    let output = serde_json::to_string_pretty(&report)
        .map_err(|error| format!("Temporal report serialization failed: {error}"))?;
    if let Some(path) = value(&args, "--output") {
        fs::write(path, format!("{output}\n"))
            .map_err(|error| format!("Cannot write {path}: {error}"))?;
    } else {
        println!("{output}");
    }
    if let Some(path) = value(&args, "--contact-sheet") {
        let speed = value(&args, "--contact-speed")
            .map(|value| value.parse::<f64>())
            .transpose()
            .map_err(|error| format!("Invalid --contact-speed: {error}"))?
            .unwrap_or_else(|| report.fingerprints.first().map_or(1.0, |item| item.speed));
        let svg = render_temporal_contact_sheet_svg(&project, &request, speed, 16).map_err(
            |diagnostics| serde_json::to_string_pretty(&diagnostics).unwrap_or_default(),
        )?;
        fs::write(path, svg).map_err(|error| format!("Cannot write {path}: {error}"))?;
    }
    Ok(())
}

fn project_from_pack(pack: UserAssetPack, stage_id: Option<&str>) -> Result<ProjectBundle, String> {
    let stage = stage_id
        .and_then(|id| pack.stages.iter().find(|stage| stage.id == id))
        .or_else(|| pack.stages.first())
        .ok_or_else(|| "UserAssetPack contains no Stage.".to_string())?;
    let active_arrangement_id = pack
        .arrangements
        .first()
        .map(|arrangement| arrangement.id.clone())
        .unwrap_or_else(|| "temporal-analysis".to_string());
    Ok(ProjectBundle {
        schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
        manifest: ProjectManifest {
            schema_version: PROJECT_MANIFEST_SCHEMA_VERSION,
            project_id: format!("temporal:{}", pack.id),
            revision: 1,
            name: format!("Temporal analysis · {}", pack.name),
            stage_ref: AssetRef {
                id: stage.id.clone(),
                revision: stage.revision,
            },
            layout_refs: pack
                .layouts
                .iter()
                .map(|layout| AssetRef {
                    id: layout.id.clone(),
                    revision: layout.revision,
                })
                .collect(),
            effect_refs: pack
                .effects
                .iter()
                .map(|effect| AssetRef {
                    id: effect.id.clone(),
                    revision: effect.revision,
                })
                .collect(),
            cue_refs: pack
                .cues
                .iter()
                .map(|cue| AssetRef {
                    id: cue.id.clone(),
                    revision: cue.revision,
                })
                .collect(),
            arrangement_refs: pack
                .arrangements
                .iter()
                .map(|arrangement| AssetRef {
                    id: arrangement.id.clone(),
                    revision: arrangement.revision,
                })
                .collect(),
            active_arrangement_id,
        },
        stages: pack.stages,
        layouts: pack.layouts,
        effects: pack.effects,
        cues: pack.cues,
        arrangements: pack.arrangements,
    })
}

fn parse_speeds(value: &str) -> Result<Vec<f64>, String> {
    if value == "all" {
        return Ok(LEGAL_TEMPORAL_SPEEDS.to_vec());
    }
    value
        .split(',')
        .map(|item| {
            item.parse::<f64>()
                .map_err(|error| format!("Invalid speed {item:?}: {error}"))
        })
        .collect()
}

fn value<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .position(|argument| argument == name)
        .and_then(|index| args.get(index + 1))
        .map(String::as_str)
}

fn required<'a>(args: &'a [String], name: &str) -> Result<&'a str, String> {
    value(args, name).ok_or_else(|| usage(&format!("Missing required {name}.")))
}

fn usage(message: &str) -> String {
    format!(
        "{message}\nUsage: analyze_effect_temporal (--project <project.json> | --pack <assets.json>) --effect-id <id> --target-set-id <id> [--revision <n>] [--stage-id <id>] [--bpm 128] [--speeds all|0.25,1,4] [--preview-fps 30] [--seed 16hex] [--parameter-overrides values.json] [--output report.json] [--contact-sheet preview.svg] [--contact-speed 1]"
    )
}

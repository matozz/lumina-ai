use lumina_ai_lib::compiler::{CompiledGroup, CompiledShow, Compiler, Fixture};
use lumina_ai_lib::engine::attribute::{resolve_attribute, FixtureFrame};
use lumina_ai_lib::engine::effect::{
    common_parameters, CompiledEffectGraph, CompiledEffectNode, CompiledEffectStep,
    CompiledProfileSequence, EffectCatalog, EffectDefinition, EffectDefinitionHandle,
    EffectInstance, EffectNodeHandle, EffectSource,
};
use lumina_ai_lib::engine::profile::{
    profile_handle_by_id, AttributeValue, FixtureProfileHandle, COLOR_RGB_ATTRIBUTE,
    GENERIC_RGB_PROFILE_ID, INTENSITY_ATTRIBUTE,
};
use lumina_ai_lib::engine::{animation::ParameterContext, compute_frame};
use lumina_ai_lib::state::ActivePhaser;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const FIXTURE_COUNTS: [usize; 4] = [100, 500, 1_000, 2_000];
const DRIFT_SECONDS: u64 = 10;
const DRIFT_BPM: u32 = 120;
const DRIFT_SUBDIVISION: u32 = 8;

#[derive(Serialize)]
struct BaselineReport {
    schema_version: u32,
    source_commit: String,
    profile: &'static str,
    platform: PlatformReport,
    compute_frame: Vec<ComputeFrameReport>,
    template_compile: TemplateCompileReport,
    bundle: BundleReport,
    scheduler_drift: SchedulerDriftReport,
}

#[derive(Serialize)]
struct PlatformReport {
    os: &'static str,
    arch: &'static str,
    available_parallelism: usize,
}

#[derive(Serialize)]
struct ComputeFrameReport {
    fixture_count: usize,
    samples: usize,
    p50_us: f64,
    p95_us: f64,
    mean_us: f64,
}

#[derive(Serialize)]
struct TemplateCompileReport {
    template_count: usize,
    samples: usize,
    suite_p50_us: f64,
    suite_p95_us: f64,
    per_template_mean_us: f64,
}

#[derive(Serialize)]
struct BundleReport {
    asset_count: usize,
    total_bytes: u64,
    javascript_bytes: u64,
    css_bytes: u64,
}

#[derive(Serialize)]
struct SchedulerDriftReport {
    duration_target_ms: u64,
    elapsed_ms: f64,
    bpm: u32,
    subdivision: u32,
    tick_count: usize,
    update_hz: f64,
    logical_beats: f64,
    elapsed_beats: f64,
    drift_ms: f64,
}

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let report = BaselineReport {
        schema_version: 1,
        source_commit: std::env::var("LUMINA_BASELINE_COMMIT")
            .unwrap_or_else(|_| "working-tree".to_string()),
        profile: "release",
        platform: PlatformReport {
            os: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            available_parallelism: std::thread::available_parallelism()
                .map(usize::from)
                .unwrap_or(1),
        },
        compute_frame: FIXTURE_COUNTS
            .into_iter()
            .map(benchmark_compute_frame)
            .collect(),
        template_compile: benchmark_templates(&manifest_dir.join("../src/editor/templates")),
        bundle: measure_bundle(&manifest_dir.join("../dist")),
        scheduler_drift: measure_scheduler_drift(),
    };

    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("baseline report must serialize")
    );
}

fn benchmark_compute_frame(fixture_count: usize) -> ComputeFrameReport {
    let show = synthetic_show(fixture_count);
    let active = ActivePhaser {
        id: "baseline".to_string(),
        start_beat: 0.0,
        instance_id: None,
        multiplier: 1.0,
        accumulated_beat: 0.25,
    };
    let parameters = ParameterContext::new();
    let samples = match fixture_count {
        100 => 100,
        500 => 50,
        1_000 => 20,
        _ => 10,
    };

    for _ in 0..3 {
        let frame = compute_frame(0.25, std::slice::from_ref(&active), &show, &parameters);
        assert_eq!(frame.len(), fixture_count);
        black_box(frame);
    }

    let mut durations = Vec::with_capacity(samples);
    for _ in 0..samples {
        let started = Instant::now();
        let frame = compute_frame(0.25, std::slice::from_ref(&active), &show, &parameters);
        let elapsed = started.elapsed();
        assert_eq!(frame.len(), fixture_count);
        assert!(frame.iter().all(frame_is_full_white));
        black_box(frame);
        durations.push(elapsed);
    }

    ComputeFrameReport {
        fixture_count,
        samples,
        p50_us: percentile_us(&durations, 0.50),
        p95_us: percentile_us(&durations, 0.95),
        mean_us: mean_us(&durations),
    }
}

fn synthetic_show(fixture_count: usize) -> CompiledShow {
    let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("built-in RGB profile");
    let fixtures: Vec<_> = (1..=fixture_count)
        .map(|id| Fixture {
            id: id as u32,
            profile,
            intensity: resolve_attribute(profile, INTENSITY_ATTRIBUTE),
        })
        .collect();
    let group = CompiledGroup::new(
        "all".to_string(),
        "All".to_string(),
        fixtures.iter().map(|fixture| fixture.id).collect(),
        vec![1; fixture_count],
        &fixtures,
    );
    let definition = EffectDefinition {
        id: "benchmark.baseline".to_string(),
        name: "Baseline".to_string(),
        revision: 1,
        source: EffectSource::ProjectLocal,
        parameters: common_parameters(1.0),
        graph: CompiledEffectGraph {
            nodes: vec![
                CompiledEffectNode::Time,
                CompiledEffectNode::StepSequence {
                    phase: EffectNodeHandle::from_index(0).expect("time handle"),
                    profiles: HashMap::from([(
                        profile,
                        profile_sequence(profile, vec![([255, 255, 255], 1.0, 100.0, 0.0)]),
                    )]),
                },
                CompiledEffectNode::AttributeWriter {
                    input: EffectNodeHandle::from_index(1).expect("sequence handle"),
                    mask: None,
                    attributes: HashMap::new(),
                },
            ],
            writers: vec![EffectNodeHandle::from_index(2).expect("writer handle")],
        },
        catalog: EffectCatalog::default(),
    };
    let instance = EffectInstance {
        id: "baseline".to_string(),
        definition: EffectDefinitionHandle::from_index(0),
        target_group_id: "all".to_string(),
        parameter_overrides: HashMap::new(),
        seed: EffectInstance::stable_seed("baseline"),
        phase_offset: 0.0,
        priority: 0,
        mix_overrides: HashMap::new(),
        spatial_offsets: HashMap::new(),
    };

    CompiledShow {
        fixtures,
        groups: HashMap::from([(group.id.clone(), group)]),
        effect_definitions: vec![definition],
        effect_instances: HashMap::from([(instance.id.clone(), instance)]),
        ..CompiledShow::default()
    }
}

fn profile_sequence(
    profile: FixtureProfileHandle,
    definitions: Vec<([u8; 3], f32, f64, f64)>,
) -> CompiledProfileSequence {
    let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE);
    let color = resolve_attribute(profile, COLOR_RGB_ATTRIBUTE);
    let attribute_count = lumina_ai_lib::engine::profile::profile_by_handle(profile)
        .attributes
        .len();
    let steps = definitions
        .into_iter()
        .map(|(color_value, intensity_value, width, transition)| {
            let mut values = vec![None; attribute_count];
            values[intensity.expect("intensity").index()] =
                Some(AttributeValue::Scalar(intensity_value));
            values[color.expect("color").index()] = Some(AttributeValue::Color(color_value));
            CompiledEffectStep {
                values,
                width,
                transition,
                accel: 0,
                decel: 0,
            }
        })
        .collect();
    CompiledProfileSequence {
        steps,
        intensity,
        color,
        pan: None,
        tilt: None,
    }
}

fn frame_is_full_white(frame: &FixtureFrame) -> bool {
    frame.value(resolve_attribute(frame.profile, COLOR_RGB_ATTRIBUTE).expect("color"))
        == Some(&AttributeValue::Color([255, 255, 255]))
        && frame.value(resolve_attribute(frame.profile, INTENSITY_ATTRIBUTE).expect("intensity"))
            == Some(&AttributeValue::Scalar(1.0))
}

fn benchmark_templates(template_dir: &Path) -> TemplateCompileReport {
    let mut paths: Vec<_> = fs::read_dir(template_dir)
        .expect("template directory must be readable")
        .map(|entry| entry.expect("template entry must be readable").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    paths.sort();
    assert_eq!(paths.len(), 18, "template inventory changed");

    let sources: Vec<_> = paths
        .iter()
        .map(|path| fs::read_to_string(path).expect("template must be readable"))
        .collect();
    let samples = 20;
    let mut durations = Vec::with_capacity(samples);
    for _ in 0..samples {
        let started = Instant::now();
        for source in &sources {
            let dsl = lumina_ai_lib::document::load_document(source)
                .expect("template must parse")
                .document;
            let show = Compiler::compile_document(dsl).expect("template must compile");
            assert!(!show.fixtures.is_empty());
            black_box(show);
        }
        durations.push(started.elapsed());
    }

    TemplateCompileReport {
        template_count: paths.len(),
        samples,
        suite_p50_us: percentile_us(&durations, 0.50),
        suite_p95_us: percentile_us(&durations, 0.95),
        per_template_mean_us: mean_us(&durations) / paths.len() as f64,
    }
}

fn measure_bundle(dist_dir: &Path) -> BundleReport {
    let mut files = Vec::new();
    collect_files(dist_dir, &mut files);
    assert!(!files.is_empty(), "run pnpm build before the baseline");

    let mut report = BundleReport {
        asset_count: files.len(),
        total_bytes: 0,
        javascript_bytes: 0,
        css_bytes: 0,
    };
    for path in files {
        let bytes = fs::metadata(&path).expect("bundle asset metadata").len();
        report.total_bytes += bytes;
        match path.extension().and_then(|extension| extension.to_str()) {
            Some("js") => report.javascript_bytes += bytes,
            Some("css") => report.css_bytes += bytes,
            _ => {}
        }
    }
    report
}

fn collect_files(directory: &Path, files: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(directory).expect("bundle directory must be readable") {
        let path = entry.expect("bundle entry must be readable").path();
        if path.is_dir() {
            collect_files(&path, files);
        } else {
            files.push(path);
        }
    }
}

fn measure_scheduler_drift() -> SchedulerDriftReport {
    let tick_interval =
        Duration::from_secs_f64(60.0 / (DRIFT_BPM as f64 * DRIFT_SUBDIVISION as f64));
    let tick_count =
        (Duration::from_secs(DRIFT_SECONDS).as_secs_f64() / tick_interval.as_secs_f64()) as usize;
    let started = Instant::now();
    let mut next_tick = started;
    let mut logical_beats = 0.0;

    for _ in 0..tick_count {
        next_tick += tick_interval;
        logical_beats += 1.0 / DRIFT_SUBDIVISION as f64;
        wait_until(next_tick);
    }

    let elapsed = started.elapsed();
    let elapsed_seconds = elapsed.as_secs_f64();
    let elapsed_beats = elapsed_seconds * DRIFT_BPM as f64 / 60.0;
    let drift_ms = (logical_beats - elapsed_beats) * 60_000.0 / DRIFT_BPM as f64;
    let update_hz = tick_count as f64 / elapsed_seconds;

    assert!(
        drift_ms.abs() < 50.0,
        "10 second fixed-step drift exceeded baseline tolerance: {drift_ms:.3}ms"
    );
    assert!(
        (15.5..=16.5).contains(&update_hz),
        "baseline scheduler frequency changed: {update_hz:.3}Hz"
    );

    SchedulerDriftReport {
        duration_target_ms: DRIFT_SECONDS * 1_000,
        elapsed_ms: elapsed_seconds * 1_000.0,
        bpm: DRIFT_BPM,
        subdivision: DRIFT_SUBDIVISION,
        tick_count,
        update_hz,
        logical_beats,
        elapsed_beats,
        drift_ms,
    }
}

fn wait_until(deadline: Instant) {
    let now = Instant::now();
    if deadline <= now {
        return;
    }
    let wait = deadline - now;
    if wait > Duration::from_millis(2) {
        std::thread::sleep(wait - Duration::from_millis(1));
    }
    while Instant::now() < deadline {
        std::hint::spin_loop();
    }
}

fn percentile_us(durations: &[Duration], percentile: f64) -> f64 {
    let mut values: Vec<_> = durations.iter().map(Duration::as_secs_f64).collect();
    values.sort_by(f64::total_cmp);
    let index = ((values.len() - 1) as f64 * percentile).round() as usize;
    values[index] * 1_000_000.0
}

fn mean_us(durations: &[Duration]) -> f64 {
    durations.iter().map(Duration::as_secs_f64).sum::<f64>() * 1_000_000.0 / durations.len() as f64
}

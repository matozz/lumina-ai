use lumina_ai_lib::compiler::{
    parser::ShowDSL, CompiledGroup, CompiledPhaser, CompiledShow, CompiledStep, Compiler, Fixture,
    PhaseConfig,
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
        assert!(frame.iter().all(|output| {
            output.r == 255 && output.g == 255 && output.b == 255 && output.dimmer == 1.0
        }));
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
    let fixtures: Vec<_> = (1..=fixture_count)
        .map(|id| Fixture {
            id: id as u32,
            type_: "pixel".to_string(),
        })
        .collect();
    let group = CompiledGroup {
        id: "all".to_string(),
        name: "All".to_string(),
        sorted_fixture_ids: fixtures.iter().map(|fixture| fixture.id).collect(),
        blocks: vec![1; fixture_count],
    };
    let phaser = CompiledPhaser {
        id: "baseline".to_string(),
        name: "Baseline".to_string(),
        target: "all".to_string().into(),
        multiplier: Some(1.0),
        steps: vec![CompiledStep {
            color: (255, 255, 255),
            dimmer: 1.0,
            width: 100.0,
            transition: 0.0,
            accel: 0,
            decel: 0,
        }],
        phase: PhaseConfig::Spread { from: 0.0, to: 0.0 },
    };

    CompiledShow {
        fixtures,
        groups: HashMap::from([(group.id.clone(), group)]),
        phasers: HashMap::from([(phaser.id.clone(), phaser)]),
        ..CompiledShow::default()
    }
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
            let dsl: ShowDSL = serde_json::from_str(source).expect("template must parse");
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

use lumina_ai_lib::compiler::{
    CompiledGroup, CompiledPhaser, CompiledShow, CompiledStep, Fixture, PhaseConfig,
};
use lumina_ai_lib::engine::clock::ManualClock;
use lumina_ai_lib::engine::frame::FramePublisher;
use lumina_ai_lib::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use lumina_ai_lib::engine::transport::{OutputRate, RealtimeCore};
use serde::Serialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const DURATION: Duration = Duration::from_secs(600);
const BPM: u32 = 120;
const OUTPUT_HZ: u32 = 60;
const FIXTURE_COUNT: usize = 500;

#[derive(Serialize)]
struct ValidationReport {
    schema_version: u32,
    source_commit: String,
    profile: &'static str,
    platform: PlatformReport,
    loaded_runtime: LoadedRuntimeReport,
}

#[derive(Serialize)]
struct PlatformReport {
    os: &'static str,
    arch: &'static str,
    available_parallelism: usize,
}

#[derive(Serialize)]
struct LoadedRuntimeReport {
    duration_target_ms: u64,
    bpm: u32,
    output_hz: u32,
    tick_count: u64,
    fixture_count: usize,
    fixture_evaluations: u64,
    expected_beats: f64,
    actual_beats: f64,
    logical_drift_ms: f64,
    wall_elapsed_ms: f64,
    simulation_realtime_factor: f64,
    mean_render_publish_us: f64,
    final_frame_sequence: u64,
    final_frame_checksum: u64,
}

fn main() {
    let loaded_runtime = validate_loaded_runtime();
    let report = ValidationReport {
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
        loaded_runtime,
    };

    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("validation report must serialize")
    );
}

fn validate_loaded_runtime() -> LoadedRuntimeReport {
    let clock = ManualClock::default();
    let output_rate = OutputRate::new(OUTPUT_HZ).expect("supported output rate");
    let mut core = RealtimeCore::new(clock.clone(), BPM, output_rate).expect("valid runtime core");
    core.play().expect("runtime must start");

    let show = synthetic_show(FIXTURE_COUNT);
    let live = vec![LivePhaser {
        id: "loaded".to_string(),
        start_beat: 0.0,
        phase_offset: 0.0,
        multiplier: 1.0,
    }];
    let mut publisher = FramePublisher::default();
    let tick_count = DURATION.as_secs() * u64::from(output_rate.hz());
    let started = Instant::now();

    for _ in 0..tick_count {
        clock.advance(output_rate.interval());
        let snapshot = core.snapshot();
        let frame = render_at(
            &show,
            RenderTime {
                beat: snapshot.cursor_beat,
            },
            RenderSource::Live(&live),
        );
        assert_eq!(frame.len(), FIXTURE_COUNT);
        let _ = publisher.publish(1, snapshot.cursor_beat, frame);
    }

    let wall_elapsed = started.elapsed();
    let actual_beats = core.snapshot().cursor_beat;
    let final_frame = render_at(
        &show,
        RenderTime { beat: actual_beats },
        RenderSource::Live(&live),
    );
    let expected_beats = DURATION.as_secs_f64() * f64::from(BPM) / 60.0;
    let logical_drift_ms = (actual_beats - expected_beats) * 60_000.0 / f64::from(BPM);
    assert!(logical_drift_ms.abs() <= 0.1);

    LoadedRuntimeReport {
        duration_target_ms: DURATION.as_millis() as u64,
        bpm: BPM,
        output_hz: output_rate.hz(),
        tick_count,
        fixture_count: FIXTURE_COUNT,
        fixture_evaluations: tick_count * FIXTURE_COUNT as u64,
        expected_beats,
        actual_beats,
        logical_drift_ms,
        wall_elapsed_ms: wall_elapsed.as_secs_f64() * 1_000.0,
        simulation_realtime_factor: DURATION.as_secs_f64() / wall_elapsed.as_secs_f64(),
        mean_render_publish_us: wall_elapsed.as_secs_f64() * 1_000_000.0 / tick_count as f64,
        final_frame_sequence: tick_count,
        final_frame_checksum: frame_checksum(&final_frame),
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
        name: "All".to_string(),
        sorted_fixture_ids: fixtures.iter().map(|fixture| fixture.id).collect(),
        blocks: vec![1; fixture_count],
    };
    let phaser = CompiledPhaser {
        id: "loaded".to_string(),
        name: "Loaded runtime".to_string(),
        target: "All".to_string(),
        multiplier: Some(1.0),
        steps: vec![
            CompiledStep {
                color: (255, 255, 255),
                dimmer: 1.0,
                width: 50.0,
                transition: 100.0,
                accel: 0,
                decel: 0,
            },
            CompiledStep {
                color: (0, 0, 0),
                dimmer: 0.0,
                width: 50.0,
                transition: 100.0,
                accel: 0,
                decel: 0,
            },
        ],
        phase: PhaseConfig::Spread {
            from: 0.0,
            to: 100.0,
        },
    };

    CompiledShow {
        fixtures,
        groups: HashMap::from([(group.name.clone(), group)]),
        phasers: HashMap::from([(phaser.id.clone(), phaser)]),
        ..CompiledShow::default()
    }
}

fn frame_checksum(frame: &[lumina_ai_lib::engine::FixtureOutput]) -> u64 {
    frame.iter().fold(0_u64, |checksum, output| {
        checksum
            .wrapping_mul(16_777_619)
            .wrapping_add(u64::from(output.id))
            .wrapping_add(u64::from(output.r) << 8)
            .wrapping_add(u64::from(output.g) << 16)
            .wrapping_add(u64::from(output.b) << 24)
            .wrapping_add(u64::from(output.dimmer.to_bits()))
    })
}

use lumina_ai_lib::compiler::{CompiledGroup, CompiledShow, Fixture};
use lumina_ai_lib::engine::attribute::{resolve_attribute, FixtureFrame};
use lumina_ai_lib::engine::clock::ManualClock;
use lumina_ai_lib::engine::effect::{
    common_parameters, CompiledEffectGraph, CompiledEffectNode, CompiledEffectStep,
    CompiledProfileSequence, EffectCatalog, EffectDefinition, EffectDefinitionHandle,
    EffectInstance, EffectNodeHandle, EffectSource, SpatialBasis,
};
use lumina_ai_lib::engine::output::{LogicalFrame, OutputHub};
use lumina_ai_lib::engine::profile::{
    profile_by_handle, profile_handle_by_id, AttributeValue, FixtureProfileHandle,
    COLOR_RGB_ATTRIBUTE, GENERIC_RGB_PROFILE_ID, INTENSITY_ATTRIBUTE,
};
use lumina_ai_lib::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use lumina_ai_lib::engine::transport::{OutputRate, RealtimeCore};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
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
    let output_hub = OutputHub::default();
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
        let logical_frame = Arc::new(LogicalFrame::new(1, snapshot.cursor_beat, frame));
        let dispatch = output_hub.dispatch(logical_frame, false);
        assert_eq!(dispatch.accepted, 1);
        assert!(dispatch.errors.is_empty());
        let preview = output_hub
            .take_preview_payload()
            .expect("preview sink state")
            .expect("preview frame");
        assert_eq!(preview.show_revision, 1);
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
        id: "benchmark.loaded".to_string(),
        name: "Loaded runtime".to_string(),
        revision: 1,
        source: EffectSource::ProjectLocal,
        parameters: common_parameters(1.0),
        graph: CompiledEffectGraph {
            nodes: vec![
                CompiledEffectNode::Time,
                CompiledEffectNode::SpatialPhase {
                    input: EffectNodeHandle::from_index(0).expect("time handle"),
                    basis: SpatialBasis::Index,
                    from: 0.0,
                    to: 1.0,
                    wrap: false,
                    group_size: None,
                    custom_order: Vec::new(),
                },
                CompiledEffectNode::StepSequence {
                    phase: EffectNodeHandle::from_index(1).expect("spatial handle"),
                    profiles: HashMap::from([(
                        profile,
                        profile_sequence(
                            profile,
                            vec![
                                ([255, 255, 255], 1.0, 50.0, 100.0),
                                ([0, 0, 0], 0.0, 50.0, 100.0),
                            ],
                        ),
                    )]),
                },
                CompiledEffectNode::AttributeWriter {
                    input: EffectNodeHandle::from_index(2).expect("sequence handle"),
                    mask: None,
                    attributes: HashMap::new(),
                },
            ],
            writers: vec![EffectNodeHandle::from_index(3).expect("writer handle")],
        },
        catalog: EffectCatalog::default(),
    };
    let offsets: Vec<_> = (0..fixture_count)
        .map(|index| {
            if fixture_count <= 1 {
                0.0
            } else {
                index as f64 / (fixture_count - 1) as f64
            }
        })
        .collect();
    let instance = EffectInstance {
        id: "loaded".to_string(),
        definition: EffectDefinitionHandle::from_index(0),
        target_group_id: "all".to_string(),
        parameter_overrides: HashMap::new(),
        seed: EffectInstance::stable_seed("loaded"),
        phase_offset: 0.0,
        priority: 0,
        mix_overrides: HashMap::new(),
        spatial_offsets: HashMap::from([(
            EffectNodeHandle::from_index(1).expect("spatial handle"),
            offsets,
        )]),
        targeting_scene: None,
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
    let attribute_count = profile_by_handle(profile).attributes.len();
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

fn frame_checksum(frame: &[FixtureFrame]) -> u64 {
    frame.iter().fold(0_u64, |checksum, output| {
        output.values().iter().fold(
            checksum
                .wrapping_mul(16_777_619)
                .wrapping_add(u64::from(output.id))
                .wrapping_add(output.profile.index() as u64),
            |value_checksum, value| {
                value_checksum
                    .wrapping_mul(16_777_619)
                    .wrapping_add(value_bits(value))
            },
        )
    })
}

fn value_bits(value: &AttributeValue) -> u64 {
    match value {
        AttributeValue::Scalar(value) | AttributeValue::Angle(value) => u64::from(value.to_bits()),
        AttributeValue::Color([red, green, blue]) => {
            u64::from(*red) | (u64::from(*green) << 8) | (u64::from(*blue) << 16)
        }
        AttributeValue::Enum(value) => value.bytes().fold(0_u64, |checksum, byte| {
            checksum.wrapping_mul(257).wrapping_add(u64::from(byte))
        }),
        AttributeValue::Boolean(value) => u64::from(*value),
    }
}

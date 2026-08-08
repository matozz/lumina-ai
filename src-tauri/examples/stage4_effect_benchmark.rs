use lumina_ai_lib::compiler::Compiler;
use lumina_ai_lib::document::load_document;
use lumina_ai_lib::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use serde::Serialize;
use std::hint::black_box;
use std::time::{Duration, Instant};

const FIXTURE_COUNT: usize = 1_000;
const EFFECT_LAYERS: usize = 4;
const SAMPLES: usize = 120;
const FRAME_BUDGET_US: f64 = 1_000_000.0 / 60.0;

#[derive(Serialize)]
struct EffectBenchmarkReport {
    schema_version: u32,
    source_commit: String,
    fixture_count: usize,
    effect_layers: usize,
    samples: usize,
    p50_us: f64,
    p95_us: f64,
    mean_us: f64,
    frame_budget_us: f64,
    within_60hz_budget: bool,
}

fn main() {
    let show = benchmark_show();
    let live: Vec<_> = (0..EFFECT_LAYERS)
        .map(|index| LivePhaser {
            id: format!("layer-{index}"),
            start_beat: 0.0,
            phase_offset: index as f64 / EFFECT_LAYERS as f64,
            multiplier: 1.0,
        })
        .collect();
    for index in 0..10 {
        black_box(render_at(
            &show,
            RenderTime {
                beat: index as f64 / 60.0,
            },
            RenderSource::Live(&live),
        ));
    }

    let mut durations = Vec::with_capacity(SAMPLES);
    for index in 0..SAMPLES {
        let started = Instant::now();
        let frame = render_at(
            &show,
            RenderTime {
                beat: index as f64 / 60.0,
            },
            RenderSource::Live(&live),
        );
        durations.push(started.elapsed());
        assert_eq!(frame.len(), FIXTURE_COUNT);
        black_box(frame);
    }
    durations.sort();
    let p50_us = percentile_us(&durations, 0.50);
    let p95_us = percentile_us(&durations, 0.95);
    let mean_us = durations.iter().map(Duration::as_secs_f64).sum::<f64>() * 1_000_000.0
        / durations.len() as f64;
    let report = EffectBenchmarkReport {
        schema_version: 1,
        source_commit: std::env::var("LUMINA_BASELINE_COMMIT")
            .unwrap_or_else(|_| "working-tree".to_string()),
        fixture_count: FIXTURE_COUNT,
        effect_layers: EFFECT_LAYERS,
        samples: SAMPLES,
        p50_us,
        p95_us,
        mean_us,
        frame_budget_us: FRAME_BUDGET_US,
        within_60hz_budget: p95_us <= FRAME_BUDGET_US,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("benchmark report")
    );
    assert!(
        report.within_60hz_budget,
        "typed effect p95 {:.2}us exceeds the 60Hz budget {:.2}us",
        report.p95_us, report.frame_budget_us
    );
}

fn percentile_us(durations: &[Duration], percentile: f64) -> f64 {
    let index = ((durations.len() - 1) as f64 * percentile).round() as usize;
    durations[index].as_secs_f64() * 1_000_000.0
}

fn benchmark_show() -> lumina_ai_lib::compiler::CompiledShow {
    let instances: Vec<_> = (0..EFFECT_LAYERS)
        .map(|index| {
            serde_json::json!({
                "id": format!("layer-{index}"),
                "definition_id": "benchmark.layered-chase",
                "definition_revision": 1,
                "target_group_id": "all",
                "seed": format!("{index:016x}")
            })
        })
        .collect();
    let source = serde_json::json!({
        "schema_version": 1,
        "meta": { "name": "Stage 4 layered effect benchmark" },
        "patch": [{ "profile_id": "generic-rgb", "id_range": [1, FIXTURE_COUNT] }],
        "layout": { "type": "generator", "generator": {
            "shape": "matrix", "rows": 20, "columns": 50, "spacing": 1
        }},
        "groups": [{ "id": "all", "name": "All", "fixtures": { "range": [1, FIXTURE_COUNT] }, "sort_by": "x" }],
        "effect_definitions": [{
            "id": "benchmark.layered-chase",
            "name": "Layered chase",
            "revision": 1,
            "source": "project_local",
            "parameters": [],
            "graph": { "nodes": [
                { "type": "time", "id": "time" },
                { "type": "spatial_phase", "id": "spatial", "input": { "node_id": "time", "port": "scalar" },
                  "basis": "x", "from": 0, "to": 1, "wrap": true },
                { "type": "oscillator", "id": "wave", "waveform": "sine",
                  "phase": { "node_id": "spatial", "port": "scalar" } },
                { "type": "color_gradient", "id": "color", "input": { "node_id": "wave", "port": "scalar" },
                  "stops": [{ "position": 0, "color": "#0000ff" }, { "position": 1, "color": "#ff4000" }] },
                { "type": "attribute_writer", "id": "color-output", "input": { "node_id": "color", "port": "color" },
                  "attribute_id": "color.rgb" },
                { "type": "attribute_writer", "id": "intensity-output", "input": { "node_id": "wave", "port": "scalar" },
                  "attribute_id": "intensity" }
            ]},
            "catalog": { "mood": ["benchmark"], "energy": 0.8, "density": 0.8, "motion": "chase",
              "colorfulness": 1, "strobe_risk": "none", "required_attributes": ["intensity", "color.rgb"] }
        }],
        "effect_instances": instances
    });
    let document = load_document(&source.to_string())
        .expect("benchmark document")
        .document;
    Compiler::compile_document(document).expect("benchmark compile")
}

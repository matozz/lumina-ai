use crate::compiler::diagnostic::{Diagnostic, PROJECT_REFERENCE_NOT_FOUND};
use crate::compiler::Compiler;
use crate::document::{
    layout_to_show_dsl, resolve_target_set, AssetRef, EffectDefinitionDSL,
    EffectDefinitionDocument, EffectInstanceDSL, EffectTempoBehaviorDSL, GroupDSL,
    GroupFixturesDSL, LayoutDefinition, MetaDSL, ParameterValueDSL, ProjectBundle, ShowDocumentV1,
    StageDocument, StrobeRiskDSL, TargetSetDefinition, TempoBehaviorKindDSL,
    CURRENT_SCHEMA_VERSION,
};
use crate::engine::attribute::{resolve_attribute, FixtureFrame};
use crate::engine::effect::{is_beat_sync_speed_multiplier, CompiledEffectNode, EffectNodeHandle};
use crate::engine::profile::{
    AttributeValue, COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE, PAN_ATTRIBUTE, TILT_ATTRIBUTE,
};
use crate::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

pub const TEMPORAL_FINGERPRINT_SCHEMA_VERSION: u32 = 1;
pub const LEGAL_TEMPORAL_SPEEDS: [f64; 6] = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];
const TEMPORAL_INSTANCE_ID: &str = "__temporal_analysis__";
const TEMPORAL_GROUP_ID: &str = "__temporal_target__";

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct TemporalSamplingConfig {
    #[schemars(range(min = 1))]
    pub primary_event_window: u32,
    #[schemars(range(min = 16, max = 2_048))]
    pub base_samples_per_beat: u32,
    #[schemars(range(min = 8, max = 256))]
    pub minimum_samples_per_event: u32,
    #[schemars(range(min = 1.0, max = 240.0))]
    pub preview_fps: f64,
}

impl Default for TemporalSamplingConfig {
    fn default() -> Self {
        Self {
            primary_event_window: 4,
            base_samples_per_beat: 128,
            minimum_samples_per_event: 32,
            preview_fps: 30.0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalAnalysisRequest {
    pub effect_ref: AssetRef,
    pub target_set_id: String,
    #[schemars(range(min = 20.0, max = 400.0))]
    pub bpm: f64,
    pub speeds: Vec<f64>,
    pub seed: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub parameter_overrides: BTreeMap<String, ParameterValueDSL>,
    pub sampling: TemporalSamplingConfig,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalAnalyzerContract {
    pub request: TemporalAnalysisRequest,
    pub report: TemporalFingerprintReport,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalFingerprintReport {
    pub schema_version: u32,
    pub cache_key: String,
    pub identity: TemporalAnalysisIdentity,
    pub behavior: EffectTempoBehaviorDSL,
    pub fingerprints: Vec<TemporalSpeedFingerprint>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalAnalysisIdentity {
    pub effect_ref: AssetRef,
    pub stage_ref: AssetRef,
    pub layout_ref: AssetRef,
    pub target_set_id: String,
    pub target_fixture_count: usize,
    pub seed: String,
    pub parameter_overrides: BTreeMap<String, ParameterValueDSL>,
    pub bpm: f64,
    pub speeds: Vec<f64>,
    pub sampling: TemporalSamplingConfig,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalSpeedFingerprint {
    pub speed: f64,
    pub graph_cycles_per_beat: f64,
    pub primary_events_per_beat: f64,
    pub primary_events_per_second: f64,
    pub sample_duration_beats: f64,
    pub sample_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peaks: Option<TemporalPeakMetric>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_duty_cycle: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intensity: Option<TemporalDistributionMetric>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_fixture_fraction: Option<TemporalDistributionMetric>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spatial_centroid: Option<TemporalCentroidMetric>,
    pub frame_delta_change_energy: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_change_energy: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strobe: Option<TemporalStrobeMetric>,
    pub aliasing: TemporalAliasingMetric,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalPeakMetric {
    pub count: u32,
    pub phases: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct TemporalDistributionMetric {
    pub mean: f64,
    pub variance: f64,
    pub minimum: f64,
    pub maximum: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalCentroidMetric {
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub path_distance: f64,
    pub direction_reversals: u32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalStrobeMetric {
    pub maximum_fixture_flash_hz: f64,
    pub observed_risk: StrobeRiskDSL,
    pub exceeds_authored_safety_limit: bool,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TemporalAliasingRisk {
    None,
    Caution,
    Severe,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TemporalAliasingMetric {
    pub preview_fps: f64,
    pub frames_per_primary_event: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frames_per_on_window: Option<f64>,
    pub risk: TemporalAliasingRisk,
}

struct CompiledTemporalRequest<'a> {
    effect: &'a EffectDefinitionDocument,
    stage: &'a StageDocument,
    layout: &'a LayoutDefinition,
    target: &'a TargetSetDefinition,
    target_fixture_ids: Vec<u32>,
}

struct SpatialProgressBasis {
    offsets: Vec<f64>,
    wraps: bool,
}

pub fn analyze_project_temporal_behavior(
    project: &ProjectBundle,
    request: &TemporalAnalysisRequest,
) -> Result<TemporalFingerprintReport, Vec<Diagnostic>> {
    validate_request(request)?;
    let compiled_request = resolve_request(project, request)?;
    let identity = TemporalAnalysisIdentity {
        effect_ref: request.effect_ref.clone(),
        stage_ref: AssetRef {
            id: compiled_request.stage.id.clone(),
            revision: compiled_request.stage.revision,
        },
        layout_ref: compiled_request.stage.layout_ref.clone(),
        target_set_id: request.target_set_id.clone(),
        target_fixture_count: compiled_request.target_fixture_ids.len(),
        seed: request.seed.clone(),
        parameter_overrides: request.parameter_overrides.clone(),
        bpm: request.bpm,
        speeds: request.speeds.clone(),
        sampling: request.sampling,
    };
    let cache_key = stable_cache_key(&identity);
    let mut fingerprints = Vec::with_capacity(request.speeds.len());
    for speed in &request.speeds {
        fingerprints.push(analyze_speed(&compiled_request, request, *speed)?);
    }
    Ok(TemporalFingerprintReport {
        schema_version: TEMPORAL_FINGERPRINT_SCHEMA_VERSION,
        cache_key,
        identity,
        behavior: compiled_request.effect.tempo.clone(),
        fingerprints,
    })
}

pub fn render_temporal_contact_sheet_svg(
    project: &ProjectBundle,
    request: &TemporalAnalysisRequest,
    speed: f64,
    frame_count: usize,
) -> Result<String, Vec<Diagnostic>> {
    validate_request(request)?;
    if !is_beat_sync_speed_multiplier(speed) {
        return Err(vec![request_diagnostic(
            "speed",
            "Contact-sheet speed must be a legal beat-sync multiplier.",
        )]);
    }
    let compiled_request = resolve_request(project, request)?;
    let (show, active) = compile_show(&compiled_request, request, speed)?;
    let frame_count = frame_count.clamp(4, 32);
    let columns = frame_count.min(8);
    let rows = frame_count.div_ceil(columns);
    let cell_width = 180.0;
    let cell_height = 150.0;
    let graph_cycles_per_beat = speed * compiled_request.effect.tempo.one_x_events_per_beat
        / compiled_request.effect.tempo.events_per_graph_cycle;
    let duration_beats = 2.0 / (speed * compiled_request.effect.tempo.one_x_events_per_beat);
    let target: HashMap<_, _> = compiled_request
        .target_fixture_ids
        .iter()
        .enumerate()
        .map(|(index, id)| (*id, index))
        .collect();
    let normalized = normalized_target_coords(&show, &compiled_request.target_fixture_ids);
    let mut svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\"><rect width=\"100%\" height=\"100%\" fill=\"#080b12\"/><style>text{{font:11px ui-monospace,monospace;fill:#cbd5e1}}</style>",
        columns as f64 * cell_width,
        rows as f64 * cell_height,
        columns as f64 * cell_width,
        rows as f64 * cell_height,
    );
    for frame_index in 0..frame_count {
        let beat = frame_index as f64 / frame_count as f64 * duration_beats;
        let frames = render_at(&show, RenderTime { beat }, RenderSource::Live(&active));
        let column = frame_index % columns;
        let row = frame_index / columns;
        let ox = column as f64 * cell_width;
        let oy = row as f64 * cell_height;
        svg.push_str(&format!(
            "<g transform=\"translate({ox},{oy})\"><rect x=\"4\" y=\"4\" width=\"172\" height=\"142\" rx=\"8\" fill=\"#101826\" stroke=\"#263449\"/><text x=\"10\" y=\"18\">{speed}× · b{beat:.3} · g{:.3}</text>",
            beat * graph_cycles_per_beat
        ));
        for frame in &frames {
            let Some(index) = target.get(&frame.id).copied() else {
                continue;
            };
            let (x, y) = normalized[index];
            let intensity = frame_scalar(frame, INTENSITY_ATTRIBUTE).unwrap_or(0.0);
            let color = frame_color(frame).unwrap_or([255, 255, 255]);
            let red = (f64::from(color[0]) * intensity).round() as u8;
            let green = (f64::from(color[1]) * intensity).round() as u8;
            let blue = (f64::from(color[2]) * intensity).round() as u8;
            svg.push_str(&format!(
                "<circle cx=\"{:.2}\" cy=\"{:.2}\" r=\"3.3\" fill=\"#{red:02X}{green:02X}{blue:02X}\"/>",
                12.0 + x * 156.0,
                28.0 + y * 106.0
            ));
        }
        svg.push_str("</g>");
    }
    svg.push_str("</svg>");
    Ok(svg)
}

fn validate_request(request: &TemporalAnalysisRequest) -> Result<(), Vec<Diagnostic>> {
    let mut diagnostics = Vec::new();
    if !request.bpm.is_finite() || !(20.0..=400.0).contains(&request.bpm) {
        diagnostics.push(request_diagnostic(
            "bpm",
            "BPM must be finite and inside 20–400.",
        ));
    }
    if request.speeds.is_empty()
        || request
            .speeds
            .iter()
            .any(|speed| !is_beat_sync_speed_multiplier(*speed))
    {
        diagnostics.push(request_diagnostic(
            "speeds",
            "Temporal analysis speeds must use 0.25, 0.5, 1, 2, 4, or 8.",
        ));
    }
    if request.seed.len() != 16
        || !request
            .seed
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        diagnostics.push(request_diagnostic(
            "seed",
            "Temporal analysis seed must be exactly 16 lowercase hexadecimal digits.",
        ));
    }
    let sampling = request.sampling;
    if sampling.primary_event_window == 0
        || !(16..=2_048).contains(&sampling.base_samples_per_beat)
        || !(8..=256).contains(&sampling.minimum_samples_per_event)
        || !sampling.preview_fps.is_finite()
        || !(1.0..=240.0).contains(&sampling.preview_fps)
    {
        diagnostics.push(request_diagnostic(
            "sampling",
            "Temporal sampling configuration is outside its supported deterministic range.",
        ));
    }
    if diagnostics.is_empty() {
        Ok(())
    } else {
        Err(diagnostics)
    }
}

fn resolve_request<'a>(
    project: &'a ProjectBundle,
    request: &TemporalAnalysisRequest,
) -> Result<CompiledTemporalRequest<'a>, Vec<Diagnostic>> {
    let stage = project
        .stages
        .iter()
        .find(|stage| {
            stage.id == project.manifest.stage_ref.id
                && stage.revision == project.manifest.stage_ref.revision
        })
        .ok_or_else(|| {
            vec![request_diagnostic(
                "stage_ref",
                "Active Stage does not resolve.",
            )]
        })?;
    let layout = project
        .layouts
        .iter()
        .find(|layout| {
            layout.id == stage.layout_ref.id && layout.revision == stage.layout_ref.revision
        })
        .ok_or_else(|| {
            vec![request_diagnostic(
                "layout_ref",
                "Stage Layout does not resolve.",
            )]
        })?;
    let effect = project
        .effects
        .iter()
        .find(|effect| {
            effect.id == request.effect_ref.id && effect.revision == request.effect_ref.revision
        })
        .ok_or_else(|| {
            vec![request_diagnostic(
                "effect_ref",
                "Exact Effect does not resolve.",
            )]
        })?;
    let target = stage
        .target_sets
        .iter()
        .find(|target| target.id == request.target_set_id)
        .ok_or_else(|| {
            vec![request_diagnostic(
                "target_set_id",
                "Stage TargetSet does not resolve.",
            )]
        })?;
    let resolved = resolve_target_set(stage, layout, target);
    if resolved.fixture_ids.is_empty() {
        return Err(vec![request_diagnostic(
            "target_set_id",
            "Temporal analysis TargetSet resolves to no fixtures.",
        )]);
    }
    Ok(CompiledTemporalRequest {
        effect,
        stage,
        layout,
        target,
        target_fixture_ids: resolved.fixture_ids,
    })
}

fn compile_show(
    compiled_request: &CompiledTemporalRequest<'_>,
    request: &TemporalAnalysisRequest,
    speed: f64,
) -> Result<(crate::compiler::CompiledShow, [LivePhaser; 1]), Vec<Diagnostic>> {
    let mut overrides = request.parameter_overrides.clone();
    overrides.insert("speed".to_string(), ParameterValueDSL::Scalar(speed));
    let fixture_ids = stage_fixture_ids(compiled_request.stage);
    let document = ShowDocumentV1 {
        schema_version: CURRENT_SCHEMA_VERSION,
        meta: MetaDSL {
            name: format!("Temporal analysis · {}", compiled_request.effect.name),
        },
        patch: compiled_request.stage.patch.clone(),
        layout: layout_to_show_dsl(compiled_request.layout, &fixture_ids),
        groups: vec![GroupDSL {
            id: TEMPORAL_GROUP_ID.to_string(),
            name: format!("TargetSet · {}", compiled_request.target.name),
            fixtures: GroupFixturesDSL::List(compiled_request.target_fixture_ids.clone()),
            sort_by: None,
        }],
        effect_definitions: vec![EffectDefinitionDSL {
            id: compiled_request.effect.id.clone(),
            name: compiled_request.effect.name.clone(),
            revision: compiled_request.effect.revision,
            source: compiled_request.effect.source,
            parameters: compiled_request.effect.parameters.clone(),
            tempo: compiled_request.effect.tempo.clone(),
            graph: compiled_request.effect.graph.clone(),
            catalog: compiled_request.effect.catalog.clone(),
        }],
        effect_instances: vec![EffectInstanceDSL {
            id: TEMPORAL_INSTANCE_ID.to_string(),
            definition_id: compiled_request.effect.id.clone(),
            definition_revision: compiled_request.effect.revision,
            target_group_id: TEMPORAL_GROUP_ID.to_string(),
            parameter_overrides: overrides,
            seed: request.seed.clone(),
        }],
        timeline: None,
    };
    let show = Compiler::compile_document(document)?;
    let active = [LivePhaser {
        id: TEMPORAL_INSTANCE_ID.to_string(),
        start_beat: 0.0,
        phase_offset: 0.0,
        multiplier: speed,
    }];
    Ok((show, active))
}

fn analyze_speed(
    compiled_request: &CompiledTemporalRequest<'_>,
    request: &TemporalAnalysisRequest,
    speed: f64,
) -> Result<TemporalSpeedFingerprint, Vec<Diagnostic>> {
    let (show, active) = compile_show(compiled_request, request, speed)?;
    let events_per_beat = speed * compiled_request.effect.tempo.one_x_events_per_beat;
    let events_per_second = events_per_beat * request.bpm / 60.0;
    let duration_beats =
        (f64::from(request.sampling.primary_event_window) / events_per_beat).max(4.0);
    let samples_per_beat = request.sampling.base_samples_per_beat.max(
        (events_per_beat * f64::from(request.sampling.minimum_samples_per_event)).ceil() as u32,
    );
    let steps = (duration_beats * f64::from(samples_per_beat)).ceil() as u32;
    let target_indices: Vec<_> = compiled_request
        .target_fixture_ids
        .iter()
        .filter_map(|fixture_id| {
            show.fixtures
                .iter()
                .position(|fixture| fixture.id == *fixture_id)
        })
        .collect();
    let spatial_progress_basis = spatial_progress_basis(&show, &target_indices);
    let normalized_coords = normalized_target_coords(&show, &compiled_request.target_fixture_ids);
    let target_count = target_indices.len();
    let mut intensity_values = Vec::with_capacity((steps + 1) as usize);
    let mut active_fractions = Vec::with_capacity((steps + 1) as usize);
    let mut centroids = Vec::with_capacity((steps + 1) as usize);
    let mut spatial_progress = Vec::with_capacity((steps + 1) as usize);
    let mut pan_values = Vec::with_capacity((steps + 1) as usize);
    let mut tilt_values = Vec::with_capacity((steps + 1) as usize);
    let mut color_luminance = Vec::with_capacity((steps + 1) as usize);
    let mut previous_frames: Option<Vec<FixtureFrame>> = None;
    let mut previous_on = vec![false; target_count];
    let mut flash_onsets = vec![0_u32; target_count];
    let mut on_samples = 0_u64;
    let mut frame_delta_sum = 0.0;
    let mut color_delta_sum = 0.0;
    let mut color_delta_count = 0_u64;

    for sample in 0..=steps {
        let beat = f64::from(sample) / f64::from(samples_per_beat);
        let frames = render_at(&show, RenderTime { beat }, RenderSource::Live(&active));
        let selected: Vec<_> = target_indices
            .iter()
            .map(|index| frames[*index].clone())
            .collect();
        let mut intensity_sum = 0.0;
        let mut active_count = 0_u32;
        let mut centroid_weight = 0.0;
        let mut centroid_x = 0.0;
        let mut centroid_y = 0.0;
        let mut progress_linear = 0.0;
        let mut progress_sine = 0.0;
        let mut progress_cosine = 0.0;
        let mut pan_sum = 0.0;
        let mut pan_count = 0_u32;
        let mut tilt_sum = 0.0;
        let mut tilt_count = 0_u32;
        let mut luminance_sum = 0.0;
        let mut color_count = 0_u32;
        for (index, frame) in selected.iter().enumerate() {
            let intensity = frame_scalar(frame, INTENSITY_ATTRIBUTE)
                .unwrap_or(0.0)
                .clamp(0.0, 1.0);
            intensity_sum += intensity;
            let on = intensity > 0.1;
            if on {
                active_count += 1;
                on_samples += 1;
            }
            if sample > 0 && on && !previous_on[index] {
                flash_onsets[index] = flash_onsets[index].saturating_add(1);
            }
            previous_on[index] = on;
            centroid_weight += intensity;
            centroid_x += normalized_coords[index].0 * intensity;
            centroid_y += normalized_coords[index].1 * intensity;
            if let Some(basis) = &spatial_progress_basis {
                if basis.wraps {
                    let angle = basis.offsets[index].rem_euclid(1.0) * std::f64::consts::TAU;
                    progress_sine += angle.sin() * intensity;
                    progress_cosine += angle.cos() * intensity;
                } else {
                    progress_linear += basis.offsets[index] * intensity;
                }
            }
            if let Some(value) = frame_scalar(frame, PAN_ATTRIBUTE) {
                pan_sum += value;
                pan_count += 1;
            }
            if let Some(value) = frame_scalar(frame, TILT_ATTRIBUTE) {
                tilt_sum += value;
                tilt_count += 1;
            }
            if let Some(color) = frame_color(frame) {
                luminance_sum += (0.2126 * f64::from(color[0])
                    + 0.7152 * f64::from(color[1])
                    + 0.0722 * f64::from(color[2]))
                    / 255.0;
                color_count += 1;
            }
        }
        intensity_values.push(intensity_sum / target_count as f64);
        active_fractions.push(f64::from(active_count) / target_count as f64);
        centroids.push(
            (centroid_weight > f64::EPSILON)
                .then_some((centroid_x / centroid_weight, centroid_y / centroid_weight)),
        );
        spatial_progress.push(spatial_progress_basis.as_ref().and_then(|basis| {
            if centroid_weight <= f64::EPSILON {
                return None;
            }
            if basis.wraps {
                let concentration = progress_sine.hypot(progress_cosine) / centroid_weight;
                (concentration > 0.01).then_some(
                    (progress_sine.atan2(progress_cosine) / std::f64::consts::TAU).rem_euclid(1.0),
                )
            } else {
                Some(progress_linear / centroid_weight)
            }
        }));
        pan_values.push((pan_count > 0).then_some(pan_sum / f64::from(pan_count)));
        tilt_values.push((tilt_count > 0).then_some(tilt_sum / f64::from(tilt_count)));
        color_luminance.push((color_count > 0).then_some(luminance_sum / f64::from(color_count)));
        if let Some(previous) = &previous_frames {
            frame_delta_sum += frame_delta_energy(previous, &selected);
            let color_delta = color_delta_energy(previous, &selected);
            if color_delta > f64::EPSILON {
                color_delta_sum += color_delta;
                color_delta_count += 1;
            }
        }
        previous_frames = Some(selected);
    }

    let sample_count = steps + 1;
    let transitions = f64::from(steps.max(1));
    let intensity = distribution(&intensity_values);
    let active_fixture_fraction = distribution(&active_fractions);
    let centroid = centroid_metric(
        &centroids,
        &spatial_progress,
        spatial_progress_basis
            .as_ref()
            .is_some_and(|basis| basis.wraps),
    );
    let primary_signal = select_primary_signal(
        &centroids,
        &pan_values,
        &tilt_values,
        &intensity_values,
        &color_luminance,
    );
    let peaks =
        primary_signal.and_then(|signal| peak_metric(&signal, events_per_beat, samples_per_beat));
    let is_pulse = matches!(
        compiled_request.effect.tempo.kind,
        TempoBehaviorKindDSL::Pulse
    );
    let on_duty_cycle = (is_pulse
        || compiled_request.effect.catalog.strobe_risk != StrobeRiskDSL::None)
        .then_some(on_samples as f64 / (u64::from(sample_count) * target_count as u64) as f64);
    let maximum_fixture_flash_hz = flash_onsets.iter().copied().max().map_or(0.0, |onsets| {
        f64::from(onsets) / (duration_beats * 60.0 / request.bpm)
    });
    let strobe = (is_pulse || compiled_request.effect.catalog.strobe_risk != StrobeRiskDSL::None)
        .then(|| TemporalStrobeMetric {
            maximum_fixture_flash_hz,
            observed_risk: strobe_risk(maximum_fixture_flash_hz),
            exceeds_authored_safety_limit: compiled_request.effect.tempo.safety.is_some_and(
                |limit| maximum_fixture_flash_hz > limit.max_primary_events_per_second,
            ),
        });
    let frames_per_primary_event = request.sampling.preview_fps / events_per_second;
    let frames_per_on_window = compiled_request
        .effect
        .tempo
        .duty_cycle
        .map(|duty| frames_per_primary_event * duty);
    let aliasing_risk = if frames_per_primary_event < 2.0
        || frames_per_on_window.is_some_and(|frames| frames < 1.0)
    {
        TemporalAliasingRisk::Severe
    } else if frames_per_primary_event < 4.0
        || frames_per_on_window.is_some_and(|frames| frames < 2.0)
    {
        TemporalAliasingRisk::Caution
    } else {
        TemporalAliasingRisk::None
    };

    Ok(TemporalSpeedFingerprint {
        speed,
        graph_cycles_per_beat: speed * compiled_request.effect.tempo.one_x_events_per_beat
            / compiled_request.effect.tempo.events_per_graph_cycle,
        primary_events_per_beat: events_per_beat,
        primary_events_per_second: events_per_second,
        sample_duration_beats: duration_beats,
        sample_count,
        peaks,
        on_duty_cycle,
        intensity,
        active_fixture_fraction,
        spatial_centroid: centroid,
        frame_delta_change_energy: frame_delta_sum / transitions,
        color_change_energy: (color_delta_count > 0)
            .then_some(color_delta_sum / color_delta_count as f64),
        strobe,
        aliasing: TemporalAliasingMetric {
            preview_fps: request.sampling.preview_fps,
            frames_per_primary_event,
            frames_per_on_window,
            risk: aliasing_risk,
        },
    })
}

fn stage_fixture_ids(stage: &StageDocument) -> Vec<u32> {
    stage
        .patch
        .iter()
        .flat_map(|patch| patch.id_range.0..=patch.id_range.1)
        .collect()
}

fn spatial_progress_basis(
    show: &crate::compiler::CompiledShow,
    target_indices: &[usize],
) -> Option<SpatialProgressBasis> {
    let instance = show.effect_instances.get(TEMPORAL_INSTANCE_ID)?;
    let definition = show.effect_definitions.get(instance.definition.index())?;
    let (node_index, wraps) =
        definition
            .graph
            .nodes
            .iter()
            .enumerate()
            .rev()
            .find_map(|(index, node)| match node {
                CompiledEffectNode::SpatialPhase { wrap, .. } => Some((index, *wrap)),
                _ => None,
            })?;
    let handle = EffectNodeHandle::from_index(node_index)?;
    let offsets = instance.spatial_offsets.get(&handle)?;
    let selected = target_indices
        .iter()
        .map(|index| offsets.get(*index).copied())
        .collect::<Option<Vec<_>>>()?;
    (signal_range(&selected) > f64::EPSILON).then_some(SpatialProgressBasis {
        offsets: selected,
        wraps,
    })
}

fn normalized_target_coords(
    show: &crate::compiler::CompiledShow,
    fixture_ids: &[u32],
) -> Vec<(f64, f64)> {
    let coords: HashMap<_, _> = show
        .coords
        .iter()
        .map(|coord| (coord.id, (coord.x, coord.y)))
        .collect();
    let selected: Vec<_> = fixture_ids
        .iter()
        .map(|id| coords.get(id).copied().unwrap_or((0.0, 0.0)))
        .collect();
    let min_x = selected
        .iter()
        .map(|coord| coord.0)
        .fold(f64::INFINITY, f64::min);
    let max_x = selected
        .iter()
        .map(|coord| coord.0)
        .fold(f64::NEG_INFINITY, f64::max);
    let min_y = selected
        .iter()
        .map(|coord| coord.1)
        .fold(f64::INFINITY, f64::min);
    let max_y = selected
        .iter()
        .map(|coord| coord.1)
        .fold(f64::NEG_INFINITY, f64::max);
    let width = (max_x - min_x).max(f64::EPSILON);
    let height = (max_y - min_y).max(f64::EPSILON);
    selected
        .into_iter()
        .map(|(x, y)| ((x - min_x) / width, (y - min_y) / height))
        .collect()
}

fn frame_scalar(frame: &FixtureFrame, attribute_id: &str) -> Option<f64> {
    let handle = resolve_attribute(frame.profile, attribute_id)?;
    match frame.value(handle)? {
        AttributeValue::Scalar(value) | AttributeValue::Angle(value) => Some(f64::from(*value)),
        _ => None,
    }
}

fn frame_color(frame: &FixtureFrame) -> Option<[u8; 3]> {
    let handle = resolve_attribute(frame.profile, COLOR_RGB_ATTRIBUTE)?;
    match frame.value(handle)? {
        AttributeValue::Color(value) => Some(*value),
        _ => None,
    }
}

fn frame_delta_energy(previous: &[FixtureFrame], current: &[FixtureFrame]) -> f64 {
    previous
        .iter()
        .zip(current)
        .map(|(left, right)| {
            let intensity = (frame_scalar(left, INTENSITY_ATTRIBUTE).unwrap_or(0.0)
                - frame_scalar(right, INTENSITY_ATTRIBUTE).unwrap_or(0.0))
            .abs();
            let pan = (frame_scalar(left, PAN_ATTRIBUTE).unwrap_or(0.0)
                - frame_scalar(right, PAN_ATTRIBUTE).unwrap_or(0.0))
            .abs()
                / 360.0;
            let tilt = (frame_scalar(left, TILT_ATTRIBUTE).unwrap_or(0.0)
                - frame_scalar(right, TILT_ATTRIBUTE).unwrap_or(0.0))
            .abs()
                / 180.0;
            let color = color_distance(frame_color(left), frame_color(right));
            (intensity + pan + tilt + color) / 4.0
        })
        .sum::<f64>()
        / previous.len().max(1) as f64
}

fn color_delta_energy(previous: &[FixtureFrame], current: &[FixtureFrame]) -> f64 {
    previous
        .iter()
        .zip(current)
        .map(|(left, right)| color_distance(frame_color(left), frame_color(right)))
        .sum::<f64>()
        / previous.len().max(1) as f64
}

fn color_distance(left: Option<[u8; 3]>, right: Option<[u8; 3]>) -> f64 {
    let (Some(left), Some(right)) = (left, right) else {
        return 0.0;
    };
    let sum = left
        .iter()
        .zip(right)
        .map(|(left, right)| (f64::from(*left) - f64::from(right)).powi(2))
        .sum::<f64>();
    sum.sqrt() / (255.0 * 3.0_f64.sqrt())
}

fn distribution(values: &[f64]) -> Option<TemporalDistributionMetric> {
    if values.is_empty() {
        return None;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / values.len() as f64;
    Some(TemporalDistributionMetric {
        mean,
        variance,
        minimum: values.iter().copied().fold(f64::INFINITY, f64::min),
        maximum: values.iter().copied().fold(f64::NEG_INFINITY, f64::max),
    })
}

fn centroid_metric(
    values: &[Option<(f64, f64)>],
    spatial_progress: &[Option<f64>],
    spatial_progress_wraps: bool,
) -> Option<TemporalCentroidMetric> {
    let points: Vec<_> = values.iter().flatten().copied().collect();
    if points.len() < 3 {
        return None;
    }
    let path_distance = points
        .windows(2)
        .map(|pair| ((pair[1].0 - pair[0].0).powi(2) + (pair[1].1 - pair[0].1).powi(2)).sqrt())
        .sum::<f64>();
    if path_distance <= 0.01 {
        return None;
    }
    let x_range = points
        .iter()
        .map(|point| point.0)
        .fold(f64::NEG_INFINITY, f64::max)
        - points
            .iter()
            .map(|point| point.0)
            .fold(f64::INFINITY, f64::min);
    let y_range = points
        .iter()
        .map(|point| point.1)
        .fold(f64::NEG_INFINITY, f64::max)
        - points
            .iter()
            .map(|point| point.1)
            .fold(f64::INFINITY, f64::min);
    let axis: Vec<_> = points
        .iter()
        .map(|point| if x_range >= y_range { point.0 } else { point.1 })
        .collect();
    let progress = unwrap_spatial_progress(spatial_progress, spatial_progress_wraps);
    Some(TemporalCentroidMetric {
        start: [points[0].0, points[0].1],
        end: [points[points.len() - 1].0, points[points.len() - 1].1],
        path_distance,
        direction_reversals: progress
            .as_deref()
            .map_or_else(|| direction_reversals(&axis), direction_reversals),
    })
}

fn unwrap_spatial_progress(values: &[Option<f64>], wraps: bool) -> Option<Vec<f64>> {
    let raw = values.iter().copied().collect::<Option<Vec<_>>>()?;
    if raw.is_empty() || !wraps {
        return Some(raw);
    }
    let mut unwrapped = Vec::with_capacity(raw.len());
    unwrapped.push(raw[0]);
    for pair in raw.windows(2) {
        let mut delta = pair[1] - pair[0];
        if delta > 0.5 {
            delta -= 1.0;
        } else if delta < -0.5 {
            delta += 1.0;
        }
        unwrapped.push(unwrapped.last().copied().unwrap_or(0.0) + delta);
    }
    Some(unwrapped)
}

fn select_primary_signal(
    centroids: &[Option<(f64, f64)>],
    pan: &[Option<f64>],
    tilt: &[Option<f64>],
    intensity: &[f64],
    color: &[Option<f64>],
) -> Option<Vec<f64>> {
    let centroid_points: Vec<_> = centroids.iter().flatten().copied().collect();
    if centroid_points.len() == centroids.len() {
        let xs: Vec<_> = centroid_points.iter().map(|point| point.0).collect();
        let ys: Vec<_> = centroid_points.iter().map(|point| point.1).collect();
        if signal_range(&xs) > 0.02 || signal_range(&ys) > 0.02 {
            return Some(if signal_range(&xs) >= signal_range(&ys) {
                xs
            } else {
                ys
            });
        }
    }
    for values in [pan, tilt] {
        let signal: Vec<_> = values.iter().flatten().copied().collect();
        if signal.len() == values.len() && signal_range(&signal) > 0.02 {
            return Some(signal);
        }
    }
    if signal_range(intensity) > 0.02 {
        return Some(intensity.to_vec());
    }
    let color_signal: Vec<_> = color.iter().flatten().copied().collect();
    (color_signal.len() == color.len() && signal_range(&color_signal) > 0.02)
        .then_some(color_signal)
}

fn peak_metric(
    values: &[f64],
    events_per_beat: f64,
    samples_per_beat: u32,
) -> Option<TemporalPeakMetric> {
    if values.len() < 3 || signal_range(values) <= 0.02 {
        return None;
    }
    let epsilon = signal_range(values) * 0.01;
    let mut phases = Vec::new();
    for index in 1..values.len() - 1 {
        if values[index] >= values[index - 1] + epsilon
            && values[index] >= values[index + 1] + epsilon
        {
            let beat = index as f64 / f64::from(samples_per_beat);
            phases.push((beat * events_per_beat).rem_euclid(1.0));
        }
    }
    Some(TemporalPeakMetric {
        count: phases.len() as u32,
        phases: phases.into_iter().take(16).collect(),
    })
}

fn signal_range(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - values.iter().copied().fold(f64::INFINITY, f64::min)
}

fn direction_reversals(values: &[f64]) -> u32 {
    let range = signal_range(values);
    if values.len() < 4 || range <= f64::EPSILON {
        return 0;
    }
    let noise_floor = (range * 0.001).max(0.000_001);
    let minimum_run_displacement = range * 0.02;
    let mut runs = Vec::<(i8, u32, f64)>::new();
    let mut current_sign = 0_i8;
    let mut current_steps = 0_u32;
    let mut current_displacement = 0.0;
    for pair in values.windows(2) {
        let delta = pair[1] - pair[0];
        let sign = if delta > noise_floor {
            1
        } else if delta < -noise_floor {
            -1
        } else {
            0
        };
        if sign == 0 {
            continue;
        }
        if current_sign != 0 && sign != current_sign {
            runs.push((current_sign, current_steps, current_displacement));
            current_steps = 0;
            current_displacement = 0.0;
        }
        current_sign = sign;
        current_steps = current_steps.saturating_add(1);
        current_displacement += delta.abs();
    }
    if current_sign != 0 {
        runs.push((current_sign, current_steps, current_displacement));
    }

    let meaningful_signs = runs
        .into_iter()
        .filter(|(_, steps, displacement)| *steps >= 3 && *displacement >= minimum_run_displacement)
        .map(|(sign, _, _)| sign);
    let mut previous_sign = 0_i8;
    let mut reversals = 0_u32;
    for sign in meaningful_signs {
        if previous_sign != 0 && sign != previous_sign {
            reversals = reversals.saturating_add(1);
        }
        previous_sign = sign;
    }
    reversals
}

fn strobe_risk(hz: f64) -> StrobeRiskDSL {
    if hz <= f64::EPSILON {
        StrobeRiskDSL::None
    } else if hz < 3.0 {
        StrobeRiskDSL::Low
    } else if hz < 8.0 {
        StrobeRiskDSL::Medium
    } else {
        StrobeRiskDSL::High
    }
}

fn stable_cache_key(identity: &TemporalAnalysisIdentity) -> String {
    let bytes = serde_json::to_vec(identity).expect("temporal identity serializes");
    let hash = bytes
        .into_iter()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
        });
    format!("temporal-v1-{hash:016x}")
}

fn request_diagnostic(path: &str, message: &str) -> Diagnostic {
    Diagnostic::error(
        PROJECT_REFERENCE_NOT_FOUND,
        format!("temporal.{path}"),
        message,
        "Use exact Project Effect/Stage/Layout/TargetSet identities and a supported sampling configuration.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliasing_thresholds_match_authoring_readability_budget() {
        let risk = |events_per_second: f64, duty: Option<f64>| {
            let frames = 30.0 / events_per_second;
            if frames < 2.0 || duty.is_some_and(|value| frames * value < 1.0) {
                TemporalAliasingRisk::Severe
            } else if frames < 4.0 || duty.is_some_and(|value| frames * value < 2.0) {
                TemporalAliasingRisk::Caution
            } else {
                TemporalAliasingRisk::None
            }
        };
        assert_eq!(
            risk(128.0 / 60.0 * 4.0, None),
            TemporalAliasingRisk::Caution
        );
        assert_eq!(risk(128.0 / 60.0 * 8.0, None), TemporalAliasingRisk::Severe);
        assert_eq!(
            risk(128.0 / 60.0 * 4.0, Some(0.125)),
            TemporalAliasingRisk::Severe
        );
    }

    #[test]
    fn strobe_risk_uses_real_hz_thresholds() {
        assert_eq!(strobe_risk(0.0), StrobeRiskDSL::None);
        assert_eq!(strobe_risk(2.99), StrobeRiskDSL::Low);
        assert_eq!(strobe_risk(3.0), StrobeRiskDSL::Medium);
        assert_eq!(strobe_risk(8.0), StrobeRiskDSL::High);
    }

    #[test]
    fn direction_reversals_ignore_jitter_and_single_sample_cycle_resets() {
        let one_way_cycles = [
            0.0, 0.24, 0.5, 0.74, 1.0, 0.0, 0.24, 0.5, 0.74, 1.0, 0.0, 0.24, 0.5, 0.74, 1.0,
        ];
        let jittering_one_way = [0.0, 0.1, 0.099, 0.2, 0.199, 0.3, 0.299, 0.4, 0.399, 0.5];

        assert_eq!(direction_reversals(&one_way_cycles), 0);
        assert_eq!(direction_reversals(&jittering_one_way), 0);
    }

    #[test]
    fn direction_reversals_count_sustained_ping_pong_travel() {
        let ping_pong = [
            0.0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25,
            0.0,
        ];

        assert_eq!(direction_reversals(&ping_pong), 3);
    }

    #[test]
    fn wrapped_spatial_progress_keeps_one_way_motion_continuous() {
        let wrapped = [
            Some(0.7),
            Some(0.8),
            Some(0.9),
            Some(0.0),
            Some(0.1),
            Some(0.2),
        ];
        let unwrapped = unwrap_spatial_progress(&wrapped, true).expect("complete progress");

        for (actual, expected) in unwrapped.iter().zip([0.7, 0.8, 0.9, 1.0, 1.1, 1.2]) {
            assert!((actual - expected).abs() < 1e-12);
        }
        assert_eq!(direction_reversals(&unwrapped), 0);
    }
}

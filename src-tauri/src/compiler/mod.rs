pub mod diagnostic;
pub mod parser;
mod project;

pub use project::*;

use crate::document::{evaluate_formula_positions, DocumentValidator, ValidatedShow};
use crate::engine::animation::AnimatableValue;
use crate::engine::attribute::{resolve_attribute, AttributeHandle};
use crate::engine::color::parse_hex_color;
use crate::engine::effect::{
    deterministic_random, AutomationPolicy, CatalogVisibility, CompiledColorStop,
    CompiledEffectGraph, CompiledEffectNode, CompiledEffectStep, CompiledProfileSequence,
    Direction, EffectCatalog, EffectCatalogMatch, EffectCatalogQuery, EffectDefinition,
    EffectDefinitionHandle, EffectFamily, EffectInstance, EffectNodeHandle, EffectReplacement,
    EffectSource, LayoutCapability, MathOperation, MotionTag, OscillatorWaveform,
    ParameterDefinition, ParameterHandle, ParameterOverridePolicy, ParameterUiHint, ParameterUnit,
    ParameterValue, ParameterValueType, SpatialBasis, StrobeRisk,
};
use crate::engine::musical_time::{MusicalTime, TempoMap, TempoPoint};
use crate::engine::profile::{
    profile_by_handle, profile_handle_by_id, AttributeValue, FixtureProfileHandle,
    COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE, PAN_ATTRIBUTE, TILT_ATTRIBUTE,
};
use diagnostic::{
    Diagnostic, DiagnosticSeverity, DOC_ATTRIBUTE_NOT_SUPPORTED, DOC_ATTRIBUTE_OUT_OF_RANGE,
    DOC_EFFECT_GRAPH_INVALID, DOC_EFFECT_INSTANCE_NOT_FOUND, DOC_FORMULA_INVALID,
    DOC_INVALID_COLOR, DOC_PARAMETER_INVALID, DOC_PROFILE_NOT_FOUND, DSL_DUPLICATE_FIXTURE_ID,
};
use parser::*;
use std::collections::HashMap;

#[derive(Clone, Default)]
pub struct CompiledShow {
    pub fixtures: Vec<Fixture>,
    pub coords: Vec<LayoutCoord>,
    pub groups: HashMap<String, CompiledGroup>,
    pub effect_definitions: Vec<EffectDefinition>,
    pub effect_instances: HashMap<String, EffectInstance>,
    pub timeline: Option<CompiledTimeline>,
}

impl CompiledShow {
    pub fn query_effect_catalog(
        &self,
        target_group_id: &str,
        query: &EffectCatalogQuery,
    ) -> Vec<EffectCatalogMatch<'_>> {
        let Some(group) = self.groups.get(target_group_id) else {
            return Vec::new();
        };
        let fixture_profiles: HashMap<_, _> = self
            .fixtures
            .iter()
            .map(|fixture| (fixture.id, fixture.profile))
            .collect();
        let mut profiles = Vec::new();
        for fixture_id in &group.sorted_fixture_ids {
            if let Some(profile) = fixture_profiles.get(fixture_id) {
                if !profiles.contains(profile) {
                    profiles.push(*profile);
                }
            }
        }
        crate::engine::effect::query_effect_catalog(&self.effect_definitions, &profiles, query)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GroupHandle(String);

impl GroupHandle {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for GroupHandle {
    fn from(value: String) -> Self {
        Self(value)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct EffectInstanceHandle(String);

impl EffectInstanceHandle {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for EffectInstanceHandle {
    fn from(value: String) -> Self {
        Self(value)
    }
}

#[derive(Clone, Debug)]
pub struct Fixture {
    pub id: u32,
    pub profile: FixtureProfileHandle,
    pub intensity: Option<AttributeHandle>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct LayoutCoord {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patched: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct CompiledGroup {
    pub id: String,
    pub name: String,
    pub sorted_fixture_ids: Vec<u32>,
    pub blocks: Vec<usize>, // number of fixtures in each unique sort block
    fixture_order: HashMap<u32, usize>,
    membership_bits: Vec<u64>,
    fixture_weights: Vec<f32>,
    pub partitions: Vec<Vec<usize>>,
}

impl CompiledGroup {
    pub fn new(
        id: String,
        name: String,
        sorted_fixture_ids: Vec<u32>,
        blocks: Vec<usize>,
        fixtures: &[Fixture],
    ) -> Self {
        let mut group = Self {
            id,
            name,
            sorted_fixture_ids,
            blocks,
            fixture_order: HashMap::new(),
            membership_bits: vec![0; fixtures.len().div_ceil(64)],
            fixture_weights: vec![0.0; fixtures.len()],
            partitions: Vec::new(),
        };
        group.rebuild_target_cache(fixtures, None, &HashMap::new());
        group
    }

    pub fn rebuild_target_cache(
        &mut self,
        fixtures: &[Fixture],
        partition_fixture_ids: Option<&[Vec<u32>]>,
        weights: &HashMap<u32, f32>,
    ) {
        self.fixture_order = self
            .sorted_fixture_ids
            .iter()
            .enumerate()
            .map(|(index, fixture_id)| (*fixture_id, index))
            .collect();
        self.membership_bits = vec![0; fixtures.len().div_ceil(64)];
        self.fixture_weights = vec![0.0; fixtures.len()];
        let fixture_indices: HashMap<_, _> = fixtures
            .iter()
            .enumerate()
            .map(|(index, fixture)| (fixture.id, index))
            .collect();
        for fixture_id in &self.sorted_fixture_ids {
            let Some(index) = fixture_indices.get(fixture_id).copied() else {
                continue;
            };
            self.membership_bits[index / 64] |= 1_u64 << (index % 64);
            self.fixture_weights[index] = weights.get(fixture_id).copied().unwrap_or(1.0);
        }
        self.partitions = partition_fixture_ids.map_or_else(
            || {
                let mut cursor = 0;
                self.blocks
                    .iter()
                    .map(|block| {
                        let start = cursor.min(self.len());
                        let end = cursor.saturating_add(*block).min(self.len());
                        let partition = self.sorted_fixture_ids[start..end]
                            .iter()
                            .filter_map(|fixture_id| fixture_indices.get(fixture_id).copied())
                            .collect();
                        cursor = end;
                        partition
                    })
                    .collect()
            },
            |partitions| {
                partitions
                    .iter()
                    .map(|partition| {
                        partition
                            .iter()
                            .filter_map(|fixture_id| fixture_indices.get(fixture_id).copied())
                            .collect()
                    })
                    .collect()
            },
        );
    }

    pub fn index_of(&self, id: u32) -> Option<usize> {
        self.fixture_order.get(&id).copied()
    }

    pub fn contains_fixture_index(&self, fixture_index: usize) -> bool {
        self.membership_bits
            .get(fixture_index / 64)
            .is_some_and(|word| word & (1_u64 << (fixture_index % 64)) != 0)
    }

    pub fn weight_at(&self, fixture_index: usize) -> f32 {
        self.fixture_weights
            .get(fixture_index)
            .copied()
            .unwrap_or(0.0)
    }

    // Get the block index and the total number of blocks
    // instead of just treating every single item as completely separate.
    pub fn block_index_of(&self, id: u32) -> Option<(usize, usize)> {
        let raw_idx = self.index_of(id)?;
        let mut curr = 0;
        for (b_idx, &b_size) in self.blocks.iter().enumerate() {
            curr += b_size;
            if raw_idx < curr {
                return Some((b_idx, self.blocks.len()));
            }
        }
        Some((0, self.blocks.len()))
    }

    pub fn len(&self) -> usize {
        self.sorted_fixture_ids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sorted_fixture_ids.is_empty()
    }
}

#[derive(Clone, Debug)]
pub struct CompiledTimeline {
    pub ppq: u32,
    pub tempo_map: TempoMap,
    pub tracks: Vec<CompiledTimelineTrack>,
    pub automation_lanes: Vec<CompiledAutomationLane>,
    pub automation_index: HashMap<CompiledAutomationTarget, usize>,
}

#[derive(Clone, Debug)]
pub struct CompiledTimelineTrack {
    pub id: String,
    pub overlap_policy: OverlapPolicyDSL,
    pub clips: Vec<CompiledEffectClip>,
    pub prefix_max_end: Vec<u64>,
}

#[derive(Clone, Debug)]
pub struct CompiledEffectClip {
    pub id: String,
    pub instance: EffectInstanceHandle,
    pub start: MusicalTime,
    pub duration_ticks: u64,
    pub source_offset_ticks: u64,
    pub playback: ClipPlaybackDSL,
    pub layer: i32,
    pub stable_order: u32,
}

impl CompiledEffectClip {
    pub fn end(&self) -> MusicalTime {
        self.start
            .checked_add(self.duration_ticks)
            .unwrap_or(MusicalTime::from_ticks(u64::MAX))
    }
}

#[derive(Clone, Debug)]
pub struct CompiledAutomationLane {
    pub id: String,
    pub target: CompiledAutomationTarget,
    pub keyframes: Vec<CompiledKeyframe>,
    pub stable_order: u32,
}

#[derive(Clone, Debug)]
pub struct CompiledKeyframe {
    pub id: String,
    pub time: MusicalTime,
    pub value: AnimatableValue,
    pub interpolation: KeyframeInterpolationDSL,
    pub in_tangent: Option<CompiledKeyframeTangent>,
    pub out_tangent: Option<CompiledKeyframeTangent>,
}

#[derive(Clone, Copy, Debug)]
pub struct CompiledKeyframeTangent {
    pub time: f64,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum CompiledAutomationTarget {
    GlobalMasterDimmer,
    EffectInstance {
        instance: EffectInstanceHandle,
        parameter: ParameterHandle,
    },
}

fn circle_ring_fixture_counts(fixture_count: usize, rings: u32, increment: u32) -> Vec<usize> {
    let ring_count = rings as usize;
    if ring_count == 0 || fixture_count <= 1 {
        return vec![0; ring_count];
    }

    let ring_weight = ring_count * (ring_count + 1) / 2;
    let capacity = increment as usize * ring_weight;
    let remaining = fixture_count.saturating_sub(1).min(capacity);
    let mut allocations: Vec<(usize, usize, usize)> = (0..ring_count)
        .map(|index| {
            let weighted = remaining * (index + 1);
            (index, weighted / ring_weight, weighted % ring_weight)
        })
        .collect();
    let assigned: usize = allocations.iter().map(|(_, count, _)| count).sum();
    let mut priority: Vec<usize> = (0..ring_count).collect();
    priority.sort_by(|left, right| {
        allocations[*right]
            .2
            .cmp(&allocations[*left].2)
            .then_with(|| right.cmp(left))
    });
    for index in 0..remaining.saturating_sub(assigned) {
        allocations[priority[index % priority.len()]].1 += 1;
    }
    allocations.into_iter().map(|(_, count, _)| count).collect()
}

pub struct Compiler;

impl Compiler {
    pub fn compile_document(document: ShowDSL) -> Result<CompiledShow, Vec<Diagnostic>> {
        let validated = DocumentValidator::validate(document)?;
        Self::compile(validated)
    }

    pub fn compile(validated: ValidatedShow) -> Result<CompiledShow, Vec<Diagnostic>> {
        let dsl = validated.into_document();
        let mut errors = Vec::new();

        let fixtures = Self::compile_patch(&dsl.patch, &mut errors);
        let coords = Self::compile_layout(&dsl.layout, &fixtures, &mut errors);
        let groups = Self::compile_groups(&dsl.groups, &fixtures, &coords, &mut errors);
        let (effect_definitions, effect_instances) = compile_effect_models(
            &dsl.effect_definitions,
            &dsl.effect_instances,
            &groups,
            &fixtures,
            &coords,
            &mut errors,
        );

        let timeline = dsl.timeline.map(|timeline| {
            Self::compile_timeline(
                timeline,
                &effect_definitions,
                &effect_instances,
                &mut errors,
            )
        });

        if !errors.is_empty()
            && errors
                .iter()
                .any(|e| matches!(e.severity, DiagnosticSeverity::Error))
        {
            return Err(errors);
        }

        Ok(CompiledShow {
            fixtures,
            coords,
            groups,
            effect_definitions,
            effect_instances,
            timeline,
        })
    }

    fn compile_patch(patch_dsl: &[PatchDSL], errors: &mut Vec<Diagnostic>) -> Vec<Fixture> {
        let mut fixtures = Vec::new();
        for p in patch_dsl {
            let Some(profile) = profile_handle_by_id(&p.profile_id) else {
                errors.push(Diagnostic::error(
                    DOC_PROFILE_NOT_FOUND,
                    "patch.profile_id",
                    format!("Fixture profile not found: {:?}.", p.profile_id),
                    "Select a registered fixture profile.",
                ));
                continue;
            };
            for id in p.id_range.0..=p.id_range.1 {
                if fixtures.iter().any(|f: &Fixture| f.id == id) {
                    errors.push(Diagnostic::error(
                        DSL_DUPLICATE_FIXTURE_ID,
                        "patch.id_range",
                        format!("Duplicate fixture ID: {id}"),
                        "Use a unique fixture ID across all patch ranges.",
                    ));
                }
                fixtures.push(Fixture {
                    id,
                    profile,
                    intensity: resolve_attribute(profile, INTENSITY_ATTRIBUTE),
                });
            }
        }
        fixtures
    }

    fn compile_layout(
        layout_dsl: &LayoutDSL,
        fixtures: &[Fixture],
        errors: &mut Vec<Diagnostic>,
    ) -> Vec<LayoutCoord> {
        let mut coords = Vec::new();
        let fix_ids: Vec<u32> = fixtures.iter().map(|f| f.id).collect();
        // Transitional Canvas adapter metadata is derived from the profile, not the layout.
        let get_type = |id: u32| -> String {
            fixtures
                .iter()
                .find(|f| f.id == id)
                .map(|fixture| {
                    profile_by_handle(fixture.profile)
                        .preview_kind
                        .canvas_type()
                        .to_string()
                })
                .unwrap_or_else(|| "spot".to_string())
        };

        match &layout_dsl.generator {
            GeneratorDSL::Matrix {
                rows,
                columns,
                spacing,
                origin,
            } => {
                let (ox, oy) = origin.unwrap_or((0.0, 0.0));
                for i in 0..*rows {
                    for j in 0..*columns {
                        let idx = (i * columns + j) as usize;
                        if idx < fix_ids.len() {
                            coords.push(LayoutCoord {
                                id: fix_ids[idx],
                                x: ox + j as f64 * spacing,
                                y: oy + i as f64 * spacing,
                                type_: get_type(fix_ids[idx]),
                                width: None,
                                height: None,
                                patched: None,
                            });
                        }
                    }
                }
            }
            GeneratorDSL::Circle {
                rings,
                increment,
                gap,
                center,
            } => {
                let (cx, cy) = center.unwrap_or((0.0, 0.0));
                if !fix_ids.is_empty() {
                    coords.push(LayoutCoord {
                        id: fix_ids[0],
                        x: cx,
                        y: cy,
                        type_: get_type(fix_ids[0]),
                        width: None,
                        height: None,
                        patched: None,
                    });
                    let mut current_idx = 1;
                    let ring_counts = circle_ring_fixture_counts(fix_ids.len(), *rings, *increment);
                    for (ring_index, count) in ring_counts.into_iter().enumerate() {
                        let radius = gap * (ring_index + 1) as f64;
                        for step in 0..count {
                            let angle = (2.0 * std::f64::consts::PI / count as f64) * step as f64;
                            coords.push(LayoutCoord {
                                id: fix_ids[current_idx],
                                x: cx + angle.cos() * radius,
                                y: cy + angle.sin() * radius,
                                type_: get_type(fix_ids[current_idx]),
                                width: None,
                                height: None,
                                patched: None,
                            });
                            current_idx += 1;
                        }
                    }
                }
            }
            GeneratorDSL::Formula { formula } => {
                match evaluate_formula_positions(formula, &fix_ids) {
                    Ok(positions) => {
                        coords.extend(positions.into_iter().map(|position| LayoutCoord {
                            id: position.id,
                            x: position.x,
                            y: position.y,
                            type_: get_type(position.id),
                            width: None,
                            height: None,
                            patched: None,
                        }))
                    }
                    Err(error) => errors.push(Diagnostic::error(
                        DOC_FORMULA_INVALID,
                        "layout.generator.formula",
                        error,
                        "Use t, sin, cos, and pow in a valid finite numeric expression.",
                    )),
                }
            }
            GeneratorDSL::Custom {
                fixtures: custom_fixtures,
            } => {
                for c in custom_fixtures {
                    coords.push(LayoutCoord {
                        id: c.id,
                        x: c.x,
                        y: c.y,
                        type_: get_type(c.id),
                        width: None,
                        height: None,
                        patched: None,
                    });
                }
            }
            GeneratorDSL::SvgPath { .. } => {
                errors.push(Diagnostic::error(
                    crate::compiler::diagnostic::DOC_SVG_PATH_INVALID,
                    "layout.generator.svgPath.d",
                    "SVG path compilation is not supported by this engine build.",
                    "Use matrix, circle, formula, or custom layout until SVG sampling is implemented.",
                ));
            }
        }
        coords
    }

    fn compile_groups(
        group_dsl: &[GroupDSL],
        _fixtures: &[Fixture],
        coords: &[LayoutCoord],
        _errors: &mut Vec<Diagnostic>,
    ) -> HashMap<String, CompiledGroup> {
        let mut groups = HashMap::new();

        let mut coord_map = HashMap::new();
        for c in coords {
            coord_map.insert(c.id, c);
        }

        for g in group_dsl {
            let mut ids = match &g.fixtures {
                GroupFixturesDSL::List(list) => list.clone(),
                GroupFixturesDSL::Range(definition) => {
                    (definition.range.0..=definition.range.1).collect()
                }
            };

            let mut blocks = Vec::new();

            if let Some(sort_by) = &g.sort_by {
                let sort_by = sort_by.as_str();
                match sort_by {
                    "x" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            match xa.partial_cmp(&xb).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => ya
                                    .partial_cmp(&yb)
                                    .unwrap_or(std::cmp::Ordering::Equal)
                                    .then(a.cmp(b)),
                                other => other,
                            }
                        });

                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map
                                .get(id)
                                .map(|c| (c.x * 1000.0).round() as i64)
                                .unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 {
                                    blocks.push(count);
                                }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 {
                            blocks.push(count);
                        }
                    }
                    "-x" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            match xb.partial_cmp(&xa).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => ya
                                    .partial_cmp(&yb)
                                    .unwrap_or(std::cmp::Ordering::Equal)
                                    .then(a.cmp(b)),
                                other => other,
                            }
                        });

                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map
                                .get(id)
                                .map(|c| (c.x * 1000.0).round() as i64)
                                .unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 {
                                    blocks.push(count);
                                }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 {
                            blocks.push(count);
                        }
                    }
                    "y" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            // Stable sort for y-axis needs secondary sorting by x-axis to group by row
                            match ya.partial_cmp(&yb).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => xa
                                    .partial_cmp(&xb)
                                    .unwrap_or(std::cmp::Ordering::Equal)
                                    .then(a.cmp(b)),
                                other => other,
                            }
                        });

                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map
                                .get(id)
                                .map(|c| (c.y * 1000.0).round() as i64)
                                .unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 {
                                    blocks.push(count);
                                }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 {
                            blocks.push(count);
                        }
                    }
                    "-y" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            match yb.partial_cmp(&ya).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => xa
                                    .partial_cmp(&xb)
                                    .unwrap_or(std::cmp::Ordering::Equal)
                                    .then(a.cmp(b)),
                                other => other,
                            }
                        });

                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map
                                .get(id)
                                .map(|c| (c.y * 1000.0).round() as i64)
                                .unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 {
                                    blocks.push(count);
                                }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 {
                            blocks.push(count);
                        }
                    }
                    "distance_center" | "-distance_center" => {
                        let mut sum_x = 0.0;
                        let mut sum_y = 0.0;
                        let mut count = 0.0;
                        for &id in &ids {
                            if let Some(c) = coord_map.get(&id) {
                                sum_x += c.x;
                                sum_y += c.y;
                                count += 1.0;
                            }
                        }
                        let cx = if count > 0.0 { sum_x / count } else { 0.0 };
                        let cy = if count > 0.0 { sum_y / count } else { 0.0 };

                        ids.sort_by(|a, b| {
                            let da = coord_map
                                .get(a)
                                .map(|c| (c.x - cx).powi(2) + (c.y - cy).powi(2))
                                .unwrap_or(0.0);
                            let db = coord_map
                                .get(b)
                                .map(|c| (c.x - cx).powi(2) + (c.y - cy).powi(2))
                                .unwrap_or(0.0);
                            if sort_by == "distance_center" {
                                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                            } else {
                                db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
                            }
                        });

                        let mut curr_val = None;
                        let mut b_count = 0;
                        for id in &ids {
                            let val = coord_map
                                .get(id)
                                .map(|c| {
                                    let d = (c.x - cx).powi(2) + (c.y - cy).powi(2);
                                    (d * 1000.0).round() as i64
                                })
                                .unwrap_or(0);

                            if Some(val) == curr_val {
                                b_count += 1;
                            } else {
                                if b_count > 0 {
                                    blocks.push(b_count);
                                }
                                curr_val = Some(val);
                                b_count = 1;
                            }
                        }
                        if b_count > 0 {
                            blocks.push(b_count);
                        }
                    }
                    "angle_center" | "-angle_center" => {
                        let mut sum_x = 0.0;
                        let mut sum_y = 0.0;
                        let mut count = 0.0;
                        for &id in &ids {
                            if let Some(c) = coord_map.get(&id) {
                                sum_x += c.x;
                                sum_y += c.y;
                                count += 1.0;
                            }
                        }
                        let cx = if count > 0.0 { sum_x / count } else { 0.0 };
                        let cy = if count > 0.0 { sum_y / count } else { 0.0 };

                        ids.sort_by(|a, b| {
                            let aa = coord_map
                                .get(a)
                                .map(|c| (c.y - cy).atan2(c.x - cx))
                                .unwrap_or(0.0);
                            let ab = coord_map
                                .get(b)
                                .map(|c| (c.y - cy).atan2(c.x - cx))
                                .unwrap_or(0.0);
                            if sort_by == "angle_center" {
                                aa.partial_cmp(&ab).unwrap_or(std::cmp::Ordering::Equal)
                            } else {
                                ab.partial_cmp(&aa).unwrap_or(std::cmp::Ordering::Equal)
                            }
                        });

                        let mut curr_val = None;
                        let mut b_count = 0;
                        for id in &ids {
                            let val = coord_map
                                .get(id)
                                .map(|c| {
                                    let a = (c.y - cy).atan2(c.x - cx);
                                    (a * 1000.0).round() as i64
                                })
                                .unwrap_or(0);

                            if Some(val) == curr_val {
                                b_count += 1;
                            } else {
                                if b_count > 0 {
                                    blocks.push(b_count);
                                }
                                curr_val = Some(val);
                                b_count = 1;
                            }
                        }
                        if b_count > 0 {
                            blocks.push(b_count);
                        }
                    }
                    _ => {
                        blocks = vec![1; ids.len()];
                    }
                }
            } else {
                blocks = vec![1; ids.len()];
            }

            groups.insert(
                g.id.clone(),
                CompiledGroup::new(g.id.clone(), g.name.clone(), ids, blocks, _fixtures),
            );
        }
        groups
    }

    fn compile_timeline(
        timeline: TimelineV1DSL,
        definitions: &[EffectDefinition],
        instances: &HashMap<String, EffectInstance>,
        errors: &mut Vec<Diagnostic>,
    ) -> CompiledTimeline {
        let ppq = timeline.ppq;
        let tempo_points = timeline
            .tempo_map
            .points
            .into_iter()
            .map(|point| {
                TempoPoint::from_bpm(
                    MusicalTime::from_ticks(u64::from(point.time_tick)),
                    point.bpm,
                )
                .expect("validated tempo point")
            })
            .collect();
        let tempo_map = TempoMap::new(ppq, tempo_points).expect("validated tempo map");
        let mut compiled_tracks = Vec::with_capacity(timeline.tracks.len());
        let mut automation_lanes = Vec::new();
        let mut automation_index = HashMap::new();
        let mut clip_order = 0_u32;
        let mut lane_order = 0_u32;

        for (track_index, track) in timeline.tracks.into_iter().enumerate() {
            let mut clips: Vec<_> = track
                .clips
                .into_iter()
                .map(|clip| {
                    let compiled = CompiledEffectClip {
                        id: clip.id,
                        instance: clip.instance_id.into(),
                        start: MusicalTime::from_ticks(u64::from(clip.start_tick)),
                        duration_ticks: u64::from(clip.duration_tick),
                        source_offset_ticks: u64::from(clip.source_offset_tick),
                        playback: clip.playback,
                        layer: clip.layer,
                        stable_order: clip_order,
                    };
                    clip_order = clip_order.saturating_add(1);
                    compiled
                })
                .collect();
            clips.sort_by_key(|clip| (clip.start, clip.layer, clip.stable_order));
            let mut maximum_end = 0_u64;
            let prefix_max_end = clips
                .iter()
                .map(|clip| {
                    maximum_end = maximum_end.max(clip.end().ticks());
                    maximum_end
                })
                .collect();

            for (lane_index, lane) in track.automation_lanes.into_iter().enumerate() {
                let path =
                    format!("timeline.tracks[{track_index}].automation_lanes[{lane_index}].target");
                let target =
                    compile_automation_target(lane.target, definitions, instances, &path, errors);
                let keyframes = lane
                    .keyframes
                    .into_iter()
                    .map(|keyframe| CompiledKeyframe {
                        id: keyframe.id,
                        time: MusicalTime::from_ticks(u64::from(keyframe.time_tick)),
                        value: AnimatableValue::from_parameter_document(&keyframe.value)
                            .expect("validated typed keyframe"),
                        interpolation: keyframe.interpolation,
                        in_tangent: keyframe.in_tangent.map(|tangent| CompiledKeyframeTangent {
                            time: tangent.time,
                            value: tangent.value,
                        }),
                        out_tangent: keyframe.out_tangent.map(|tangent| CompiledKeyframeTangent {
                            time: tangent.time,
                            value: tangent.value,
                        }),
                    })
                    .collect();
                let compiled_lane = CompiledAutomationLane {
                    id: lane.id,
                    target: target.clone(),
                    keyframes,
                    stable_order: lane_order,
                };
                automation_index.insert(target, automation_lanes.len());
                automation_lanes.push(compiled_lane);
                lane_order = lane_order.saturating_add(1);
            }

            compiled_tracks.push(CompiledTimelineTrack {
                id: track.id,
                overlap_policy: track.overlap_policy,
                clips,
                prefix_max_end,
            });
        }

        CompiledTimeline {
            ppq,
            tempo_map,
            tracks: compiled_tracks,
            automation_lanes,
            automation_index,
        }
    }
}

fn compile_profile_sequence(
    definition_id: &str,
    steps_dsl: &[SequenceStepDSL],
    profile_handle: FixtureProfileHandle,
    errors: &mut Vec<Diagnostic>,
) -> CompiledProfileSequence {
    let profile = profile_by_handle(profile_handle);
    let intensity = resolve_attribute(profile_handle, INTENSITY_ATTRIBUTE);
    let color = resolve_attribute(profile_handle, COLOR_RGB_ATTRIBUTE);
    let pan = resolve_attribute(profile_handle, PAN_ATTRIBUTE);
    let tilt = resolve_attribute(profile_handle, TILT_ATTRIBUTE);
    let writes_pan = steps_dsl.iter().any(|step| step.values.pan.is_some());
    let writes_tilt = steps_dsl.iter().any(|step| step.values.tilt.is_some());

    for (attribute_id, required, handle) in [
        (INTENSITY_ATTRIBUTE, true, intensity),
        (COLOR_RGB_ATTRIBUTE, true, color),
        (PAN_ATTRIBUTE, writes_pan, pan),
        (TILT_ATTRIBUTE, writes_tilt, tilt),
    ] {
        if required && handle.is_none() {
            errors.push(Diagnostic::error(
                DOC_ATTRIBUTE_NOT_SUPPORTED,
                format!("effect_definitions[id={definition_id}].graph.steps.values"),
                format!(
                    "Fixture profile {:?} does not support attribute {attribute_id:?}.",
                    profile.id
                ),
                "Retarget the effect or choose a profile with the required capability.",
            ));
        }
    }

    let steps = steps_dsl
        .iter()
        .enumerate()
        .map(|(step_index, step)| {
            let mut values = vec![None; profile.attributes.len()];
            if let Some(handle) = intensity {
                values[handle.index()] =
                    Some(AttributeValue::Scalar(step.values.dimmer.unwrap_or(1.0)));
            }
            if let Some(handle) = color {
                let color_hex = step.values.color.as_deref().unwrap_or("#000000");
                let parsed = match parse_hex_color(color_hex) {
                    Ok((red, green, blue)) => AttributeValue::Color([red, green, blue]),
                    Err(error) => {
                        errors.push(Diagnostic::error(
                            DOC_INVALID_COLOR,
                            format!("effect_definitions[id={definition_id}].graph.steps[{step_index}].values.color"),
                            error.to_string(),
                            "Use a color in #RRGGBB format.",
                        ));
                        AttributeValue::Color([0, 0, 0])
                    }
                };
                values[handle.index()] = Some(parsed);
            }
            set_angle_value(
                &mut values,
                profile_handle,
                pan,
                writes_pan,
                step.values.pan,
                format!("effect_definitions[id={definition_id}].graph.steps[{step_index}].values.pan"),
                errors,
            );
            set_angle_value(
                &mut values,
                profile_handle,
                tilt,
                writes_tilt,
                step.values.tilt,
                format!("effect_definitions[id={definition_id}].graph.steps[{step_index}].values.tilt"),
                errors,
            );

            CompiledEffectStep {
                values,
                width: step.width.unwrap_or(100.0),
                transition: step.transition.unwrap_or(100.0),
                accel: step.accel.unwrap_or(0),
                decel: step.decel.unwrap_or(0),
            }
        })
        .collect();

    CompiledProfileSequence {
        steps,
        intensity,
        color,
        pan,
        tilt,
    }
}

fn set_angle_value(
    values: &mut [Option<AttributeValue>],
    profile_handle: FixtureProfileHandle,
    handle: Option<AttributeHandle>,
    is_written: bool,
    document_value: Option<f32>,
    path: String,
    errors: &mut Vec<Diagnostic>,
) {
    if !is_written {
        return;
    }
    let Some(handle) = handle else {
        return;
    };
    let descriptor = &profile_by_handle(profile_handle).attributes[handle.index()];
    let value = document_value
        .map(AttributeValue::Angle)
        .unwrap_or_else(|| descriptor.default_value.clone());
    if let (AttributeValue::Angle(value), Some(range)) = (&value, &descriptor.physical_range) {
        if *value < range.min || *value > range.max {
            errors.push(Diagnostic::error(
                DOC_ATTRIBUTE_OUT_OF_RANGE,
                path,
                format!(
                    "Attribute {:?} value {value} is outside [{}, {}] {}.",
                    descriptor.id, range.min, range.max, range.unit
                ),
                "Keep the effect value inside the target fixture profile's physical range.",
            ));
        }
    }
    values[handle.index()] = Some(value);
}

fn compile_automation_target(
    target: AutomationTargetDSL,
    definitions: &[EffectDefinition],
    instances: &HashMap<String, EffectInstance>,
    path: &str,
    errors: &mut Vec<Diagnostic>,
) -> CompiledAutomationTarget {
    match target {
        AutomationTargetDSL::Global { .. } => CompiledAutomationTarget::GlobalMasterDimmer,
        AutomationTargetDSL::EffectInstance {
            instance_id,
            parameter_id,
        } => {
            let parameter = instances.get(&instance_id).and_then(|instance| {
                definitions
                    .get(instance.definition.index())?
                    .parameter_handle(&parameter_id)
            });
            let Some(parameter) = parameter else {
                errors.push(Diagnostic::error(
                    DOC_PARAMETER_INVALID,
                    path,
                    format!(
                        "Cannot resolve effect parameter {parameter_id:?} for instance {instance_id:?}."
                    ),
                    "Reference a parameter declared by the pinned effect definition.",
                ));
                return CompiledAutomationTarget::GlobalMasterDimmer;
            };
            CompiledAutomationTarget::EffectInstance {
                instance: instance_id.into(),
                parameter,
            }
        }
    }
}

fn compile_effect_models(
    definition_documents: &[EffectDefinitionDSL],
    instance_documents: &[EffectInstanceDSL],
    groups: &HashMap<String, CompiledGroup>,
    fixtures: &[Fixture],
    coords: &[LayoutCoord],
    errors: &mut Vec<Diagnostic>,
) -> (Vec<EffectDefinition>, HashMap<String, EffectInstance>) {
    let fixture_profiles: HashMap<_, _> = fixtures
        .iter()
        .map(|fixture| (fixture.id, fixture.profile))
        .collect();
    let mut profiles_by_definition: HashMap<(&str, u32), Vec<FixtureProfileHandle>> =
        HashMap::new();
    for instance in instance_documents {
        let Some(group) = groups.get(&instance.target_group_id) else {
            continue;
        };
        let profiles = profiles_by_definition
            .entry((&instance.definition_id, instance.definition_revision))
            .or_default();
        for fixture_id in &group.sorted_fixture_ids {
            if let Some(profile) = fixture_profiles.get(fixture_id) {
                if !profiles.contains(profile) {
                    profiles.push(*profile);
                }
            }
        }
    }

    let mut definitions = Vec::with_capacity(definition_documents.len());
    let mut definition_handles = HashMap::with_capacity(definition_documents.len());
    for (index, definition) in definition_documents.iter().enumerate() {
        let handle = EffectDefinitionHandle::from_index(index);
        definition_handles.insert((definition.id.as_str(), definition.revision), handle);
        let parameters = definition
            .parameters
            .iter()
            .filter_map(|parameter| compile_parameter_definition(parameter, errors))
            .collect();
        let profiles = profiles_by_definition
            .get(&(definition.id.as_str(), definition.revision))
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        definitions.push(EffectDefinition {
            id: definition.id.clone(),
            name: definition.name.clone(),
            revision: definition.revision,
            source: match definition.source {
                EffectSourceDSL::BuiltIn => EffectSource::BuiltIn,
                EffectSourceDSL::ProjectLocal => EffectSource::ProjectLocal,
                EffectSourceDSL::UserLibrary => EffectSource::UserLibrary,
            },
            parameters,
            graph: compile_effect_graph(definition, profiles, errors),
            catalog: compile_effect_catalog(&definition.catalog),
        });
    }

    let mut instances = HashMap::with_capacity(instance_documents.len());
    for (index, instance) in instance_documents.iter().enumerate() {
        let Some(definition) = definition_handles
            .get(&(
                instance.definition_id.as_str(),
                instance.definition_revision,
            ))
            .copied()
        else {
            errors.push(Diagnostic::error(
                DOC_EFFECT_INSTANCE_NOT_FOUND,
                format!("effect_instances[{index}].definition_id"),
                format!(
                    "Cannot compile missing effect definition {:?} revision {}.",
                    instance.definition_id, instance.definition_revision
                ),
                "Reference a definition and revision present in the document.",
            ));
            continue;
        };
        let compiled_definition = &definitions[definition.index()];
        let parameter_overrides = instance
            .parameter_overrides
            .iter()
            .filter_map(|(id, value)| {
                let handle = compiled_definition.parameter_handle(id)?;
                compile_parameter_value(value, errors).map(|value| (handle, value))
            })
            .collect();
        instances.insert(
            instance.id.clone(),
            EffectInstance {
                id: instance.id.clone(),
                definition,
                target_group_id: instance.target_group_id.clone(),
                parameter_overrides,
                seed: u64::from_str_radix(&instance.seed, 16).unwrap_or_else(|_| {
                    errors.push(Diagnostic::error(
                        DOC_PARAMETER_INVALID,
                        format!("effect_instances[{index}].seed"),
                        "Cannot compile the deterministic effect seed.",
                        "Use a 16-digit hexadecimal seed.",
                    ));
                    0
                }),
                phase_offset: 0.0,
                priority: 0,
                mix_overrides: HashMap::new(),
                spatial_offsets: HashMap::new(),
                targeting_scene: None,
            },
        );
    }
    for instance in instances.values_mut() {
        let Some(definition) = definitions.get(instance.definition.index()) else {
            continue;
        };
        instance.spatial_offsets =
            compile_spatial_offsets(definition, instance, groups, fixtures, coords, errors);
    }
    (definitions, instances)
}

fn compile_effect_catalog(catalog: &EffectCatalogDSL) -> EffectCatalog {
    EffectCatalog {
        family: catalog.family.map(|family| match family {
            EffectFamilyDSL::Intensity => EffectFamily::Intensity,
            EffectFamilyDSL::Color => EffectFamily::Color,
            EffectFamilyDSL::Movement => EffectFamily::Movement,
            EffectFamilyDSL::Spatial => EffectFamily::Spatial,
            EffectFamilyDSL::Strobe => EffectFamily::Strobe,
            EffectFamilyDSL::Utility => EffectFamily::Utility,
        }),
        category: catalog.category.clone(),
        visibility: match catalog.visibility {
            CatalogVisibilityDSL::Standard => CatalogVisibility::Standard,
            CatalogVisibilityDSL::Advanced => CatalogVisibility::Advanced,
            CatalogVisibilityDSL::Hidden => CatalogVisibility::Hidden,
        },
        mood: catalog.mood.clone(),
        energy: catalog.energy,
        density: catalog.density,
        motion: match catalog.motion {
            MotionTagDSL::Static => MotionTag::Static,
            MotionTagDSL::Pulse => MotionTag::Pulse,
            MotionTagDSL::Chase => MotionTag::Chase,
            MotionTagDSL::Sweep => MotionTag::Sweep,
            MotionTagDSL::Organic => MotionTag::Organic,
        },
        colorfulness: catalog.colorfulness,
        strobe_risk: match catalog.strobe_risk {
            StrobeRiskDSL::None => StrobeRisk::None,
            StrobeRiskDSL::Low => StrobeRisk::Low,
            StrobeRiskDSL::Medium => StrobeRisk::Medium,
            StrobeRiskDSL::High => StrobeRisk::High,
        },
        required_attributes: catalog.required_attributes.clone(),
        layout_capabilities: catalog
            .layout_capabilities
            .iter()
            .map(|capability| match capability {
                LayoutCapabilityDSL::Any => LayoutCapability::Any,
                LayoutCapabilityDSL::Linear => LayoutCapability::Linear,
                LayoutCapabilityDSL::Matrix => LayoutCapability::Matrix,
                LayoutCapabilityDSL::Radial => LayoutCapability::Radial,
                LayoutCapabilityDSL::Coordinates => LayoutCapability::Coordinates,
                LayoutCapabilityDSL::TargetingScene => LayoutCapability::TargetingScene,
            })
            .collect(),
        parameter_summary: catalog.parameter_summary.clone(),
        deprecated: catalog.deprecated,
        replacement: catalog
            .replacement
            .as_ref()
            .map(|replacement| EffectReplacement {
                id: replacement.id.clone(),
                revision: replacement.revision,
            }),
    }
}

fn compile_effect_graph(
    definition: &EffectDefinitionDSL,
    profiles: &[FixtureProfileHandle],
    errors: &mut Vec<Diagnostic>,
) -> CompiledEffectGraph {
    let mut remaining: Vec<_> = definition.graph.nodes.iter().collect();
    let mut handles = HashMap::with_capacity(remaining.len());
    let mut nodes = Vec::with_capacity(remaining.len());
    let mut writers = Vec::new();

    while !remaining.is_empty() {
        let Some(index) = remaining.iter().position(|node| {
            document_node_inputs(node)
                .iter()
                .all(|id| handles.contains_key(id))
        }) else {
            errors.push(Diagnostic::error(
                DOC_EFFECT_GRAPH_INVALID,
                format!("effect_definitions[id={}].graph", definition.id),
                "EffectGraph cannot be topologically compiled.",
                "Remove cycles and references to missing nodes.",
            ));
            break;
        };
        let node = remaining.remove(index);
        let Some(handle) = EffectNodeHandle::from_index(nodes.len()) else {
            errors.push(Diagnostic::error(
                DOC_EFFECT_GRAPH_INVALID,
                format!("effect_definitions[id={}].graph", definition.id),
                "EffectGraph contains more than 65,535 nodes.",
                "Split the effect into smaller definitions.",
            ));
            break;
        };
        handles.insert(node.id(), handle);
        let compiled = compile_effect_node(definition, node, profiles, &handles, errors);
        if matches!(compiled, CompiledEffectNode::AttributeWriter { .. }) {
            writers.push(handle);
        }
        nodes.push(compiled);
    }
    CompiledEffectGraph { nodes, writers }
}

fn document_node_inputs(node: &EffectNodeDSL) -> Vec<&str> {
    match node {
        EffectNodeDSL::Time { .. }
        | EffectNodeDSL::Constant { .. }
        | EffectNodeDSL::Random { .. } => Vec::new(),
        EffectNodeDSL::StepSequence { phase, .. } | EffectNodeDSL::Oscillator { phase, .. } => {
            vec![&phase.node_id]
        }
        EffectNodeDSL::Envelope { input, .. }
        | EffectNodeDSL::SpatialPhase { input, .. }
        | EffectNodeDSL::Map { input, .. }
        | EffectNodeDSL::Clamp { input, .. }
        | EffectNodeDSL::ColorGradient { input, .. }
        | EffectNodeDSL::FixtureMask { input, .. } => vec![&input.node_id],
        EffectNodeDSL::Math { left, right, .. } => vec![&left.node_id, &right.node_id],
        EffectNodeDSL::AttributeWriter { input, mask, .. } => {
            let mut inputs = vec![input.node_id.as_str()];
            if let Some(mask) = mask {
                inputs.push(&mask.node_id);
            }
            inputs
        }
    }
}

fn compile_effect_node(
    definition: &EffectDefinitionDSL,
    node: &EffectNodeDSL,
    profiles: &[FixtureProfileHandle],
    handles: &HashMap<&str, EffectNodeHandle>,
    errors: &mut Vec<Diagnostic>,
) -> CompiledEffectNode {
    let input = |id: &str| handles[id];
    match node {
        EffectNodeDSL::Time { .. } => CompiledEffectNode::Time,
        EffectNodeDSL::Constant { value, .. } => CompiledEffectNode::Constant(
            compile_parameter_value(value, errors).unwrap_or(ParameterValue::Scalar(0.0)),
        ),
        EffectNodeDSL::Random { .. } => CompiledEffectNode::Random,
        EffectNodeDSL::StepSequence { phase, steps, .. } => CompiledEffectNode::StepSequence {
            phase: input(&phase.node_id),
            profiles: profiles
                .iter()
                .copied()
                .map(|profile| {
                    (
                        profile,
                        compile_profile_sequence(&definition.id, steps, profile, errors),
                    )
                })
                .collect(),
        },
        EffectNodeDSL::Oscillator {
            waveform, phase, ..
        } => CompiledEffectNode::Oscillator {
            waveform: match waveform {
                OscillatorWaveformDSL::Sine => OscillatorWaveform::Sine,
                OscillatorWaveformDSL::Triangle => OscillatorWaveform::Triangle,
                OscillatorWaveformDSL::Saw => OscillatorWaveform::Saw,
                OscillatorWaveformDSL::Pulse => OscillatorWaveform::Pulse,
            },
            phase: input(&phase.node_id),
        },
        EffectNodeDSL::Envelope {
            input: source,
            attack,
            release,
            ..
        } => CompiledEffectNode::Envelope {
            input: input(&source.node_id),
            attack: *attack,
            release: *release,
        },
        EffectNodeDSL::SpatialPhase {
            input: source,
            basis,
            from,
            to,
            wrap,
            group_size,
            custom_order,
            ..
        } => CompiledEffectNode::SpatialPhase {
            input: input(&source.node_id),
            basis: match basis {
                SpatialBasisDSL::Index => SpatialBasis::Index,
                SpatialBasisDSL::X => SpatialBasis::X,
                SpatialBasisDSL::RandomX => SpatialBasis::RandomX,
                SpatialBasisDSL::Y => SpatialBasis::Y,
                SpatialBasisDSL::Distance => SpatialBasis::Distance,
                SpatialBasisDSL::Angle => SpatialBasis::Angle,
                SpatialBasisDSL::Custom => SpatialBasis::Custom,
            },
            from: *from,
            to: *to,
            wrap: *wrap,
            group_size: group_size.map(|size| size as usize),
            custom_order: custom_order.clone(),
        },
        EffectNodeDSL::Math {
            operation,
            left,
            right,
            ..
        } => CompiledEffectNode::Math {
            operation: match operation {
                MathOperationDSL::Add => MathOperation::Add,
                MathOperationDSL::Subtract => MathOperation::Subtract,
                MathOperationDSL::Multiply => MathOperation::Multiply,
                MathOperationDSL::Divide => MathOperation::Divide,
                MathOperationDSL::Min => MathOperation::Min,
                MathOperationDSL::Max => MathOperation::Max,
            },
            left: input(&left.node_id),
            right: input(&right.node_id),
        },
        EffectNodeDSL::Map {
            input: source,
            input_range,
            output_range,
            ..
        } => CompiledEffectNode::Map {
            input: input(&source.node_id),
            input_range: *input_range,
            output_range: *output_range,
        },
        EffectNodeDSL::Clamp {
            input: source,
            min,
            max,
            ..
        } => CompiledEffectNode::Clamp {
            input: input(&source.node_id),
            min: *min,
            max: *max,
        },
        EffectNodeDSL::ColorGradient {
            input: source,
            stops,
            ..
        } => CompiledEffectNode::ColorGradient {
            input: input(&source.node_id),
            stops: stops
                .iter()
                .filter_map(|stop| {
                    parse_hex_color(&stop.color)
                        .ok()
                        .map(|color| CompiledColorStop {
                            position: stop.position,
                            color: [color.0, color.1, color.2],
                        })
                })
                .collect(),
        },
        EffectNodeDSL::FixtureMask {
            input: source,
            min,
            max,
            ..
        } => CompiledEffectNode::FixtureMask {
            input: input(&source.node_id),
            min: *min,
            max: *max,
        },
        EffectNodeDSL::AttributeWriter {
            input: source,
            mask,
            attribute_id,
            ..
        } => {
            let attributes = profiles
                .iter()
                .copied()
                .map(|profile| {
                    let attribute = attribute_id
                        .as_deref()
                        .and_then(|id| resolve_attribute(profile, id));
                    if let Some(id) = attribute_id {
                        if attribute.is_none() {
                            errors.push(Diagnostic::error(
                                DOC_ATTRIBUTE_NOT_SUPPORTED,
                                format!("effect_definitions[id={}].graph", definition.id),
                                format!(
                                    "Fixture profile {:?} does not support attribute {id:?}.",
                                    profile_by_handle(profile).id
                                ),
                                "Retarget the effect or choose a supported fixture attribute.",
                            ));
                        }
                    }
                    (profile, attribute)
                })
                .collect();
            CompiledEffectNode::AttributeWriter {
                input: input(&source.node_id),
                mask: mask.as_ref().map(|mask| input(&mask.node_id)),
                attributes,
            }
        }
    }
}

fn compile_spatial_offsets(
    definition: &EffectDefinition,
    instance: &EffectInstance,
    groups: &HashMap<String, CompiledGroup>,
    fixtures: &[Fixture],
    coords: &[LayoutCoord],
    errors: &mut Vec<Diagnostic>,
) -> HashMap<EffectNodeHandle, Vec<f64>> {
    let Some(group) = groups.get(&instance.target_group_id) else {
        return HashMap::new();
    };
    let coords: HashMap<_, _> = coords.iter().map(|coord| (coord.id, coord)).collect();
    let center = if group.is_empty() {
        (0.0, 0.0)
    } else {
        let present: Vec<_> = group
            .sorted_fixture_ids
            .iter()
            .filter_map(|id| coords.get(id).copied())
            .collect();
        if present.is_empty() {
            (0.0, 0.0)
        } else {
            (
                present.iter().map(|coord| coord.x).sum::<f64>() / present.len() as f64,
                present.iter().map(|coord| coord.y).sum::<f64>() / present.len() as f64,
            )
        }
    };
    let fixture_indices: HashMap<_, _> = fixtures
        .iter()
        .enumerate()
        .map(|(index, fixture)| (fixture.id, index))
        .collect();
    let mut result = HashMap::new();
    for (index, node) in definition.graph.nodes.iter().enumerate() {
        let CompiledEffectNode::SpatialPhase {
            basis,
            from,
            to,
            group_size,
            custom_order,
            ..
        } = node
        else {
            continue;
        };
        let Some(handle) = EffectNodeHandle::from_index(index) else {
            continue;
        };
        let raw: Vec<_> = group
            .sorted_fixture_ids
            .iter()
            .enumerate()
            .map(|(group_index, fixture_id)| match basis {
                SpatialBasis::Index => group_index as f64,
                SpatialBasis::Custom => custom_order
                    .iter()
                    .position(|id| id == fixture_id)
                    .unwrap_or(group_index) as f64,
                SpatialBasis::X
                | SpatialBasis::RandomX
                | SpatialBasis::Y
                | SpatialBasis::Distance
                | SpatialBasis::Angle => {
                    let Some(coord) = coords.get(fixture_id) else {
                        errors.push(Diagnostic::error(
                            DOC_EFFECT_GRAPH_INVALID,
                            format!("effect_instances[id={}].target_group_id", instance.id),
                            format!("Spatial basis {basis:?} requires layout coordinates for fixture {fixture_id}."),
                            "Add layout coordinates for every targeted fixture.",
                        ));
                        return 0.0;
                    };
                    match basis {
                        SpatialBasis::X => coord.x,
                        SpatialBasis::RandomX => {
                            let bits = coord.x.to_bits();
                            let coordinate_key = (bits ^ (bits >> 32)) as u32;
                            deterministic_random(instance.seed, handle, coordinate_key, 0.0)
                        }
                        SpatialBasis::Y => coord.y,
                        SpatialBasis::Distance => {
                            (coord.x - center.0).hypot(coord.y - center.1)
                        }
                        SpatialBasis::Angle => {
                            (coord.y - center.1).atan2(coord.x - center.0)
                        }
                        _ => unreachable!(),
                    }
                }
            })
            .collect();
        let min = raw.iter().copied().reduce(f64::min).unwrap_or(0.0);
        let max = raw.iter().copied().reduce(f64::max).unwrap_or(0.0);
        let group_count = group_size.map(|size| group.len().div_ceil(size));
        let mut offsets = vec![0.0; fixtures.len()];
        for (group_index, fixture_id) in group.sorted_fixture_ids.iter().enumerate() {
            let normalized = if let Some(size) = group_size {
                let count = group_count.unwrap_or(0);
                if count <= 1 {
                    0.0
                } else {
                    (group_index / size) as f64 / (count - 1) as f64
                }
            } else if (max - min).abs() <= f64::EPSILON {
                0.0
            } else {
                (raw[group_index] - min) / (max - min)
            };
            if let Some(fixture_index) = fixture_indices.get(fixture_id) {
                offsets[*fixture_index] = from + (to - from) * normalized;
            }
        }
        result.insert(handle, offsets);
    }
    result
}

fn compile_parameter_definition(
    parameter: &ParameterDefinitionDSL,
    errors: &mut Vec<Diagnostic>,
) -> Option<ParameterDefinition> {
    let default_value = compile_parameter_value(&parameter.default_value, errors)?;
    Some(ParameterDefinition {
        id: parameter.id.clone(),
        value_type: match parameter.value_type {
            ParameterValueTypeDSL::Scalar => ParameterValueType::Scalar,
            ParameterValueTypeDSL::Color => ParameterValueType::Color,
            ParameterValueTypeDSL::Direction => ParameterValueType::Direction,
            ParameterValueTypeDSL::Boolean => ParameterValueType::Boolean,
            ParameterValueTypeDSL::Enum => ParameterValueType::Enum,
            ParameterValueTypeDSL::ColorStops => ParameterValueType::ColorStops,
        },
        default_value,
        default_enabled: parameter.default_enabled,
        range: parameter.range,
        step: parameter.step,
        required: parameter.required,
        help: parameter.help.clone(),
        safe_fallback: parameter
            .safe_fallback
            .as_ref()
            .and_then(|fallback| compile_parameter_value(fallback, errors)),
        override_policy: parameter.override_policy.map(|policy| match policy {
            ParameterOverridePolicyDSL::CueOverride => ParameterOverridePolicy::CueOverride,
            ParameterOverridePolicyDSL::EffectOnly => ParameterOverridePolicy::EffectOnly,
            ParameterOverridePolicyDSL::Locked => ParameterOverridePolicy::Locked,
        }),
        advanced: parameter.advanced,
        enum_values: parameter.enum_values.clone(),
        unit: match parameter.unit {
            ParameterUnitDSL::None => ParameterUnit::None,
            ParameterUnitDSL::Multiplier => ParameterUnit::Multiplier,
            ParameterUnitDSL::Cycles => ParameterUnit::Cycles,
            ParameterUnitDSL::Percent => ParameterUnit::Percent,
            ParameterUnitDSL::Normalized => ParameterUnit::Normalized,
            ParameterUnitDSL::Color => ParameterUnit::Color,
            ParameterUnitDSL::Direction => ParameterUnit::Direction,
            ParameterUnitDSL::Degrees => ParameterUnit::Degrees,
            ParameterUnitDSL::Boolean => ParameterUnit::Boolean,
            ParameterUnitDSL::Choice => ParameterUnit::Choice,
            ParameterUnitDSL::ColorStops => ParameterUnit::ColorStops,
        },
        ui_hint: match parameter.ui_hint {
            ParameterUiHintDSL::Slider => ParameterUiHint::Slider,
            ParameterUiHintDSL::Color => ParameterUiHint::Color,
            ParameterUiHintDSL::Segmented => ParameterUiHint::Segmented,
            ParameterUiHintDSL::Angle => ParameterUiHint::Angle,
            ParameterUiHintDSL::Toggle => ParameterUiHint::Toggle,
            ParameterUiHintDSL::Select => ParameterUiHint::Select,
            ParameterUiHintDSL::ColorStops => ParameterUiHint::ColorStops,
        },
        automation: match parameter.automation {
            AutomationPolicyDSL::Continuous => AutomationPolicy::Continuous,
            AutomationPolicyDSL::Discrete => AutomationPolicy::Discrete,
            AutomationPolicyDSL::Disabled => AutomationPolicy::Disabled,
        },
    })
}

fn compile_parameter_value(
    value: &ParameterValueDSL,
    errors: &mut Vec<Diagnostic>,
) -> Option<ParameterValue> {
    match value {
        ParameterValueDSL::Scalar(value) => Some(ParameterValue::Scalar(*value)),
        ParameterValueDSL::Color(color) => match parse_hex_color(color) {
            Ok((red, green, blue)) => Some(ParameterValue::Color([red, green, blue])),
            Err(error) => {
                errors.push(Diagnostic::error(
                    DOC_INVALID_COLOR,
                    "effect_definitions.parameters.default_value",
                    error.to_string(),
                    "Use a color in #RRGGBB format.",
                ));
                None
            }
        },
        ParameterValueDSL::Direction(direction) => {
            Some(ParameterValue::Direction(match direction {
                DirectionDSL::Forward => Direction::Forward,
                DirectionDSL::Reverse => Direction::Reverse,
            }))
        }
        ParameterValueDSL::Boolean(value) => Some(ParameterValue::Boolean(*value)),
        ParameterValueDSL::Enum(value) => Some(ParameterValue::Enum(value.clone())),
        ParameterValueDSL::ColorStops(stops) => stops
            .iter()
            .map(|stop| {
                parse_hex_color(&stop.color)
                    .map(|(red, green, blue)| (stop.position, [red, green, blue]))
                    .map_err(|error| {
                        errors.push(Diagnostic::error(
                            DOC_INVALID_COLOR,
                            "effect_definitions.parameters.default_value",
                            error.to_string(),
                            "Use colors in #RRGGBB format.",
                        ));
                    })
            })
            .collect::<Result<Vec<_>, _>>()
            .ok()
            .map(ParameterValue::ColorStops),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        circle_ring_fixture_counts,
        diagnostic::{
            DOC_ATTRIBUTE_NOT_SUPPORTED, DOC_ATTRIBUTE_OUT_OF_RANGE, DSL_DUPLICATE_FIXTURE_ID,
            DSL_TARGET_GROUP_NOT_FOUND,
        },
        Compiler,
    };
    use crate::engine::effect::{CompiledEffectNode, ParameterValue, SPEED_PARAMETER_ID};
    use crate::engine::profile::AttributeValue;

    const VALID_SHOW: &str = r##"
    {
      "schema_version": 1,
      "meta": { "name": "Compiler baseline" },
      "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 2] }],
      "layout": {
        "type": "generator",
        "generator": {
          "shape": "matrix",
          "rows": 1,
          "columns": 2,
          "spacing": 10.0,
          "origin": [5.0, 6.0]
        }
      },
      "groups": [{ "id": "line", "name": "Line", "fixtures": { "range": [1, 2] }, "sort_by": "x" }],
      "effect_definitions": [{
        "id": "project.pulse",
        "name": "Pulse",
        "revision": 1,
        "source": "project_local",
        "parameters": [{
          "id": "speed",
          "name": "Speed",
          "value_type": "scalar",
          "default_value": { "type": "scalar", "value": 1.0 },
          "range": [0.25, 8.0],
          "unit": "multiplier",
          "ui_hint": "slider",
          "automation": "continuous"
        }],
        "graph": { "nodes": [
          { "type": "time", "id": "time" },
          {
            "type": "spatial_phase",
            "id": "spatial",
            "input": { "node_id": "time", "port": "scalar" },
            "basis": "index",
            "from": 0.0,
            "to": 1.0,
            "wrap": true
          },
          {
            "type": "step_sequence",
            "id": "sequence",
            "phase": { "node_id": "spatial", "port": "scalar" },
            "steps": [{
              "values": { "color": "#ff0000", "dimmer": 0.5 },
              "width": 25.0,
              "transition": 0.0
            }]
          },
          {
            "type": "attribute_writer",
            "id": "output",
            "input": { "node_id": "sequence", "port": "attribute_set" }
          }
        ] },
        "catalog": {
          "energy": 0.5,
          "density": 0.5,
          "motion": "pulse",
          "colorfulness": 0.5,
          "strobe_risk": "none",
          "required_attributes": ["intensity", "color.rgb"]
        }
      }],
      "effect_instances": [{
        "id": "pulse",
        "definition_id": "project.pulse",
        "definition_revision": 1,
        "target_group_id": "line",
        "parameter_overrides": { "speed": { "type": "scalar", "value": 2.0 } },
        "seed": "0000000000000001"
      }],
      "timeline": {
        "ppq": 960,
        "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128.0 }] },
        "tracks": [{
          "id": "effects",
          "name": "Effects",
          "overlap_policy": "layer",
          "clips": [{
            "id": "pulse-clip",
            "instance_id": "pulse",
            "start_tick": 960,
            "duration_tick": 1920
          }]
        }]
      }
    }
    "##;

    #[test]
    fn circle_rings_distribute_every_ring_as_a_complete_symmetric_set() {
        assert_eq!(circle_ring_fixture_counts(80, 3, 14), vec![13, 26, 40]);
        assert_eq!(circle_ring_fixture_counts(86, 3, 14), vec![14, 28, 42]);
        assert_eq!(circle_ring_fixture_counts(5, 3, 14), vec![1, 1, 2]);
    }

    #[test]
    fn compiles_fixture_group_phaser_and_timeline_outputs() {
        let dsl = crate::document::load_document(VALID_SHOW)
            .expect("valid baseline DSL")
            .document;
        let show = Compiler::compile_document(dsl).expect("baseline show should compile");

        assert_eq!(show.fixtures.len(), 2);
        assert_eq!(show.fixtures[0].id, 1);
        assert_eq!(show.coords.len(), 2);
        assert_eq!((show.coords[1].x, show.coords[1].y), (15.0, 6.0));

        let group = show.groups.get("line").expect("compiled line group");
        assert_eq!(group.sorted_fixture_ids, vec![1, 2]);
        assert_eq!(group.blocks, vec![1, 1]);

        let instance = show
            .effect_instances
            .get("pulse")
            .expect("compiled effect instance");
        let definition = &show.effect_definitions[instance.definition.index()];
        let speed = definition
            .parameter_handle(SPEED_PARAMETER_ID)
            .expect("typed speed parameter");
        assert_eq!(definition.id, "project.pulse");
        assert_eq!(instance.target_group_id, "line");
        assert_eq!(
            instance.resolve_parameter(definition, speed),
            Some(&ParameterValue::Scalar(2.0))
        );
        let profile_phaser = definition
            .graph
            .nodes
            .iter()
            .find_map(|node| match node {
                CompiledEffectNode::StepSequence { profiles, .. } => {
                    profiles.get(&show.fixtures[0].profile)
                }
                _ => None,
            })
            .expect("profile-specific effect sequence");
        assert_eq!(
            profile_phaser.steps[0].values[profile_phaser.color.expect("color").index()],
            Some(AttributeValue::Color([255, 0, 0]))
        );
        assert_eq!(
            profile_phaser.steps[0].values[profile_phaser.intensity.expect("intensity").index()],
            Some(AttributeValue::Scalar(0.5))
        );
        assert!(instance
            .spatial_offsets
            .values()
            .any(|offsets| offsets == &[0.0, 1.0]));
        let timeline = show.timeline.expect("compiled timeline");
        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].clips.len(), 1);
    }

    #[test]
    fn random_x_spatial_basis_keeps_each_matrix_column_in_phase() {
        let source = VALID_SHOW
            .replace("\"id_range\": [1, 2]", "\"id_range\": [1, 4]")
            .replace(
                "\"rows\": 1,\n          \"columns\": 2",
                "\"rows\": 2,\n          \"columns\": 2",
            )
            .replace("\"range\": [1, 2]", "\"range\": [1, 4]")
            .replace("\"basis\": \"index\"", "\"basis\": \"random_x\"");
        let document = crate::document::load_document(&source)
            .expect("random-x document")
            .document;
        let show = Compiler::compile_document(document).expect("random-x effect compiles");
        let instance = show.effect_instances.get("pulse").expect("effect instance");
        let offsets = instance
            .spatial_offsets
            .values()
            .next()
            .expect("random-x offsets");

        assert_eq!(offsets.len(), 4);
        assert_eq!(offsets[0], offsets[2]);
        assert_eq!(offsets[1], offsets[3]);
        assert_ne!(offsets[0], offsets[1]);
    }

    #[test]
    fn reports_duplicate_fixture_and_missing_target_outputs() {
        let invalid_show = VALID_SHOW
            .replace(
                "[{ \"profile_id\": \"generic-rgb\", \"id_range\": [1, 2] }]",
                "[{ \"profile_id\": \"generic-rgb\", \"id_range\": [1, 2] }, { \"profile_id\": \"generic-rgb\", \"id_range\": [2, 3] }]",
            )
            .replace(
                "\"target_group_id\": \"line\"",
                "\"target_group_id\": \"Missing\"",
            );
        let dsl = crate::document::load_document(&invalid_show)
            .expect("syntactically valid DSL")
            .document;
        let errors = match Compiler::compile_document(dsl) {
            Ok(_) => panic!("invalid show must not compile"),
            Err(errors) => errors,
        };

        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0].code, DSL_DUPLICATE_FIXTURE_ID);
        assert_eq!(errors[0].path, "patch[1].id_range");
        assert_eq!(errors[0].message, "Duplicate fixture ID: 2");
        assert_eq!(
            errors[0].hint.as_deref(),
            Some("Use a unique fixture ID across all patch ranges.")
        );
        assert_eq!(errors[1].code, DSL_TARGET_GROUP_NOT_FOUND);
        assert_eq!(errors[1].path, "effect_instances[0].target_group_id");
        assert_eq!(errors[1].message, "Target group not found: Missing");
    }

    #[test]
    fn validates_effect_attributes_against_each_target_profile() {
        let unsupported = VALID_SHOW.replace(
            "\"color\": \"#ff0000\", \"dimmer\": 0.5",
            "\"color\": \"#ff0000\", \"dimmer\": 0.5, \"pan\": 90",
        );
        let unsupported_errors = match Compiler::compile_document(
            crate::document::load_document(&unsupported)
                .expect("syntactically valid unsupported show")
                .document,
        ) {
            Ok(_) => panic!("RGB profile must reject pan writes"),
            Err(errors) => errors,
        };
        assert!(unsupported_errors
            .iter()
            .any(|error| error.code == DOC_ATTRIBUTE_NOT_SUPPORTED));

        let out_of_range = unsupported
            .replace("generic-rgb", "generic-moving-head")
            .replace("\"pan\": 90", "\"pan\": 300");
        let range_errors = match Compiler::compile_document(
            crate::document::load_document(&out_of_range)
                .expect("syntactically valid range show")
                .document,
        ) {
            Ok(_) => panic!("moving-head profile must enforce its physical pan range"),
            Err(errors) => errors,
        };
        assert!(range_errors
            .iter()
            .any(|error| error.code == DOC_ATTRIBUTE_OUT_OF_RANGE));
    }
}

pub mod diagnostic;
pub mod parser;

use crate::document::{DocumentValidator, ValidatedShow};
use crate::engine::attribute::{resolve_attribute, AttributeHandle};
use crate::engine::color::parse_hex_color;
use crate::engine::effect::{
    AutomationPolicy, Direction, EffectDefinition, EffectDefinitionHandle, EffectInstance,
    ParameterDefinition, ParameterHandle, ParameterUiHint, ParameterUnit, ParameterValue,
    ParameterValueType, SPEED_PARAMETER_ID,
};
use crate::engine::profile::{
    profile_by_handle, profile_handle_by_id, AttributeValue, FixtureProfileHandle,
    COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE, PAN_ATTRIBUTE, TILT_ATTRIBUTE,
};
use diagnostic::{
    Diagnostic, DiagnosticSeverity, DOC_ATTRIBUTE_NOT_SUPPORTED, DOC_ATTRIBUTE_OUT_OF_RANGE,
    DOC_EFFECT_GRAPH_INVALID, DOC_EFFECT_INSTANCE_NOT_FOUND, DOC_FORMULA_INVALID,
    DOC_INVALID_COLOR, DOC_PARAMETER_INVALID, DOC_PROFILE_NOT_FOUND, DSL_DUPLICATE_FIXTURE_ID,
    DSL_TARGET_GROUP_NOT_FOUND,
};
use fasteval::{Compiler as FastevalCompiler, Evaler};
use parser::*;
use std::collections::HashMap;

#[derive(Clone, Default)]
pub struct CompiledShow {
    pub fixtures: Vec<Fixture>,
    pub coords: Vec<LayoutCoord>,
    pub groups: HashMap<String, CompiledGroup>,
    pub effect_definitions: Vec<EffectDefinition>,
    pub effect_instances: HashMap<String, EffectInstance>,
    pub phasers: HashMap<String, CompiledPhaser>,
    pub timeline: Option<CompiledTimeline>,
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
}

#[derive(Clone, Debug)]
pub struct CompiledGroup {
    pub id: String,
    pub name: String,
    pub sorted_fixture_ids: Vec<u32>,
    pub blocks: Vec<usize>, // number of fixtures in each unique sort block
}

impl CompiledGroup {
    pub fn index_of(&self, id: u32) -> Option<usize> {
        self.sorted_fixture_ids.iter().position(|&x| x == id)
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
pub struct CompiledPhaser {
    pub id: String,
    pub name: String,
    pub target: GroupHandle,
    pub multiplier: Option<f64>,
    pub profile_steps: HashMap<FixtureProfileHandle, CompiledProfilePhaser>,
    pub phase: PhaseConfig,
}

#[derive(Clone, Debug)]
pub struct CompiledProfilePhaser {
    pub steps: Vec<CompiledStep>,
    pub intensity: Option<AttributeHandle>,
    pub color: Option<AttributeHandle>,
    pub pan: Option<AttributeHandle>,
    pub tilt: Option<AttributeHandle>,
}

#[derive(Clone, Debug)]
pub struct CompiledStep {
    pub values: Vec<Option<AttributeValue>>,
    pub width: f64,
    pub transition: f64,
    pub accel: i32,
    pub decel: i32,
}

#[derive(Clone, Debug)]
pub enum PhaseConfig {
    Spread {
        from: f64,
        to: f64,
    },
    Grouped {
        group_size: usize,
        spread: (f64, f64),
    },
}

#[derive(Clone, Debug)]
pub struct CompiledTimeline {
    pub events: Vec<CompiledTimelineEvent>,
}

#[derive(Clone, Debug)]
pub struct CompiledTimelineEvent {
    pub beat: f64,
    pub duration: Option<f64>,
    pub action: CompiledTimelineAction,
}

#[derive(Clone, Debug)]
pub enum CompiledTimelineAction {
    Phaser {
        phaser: EffectInstanceHandle,
    },
    Animate {
        target: CompiledAutomationTarget,
        from: AnimatableValueDSL,
        to: AnimatableValueDSL,
        easing: Option<EasingDSL>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum CompiledAutomationTarget {
    GlobalMasterDimmer,
    EffectInstance {
        instance: EffectInstanceHandle,
        parameter: ParameterHandle,
    },
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
        let legacy_phasers = reconstruct_legacy_phasers(&dsl, &mut errors);
        let phasers = Self::compile_phasers(&legacy_phasers, &groups, &fixtures, &mut errors);
        let (effect_definitions, effect_instances) =
            compile_effect_models(&dsl.effect_definitions, &dsl.effect_instances, &mut errors);

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
            phasers,
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
                        .as_legacy_type()
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
                    });
                    let mut current_idx = 1;
                    for ring in 1..=*rings {
                        let count = increment * ring;
                        let radius = gap * ring as f64;
                        for i in 0..count {
                            if current_idx < fix_ids.len() {
                                let angle = (2.0 * std::f64::consts::PI / count as f64) * i as f64;
                                coords.push(LayoutCoord {
                                    id: fix_ids[current_idx],
                                    x: cx + angle.cos() * radius,
                                    y: cy + angle.sin() * radius,
                                    type_: get_type(fix_ids[current_idx]),
                                });
                                current_idx += 1;
                            }
                        }
                    }
                }
            }
            GeneratorDSL::Formula { formula } => {
                let t_start = formula.t_range.0;
                let t_end = formula.t_range.1;
                let scale = formula.scale.unwrap_or(1.0);

                let mut slab_x = fasteval::Slab::new();
                let mut slab_y = fasteval::Slab::new();

                let compiled_x = match fasteval::Parser::new().parse(&formula.x, &mut slab_x.ps) {
                    Ok(expression) => expression
                        .from(&slab_x.ps)
                        .compile(&slab_x.ps, &mut slab_x.cs),
                    Err(error) => {
                        errors.push(formula_diagnostic("layout.generator.formula.x", error));
                        return coords;
                    }
                };
                let compiled_y = match fasteval::Parser::new().parse(&formula.y, &mut slab_y.ps) {
                    Ok(expression) => expression
                        .from(&slab_y.ps)
                        .compile(&slab_y.ps, &mut slab_y.cs),
                    Err(error) => {
                        errors.push(formula_diagnostic("layout.generator.formula.y", error));
                        return coords;
                    }
                };

                for i in 0..formula.count {
                    if (i as usize) < fix_ids.len() {
                        let t = t_start
                            + (t_end - t_start) * (i as f64)
                                / (formula.count as f64 - 1.0).max(1.0);

                        let mut cb = |name: &str, _args: Vec<f64>| -> Option<f64> {
                            if name == "t" {
                                Some(t)
                            } else if name == "sin" {
                                Some(_args.first()?.sin())
                            } else if name == "cos" {
                                Some(_args.first()?.cos())
                            } else if name == "pow" {
                                Some(_args.first()?.powf(*_args.get(1)?))
                            } else {
                                None
                            }
                        };

                        let x = match compiled_x.eval(&slab_x, &mut cb) {
                            Ok(value) if value.is_finite() => value * scale,
                            Ok(_) => {
                                errors.push(non_finite_formula_diagnostic(
                                    "layout.generator.formula.x",
                                ));
                                return coords;
                            }
                            Err(error) => {
                                errors
                                    .push(formula_diagnostic("layout.generator.formula.x", error));
                                return coords;
                            }
                        };

                        let y = match compiled_y.eval(&slab_y, &mut cb) {
                            Ok(value) if value.is_finite() => value * scale,
                            Ok(_) => {
                                errors.push(non_finite_formula_diagnostic(
                                    "layout.generator.formula.y",
                                ));
                                return coords;
                            }
                            Err(error) => {
                                errors
                                    .push(formula_diagnostic("layout.generator.formula.y", error));
                                return coords;
                            }
                        };

                        coords.push(LayoutCoord {
                            id: fix_ids[i as usize],
                            x,
                            y,
                            type_: get_type(fix_ids[i as usize]),
                        });
                    }
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
                CompiledGroup {
                    id: g.id.clone(),
                    name: g.name.clone(),
                    sorted_fixture_ids: ids,
                    blocks,
                },
            );
        }
        groups
    }

    fn compile_phasers(
        phasers: &[PhaserDSL],
        groups: &HashMap<String, CompiledGroup>,
        fixtures: &[Fixture],
        errors: &mut Vec<Diagnostic>,
    ) -> HashMap<String, CompiledPhaser> {
        let mut map = HashMap::new();
        let fixture_profiles: HashMap<_, _> = fixtures
            .iter()
            .map(|fixture| (fixture.id, fixture.profile))
            .collect();
        for p in phasers {
            let group = groups.get(&p.target);
            if group.is_none() {
                errors.push(Diagnostic::error(
                    DSL_TARGET_GROUP_NOT_FOUND,
                    format!("phasers[name={}]", p.name),
                    format!("Target group not found: {}", p.target),
                    "Define the target group or update this phaser's target.",
                ));
            }

            let phase = match &p.phase {
                PhaseConfigDSL::Spread { spread } => PhaseConfig::Spread {
                    from: spread.from,
                    to: spread.to,
                },
                PhaseConfigDSL::Grouped { grouped } => PhaseConfig::Grouped {
                    group_size: grouped.group_size as usize,
                    spread: grouped.spread,
                },
            };

            let mut profile_steps = HashMap::new();
            if let Some(group) = group {
                for fixture_id in &group.sorted_fixture_ids {
                    let Some(profile) = fixture_profiles.get(fixture_id).copied() else {
                        continue;
                    };
                    profile_steps
                        .entry(profile)
                        .or_insert_with(|| compile_profile_phaser(p, profile, errors));
                }
            }

            map.insert(
                p.id.clone(),
                CompiledPhaser {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    target: p.target.clone().into(),
                    multiplier: p.multiplier,
                    profile_steps,
                    phase,
                },
            );
        }
        map
    }

    fn compile_timeline(
        timeline: TimelineV3DSL,
        definitions: &[EffectDefinition],
        instances: &HashMap<String, EffectInstance>,
        errors: &mut Vec<Diagnostic>,
    ) -> CompiledTimeline {
        let events = timeline
            .events
            .into_iter()
            .enumerate()
            .map(|(index, event)| CompiledTimelineEvent {
                beat: event.beat,
                duration: event.duration,
                action: match event.action {
                    TimelineActionV3DSL::Effect { instance_id } => CompiledTimelineAction::Phaser {
                        phaser: instance_id.into(),
                    },
                    TimelineActionV3DSL::Animate {
                        target,
                        from,
                        to,
                        easing,
                    } => CompiledTimelineAction::Animate {
                        target: compile_automation_target(
                            target,
                            definitions,
                            instances,
                            index,
                            errors,
                        ),
                        from,
                        to,
                        easing,
                    },
                },
            })
            .collect();
        CompiledTimeline { events }
    }
}

fn compile_profile_phaser(
    phaser: &PhaserDSL,
    profile_handle: FixtureProfileHandle,
    errors: &mut Vec<Diagnostic>,
) -> CompiledProfilePhaser {
    let profile = profile_by_handle(profile_handle);
    let intensity = resolve_attribute(profile_handle, INTENSITY_ATTRIBUTE);
    let color = resolve_attribute(profile_handle, COLOR_RGB_ATTRIBUTE);
    let pan = resolve_attribute(profile_handle, PAN_ATTRIBUTE);
    let tilt = resolve_attribute(profile_handle, TILT_ATTRIBUTE);
    let writes_pan = phaser.steps.iter().any(|step| step.values.pan.is_some());
    let writes_tilt = phaser.steps.iter().any(|step| step.values.tilt.is_some());

    for (attribute_id, required, handle) in [
        (INTENSITY_ATTRIBUTE, true, intensity),
        (COLOR_RGB_ATTRIBUTE, true, color),
        (PAN_ATTRIBUTE, writes_pan, pan),
        (TILT_ATTRIBUTE, writes_tilt, tilt),
    ] {
        if required && handle.is_none() {
            errors.push(Diagnostic::error(
                DOC_ATTRIBUTE_NOT_SUPPORTED,
                format!("phasers[id={}].steps.values", phaser.id),
                format!(
                    "Fixture profile {:?} does not support attribute {attribute_id:?}.",
                    profile.id
                ),
                "Retarget the effect or choose a profile with the required capability.",
            ));
        }
    }

    let steps = phaser
        .steps
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
                            format!("phasers[id={}].steps[{step_index}].values.color", phaser.id),
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
                format!("phasers[id={}].steps[{step_index}].values.pan", phaser.id),
                errors,
            );
            set_angle_value(
                &mut values,
                profile_handle,
                tilt,
                writes_tilt,
                step.values.tilt,
                format!("phasers[id={}].steps[{step_index}].values.tilt", phaser.id),
                errors,
            );

            CompiledStep {
                values,
                width: step.width.unwrap_or(100.0),
                transition: step.transition.unwrap_or(100.0),
                accel: step.accel.unwrap_or(0),
                decel: step.decel.unwrap_or(0),
            }
        })
        .collect();

    CompiledProfilePhaser {
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
    target: AutomationTargetV3DSL,
    definitions: &[EffectDefinition],
    instances: &HashMap<String, EffectInstance>,
    event_index: usize,
    errors: &mut Vec<Diagnostic>,
) -> CompiledAutomationTarget {
    match target {
        AutomationTargetV3DSL::Global { .. } => CompiledAutomationTarget::GlobalMasterDimmer,
        AutomationTargetV3DSL::EffectInstance {
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
                    format!("timeline.events[{event_index}].action.target"),
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

fn reconstruct_legacy_phasers(
    document: &ShowDocumentV3,
    errors: &mut Vec<Diagnostic>,
) -> Vec<PhaserDSL> {
    let definitions: HashMap<_, _> = document
        .effect_definitions
        .iter()
        .map(|definition| (definition.id.as_str(), definition))
        .collect();
    let mut phasers = Vec::with_capacity(document.effect_instances.len());
    for (index, instance) in document.effect_instances.iter().enumerate() {
        let Some(definition) = definitions.get(instance.definition_id.as_str()) else {
            continue;
        };
        let sequence = definition.graph.nodes.iter().find_map(|node| match node {
            EffectNodeDSL::StepSequence { steps, .. } => Some(steps.clone()),
            _ => None,
        });
        let spatial = definition.graph.nodes.iter().find_map(|node| match node {
            EffectNodeDSL::SpatialPhase {
                from,
                to,
                group_size,
                ..
            } => Some((*from, *to, *group_size)),
            _ => None,
        });
        let (Some(steps), Some((from, to, group_size))) = (sequence, spatial) else {
            errors.push(Diagnostic::error(
                DOC_EFFECT_GRAPH_INVALID,
                format!("effect_instances[{index}].definition_id"),
                format!(
                    "Effect definition {:?} is not yet reducible to the Stage 4 compatibility evaluator.",
                    definition.id
                ),
                "Use the canonical Time → SpatialPhase → StepSequence → AttributeWriter graph until the typed evaluator slice lands.",
            ));
            continue;
        };
        let speed = instance
            .parameter_overrides
            .get(SPEED_PARAMETER_ID)
            .or_else(|| {
                definition
                    .parameters
                    .iter()
                    .find(|parameter| parameter.id == SPEED_PARAMETER_ID)
                    .map(|parameter| &parameter.default_value)
            })
            .and_then(|value| match value {
                ParameterValueDSL::Scalar(value) => Some(*value),
                ParameterValueDSL::Color(_) | ParameterValueDSL::Direction(_) => None,
            });
        let phase = group_size.map_or_else(
            || PhaseConfigDSL::Spread {
                spread: PhaseSpreadDSL {
                    from: from * 100.0,
                    to: to * 100.0,
                },
            },
            |group_size| PhaseConfigDSL::Grouped {
                grouped: PhaseGroupedDSL {
                    group_size,
                    spread: (from * 100.0, to * 100.0),
                },
            },
        );
        phasers.push(PhaserDSL {
            id: instance.id.clone(),
            name: definition.name.clone(),
            target: instance.target_group_id.clone(),
            multiplier: speed,
            steps,
            phase,
        });
    }
    phasers
}

fn compile_effect_models(
    definition_documents: &[EffectDefinitionDSL],
    instance_documents: &[EffectInstanceDSL],
    errors: &mut Vec<Diagnostic>,
) -> (Vec<EffectDefinition>, HashMap<String, EffectInstance>) {
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
        definitions.push(EffectDefinition {
            id: definition.id.clone(),
            name: definition.name.clone(),
            revision: definition.revision,
            parameters,
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
            },
        );
    }
    (definitions, instances)
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
        },
        default_value,
        range: parameter.range,
        unit: match parameter.unit {
            ParameterUnitDSL::Multiplier => ParameterUnit::Multiplier,
            ParameterUnitDSL::Cycles => ParameterUnit::Cycles,
            ParameterUnitDSL::Percent => ParameterUnit::Percent,
            ParameterUnitDSL::Normalized => ParameterUnit::Normalized,
            ParameterUnitDSL::Color => ParameterUnit::Color,
            ParameterUnitDSL::Direction => ParameterUnit::Direction,
            ParameterUnitDSL::Degrees => ParameterUnit::Degrees,
        },
        ui_hint: match parameter.ui_hint {
            ParameterUiHintDSL::Slider => ParameterUiHint::Slider,
            ParameterUiHintDSL::Color => ParameterUiHint::Color,
            ParameterUiHintDSL::Segmented => ParameterUiHint::Segmented,
            ParameterUiHintDSL::Angle => ParameterUiHint::Angle,
        },
        automation: match parameter.automation {
            AutomationPolicyDSL::Continuous => AutomationPolicy::Continuous,
            AutomationPolicyDSL::Discrete => AutomationPolicy::Discrete,
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
    }
}

fn formula_diagnostic(path: &str, error: impl std::fmt::Display) -> Diagnostic {
    Diagnostic::error(
        DOC_FORMULA_INVALID,
        path,
        format!("Formula cannot be evaluated: {error}"),
        "Use t, sin, cos, and pow in a valid finite numeric expression.",
    )
}

fn non_finite_formula_diagnostic(path: &str) -> Diagnostic {
    Diagnostic::error(
        DOC_FORMULA_INVALID,
        path,
        "Formula produced a non-finite coordinate.",
        "Adjust the expression and range to produce finite coordinates.",
    )
}

#[cfg(test)]
mod tests {
    use super::{
        diagnostic::{
            DOC_ATTRIBUTE_NOT_SUPPORTED, DOC_ATTRIBUTE_OUT_OF_RANGE, DSL_DUPLICATE_FIXTURE_ID,
            DSL_TARGET_GROUP_NOT_FOUND,
        },
        Compiler, PhaseConfig,
    };
    use crate::engine::effect::{ParameterValue, SPEED_PARAMETER_ID};
    use crate::engine::profile::AttributeValue;

    const VALID_SHOW: &str = r##"
    {
      "schema_version": 2,
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
      "phasers": [{
        "id": "pulse",
        "name": "Pulse",
        "target": "line",
        "multiplier": 2.0,
        "steps": [{
          "values": { "color": "#ff0000", "dimmer": 0.5 },
          "width": 25.0,
          "transition": 0.0
        }],
        "phase": { "mode": "spread", "spread": { "from": 0.0, "to": 100.0 } }
      }],
      "timeline": {
        "events": [{
          "beat": 1.0,
          "duration": 2.0,
          "action": { "type": "phaser", "phaser": "pulse" }
        }]
      }
    }
    "##;

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

        let phaser = show.phasers.get("pulse").expect("compiled pulse phaser");
        assert_eq!(phaser.multiplier, Some(2.0));
        let instance = show
            .effect_instances
            .get("pulse")
            .expect("compiled effect instance");
        let definition = &show.effect_definitions[instance.definition.index()];
        let speed = definition
            .parameter_handle(SPEED_PARAMETER_ID)
            .expect("typed speed parameter");
        assert_eq!(definition.id, "legacy.pulse");
        assert_eq!(instance.target_group_id, "line");
        assert_eq!(
            instance.resolve_parameter(definition, speed),
            Some(&ParameterValue::Scalar(2.0))
        );
        let profile_phaser = phaser
            .profile_steps
            .get(&show.fixtures[0].profile)
            .expect("profile-specific phaser");
        assert_eq!(
            profile_phaser.steps[0].values[profile_phaser.color.expect("color").index()],
            Some(AttributeValue::Color([255, 0, 0]))
        );
        assert_eq!(
            profile_phaser.steps[0].values[profile_phaser.intensity.expect("intensity").index()],
            Some(AttributeValue::Scalar(0.5))
        );
        assert!(matches!(
            phaser.phase,
            PhaseConfig::Spread {
                from: 0.0,
                to: 100.0
            }
        ));
        assert_eq!(show.timeline.expect("compiled timeline").events.len(), 1);
    }

    #[test]
    fn reports_duplicate_fixture_and_missing_target_outputs() {
        let invalid_show = VALID_SHOW
            .replace(
                "[{ \"profile_id\": \"generic-rgb\", \"id_range\": [1, 2] }]",
                "[{ \"profile_id\": \"generic-rgb\", \"id_range\": [1, 2] }, { \"profile_id\": \"generic-rgb\", \"id_range\": [2, 3] }]",
            )
            .replace("\"target\": \"line\"", "\"target\": \"Missing\"");
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

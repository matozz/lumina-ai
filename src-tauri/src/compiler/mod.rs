pub mod diagnostic;
pub mod parser;

use diagnostic::{
    Diagnostic, DiagnosticSeverity, DSL_DUPLICATE_FIXTURE_ID, DSL_TARGET_GROUP_NOT_FOUND,
};
use fasteval::{Compiler as FastevalCompiler, Evaler};
use parser::*;
use std::collections::HashMap;

#[derive(Clone, Default)]
pub struct CompiledShow {
    pub fixtures: Vec<Fixture>,
    pub coords: Vec<LayoutCoord>,
    pub groups: HashMap<String, CompiledGroup>,
    pub phasers: HashMap<String, CompiledPhaser>,
    pub timeline: Option<CompiledTimeline>,
}

#[derive(Clone, Debug)]
pub struct Fixture {
    pub id: u32,
    pub type_: String,
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
    pub target: String,
    pub multiplier: Option<f64>,
    pub steps: Vec<CompiledStep>,
    pub phase: PhaseConfig,
}

#[derive(Clone, Debug)]
pub struct CompiledStep {
    pub color: (u8, u8, u8),
    pub dimmer: f32,
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
    pub events: Vec<TimelineEventDSL>,
}

pub struct Compiler;

impl Compiler {
    pub fn compile(dsl: ShowDSL) -> Result<CompiledShow, Vec<Diagnostic>> {
        let mut errors = Vec::new();

        let fixtures = Self::compile_patch(&dsl.patch, &mut errors);
        let coords = Self::compile_layout(&dsl.layout, &fixtures, &mut errors);
        let groups = Self::compile_groups(&dsl.groups, &fixtures, &coords, &mut errors);
        let phasers = Self::compile_phasers(&dsl.phasers, &groups, &mut errors);

        let timeline = dsl
            .timeline
            .map(|tl| CompiledTimeline { events: tl.events });

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
            phasers,
            timeline,
        })
    }

    fn compile_patch(patch_dsl: &[PatchDSL], errors: &mut Vec<Diagnostic>) -> Vec<Fixture> {
        let mut fixtures = Vec::new();
        for p in patch_dsl {
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
                    type_: p.type_.clone(),
                });
            }
        }
        fixtures
    }

    fn compile_layout(
        layout_dsl: &LayoutDSL,
        fixtures: &[Fixture],
        _errors: &mut Vec<Diagnostic>,
    ) -> Vec<LayoutCoord> {
        let mut coords = Vec::new();
        let fix_ids: Vec<u32> = fixtures.iter().map(|f| f.id).collect();
        // helper to get type
        let get_type = |id: u32| -> String {
            fixtures
                .iter()
                .find(|f| f.id == id)
                .map(|f| f.type_.clone())
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

                let compiled_x = fasteval::Parser::new()
                    .parse(&formula.x, &mut slab_x.ps)
                    .map(|expr| expr.from(&slab_x.ps).compile(&slab_x.ps, &mut slab_x.cs));
                let compiled_y = fasteval::Parser::new()
                    .parse(&formula.y, &mut slab_y.ps)
                    .map(|expr| expr.from(&slab_y.ps).compile(&slab_y.ps, &mut slab_y.cs));

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

                        let x = match &compiled_x {
                            Ok(instr) => instr.eval(&slab_x, &mut cb).unwrap_or(0.0) * scale,
                            Err(_) => t * scale,
                        };

                        let y = match &compiled_y {
                            Ok(instr) => instr.eval(&slab_y, &mut cb).unwrap_or(0.0) * scale,
                            Err(_) => t * scale,
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
            _ => {}
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
                GroupFixturesDSL::Range { range } => (range.0..=range.1).collect(),
            };

            let mut blocks = Vec::new();

            if let Some(sort_by) = &g.sort_by {
                match sort_by.as_str() {
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
                g.name.clone(),
                CompiledGroup {
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
        errors: &mut Vec<Diagnostic>,
    ) -> HashMap<String, CompiledPhaser> {
        let mut map = HashMap::new();
        for p in phasers {
            if !groups.contains_key(&p.target) {
                errors.push(Diagnostic::error(
                    DSL_TARGET_GROUP_NOT_FOUND,
                    format!("phasers[name={}]", p.name),
                    format!("Target group not found: {}", p.target),
                    "Define the target group or update this phaser's target.",
                ));
            }

            let phase = match p.phase.mode.as_str() {
                "spread" => {
                    let spread = p.phase.spread.as_ref().unwrap();
                    PhaseConfig::Spread {
                        from: spread.from,
                        to: spread.to,
                    }
                }
                "grouped" => {
                    let g = p.phase.grouped.as_ref().unwrap();
                    PhaseConfig::Grouped {
                        group_size: g.group_size as usize,
                        spread: g.spread,
                    }
                }
                _ => PhaseConfig::Spread { from: 0.0, to: 0.0 },
            };

            let steps = p
                .steps
                .iter()
                .map(|s| {
                    let color_hex = s.values.color.as_deref().unwrap_or("#000000");
                    let dimmer = s.values.dimmer.unwrap_or(1.0);

                    let r = u8::from_str_radix(&color_hex[1..3], 16).unwrap_or(0);
                    let g = u8::from_str_radix(&color_hex[3..5], 16).unwrap_or(0);
                    let b = u8::from_str_radix(&color_hex[5..7], 16).unwrap_or(0);

                    CompiledStep {
                        color: (r, g, b),
                        dimmer,
                        width: s.width.unwrap_or(100.0),
                        transition: s.transition.unwrap_or(100.0),
                        accel: s.accel.unwrap_or(0),
                        decel: s.decel.unwrap_or(0),
                    }
                })
                .collect();

            map.insert(
                p.id.clone(),
                CompiledPhaser {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    target: p.target.clone(),
                    multiplier: p.multiplier,
                    steps,
                    phase,
                },
            );
        }
        map
    }
}

#[cfg(test)]
mod tests {
    use super::{
        diagnostic::{DSL_DUPLICATE_FIXTURE_ID, DSL_TARGET_GROUP_NOT_FOUND},
        parser::ShowDSL,
        Compiler, PhaseConfig,
    };

    const VALID_SHOW: &str = r##"
    {
      "meta": { "name": "Compiler baseline" },
      "patch": [{ "type": "pixel", "id_range": [1, 2] }],
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
      "groups": [{ "name": "Line", "fixtures": { "range": [1, 2] }, "sort_by": "x" }],
      "phasers": [{
        "id": "pulse",
        "name": "Pulse",
        "target": "Line",
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
        let dsl: ShowDSL = serde_json::from_str(VALID_SHOW).expect("valid baseline DSL");
        let show = Compiler::compile(dsl).expect("baseline show should compile");

        assert_eq!(show.fixtures.len(), 2);
        assert_eq!(show.fixtures[0].id, 1);
        assert_eq!(show.coords.len(), 2);
        assert_eq!((show.coords[1].x, show.coords[1].y), (15.0, 6.0));

        let group = show.groups.get("Line").expect("compiled Line group");
        assert_eq!(group.sorted_fixture_ids, vec![1, 2]);
        assert_eq!(group.blocks, vec![1, 1]);

        let phaser = show.phasers.get("pulse").expect("compiled pulse phaser");
        assert_eq!(phaser.multiplier, Some(2.0));
        assert_eq!(phaser.steps[0].color, (255, 0, 0));
        assert_eq!(phaser.steps[0].dimmer, 0.5);
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
                "[{ \"type\": \"pixel\", \"id_range\": [1, 2] }]",
                "[{ \"type\": \"pixel\", \"id_range\": [1, 2] }, { \"type\": \"pixel\", \"id_range\": [2, 3] }]",
            )
            .replace("\"target\": \"Line\"", "\"target\": \"Missing\"");
        let dsl: ShowDSL = serde_json::from_str(&invalid_show).expect("syntactically valid DSL");
        let errors = match Compiler::compile(dsl) {
            Ok(_) => panic!("invalid show must not compile"),
            Err(errors) => errors,
        };

        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0].code, DSL_DUPLICATE_FIXTURE_ID);
        assert_eq!(errors[0].path, "patch.id_range");
        assert_eq!(errors[0].message, "Duplicate fixture ID: 2");
        assert_eq!(
            errors[0].hint.as_deref(),
            Some("Use a unique fixture ID across all patch ranges.")
        );
        assert_eq!(errors[1].code, DSL_TARGET_GROUP_NOT_FOUND);
        assert_eq!(errors[1].path, "phasers[name=Pulse]");
        assert_eq!(errors[1].message, "Target group not found: Missing");
    }
}

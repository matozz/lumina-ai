pub mod error;
pub mod parser;

use std::collections::HashMap;
use fasteval::{Evaler, Compiler as FastevalCompiler};
use error::{CompileError, ErrorSeverity};
use parser::*;

#[derive(Clone, Default)]
pub struct CompiledShow {
    pub fixtures: Vec<Fixture>,
    pub coords: Vec<LayoutCoord>,
    pub groups: HashMap<String, CompiledGroup>,
    pub presets: HashMap<String, CompiledPreset>,
    pub phasers: HashMap<String, CompiledPhaser>,
    pub sequences: Vec<CompiledSequence>,
    pub timeline: Option<CompiledTimeline>,
}

#[derive(Clone, Debug)]
pub struct Fixture {
    pub id: u32,
    pub type_: String,
    pub color_model: String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct LayoutCoord {
    pub id: u32,
    pub x: f64,
    pub y: f64,
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
}

#[derive(Clone, Debug)]
pub struct CompiledPreset {
    // Basic representation
    pub values: PresetValuesDSL,
}

#[derive(Clone, Debug)]
pub struct CompiledPhaser {
    pub name: String,
    pub target: String,
    pub speed: f64,
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
    Spread { from: f64, to: f64 },
    Grouped { group_size: usize, spread: (f64, f64) },
}

#[derive(Clone, Debug)]
pub struct CompiledSequence {
    pub name: String,
    pub cues: Vec<CompiledCue>,
}

#[derive(Clone, Debug)]
pub struct CompiledCue {
    pub id: u32,
    pub name: Option<String>,
    pub trigger: TriggerDSL,
    pub fade: f64,
    pub actions: Vec<CueActionDSL>,
}

#[derive(Clone, Debug)]
pub struct CompiledTimeline {
    pub bpm: f64,
    pub events: Vec<TimelineEventDSL>,
}

pub struct Compiler;

impl Compiler {
    pub fn compile(dsl: ShowDSL) -> Result<CompiledShow, Vec<CompileError>> {
        let mut errors = Vec::new();
        
        let fixtures = Self::compile_patch(&dsl.patch, &mut errors);
        let coords = Self::compile_layout(&dsl.layout, &fixtures, &mut errors);
        let groups = Self::compile_groups(&dsl.groups, &fixtures, &coords, &mut errors);
        let presets = Self::compile_presets(&dsl.presets, &groups, &coords, &mut errors);
        let phasers = Self::compile_phasers(&dsl.phasers, &groups, &mut errors);
        let sequences = Self::compile_sequences(&dsl.sequences, &presets, &phasers, &mut errors);
        
        let timeline = dsl.timeline.map(|tl| {
            CompiledTimeline {
                bpm: tl.bpm,
                events: tl.events,
            }
        });

        if !errors.is_empty() && errors.iter().any(|e| matches!(e.severity, ErrorSeverity::Error)) {
            return Err(errors);
        }

        Ok(CompiledShow {
            fixtures,
            coords,
            groups,
            presets,
            phasers,
            sequences,
            timeline,
        })
    }

    fn compile_patch(patch_dsl: &[PatchDSL], errors: &mut Vec<CompileError>) -> Vec<Fixture> {
        let mut fixtures = Vec::new();
        for p in patch_dsl {
            for id in p.id_range.0..=p.id_range.1 {
                if fixtures.iter().any(|f: &Fixture| f.id == id) {
                    errors.push(CompileError {
                        path: format!("patch.idRange"),
                        message: format!("Duplicate fixture ID: {}", id),
                        severity: ErrorSeverity::Error,
                    });
                }
                fixtures.push(Fixture {
                    id,
                    type_: p.type_.clone(),
                    color_model: p.color.clone(),
                });
            }
        }
        fixtures
    }

    fn compile_layout(layout_dsl: &LayoutDSL, fixtures: &[Fixture], _errors: &mut Vec<CompileError>) -> Vec<LayoutCoord> {
        let mut coords = Vec::new();
        let fix_ids: Vec<u32> = fixtures.iter().map(|f| f.id).collect();

        match &layout_dsl.generator {
            GeneratorDSL::Matrix { rows, columns, spacing, origin } => {
                let (ox, oy) = origin.unwrap_or((0.0, 0.0));
                for i in 0..*rows {
                    for j in 0..*columns {
                        let idx = (i * columns + j) as usize;
                        if idx < fix_ids.len() {
                            coords.push(LayoutCoord {
                                id: fix_ids[idx],
                                x: ox + j as f64 * spacing,
                                y: oy + i as f64 * spacing,
                            });
                        }
                    }
                }
            }
            GeneratorDSL::Circle { rings, increment, gap, center } => {
                let (cx, cy) = center.unwrap_or((0.0, 0.0));
                if !fix_ids.is_empty() {
                    coords.push(LayoutCoord { id: fix_ids[0], x: cx, y: cy });
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
                        let t = t_start + (t_end - t_start) * (i as f64) / (formula.count as f64 - 1.0).max(1.0);
                        
                        let mut cb = |name: &str, _args: Vec<f64>| -> Option<f64> {
                            if name == "t" { Some(t) }
                            else if name == "sin" { Some(_args.get(0)?.sin()) }
                            else if name == "cos" { Some(_args.get(0)?.cos()) }
                            else if name == "pow" { Some(_args.get(0)?.powf(*_args.get(1)?)) }
                            else { None }
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
                        });
                    }
                }
            }
            GeneratorDSL::Custom { fixtures: custom_fixtures } => {
                for c in custom_fixtures {
                    coords.push(LayoutCoord {
                        id: c.id,
                        x: c.x,
                        y: c.y,
                    });
                }
            }
            _ => {}
        }
        coords
    }

    fn compile_groups(group_dsl: &[GroupDSL], _fixtures: &[Fixture], coords: &[LayoutCoord], _errors: &mut Vec<CompileError>) -> HashMap<String, CompiledGroup> {
        let mut groups = HashMap::new();
        
        let mut coord_map = HashMap::new();
        for c in coords {
            coord_map.insert(c.id, c);
        }

        for g in group_dsl {
            let mut ids = Vec::new();
            match &g.fixtures {
                GroupFixturesDSL::List(list) => { ids = list.clone(); }
                GroupFixturesDSL::Range { range } => { 
                    ids = (range.0..=range.1).collect();
                }
                _ => {}
            }

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
                                std::cmp::Ordering::Equal => ya.partial_cmp(&yb).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(b)),
                                other => other,
                            }
                        });
                        
                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map.get(id).map(|c| (c.x * 1000.0).round() as i64).unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 { blocks.push(count); }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 { blocks.push(count); }
                    }
                    "-x" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            match xb.partial_cmp(&xa).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => ya.partial_cmp(&yb).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(b)),
                                other => other,
                            }
                        });
                        
                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map.get(id).map(|c| (c.x * 1000.0).round() as i64).unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 { blocks.push(count); }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 { blocks.push(count); }
                    }
                    "y" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            // Stable sort for y-axis needs secondary sorting by x-axis to group by row
                            match ya.partial_cmp(&yb).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => xa.partial_cmp(&xb).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(b)),
                                other => other,
                            }
                        });
                        
                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map.get(id).map(|c| (c.y * 1000.0).round() as i64).unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 { blocks.push(count); }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 { blocks.push(count); }
                    }
                    "-y" => {
                        ids.sort_by(|a, b| {
                            let xa = coord_map.get(a).map(|c| c.x).unwrap_or(0.0);
                            let xb = coord_map.get(b).map(|c| c.x).unwrap_or(0.0);
                            let ya = coord_map.get(a).map(|c| c.y).unwrap_or(0.0);
                            let yb = coord_map.get(b).map(|c| c.y).unwrap_or(0.0);
                            match yb.partial_cmp(&ya).unwrap_or(std::cmp::Ordering::Equal) {
                                std::cmp::Ordering::Equal => xa.partial_cmp(&xb).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(b)),
                                other => other,
                            }
                        });
                        
                        let mut curr_val = None;
                        let mut count = 0;
                        for id in &ids {
                            let val = coord_map.get(id).map(|c| (c.y * 1000.0).round() as i64).unwrap_or(0);
                            if Some(val) == curr_val {
                                count += 1;
                            } else {
                                if count > 0 { blocks.push(count); }
                                curr_val = Some(val);
                                count = 1;
                            }
                        }
                        if count > 0 { blocks.push(count); }
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
                            let da = coord_map.get(a).map(|c| (c.x - cx).powi(2) + (c.y - cy).powi(2)).unwrap_or(0.0);
                            let db = coord_map.get(b).map(|c| (c.x - cx).powi(2) + (c.y - cy).powi(2)).unwrap_or(0.0);
                            if sort_by == "distance_center" {
                                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                            } else {
                                db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
                            }
                        });
                        
                        let mut curr_val = None;
                        let mut b_count = 0;
                        for id in &ids {
                            let val = coord_map.get(id).map(|c| {
                                let d = (c.x - cx).powi(2) + (c.y - cy).powi(2);
                                (d * 1000.0).round() as i64
                            }).unwrap_or(0);
                            
                            if Some(val) == curr_val {
                                b_count += 1;
                            } else {
                                if b_count > 0 { blocks.push(b_count); }
                                curr_val = Some(val);
                                b_count = 1;
                            }
                        }
                        if b_count > 0 { blocks.push(b_count); }
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
                            let aa = coord_map.get(a).map(|c| (c.y - cy).atan2(c.x - cx)).unwrap_or(0.0);
                            let ab = coord_map.get(b).map(|c| (c.y - cy).atan2(c.x - cx)).unwrap_or(0.0);
                            if sort_by == "angle_center" {
                                aa.partial_cmp(&ab).unwrap_or(std::cmp::Ordering::Equal)
                            } else {
                                ab.partial_cmp(&aa).unwrap_or(std::cmp::Ordering::Equal)
                            }
                        });
                        
                        let mut curr_val = None;
                        let mut b_count = 0;
                        for id in &ids {
                            let val = coord_map.get(id).map(|c| {
                                let a = (c.y - cy).atan2(c.x - cx);
                                (a * 1000.0).round() as i64
                            }).unwrap_or(0);
                            
                            if Some(val) == curr_val {
                                b_count += 1;
                            } else {
                                if b_count > 0 { blocks.push(b_count); }
                                curr_val = Some(val);
                                b_count = 1;
                            }
                        }
                        if b_count > 0 { blocks.push(b_count); }
                    }
                    _ => {
                        blocks = vec![1; ids.len()];
                    }
                }
            } else {
                blocks = vec![1; ids.len()];
            }

            groups.insert(g.name.clone(), CompiledGroup {
                name: g.name.clone(),
                sorted_fixture_ids: ids,
                blocks,
            });
        }
        groups
    }

    fn compile_presets(presets: &[PresetDSL], _groups: &HashMap<String, CompiledGroup>, _coords: &[LayoutCoord], _errors: &mut Vec<CompileError>) -> HashMap<String, CompiledPreset> {
        let mut p = HashMap::new();
        for dsl in presets {
            p.insert(dsl.name.clone(), CompiledPreset { values: dsl.values.clone() });
        }
        p
    }

    fn compile_phasers(phasers: &[PhaserDSL], groups: &HashMap<String, CompiledGroup>, errors: &mut Vec<CompileError>) -> HashMap<String, CompiledPhaser> {
        let mut map = HashMap::new();
        for p in phasers {
            if !groups.contains_key(&p.target) {
                errors.push(CompileError {
                    path: format!("phasers[name={}]", p.name),
                    message: format!("Target group not found: {}", p.target),
                    severity: ErrorSeverity::Error,
                });
            }
            
            let phase = match &p.phase.mode.as_str() {
                &"spread" => {
                    let spread = p.phase.spread.as_ref().unwrap();
                    PhaseConfig::Spread { from: spread.from, to: spread.to }
                }
                &"grouped" => {
                    let g = p.phase.grouped.as_ref().unwrap();
                    PhaseConfig::Grouped { group_size: g.group_size as usize, spread: g.spread }
                }
                _ => PhaseConfig::Spread { from: 0.0, to: 0.0 }
            };

            let steps = p.steps.iter().map(|s| {
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
            }).collect();

            map.insert(p.name.clone(), CompiledPhaser {
                name: p.name.clone(),
                target: p.target.clone(),
                speed: p.speed,
                steps,
                phase,
            });
        }
        map
    }

    fn compile_sequences(seqs: &[SequenceDSL], _presets: &HashMap<String, CompiledPreset>, _phasers: &HashMap<String, CompiledPhaser>, _errors: &mut Vec<CompileError>) -> Vec<CompiledSequence> {
        seqs.iter().map(|s| CompiledSequence {
            name: s.name.clone(),
            cues: s.cues.iter().map(|c| CompiledCue {
                id: c.id,
                name: c.name.clone(),
                trigger: c.trigger.clone(),
                fade: c.fade.unwrap_or(0.0),
                actions: c.actions.clone(),
            }).collect()
        }).collect()
    }
}

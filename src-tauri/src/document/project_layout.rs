use super::{
    CustomFixturePos, FormulaDef, GeneratorDSL, LayoutAlgorithm, LayoutDSL, LayoutDefinition,
    LayoutGeometry, LayoutOrientation, LayoutSize, LayoutType,
};
use fasteval::{Compiler as FastevalCompiler, Evaler};

const METRIC_EPSILON: f64 = 0.000_001;

pub fn layout_fixture_size(layout: &LayoutDefinition) -> LayoutSize {
    match &layout.geometry {
        LayoutGeometry::Matrix { fixture_size, .. }
        | LayoutGeometry::Circle { fixture_size, .. }
        | LayoutGeometry::Sector { fixture_size, .. }
        | LayoutGeometry::Polygon { fixture_size, .. }
        | LayoutGeometry::Honeycomb { fixture_size, .. }
        | LayoutGeometry::Strip { fixture_size, .. }
        | LayoutGeometry::Wall { fixture_size, .. }
        | LayoutGeometry::Frame { fixture_size, .. }
        | LayoutGeometry::Formula { fixture_size, .. }
        | LayoutGeometry::SvgPath { fixture_size, .. }
        | LayoutGeometry::Custom { fixture_size, .. }
        | LayoutGeometry::Algorithm { fixture_size, .. } => *fixture_size,
    }
}

pub fn layout_fixture_size_for_fixture(layout: &LayoutDefinition, fixture_id: u32) -> LayoutSize {
    layout
        .fixture_size_overrides
        .iter()
        .find(|item| item.fixture_id == fixture_id)
        .map(|item| item.size)
        .unwrap_or_else(|| layout_fixture_size(layout))
}

pub fn layout_grid_dimensions(layout: &LayoutDefinition) -> Option<(u32, u32)> {
    match layout.geometry {
        LayoutGeometry::Matrix { rows, columns, .. }
        | LayoutGeometry::Wall { rows, columns, .. }
        | LayoutGeometry::Honeycomb { rows, columns, .. } => Some((rows, columns)),
        LayoutGeometry::Strip {
            count,
            orientation: LayoutOrientation::Horizontal,
            ..
        } => Some((1, count)),
        LayoutGeometry::Strip {
            count,
            orientation: LayoutOrientation::Vertical,
            ..
        } => Some((count, 1)),
        LayoutGeometry::Circle { .. }
        | LayoutGeometry::Sector { .. }
        | LayoutGeometry::Polygon { .. }
        | LayoutGeometry::Frame { .. }
        | LayoutGeometry::Formula { .. }
        | LayoutGeometry::SvgPath { .. }
        | LayoutGeometry::Custom { .. }
        | LayoutGeometry::Algorithm { .. } => None,
    }
}

pub fn layout_capacity(layout: &LayoutDefinition) -> usize {
    match &layout.geometry {
        LayoutGeometry::Matrix { rows, columns, .. }
        | LayoutGeometry::Wall { rows, columns, .. } => (*rows as usize) * (*columns as usize),
        LayoutGeometry::Circle {
            rings, increment, ..
        } => 1 + (*increment as usize) * (*rings as usize) * ((*rings + 1) as usize) / 2,
        LayoutGeometry::Sector {
            rings, segments, ..
        } => (*segments as usize) * (*rings as usize) * ((*rings + 1) as usize) / 2,
        LayoutGeometry::Polygon {
            sides,
            fixtures_per_side,
            ..
        } => (*sides as usize) * (*fixtures_per_side as usize),
        LayoutGeometry::Honeycomb { rows, columns, .. } => (*rows as usize) * (*columns as usize),
        LayoutGeometry::Strip { count, .. } | LayoutGeometry::Algorithm { count, .. } => {
            *count as usize
        }
        LayoutGeometry::Frame { rows, columns, .. } => {
            (2 * (*rows as usize + *columns as usize)).saturating_sub(4)
        }
        LayoutGeometry::Formula { formula, .. } => formula.count as usize,
        LayoutGeometry::SvgPath { svg_path, .. } => svg_path.sample_count as usize,
        LayoutGeometry::Custom { fixtures, .. } => fixtures.len(),
    }
}

pub fn layout_authoring_capacity(layout: &LayoutDefinition) -> usize {
    layout_capacity(layout)
}

pub fn validate_layout_geometry(layout: &LayoutDefinition) -> Result<(), String> {
    match &layout.geometry {
        LayoutGeometry::Matrix {
            fixture_size,
            gap,
            pitch,
            origin,
            ..
        }
        | LayoutGeometry::Strip {
            fixture_size,
            gap,
            pitch,
            origin,
            ..
        }
        | LayoutGeometry::Wall {
            fixture_size,
            gap,
            pitch,
            origin,
            ..
        }
        | LayoutGeometry::Frame {
            fixture_size,
            gap,
            pitch,
            origin,
            ..
        }
        | LayoutGeometry::Honeycomb {
            fixture_size,
            gap,
            pitch,
            origin,
            ..
        } => {
            if ![
                fixture_size.width,
                fixture_size.height,
                gap.x,
                gap.y,
                pitch.x,
                pitch.y,
                origin.x,
                origin.y,
            ]
            .into_iter()
            .all(f64::is_finite)
            {
                return Err("Layout size, gap, pitch, and origin must be finite.".to_string());
            }
            if fixture_size.width <= 0.0
                || fixture_size.height <= 0.0
                || gap.x < 0.0
                || gap.y < 0.0
                || pitch.x <= 0.0
                || pitch.y <= 0.0
            {
                return Err(
                    "Fixture size and pitch must be positive; layout gap may be zero.".to_string(),
                );
            }
            if (pitch.x - fixture_size.width - gap.x).abs() > METRIC_EPSILON
                || (pitch.y - fixture_size.height - gap.y).abs() > METRIC_EPSILON
            {
                return Err(
                    "Layout pitch must equal fixture size plus edge gap on each axis.".to_string(),
                );
            }
        }
        LayoutGeometry::Circle {
            fixture_size,
            ring_gap,
            ring_pitch,
            center,
            ..
        } => {
            if ![
                fixture_size.width,
                fixture_size.height,
                *ring_gap,
                *ring_pitch,
                center.x,
                center.y,
            ]
            .into_iter()
            .all(f64::is_finite)
            {
                return Err("Circle layout metrics must be finite.".to_string());
            }
            if fixture_size.width <= 0.0
                || fixture_size.height <= 0.0
                || *ring_gap < 0.0
                || *ring_pitch <= 0.0
            {
                return Err(
                    "Circle fixture size and spacing must be positive; fixture gap may be zero."
                        .to_string(),
                );
            }
            let diameter = fixture_size.width.max(fixture_size.height);
            if (*ring_pitch - diameter - *ring_gap).abs() > METRIC_EPSILON {
                return Err(
                    "Circle spacing must equal fixture diameter plus fixture gap.".to_string(),
                );
            }
        }
        LayoutGeometry::Sector {
            fixture_size,
            ring_gap,
            ring_pitch,
            start_angle_degrees,
            sweep_angle_degrees,
            center,
            ..
        } => {
            validate_radial_metrics(fixture_size, *ring_gap, *ring_pitch)?;
            if ![
                *start_angle_degrees,
                *sweep_angle_degrees,
                center.x,
                center.y,
            ]
            .into_iter()
            .all(f64::is_finite)
                || *sweep_angle_degrees <= 0.0
                || *sweep_angle_degrees > 360.0
            {
                return Err(
                    "Sector angles and center must be finite, with sweep in (0, 360].".to_string(),
                );
            }
        }
        LayoutGeometry::Polygon {
            fixture_size,
            radius,
            rotation_degrees,
            center,
            ..
        } => {
            validate_fixture_size(fixture_size.width, fixture_size.height)?;
            if ![*radius, *rotation_degrees, center.x, center.y]
                .into_iter()
                .all(f64::is_finite)
                || *radius <= 0.0
            {
                return Err("Polygon radius, rotation, and center must be finite.".to_string());
            }
        }
        LayoutGeometry::Formula {
            formula,
            fixture_size,
        } => {
            validate_fixture_size(fixture_size.width, fixture_size.height)?;
            if !formula.t_range.0.is_finite()
                || !formula.t_range.1.is_finite()
                || formula.t_range.1 <= formula.t_range.0
                || formula
                    .scale
                    .is_some_and(|scale| !scale.is_finite() || scale <= 0.0)
            {
                return Err("Formula range and scale must be finite and positive.".to_string());
            }
            evaluate_formula_positions(formula, &[1, 2])?;
        }
        LayoutGeometry::SvgPath {
            svg_path,
            fixture_size,
        } => {
            validate_fixture_size(fixture_size.width, fixture_size.height)?;
            if svg_path.d.trim().is_empty()
                || svg_path
                    .scale
                    .is_some_and(|scale| !scale.is_finite() || scale <= 0.0)
            {
                return Err("SVG path data and a finite positive scale are required.".to_string());
            }
        }
        LayoutGeometry::Custom {
            fixtures,
            fixture_size,
        } => {
            validate_fixture_size(fixture_size.width, fixture_size.height)?;
            if fixtures
                .iter()
                .any(|fixture| !fixture.x.is_finite() || !fixture.y.is_finite())
            {
                return Err("Every custom fixture coordinate must be finite.".to_string());
            }
        }
        LayoutGeometry::Algorithm {
            fixture_size,
            algorithm,
            count,
            origin,
            parameters,
            ..
        } => {
            validate_fixture_size(fixture_size.width, fixture_size.height)?;
            if !origin.x.is_finite()
                || !origin.y.is_finite()
                || parameters.values().any(|value| !value.is_finite())
            {
                return Err("Algorithm origin and parameters must be finite.".to_string());
            }
            if *count == 0 {
                return Err("Algorithm fixture count must be positive.".to_string());
            }
            let positive = match algorithm {
                LayoutAlgorithm::Spiral => {
                    parameter(parameters, "turns", 3.0) > 0.0
                        && parameter(parameters, "radius", 180.0) > 0.0
                }
                LayoutAlgorithm::Lissajous => {
                    parameter(parameters, "a", 3.0) > 0.0
                        && parameter(parameters, "b", 2.0) > 0.0
                        && parameter(parameters, "scale_x", 160.0) > 0.0
                        && parameter(parameters, "scale_y", 120.0) > 0.0
                }
            };
            if !positive {
                return Err(
                    "Algorithm frequencies, turns, radius, and scale must be positive.".to_string(),
                );
            }
        }
    }
    let mut fixture_ids = std::collections::BTreeSet::new();
    for item in &layout.fixture_size_overrides {
        validate_fixture_size(item.size.width, item.size.height)?;
        if !fixture_ids.insert(item.fixture_id) {
            return Err(format!(
                "Fixture size override {} is duplicated.",
                item.fixture_id
            ));
        }
    }
    Ok(())
}

pub fn layout_to_show_dsl(layout: &LayoutDefinition, fixture_ids: &[u32]) -> LayoutDSL {
    let generator = match &layout.geometry {
        LayoutGeometry::Matrix {
            rows,
            columns,
            pitch,
            origin,
            ..
        }
        | LayoutGeometry::Wall {
            rows,
            columns,
            pitch,
            origin,
            ..
        } if (pitch.x - pitch.y).abs() <= METRIC_EPSILON => GeneratorDSL::Matrix {
            rows: *rows,
            columns: *columns,
            spacing: pitch.x,
            origin: Some((origin.x, origin.y)),
        },
        LayoutGeometry::Formula { formula, .. } => GeneratorDSL::Formula {
            formula: formula.clone(),
        },
        LayoutGeometry::SvgPath { svg_path, .. } => GeneratorDSL::SvgPath {
            svg_path: svg_path.clone(),
        },
        LayoutGeometry::Custom { fixtures, .. } => GeneratorDSL::Custom {
            fixtures: fixtures.clone(),
        },
        _ => GeneratorDSL::Custom {
            fixtures: layout_positions(layout, fixture_ids),
        },
    };
    LayoutDSL {
        type_: LayoutType::Generator,
        generator,
    }
}

pub fn layout_positions(layout: &LayoutDefinition, fixture_ids: &[u32]) -> Vec<CustomFixturePos> {
    match &layout.geometry {
        LayoutGeometry::Matrix {
            rows,
            columns,
            pitch,
            origin,
            ..
        }
        | LayoutGeometry::Wall {
            rows,
            columns,
            pitch,
            origin,
            ..
        } => grid_positions(
            *rows,
            *columns,
            pitch.x,
            pitch.y,
            origin.x,
            origin.y,
            fixture_ids,
        ),
        LayoutGeometry::Honeycomb {
            rows,
            columns,
            pitch,
            origin,
            ..
        } => honeycomb_positions(
            *rows,
            *columns,
            pitch.x,
            pitch.y,
            origin.x,
            origin.y,
            fixture_ids,
        ),
        LayoutGeometry::Strip {
            orientation,
            pitch,
            origin,
            ..
        } => fixture_ids
            .iter()
            .enumerate()
            .map(|(index, id)| CustomFixturePos {
                id: *id,
                x: origin.x
                    + if matches!(orientation, LayoutOrientation::Horizontal) {
                        index as f64 * pitch.x
                    } else {
                        0.0
                    },
                y: origin.y
                    + if matches!(orientation, LayoutOrientation::Vertical) {
                        index as f64 * pitch.y
                    } else {
                        0.0
                    },
            })
            .collect(),
        LayoutGeometry::Frame {
            rows,
            columns,
            pitch,
            origin,
            ..
        } => frame_positions(
            *rows,
            *columns,
            pitch.x,
            pitch.y,
            origin.x,
            origin.y,
            fixture_ids,
        ),
        LayoutGeometry::Circle {
            rings,
            increment,
            ring_pitch,
            center,
            ..
        } => radial_positions(
            true,
            *rings,
            *increment,
            *ring_pitch,
            0.0,
            360.0,
            center.x,
            center.y,
            fixture_ids,
        ),
        LayoutGeometry::Sector {
            rings,
            segments,
            ring_pitch,
            start_angle_degrees,
            sweep_angle_degrees,
            center,
            ..
        } => radial_positions(
            false,
            *rings,
            *segments,
            *ring_pitch,
            *start_angle_degrees,
            *sweep_angle_degrees,
            center.x,
            center.y,
            fixture_ids,
        ),
        LayoutGeometry::Polygon {
            sides,
            fixtures_per_side,
            radius,
            rotation_degrees,
            center,
            ..
        } => polygon_positions(
            *sides,
            *fixtures_per_side,
            *radius,
            *rotation_degrees,
            center.x,
            center.y,
            fixture_ids,
        ),
        LayoutGeometry::Custom { fixtures, .. } => fixtures.clone(),
        LayoutGeometry::Algorithm {
            algorithm,
            count,
            origin,
            parameters,
            ..
        } => algorithm_positions(
            *algorithm,
            origin.x,
            origin.y,
            parameters,
            &fixture_ids[..fixture_ids.len().min(*count as usize)],
        ),
        LayoutGeometry::Formula { formula, .. } => {
            evaluate_formula_positions(formula, fixture_ids).unwrap_or_default()
        }
        LayoutGeometry::SvgPath { .. } => Vec::new(),
    }
}

fn grid_positions(
    rows: u32,
    columns: u32,
    pitch_x: f64,
    pitch_y: f64,
    origin_x: f64,
    origin_y: f64,
    fixture_ids: &[u32],
) -> Vec<CustomFixturePos> {
    fixture_ids
        .iter()
        .take((rows as usize) * (columns as usize))
        .enumerate()
        .map(|(index, id)| CustomFixturePos {
            id: *id,
            x: origin_x + (index % columns as usize) as f64 * pitch_x,
            y: origin_y + (index / columns as usize) as f64 * pitch_y,
        })
        .collect()
}

fn honeycomb_positions(
    rows: u32,
    columns: u32,
    pitch_x: f64,
    pitch_y: f64,
    origin_x: f64,
    origin_y: f64,
    fixture_ids: &[u32],
) -> Vec<CustomFixturePos> {
    fixture_ids
        .iter()
        .take((rows as usize) * (columns as usize))
        .enumerate()
        .map(|(index, id)| {
            let row = index / columns as usize;
            let column = index % columns as usize;
            CustomFixturePos {
                id: *id,
                x: origin_x + column as f64 * pitch_x + (row % 2) as f64 * pitch_x / 2.0,
                y: origin_y + row as f64 * pitch_y,
            }
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn radial_positions(
    include_center: bool,
    rings: u32,
    increment: u32,
    ring_pitch: f64,
    start_angle_degrees: f64,
    sweep_angle_degrees: f64,
    center_x: f64,
    center_y: f64,
    fixture_ids: &[u32],
) -> Vec<CustomFixturePos> {
    let mut positions = Vec::with_capacity(fixture_ids.len());
    let mut index = 0;
    if include_center {
        if let Some(id) = fixture_ids.first() {
            positions.push(CustomFixturePos {
                id: *id,
                x: center_x,
                y: center_y,
            });
            index = 1;
        }
    }
    let full_circle = (sweep_angle_degrees - 360.0).abs() <= METRIC_EPSILON;
    for ring in 1..=rings {
        let count = increment.saturating_mul(ring) as usize;
        for step in 0..count {
            let Some(id) = fixture_ids.get(index) else {
                return positions;
            };
            let divisor = if full_circle {
                count
            } else {
                count.saturating_sub(1).max(1)
            };
            let angle = (start_angle_degrees + sweep_angle_degrees * step as f64 / divisor as f64)
                .to_radians();
            let radius = ring_pitch * f64::from(ring);
            positions.push(CustomFixturePos {
                id: *id,
                x: center_x + angle.cos() * radius,
                y: center_y + angle.sin() * radius,
            });
            index += 1;
        }
    }
    positions
}

#[allow(clippy::too_many_arguments)]
fn polygon_positions(
    sides: u32,
    fixtures_per_side: u32,
    radius: f64,
    rotation_degrees: f64,
    center_x: f64,
    center_y: f64,
    fixture_ids: &[u32],
) -> Vec<CustomFixturePos> {
    let capacity = (sides as usize) * (fixtures_per_side as usize);
    fixture_ids
        .iter()
        .take(capacity)
        .enumerate()
        .map(|(index, id)| {
            let side = index / fixtures_per_side as usize;
            let step = index % fixtures_per_side as usize;
            let start_angle = rotation_degrees.to_radians()
                + std::f64::consts::TAU * side as f64 / f64::from(sides);
            let end_angle = rotation_degrees.to_radians()
                + std::f64::consts::TAU * (side + 1) as f64 / f64::from(sides);
            let progress = step as f64 / f64::from(fixtures_per_side);
            let start = (start_angle.cos() * radius, start_angle.sin() * radius);
            let end = (end_angle.cos() * radius, end_angle.sin() * radius);
            CustomFixturePos {
                id: *id,
                x: center_x + start.0 + (end.0 - start.0) * progress,
                y: center_y + start.1 + (end.1 - start.1) * progress,
            }
        })
        .collect()
}

fn frame_positions(
    rows: u32,
    columns: u32,
    pitch_x: f64,
    pitch_y: f64,
    origin_x: f64,
    origin_y: f64,
    fixture_ids: &[u32],
) -> Vec<CustomFixturePos> {
    let mut cells = Vec::new();
    for column in 0..columns {
        cells.push((0, column));
    }
    for row in 1..rows {
        cells.push((row, columns - 1));
    }
    if rows > 1 {
        for column in (0..columns.saturating_sub(1)).rev() {
            cells.push((rows - 1, column));
        }
    }
    if columns > 1 {
        for row in (1..rows.saturating_sub(1)).rev() {
            cells.push((row, 0));
        }
    }
    fixture_ids
        .iter()
        .zip(cells)
        .map(|(id, (row, column))| CustomFixturePos {
            id: *id,
            x: origin_x + column as f64 * pitch_x,
            y: origin_y + row as f64 * pitch_y,
        })
        .collect()
}

fn algorithm_positions(
    algorithm: LayoutAlgorithm,
    origin_x: f64,
    origin_y: f64,
    parameters: &std::collections::BTreeMap<String, f64>,
    fixture_ids: &[u32],
) -> Vec<CustomFixturePos> {
    let points = match algorithm {
        LayoutAlgorithm::Spiral => {
            resample_open_path_by_chord_length(fixture_ids.len(), |progress| {
                let turns = parameter(parameters, "turns", 3.0);
                let radius = parameter(parameters, "radius", 180.0) * progress;
                let angle = progress * turns * std::f64::consts::TAU;
                (angle.cos() * radius, angle.sin() * radius)
            })
        }
        LayoutAlgorithm::Lissajous => {
            resample_path_by_arc_length(fixture_ids.len(), true, |progress| {
                let a = parameter(parameters, "a", 3.0);
                let b = parameter(parameters, "b", 2.0);
                let delta = parameter(parameters, "delta", std::f64::consts::FRAC_PI_2);
                let scale_x = parameter(parameters, "scale_x", 160.0);
                let scale_y = parameter(parameters, "scale_y", 120.0);
                let angle = progress * std::f64::consts::TAU;
                (
                    (a * angle + delta).sin() * scale_x,
                    (b * angle).sin() * scale_y,
                )
            })
        }
    };
    fixture_ids
        .iter()
        .enumerate()
        .zip(points)
        .map(|((_, id), (x, y))| CustomFixturePos {
            id: *id,
            x: origin_x + x,
            y: origin_y + y,
        })
        .collect()
}

fn resample_open_path_by_chord_length(
    count: usize,
    point_at: impl Fn(f64) -> (f64, f64),
) -> Vec<(f64, f64)> {
    if count == 0 {
        return Vec::new();
    }
    if count == 1 {
        return vec![point_at(0.0)];
    }

    let segment_count = 8192_usize.max(count.saturating_mul(48));
    let sampled = (0..=segment_count)
        .map(|index| point_at(index as f64 / segment_count as f64))
        .collect::<Vec<_>>();
    let total_length = sampled
        .windows(2)
        .map(|pair| (pair[1].0 - pair[0].0).hypot(pair[1].1 - pair[0].1))
        .sum::<f64>();

    let walk = |spacing: f64| {
        let mut points = vec![sampled[0]];
        let mut sample_index = 1;
        while points.len() < count {
            let previous = *points.last().expect("path point");
            while sample_index < sampled.len()
                && (sampled[sample_index].0 - previous.0)
                    .hypot(sampled[sample_index].1 - previous.1)
                    < spacing
            {
                sample_index += 1;
            }
            if sample_index >= sampled.len() {
                return (false, points);
            }
            let start = sampled[sample_index - 1];
            let end = sampled[sample_index];
            let mut low = 0.0;
            let mut high = 1.0;
            for _ in 0..32 {
                let middle = (low + high) / 2.0;
                let x = start.0 + (end.0 - start.0) * middle;
                let y = start.1 + (end.1 - start.1) * middle;
                if (x - previous.0).hypot(y - previous.1) < spacing {
                    low = middle;
                } else {
                    high = middle;
                }
            }
            points.push((
                start.0 + (end.0 - start.0) * high,
                start.1 + (end.1 - start.1) * high,
            ));
        }
        (true, points)
    };

    let mut low = 0.0;
    let mut high = total_length / (count - 1) as f64 * 2.0;
    let mut best = resample_path_by_arc_length(count, false, &point_at);
    for _ in 0..48 {
        let middle = (low + high) / 2.0;
        let (complete, candidate) = walk(middle);
        if complete {
            low = middle;
            best = candidate;
        } else {
            high = middle;
        }
    }
    best
}

fn resample_path_by_arc_length(
    count: usize,
    closed: bool,
    point_at: impl Fn(f64) -> (f64, f64),
) -> Vec<(f64, f64)> {
    if count == 0 {
        return Vec::new();
    }
    if count == 1 {
        return vec![point_at(0.0)];
    }

    let segment_count = 4096_usize.max(count.saturating_mul(24));
    let sampled = (0..=segment_count)
        .map(|index| point_at(index as f64 / segment_count as f64))
        .collect::<Vec<_>>();
    let mut cumulative = Vec::with_capacity(sampled.len());
    cumulative.push(0.0);
    for index in 1..sampled.len() {
        let distance = (sampled[index].0 - sampled[index - 1].0)
            .hypot(sampled[index].1 - sampled[index - 1].1);
        cumulative.push(cumulative[index - 1] + distance);
    }
    let total_length = *cumulative.last().unwrap_or(&0.0);
    if total_length <= METRIC_EPSILON {
        return vec![sampled[0]; count];
    }

    let divisor = (if closed { count } else { count - 1 }) as f64;
    let mut segment = 1;
    (0..count)
        .map(|index| {
            let target = total_length * index as f64 / divisor;
            while segment < cumulative.len() - 1 && cumulative[segment] < target {
                segment += 1;
            }
            let previous_length = cumulative[segment - 1];
            let segment_length = cumulative[segment] - previous_length;
            let progress = if segment_length <= METRIC_EPSILON {
                0.0
            } else {
                (target - previous_length) / segment_length
            };
            (
                sampled[segment - 1].0 + (sampled[segment].0 - sampled[segment - 1].0) * progress,
                sampled[segment - 1].1 + (sampled[segment].1 - sampled[segment - 1].1) * progress,
            )
        })
        .collect()
}

pub fn evaluate_formula_positions(
    formula: &FormulaDef,
    fixture_ids: &[u32],
) -> Result<Vec<CustomFixturePos>, String> {
    let mut slab_x = fasteval::Slab::new();
    let mut slab_y = fasteval::Slab::new();
    let compiled_x = fasteval::Parser::new()
        .parse(&formula.x, &mut slab_x.ps)
        .map_err(|error| format!("X formula cannot be parsed: {error}"))?
        .from(&slab_x.ps)
        .compile(&slab_x.ps, &mut slab_x.cs);
    let compiled_y = fasteval::Parser::new()
        .parse(&formula.y, &mut slab_y.ps)
        .map_err(|error| format!("Y formula cannot be parsed: {error}"))?
        .from(&slab_y.ps)
        .compile(&slab_y.ps, &mut slab_y.cs);
    let scale = formula.scale.unwrap_or(1.0);
    fixture_ids
        .iter()
        .take(formula.count as usize)
        .enumerate()
        .map(|(index, id)| {
            let t = formula.t_range.0
                + (formula.t_range.1 - formula.t_range.0) * index as f64
                    / (f64::from(formula.count) - 1.0).max(1.0);
            let mut variables = |name: &str, args: Vec<f64>| -> Option<f64> {
                match name {
                    "t" => Some(t),
                    "sin" => Some(args.first()?.sin()),
                    "cos" => Some(args.first()?.cos()),
                    "pow" => Some(args.first()?.powf(*args.get(1)?)),
                    _ => None,
                }
            };
            let x = compiled_x
                .eval(&slab_x, &mut variables)
                .map_err(|error| format!("X formula cannot be evaluated: {error}"))?
                * scale;
            let y = compiled_y
                .eval(&slab_y, &mut variables)
                .map_err(|error| format!("Y formula cannot be evaluated: {error}"))?
                * scale;
            if !x.is_finite() || !y.is_finite() {
                return Err("Formula produced a non-finite coordinate.".to_string());
            }
            Ok(CustomFixturePos { id: *id, x, y })
        })
        .collect()
}

fn parameter(parameters: &std::collections::BTreeMap<String, f64>, id: &str, default: f64) -> f64 {
    parameters.get(id).copied().unwrap_or(default)
}

fn validate_fixture_size(width: f64, height: f64) -> Result<(), String> {
    if width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0 {
        Ok(())
    } else {
        Err("Fixture size must be finite and positive.".to_string())
    }
}

fn validate_radial_metrics(
    fixture_size: &LayoutSize,
    ring_gap: f64,
    ring_pitch: f64,
) -> Result<(), String> {
    validate_fixture_size(fixture_size.width, fixture_size.height)?;
    let diameter = fixture_size.width.max(fixture_size.height);
    if ![ring_gap, ring_pitch].into_iter().all(f64::is_finite)
        || ring_gap < 0.0
        || ring_pitch <= 0.0
        || (ring_pitch - diameter - ring_gap).abs() > METRIC_EPSILON
    {
        return Err(
            "Radial spacing must equal fixture diameter plus a non-negative fixture gap."
                .to_string(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{layout_capacity, layout_positions};
    use crate::document::{builtin_production_catalog, LayoutGeometry};

    #[test]
    fn every_supported_builtin_generator_materializes_finite_unique_positions() {
        let catalog = builtin_production_catalog().expect("built-in Catalog");
        for layout in &catalog.layouts {
            let capacity = layout_capacity(layout);
            let fixture_ids = (1..=capacity as u32).collect::<Vec<_>>();
            let positions = layout_positions(layout, &fixture_ids);
            assert_eq!(positions.len(), capacity, "{} capacity", layout.id);
            assert!(
                positions
                    .iter()
                    .all(|position| position.x.is_finite() && position.y.is_finite()),
                "{} finite coordinates",
                layout.id
            );
            assert_eq!(
                positions
                    .iter()
                    .map(|position| position.id)
                    .collect::<std::collections::BTreeSet<_>>()
                    .len(),
                capacity,
                "{} unique fixtures",
                layout.id
            );
        }
    }

    #[test]
    fn radial_quantity_fields_do_not_rewrite_saved_spacing() {
        let catalog = builtin_production_catalog().expect("built-in Catalog");
        let mut circle = catalog
            .layouts
            .iter()
            .find(|layout| matches!(layout.geometry, LayoutGeometry::Circle { .. }))
            .expect("Circle preset")
            .clone();
        let LayoutGeometry::Circle {
            rings,
            increment,
            ring_gap,
            ring_pitch,
            ..
        } = &mut circle.geometry
        else {
            unreachable!()
        };
        let spacing = (*ring_gap, *ring_pitch);
        *rings = 3;
        *increment = 14;
        assert_eq!(spacing, (*ring_gap, *ring_pitch));
        assert_eq!(layout_capacity(&circle), 85);

        let mut sector = catalog
            .layouts
            .iter()
            .find(|layout| matches!(layout.geometry, LayoutGeometry::Sector { .. }))
            .expect("Sector preset")
            .clone();
        let LayoutGeometry::Sector {
            rings,
            segments,
            ring_gap,
            ring_pitch,
            ..
        } = &mut sector.geometry
        else {
            unreachable!()
        };
        let spacing = (*ring_gap, *ring_pitch);
        *rings = 4;
        *segments = 5;
        assert_eq!(spacing, (*ring_gap, *ring_pitch));
        assert_eq!(layout_capacity(&sector), 50);
    }

    #[test]
    fn circle_sector_polygon_and_honeycomb_presets_keep_clear_fixture_centers() {
        let catalog = builtin_production_catalog().expect("built-in Catalog");
        for layout in catalog.layouts.iter().filter(|layout| {
            matches!(
                layout.geometry,
                LayoutGeometry::Circle { .. }
                    | LayoutGeometry::Sector { .. }
                    | LayoutGeometry::Polygon { .. }
                    | LayoutGeometry::Honeycomb { .. }
            )
        }) {
            let capacity = layout_capacity(layout);
            let fixture_ids = (1..=capacity as u32).collect::<Vec<_>>();
            let positions = layout_positions(layout, &fixture_ids);
            let minimum = positions
                .iter()
                .enumerate()
                .flat_map(|(index, left)| {
                    positions[index + 1..]
                        .iter()
                        .map(move |right| (left.x - right.x).hypot(left.y - right.y))
                })
                .fold(f64::INFINITY, f64::min);
            assert!(minimum >= 8.9, "{} minimum center gap {minimum}", layout.id);
        }
    }

    #[test]
    fn algorithms_use_nearly_uniform_physical_spacing() {
        let catalog = builtin_production_catalog().expect("built-in Catalog");
        for layout in catalog
            .layouts
            .iter()
            .filter(|layout| matches!(layout.geometry, LayoutGeometry::Algorithm { .. }))
        {
            let capacity = layout_capacity(layout);
            let fixture_ids = (1..=capacity as u32).collect::<Vec<_>>();
            let positions = layout_positions(layout, &fixture_ids);
            let mut distances = positions
                .windows(2)
                .map(|pair| (pair[1].x - pair[0].x).hypot(pair[1].y - pair[0].y))
                .collect::<Vec<_>>();
            if matches!(
                layout.geometry,
                LayoutGeometry::Algorithm {
                    algorithm: crate::document::LayoutAlgorithm::Lissajous,
                    ..
                }
            ) {
                let first = &positions[0];
                let last = positions.last().expect("Algorithm position");
                distances.push((first.x - last.x).hypot(first.y - last.y));
            }
            let minimum = distances.iter().copied().fold(f64::INFINITY, f64::min);
            let maximum = distances.iter().copied().fold(0.0, f64::max);
            assert!(minimum > 0.0, "{} positive spacing", layout.id);
            assert!(
                maximum / minimum < 1.08,
                "{} spacing ratio {}",
                layout.id,
                maximum / minimum
            );
        }
    }
}

use super::{
    CustomFixturePos, GeneratorDSL, LayoutAlgorithm, LayoutDSL, LayoutDefinition, LayoutGeometry,
    LayoutOrientation, LayoutSize, LayoutType,
};

const METRIC_EPSILON: f64 = 0.000_001;

pub fn layout_fixture_size(layout: &LayoutDefinition) -> LayoutSize {
    match &layout.geometry {
        LayoutGeometry::Matrix { fixture_size, .. }
        | LayoutGeometry::Circle { fixture_size, .. }
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
        | LayoutGeometry::Wall { rows, columns, .. } => Some((rows, columns)),
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

pub fn layout_to_legacy(layout: &LayoutDefinition, fixture_ids: &[u32]) -> LayoutDSL {
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
        LayoutGeometry::Circle {
            rings,
            increment,
            ring_pitch,
            center,
            ..
        } => GeneratorDSL::Circle {
            rings: *rings,
            increment: *increment,
            gap: *ring_pitch,
            center: Some((center.x, center.y)),
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
        LayoutGeometry::Custom { fixtures, .. } => fixtures.clone(),
        LayoutGeometry::Algorithm {
            algorithm,
            origin,
            parameters,
            ..
        } => algorithm_positions(*algorithm, origin.x, origin.y, parameters, fixture_ids),
        LayoutGeometry::Circle { .. }
        | LayoutGeometry::Formula { .. }
        | LayoutGeometry::SvgPath { .. } => Vec::new(),
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
    let divisor = fixture_ids.len().saturating_sub(1).max(1) as f64;
    fixture_ids
        .iter()
        .enumerate()
        .map(|(index, id)| {
            let progress = index as f64 / divisor;
            let (x, y) = match algorithm {
                LayoutAlgorithm::Lissajous => {
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
                }
                LayoutAlgorithm::Spiral => {
                    let turns = parameter(parameters, "turns", 3.0);
                    let radius = parameter(parameters, "radius", 180.0) * progress;
                    let angle = progress * turns * std::f64::consts::TAU;
                    (angle.cos() * radius, angle.sin() * radius)
                }
            };
            CustomFixturePos {
                id: *id,
                x: origin_x + x,
                y: origin_y + y,
            }
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

pub fn migrated_layout_definition(
    id: String,
    name: String,
    layout: LayoutDSL,
    _fixture_ids: &[u32],
) -> LayoutDefinition {
    let default_fixture_size = super::LayoutSize {
        width: 12.0,
        height: 12.0,
    };
    let geometry = match layout.generator {
        GeneratorDSL::Matrix {
            rows,
            columns,
            spacing,
            origin,
        } => {
            let (x, y) = origin.unwrap_or((0.0, 0.0));
            let fixture_size = super::LayoutSize {
                width: spacing.min(default_fixture_size.width).max(METRIC_EPSILON),
                height: spacing.min(default_fixture_size.height).max(METRIC_EPSILON),
            };
            LayoutGeometry::Matrix {
                rows,
                columns,
                fixture_size,
                gap: super::LayoutGap {
                    x: (spacing - fixture_size.width).max(0.0),
                    y: (spacing - fixture_size.height).max(0.0),
                },
                pitch: super::LayoutPitch {
                    x: spacing,
                    y: spacing,
                },
                origin: super::LayoutPoint { x, y },
            }
        }
        GeneratorDSL::Circle {
            rings,
            increment,
            gap,
            center,
        } => {
            let (x, y) = center.unwrap_or((0.0, 0.0));
            let diameter = gap
                .min(default_fixture_size.width.max(default_fixture_size.height))
                .max(METRIC_EPSILON);
            let fixture_size = super::LayoutSize {
                width: diameter,
                height: diameter,
            };
            LayoutGeometry::Circle {
                rings,
                increment,
                fixture_size,
                ring_gap: (gap - fixture_size.width.max(fixture_size.height)).max(0.0),
                ring_pitch: gap,
                center: super::LayoutPoint { x, y },
            }
        }
        GeneratorDSL::Formula { formula } => LayoutGeometry::Formula {
            formula,
            fixture_size: default_fixture_size,
        },
        GeneratorDSL::SvgPath { svg_path } => LayoutGeometry::SvgPath {
            svg_path,
            fixture_size: default_fixture_size,
        },
        GeneratorDSL::Custom { fixtures } => LayoutGeometry::Custom {
            fixtures,
            fixture_size: default_fixture_size,
        },
    };
    let category = match &geometry {
        LayoutGeometry::Matrix { .. } | LayoutGeometry::Circle { .. } => {
            super::LayoutCategory::Basic
        }
        _ => super::LayoutCategory::GeneratedAdvanced,
    };
    let editor = match &geometry {
        LayoutGeometry::Matrix { .. } | LayoutGeometry::Circle { .. } => {
            super::LayoutEditorCapability::Form
        }
        LayoutGeometry::Formula { .. } | LayoutGeometry::Algorithm { .. } => {
            super::LayoutEditorCapability::ParameterSchema {
                parameters: Vec::new(),
            }
        }
        LayoutGeometry::Custom { .. } => super::LayoutEditorCapability::AdvancedOnly,
        LayoutGeometry::SvgPath { .. } => super::LayoutEditorCapability::ReadOnly {
            reason: "SVG source is preserved; visual path editing is not available in Setup."
                .to_string(),
        },
        LayoutGeometry::Strip { .. }
        | LayoutGeometry::Wall { .. }
        | LayoutGeometry::Frame { .. } => super::LayoutEditorCapability::Form,
    };
    LayoutDefinition {
        schema_version: super::LAYOUT_DEFINITION_SCHEMA_VERSION,
        id,
        revision: 1,
        name,
        category,
        editor,
        geometry,
        fixture_size_overrides: Vec::new(),
    }
}

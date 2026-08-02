use super::{
    AnimatableValueDSL, AutomationTargetDSL, EffectParameterDSL, GeneratorDSL, GroupFixturesDSL,
    PhaseConfigDSL, ShowDocumentV1, TimelineActionDefDSL, CURRENT_SCHEMA_VERSION,
};
use crate::compiler::diagnostic::{
    Diagnostic, DOC_DUPLICATE_ID, DOC_FIXTURE_REFERENCE_NOT_FOUND, DOC_FORMULA_INVALID,
    DOC_INVALID_COLOR, DOC_INVALID_NUMBER, DOC_INVALID_RANGE, DOC_INVALID_VALUE,
    DOC_PHASER_REFERENCE_NOT_FOUND, DOC_SVG_PATH_INVALID, DOC_TIMELINE_TARGET_INVALID,
    DOC_UNSUPPORTED_SCHEMA_VERSION, DSL_DUPLICATE_FIXTURE_ID, DSL_TARGET_GROUP_NOT_FOUND,
};
use crate::engine::color::parse_hex_color;
use fasteval::{Compiler as FastevalCompiler, Evaler};
use std::collections::HashSet;

const MAX_FIXTURES: u64 = 1_000_000;

#[derive(Debug, Clone)]
pub struct ValidatedShow {
    document: ShowDocumentV1,
}

impl ValidatedShow {
    pub(crate) fn into_document(self) -> ShowDocumentV1 {
        self.document
    }
}

pub struct DocumentValidator;

impl DocumentValidator {
    pub fn validate(document: ShowDocumentV1) -> Result<ValidatedShow, Vec<Diagnostic>> {
        let mut diagnostics = Vec::new();
        if document.schema_version != CURRENT_SCHEMA_VERSION {
            diagnostics.push(Diagnostic::error(
                DOC_UNSUPPORTED_SCHEMA_VERSION,
                "schema_version",
                format!("Unsupported schema_version: {}.", document.schema_version),
                format!("Set schema_version to {CURRENT_SCHEMA_VERSION}."),
            ));
        }

        let fixture_ids = validate_patch(&document, &mut diagnostics);
        validate_layout(&document, &fixture_ids, &mut diagnostics);
        let group_ids = validate_groups(&document, &fixture_ids, &mut diagnostics);
        let phaser_ids = validate_phasers(&document, &group_ids, &mut diagnostics);
        validate_timeline(&document, &phaser_ids, &mut diagnostics);

        if diagnostics.is_empty() {
            Ok(ValidatedShow { document })
        } else {
            Err(diagnostics)
        }
    }
}

fn validate_patch(document: &ShowDocumentV1, diagnostics: &mut Vec<Diagnostic>) -> HashSet<u32> {
    let mut fixture_ids = HashSet::new();
    let mut total_fixture_count = 0_u64;
    for (index, patch) in document.patch.iter().enumerate() {
        let path = format!("patch[{index}].id_range");
        let (start, end) = patch.id_range;
        if start == 0 || end < start {
            diagnostics.push(Diagnostic::error(
                DOC_INVALID_RANGE,
                path,
                format!("Fixture ID range [{start}, {end}] is invalid."),
                "Use positive IDs with the range start less than or equal to the end.",
            ));
            continue;
        }
        let count = u64::from(end) - u64::from(start) + 1;
        if count > MAX_FIXTURES {
            diagnostics.push(Diagnostic::error(
                DOC_INVALID_RANGE,
                path,
                format!("Fixture ID range contains {count} fixtures."),
                format!("Limit a show document to at most {MAX_FIXTURES} fixtures."),
            ));
            continue;
        }
        if total_fixture_count.saturating_add(count) > MAX_FIXTURES {
            diagnostics.push(Diagnostic::error(
                DOC_INVALID_RANGE,
                path,
                "Patch ranges contain more than 1,000,000 fixtures in total.",
                "Reduce the patch ranges so the whole show stays within the fixture limit.",
            ));
            continue;
        }
        total_fixture_count += count;
        for fixture_id in start..=end {
            if !fixture_ids.insert(fixture_id) {
                diagnostics.push(Diagnostic::error(
                    DSL_DUPLICATE_FIXTURE_ID,
                    format!("patch[{index}].id_range"),
                    format!("Duplicate fixture ID: {fixture_id}"),
                    "Use a unique fixture ID across all patch ranges.",
                ));
            }
        }
    }
    fixture_ids
}

fn validate_layout(
    document: &ShowDocumentV1,
    fixture_ids: &HashSet<u32>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    match &document.layout.generator {
        GeneratorDSL::Matrix {
            rows,
            columns,
            spacing,
            ..
        } => {
            if *rows == 0 || *columns == 0 {
                diagnostics.push(invalid_number(
                    "layout.generator",
                    "Matrix rows and columns must both be greater than zero.",
                ));
            }
            if *spacing <= 0.0 {
                diagnostics.push(invalid_number(
                    "layout.generator.spacing",
                    "Matrix spacing must be greater than zero.",
                ));
            }
            if u64::from(*rows).saturating_mul(u64::from(*columns)) > MAX_FIXTURES {
                diagnostics.push(invalid_number(
                    "layout.generator",
                    "Matrix dimensions exceed the supported fixture limit.",
                ));
            }
        }
        GeneratorDSL::Circle {
            rings,
            increment,
            gap,
            ..
        } => {
            if *rings == 0 || *increment == 0 || *gap <= 0.0 {
                diagnostics.push(invalid_number(
                    "layout.generator",
                    "Circle rings, increment, and gap must be greater than zero.",
                ));
            }
            if u64::from(*rings).saturating_mul(u64::from(*increment)) > MAX_FIXTURES {
                diagnostics.push(invalid_number(
                    "layout.generator",
                    "Circle dimensions exceed the supported fixture limit.",
                ));
            }
        }
        GeneratorDSL::Formula { formula } => {
            if formula.count == 0 || u64::from(formula.count) > MAX_FIXTURES {
                diagnostics.push(invalid_number(
                    "layout.generator.formula.count",
                    "Formula count must be between 1 and 1,000,000.",
                ));
            }
            if formula.t_range.1 < formula.t_range.0 {
                diagnostics.push(Diagnostic::error(
                    DOC_INVALID_RANGE,
                    "layout.generator.formula.t_range",
                    "Formula t_range end must be greater than or equal to its start.",
                    "Swap the t_range endpoints or increase the end value.",
                ));
            }
            validate_formula_expression(
                &formula.x,
                "layout.generator.formula.x",
                formula.t_range.0,
                diagnostics,
            );
            validate_formula_expression(
                &formula.y,
                "layout.generator.formula.y",
                formula.t_range.0,
                diagnostics,
            );
        }
        GeneratorDSL::SvgPath { svg_path } => {
            if svg_path.sample_count == 0 || u64::from(svg_path.sample_count) > MAX_FIXTURES {
                diagnostics.push(invalid_number(
                    "layout.generator.svgPath.sample_count",
                    "SVG sample_count must be between 1 and 1,000,000.",
                ));
            }
            if svg_path.d.trim().is_empty() {
                diagnostics.push(Diagnostic::error(
                    DOC_SVG_PATH_INVALID,
                    "layout.generator.svgPath.d",
                    "SVG path data cannot be empty.",
                    "Provide an SVG path that can be sampled into fixture positions.",
                ));
            }
        }
        GeneratorDSL::Custom { fixtures } => {
            let mut layout_ids = HashSet::new();
            for (index, fixture) in fixtures.iter().enumerate() {
                if !fixture_ids.contains(&fixture.id) {
                    diagnostics.push(Diagnostic::error(
                        DOC_FIXTURE_REFERENCE_NOT_FOUND,
                        format!("layout.generator.fixtures[{index}].id"),
                        format!("Layout references unknown fixture ID: {}", fixture.id),
                        "Patch the fixture or remove the custom layout entry.",
                    ));
                }
                if !layout_ids.insert(fixture.id) {
                    diagnostics.push(Diagnostic::error(
                        DOC_DUPLICATE_ID,
                        format!("layout.generator.fixtures[{index}].id"),
                        format!("Duplicate custom layout fixture ID: {}", fixture.id),
                        "Keep one coordinate per fixture ID.",
                    ));
                }
            }
        }
    }
}

fn validate_groups(
    document: &ShowDocumentV1,
    fixture_ids: &HashSet<u32>,
    diagnostics: &mut Vec<Diagnostic>,
) -> HashSet<String> {
    let mut group_ids = HashSet::new();
    for (index, group) in document.groups.iter().enumerate() {
        if group.id.trim().is_empty() || !group_ids.insert(group.id.clone()) {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("groups[{index}].id"),
                format!("Group ID must be non-empty and unique: {:?}", group.id),
                "Use a stable unique group ID separate from its display name.",
            ));
        }
        if group.name.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                DOC_INVALID_VALUE,
                format!("groups[{index}].name"),
                "Group display name cannot be empty.",
                "Provide a user-facing group name.",
            ));
        }

        match &group.fixtures {
            GroupFixturesDSL::List(ids) => {
                for (fixture_index, fixture_id) in ids.iter().enumerate() {
                    validate_fixture_reference(
                        *fixture_id,
                        fixture_ids,
                        format!("groups[{index}].fixtures[{fixture_index}]"),
                        diagnostics,
                    );
                }
            }
            GroupFixturesDSL::Range(definition) => {
                let (start, end) = definition.range;
                let count = u64::from(end).saturating_sub(u64::from(start)) + 1;
                if end < start || count > MAX_FIXTURES {
                    diagnostics.push(Diagnostic::error(
                        DOC_INVALID_RANGE,
                        format!("groups[{index}].fixtures.range"),
                        format!("Group fixture range [{start}, {end}] is invalid."),
                        "Use an ordered range containing at most 1,000,000 fixture IDs.",
                    ));
                    continue;
                }
                for fixture_id in start..=end {
                    validate_fixture_reference(
                        fixture_id,
                        fixture_ids,
                        format!("groups[{index}].fixtures.range"),
                        diagnostics,
                    );
                }
            }
        }
    }
    group_ids
}

fn validate_phasers(
    document: &ShowDocumentV1,
    group_ids: &HashSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
) -> HashSet<String> {
    let mut phaser_ids = HashSet::new();
    for (index, phaser) in document.phasers.iter().enumerate() {
        if phaser.id.trim().is_empty() || !phaser_ids.insert(phaser.id.clone()) {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("phasers[{index}].id"),
                format!("Phaser ID must be non-empty and unique: {:?}", phaser.id),
                "Use a stable unique phaser ID separate from its display name.",
            ));
        }
        if !group_ids.contains(&phaser.target) {
            diagnostics.push(Diagnostic::error(
                DSL_TARGET_GROUP_NOT_FOUND,
                format!("phasers[{index}].target"),
                format!("Target group not found: {}", phaser.target),
                "Define the target group or update this phaser's target.",
            ));
        }
        if phaser.multiplier.is_some_and(|value| value <= 0.0) {
            diagnostics.push(invalid_number(
                format!("phasers[{index}].multiplier"),
                "Phaser multiplier must be greater than zero.",
            ));
        }
        if phaser.steps.is_empty() {
            diagnostics.push(invalid_number(
                format!("phasers[{index}].steps"),
                "A phaser must contain at least one step.",
            ));
        }
        for (step_index, step) in phaser.steps.iter().enumerate() {
            let path = format!("phasers[{index}].steps[{step_index}]");
            validate_optional_range(step.width, 0.0, 100.0, format!("{path}.width"), diagnostics);
            validate_optional_range(
                step.transition,
                0.0,
                100.0,
                format!("{path}.transition"),
                diagnostics,
            );
            validate_optional_range(
                step.values.dimmer.map(f64::from),
                0.0,
                1.0,
                format!("{path}.values.dimmer"),
                diagnostics,
            );
            if let Some(color) = &step.values.color {
                if parse_hex_color(color).is_err() {
                    diagnostics.push(Diagnostic::error(
                        DOC_INVALID_COLOR,
                        format!("{path}.values.color"),
                        format!("Unsupported color value: {color:?}."),
                        "Use a color in #RRGGBB format.",
                    ));
                }
            }
        }
        match &phaser.phase {
            PhaseConfigDSL::Spread { spread } => {
                validate_range(
                    spread.from,
                    0.0,
                    100.0,
                    format!("phasers[{index}].phase.spread.from"),
                    diagnostics,
                );
                validate_range(
                    spread.to,
                    0.0,
                    100.0,
                    format!("phasers[{index}].phase.spread.to"),
                    diagnostics,
                );
            }
            PhaseConfigDSL::Grouped { grouped } => {
                if grouped.group_size == 0 {
                    diagnostics.push(invalid_number(
                        format!("phasers[{index}].phase.grouped.group_size"),
                        "Grouped phase group_size must be greater than zero.",
                    ));
                }
                validate_range(
                    grouped.spread.0,
                    0.0,
                    100.0,
                    format!("phasers[{index}].phase.grouped.spread[0]"),
                    diagnostics,
                );
                validate_range(
                    grouped.spread.1,
                    0.0,
                    100.0,
                    format!("phasers[{index}].phase.grouped.spread[1]"),
                    diagnostics,
                );
            }
        }
    }
    phaser_ids
}

fn validate_timeline(
    document: &ShowDocumentV1,
    phaser_ids: &HashSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(timeline) = &document.timeline else {
        return;
    };
    for (index, event) in timeline.events.iter().enumerate() {
        if event.beat < 0.0 {
            diagnostics.push(invalid_number(
                format!("timeline.events[{index}].beat"),
                "Timeline beat cannot be negative.",
            ));
        }
        if event.duration.is_some_and(|duration| duration <= 0.0) {
            diagnostics.push(invalid_number(
                format!("timeline.events[{index}].duration"),
                "Timeline duration must be greater than zero.",
            ));
        }
        match &event.action {
            TimelineActionDefDSL::Phaser { phaser } => {
                if !phaser_ids.contains(phaser) {
                    diagnostics.push(Diagnostic::error(
                        DOC_PHASER_REFERENCE_NOT_FOUND,
                        format!("timeline.events[{index}].action.phaser"),
                        format!("Timeline references unknown phaser ID: {phaser}"),
                        "Use the ID of a phaser defined in this document.",
                    ));
                }
            }
            TimelineActionDefDSL::Animate {
                target, from, to, ..
            } => validate_animation_target(index, target, from, to, phaser_ids, diagnostics),
        }
    }
}

fn validate_animation_target(
    event_index: usize,
    target: &AutomationTargetDSL,
    from: &AnimatableValueDSL,
    to: &AnimatableValueDSL,
    phaser_ids: &HashSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let path = format!("timeline.events[{event_index}].action.target");
    let target_kind = match target {
        AutomationTargetDSL::Global { .. } => "number",
        AutomationTargetDSL::EffectInstance {
            instance_id,
            parameter_id,
        } => {
            if !phaser_ids.contains(instance_id) {
                diagnostics.push(Diagnostic::error(
                    DOC_PHASER_REFERENCE_NOT_FOUND,
                    path,
                    format!("Automation references unknown effect instance ID: {instance_id}"),
                    "Use an effect instance ID defined in this document.",
                ));
                return;
            }
            match parameter_id {
                EffectParameterDSL::Color => "color",
                EffectParameterDSL::Multiplier
                | EffectParameterDSL::Dimmer
                | EffectParameterDSL::Pan
                | EffectParameterDSL::Tilt => "number",
            }
        }
    };
    let values_match = matches!(
        (target_kind, from, to),
        (
            "number",
            AnimatableValueDSL::Float(_),
            AnimatableValueDSL::Float(_)
        ) | (
            "color",
            AnimatableValueDSL::Color(_),
            AnimatableValueDSL::Color(_)
        )
    );
    if !values_match {
        diagnostics.push(Diagnostic::error(
            DOC_TIMELINE_TARGET_INVALID,
            format!("timeline.events[{event_index}].action"),
            format!("Automation values do not match the {target_kind} target."),
            "Use numeric values for scalar targets and #RRGGBB strings for color targets.",
        ));
    }
    for (value_name, value) in [("from", from), ("to", to)] {
        if let AnimatableValueDSL::Color(color) = value {
            if parse_hex_color(color).is_err() {
                diagnostics.push(Diagnostic::error(
                    DOC_INVALID_COLOR,
                    format!("timeline.events[{event_index}].action.{value_name}"),
                    format!("Unsupported color value: {color:?}."),
                    "Use a color in #RRGGBB format.",
                ));
            }
        }
    }
}

fn validate_formula_expression(
    expression: &str,
    path: &str,
    sample_t: f64,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut slab = fasteval::Slab::new();
    let compiled = match fasteval::Parser::new().parse(expression, &mut slab.ps) {
        Ok(parsed) => parsed.from(&slab.ps).compile(&slab.ps, &mut slab.cs),
        Err(error) => {
            diagnostics.push(Diagnostic::error(
                DOC_FORMULA_INVALID,
                path,
                format!("Formula cannot be parsed: {error}"),
                "Use t, sin, cos, and pow in a valid numeric expression.",
            ));
            return;
        }
    };
    let mut namespace = |name: &str, args: Vec<f64>| formula_value(name, &args, sample_t);
    match compiled.eval(&slab, &mut namespace) {
        Ok(value) if value.is_finite() => {}
        Ok(_) => diagnostics.push(Diagnostic::error(
            DOC_FORMULA_INVALID,
            path,
            "Formula produced a non-finite value.",
            "Adjust the expression and range to produce finite coordinates.",
        )),
        Err(error) => diagnostics.push(Diagnostic::error(
            DOC_FORMULA_INVALID,
            path,
            format!("Formula cannot be evaluated: {error}"),
            "Use only t, sin, cos, and pow with valid arguments.",
        )),
    }
}

fn formula_value(name: &str, args: &[f64], t: f64) -> Option<f64> {
    match name {
        "t" => Some(t),
        "sin" => Some(args.first()?.sin()),
        "cos" => Some(args.first()?.cos()),
        "pow" => Some(args.first()?.powf(*args.get(1)?)),
        _ => None,
    }
}

fn validate_fixture_reference(
    fixture_id: u32,
    fixture_ids: &HashSet<u32>,
    path: String,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if !fixture_ids.contains(&fixture_id) {
        diagnostics.push(Diagnostic::error(
            DOC_FIXTURE_REFERENCE_NOT_FOUND,
            path,
            format!("Group references unknown fixture ID: {fixture_id}"),
            "Patch the fixture or remove it from the group.",
        ));
    }
}

fn validate_optional_range(
    value: Option<f64>,
    minimum: f64,
    maximum: f64,
    path: String,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if let Some(value) = value {
        validate_range(value, minimum, maximum, path, diagnostics);
    }
}

fn validate_range(
    value: f64,
    minimum: f64,
    maximum: f64,
    path: String,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if !(minimum..=maximum).contains(&value) {
        diagnostics.push(Diagnostic::error(
            DOC_INVALID_RANGE,
            path,
            format!("Value {value} is outside [{minimum}, {maximum}]."),
            "Choose a value inside the documented inclusive range.",
        ));
    }
}

fn invalid_number(path: impl Into<String>, message: impl Into<String>) -> Diagnostic {
    Diagnostic::error(
        DOC_INVALID_NUMBER,
        path,
        message,
        "Use a finite value within the documented range.",
    )
}

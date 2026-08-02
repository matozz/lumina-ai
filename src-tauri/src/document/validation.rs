use super::{
    AutomationPolicyDSL, AutomationTargetV3DSL, EffectDefinitionDSL, EffectNodeDSL, EffectPortDSL,
    EffectPortRefDSL, GeneratorDSL, GroupFixturesDSL, KeyframeDSL, OverlapPolicyDSL,
    ParameterValueDSL, ParameterValueTypeDSL, ShowDocumentV4, CURRENT_SCHEMA_VERSION,
};
use crate::compiler::diagnostic::{
    Diagnostic, DOC_DUPLICATE_ID, DOC_EFFECT_DEFINITION_NOT_FOUND, DOC_EFFECT_GRAPH_INVALID,
    DOC_EFFECT_INSTANCE_NOT_FOUND, DOC_FIXTURE_REFERENCE_NOT_FOUND, DOC_FORMULA_INVALID,
    DOC_INVALID_COLOR, DOC_INVALID_NUMBER, DOC_INVALID_RANGE, DOC_INVALID_VALUE,
    DOC_PARAMETER_INVALID, DOC_PROFILE_NOT_FOUND, DOC_SVG_PATH_INVALID,
    DOC_TIMELINE_TARGET_INVALID, DOC_UNSUPPORTED_SCHEMA_VERSION, DSL_DUPLICATE_FIXTURE_ID,
    DSL_TARGET_GROUP_NOT_FOUND,
};
use crate::engine::color::parse_hex_color;
use crate::engine::profile::profile_by_id;
use fasteval::{Compiler as FastevalCompiler, Evaler};
use std::collections::{HashMap, HashSet};

const MAX_FIXTURES: u64 = 1_000_000;

#[derive(Debug, Clone)]
pub struct ValidatedShow {
    document: ShowDocumentV4,
}

impl ValidatedShow {
    pub(crate) fn into_document(self) -> ShowDocumentV4 {
        self.document
    }
}

pub struct DocumentValidator;

impl DocumentValidator {
    pub fn validate(document: ShowDocumentV4) -> Result<ValidatedShow, Vec<Diagnostic>> {
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
        let definitions = validate_effect_definitions(&document, &mut diagnostics);
        let instances =
            validate_effect_instances(&document, &group_ids, &definitions, &mut diagnostics);
        validate_timeline(&document, &instances, &mut diagnostics);

        if diagnostics.is_empty() {
            Ok(ValidatedShow { document })
        } else {
            Err(diagnostics)
        }
    }
}

fn validate_patch(document: &ShowDocumentV4, diagnostics: &mut Vec<Diagnostic>) -> HashSet<u32> {
    let mut fixture_ids = HashSet::new();
    let mut total_fixture_count = 0_u64;
    for (index, patch) in document.patch.iter().enumerate() {
        if profile_by_id(&patch.profile_id).is_none() {
            diagnostics.push(Diagnostic::error(
                DOC_PROFILE_NOT_FOUND,
                format!("patch[{index}].profile_id"),
                format!("Fixture profile not found: {:?}.", patch.profile_id),
                "Use a profile ID from schemas/fixture-profiles-v1.json.",
            ));
        }
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
    document: &ShowDocumentV4,
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
    document: &ShowDocumentV4,
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

#[derive(Clone, Copy)]
struct ParameterContract {
    value_type: ParameterValueTypeDSL,
    range: Option<(f64, f64)>,
}

type DefinitionParameters = HashMap<String, (u32, HashMap<String, ParameterContract>)>;
type InstanceParameters = HashMap<String, HashMap<String, ParameterContract>>;

fn validate_effect_definitions(
    document: &ShowDocumentV4,
    diagnostics: &mut Vec<Diagnostic>,
) -> DefinitionParameters {
    let mut definitions = HashMap::new();
    for (index, definition) in document.effect_definitions.iter().enumerate() {
        let path = format!("effect_definitions[{index}]");
        if definition.id.trim().is_empty() || definitions.contains_key(&definition.id) {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("{path}.id"),
                format!(
                    "Effect definition ID must be non-empty and unique: {:?}.",
                    definition.id
                ),
                "Use a stable unique definition ID separate from its display name.",
            ));
        }
        if definition.revision == 0 {
            diagnostics.push(invalid_number(
                format!("{path}.revision"),
                "Effect definition revision must be greater than zero.",
            ));
        }
        let parameters = validate_parameter_schema(index, definition, diagnostics);
        validate_effect_graph(index, definition, diagnostics);
        validate_range(
            f64::from(definition.catalog.energy),
            0.0,
            1.0,
            format!("{path}.catalog.energy"),
            diagnostics,
        );
        validate_range(
            f64::from(definition.catalog.density),
            0.0,
            1.0,
            format!("{path}.catalog.density"),
            diagnostics,
        );
        validate_range(
            f64::from(definition.catalog.colorfulness),
            0.0,
            1.0,
            format!("{path}.catalog.colorfulness"),
            diagnostics,
        );
        definitions.insert(definition.id.clone(), (definition.revision, parameters));
    }
    definitions
}

fn validate_parameter_schema(
    definition_index: usize,
    definition: &EffectDefinitionDSL,
    diagnostics: &mut Vec<Diagnostic>,
) -> HashMap<String, ParameterContract> {
    let mut parameters = HashMap::new();
    for (index, parameter) in definition.parameters.iter().enumerate() {
        let path = format!("effect_definitions[{definition_index}].parameters[{index}]");
        if parameter.id.trim().is_empty() || parameters.contains_key(&parameter.id) {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("{path}.id"),
                format!(
                    "Parameter ID must be non-empty and unique: {:?}.",
                    parameter.id
                ),
                "Use a stable unique parameter ID within the definition.",
            ));
        }
        if parameter.value_type != parameter.default_value.value_type() {
            diagnostics.push(Diagnostic::error(
                DOC_PARAMETER_INVALID,
                format!("{path}.default_value"),
                "Parameter default value does not match its declared type.",
                "Use a typed default value matching value_type.",
            ));
        }
        if let Some((min, max)) = parameter.range {
            if !min.is_finite() || !max.is_finite() || min > max {
                diagnostics.push(Diagnostic::error(
                    DOC_INVALID_RANGE,
                    format!("{path}.range"),
                    "Parameter range must contain finite ordered endpoints.",
                    "Use a finite [min, max] range.",
                ));
            }
            if let ParameterValueDSL::Scalar(value) = parameter.default_value {
                if !value.is_finite() || value < min || value > max {
                    diagnostics.push(Diagnostic::error(
                        DOC_PARAMETER_INVALID,
                        format!("{path}.default_value"),
                        "Parameter default is outside its declared range.",
                        "Move the default inside the parameter range.",
                    ));
                }
            }
        }
        if matches!(parameter.automation, AutomationPolicyDSL::Continuous)
            && matches!(parameter.value_type, ParameterValueTypeDSL::Direction)
        {
            diagnostics.push(Diagnostic::error(
                DOC_PARAMETER_INVALID,
                format!("{path}.automation"),
                "Direction parameters cannot use continuous automation.",
                "Use discrete automation for direction parameters.",
            ));
        }
        if let ParameterValueDSL::Color(color) = &parameter.default_value {
            validate_color(color, format!("{path}.default_value.value"), diagnostics);
        }
        parameters.insert(
            parameter.id.clone(),
            ParameterContract {
                value_type: parameter.value_type,
                range: parameter.range,
            },
        );
    }
    parameters
}

fn validate_effect_instances(
    document: &ShowDocumentV4,
    group_ids: &HashSet<String>,
    definitions: &DefinitionParameters,
    diagnostics: &mut Vec<Diagnostic>,
) -> InstanceParameters {
    let mut instances = HashMap::new();
    for (index, instance) in document.effect_instances.iter().enumerate() {
        let path = format!("effect_instances[{index}]");
        if instance.id.trim().is_empty() || instances.contains_key(&instance.id) {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("{path}.id"),
                format!(
                    "Effect instance ID must be non-empty and unique: {:?}.",
                    instance.id
                ),
                "Use a stable unique effect instance ID.",
            ));
        }
        if instance.seed.len() != 16
            || !instance
                .seed
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            diagnostics.push(Diagnostic::error(
                DOC_INVALID_VALUE,
                format!("{path}.seed"),
                "Effect instance seed must be a 16-digit hexadecimal string.",
                "Store the deterministic 64-bit seed as lowercase hexadecimal text.",
            ));
        }
        if !group_ids.contains(&instance.target_group_id) {
            diagnostics.push(Diagnostic::error(
                DSL_TARGET_GROUP_NOT_FOUND,
                format!("{path}.target_group_id"),
                format!("Target group not found: {}", instance.target_group_id),
                "Define the target group or update the effect instance target.",
            ));
        }
        let Some((revision, parameters)) = definitions.get(&instance.definition_id) else {
            diagnostics.push(Diagnostic::error(
                DOC_EFFECT_DEFINITION_NOT_FOUND,
                format!("{path}.definition_id"),
                format!("Effect definition not found: {}", instance.definition_id),
                "Reference an effect definition contained in this document or catalog.",
            ));
            continue;
        };
        if instance.definition_revision != *revision {
            diagnostics.push(Diagnostic::error(
                DOC_EFFECT_DEFINITION_NOT_FOUND,
                format!("{path}.definition_revision"),
                format!(
                    "Effect definition revision {} is not available; document contains revision {revision}.",
                    instance.definition_revision
                ),
                "Pin the available revision or explicitly update the instance.",
            ));
        }
        for (parameter_id, value) in &instance.parameter_overrides {
            let Some(value_type) = parameters.get(parameter_id) else {
                diagnostics.push(Diagnostic::error(
                    DOC_PARAMETER_INVALID,
                    format!("{path}.parameter_overrides.{parameter_id}"),
                    format!("Unknown effect parameter: {parameter_id}"),
                    "Use a parameter declared by the referenced definition.",
                ));
                continue;
            };
            if value_type.value_type != value.value_type() {
                diagnostics.push(Diagnostic::error(
                    DOC_PARAMETER_INVALID,
                    format!("{path}.parameter_overrides.{parameter_id}"),
                    "Effect parameter override has the wrong value type.",
                    "Use the value type declared by the referenced definition.",
                ));
            }
            if let (Some((min, max)), ParameterValueDSL::Scalar(value)) = (value_type.range, value)
            {
                if !value.is_finite() || *value < min || *value > max {
                    diagnostics.push(Diagnostic::error(
                        DOC_PARAMETER_INVALID,
                        format!("{path}.parameter_overrides.{parameter_id}"),
                        "Effect parameter override is outside its declared range.",
                        "Keep the override inside the definition parameter range.",
                    ));
                }
            }
        }
        instances.insert(instance.id.clone(), parameters.clone());
    }
    instances
}

fn validate_effect_graph(
    definition_index: usize,
    definition: &EffectDefinitionDSL,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let base = format!("effect_definitions[{definition_index}].graph.nodes");
    let mut nodes = HashMap::new();
    for (index, node) in definition.graph.nodes.iter().enumerate() {
        if node.id().trim().is_empty() || nodes.insert(node.id(), (index, node)).is_some() {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("{base}[{index}].id"),
                format!(
                    "Effect node ID must be non-empty and unique: {:?}.",
                    node.id()
                ),
                "Use a stable unique node ID within the graph.",
            ));
        }
        validate_effect_node_values(&base, index, node, diagnostics);
    }
    if !definition
        .graph
        .nodes
        .iter()
        .any(|node| matches!(node, EffectNodeDSL::AttributeWriter { .. }))
    {
        diagnostics.push(Diagnostic::error(
            DOC_EFFECT_GRAPH_INVALID,
            base.clone(),
            "EffectGraph must contain at least one AttributeWriter.",
            "Connect a typed graph value to an AttributeWriter node.",
        ));
    }
    for (index, node) in definition.graph.nodes.iter().enumerate() {
        for (reference, expected) in effect_node_inputs(node) {
            let path = format!("{base}[{index}]");
            let Some((_, source)) = nodes.get(reference.node_id.as_str()) else {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_GRAPH_INVALID,
                    path,
                    format!(
                        "Effect node references unknown node {:?}.",
                        reference.node_id
                    ),
                    "Connect the input to an existing node output.",
                ));
                continue;
            };
            if reference.port != source.output_port() || !expected.contains(&reference.port) {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_GRAPH_INVALID,
                    path,
                    format!(
                        "Effect port type mismatch for node {:?}: declared {:?}, source outputs {:?}.",
                        reference.node_id,
                        reference.port,
                        source.output_port()
                    ),
                    "Connect ports with the same declared value type.",
                ));
            }
        }
    }
    if graph_has_cycle(&definition.graph.nodes) {
        diagnostics.push(Diagnostic::error(
            DOC_EFFECT_GRAPH_INVALID,
            base,
            "EffectGraph contains a cycle.",
            "Make the graph acyclic so it can be topologically compiled.",
        ));
    }
}

fn effect_node_inputs(node: &EffectNodeDSL) -> Vec<(&EffectPortRefDSL, &'static [EffectPortDSL])> {
    const SCALAR: &[EffectPortDSL] = &[EffectPortDSL::Scalar];
    const WRITABLE: &[EffectPortDSL] = &[
        EffectPortDSL::Scalar,
        EffectPortDSL::Color,
        EffectPortDSL::AttributeSet,
    ];
    match node {
        EffectNodeDSL::Time { .. }
        | EffectNodeDSL::Constant { .. }
        | EffectNodeDSL::Random { .. } => Vec::new(),
        EffectNodeDSL::StepSequence { phase, .. } | EffectNodeDSL::Oscillator { phase, .. } => {
            vec![(phase, SCALAR)]
        }
        EffectNodeDSL::Envelope { input, .. }
        | EffectNodeDSL::SpatialPhase { input, .. }
        | EffectNodeDSL::Map { input, .. }
        | EffectNodeDSL::Clamp { input, .. }
        | EffectNodeDSL::ColorGradient { input, .. }
        | EffectNodeDSL::FixtureMask { input, .. } => vec![(input, SCALAR)],
        EffectNodeDSL::Math { left, right, .. } => vec![(left, SCALAR), (right, SCALAR)],
        EffectNodeDSL::AttributeWriter { input, mask, .. } => {
            let mut inputs = vec![(input, WRITABLE)];
            if let Some(mask) = mask {
                inputs.push((mask, &[EffectPortDSL::Mask]));
            }
            inputs
        }
    }
}

fn graph_has_cycle(nodes: &[EffectNodeDSL]) -> bool {
    fn visit<'a>(
        id: &'a str,
        nodes: &HashMap<&'a str, &'a EffectNodeDSL>,
        visiting: &mut HashSet<&'a str>,
        visited: &mut HashSet<&'a str>,
    ) -> bool {
        if visited.contains(id) {
            return false;
        }
        if !visiting.insert(id) {
            return true;
        }
        if let Some(node) = nodes.get(id) {
            for (reference, _) in effect_node_inputs(node) {
                if nodes.contains_key(reference.node_id.as_str())
                    && visit(&reference.node_id, nodes, visiting, visited)
                {
                    return true;
                }
            }
        }
        visiting.remove(id);
        visited.insert(id);
        false
    }

    let nodes: HashMap<_, _> = nodes.iter().map(|node| (node.id(), node)).collect();
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    nodes
        .keys()
        .any(|id| visit(id, &nodes, &mut visiting, &mut visited))
}

fn validate_effect_node_values(
    base: &str,
    index: usize,
    node: &EffectNodeDSL,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let path = format!("{base}[{index}]");
    match node {
        EffectNodeDSL::Constant {
            value: ParameterValueDSL::Color(color),
            ..
        } => validate_color(color, format!("{path}.value"), diagnostics),
        EffectNodeDSL::StepSequence { steps, .. } => {
            if steps.is_empty() {
                diagnostics.push(invalid_number(
                    format!("{path}.steps"),
                    "StepSequence must contain at least one step.",
                ));
            }
            for (step_index, step) in steps.iter().enumerate() {
                let step_path = format!("{path}.steps[{step_index}]");
                validate_optional_range(
                    step.width,
                    0.0,
                    100.0,
                    format!("{step_path}.width"),
                    diagnostics,
                );
                validate_optional_range(
                    step.transition,
                    0.0,
                    100.0,
                    format!("{step_path}.transition"),
                    diagnostics,
                );
                validate_optional_range(
                    step.values.dimmer.map(f64::from),
                    0.0,
                    1.0,
                    format!("{step_path}.values.dimmer"),
                    diagnostics,
                );
                if let Some(color) = &step.values.color {
                    validate_color(color, format!("{step_path}.values.color"), diagnostics);
                }
            }
        }
        EffectNodeDSL::Envelope {
            attack, release, ..
        } => {
            validate_range(*attack, 0.0, 1.0, format!("{path}.attack"), diagnostics);
            validate_range(*release, 0.0, 1.0, format!("{path}.release"), diagnostics);
        }
        EffectNodeDSL::SpatialPhase {
            basis,
            group_size,
            custom_order,
            ..
        } => {
            if group_size.is_some_and(|size| size == 0) {
                diagnostics.push(invalid_number(
                    format!("{path}.group_size"),
                    "SpatialPhase group_size must be greater than zero.",
                ));
            }
            if matches!(basis, super::SpatialBasisDSL::Custom) && custom_order.is_empty() {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_GRAPH_INVALID,
                    format!("{path}.custom_order"),
                    "Custom spatial phase requires a non-empty fixture ordering.",
                    "Provide fixture IDs in the intended phase order.",
                ));
            }
        }
        EffectNodeDSL::Map {
            input_range,
            output_range,
            ..
        } => {
            if input_range.0 == input_range.1
                || !input_range.0.is_finite()
                || !input_range.1.is_finite()
            {
                diagnostics.push(Diagnostic::error(
                    DOC_INVALID_RANGE,
                    format!("{path}.input_range"),
                    "Map input range must contain distinct finite endpoints.",
                    "Use a non-zero finite input range.",
                ));
            }
            if !output_range.0.is_finite() || !output_range.1.is_finite() {
                diagnostics.push(invalid_number(
                    format!("{path}.output_range"),
                    "Map output range endpoints must be finite.",
                ));
            }
        }
        EffectNodeDSL::Clamp { min, max, .. } | EffectNodeDSL::FixtureMask { min, max, .. } => {
            if !min.is_finite() || !max.is_finite() || min > max {
                diagnostics.push(Diagnostic::error(
                    DOC_INVALID_RANGE,
                    path,
                    "Node range must contain finite ordered endpoints.",
                    "Use a finite min less than or equal to max.",
                ));
            }
        }
        EffectNodeDSL::ColorGradient { stops, .. } => {
            if stops.len() < 2 {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_GRAPH_INVALID,
                    format!("{path}.stops"),
                    "ColorGradient requires at least two stops.",
                    "Provide ordered color stops from 0 to 1.",
                ));
            }
            for (stop_index, stop) in stops.iter().enumerate() {
                validate_range(
                    stop.position,
                    0.0,
                    1.0,
                    format!("{path}.stops[{stop_index}].position"),
                    diagnostics,
                );
                validate_color(
                    &stop.color,
                    format!("{path}.stops[{stop_index}].color"),
                    diagnostics,
                );
            }
            if stops
                .windows(2)
                .any(|pair| pair[0].position > pair[1].position)
            {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_GRAPH_INVALID,
                    format!("{path}.stops"),
                    "ColorGradient stops must be ordered by position.",
                    "Sort stops from lowest to highest position.",
                ));
            }
        }
        EffectNodeDSL::AttributeWriter {
            input,
            attribute_id,
            ..
        } if !matches!(input.port, EffectPortDSL::AttributeSet)
            && attribute_id.as_deref().is_none_or(str::is_empty) =>
        {
            diagnostics.push(Diagnostic::error(
                DOC_EFFECT_GRAPH_INVALID,
                format!("{path}.attribute_id"),
                "Scalar and color writers require an attribute_id.",
                "Name the target fixture attribute or connect an attribute_set.",
            ));
        }
        _ => {}
    }
}

fn validate_timeline(
    document: &ShowDocumentV4,
    instances: &InstanceParameters,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(timeline) = &document.timeline else {
        return;
    };
    if timeline.ppq == 0 {
        diagnostics.push(invalid_number(
            "timeline.ppq",
            "Timeline PPQ must be greater than zero.",
        ));
    }
    if timeline.tempo_map.points.is_empty()
        || timeline.tempo_map.points[0].time_tick != 0
        || timeline
            .tempo_map
            .points
            .windows(2)
            .any(|pair| pair[0].time_tick >= pair[1].time_tick)
    {
        diagnostics.push(Diagnostic::error(
            DOC_TIMELINE_TARGET_INVALID,
            "timeline.tempo_map.points",
            "TempoMap must start at tick zero and use strictly increasing ticks.",
            "Sort unique tempo points and include a point at time_tick 0.",
        ));
    }
    for (index, point) in timeline.tempo_map.points.iter().enumerate() {
        if !point.bpm.is_finite() || !(1.0..=1000.0).contains(&point.bpm) {
            diagnostics.push(invalid_number(
                format!("timeline.tempo_map.points[{index}].bpm"),
                "Tempo BPM must be finite and between 1 and 1000.",
            ));
        }
    }

    let mut track_ids = HashSet::new();
    let mut item_ids = HashSet::new();
    let mut automation_targets = HashSet::new();
    for (track_index, track) in timeline.tracks.iter().enumerate() {
        let track_path = format!("timeline.tracks[{track_index}]");
        if track.id.trim().is_empty() || !track_ids.insert(track.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                DOC_DUPLICATE_ID,
                format!("{track_path}.id"),
                format!(
                    "Timeline track ID must be non-empty and unique: {:?}.",
                    track.id
                ),
                "Use a stable unique track ID.",
            ));
        }
        for (clip_index, clip) in track.clips.iter().enumerate() {
            let path = format!("{track_path}.clips[{clip_index}]");
            if clip.id.trim().is_empty() || !item_ids.insert(clip.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    DOC_DUPLICATE_ID,
                    format!("{path}.id"),
                    format!(
                        "Timeline item ID must be non-empty and unique: {:?}.",
                        clip.id
                    ),
                    "Use a stable unique clip or lane ID.",
                ));
            }
            if clip.duration_tick == 0 {
                diagnostics.push(invalid_number(
                    format!("{path}.duration_tick"),
                    "EffectClip duration must be greater than zero ticks.",
                ));
            }
            if clip.start_tick.checked_add(clip.duration_tick).is_none() {
                diagnostics.push(invalid_number(
                    format!("{path}.duration_tick"),
                    "EffectClip end exceeds the supported tick range.",
                ));
            }
            if !instances.contains_key(&clip.instance_id) {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_INSTANCE_NOT_FOUND,
                    format!("{path}.instance_id"),
                    format!(
                        "Timeline references unknown effect instance ID: {}",
                        clip.instance_id
                    ),
                    "Use an effect instance ID defined in this document.",
                ));
            }
        }
        if matches!(track.overlap_policy, OverlapPolicyDSL::Reject) {
            let mut clips: Vec<_> = track.clips.iter().collect();
            clips.sort_by_key(|clip| clip.start_tick);
            if clips.windows(2).any(|pair| {
                pair[0].start_tick.saturating_add(pair[0].duration_tick) > pair[1].start_tick
            }) {
                diagnostics.push(Diagnostic::error(
                    DOC_TIMELINE_TARGET_INVALID,
                    format!("{track_path}.clips"),
                    "Track overlap_policy reject does not allow overlapping EffectClips.",
                    "Move the clips apart or choose layer, replace, or crossfade explicitly.",
                ));
            }
        }
        for (lane_index, lane) in track.automation_lanes.iter().enumerate() {
            let path = format!("{track_path}.automation_lanes[{lane_index}]");
            if lane.id.trim().is_empty() || !item_ids.insert(lane.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    DOC_DUPLICATE_ID,
                    format!("{path}.id"),
                    format!(
                        "Timeline item ID must be non-empty and unique: {:?}.",
                        lane.id
                    ),
                    "Use a stable unique clip or lane ID.",
                ));
            }
            if !automation_targets.insert(&lane.target) {
                diagnostics.push(Diagnostic::error(
                    DOC_TIMELINE_TARGET_INVALID,
                    format!("{path}.target"),
                    "A typed automation target can be owned by only one AutomationLane.",
                    "Merge the keyframes into one lane for this target.",
                ));
            }
            let Some(expected) =
                automation_target_type(&lane.target, instances, &path, diagnostics)
            else {
                continue;
            };
            if lane.keyframes.is_empty() {
                diagnostics.push(Diagnostic::error(
                    DOC_TIMELINE_TARGET_INVALID,
                    format!("{path}.keyframes"),
                    "AutomationLane requires at least one keyframe.",
                    "Add a typed keyframe or remove the empty lane.",
                ));
                continue;
            }
            let mut keyframe_ids = HashSet::new();
            let mut previous_tick = None;
            for (keyframe_index, keyframe) in lane.keyframes.iter().enumerate() {
                let keyframe_path = format!("{path}.keyframes[{keyframe_index}]");
                if keyframe.id.trim().is_empty() || !keyframe_ids.insert(keyframe.id.as_str()) {
                    diagnostics.push(Diagnostic::error(
                        DOC_DUPLICATE_ID,
                        format!("{keyframe_path}.id"),
                        format!(
                            "Keyframe ID must be non-empty and unique in its lane: {:?}.",
                            keyframe.id
                        ),
                        "Use a stable unique keyframe ID.",
                    ));
                }
                if previous_tick.is_some_and(|tick| tick >= keyframe.time_tick) {
                    diagnostics.push(Diagnostic::error(
                        DOC_TIMELINE_TARGET_INVALID,
                        format!("{path}.keyframes"),
                        "Automation keyframes must use strictly increasing time_tick values.",
                        "Sort keyframes and use at most one keyframe per tick.",
                    ));
                }
                previous_tick = Some(keyframe.time_tick);
                validate_keyframe(keyframe, expected, &keyframe_path, diagnostics);
            }
        }
    }
}

fn automation_target_type(
    target: &AutomationTargetV3DSL,
    instances: &InstanceParameters,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<ParameterValueTypeDSL> {
    match target {
        AutomationTargetV3DSL::Global { .. } => Some(ParameterValueTypeDSL::Scalar),
        AutomationTargetV3DSL::EffectInstance {
            instance_id,
            parameter_id,
        } => {
            let Some(parameters) = instances.get(instance_id) else {
                diagnostics.push(Diagnostic::error(
                    DOC_EFFECT_INSTANCE_NOT_FOUND,
                    format!("{path}.target"),
                    format!("Automation references unknown effect instance ID: {instance_id}"),
                    "Use an effect instance ID defined in this document.",
                ));
                return None;
            };
            match parameters
                .get(parameter_id)
                .map(|parameter| parameter.value_type)
            {
                Some(value_type) => Some(value_type),
                None => {
                    diagnostics.push(Diagnostic::error(
                        DOC_PARAMETER_INVALID,
                        format!("{path}.target"),
                        format!("Automation references unknown parameter ID: {parameter_id}"),
                        "Use a parameter declared by the instance definition.",
                    ));
                    None
                }
            }
        }
    }
}

fn validate_keyframe(
    keyframe: &KeyframeDSL,
    expected: ParameterValueTypeDSL,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if keyframe.value.value_type() != expected {
        diagnostics.push(Diagnostic::error(
            DOC_TIMELINE_TARGET_INVALID,
            format!("{path}.value"),
            "Keyframe value does not match the typed automation target.",
            "Use a scalar, color, or direction value matching the target parameter.",
        ));
    }
    if matches!(expected, ParameterValueTypeDSL::Direction)
        && !matches!(
            keyframe.interpolation,
            super::KeyframeInterpolationDSL::Hold
        )
    {
        diagnostics.push(Diagnostic::error(
            DOC_TIMELINE_TARGET_INVALID,
            format!("{path}.interpolation"),
            "Direction keyframes require hold interpolation.",
            "Use hold for discrete direction automation.",
        ));
    }
    if let ParameterValueDSL::Color(color) = &keyframe.value {
        validate_color(color, format!("{path}.value.value"), diagnostics);
    }
    for (name, tangent) in [
        ("in_tangent", keyframe.in_tangent),
        ("out_tangent", keyframe.out_tangent),
    ] {
        if tangent.is_some_and(|tangent| !tangent.time.is_finite() || !tangent.value.is_finite()) {
            diagnostics.push(invalid_number(
                format!("{path}.{name}"),
                "Keyframe tangent values must be finite.",
            ));
        }
    }
}

fn validate_color(color: &str, path: String, diagnostics: &mut Vec<Diagnostic>) {
    if parse_hex_color(color).is_err() {
        diagnostics.push(Diagnostic::error(
            DOC_INVALID_COLOR,
            path,
            format!("Unsupported color value: {color:?}."),
            "Use a color in #RRGGBB format.",
        ));
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

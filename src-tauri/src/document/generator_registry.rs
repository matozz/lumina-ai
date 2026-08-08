use super::LayoutGeometry;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratorRegistry {
    pub schema_version: u32,
    pub generators: Vec<GeneratorDescriptor>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratorDescriptor {
    pub shape: String,
    pub label: String,
    pub status: GeneratorStatus,
    pub editor_mode: GeneratorEditorMode,
    pub capacity_model: String,
    pub coordinate_model: String,
    pub validation_model: String,
    pub grid_targeting: bool,
    pub parameter_schema: Vec<GeneratorParameterDescriptor>,
    pub default_parameters: BTreeMap<String, f64>,
    pub preview: GeneratorPreviewDescriptor,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GeneratorStatus {
    Supported,
    ReadOnly,
    Unavailable,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GeneratorEditorMode {
    Form,
    ParameterSchema,
    ReadOnly,
    Unavailable,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratorParameterDescriptor {
    pub id: String,
    pub label: String,
    pub value_type: GeneratorParameterValueType,
    pub role: GeneratorParameterRole,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    pub step: Option<f64>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GeneratorParameterValueType {
    Integer,
    Number,
    Choice,
    Expression,
    Coordinates,
    Path,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GeneratorParameterRole {
    Quantity,
    Spacing,
    Shape,
    Source,
    Appearance,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratorPreviewDescriptor {
    pub mode: GeneratorPreviewMode,
    pub auto_fit: bool,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GeneratorPreviewMode {
    FullGeometry,
    SavedOnly,
}

pub fn builtin_generator_registry() -> Result<GeneratorRegistry, String> {
    let registry: GeneratorRegistry = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../catalog/builtin/generators/registry-v1.json"
    )))
    .map_err(|error| format!("Generator Registry is invalid: {error}"))?;
    if registry.schema_version != 1 {
        return Err("Generator Registry must use the current V1 contract.".to_string());
    }
    let expected = BTreeSet::from([
        "matrix",
        "wall",
        "strip",
        "frame",
        "circle",
        "sector",
        "polygon",
        "honeycomb",
        "formula",
        "algorithm",
        "custom",
        "svg_path",
    ]);
    let actual = registry
        .generators
        .iter()
        .map(|descriptor| descriptor.shape.as_str())
        .collect::<BTreeSet<_>>();
    if actual != expected || actual.len() != registry.generators.len() {
        return Err("Generator Registry must declare every V1 shape exactly once.".to_string());
    }
    for descriptor in &registry.generators {
        let parameter_ids = descriptor
            .parameter_schema
            .iter()
            .map(|parameter| parameter.id.as_str())
            .collect::<BTreeSet<_>>();
        if descriptor.coordinate_model.trim().is_empty()
            || descriptor.validation_model.trim().is_empty()
            || parameter_ids.len() != descriptor.parameter_schema.len()
            || descriptor
                .default_parameters
                .keys()
                .any(|id| !parameter_ids.contains(id.as_str()))
        {
            return Err(format!(
                "Generator Registry descriptor {} is incomplete.",
                descriptor.shape
            ));
        }
        if matches!(descriptor.status, GeneratorStatus::Supported)
            && (!descriptor
                .parameter_schema
                .iter()
                .any(|parameter| matches!(parameter.role, GeneratorParameterRole::Quantity))
                || !matches!(descriptor.preview.mode, GeneratorPreviewMode::FullGeometry))
        {
            return Err(format!(
                "Supported Generator {} is missing full authoring metadata.",
                descriptor.shape
            ));
        }
    }
    Ok(registry)
}

pub const fn layout_geometry_shape(geometry: &LayoutGeometry) -> &'static str {
    match geometry {
        LayoutGeometry::Matrix { .. } => "matrix",
        LayoutGeometry::Wall { .. } => "wall",
        LayoutGeometry::Strip { .. } => "strip",
        LayoutGeometry::Frame { .. } => "frame",
        LayoutGeometry::Circle { .. } => "circle",
        LayoutGeometry::Sector { .. } => "sector",
        LayoutGeometry::Polygon { .. } => "polygon",
        LayoutGeometry::Honeycomb { .. } => "honeycomb",
        LayoutGeometry::Formula { .. } => "formula",
        LayoutGeometry::Algorithm { .. } => "algorithm",
        LayoutGeometry::Custom { .. } => "custom",
        LayoutGeometry::SvgPath { .. } => "svg_path",
    }
}

#[cfg(test)]
mod tests {
    use super::{builtin_generator_registry, GeneratorParameterRole, GeneratorStatus};

    #[test]
    fn registry_declares_every_v1_generator_once() {
        let registry = builtin_generator_registry().expect("registry parses");
        assert_eq!(registry.generators.len(), 12);
        assert_eq!(
            registry
                .generators
                .iter()
                .find(|descriptor| descriptor.shape == "custom")
                .map(|descriptor| &descriptor.status),
            Some(&GeneratorStatus::Unavailable)
        );
        assert_eq!(
            registry
                .generators
                .iter()
                .find(|descriptor| descriptor.shape == "svg_path")
                .map(|descriptor| &descriptor.status),
            Some(&GeneratorStatus::ReadOnly)
        );
        assert!(registry
            .generators
            .iter()
            .filter(|descriptor| matches!(descriptor.status, GeneratorStatus::Supported))
            .all(|descriptor| descriptor
                .parameter_schema
                .iter()
                .any(|parameter| matches!(parameter.role, GeneratorParameterRole::Quantity))));
    }
}

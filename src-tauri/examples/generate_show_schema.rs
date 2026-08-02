use lumina_ai_lib::document::{
    ShowDocumentV1, ShowDocumentV2, ShowDocumentV3, CURRENT_SCHEMA_VERSION,
};
use lumina_ai_lib::engine::profile::builtin_profiles;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

fn main() {
    let repository_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must have a repository parent")
        .to_path_buf();
    let schema_v1_path = repository_root.join("schemas/show-document-v1.schema.json");
    let schema_v2_path = repository_root.join("schemas/show-document-v2.schema.json");
    let schema_v3_path = repository_root.join("schemas/show-document-v3.schema.json");
    let capabilities_v1_path = repository_root.join("schemas/show-capabilities-v1.json");
    let capabilities_v2_path = repository_root.join("schemas/show-capabilities-v2.json");
    let capabilities_v3_path = repository_root.join("schemas/show-capabilities-v3.json");
    let profiles_path = repository_root.join("schemas/fixture-profiles-v1.json");
    let typescript_v1_path = repository_root.join("src/generated/show-document-v1.ts");
    let typescript_v2_path = repository_root.join("src/generated/show-document-v2.ts");
    let typescript_v3_path = repository_root.join("src/generated/show-document-v3.ts");

    let schema_v1 = schemars::schema_for!(ShowDocumentV1);
    let schema_v2 = schemars::schema_for!(ShowDocumentV2);
    let schema_v3 = schemars::schema_for!(ShowDocumentV3);
    let schema_v1_value = serde_json::to_value(&schema_v1).expect("V1 schema converts to JSON");
    let schema_v2_value = serde_json::to_value(&schema_v2).expect("V2 schema converts to JSON");
    let schema_v3_value = serde_json::to_value(&schema_v3).expect("V3 schema converts to JSON");
    let capabilities_v1_value = json!({
        "metadata_version": 1,
        "document_schema_version": 1,
        "document_schema": "show-document-v1.schema.json",
        "document_contract": {
            "fixture_types": ["spot", "pixel"],
            "layout_shapes": ["matrix", "circle", "formula", "svg_path", "custom"],
            "phase_modes": ["spread", "grouped"],
            "step_attributes": ["color", "dimmer", "pan", "tilt"],
            "automation_targets": {
                "global": ["master_dimmer"],
                "effect_instance": ["multiplier", "color", "dimmer", "pan", "tilt"]
            }
        }
    });
    let capabilities_v2_value = json!({
        "metadata_version": 1,
        "document_schema_version": 2,
        "document_schema": "show-document-v2.schema.json",
        "fixture_profiles": "fixture-profiles-v1.json",
        "document_contract": {
            "patch_reference": "profile_id",
            "layout_shapes": ["matrix", "circle", "formula", "svg_path", "custom"],
            "phase_modes": ["spread", "grouped"],
            "step_attributes": ["color", "dimmer", "pan", "tilt"],
            "automation_targets": {
                "global": ["master_dimmer"],
                "effect_instance": ["multiplier", "color", "dimmer", "pan", "tilt"]
            }
        }
    });
    let capabilities_v3_value = json!({
        "metadata_version": 1,
        "document_schema_version": CURRENT_SCHEMA_VERSION,
        "document_schema": "show-document-v3.schema.json",
        "fixture_profiles": "fixture-profiles-v1.json",
        "document_contract": {
            "effect_sources": ["built_in", "project_local", "user_library"],
            "parameter_types": ["scalar", "color", "direction"],
            "common_parameters": ["speed", "phase", "width", "transition", "intensity", "color", "direction"],
            "effect_nodes": [
                "time", "constant", "step_sequence", "oscillator", "envelope",
                "spatial_phase", "math", "map", "clamp", "color_gradient",
                "fixture_mask", "attribute_writer"
            ],
            "spatial_bases": ["index", "x", "y", "distance", "angle", "custom"],
            "automation_targets": {
                "global": ["master_dimmer"],
                "effect_instance": "definition_parameter_id"
            }
        }
    });
    let profiles_value = json!({
        "metadata_version": 1,
        "profiles": builtin_profiles()
    });

    let json_artifacts = [
        (&schema_v1_path, &schema_v1_value),
        (&schema_v2_path, &schema_v2_value),
        (&schema_v3_path, &schema_v3_value),
        (&capabilities_v1_path, &capabilities_v1_value),
        (&capabilities_v2_path, &capabilities_v2_value),
        (&capabilities_v3_path, &capabilities_v3_value),
        (&profiles_path, &profiles_value),
    ];
    let typescript_v1 = render_typescript(&schema_v1_value, "ShowDocumentV1");
    let typescript_v2 = render_typescript(&schema_v2_value, "ShowDocumentV2");
    let typescript_v3 = render_typescript(&schema_v3_value, "ShowDocumentV3");
    let text_artifacts = [
        (&typescript_v1_path, typescript_v1.as_str()),
        (&typescript_v2_path, typescript_v2.as_str()),
        (&typescript_v3_path, typescript_v3.as_str()),
    ];

    if std::env::args().any(|argument| argument == "--check") {
        let json_is_current = json_artifacts.iter().all(|(path, expected)| {
            fs::read_to_string(path)
                .ok()
                .and_then(|source| serde_json::from_str::<Value>(&source).ok())
                .is_some_and(|checked_in| checked_in == **expected)
        });
        let text_is_current = text_artifacts
            .iter()
            .all(|(path, expected)| fs::read_to_string(path).unwrap_or_default() == *expected);
        if !json_is_current || !text_is_current {
            eprintln!("generated document contracts are stale; run pnpm schema:generate");
            std::process::exit(1);
        }
        return;
    }

    fs::create_dir_all(schema_v1_path.parent().expect("schema parent"))
        .expect("schema directory is writable");
    for (path, schema) in [
        (&schema_v1_path, &schema_v1),
        (&schema_v2_path, &schema_v2),
        (&schema_v3_path, &schema_v3),
    ] {
        let mut contents = serde_json::to_string_pretty(schema).expect("schema serializes");
        contents.push('\n');
        fs::write(path, contents).expect("schema artifact is writable");
    }
    for (path, value) in json_artifacts.into_iter().skip(3) {
        let mut contents = serde_json::to_string_pretty(value).expect("JSON artifact serializes");
        contents.push('\n');
        fs::write(path, contents).expect("JSON artifact is writable");
    }
    fs::create_dir_all(typescript_v1_path.parent().expect("TypeScript parent"))
        .expect("TypeScript directory is writable");
    for (path, contents) in text_artifacts {
        fs::write(path, contents).expect("TypeScript artifact is writable");
    }
    println!("generated versioned document schemas, types, and fixture profile metadata");
}

fn render_typescript(schema: &Value, root_name: &str) -> String {
    let mut output =
        String::from("// Generated by `pnpm schema:generate`. Do not edit directly.\n\n");
    let definitions = schema
        .get("$defs")
        .and_then(Value::as_object)
        .expect("schema definitions");

    for (name, definition) in definitions {
        output.push_str(&render_named_type(name, definition));
        output.push('\n');
    }
    output.push_str(&render_named_type(root_name, schema));
    output
}

fn render_named_type(name: &str, schema: &Value) -> String {
    if is_object_schema(schema)
        && !is_record_schema(schema)
        && schema.get("oneOf").is_none()
        && schema.get("anyOf").is_none()
    {
        format!("export interface {name} {}\n", render_object(schema, 0))
    } else {
        let rendered = render_type(schema, 0);
        let separator = if rendered.starts_with('\n') { "" } else { " " };
        format!("export type {name} ={separator}{rendered};\n")
    }
}

fn render_type(schema: &Value, indent: usize) -> String {
    if schema == &Value::Bool(true) {
        return "unknown".to_string();
    }
    if schema == &Value::Bool(false) {
        return "never".to_string();
    }
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        return reference
            .rsplit('/')
            .next()
            .expect("reference name")
            .to_string();
    }
    if let Some(constant) = schema.get("const") {
        return serde_json::to_string(constant).expect("const serializes");
    }
    if let (Some(minimum), Some(maximum)) = (
        schema.get("minimum").and_then(Value::as_f64),
        schema.get("maximum").and_then(Value::as_f64),
    ) {
        if minimum == maximum {
            return format_number_literal(minimum);
        }
    }
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        let rendered = values
            .iter()
            .map(|value| serde_json::to_string(value).expect("enum value serializes"))
            .collect::<Vec<_>>();
        let inline = rendered.join(" | ");
        if inline.len() > 80 {
            return format!(
                "\n{}| {}",
                " ".repeat(indent + 2),
                rendered.join(&format!("\n{}| ", " ".repeat(indent + 2)))
            );
        }
        return inline;
    }
    for keyword in ["oneOf", "anyOf"] {
        if let Some(variants) = schema.get(keyword).and_then(Value::as_array) {
            let mut rendered = Vec::new();
            for variant in variants {
                let value = render_type(variant, indent + 4);
                if !rendered.contains(&value) {
                    rendered.push(value);
                }
            }
            if rendered.iter().any(|value| value.contains('\n'))
                || variants.iter().any(is_object_schema)
            {
                let prefix = format!("\n{}| ", " ".repeat(indent + 2));
                return format!("{prefix}{}", rendered.join(&prefix));
            }
            return rendered.join(" | ");
        }
    }

    match schema.get("type") {
        Some(Value::Array(types)) => types
            .iter()
            .filter_map(Value::as_str)
            .map(|type_name| render_type_name(type_name, schema, indent))
            .collect::<Vec<_>>()
            .join(" | "),
        Some(Value::String(type_name)) => render_type_name(type_name, schema, indent),
        _ if schema.get("properties").is_some() => render_object(schema, indent),
        _ => panic!("unsupported JSON Schema node in TypeScript generator: {schema}"),
    }
}

fn render_type_name(type_name: &str, schema: &Value, indent: usize) -> String {
    match type_name {
        "null" => "null".to_string(),
        "boolean" => "boolean".to_string(),
        "integer" | "number" => "number".to_string(),
        "string" => "string".to_string(),
        "array" => {
            if let Some(items) = schema.get("prefixItems").and_then(Value::as_array) {
                format!(
                    "[{}]",
                    items
                        .iter()
                        .map(|item| render_type(item, indent))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            } else {
                let item = schema
                    .get("items")
                    .map(|item| render_type(item, indent))
                    .unwrap_or_else(|| "unknown".to_string());
                format!("Array<{item}>")
            }
        }
        "object" => render_object(schema, indent),
        _ => panic!("unsupported JSON Schema type in TypeScript generator: {type_name}"),
    }
}

fn render_object(schema: &Value, indent: usize) -> String {
    if let Some(values) = schema.get("additionalProperties") {
        if schema
            .get("properties")
            .and_then(Value::as_object)
            .is_none_or(Map::is_empty)
        {
            return format!("Record<string, {}>", render_type(values, indent));
        }
    }
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let required: BTreeSet<&str> = schema
        .get("required")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let next_indent = indent + 2;
    let mut output = String::from("{\n");

    for (property, property_schema) in sorted_entries(&properties) {
        output.push_str(&" ".repeat(next_indent));
        output.push_str(property);
        if !required.contains(property) {
            output.push('?');
        }
        output.push_str(": ");
        output.push_str(&render_type(property_schema, next_indent));
        output.push_str(";\n");
    }
    output.push_str(&" ".repeat(indent));
    output.push('}');
    output
}

fn sorted_entries(properties: &Map<String, Value>) -> Vec<(&str, &Value)> {
    let mut entries: Vec<_> = properties
        .iter()
        .map(|(name, value)| (name.as_str(), value))
        .collect();
    entries.sort_by_key(|(name, _)| *name);
    entries
}

fn is_object_schema(schema: &Value) -> bool {
    matches!(schema.get("type"), Some(Value::String(value)) if value == "object")
        || schema.get("properties").is_some()
}

fn is_record_schema(schema: &Value) -> bool {
    schema.get("additionalProperties").is_some()
        && schema
            .get("properties")
            .and_then(Value::as_object)
            .is_none_or(Map::is_empty)
}

fn format_number_literal(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        value.to_string()
    }
}

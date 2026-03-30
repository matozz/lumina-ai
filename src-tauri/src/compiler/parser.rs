use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShowDSL {
    pub meta: MetaDSL,
    pub patch: Vec<PatchDSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub phasers: Vec<PhaserDSL>,
    pub timeline: Option<TimelineDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MetaDSL {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PatchDSL {
    #[serde(rename = "type")]
    pub type_: String, // "spot" | "pixel"
    pub id_range: (u32, u32),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LayoutDSL {
    #[serde(rename = "type")]
    pub type_: String, // "generator"
    pub generator: GeneratorDSL,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "shape")]
pub enum GeneratorDSL {
    #[serde(rename = "matrix")]
    Matrix {
        rows: u32,
        columns: u32,
        spacing: f64,
        origin: Option<(f64, f64)>,
    },
    #[serde(rename = "circle")]
    Circle {
        rings: u32,
        increment: u32,
        gap: f64,
        center: Option<(f64, f64)>,
    },
    #[serde(rename = "formula")]
    Formula { formula: FormulaDef },
    #[serde(rename = "svg_path")]
    SvgPath {
        #[serde(rename = "svgPath")]
        svg_path: SvgPathDef,
    },
    #[serde(rename = "custom")]
    Custom { fixtures: Vec<CustomFixturePos> },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormulaDef {
    pub x: String,
    pub y: String,
    pub t_range: (f64, f64),
    pub count: u32,
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvgPathDef {
    pub d: String,
    pub sample_count: u32,
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomFixturePos {
    pub id: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupDSL {
    pub name: String,
    pub fixtures: GroupFixturesDSL,
    pub sort_by: Option<String>, // "none" | "x" | "-x" | "y" | "-y" | "distance_center" | "-distance_center" | "angle_center" | "random" | "x+y" | "-(x+y)"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum GroupFixturesDSL {
    List(Vec<u32>),
    Range { range: (u32, u32) },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaserDSL {
    pub id: String,
    pub name: String,
    pub target: String,
    pub multiplier: Option<f64>, // defaults to 1.0
    pub steps: Vec<PhaserStepDSL>,
    pub phase: PhaseConfigDSL,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaserStepDSL {
    pub values: StepValuesDSL,
    pub width: Option<f64>,      // default 100
    pub transition: Option<f64>, // default 100
    pub accel: Option<i32>,      // default 0
    pub decel: Option<i32>,      // default 0
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StepValuesDSL {
    pub color: Option<String>,
    pub dimmer: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaseConfigDSL {
    pub mode: String, // "spread" | "grouped"
    pub spread: Option<PhaseSpreadDSL>,
    pub grouped: Option<PhaseGroupedDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaseSpreadDSL {
    pub from: f64,
    pub to: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaseGroupedDSL {
    pub group_size: u32,
    pub spread: (f64, f64),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimelineDSL {
    pub events: Vec<TimelineEventDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimelineEventDSL {
    pub beat: f64,
    pub duration: Option<f64>,
    pub action: TimelineActionDefDSL,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum TimelineActionDefDSL {
    #[serde(rename = "phaser")]
    Phaser { phaser: String },
    #[serde(rename = "animate")]
    Animate {
        target: String,
        keyframes: Vec<KeyframeDSL>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyframeDSL {
    pub time: f64, // Relative beat to event start
    pub value: serde_json::Value,
    pub easing: Option<String>,
}

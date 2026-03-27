use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShowDSL {
    pub meta: MetaDSL,
    pub patch: Vec<PatchDSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub presets: Vec<PresetDSL>,
    pub phasers: Vec<PhaserDSL>,
    pub sequences: Vec<SequenceDSL>,
    pub timeline: Option<TimelineDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MetaDSL {
    pub name: String,
    pub version: Option<String>,
    pub tempo: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PatchDSL {
    #[serde(rename = "type")]
    pub type_: String, // "spot" | "wash" | "pixel"
    pub color: String, // "rgb" | "rgbw"
    #[serde(rename = "idRange")]
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
    Formula {
        formula: FormulaDef,
    },
    #[serde(rename = "svg_path")]
    SvgPath {
        #[serde(rename = "svgPath")]
        svg_path: SvgPathDef,
    },
    #[serde(rename = "custom")]
    Custom {
        fixtures: Vec<CustomFixturePos>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormulaDef {
    pub x: String,
    pub y: String,
    #[serde(rename = "tRange")]
    pub t_range: (f64, f64),
    pub count: u32,
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvgPathDef {
    pub d: String,
    #[serde(rename = "sampleCount")]
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
    #[serde(rename = "sortBy")]
    pub sort_by: Option<String>, // "none" | "x" | "-x" | "y" | "-y" | "distance_center" | "-distance_center" | "angle_center" | "random" | "x+y" | "-(x+y)"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum GroupFixturesDSL {
    List(Vec<u32>),
    Range { range: (u32, u32) },
    Filter { filter: GroupFilterDSL },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupFilterDSL {
    pub spatial: Option<SpatialFilterDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpatialFilterDSL {
    pub region: String, // "top" | "bottom" | "left" | "right" | "center"
    pub threshold: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PresetDSL {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String, // "color" | "dimmer" | "composite"
    pub values: PresetValuesDSL,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum PresetValuesDSL {
    ColorAndDimmer { color: String, dimmer: f32 },
    Color { color: String },
    Dimmer { dimmer: f32 },
    Gradient { gradient: GradientDef },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GradientDef {
    pub colors: Vec<String>,
    pub direction: String, // "horizontal" | "vertical" | "radial"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaserDSL {
    pub name: String,
    pub target: String,
    pub speed: f64,
    pub steps: Vec<PhaserStepDSL>,
    pub phase: PhaseConfigDSL,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhaserStepDSL {
    pub values: StepValuesDSL,
    pub width: Option<f64>, // default 100
    pub transition: Option<f64>, // default 100
    pub accel: Option<i32>, // default 0
    pub decel: Option<i32>, // default 0
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
    #[serde(rename = "groupSize")]
    pub group_size: u32,
    pub spread: (f64, f64),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SequenceDSL {
    pub name: String,
    pub cues: Vec<CueDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CueDSL {
    pub id: u32,
    pub name: Option<String>,
    pub trigger: TriggerDSL,
    pub fade: Option<f64>, // default 0
    pub actions: Vec<CueActionDSL>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerDSL {
    #[serde(rename = "type")]
    pub type_: String, // "go" | "follow" | "time"
    pub delay: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum CueActionDSL {
    #[serde(rename = "preset")]
    Preset { preset: String, target: Option<String>, fade: Option<f64> },
    #[serde(rename = "phaser")]
    Phaser { phaser: String },
    #[serde(rename = "stop_phaser")]
    StopPhaser { target: Option<String> },
    #[serde(rename = "master")]
    Master { dimmer: f64, target: Option<String> },
    #[serde(rename = "tempo")]
    Tempo { bpm: u32 },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimelineDSL {
    pub bpm: f64,
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
    #[serde(rename = "preset")]
    Preset { preset: String, target: Option<String>, fade: Option<f64> },
    #[serde(rename = "tempo")]
    Tempo { bpm: u32 },
    #[serde(rename = "stop_all")]
    StopAll,
}

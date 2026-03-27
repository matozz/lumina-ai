use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;
use crate::engine::FixtureOutput;
use crate::compiler::CompiledShow;
use crate::engine::sequence::SequenceExecutor;
use crate::engine::timeline::TimelineExecutor;
use crate::scheduler::Scheduler;

pub struct EngineState {
    pub app_handle: AppHandle,
    pub scheduler: Scheduler,
    pub compiled_show: Arc<RwLock<Option<CompiledShow>>>,
    pub runtime: Arc<RwLock<RuntimeState>>,
}

#[derive(Clone, PartialEq, Debug)]
pub enum SequencerMode {
    Live,
    Timeline,
}

pub struct RuntimeState {
    pub global_beat: f64,
    pub is_playing: bool,
    pub active_phasers: Vec<ActivePhaser>,
    pub sequencer_mode: SequencerMode,
    pub sequence_executor: Option<SequenceExecutor>,
    pub timeline_executor: Option<TimelineExecutor>,
    pub prev_frame: Vec<FixtureOutput>,
    pub current_cue: Option<CueInfo>,
}

#[derive(Clone, serde::Serialize)]
pub struct ActivePhaser {
    pub name: String,
    pub start_beat: f64,
    pub instance_id: Option<usize>, // used by timeline to uniquely identify blocks
    pub multiplier: f64,
}

#[derive(Clone, serde::Serialize)]
pub struct CueInfo {
    pub sequence: String,
    pub cue_id: u32,
    pub cue_name: Option<String>,
}

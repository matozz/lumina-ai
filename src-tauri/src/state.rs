use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;
use crate::engine::FixtureOutput;
use crate::compiler::CompiledShow;
use crate::engine::timeline::TimelineExecutor;
use crate::scheduler::Scheduler;
use crate::engine::animation::ParameterContext;

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
    pub timeline_executor: Option<TimelineExecutor>,
    pub prev_frame: Vec<FixtureOutput>,
    pub parameter_context: ParameterContext,
}

#[derive(Clone, serde::Serialize)]
pub struct ActivePhaser {
    pub id: String,
    pub start_beat: f64,
    pub instance_id: Option<usize>, // used by timeline to uniquely identify blocks
    pub multiplier: f64,
    // Add accumulated_beat to calculate phase consistently during speed changes
    pub accumulated_beat: f64, 
}

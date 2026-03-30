pub mod commands;
pub mod compiler;
pub mod engine;
pub mod scheduler;
pub mod state;

use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            let engine_state = Arc::new(state::EngineState {
                app_handle: app_handle.clone(),
                scheduler: scheduler::Scheduler::new(),
                compiled_show: Arc::new(RwLock::new(None)),
                runtime: Arc::new(RwLock::new(state::RuntimeState {
                    global_beat: 0.0,
                    is_playing: false,
                    active_phasers: Vec::new(),
                    sequencer_mode: state::SequencerMode::Live,
                    timeline_executor: None,
                    prev_frame: Vec::new(),
                    parameter_context: engine::animation::ParameterContext::new(),
                })),
            });
            
            app.manage(engine_state);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_dsl,
            commands::validate_dsl,
            commands::play,
            commands::stop,
            commands::reset_beat,
            commands::set_tempo,
            commands::trigger_phaser,
            commands::stop_phaser,
            commands::save_show,
            commands::load_show,
            commands::set_sequencer_mode,
            commands::get_layout_coords
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

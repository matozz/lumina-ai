pub mod commands;
pub mod compiler;
pub mod engine;
pub mod scheduler;
pub mod state;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let engine_state = Arc::new(state::EngineState {
                scheduler: scheduler::Scheduler::new(),
                shows: state::ShowStore::default(),
                runtime: Arc::new(RwLock::new(state::RuntimeState {
                    global_beat: 0.0,
                    is_playing: false,
                    active_phasers: Vec::new(),
                    sequencer_mode: state::SequencerMode::Live,
                    timeline_executor: None,
                    frame_publisher: engine::frame::FramePublisher::default(),
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
            commands::get_layout_coords,
            commands::request_full_frame
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

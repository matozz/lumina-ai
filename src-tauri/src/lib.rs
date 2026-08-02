pub mod commands;
pub mod compiler;
pub mod document;
pub mod engine;
pub mod scheduler;
pub mod state;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let clock: Arc<dyn engine::clock::Clock> =
                Arc::new(engine::clock::MonotonicClock::default());
            let transport = engine::transport::Transport::new(120, clock.now())
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let engine_state = Arc::new(state::EngineState {
                scheduler: scheduler::Scheduler::new(),
                clock,
                shows: state::ShowStore::default(),
                runtime: Arc::new(RwLock::new(state::RuntimeState {
                    transport,
                    live_phasers: Vec::new(),
                    sequencer_mode: state::SequencerMode::Live,
                    output_hub: engine::output::OutputHub::default(),
                })),
            });

            app.manage(engine_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_dsl,
            commands::validate_dsl,
            commands::query_effect_catalog,
            commands::play,
            commands::pause,
            commands::stop,
            commands::seek,
            commands::set_tempo,
            commands::set_output_rate,
            commands::trigger_phaser,
            commands::stop_phaser,
            commands::save_show,
            commands::load_show,
            commands::set_sequencer_mode,
            commands::get_layout_coords,
            commands::request_full_frame
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle
                .state::<Arc<state::EngineState>>()
                .inner()
                .clone();
            let _ = tauri::async_runtime::block_on(state.scheduler.shutdown(&state));
        }
    });
}

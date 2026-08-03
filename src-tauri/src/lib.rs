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
                previews: state::PreviewStore::default(),
                runtime: Arc::new(RwLock::new(state::RuntimeState {
                    transport,
                    live_phasers: Vec::new(),
                    pending_live_actions: Vec::new(),
                    next_live_action_sequence: 0,
                    sequencer_mode: state::SequencerMode::Live,
                    blackout: false,
                    output_rate_hz: engine::transport::OutputRate::default().hz(),
                    last_frame_lag_ms: 0.0,
                    last_output_error: None,
                    output_hub: engine::output::OutputHub::default(),
                })),
            });

            app.manage(engine_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_dsl,
            commands::publish_dsl,
            commands::preview_dsl,
            commands::preview_effect_loop,
            commands::preview_project,
            commands::render_project_preview,
            commands::publish_project,
            commands::activate_show_revision,
            commands::get_show_snapshot_state,
            commands::validate_dsl,
            commands::query_effect_catalog,
            commands::play,
            commands::pause,
            commands::stop,
            commands::seek,
            commands::set_tempo,
            commands::set_output_rate,
            commands::get_live_effects,
            commands::queue_live_pad,
            commands::set_blackout,
            commands::trigger_phaser,
            commands::stop_phaser,
            commands::save_show,
            commands::load_show,
            commands::save_project,
            commands::load_project,
            commands::migrate_show_project,
            commands::set_sequencer_mode,
            commands::get_layout_coords,
            commands::request_full_frame
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::Ready => {
            let main_window = app_handle
                .get_webview_window("main")
                .expect("main window must exist at startup");
            main_window.show().expect("main window must be visible");
            main_window
                .unmaximize()
                .expect("main window maximized state must reset");
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                main_window.maximize().expect("main window must maximize");
            });
        }
        tauri::RunEvent::Exit => {
            let state = app_handle
                .state::<Arc<state::EngineState>>()
                .inner()
                .clone();
            let _ = tauri::async_runtime::block_on(state.scheduler.shutdown(&state));
        }
        _ => {}
    });
}

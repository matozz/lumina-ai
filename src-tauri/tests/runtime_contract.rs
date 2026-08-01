use lumina_ai_lib::compiler::{parser::ShowDSL, Compiler};
use lumina_ai_lib::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use std::fs;
use std::path::PathBuf;

#[test]
fn all_templates_render_deterministically_with_the_stage_one_renderer() {
    let template_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/editor/templates");
    let mut paths: Vec<_> = fs::read_dir(template_dir)
        .expect("template directory")
        .map(|entry| entry.expect("template entry").path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    paths.sort();
    assert_eq!(paths.len(), 18, "template inventory changed");

    for path in paths {
        let source = fs::read_to_string(&path).expect("template source");
        let dsl: ShowDSL = serde_json::from_str(&source).expect("template JSON");
        let show = Compiler::compile(dsl).expect("template compile");
        let time = RenderTime { beat: 8.25 };

        let timeline_frame = render_at(&show, time, RenderSource::Timeline);
        assert_eq!(
            timeline_frame,
            render_at(&show, time, RenderSource::Timeline)
        );
        assert_eq!(timeline_frame.len(), show.fixtures.len());
        assert_eq!(
            timeline_frame
                .iter()
                .map(|output| output.id)
                .collect::<Vec<_>>(),
            show.fixtures
                .iter()
                .map(|fixture| fixture.id)
                .collect::<Vec<_>>()
        );

        let live: Vec<_> = show
            .phasers
            .values()
            .map(|phaser| LivePhaser {
                id: phaser.id.clone(),
                start_beat: 0.0,
                phase_offset: 0.0,
                multiplier: phaser.multiplier.unwrap_or(1.0),
            })
            .collect();
        let live_frame = render_at(&show, time, RenderSource::Live(&live));
        assert_eq!(
            live_frame,
            render_at(&show, time, RenderSource::Live(&live))
        );
        assert_eq!(live_frame.len(), show.fixtures.len());
    }
}

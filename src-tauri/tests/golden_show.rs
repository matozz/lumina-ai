use lumina_ai_lib::compiler::{parser::ShowDSL, Compiler};
use lumina_ai_lib::engine::{animation::ParameterContext, compute_frame, FixtureOutput};
use lumina_ai_lib::state::ActivePhaser;

#[test]
fn compiles_dsl_and_renders_expected_frame_at_known_beat() {
    let dsl: ShowDSL = serde_json::from_str(include_str!("fixtures/golden_show.json"))
        .expect("golden fixture must remain valid JSON DSL");
    let show = Compiler::compile(dsl).expect("golden fixture must compile");
    let sample_beat = 0.75;
    let active = ActivePhaser {
        id: "chase".to_string(),
        start_beat: 0.0,
        instance_id: None,
        multiplier: 1.0,
        accumulated_beat: sample_beat,
    };

    let frame = compute_frame(sample_beat, &[active], &show, &ParameterContext::new());

    assert_eq!(
        frame,
        vec![
            FixtureOutput {
                id: 1,
                r: 0,
                g: 0,
                b: 255,
                dimmer: 0.25,
            },
            FixtureOutput {
                id: 2,
                r: 255,
                g: 0,
                b: 0,
                dimmer: 1.0,
            },
            FixtureOutput {
                id: 3,
                r: 255,
                g: 0,
                b: 0,
                dimmer: 1.0,
            },
        ]
    );
}

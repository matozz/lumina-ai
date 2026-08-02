use lumina_ai_lib::compiler::{parser::ShowDSL, Compiler};
use lumina_ai_lib::engine::attribute::{resolve_attribute, FixtureFrame};
use lumina_ai_lib::engine::profile::{AttributeValue, COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE};
use lumina_ai_lib::engine::{animation::ParameterContext, compute_frame};
use lumina_ai_lib::state::ActivePhaser;

#[test]
fn compiles_dsl_and_renders_expected_frame_at_known_beat() {
    let dsl: ShowDSL = serde_json::from_str(include_str!("fixtures/golden_show.json"))
        .expect("golden fixture must remain valid JSON DSL");
    let show = Compiler::compile_document(dsl).expect("golden fixture must compile");
    let sample_beat = 0.75;
    let active = ActivePhaser {
        id: "chase".to_string(),
        start_beat: 0.0,
        instance_id: None,
        multiplier: 1.0,
        accumulated_beat: sample_beat,
    };

    let frame = compute_frame(sample_beat, &[active], &show, &ParameterContext::new());

    assert_eq!(frame.len(), 3);
    assert_frame(&frame[0], 1, [0, 0, 255], 0.25);
    assert_frame(&frame[1], 2, [255, 0, 0], 1.0);
    assert_frame(&frame[2], 3, [255, 0, 0], 1.0);
}

fn assert_frame(frame: &FixtureFrame, id: u32, color: [u8; 3], intensity: f32) {
    assert_eq!(frame.id, id);
    assert_eq!(
        frame.value(resolve_attribute(frame.profile, COLOR_RGB_ATTRIBUTE).expect("color")),
        Some(&AttributeValue::Color(color))
    );
    assert_eq!(
        frame.value(resolve_attribute(frame.profile, INTENSITY_ATTRIBUTE).expect("intensity")),
        Some(&AttributeValue::Scalar(intensity))
    );
}

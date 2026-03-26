use palette::{Srgb, Lab, IntoColor, Mix};

pub fn lerp_color_lab(c1: (u8, u8, u8), c2: (u8, u8, u8), t: f64) -> (u8, u8, u8) {
    let lab1: Lab = Srgb::new(
        c1.0 as f32 / 255.0, c1.1 as f32 / 255.0, c1.2 as f32 / 255.0
    ).into_color();
    
    let lab2: Lab = Srgb::new(
        c2.0 as f32 / 255.0, c2.1 as f32 / 255.0, c2.2 as f32 / 255.0
    ).into_color();

    let mixed: Srgb = lab1.mix(lab2, t as f32).into_color();
    
    (
        (mixed.red.clamp(0.0, 1.0) * 255.0) as u8,
        (mixed.green.clamp(0.0, 1.0) * 255.0) as u8,
        (mixed.blue.clamp(0.0, 1.0) * 255.0) as u8,
    )
}

use palette::{IntoColor, Lab, Mix, Srgb};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ColorParseError;

impl std::fmt::Display for ColorParseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("expected a color in #RRGGBB format")
    }
}

pub fn parse_hex_color(value: &str) -> Result<(u8, u8, u8), ColorParseError> {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes.first() != Some(&b'#') {
        return Err(ColorParseError);
    }

    let red = parse_hex_pair(&bytes[1..3])?;
    let green = parse_hex_pair(&bytes[3..5])?;
    let blue = parse_hex_pair(&bytes[5..7])?;
    Ok((red, green, blue))
}

fn parse_hex_pair(pair: &[u8]) -> Result<u8, ColorParseError> {
    let high = parse_hex_digit(pair[0])?;
    let low = parse_hex_digit(pair[1])?;
    Ok(high * 16 + low)
}

fn parse_hex_digit(digit: u8) -> Result<u8, ColorParseError> {
    match digit {
        b'0'..=b'9' => Ok(digit - b'0'),
        b'a'..=b'f' => Ok(digit - b'a' + 10),
        b'A'..=b'F' => Ok(digit - b'A' + 10),
        _ => Err(ColorParseError),
    }
}

pub fn lerp_color_lab(c1: (u8, u8, u8), c2: (u8, u8, u8), t: f64) -> (u8, u8, u8) {
    let lab1: Lab = Srgb::new(
        c1.0 as f32 / 255.0,
        c1.1 as f32 / 255.0,
        c1.2 as f32 / 255.0,
    )
    .into_color();

    let lab2: Lab = Srgb::new(
        c2.0 as f32 / 255.0,
        c2.1 as f32 / 255.0,
        c2.2 as f32 / 255.0,
    )
    .into_color();

    let mixed: Srgb = lab1.mix(lab2, t as f32).into_color();

    (
        (mixed.red.clamp(0.0, 1.0) * 255.0) as u8,
        (mixed.green.clamp(0.0, 1.0) * 255.0) as u8,
        (mixed.blue.clamp(0.0, 1.0) * 255.0) as u8,
    )
}

#[cfg(test)]
mod tests {
    use super::parse_hex_color;

    #[test]
    fn parses_supported_hex_colors_without_slicing_user_text() {
        assert_eq!(parse_hex_color("#00aAfF"), Ok((0, 170, 255)));
        assert!(parse_hex_color("red").is_err());
        assert!(parse_hex_color("#12345").is_err());
        assert!(parse_hex_color("#gg0000").is_err());
    }
}

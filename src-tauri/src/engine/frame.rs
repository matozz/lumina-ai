use super::attribute::{frame_changed, FixtureFrame, FixtureFramePayload};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FramePayload {
    pub show_revision: u64,
    pub frame_sequence: u64,
    pub logical_beat: f64,
    pub full: bool,
    pub outputs: Vec<FixtureFramePayload>,
}

#[derive(Debug)]
pub struct FramePublisher {
    previous_revision: Option<u64>,
    previous_frame: Arc<[FixtureFrame]>,
    frame_sequence: u64,
    force_full: bool,
}

impl Default for FramePublisher {
    fn default() -> Self {
        Self {
            previous_revision: None,
            previous_frame: Arc::from([]),
            frame_sequence: 0,
            force_full: true,
        }
    }
}

impl FramePublisher {
    pub fn publish(
        &mut self,
        show_revision: u64,
        logical_beat: f64,
        frame: Arc<[FixtureFrame]>,
    ) -> FramePayload {
        let revision_changed = self.previous_revision != Some(show_revision);
        let topology_changed = fixture_topology(&self.previous_frame) != fixture_topology(&frame);
        let full = self.force_full || revision_changed || topology_changed;
        let outputs = if full {
            frame.to_vec()
        } else {
            diff_outputs_by_id(&self.previous_frame, &frame)
        }
        .iter()
        .map(FixtureFrame::to_payload)
        .collect();

        self.frame_sequence = self.frame_sequence.saturating_add(1);
        self.previous_revision = Some(show_revision);
        self.previous_frame = frame;
        self.force_full = false;

        FramePayload {
            show_revision,
            frame_sequence: self.frame_sequence,
            logical_beat,
            full,
            outputs,
        }
    }

    pub fn publish_full(
        &mut self,
        show_revision: u64,
        logical_beat: f64,
        frame: Arc<[FixtureFrame]>,
    ) -> FramePayload {
        self.request_full();
        self.publish(show_revision, logical_beat, frame)
    }

    pub fn request_full(&mut self) {
        self.force_full = true;
    }

    #[cfg(test)]
    pub fn frame_sequence(&self) -> u64 {
        self.frame_sequence
    }
}

pub fn diff_outputs_by_id(
    previous: &[FixtureFrame],
    current: &[FixtureFrame],
) -> Vec<FixtureFrame> {
    let previous_by_id: HashMap<_, _> = previous.iter().map(|output| (output.id, output)).collect();
    current
        .iter()
        .filter(|output| {
            previous_by_id
                .get(&output.id)
                .is_none_or(|previous| frame_changed(previous, output))
        })
        .cloned()
        .collect()
}

fn fixture_topology(
    frame: &[FixtureFrame],
) -> Vec<(u32, crate::engine::profile::FixtureProfileHandle)> {
    frame
        .iter()
        .map(|output| (output.id, output.profile))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{diff_outputs_by_id, FramePublisher};
    use crate::engine::attribute::{resolve_attribute, FixtureFrame};
    use crate::engine::profile::{
        profile_handle_by_id, AttributeValue, COLOR_RGB_ATTRIBUTE, GENERIC_RGB_PROFILE_ID,
        INTENSITY_ATTRIBUTE,
    };
    use std::sync::Arc;

    fn output(id: u32, color: [u8; 3], intensity: f32) -> FixtureFrame {
        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("RGB profile");
        let mut frame = FixtureFrame::with_profile_defaults(id, profile);
        frame.set(
            resolve_attribute(profile, COLOR_RGB_ATTRIBUTE).expect("color handle"),
            AttributeValue::Color(color),
        );
        frame.set(
            resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity handle"),
            AttributeValue::Scalar(intensity),
        );
        frame
    }

    #[test]
    fn diff_matches_fixtures_by_id_instead_of_slice_position() {
        let previous = vec![output(2, [0, 0, 0], 0.0), output(1, [255, 0, 0], 1.0)];
        let current = vec![output(1, [255, 0, 0], 1.0), output(2, [0, 0, 255], 0.5)];

        assert_eq!(
            diff_outputs_by_id(&previous, &current),
            vec![current[1].clone()]
        );
    }

    #[test]
    fn first_revision_and_topology_changes_publish_full_frames() {
        let mut publisher = FramePublisher::default();
        let first = vec![output(1, [255, 0, 0], 1.0)];
        let initial = publisher.publish(1, 0.0, Arc::from(first.clone()));
        assert!(initial.full);
        assert_eq!(initial.outputs, payloads(&first));
        assert_eq!(initial.frame_sequence, 1);

        let appended = vec![output(1, [255, 0, 0], 1.0), output(2, [0, 0, 255], 0.5)];
        let topology = publisher.publish(1, 1.0, Arc::from(appended.clone()));
        assert!(topology.full);
        assert_eq!(topology.outputs, payloads(&appended));

        let revision_frame = vec![output(1, [0, 255, 0], 1.0), output(2, [0, 0, 255], 0.5)];
        let revision = publisher.publish(2, 2.0, Arc::from(revision_frame.clone()));
        assert!(revision.full);
        assert_eq!(revision.outputs, payloads(&revision_frame));
        assert_eq!(revision.frame_sequence, 3);
    }

    #[test]
    fn stable_revision_publishes_diff_and_explicit_resync_is_full() {
        let mut publisher = FramePublisher::default();
        publisher.publish(7, 0.0, Arc::from(vec![output(1, [0, 0, 0], 0.0)]));

        let changed = output(1, [255, 0, 0], 1.0);
        let diff = publisher.publish(7, 1.0, Arc::from(vec![changed.clone()]));
        assert!(!diff.full);
        assert_eq!(diff.outputs, payloads(std::slice::from_ref(&changed)));

        publisher.request_full();
        let resync = publisher.publish(7, 1.5, Arc::from(vec![changed.clone()]));
        assert!(resync.full);
        assert_eq!(resync.outputs, payloads(&[changed]));
        assert_eq!(resync.frame_sequence, 3);
    }

    fn payloads(frames: &[FixtureFrame]) -> Vec<super::FixtureFramePayload> {
        frames.iter().map(FixtureFrame::to_payload).collect()
    }
}

use crate::compiler::{CompiledSequence, parser::CueActionDSL};

pub struct SequenceExecutor {
    sequence: CompiledSequence,
    current_cue_index: usize,
    cue_start_beat: f64,
}

impl SequenceExecutor {
    pub fn new(sequence: CompiledSequence) -> Self {
        Self {
            sequence,
            current_cue_index: 0,
            cue_start_beat: 0.0,
        }
    }

    pub fn tick(&mut self, global_beat: f64) -> Vec<CueActionDSL> {
        let mut triggered_actions = Vec::new();

        while self.current_cue_index < self.sequence.cues.len() {
            let cue = &self.sequence.cues[self.current_cue_index];

            if cue.trigger.type_ == "follow" {
                let delay = cue.trigger.delay.unwrap_or(0.0);
                if global_beat >= self.cue_start_beat + delay {
                    triggered_actions.extend(cue.actions.clone());
                    self.cue_start_beat = global_beat;
                    self.current_cue_index += 1;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        triggered_actions
    }

    pub fn go(&mut self, global_beat: f64) -> Vec<CueActionDSL> {
        if self.current_cue_index < self.sequence.cues.len() {
            let cue = &self.sequence.cues[self.current_cue_index];
            let actions = cue.actions.clone();
            self.cue_start_beat = global_beat;
            self.current_cue_index += 1;
            actions
        } else {
            vec![]
        }
    }
}

# EDM arrangement heuristics

Use these as compositional judgment, not as a fixed pattern generator. The user's music, supplied assets, and confirmed brief decide the result.

## Shape energy before placing Clips

Describe the whole-show energy curve in a small number of levels, then choose visible sources of contrast:

- fixture coverage and zone count;
- intensity/density;
- speed and rhythmic subdivision;
- motion complexity;
- color temperature/saturation;
- silence, blackout, or held frames;
- accent frequency.

Do not increase every dimension at once. Reserve at least one meaningful contrast for each major drop or return.

## Common section roles

- **Intro** establishes palette, geometry, or pulse with room to grow.
- **Foundation/groove** makes the beat readable without exhausting motion.
- **Buildup** accumulates through a planned sequence, such as wider coverage, faster motion, rising intensity, or shortening phrases.
- **Pre-drop gap/fill** creates a deliberate contrast; a short blackout or restrained accent can be stronger than more activity.
- **Drop** presents a stable visual thesis plus selective accents. It should be readable, not a new Cue every beat by default.
- **Breakdown** removes dimensions, changes palette or targeting, and resets attention.
- **Second buildup/drop** should transform the first idea: reverse dialogue, change zone hierarchy, alter phrase length, or introduce a new color relation.
- **Outro/recovery** simplifies and lands intentionally rather than ending at the last generated Clip.

## Phrase scale

House and EDM often organize ideas in powers-of-two phrases, but follow the user's actual form. Use bar-scale foundations, phrase-scale transformations, and beat-scale accents only where they serve an audible event.

Avoid dense one-beat Clip repetition when a longer CueClip plus typed automation or a TargetingScene expresses the same intent more clearly.

## Buildup checks

- Start below the energy ceiling.
- Make each change legible for at least a phrase fragment.
- Use automation with a stated target: intensity lift, speed staircase, color convergence, or coverage growth.
- Preserve a final contrast for the drop.
- Treat strobe as a separately confirmed accent, not the default source of excitement.

## Drop variation

Repeated drops need shared identity and audible differentiation. Options include:

- swap center-led and edge-led call-response;
- reverse quadrant direction or phrase entry;
- keep motion but simplify color, or keep color but change spatial dialogue;
- move accents to offbeats or phrase endings;
- reduce the first bars, then reveal full coverage;
- use different recovery behavior after the peak.

Mechanical duplication with renamed Clips is not variation.

## Multi-zone composition

- Simultaneous multi-zone behavior belongs in multiple Cue Layers.
- Time-separated response belongs in separate Cues/CueClips.
- Let a zone remain active long enough to be perceived.
- Use asymmetry intentionally; random alternation quickly becomes visual noise.
- Check intersection and MixPolicy whenever TargetSets overlap.

## Color narrative

Choose a small base palette and decide what changes at section boundaries. Useful arcs include cool-to-warm buildup, desaturated breakdown, complementary drop contrast, or a second-drop hue inversion.

Color automation should support phrase motion. Do not add a color lane merely because it is available. Respect graph-authored Palette behavior when the standard Color default is absent.

## Full-length test

“Full” means every requested range has a decision:

- authored Cue content;
- intentional sustained behavior;
- intentional silence/blackout;
- or explicitly preserved empty space requested by the user.

The last occupied Clip does not automatically define the requested show length. Report any gap between occupied end and `length_ticks`, and do not fill it without confirmation.

## Local feedback mapping

Translate feedback into the smallest musical lever:

- “buildup is flat” -> reshape one or two planned automation/coverage steps;
- “second drop needs more left-right” -> adjust copied Cue targeting or Clip dialogue in that section;
- “colors change too often” -> reduce lane/keyframe frequency and preserve a section palette;
- “accent is late” -> move the exact Clip/keyframes by integer ticks;
- “outro should be cleaner” -> remove competing writers and simplify the final phrase.

Keep confirmed sections intact and explain the changed bar/tick range.

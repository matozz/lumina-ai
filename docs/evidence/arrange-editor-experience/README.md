# Arrange Editor Experience — Visual Acceptance

Fresh computer-use evidence captured on 2026-08-09 from the implementation branch. Every image in this directory was produced during this acceptance run; no screenshot from an earlier bundle was reused.

## Tested build

| Item                                    | Value                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Branch                                  | `codex/arrange-editor-experience`                                                       |
| Source commit used for the final bundle | `e9a69e3`                                                                               |
| Exact app                               | `/Users/bytedance/Documents/p/lux/src-tauri/target/debug/bundle/macos/Lumina AI.app`    |
| Bundle modified                         | `2026-08-09 19:04:32 +0800`                                                             |
| Binary modified                         | `2026-08-09 19:04:32 +0800`                                                             |
| Verified process                        | PID `65148`, started `2026-08-09 19:05:01 +0800`, executable inside the exact app above |

The first computer-use launch addressed Lumina only by display name. Because multiple applications share `com.lumina.ai`, LaunchServices could resolve an older installed bundle; launching the naked `tauri dev` executable also did not give computer-use a stable app target. The final pass rebuilt the debug `.app`, terminated the mismatched process, launched the exact full path above, and verified the running executable before capture.

The native Screenshot overlay intermittently returned computer-use error `-10005` while it was starting. The process did start, so the pass retried the overlay, dismissed its launch-service alert, and made a new timed capture of the real Base UI context menu. The clean result is `05-context-automation-menu.png`; the failed/obscured captures are not included here.

## Fixture and windows

| Item         | Baseline                                                                                  | Accepted edited state                                                                       |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Asset        | `house-128-custom@2` / House 128 Custom                                                   | Same exact Arrangement                                                                      |
| Musical time | BPM 132, PPQ 960, 64 bars, 245760 ticks                                                   | Unchanged                                                                                   |
| Cue content  | 39 CueClips, 4 automation lanes; authored content ends at bar 28 with a 36-bar empty tail | 55 CueClips and 5 lanes after a deliberate 16-clip clipboard paste and Color lane authoring |
| Tail policy  | Empty tail left untouched by import                                                       | No automatic fill or rewrite; the extra clips are the explicit clipboard acceptance edit    |
| Snap         | 1/2 beat                                                                                  | 1/2 beat while Zoom/Fit/Focus changed independently                                         |

The large-window pass used the largest space available on the test display. The compact pass set the native window frame to 1100×768, which yields a 1100×720 web content area after the 48 px title bar. The computer-use recorder normalizes its window captures to 1302×768; screenshots `18`–`20` are the compact-frame run, not reused large-window images.

## Evidence index

| File                                                                                 | What it demonstrates                                                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [01-arrange-large-no-autoplay.png](01-arrange-large-no-autoplay.png)                 | House 128 Custom opens at 132 BPM, cursor 0 and stopped transport in the large window.                           |
| [02-cmd-zoom-64-bars-large.png](02-cmd-zoom-64-bars-large.png)                       | `Cmd+Down` zooms out while the Snap value remains 1/2 beat.                                                      |
| [03-fit-64-bars-large.png](03-fit-64-bars-large.png)                                 | Fit includes all 64 bars, including the intentionally empty tail.                                                |
| [04-timeline-focus-large.png](04-timeline-focus-large.png)                           | Timeline Focus mode preserves Fit/Zoom and Snap while reclaiming editor space.                                   |
| [05-context-automation-menu.png](05-context-automation-menu.png)                     | Fresh native capture of the CueClip menu at exact tick 37440 with Reveal automation, Duplicate, Copy and Delete. |
| [05-context-reveal-intensity.png](05-context-reveal-intensity.png)                   | Reveal from a concrete CueClip/tick resolves the typed Intensity lane rather than moving the playhead.           |
| [06-drop-a-marquee-16-clips.png](06-drop-a-marquee-16-clips.png)                     | A cross-row marquee selects 16 Drop A CueClips as one selection.                                                 |
| [07-drop-a-copy-paste-tail.png](07-drop-a-copy-paste-tail.png)                       | One clipboard paste creates the 16-clip copy at the intended tail position.                                      |
| [08-drop-a-delete-undo.png](08-drop-a-delete-undo.png)                               | Bulk Delete and one Undo restore the full pasted selection atomically.                                           |
| [09-cross-lane-keyframe-move.png](09-cross-lane-keyframe-move.png)                   | Four selected keyframes move together across Speed and Intensity lanes by one Snap step.                         |
| [10-automation-point-curve-alignment.png](10-automation-point-curve-alignment.png)   | The compact point and adjacent curve endpoint follow the same live drag projection.                              |
| [11-linked-automation-clip-move.png](11-linked-automation-clip-move.png)             | Moving FullBreath moves its exact clip-targeted Speed, Intensity and Color points together.                      |
| [12-color-lane-two-points.png](12-color-lane-two-points.png)                         | Color automation shows real endpoint swatches and a centered color band.                                         |
| [13-color-stage-playing.png](13-color-stage-playing.png)                             | The edited Color lane drives the Stage preview while Arrangement transport is playing.                           |
| [14-cue-layer-copy-readable-labels.png](14-cue-layer-copy-readable-labels.png)       | Duplicated Cue Layers render as Layer 1/2/3; UI and diagnostics do not expose raw layer IDs.                     |
| [15-drop-playback.png](15-drop-playback.png)                                         | Drop playback runs the edited Arrangement without output errors.                                                 |
| [16-fill-playback.png](16-fill-playback.png)                                         | Fill playback reaches the intended repeated FullBloom/Flash section.                                             |
| [17-live-edited-arrangement.png](17-live-edited-arrangement.png)                     | The latest edited Arrangement validates, activates and plays through Live rehearsal.                             |
| [18-arrange-1100x720.png](18-arrange-1100x720.png)                                   | Default Arrange remains fully operable at a 1100×720 content area.                                               |
| [19-fit-64-bars-1100x720.png](19-fit-64-bars-1100x720.png)                           | Compact-window Fit still exposes the complete 64-bar Arrangement.                                                |
| [20-focus-1100x720.png](20-focus-1100x720.png)                                       | Compact-window Focus mode preserves the 1.1 px/beat Fit zoom and 1/2-beat Snap.                                  |
| [21-cue-delete-confirmation-1100x720.png](21-cue-delete-confirmation-1100x720.png)   | Deleting a referenced My Cue opens an explicit dependency dialog before any document mutation.                   |
| [22-cue-actions-equal-height-1100x720.png](22-cue-actions-equal-height-1100x720.png) | Save Cue and Delete Cue use the same compact height and remain fully visible in the 1100×720 inspector.          |

## Walkthrough results

- Opening Arrange, selecting assets and changing workspaces did not start playback. Space toggled Arrange playback; Lab/Cues asset changes preserved an already-playing authoring transport.
- `Cmd+Up`, `Cmd+Down` and `Cmd+0` changed only the viewport. Snap stayed at 1/2 beat and the visual grid adapted only its density.
- The CueClip context menu resolved the exact tick and exposed only eligible typed Color, Intensity and Speed automation. Add/Reveal did not modify transport state.
- Marquee, toggle selection, cross-lane movement, Copy/Paste, Duplicate, Delete and Undo behaved as unified atomic operations. Clip-targeted keyframes followed their CueClip.
- In the automation numeric popover, Delete/Backspace cleared only the input value and left the Timeline selection/keyframes intact; Escape still closed the popover. Space in an input did not toggle transport.
- Hold segments stepped at the boundary. Dragged points, selected neighbors and curve endpoints remained aligned during the gesture, and history committed only at the boundary.
- New and copied Cue Layers received distinct internal identities. Normal labels, tooltips, accessibility names, automation labels and overlap diagnostics remained human-readable and contained no raw ID.
- Color passed from standard Effect metadata through Cue override and Arrangement automation to Stage and Live runtime output.
- The edited 132 BPM Arrangement activated in Live with no validation or output error. Returning to Arrange stopped transport and restored cursor 0.
- My Cue deletion now responds immediately: unused Cues delete directly, while referenced Cues show exact CueClip/Arrangement counts and atomically remove dependent clips and typed automation only after confirmation. Cancel leaves the project untouched.

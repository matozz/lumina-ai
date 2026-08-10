# Project folder autosave acceptance evidence

Captured on 2026-08-10 from the freshly rebuilt production bundle:

`src-tauri/target/release/bundle/macos/Lumina AI.app`

The inspected process was the executable inside that bundle. The compact capture is
1103×768 including macOS window decoration, corresponding to the required
1100×720 application content area.

## Walkthrough

1. `01-startup-folder-gate.png` — startup is blocked until a project folder is selected.
2. `02-assets-selected-folder.png` — Assets exposes the selected folder and change action.
3. `03-autosave-history.png` — a user edit was written after the two-second trailing delay and produced a history version.
4. `04-migrated-house-128-custom.png` — the migrated House 128 Custom arrangement opens at 132 BPM with 39 CueClips and four automation lanes.
5. `05-authoritative-reopen.png` — after quitting and relaunching, the packaged app reopens the selected folder's authoritative project without showing the startup gate.
6. `06-compact-1100-window.png` — Arrange remains fully operable at the minimum 1100×720 content size.
7. `09-pingpong-left-endpoint.png` — CenterPingPong reaches the selected Center TargetSet's leftmost column at 1.1.000.
8. `10-pingpong-right-endpoint.png` — the same cue reaches its rightmost column at 1.1.481.

The native folder chooser intermittently returned computer-use error `-10005` during
the run. Each affected action was re-read and retried; only screenshots from confirmed
post-retry states are retained here.

After acceptance, the application preference was restored to
`/Users/bytedance/Documents/temp/lumina_projects`, the packaged app was quit, and the
temporary acceptance project folder was removed.

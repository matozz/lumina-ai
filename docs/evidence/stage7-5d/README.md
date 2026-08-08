# Stage 7.5D native evidence

这些截图来自当前分支构建的真实 macOS Tauri `.app`，通过 accessibility/Computer Use 操作，不是浏览器页面。

| File                                       | Evidence                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `01-maximized-effect-invalid-lkg.jpg`      | maximized Effect Lab；intensity `2` 的 inline diagnostic、Save disabled、Canvas last-known-good |
| `02-maximized-cue-reopened.jpg`            | Cue Builder；`Breathe Custom` layer、TargetingScene、pinned/working/LKG 状态                    |
| `03-maximized-arrangement-placement.jpg`   | 将 `New Cue 2L r2` 放入 Arrangement，保留 start/duration tick                                   |
| `04-reopen-arrangement-persistence.jpg`    | 完全退出并重启后，Arrangement clip 仍为 start `0` / duration `3840`                             |
| `05-high-risk-strobe-confirmation.jpg`     | Safe Strobe Pulse Add 前的阻断式高风险确认                                                      |
| `06-native-1100x720-cue-builder.jpg`       | exact 1100×720 最小原生窗口，主路径与 TargetingScene 仍可访问                                   |
| `07-native-default-window-cue-builder.jpg` | default window 在 1302×768 宿主上的 macOS-clamped 原生状态                                      |

Tauri window contract 为 default `1440×900`、minimum `1100×720`、default maximized。验收宿主可用桌面小于
1440×900；因此同时保留最大化、OS-clamped default 和 exact minimum 证据，不把宿主裁剪后的截图改名为
1440×900。

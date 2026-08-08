# Authoring V1 Stage 与 Transport 收尾证据

2026-08-08 使用当前分支的 macOS debug bundle 进行 computer-use 真实窗口复核。

| 证据                                                                                 | 验证结果                                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [01-stage-circle-rings-8-layout-only.jpg](01-stage-circle-rings-8-layout-only.jpg)   | Stage 只显示无眩光的中性 Layout；`circle-rings-8` 为 8 rings、density 10、361 positions。 |
| [02-lab-effect-switch-playing.jpg](02-lab-effect-switch-playing.jpg)                 | Lab 从 Breathe 切换到 Alternating Grid Chase 后仍显示 Pause，cursor 从非零位置继续前进。  |
| [03-cues-switch-playing.jpg](03-cues-switch-playing.jpg)                             | Cues 从四 Layer Cue 切换到 Top Left Ping-Pong 后仍显示 Pause，cursor 保持连续。           |
| [04-workspace-switch-stopped-at-start.jpg](04-workspace-switch-stopped-at-start.jpg) | 从播放中的 Cues 切回 Lab 后显示 Play，位置恢复 `1.1.000`。                                |

初次进入 Lab 以及选中第一个 Cue 时均显示 Play 和 `1.1.000`，没有自动播放。切换功能区后所有 Authoring Transport session 经 scoped `stopAll` 回到各自 loop start；未启用 loop 时回到 tick 0。

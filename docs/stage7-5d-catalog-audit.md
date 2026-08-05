# Stage 7.5D Production Catalog 历史配置审计

> 日期：2026-08-05
>
> 基线：`main@cfdd31e`
>
> 范围：18 个 `src/editor/templates/*.json`、V4 Effect schema/compiler/evaluator、Stage 7 Project Effect/Cue
> 工作区、现有 golden/baseline fixtures

## 结论

18 个历史 template 均为合法、仍由 schema/migration/baseline 测试消费的 ShowDocument V4 fixture，因此本
Stage 不删除文件。它们不再适合作为普通 Production Catalog：共 43 个 EffectDefinition 全部是
`project_local`，全部使用 step-sequence 图，全部把 spatial basis 固定为 `index`，Catalog motion 全部写为
`pulse` 且 strobe risk 全部写为 `none`。其中多个 Effect 名称暗示 x/y/distance/angle，但实际空间语义来自
target-bound legacy Group 排序，而不是 target-agnostic graph metadata。

处置原则：普通 Catalog 只显示通过统一 validator 的新 `built_in` revisions；历史 template 继续由 Raw DSL、
migration、golden 和 compatibility tests 读取。只有 consumer 审计和替代 fixture 完成后才允许物理删除。

## 现有 consumer

| Consumer                                        | 当前用途                                                                        | Stage 7.5D 处置                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/editor/templates.ts` / `templates.test.ts` | Raw DSL Advanced 的 18-template inventory 与 V4 schema contract                 | 保留；不进入普通 Catalog                               |
| Rust template/baseline harness                  | 18-template compile throughput 与兼容回归                                       | 保留，另增 Production Catalog validator                |
| `src-tauri/tests/fixtures/golden_show.json`     | 单个 `legacy.chase` known-beat frame                                            | 保留为 legacy golden；不冒充 Production golden         |
| `docs/baselines/stage0-*`                       | 历史 template/runtime characterization                                          | 保留不可改写                                           |
| `docs/baselines/stage4-*`                       | 1,000 fixtures × 4 typed EffectGraph performance                                | 保留；新增 7.5D 多 Effect/Cue scoped benchmark         |
| V1–V4 migration                                 | 读取 target-bound EffectInstance/Group，并转成当前 Stage/Effect/Cue/Arrangement | 保留 legacy input；新 Catalog 不依赖 template identity |

## Template 与 Effect 处置清单

`rewrite` 表示概念进入新的 target-agnostic Production Effect；`merge` 表示仅保留一种 Production 实现；
`hide` 表示只在 legacy/Advanced 中可见；`legacy fixture only` 表示继续服务 schema/migration/golden，不进入产品
目录。当前 `remove` 为零，因为每个文件仍有明确 consumer。

| Template         | 历史 Effect                           | 分类                | Production 处置/原因                                                  |
| ---------------- | ------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `breathe`        | Global Breathe                        | rewrite             | 重写为 Breathing Wash；使用完整 schema/help/fallback                  |
| `breathe`        | Center Out Breathe                    | merge               | 合并到 Center-out / Edge-in family；不保留 target-bound `bycenter`    |
| `chaos`          | Sync Flyout                           | legacy fixture only | moving-head tilt compatibility fixture；不进入 RGB Production Catalog |
| `chaos`          | Chaos Snap                            | legacy fixture only | pan/高频 snap 的 metadata 不可信；保留 migration 输入                 |
| `circle`         | Radar Scanner                         | merge               | 合并到 Radial Wave，graph 显式使用 distance/angle capability          |
| `circle`         | Zoom In                               | rewrite             | 重写为 Edge-in/Center-out，移除固定 circle group 假设                 |
| `color_bump`     | Odd Bump / Even Bump                  | merge               | 合并到 Alternating Grid，由 TargetSet partition 解析奇偶语义          |
| `color_bump`     | Sweep Flash                           | merge               | 合并到 Short Burst/Traveler；旧定义仅 index chase                     |
| `combined`       | Circle Ripple                         | merge               | 合并到 Radial Wave                                                    |
| `combined`       | TL/TR/BL/BR Spread                    | hide                | 四个定义只因目标 Group 和颜色不同；不是四个独立 Effect                |
| `heart`          | Heart Beat                            | merge               | 合并到 Full-field Pulse/Breathing Wash；heart 形状属于 Layout         |
| `heart`          | Chase                                 | merge               | 合并到 Row/Column Chase；保留 `legacy.chase` golden 兼容              |
| `lissajous`      | Snake Run                             | merge               | 合并到 Strip/Bar Traveler；路径形状属于 Layout                        |
| `lissajous`      | Y-Axis Gradient                       | rewrite             | 重写为 Gradient Drift，并显式声明 y/spatial capability                |
| `matrix`         | Diagonal Sweep                        | rewrite             | 重写为 Diagonal/Radial Wave                                           |
| `matrix`         | Crosshair Scan X/Y                    | merge               | 合并到 Row/Column Chase 的 direction/axis 参数                        |
| `matrix`         | Implosion                             | rewrite             | 重写为 Center-out/Edge-in direction variants                          |
| `matrix_grouped` | Chunky Scan X / Block Drop Y          | merge               | 合并到 Row/Column Chase，group size 作为受控参数                      |
| `matrix_grouped` | Binary Flash                          | hide                | 旧风险 metadata 错误；不作为默认/普通目录项                           |
| `matrix_target`  | Target Lock                           | merge               | 合并到 Center-out/Edge-in；TargetSet 不属于 Effect                    |
| `matrix_target`  | Radar Sweep                           | merge               | 合并到 Radial Wave                                                    |
| `matrix_wall`    | Horizontal Color Band / Vertical Rain | merge               | 合并到 Gradient Drift/Row-Column Chase                                |
| `matrix_wall`    | Center Pulse                          | merge               | 合并到 Center-out/Edge-in                                             |
| `pixel_chase`    | Knight Rider                          | rewrite             | 重写为 Strip/Bar Traveler，支持 forward/reverse                       |
| `pixel_chase`    | Matrix Rain                           | hide                | 名称与实际单一 index step 输出不匹配                                  |
| `pulse_engine`   | Engine Shockwave                      | rewrite             | 重写为 Short Burst，保留三段明确 envelope                             |
| `pulse_engine`   | Core Burn                             | hide                | 缺少 intensity 写入且默认 color 可能产生无效可见输出                  |
| `pyramid_stage`  | Pyramid Climb                         | merge               | 合并到 Row/Column Chase；pyramid 属于 Layout/Targeting                |
| `pyramid_stage`  | Side Split                            | legacy fixture only | moving-head tilt compatibility fixture                                |
| `rainbow_wave`   | Rainbow Colors                        | rewrite             | 重写为 Gradient Drift，使用 typed color stops                         |
| `rainbow_wave`   | Dimmer Sweep                          | merge               | 合并到 Traveler/Gradient Drift                                        |
| `sine_wave`      | Sine Fly                              | legacy fixture only | moving-head tilt compatibility fixture；不进入本阶段 RGB Catalog      |
| `spiral`         | Inward Flow                           | merge               | 合并到 Edge-in/Center-out；spiral 属于 Layout                         |
| `spiral`         | Windmill                              | merge               | 合并到 Radial Wave；不以改色创建独立 Effect                           |
| `zigzag`         | Top Fire / Bottom Fire                | legacy fixture only | 两个 tilt/group fixtures；方向差异不构成两个 Catalog Effect           |

## 当前产品与 validation 缺口

- `WorkspaceLibrary` 同时显示 New Effect、Pulse、Gradient 三个相近入口。
- `EffectLabInspector` 只保存 name/default speed；built-in read-only、Customize fork、A/B、safe recovery 不存在。
- `CueBuilderInspector` 连续展开全部 layer，并在 select/onBlur 时直接创建 transaction；没有 selected-layer 模型、
  reorder、preview mute/solo 或完整 Save gate。
- `ParameterDefinitionDSL` 缺少 step/help/safe fallback/required/override policy/Advanced/binding，也不支持 boolean、
  enum、color stops。
- Project validation 尚未拒绝重复 parameter ID、default type/range 错误、反向 range、空 enum、非法 color stops、
  graph 无 writer/不可达节点、metadata drift、summary drift 或 sampled black/static/duplicate output。
- Preview backend 只在完整 compile 成功后替换 PreviewSession，具备 last-known-good 基础；UI 当前用全 Canvas overlay
  显示拼接错误文本，未保留结构化 field/path/recovery。

## 删除门槛

历史文件只有在以下条件同时满足后才可进入 `remove`：

1. `rg`/schema generator/Rust/Frontend 测试确认没有 importer、migration、golden 或 benchmark consumer；
2. Production Catalog 有独立 golden 和 sampled-output coverage，不借用文件名证明差异；
3. V1–V4 compatibility fixture 已迁到明确的 `tests/fixtures/legacy/` 或等价目录；
4. 删除不会改变已发布 schema artifact、migration report 或 baseline inventory；
5. 先提交 consumer 替代，再以独立可回退提交删除。

Stage 7.5D 初始决策：`keep=0`（普通 Catalog）、`rewrite=8`、`merge=22`、`hide=7`、
`legacy fixture only=6`、`remove=0`。实现后的 acceptance 文档将记录实际 Production replacement exact refs、
Catalog validation 结果和任何分类调整。

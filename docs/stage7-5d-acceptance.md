# Stage 7.5D Production Catalog / Safe Authoring 验收

> 日期：2026-08-05
>
> 分支：`codex/production-effect-cue-catalog`
>
> 基线：`main@cfdd31e`
>
> 状态：Stage 7.5D scoped complete；不包含 Stage 7.5E release closure

## 结论

Stage 7.5D 已完成 Production Effect/Cue Catalog、schema-driven Effect Lab、受保护的 Effect/Cue
working draft、统一 Rust validation、recoverable Project open、deterministic golden/compatibility/performance
gate，以及真实 Tauri 主路径验收。

普通用户现在可以沿
`Production Catalog → Preview → Customize → Save Effect → Add to Cue → Preview Cue → Save Cue → Arrange`
完成工作，不需要 Raw DSL。内置 revision 保持只读；非法临时输入只存在于 session-local working draft，保存和预览
均 fail closed，Canvas 保留 last-known-good；成功 Save 才一次性追加 immutable revision 和 Undo transaction。

## Production Catalog 清单

Catalog authority 为 [`production-catalog-v1.json`](../catalog/production-catalog-v1.json)，所有条目均使用精确
`id + revision`，Effect 不引用 Stage、Layout、TargetSet、TargetingScene 或 fixture identity。

| Family             | Production Effects                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Rhythm / strobe    | Pulse、Alternating Grid Chase、Short Color Burst、Safe Strobe Pulse                            |
| Atmosphere / color | Breathe、Slow Color Shimmer、Gradient Drift                                                    |
| Spatial / movement | Strip / Bar Traveler、Center-out / Edge-in Bloom、Diagonal / Radial Wave、Pan Sweep、Tilt Wave |
| Transition         | Fade / Crossfade、Spatial Wipe、Seeded Dissolve、Blackout-safe Transition                      |

共 16 个 Production Effect，超过 scoped 最低 12 个。每项包含 category/family、mood、energy、density、motion、
colorfulness、required attributes、layout capabilities、strobe risk、参数摘要和完整 schema authoring metadata。
`Safe Strobe Pulse` 使用安全默认值、声明 `high` risk，不是默认选中项；加入 Cue 前必须显式确认。

| Recipe                           | Layers | Resolution intent                        |
| -------------------------------- | -----: | ---------------------------------------- |
| Full-stage Drop Pulse            |      1 | active Stage 的全场 compatible TargetSet |
| Matrix Spatial Chase             |      1 | matrix/row-capable target                |
| Slow Atmospheric Look            |      1 | coordinate-capable full-stage look       |
| 3×3 Zone Burst                   |      1 | partition + compatible TargetingScene    |
| Moving Sweep                     |      1 | pan fixture attribute                    |
| Peak Zone Chase                  |      1 | scene-driven zone chase                  |
| Strip / Bar Traveler             |      1 | linear/coordinate target                 |
| Blackout-safe Build / Transition |      1 | full-stage blackout-safe transition      |

共 8 个 Production Cue recipe，超过 scoped 最低 6 个。resolver 只按 Stage capability、selector/partition role 和
scene capability 匹配；不硬编码 starter Stage、`all`、`zones-3x3` 等示例 identity。能力不足时返回稳定
Diagnostic 和 `choose_target` recovery，不创建半有效 Cue。

所有默认 recipe 都只表达一个视觉意图，不隐式叠加多个写入同一 attribute 的 Effect。Project Cue 若让两个 layer
覆盖相同 fixture 且写入相同 attribute，后加入的 layer 必须为该 attribute 显式选择 mix policy；否则
`CUE_LAYER_ATTRIBUTE_CONFLICT` 会阻止 preview/save。Pulse + Gradient 这类隐式强度叠加因此不会进入有效 Cue。

## Safe Authoring 与 UI 主路径

### Effect Lab

- Effect 参数控件完全遍历 pinned revision 的 parameter schema；不按 Effect ID/name 分支。
- 支持 scalar、beat-synced speed、waveform enum、phase、width/duty、attack/release/transition、intensity、color、
  color stops、direction、boolean 和 Advanced 参数。
- 每个 Production parameter 要求 type/default/range/step/unit/automation/required/label/help/safe fallback，以及
  可选 graph binding 和 Cue override policy。
- built-in 只有 `Customize` 主操作；Customize fork 为新的 `project_local` ID、从 revision 1 开始。
- Project Effect 只有 `Save new revision` 主操作。working draft、Pinned A 和 LKG B 分开；A/B 固定相同 Stage、
  TargetSet、tick、seed 和 AuthoringTransport。
- 非法字段保留原文本、显示 path/reason/hint/recovery；`Restore safe fallback`、Reset、Revert LKG 和 Save As
  都是显式动作。Advanced Graph 只读 summary/Diagnostic。

### Cue Builder

- 使用 layer list + selected-layer editor + deterministic Cue summary。
- 支持 reorder、duplicate、delete、preview mute/solo、Effect exact revision、TargetSet/TargetingScene、mix、priority、
  phase、seed、schema-driven override 和 automation。
- mute/solo 只存在于 PreviewSession；Save 后恢复为 off。preview-only filtering 会重算临时 capability/risk summary，
  不把旧 summary 传给 Rust authority。
- override 继承参数类型/范围，只有 schema 标记可 override 的字段可写。切换 revision 时不兼容 override/automation
  不会被静默删除，而是显示影响与显式 recovery。
- Save 产生新 Cue revision；旧 Cue、已有 Arrangement clip、Published Project 和 Live Snapshot 不变。
- Cue summary 从实际 layers 确定性计算。高风险 strobe Add 前显示阻断式确认。

### 预览与持久化边界

preview candidate 只传精确 `{ id, revision }` manifest refs，并依次通过 schema、semantic、reference、capability、
preview compile。失败不替换 PreviewSession、不写 Project/history、不改变 Published/Live 或持久化 transport。
成功 Save 使用同一 Rust authority，追加单一 transaction。

Project open 使用 recoverable path：无法解析、semantic-invalid、无可见 output 或引用缺失 Effect revision 的
Effect/Cue 被隔离到 `quarantined_assets`；其原始值和 structured Diagnostic 保留，并按上下文提供
`migrate_asset` 或 `duplicate_safe_copy`；仍有 last-valid revision 的 working draft 使用显式 Revert。引用已隔离
Cue 的 Arrangement clip 会被明确移除并记录诊断；其他
Layout、Stage、Effect、Cue 和 Arrangement 继续打开。严格 compile/Publish/Take Live 仍保持严格，不能绕过验证。

## 统一 validation 与非法配置覆盖

`pnpm catalog:check` 调用 Rust authority，顺序覆盖 JSON/schema、identity/revision/reference、parameter contract、
typed graph/cycle/reachability/output writer、metadata/capability、Stage targeting compatibility、preview compile、
sampled output/determinism/meter/loop。Production warning 只能来自版本化 allowlist；当前 checked-in Catalog 为零
error、零未允许 warning。

| Failure                                                          | Expected result / coverage                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 非法 default、反向 range、NaN/Infinity、空 enum、非法 color stop | schema/semantic 阶段拒绝，定位 parameter path                                      |
| graph 缺 writer、不可达 node、port/type mismatch                 | `DOC_GRAPH_*` / Catalog diagnostic；不能替换 LKG 或保存                            |
| 全黑、全静止、重复输出、override 参数无可见影响                  | 多 tick sampled-output validation 拒绝                                             |
| strobe metadata 低报                                             | 在最高允许 speed 采样，`runtime_validation_rejects_underdeclared_strobe_risk` 拒绝 |
| missing/stale exact revision                                     | 区分 missing 与 stale；compile/save fail closed；recoverable open 隔离坏 Cue       |
| incompatible Stage/TargetSet/TargetingScene/fixture attribute    | recipe Add 或 Cue Save 前阻止并返回 `choose_target`/remap recovery                 |
| overlapping layers write the same fixture attribute              | `CUE_LAYER_ATTRIBUTE_CONFLICT`；后加入层必须显式选择 mix 或更换 target/effect      |
| Cue capability/risk summary drift                                | Rust 按实际 layers 重算并拒绝不一致；preview mute/solo 先重算临时 summary          |
| 单一旧/坏资产                                                    | quarantine；Project 其余部分可打开，Published/Live 不变                            |

Publish 和 Take Live 继续在 Rust 命令入口重新验证选中的完整 dependency closure；前端曾成功预览不是信任依据。

## Golden、兼容性与性能

- Golden：16 个 Effects × 6 个 musical ticks × 16 fixtures；fixture 行紧凑编码并 checked in 于
  [`production_catalog_golden_v1.json`](../src-tauri/tests/fixtures/production_catalog_golden_v1.json)。
- Compatibility：[`production-compatibility-v1.json`](../catalog/production-compatibility-v1.json) 覆盖 matrix、
  strip/bar、circle、frame；输出明确区分 `native`、`universal` 和 `coordinate_fallback`，16 个 Effect 均有结果。
- Determinism：多 BPM、3/4、4/4、不同 loop 长度、180 random seeks，Seek/Replay 字节级一致。
- Performance：30×30 / 900 fixtures、5 个显式 HTP composition 的 Production effects、180 random seeks；pinned A 平均
  **2.615 ms/frame**，working/LKG B 平均 **2.434 ms/frame**，均低于 60Hz 的 16.67 ms frame budget。
- A/B：相同 Stage/target/tick/seed/clock，仅 Effect/Cue exact revision 不同；不 Publish、不 Take Live、不写 transport。

## 真实 Tauri 验收

使用当前源码生成的 debug `.app`，通过 macOS accessibility/Computer Use 操作真实 Lumina AI 窗口；没有把浏览器
页面当作原生验收替代。

1. 选 Breathe → Canvas Preview → Customize 为 `Breathe Custom`。
2. intensity 输入 `2`（合法范围 `[0, 1]`）：字段显示诊断、Save disabled、Canvas 标记 `Held at LKG`，Project 未写入。
3. `Restore safe fallback` 恢复为 `0.4`；Save 生成 `Breathe Custom r1`。
4. 加入 `New Cue`，完成 reorder、mute/solo、TargetingScene、保存 `New Cue 2L r2`；Save 后 mute/solo 不持久化。
5. 在 Arrange 放置精确 `new-cue-2 @ 2` clip，start tick `0`、duration `3840`；保存并完全退出/重启。
6. 重启后 Cue、`New TargetingScene`、exact Effect/Cue refs 和 Arrangement 原始 tick 全部保持。
7. 选择 `Safe Strobe Pulse` 并 Add：显示 `Confirm high strobe risk`；Tab 从 Cancel 移到 high-risk action，Esc 关闭。
8. 1100×720 原生窗口显示 Catalog、Canvas、Cue layer list、主 Add action 和 TargetingScene，未丢失操作路径。

窗口 contract 在 [`tauri.conf.json`](../src-tauri/tauri.conf.json) 固定 default `1440×900`、minimum `1100×720`、
默认 maximized。验收宿主物理桌面只有 1302×768，因此 macOS 将 1440×900 原生窗口约束到可用桌面：最大化证据为
1302×768，unzoom default 为 1242×768；不能在该宿主伪造 1440×900 截图。exact 1100×720 resize 已在真实原生
窗口通过。该环境约束与默认尺寸 contract 分开记录，不把较小截图误报为 1440×900。

视觉证据索引见 [`evidence/stage7-5d/README.md`](./evidence/stage7-5d/README.md)。原生验收发现并修复了两处只在
真实命令路径暴露的问题：preview manifest ref 携带多余字段；mute/solo audition 复用旧 Cue summary。两项均补了
frontend regression，修复提交为 `95612bb`、`0b0c58e`。

## 历史配置处置

完整清单见 [`stage7-5d-catalog-audit.md`](./stage7-5d-catalog-audit.md)。18 个 template / 43 个 legacy Effect
继续作为 Raw DSL、migration、golden 和 compatibility fixture 使用，不进入普通 Catalog。最终分类为
`rewrite=8`、`merge=22`、`hide=7`、`legacy fixture only=6`、`remove=0`；remove 为零是因为所有文件仍有明确
consumer，而不是因为它们被视为 Production 内容。

## Gate 与提交

实现按可验证切片提交：

- `48c1237`：ADR-0013 与历史 Catalog audit。
- `2b85218`：Production Catalog/schema/Rust authority/golden/compatibility。
- `0a02f7f`：protected Effect/Cue drafts、schema-driven authoring UI。
- `57cf17a`：runtime validation、recovery、performance 与高风险确认。
- `95612bb`：preview exact manifest ref 修复。
- `0b0c58e`：preview mute/solo summary 重算修复。

最终门禁结果：`pnpm check` 通过 schema/Catalog/format/typecheck、63 个 frontend files / 171 tests 和 Vite
build；`pnpm check:rust` 通过 fmt、Clippy `-D warnings`、118 unit + 15 integration/contract tests；
`pnpm tauri build --debug --bundles app` 再次运行 `pnpm build` 并成功生成真实 macOS `.app`。Catalog validation、
golden/compatibility/recovery/performance 全部包含在这些 gate 中并通过。

## 剩余 7.5E

本 Goal 明确停止在 7.5D。7.5E 仍负责全 Stage 7.5 release closure：更广的 Layout→Effect→Cue→Arrangement→
Rehearse/Live 组合矩阵、无调用者 legacy shell 的最终删除判定、真实发布 bundle/DMG 和 release-level 长时性能/硬件
环境。Stage 7.5D 没有进入 AI、音频、硬件输出、任意 graph 编辑器或 Stage 8。

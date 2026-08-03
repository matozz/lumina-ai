# ADR-0007: 版本化 Song、AudioAsset、TempoMap 与分析缓存边界

- Status: Superseded
- Date: 2026-08-03
- Superseded: 2026-08-03，产品改为无音频依赖的 TempoMap-driven Arrangement、Cue 与多 Arrangement；替代决策见 `docs/fixed-bpm-cue-arrangement-refactor.md`，正式 contract 由 ADR-0010 固化
- Related Stage: 已停止的 Stage 7 Audio/Song 实验

> 本 ADR 仅保留历史决策与已撤销实验记录，不再是后续实现目标。对应的三个实验提交已在 Stage 6 发布收口中反向提交；未提交的 shared-audio-transport 已从产品树移除。新 Goal 不应继续实现 automatic SongAnalysis、音频播放或 A/V 同步。

## Context

Stage 5 的 ShowDocument V4 已用整数 tick 和分段 BPM 驱动 arrangement，但没有歌曲资源身份、拍号/downbeat、波形缓存、分析来源或人工覆盖。若这些数据只存在于 Zustand 或绝对文件路径中，保存、relink、跨机器迁移与 Stage 8 的确定性输入都无法成立。自动分析还可能静默覆盖人工校正。

## Historical decision

以下内容描述被撤销实验曾采用的设计，不是当前产品契约：

- ShowDocument V5 曾作为实验分支契约；V1–V4 继续作为只读迁移输入。`song` 可选，因此无音频的既有灯光工程仍可打开。
- `AudioAsset` 使用稳定 asset ID、原文件名、media type、sample metadata、SHA-256 content hash 与带 kind 的 URI。relink 只替换 URI 和重新核对 hash，不以文件路径作为 arrangement identity。
- 文档只保存多分辨率 waveform cache manifest；峰值数据由 content hash、format version 和 resolution cache key 寻址，避免把大数组嵌入 show JSON。缓存丢失可以重建，不能成为文档真相。
- TempoMap 继续以 PPQ 整数 tick 为权威。V5 tempo、time-signature 与 downbeat marker 都有稳定 ID 和 source；V4→V5 确定性补入 manual tempo ID、4/4 meter 与 tick 0 downbeat。
- tick↔seconds/sample position 由 Rust TempoMap 用整数/有理数中间量换算。sample mapping 在所有 tempo segment 累加 numerator 后统一除法，避免分段舍入漂移。
- `SongAnalysis` 自带 schema version，并将 BPM、beats、downbeats、sections、energy curve 与 onset density 分开记录 source、analyzer/manual workflow version 和 confidence。人工覆盖保存在独立 revisioned overrides 中，不改写自动分析原值。
- 第一枚 downbeat marker 同时是人工 beat-grid 的 phase anchor；拖动只在 PointerEvent 期间用 DOM ref 预览，pointer up 后用共享 TempoMap 换算提交一次可撤销 transaction。
- 在自动分析前发生的人工校正会创建 `lumina-manual/1` analysis shell：测量过的 BPM/beat/downbeat confidence 为 1，尚未知的 curve/section baseline confidence 为 0；用户 section 等实际选择只写 overrides。后续 analyzer 替换 baseline 时必须保留 overrides 和 revision。
- audio 与 lighting output latency 都以毫秒 offset 保存；click/flash calibration 只更新这两个显式字段。
- 自动分析只生成 `SongAnalysis`，不得创建或修改 Stage 8 ArrangementPlan、clip 或 automation。

## Alternatives considered

1. 只保存绝对路径：跨机器不可迁移，文件移动后无法通过 hash 确认身份。
2. 把 waveform peaks 嵌入 ShowDocument：文件体积和每次保存成本随歌曲增长，Undo 与同步会复制派生数据。
3. 用浮点 seconds 作为歌曲真相：tempo change、snap 和长时间播放会形成多个不一致的时间边界。
4. 自动分析覆盖人工值：无法解释来源，也无法在换 analyzer 版本后保留用户判断。

## Consequences

- 前后端 schema、模板和默认工程一起迁移到 V5；历史 V4 artifact 保持不变。
- 文件可用性、decoder 与峰值文件属于运行时/缓存层；文档 validator 只验证持久化 identity、metadata 和派生数据一致性。
- 常见音频格式由 Symphonia 在 Tauri blocking worker 中 decode，React 主线程只接收结构化 metadata/manifest；四级 peak JSON 由 `hash/resolution` 寻址。
- cache manifest 和每个 peak level 在命中时都核对 format version、content hash、resolution 与 peak count；文件缺失或 JSON 损坏会从原音频自动重建。
- 30 分钟 128 BPM、48 kHz 的实验性核心映射曾记录 0 sample 等效误差；该结果只说明被撤销实现的历史测试，不构成当前音频能力或发布证据。
- Stage 8 只能消费稳定 V5 SongAnalysis/Effect Catalog/Stage Capabilities 接口；Stage 7 不实现 AI 编排。

## Historical migration and rollback

实验分支中的 V4→V5 migration 不创建虚构 AudioAsset 或 analysis，只升级已有 TempoMap marker metadata。Stage 6 收口已整体反向提交 V5 schema/types/templates/validator；当前 V4 contract 从未接受 V5 song 字段，也没有需要执行的用户数据降级。

## Related commits and disposition

- `4f7a07c`：V5 Song/analysis contract；已由 `af05cbc` 反向提交。
- `23ec7cf`：音频导入、relink 与 waveform cache；已由 `1429ac0` 反向提交。
- `950fce0`：人工 TempoMap correction；已由 `94920ef` 反向提交。
- shared-audio-transport、Rodio follower 与 latency calibration：从未提交，已隔离在本地恢复 stash，不属于分支产品树。
- 替代设计：`docs/fixed-bpm-cue-arrangement-refactor.md`；正式 contract 留给下一 Goal 的 ADR-0010。

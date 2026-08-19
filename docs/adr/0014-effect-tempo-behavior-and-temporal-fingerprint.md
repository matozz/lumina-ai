# ADR-0014: Effect Tempo Behavior 与 Runtime Temporal Fingerprint

- Status: Accepted
- Date: 2026-08-20
- Extends: ADR-0001、ADR-0003、ADR-0005、ADR-0010、ADR-0011、ADR-0013

## Context

EffectGraph phase 的 cycle 不是统一的视觉事件：sine、triangle、saw、pulse、空间错相和 TargetSet topology 会让相同 multiplier 呈现不同的峰值、方向变化和全场事件率。仅凭 Effect 名称、motion tag、Graph wave 或 30fps UI sampling 无法可靠判断 arrangement tempo、strobe safety 或 4×/8× 行为。

## Decision

### Authored temporal intent

每个 Effect 必须声明 typed `tempo` behavior，包括 behavior kind、primary visual event、每 Graph cycle 的事件数、1×基准、phase anchor、适用的 duty/方向反转/topology sensitivity、recommended speed 和可选 safety limit。当前 V1 的 arrangement-facing 1× 固定为每拍一个主要事件。

compiler/runtime 把已积分的 normalized primary-event phase 除以 `events_per_graph_cycle` 后再求 EffectGraph。Graph 是画面权威，tempo 是可验证的作者意图；validator 交叉检查能够静态证明的 Pulse/Random/Spatial 关系，不保存采样结果到 Effect metadata。

### Derived runtime evidence

Temporal analyzer 只能通过真实 `Compiler` + `render_at` 取样，不允许前端或 Skill 另写视觉近似。request identity 包含 exact Effect/Stage/Layout/TargetSet、resolved fixture count、seed、parameter overrides、BPM、speed 和 sampling。报告按 family 适用性输出 event rate、peaks、duty、分布、空间路径、change/color energy、逐 fixture strobe Hz 和 alias risk。

全部 built-in Effect 的六档合法 speed 与第二 TargetSet topology probe 进入 checked-in Golden。production validation 同时验证 normalized rate 单调性、已知 phase/duty/方向 landmark 和真实 BPM safety。

### Preview and AI consumers

Effect Lab 以 60fps 请求 runtime frame，并显示语义 speed、实测 1×/4×/8× 对比和 alias warning。高速预览帧不足时 UI 必须明确提示；不能把混叠画面当作行为证据。

同一 analyzer 通过 Tauri command 与 CLI 提供结构化 JSON 和 runtime SVG contact sheet。Arrangement Skill 在选择、生成、复制或调速前后消费报告，按 measured primary event rate、readability 和 safety 完成 intent → graph → validate → render/analyze → compare → revise 闭环。

## Consequences

- 缺少 `tempo` 的旧 Effect 在当前内部 V1 fail closed；源码资产、生成 contract、Pack fixture 和 Golden 同步迁移。
- 修复保持现有 exact identity 时不机械增加 revision；只有需要新旧行为并存才新增 revision 并迁移 exact refs。
- UI fps 不参与行为判定；dense musical-domain sampling 是 Golden 和 AI 审计权威。
- 详细 contract 与命令见 [`../authoring/effects.md`](../authoring/effects.md)。

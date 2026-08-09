# ADR-0005: EffectGraph、typed ports 与参数绑定

- Status: Accepted
- Date: 2026-08-02
- Amended: 2026-08-09 for the unified Effect parameter contract

## Context

可复用视觉逻辑必须与 Stage targeting 和 Arrangement identity 分离，同时保持 typed automation、capability 查询和任意 tick 的确定性求值。

## Decision

- `EffectDefinition` 只拥有稳定 identity、内部 revision、parameter schema、EffectGraph 与 Catalog metadata。Stage/TargetSet 绑定属于 Cue Layer。
- parameter definition 用 tagged `schema` 声明唯一的 type/default/type-specific metadata，用最大 `scope` 推导 Lab、Cue override 与 Arrangement automation 能力；`section/help` 提供稳定的作者界面，typed graph binding 保持可选。
- Graph connections 使用结构化 node/port references。compiler 校验 ID、port type、topology、parameter、attribute capability 和 reachable output，再生成拓扑排序的 typed IR。
- render path 只访问 node/parameter/attribute handles，不解析自由字符串。
- 每个 node 是 tick 与 fixture context 的纯函数。Random 从 seed、node stable order、fixture 和 sample index 派生，不共享可变 RNG。
- spatial index/x/y/distance/angle/grouped ordering 在 compile 阶段预计算。
- Catalog 固定内置 Effect identity，并提供 mood、energy、density、motion、colorfulness、strobe risk 和 required attributes 查询。

## Consequences

- Lab 参数表单由 parameter schema 驱动，不按 Effect ID/name 分支。
- Cue override 与 Arrangement automation 复用同一 typed parameter target。
- 冗余的 value type/default/policy/UI hint 字段被 Schema 拒绝；旧资产不会在 runtime 静默迁移。
- 1,000 fixtures × 多 typed Effect layers 的确定性与 60Hz budget 是变更门槛。
- 任意图节点编辑器不属于当前 V1 主流程；Advanced 只显示 graph summary 与 Diagnostics。

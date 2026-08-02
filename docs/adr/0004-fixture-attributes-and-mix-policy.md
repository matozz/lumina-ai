# ADR-0004: Fixture Attribute、mix policy 与输出边界

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 3

## Context

Stage 2 收口后的 runtime 仍把灯具压缩成硬编码的 RGB/dimmer struct，并用逐通道 `max` 合并所有 Phaser。`spot/pixel` 同时承担 patch 能力与 Preview 外观，pan/tilt 虽存在于文档却没有运行路径；Canvas、golden recording 和未来硬件输出也没有共享稳定的 sink contract。

Stage 3 必须在不进入 EffectGraph（Stage 4）或真实网络协议（Stage 9）的前提下，建立可扩展灯具能力、属性级混合和可复用输出边界。

## Decision

- ShowDocument V2 的 patch 使用稳定 `profile_id`。内置 registry 首先提供 `generic-rgb`、`generic-rgbw` 和 `generic-moving-head`；V1 的 `pixel/spot` 通过显式 migration 分别映射到 `generic-rgb/generic-moving-head`。
- `FixtureProfile` 是灯具能力权威，包含 typed attribute descriptor、值类型、默认值、物理范围、默认 mix policy 和 protocol channel mapping。layout 只保留 fixture ID 与空间坐标；Preview 外观是 profile metadata/adapter 的派生信息。
- compile 阶段把 profile ID 和 attribute ID 解析为紧凑 handle。runtime Frame 保存 typed attribute values，不保存只对 Canvas 有意义的 RGB/dimmer 镜像字段。
- effect write 显式携带 source/layer、priority、activation order、weight 和 optional mix override。profile 提供默认 policy；HTP/LTP/Add/Multiply/Mask 由单一 Mixer 执行，LTP 使用 `(priority, activation_order, stable_source_order)` 确定胜者。
- Mixer 同时产生可检查的 resolution/conflict 信息；这份信息用于 diagnostics/Inspector，不改变 Frame。
- `OutputSink` 接受同一个 immutable Frame revision，并具有 `capabilities/start/send/blackout/health/stop` 生命周期。Stage 3 实现 Null、Preview subscription 和 Recording；网络协议与硬件 fail-safe 留在 Stage 9。

## Alternatives considered

1. 继续扩展 `FixtureOutput { r, g, b, dimmer, ... }`：每加一种属性都会改 Frame、diff、Preview 和输出协议，无法表达 profile capability 或属性级 policy。
2. 使用 `HashMap<String, JSON>` 作为通用 Frame：扩展容易，但把拼写、类型检查和分配成本推到 60Hz render path，也无法稳定实现 LTP tie-break。
3. 在 Phaser evaluator 内直接混合：会让每种 effect 重复 policy，且 Preview/Recording 无法检查冲突来源。

## Consequences

- Stage 3 会产生 ShowDocument V1→V2 migration，并保留 V1 schema artifact；当前模板一次性升级到 V2。
- profile/attribute 新增必须同步 registry tests、capability metadata 和 protocol mapping；未知 profile/attribute fail closed。
- 旧 Canvas 只通过 adapter 读取它能显示的 `intensity/color.rgb/position.*`，不得回写或修改 Frame。
- Add/Multiply/Mask 不会因多 effect 重叠而隐式启用；只有 profile 或 write 显式指定才执行。
- runtime `FixtureFrame` 以 profile descriptor 顺序保存 typed values，只有 compiler/runtime 内部 `AttributeHandle` 可以定位槽位；错误值类型被拒绝，未写槽位保留 profile default。
- IPC 在 Frame 边界携带 `profile_id + [{ attribute id, typed value }]`；Canvas 的 preview adapter 只读投影可展示属性，不能形成第二份可回写的 runtime state。

## Migration and rollback

V1 patch 的 `type=pixel` 映射为 `profile_id=generic-rgb`，`type=spot` 映射为 `profile_id=generic-moving-head`，并逐项记录 migration report。回滚 Stage 3 时可以继续读取 V1 artifacts；不得把 V2 profile 字段宽松降级成 `spot/pixel`。

## Related commits

- Stage 2 strict contract: `06e14e3`
- Fixture Profile and V2 migration: `cab82e2`
- Typed Attribute Frame and Canvas adapter: 本切片提交

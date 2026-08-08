# ADR-0004: Fixture Attribute、MixPolicy 与输出边界

- Status: Accepted
- Date: 2026-08-02
- Amended: 2026-08-08 for Authoring V1

## Context

不同 fixture profile、多个 Effect layers 和 Live sinks 必须共享一套 typed output 与可解释混合规则。逐通道硬编码或按遍历顺序覆盖无法安全表达 capability 和冲突。

## Decision

- `FixtureProfile` 是 fixture capability 权威，声明 typed attribute、默认值、物理范围、默认 mix policy 和 protocol mapping。
- compile 将 profile/attribute IDs 解析为紧凑 handles；runtime Frame 按 descriptor 顺序保存 typed values。
- Effect write 携带 source、layer、priority、activation order、stable source order、weight 和可选 policy override。
- Mixer 统一执行 HTP、LTP、Add、Multiply 和 Mask，并在 profile physical range 内 clamp。LTP 使用稳定排序决胜。
- Add、Multiply 和 Mask 不因 overlap 自动启用。Cue Layer 或 CueClip overlap 对相同 fixture/attribute 有多 writer 时必须提供显式 MixPolicy。
- Mixer 同时生成 resolution/conflict 信息供 Diagnostic/Inspector 使用，但不改变逻辑 Frame。
- `OutputHub` 将同一个 immutable logical Frame fan-out 到 Preview、Recording、Null 和 Live adapters；sink 不重复求值，也不能阻塞 render。

## Consequences

- 未写 attribute 保留 profile default；错误类型与未知 attribute fail closed。
- Preview adapter 只能投影它能显示的属性，不能形成第二份 runtime 真相。
- 新 profile/attribute 必须同步 registry、capability、mixer、preview 和 output tests。

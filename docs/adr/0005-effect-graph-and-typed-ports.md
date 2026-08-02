# ADR-0005: EffectGraph、typed ports 与参数绑定

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 4

## Context

Stage 3 收口后，文档中的 Phaser 仍把可复用逻辑、目标灯组、运行参数和时间轴身份放在同一个对象里。`multiplier` 同时存在于文档、compiled phaser、Live payload 和 automation 特例中；step evaluator 只能写固定属性，空间相位也只能消费 group index。这个结构无法安全支持效果复用、typed automation、能力查询或后续 AI 引用。

Stage 4 需要在不改变 Stage 5 时间模型、Stage 6 工作区或 Stage 9 输出协议的前提下，建立可确定性求值的 Effect Engine，并为旧 Phaser 提供显式迁移路径。

## Decision

- `EffectDefinition` 只拥有稳定 ID、revision、参数 schema、EffectGraph 和 Catalog metadata；`EffectInstance` 拥有稳定实例 ID、definition revision 引用、目标灯组、typed overrides 和 seed。Timeline/Live 引用实例 ID，不引用 display name。
- 参数在 compile 阶段解析为紧凑 `ParameterHandle`。参数定义同时声明值类型、默认值、范围、单位、UI hint 和 automation policy；instance override 与 automation target 使用同一个 handle。旧 `multiplier` 只在文档 migration 边界存在，进入 runtime 后统一映射为 `speed`。
- EffectGraph 文档连接使用结构化 node/port reference。compiler 校验 node ID、port type、拓扑、参数和 attribute capability，并生成拓扑排序的 typed IR；render path 只访问 node/parameter/attribute handle，不解析自由字符串。
- 每个节点是目标时间和 fixture context 的纯函数。Random 节点必须从 instance seed、node stable order 和离散 sample index 派生结果，禁止共享可变 RNG；相同 snapshot、tick 和 seed 必须产生相同 Frame。
- 空间相位在 compile 阶段为目标灯组预计算 index/x/y/distance/angle/custom ordering 和 grouped blocks；render 只读取 cache。spread 使用包含首尾的规范化端点，单灯组固定为起点；wrap 显式控制是否归一化到一个 cycle。
- Catalog 统一表示 built-in、project-local 和 user-library 来源，固定 definition revision，并提供 mood、energy、density、motion、colorfulness、strobe risk 与 required attributes 查询。
- V2 Phaser 通过 V2→V3 migration 转换为 canonical EffectGraph、Definition 和 Instance。实例 ID 保持原 phaser ID；timeline phaser action 迁移为 effect clip 引用；before/after golden Frame 证明兼容。pan/tilt 从旧版曾被忽略的状态按 Stage 3 typed attribute 行为输出并在 migration report 中标记。
- Stage 4 的第一过渡切片允许 legacy step evaluator 与新的 compiled identity/typed parameter model 并存，但只有 EffectInstance 的 `speed` 是 timeline phase 的 runtime 真值。过渡结构必须在 Stage 4 退出前由统一 EffectGraph evaluator 替换。

## Alternatives considered

1. 继续扩展 Phaser struct：会让 definition、instance、target 和 timeline identity 持续耦合，不能安全复用或固定 revision。
2. 使用 `HashMap<String, JSON>` 传递 graph values：实现快，但把类型错误、字符串查找和分配留在 60Hz render path。
3. 使用有状态节点并在 Seek 时从零快进：结果依赖播放历史，无法满足任意 tick 的确定性求值。
4. 在 Stage 4 同时实现可视化节点编辑器：超出当前退出条件，且会提前进入 Stage 6 的产品工作流范围。

## Consequences

- ShowDocument 将新增 V3 schema 和 V2→V3 migration；V1/V2 artifact 保留用于旧文件读取与 contract tests。
- graph/parameter schema 变更必须经过 Rust authority、JSON Schema、TypeScript、migration 和模板 contract。
- compiler 需要保存 definition/instance/parameter/node handle table 和预计算 spatial cache，换取 render path 无字符串解析和稳定分配上限。
- Live Pad 在 Stage 4 仍可显示“Phaser”兼容文案，但 backend identity 已是 EffectInstance；产品命名和 Effect Lab 留到 Stage 6。
- Stage 5 automation lane 可直接复用 typed parameter target，不再为 `multiplier` 建立第二条求值路径。

## Migration and rollback

迁移按 compiled identity/typed parameters、V3 document、typed graph evaluator、spatial cache、Catalog、模板 golden 的顺序提交。每个切片保持 V2 loader 和 before/after fixtures 可单独验证。回滚某个切片时必须同时回滚对应 schema artifact 和 migration；不得留下一个会把 V3 宽松读取为 Phaser 的旁路。

## Related commits

- Stage 3 baseline: `635f1a9`
- Compiled Effect identity and typed parameter core: 本切片提交

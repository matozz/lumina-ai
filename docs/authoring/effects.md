# Effects

## 所有权

`EffectDefinitionDocument` 只描述 target-agnostic 的视觉行为：typed parameter schema、EffectGraph、capability 和 Catalog metadata。它不引用 Stage、Layout、fixture、TargetSet、Cue 或 Arrangement。

目标绑定发生在 Cue Layer。这样同一个 Effect 可以在不同 Stage 区域复用，同时保持精确、可验证的依赖关系。

## EffectGraph

Graph 连接使用结构化 node/port 引用。Rust compiler 在 render 前完成：

- node、port 和 parameter 类型检查；
- cycle、missing input 和 unreachable output 检查；
- parameter/node/attribute handle 解析；
- spatial phase 和 fixture context cache；
- seed 的稳定解析。

render 中的每个 node 都是 tick 与 fixture context 的确定性函数。相同 snapshot、tick、seed 和参数必须得到相同输出；Random 不得依赖共享可变 RNG。

Random 为相邻 seeded cycle 生成确定性目标，并用 smoothstep 在整个 cycle 内连续交叉淡化。它不会在整数 beat 硬切，也不会依赖 UI frame rate；相同 seed、fixture、node 和 phase 必须重放一致。

## Authoring

- 内置 Effect 只读；**Customize** 复制为新的项目 Effect，并分配独立 ID。
- Lab 的 working changes 不立即写 ProjectBundle。Schema、semantic、reference、capability 和 preview compile 都通过后才能 Save。
- 非法更改保留表单内容并显示局部 Diagnostic，Canvas 保持 last-known-good frame。
- 参数 UI 只读取当前 Effect 的 parameter schema，不能按 Effect 名称写分支。
- 默认 speed 以及 Cue override 只接受 0.25×、0.5×、1×、2×、4×、8×。
- 普通 Lab 先展示参数控制；family/category/layout capability 等 Catalog metadata 只在 Advanced 模式展示。Catalog 不保存或展示高/中/低 strobe risk 标签。

### Tempo behavior contract

每个 Effect 必须声明最小 typed `tempo`。它只保留不能由参数/Graph/分析结果替代、且确实参与 runtime 或编排的事实：

- `primary_event` 区分 pulse onset、单向 traversal、ping-pong 的单方向 traversal、random refresh、rise-fall/color/movement cycle 和 spatial propagation，也是 UI/AI 使用的唯一事件语义；
- `events_per_graph_cycle` 把 Graph 自身周期换算为主要事件，runtime 用它把 musical-domain normalized speed 映射为 Graph phase；
- 可选 `safety.max_primary_events_per_second` 提供需要按真实 BPM/Hz 验证的生产安全上限。

因此 arrangement-facing 语义固定为：pulse 每拍一次 onset；one-way wipe/chase 每拍一次完整 traversal；ping-pong 每拍一个方向、完整往返两拍；random/dissolve 每拍刷新一次；breathe/continuous 的 1× 是每拍一个明确 cycle。0.25× 到 8× 的主要事件率必须严格单调。Graph wave cycle 不能直接当作这个产品语义：例如 triangle 的完整左右往返包含两个 directional traversal。

1× 每拍一个主要事件是产品规范，不再作为每个 Effect 都重复写 `1` 的字段。Pulse duty 只存在于可编辑 parameter 与绑定的 Graph node；方向反转、peak、topology sensitivity、readability 和 aliasing 都由真实 runtime analyzer 测量，不复制进 `tempo`。

`tempo` 是 authored intent；runtime temporal fingerprint 是 derived evidence。Validator 只交叉检查能够静态证明的关系：pulse onset 必须有 Pulse oscillator 或 on/off StepSequence、random refresh 必须含 Random、travel/propagation 必须含 SpatialPhase。0.25×、0.5×、1×、2×、4×、8× 六档节拍同步 speed 始终可用；没有 recommended range 或其他 readability 保存限制。

### Temporal analysis 与高速预览

`analyze_effect_temporal` 使用真实 Rust compile + `render_at`，在固定 Stage/Layout/TargetSet、seed、BPM、参数和 dense musical-time sampling 下输出：主要事件率、峰值与 phase、on-duty、intensity 分布、active fixture fraction、空间质心路径/反转、frame delta、颜色变化、适用时的逐 fixture pulse Hz、安全越限和 UI fps 混叠风险。不适用的 family metric 使用缺省值，而不是伪造数字。Hz 是内部分析数值，不会再派生或持久化 high/medium/low 风险标签。

空间方向使用 compiled Effect instance 的真实 SpatialPhase offsets 作为进度基准。Wrapped 轨迹使用强度加权的圆周质心并跨周期解包；只有持续至少三个 sample 且累计位移达到轨迹范围 2% 的反向 run 才计为 reversal。由此不会把 one-way wrap reset、离散 fixture 抖动或环形传播误报为反向，同时仍能在 ping-pong 中测得真正的方向切换。

Effect Lab 的 speed 选项显示例如 `1× · 1 traversal/beat · 2.13 events/s`，并始终提供全部六档节拍同步速度。Lab Effect preview 以最高 60fps 请求真实 runtime frame；紧凑的 behavior 区域只分析并显示当前所选 speed 的主要事件率以及适用的 duty、空间轨迹或 strobe 指标，不展示 runtime 实现标签、多速度对比、帧数或 aliasing 警告。参数控制仍是用户入口；完整多速度 fingerprint、readability 和 aliasing 由 CLI、Golden、Catalog 审查与 AI 编排消费。

AI/自动化可用同一路径生成结构化报告和 runtime contact sheet：

```sh
pnpm effect:analyze --pack base-assets.lumina-assets.json \
  --effect-id builtin.spatial.column-ping-pong --revision 1 \
  --target-set-id zone-4x4-1 --bpm 128 --speeds all \
  --preview-fps 60 --output ping-pong.json \
  --contact-sheet ping-pong.svg --contact-speed 4
```

cache identity 包含 exact Effect、Stage、Layout、TargetSet、resolved fixture count、seed、parameter overrides、BPM、speed 集合和 sampling 配置；任一项变化都产生新 key。

### Parameter contract

参数只声明一份类型事实，并用最大 authoring scope 推导可用入口：

```json
{
  "id": "speed",
  "name": "Speed",
  "schema": {
    "type": "scalar",
    "default": 1,
    "range": { "min": 0.25, "max": 8, "step": 0.25 },
    "unit": "multiplier"
  },
  "scope": "arrangement",
  "section": "main",
  "help": "Beat-synced playback speed."
}
```

- `schema` 是 tagged union；scalar 的 default/range/unit、enum 的 default/values、Color 的可选 default 都只存在于对应分支。
- `scope: effect` 只允许 Lab 编辑；`cue` 额外允许 Cue Layer override；`arrangement` 再额外允许 Arrangement automation。
- Arrangement scalar/Color 自动得到 continuous automation；direction/boolean/enum 自动得到 discrete automation；`color_stops` 固定为 Effect scope 且不可 automation。
- `section` 只控制 Main/Advanced 分区；`help` 是 UI、Tooltip、aria 和 Skill 共同使用的作者说明。
- `graph_binding` 仅在参数直接绑定 EffectGraph node property 时声明，不承担 authoring policy。

内置 Effect 的标准 Intensity 参数默认值统一为 `1`，所有写入 intensity 的 authored Graph 路径也必须能够达到 `1`；运动、呼吸和转场仍可通过连续 envelope/profile 改变瞬时亮度。Cue recipe 不再用默认 override 二次压暗，较低能量由 Arrangement automation 显式表达。颜色 Gradient 用色相/饱和度变化塑造层次，不能用近黑色端点替代 dimmer fade；真正的 blackout 只能来自可审查的 intensity 路径。

旧的 `value_type`、typed `default_value`、`required`、`safe_fallback`、`override_policy`、`automation`、`advanced`、`ui_hint`、平铺 `range/step/unit/enum_values` 都已删除。它们或与类型重复，或允许互相矛盾的组合。表单 last-known-good 属于编辑会话状态，不再伪装成资产内的 `safe_fallback`；控件形态从 `schema.type` 和 unit 推导。

Effect Catalog 继续保留 `source/revision` 供 exact reference，保留 energy/density/motion/colorfulness 供发现，并保留 `required_attributes/layout_capabilities` 做 fail-closed 兼容性校验。后两项不能仅从 Graph 猜测：通用 attribute-set writer、Targeting Scene 和布局语义都可能使静态推断不完整。Catalog 不保存 `strobe_risk`，Cue 也不保存 `risk_summary`；旧字段按 unknown-field 策略 fail closed。普通 UI 不展示 source、revision 或 raw capability token。

### Standard Color override

每个可进入 Project 的 Effect 都声明标准参数 `color`：`schema.type: color`、`scope: arrangement`、`section: main`，值为严格的 `#RRGGBB`。该参数使 Lab、Cue Layer override 和单 CueClip Arrangement Color automation 使用同一个 typed target；Color lane 在 runtime 使用 Lab 插值并精确保留 endpoint。

Color `schema.default` 是唯一的显式默认色开关：存在时 Effect 默认覆盖最终 `color.rgb`，缺省时保留 EffectGraph 自己的 Palette/颜色，或者让纯 intensity Effect 不写颜色。Lab 和 Cue UI 可选择颜色，也可清除回 Effect authored/fallback 行为；编辑器为 color picker 提供的临时白色不是文档默认值，也不构成 writer。旧 `default_enabled` 不再存在。

结构性 Palette 继续使用 `color_stops`，只在 Lab 中编辑。本版本不在 runtime 改变 stop 数量，也不做 stop-by-stop Arrangement automation。

当前受源码管理的 Effect、Cue、Arrangement、starter Project 与测试 fixture 必须在同一变更中完整迁移到新参数结构。运行时不读取或补写旧字段：含旧参数结构、旧 `tempo.kind/one_x_events_per_beat/phase_anchor/duty_cycle/direction_reversals_per_graph_cycle/topology_sensitivity/recommended_speed`、旧 `catalog.strobe_risk`、旧 Cue `risk_summary`、缺少标准 Color 或含其他 unknown field 的 Project/User Asset Pack 都 fail closed；旧开发缓存只在 scoped storage boundary 重建 starter。Catalog 行为修复直接更新当前源文件，不机械增加 revision；只有确实需要新旧 identity 并存时才新增 revision，并同步重映射所有 exact refs。

## 内置效果取舍

内置库按可观察的视觉意图区分，而不是按参数微调重复收录。**Short Color Burst** 与 **Safe Strobe Pulse** 合并为 **Color Accent**：每个 cycle 都有可调 attack/release，最低亮度保留在可读范围，不产生瞬时全黑闪烁。Effect Lab 新建效果只提供 sine/triangle 连续波形，生成参数只保留确实改变 Graph 的 Speed、Phase、Intensity、Color 与 Direction；不再生成无效的 Width/Transition 字段。

矩阵空间效果包含：

- **Column Half Relay**：替换意义不清的 Alternating Grid Chase，把目标按 X 坐标动态二等分并在左右半场之间连续交叉淡化；1× 每拍完成一个方向，两拍完成完整往返。
- **Column Thirds Triplet**：按实际 TargetSet 宽度动态三等分，一拍完成一个三分区 triplet phrase。
- **Column Quarter Cascade**：动态四等分并按列区连续级联。
- **Column Center Ripple**：按距水平中心的距离动态分区，形成中心向外或反向的对称波纹。
- **Four-Column Prism**：四列分区的颜色与亮度联合传播。
- **Column Ping-Pong**、**Seeded Column Rain**：使用连续软边 profile，不再用 FixtureMask 硬切列头。

`SpatialPhase.partition_count` 是 topology-relative 分区：compiler 先在当前 TargetSet 上归一化 X 或 `x_distance`，再量化为 2/3/4 等分。因此同一 Effect 可在 20 列全场、10 列 quadrant 或其他布局中保持分区语义，不保存具体列号。

`random_x` 是 SpatialPhase 的确定性空间 basis，只随机化列相位，不使用共享可变 RNG，也不按 fixture 逐个制造噪点。

Intensity parameter override 缩放 EffectGraph 已写出的 intensity；当 FixtureMask 关闭某个 fixture 时，override 不能绕过 mask 为它补写亮度。只在 EffectGraph 本身不拥有 intensity writer 时，显式 intensity override 才作为独立 dimmer 输出。

## Mix 与安全

Effect 写入 typed fixture attributes。Profile 提供默认 HTP/LTP policy，但当多个 Cue Layer 或重叠 CueClip 在同一 fixture 上写同一属性时，作者必须在 Cue Layer 明确选择 MixPolicy；Add、Multiply 和 Mask 永不因重叠自动启用。

内置 Catalog 不包含硬边 pulse/strobe 效果。对于外部或未来 Effect，若 `tempo.safety` 声明了数值上限，Preview、Save 和 Go Live 仍通过真实 BPM 与逐 fixture Hz 执行 Rust authority validation；UI 不使用风险标签或阻断式“高风险”确认。

## 关键实现

- Contract：`src-tauri/src/document/effect.rs`
- Graph validation/evaluation：`src-tauri/src/document/validation.rs`、`src-tauri/src/engine/effect.rs`
- Catalog validation：`src-tauri/src/document/production_catalog.rs`
- Temporal analyzer/CLI：`src-tauri/src/engine/temporal.rs`、`src-tauri/examples/analyze_effect_temporal.rs`
- Lab：`src/workspace/effect-lab/`
- Working copy state：`src/stores/authoringDraft.ts`

## 验收

- 内置 Effect 修改不会改变 Catalog 文件或已存在项目资产。
- 参数变化在 Canvas 可见；无效参数不会替换最后有效预览。
- standard Color 在 Lab、Cue override、Arrangement lane 和 `color.rgb` render output 间保持 typed round-trip；清除后恢复 Effect authored/fallback 行为；`color_stops` 不出现在 automation 菜单。
- Effect 不包含任何 Stage/TargetSet identity。
- 全部内置 Effect 的 0.25×–8× fingerprint 与契约一致；BPM/TargetSet/seed/override/sampling 都进入分析 identity。
- 1,000 fixtures × 多 Effect layers 仍保持确定性并满足 60Hz 预算。

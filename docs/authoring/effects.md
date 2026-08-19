# Effects

## 所有权

`EffectDefinitionDocument` 只描述 target-agnostic 的视觉行为：typed parameter schema、EffectGraph、capability、Catalog metadata 和风险信息。它不引用 Stage、Layout、fixture、TargetSet、Cue 或 Arrangement。

目标绑定发生在 Cue Layer。这样同一个 Effect 可以在不同 Stage 区域复用，同时保持精确、可验证的依赖关系。

## EffectGraph

Graph 连接使用结构化 node/port 引用。Rust compiler 在 render 前完成：

- node、port 和 parameter 类型检查；
- cycle、missing input 和 unreachable output 检查；
- parameter/node/attribute handle 解析；
- spatial phase 和 fixture context cache；
- seed 的稳定解析。

render 中的每个 node 都是 tick 与 fixture context 的确定性函数。相同 snapshot、tick、seed 和参数必须得到相同输出；Random 不得依赖共享可变 RNG。

Random 将 phase 0 保留为停止状态的静态预览；Transport 离开零点时立即进入第一个 seeded cycle，随后按整数 beat 周期稳定切换，避免播放开始后额外停留一拍。

## Authoring

- 内置 Effect 只读；**Customize** 复制为新的项目 Effect，并分配独立 ID。
- Lab 的 working changes 不立即写 ProjectBundle。Schema、semantic、reference、capability 和 preview compile 都通过后才能 Save。
- 非法更改保留表单内容并显示局部 Diagnostic，Canvas 保持 last-known-good frame。
- 参数 UI 只读取当前 Effect 的 parameter schema，不能按 Effect 名称写分支。
- 默认 speed 以及 Cue override 只接受 0.25×、0.5×、1×、2×、4×、8×。

### Tempo behavior contract

每个 Effect 必须声明 typed `tempo`。它描述作者认定的主要视觉事件，不要求不同 family 具有相同画面：

- `kind` 与 `primary_event` 区分 pulse onset、单向 traversal、ping-pong 的单方向 traversal、random refresh、连续 rise-fall/color/movement cycle 和 spatial propagation；
- `events_per_graph_cycle` 把 Graph 自身周期换算为主要事件；`one_x_events_per_beat` 在当前 V1 必须为 `1`；runtime 先在 musical domain 积分 normalized speed，再映射为 Graph phase；
- `phase_anchor`、pulse `duty_cycle`、每 Graph cycle 的方向反转数和 topology sensitivity 记录可验证的 landmark；
- `recommended_speed` 是作者的可读性范围，`safety.max_primary_events_per_second` 是需要真实 BPM/Hz 验证的上限。

因此 arrangement-facing 语义固定为：pulse 每拍一次 onset；one-way wipe/chase 每拍一次完整 traversal；ping-pong 每拍一个方向、完整往返两拍；random/dissolve 每拍刷新一次；breathe/continuous 的 1× 是每拍一个明确 cycle。0.25× 到 8× 的主要事件率必须严格单调。Graph wave cycle 不能直接当作这个产品语义：例如 triangle 的完整左右往返包含两个 directional traversal。

`tempo` 是 authored intent；runtime temporal fingerprint 是 derived evidence。validator 只对能够静态证明的关系做交叉检查，例如 pulse duty 必须与 Pulse oscillator 或 StepSequence 一致、random refresh 必须含 Random、空间行为必须含 SpatialPhase。它不把采样值复制回 metadata，从而避免两套不可校验的真相。

### Temporal analysis 与高速预览

`analyze_effect_temporal` 使用真实 Rust compile + `render_at`，在固定 Stage/Layout/TargetSet、seed、BPM、参数和 dense musical-time sampling 下输出：主要事件率、峰值与 phase、on-duty、intensity 分布、active fixture fraction、空间质心路径/反转、frame delta、颜色变化、逐 fixture strobe Hz、安全越限和 UI fps 混叠风险。不适用的 family metric 使用缺省值，而不是伪造数字。

Effect Lab 的 speed 选项显示例如 `1× · 1 traversal/beat · 2.13 events/s`。Lab Effect preview 以最高 60fps 请求真实 runtime frame；4×/8× 不足以可靠读取时显示 analyzer 的 caution/severe 提示，并提供 1×/4×/8×实测对比、轨迹距离和 phase scrubbing，避免把时间混叠误判为减速或反向。

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

旧的 `value_type`、typed `default_value`、`required`、`safe_fallback`、`override_policy`、`automation`、`advanced`、`ui_hint`、平铺 `range/step/unit/enum_values` 都已删除。它们或与类型重复，或允许互相矛盾的组合。表单 last-known-good 属于编辑会话状态，不再伪装成资产内的 `safe_fallback`；控件形态从 `schema.type` 和 unit 推导。

Effect Catalog 继续保留 `source/revision` 供 exact reference，保留 energy/density/motion/colorfulness/strobe risk 供发现和风险过滤，并保留 `required_attributes/layout_capabilities` 做 fail-closed 兼容性校验。后两项不能仅从 Graph 猜测：通用 attribute-set writer、Targeting Scene 和布局语义都可能使静态推断不完整。普通 UI 不展示 source、revision 或 raw capability token。

### Standard Color override

每个可进入 Project 的 Effect 都声明标准参数 `color`：`schema.type: color`、`scope: arrangement`、`section: main`，值为严格的 `#RRGGBB`。该参数使 Lab、Cue Layer override 和单 CueClip Arrangement Color automation 使用同一个 typed target；Color lane 在 runtime 使用 Lab 插值并精确保留 endpoint。

Color `schema.default` 是唯一的显式默认色开关：存在时 Effect 默认覆盖最终 `color.rgb`，缺省时保留 EffectGraph 自己的 Palette/颜色，或者让纯 intensity Effect 不写颜色。Lab 和 Cue UI 可选择颜色，也可清除回 Effect authored/fallback 行为；编辑器为 color picker 提供的临时白色不是文档默认值，也不构成 writer。旧 `default_enabled` 不再存在。

结构性 Palette 继续使用 `color_stops`，只在 Lab 中编辑。本版本不在 runtime 改变 stop 数量，也不做 stop-by-stop Arrangement automation。

当前受源码管理的 Effect、Cue、Arrangement、starter Project 与测试 fixture 必须在同一变更中完整迁移到新参数结构。运行时不读取或补写旧字段：含旧结构、缺少标准 Color 或含 unknown field 的 Project/User Asset Pack fail closed；旧开发缓存只在 scoped storage boundary 重建 starter。Catalog 行为修复直接更新当前源文件，不机械增加 revision；只有确实需要新旧 identity 并存时才新增 revision，并同步重映射所有 exact refs。

## 内置效果取舍

内置库按可观察的视觉意图区分，而不是按参数微调重复收录。V1 保留柔和、可塑形的 **Breathe**，删除与其图结构和输出过于接近的旧 **Pulse**；需要短促节拍时使用 **Short Color Burst** 或安全等级明确的 **Safe Strobe Pulse**。

矩阵空间效果包含：

- **Column Ping-Pong**：窄列在左右边界之间往返，不会退化为整场同步亮度变化。
- **Seeded Column Rain**：用 Cue Layer seed 对每个唯一 X 坐标生成稳定相位，同一列保持一致，并沿 Y 轴由上到下滚动。相同 seed、布局和 tick 必须重放一致。

`random_x` 是 SpatialPhase 的确定性空间 basis，只随机化列相位，不使用共享可变 RNG，也不按 fixture 逐个制造噪点。

Intensity parameter override 缩放 EffectGraph 已写出的 intensity；当 FixtureMask 关闭某个 fixture 时，override 不能绕过 mask 为它补写亮度。只在 EffectGraph 本身不拥有 intensity writer 时，显式 intensity override 才作为独立 dimmer 输出。

## Mix 与安全

Effect 写入 typed fixture attributes。Profile 提供默认 HTP/LTP policy，但当多个 Cue Layer 或重叠 CueClip 在同一 fixture 上写同一属性时，作者必须在 Cue Layer 明确选择 MixPolicy；Add、Multiply 和 Mask 永不因重叠自动启用。

高风险 strobe 继续要求显式确认和可信 Catalog metadata。Preview、Save 和 Go Live 都复用 Rust authority validation，不依赖 UI 曾经成功渲染。

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

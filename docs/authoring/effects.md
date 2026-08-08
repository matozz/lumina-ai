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

## Authoring

- 内置 Effect 只读；**Customize** 复制为新的项目 Effect，并分配独立 ID。
- Lab 的 working changes 不立即写 ProjectBundle。Schema、semantic、reference、capability 和 preview compile 都通过后才能 Save。
- 非法更改保留表单内容并显示局部 Diagnostic，Canvas 保持 last-known-good frame。
- 参数 UI 只读取当前 Effect 的 parameter schema，不能按 Effect 名称写分支。
- 默认 speed 以及 Cue override 只接受 0.25×、0.5×、1×、2×、4×、8×。

## Mix 与安全

Effect 写入 typed fixture attributes。Profile 提供默认 HTP/LTP policy，但当多个 Cue Layer 或重叠 CueClip 在同一 fixture 上写同一属性时，作者必须在 Cue Layer 明确选择 MixPolicy；Add、Multiply 和 Mask 永不因重叠自动启用。

高风险 strobe 继续要求显式确认和可信 Catalog metadata。Preview、Save 和 Go Live 都复用 Rust authority validation，不依赖 UI 曾经成功渲染。

## 关键实现

- Contract：`src-tauri/src/document/effect.rs`
- Graph validation/evaluation：`src-tauri/src/document/validation.rs`、`src-tauri/src/engine/effect.rs`
- Catalog validation：`src-tauri/src/document/production_catalog.rs`
- Lab：`src/workspace/effect-lab/`
- Working copy state：`src/stores/authoringDraft.ts`

## 验收

- 内置 Effect 修改不会改变 Catalog 文件或已存在项目资产。
- 参数变化在 Canvas 可见；无效参数不会替换最后有效预览。
- Effect 不包含任何 Stage/TargetSet identity。
- 1,000 fixtures × 多 Effect layers 仍保持确定性并满足 60Hz 预算。

# Arrangements

## 所有权

`ArrangementDocument` 独占 PPQ、TempoMap、TimeSignatureMap、长度、Cue tracks、CueClip、typed automation lanes 和 markers。CueClip 固定引用 Cue，并保存 start、duration、source offset、playback 和 layer overrides。

TargetSet 选择仍属于 Cue Layer。Arrangement 只负责调度 Cue；Clip schema 明确拒绝直接 `target_set_id` 字段。

## 时间

- 权威音乐时间是整数 tick，当前默认 PPQ 为 960。
- starter Arrangement 和所有本地预览默认 128 BPM。
- TempoMap/拍号可以包含多个 point；BPM、bar.beat.tick 和 seconds 都由 cursor 所在 segment 派生。
- 修改 TempoMap 不移动任何 CueClip 或 keyframe tick。

## Timeline 交互

- place、move、resize、duplicate、delete、nudge、source offset 和 automation 都通过 Arrangement transaction。
- Arrangement inspector 提供带确认的删除入口；删除按 Arrangement identity 移除其全部工作修订和时间轴数据，不写入编辑器 Undo，并清空旧的全量快照以防已删除资产被恢复。Project 必须保留至少一个 Arrangement，删除后选择相邻资产。
- Pointer move 只更新 DOM transform/width 和 snap guide；pointer up 最多提交一次 Project command 和一个 Undo entry。
- playhead 用独立 clock subscription 与 DOM ref 更新，不能让整个 Timeline 以 60Hz 重渲染。
- viewport 只挂载可见内容和 overscan，beat grid 使用常数节点/CSS pattern。

### 编辑空间与视口

- Preview 与 Timeline 使用可调整的纵向 splitter。Timeline Focus mode 会压缩 Preview，并可折叠左右辅助区；这些比例、折叠状态、Zoom 和 Snap 只属于 workspace UI cache，不写入 `ProjectBundle`。切换 Focus mode 会保留当前 Zoom/Snap。
- Zoom、Snap 和视觉 Grid 完全独立。Snap 默认 1/2 拍，并可选择 1 小节、1 拍、1/2、1/4 或 1/8 拍；下拉值直接显示 `1 bar`、`1 beat`、`½ beat` 等粒度，不重复 `Snap` 前缀。Grid/Ruler 只按像素密度降低显示密度，不能偷偷改变吸附。
- **Fit** 或 `Cmd/Ctrl+0` 显示完整 Arrangement，包括未放置 CueClip 的空尾。低 Zoom 的短 Clip 使用忠实宽度和紧凑色条，不用固定最小宽度制造遮挡。
- `Cmd/Ctrl+↑/↓` 只缩放 Timeline；鼠标锚点优先，其次使用可见 playhead 或 viewport 中心。现有 132 BPM、多 TempoMap Arrangement 继续按自己的精确文档时间编辑，不被 128 BPM 产品默认值覆盖。

### 选择与批量命令

顶层 `ArrangementTimelineSelection` 同时表达跨 Track 的 CueClip 和跨 lane 的 keyframe，并保存 anchor/primary。空白拖动建立可跨视觉行和 automation lane 的 marquee；Shift 追加，Cmd/Ctrl 单击 toggle。模型级 hit-test 不依赖当前挂载的 DOM 节点，边缘 auto-scroll 通过 `requestAnimationFrame` 更新；Escape、pointercancel 和 lost capture 恢复手势前快照。

批量 Move、Resize、Duplicate、Delete、Copy/Paste 会先完整预验证，再在一个 Project transaction 中提交。Clip 复制会连同以其 `clip_id` 为 target 的 lane/keyframe 一起复制并重映射内部 ID；移动 Clip 同步移动这些 keyframe。只选 keyframe 时可跨 lane 移动或复制，但每条 lane 必须保持严格递增、同 tick 唯一且至少保留一个点。typed internal clipboard 只保证同一 Arrangement，不把 ProjectBundle 或依赖偷渡到系统剪贴板。

### 固定快捷键

| Shortcut                     | 行为                                 |
| ---------------------------- | ------------------------------------ |
| Space                        | 当前 Arrangement Play/Pause          |
| Escape                       | 取消手势/菜单；无活动手势时清除选择  |
| Cmd/Ctrl+Z；Shift+Cmd/Ctrl+Z | Undo / Redo（Windows 也支持 Ctrl+Y） |
| Cmd/Ctrl+C / V / D           | Copy / Paste / 按选择跨度 Duplicate  |
| Delete / Backspace           | 原子删除选择                         |
| ← / →                        | 按当前 Snap 移动选择                 |
| Shift+← / →                  | 按一拍移动选择                       |
| Alt+← / →                    | 调整已选 CueClip 尾端                |
| Cmd/Ctrl+← / →               | 跳到起点 / 时间最靠后的 CueClip 起点 |
| Cmd/Ctrl+↑ / ↓ / 0           | Zoom in / Zoom out / Fit             |
| Cmd/Ctrl+A；Shift+Cmd/Ctrl+A | 选择当前编辑范围全部项目 / 清除选择  |

输入框、`contenteditable` 和当前打开的 Select、Popover、Dialog、Context menu 保留自身键盘行为。弹层关闭后即使焦点返回其 trigger，Space 与 Cmd/Ctrl 方向键也立即恢复 Timeline 语义，不依赖某个组件手动把焦点抢回 Timeline。自动化数值弹窗内的 Delete/Backspace 只编辑当前输入值，不删除 Timeline 选择；Escape 仍关闭弹窗。按键 repeat 不得重复创建 history transaction。

App WebView 默认禁止页面级文本选择、浏览器导航/刷新/打印/保存快捷键，以及非显式元素的原生 HTML drag/drop。输入控件和标记为可复制的 JSON/诊断表面恢复文本选择；只有声明 `draggable` 的资源与声明 drop target 的轨道保留原生拖放。Arrange 快捷键在 window capture 边界先于 closed trigger 的原生行为路由到 Timeline controller。

### Context menu 与 typed automation

- CueClip 右键从该 Clip 精确引用的 Cue/Effect 建立菜单，只显示 `scope: arrangement` 的非结构参数；连续/离散 interpolation 从 parameter schema type 推导。可直接 Add/Reveal automation、Duplicate、Copy 或 Delete。
- 这里创建的是 **单个 CueClip instance** 的 Arrangement automation，typed target 包含 `clip_id`。同一 Cue（例如 FullFlash）在时间轴上出现多次时，每个需要单独变化的 Clip 都要分别添加；若希望所有使用该 Cue 的 Clip 继承同一曲线，应在 Cue Builder 中创建一次 Cue-local automation。
- 新 lane 在右键 context tick 的当前 Snap 格创建一个使用当前有效值的 keyframe；已有 typed target lane 会被定位，并在该格补点或聚焦已有点。创建、定位和拖动都不自动打开编辑器，只有直接点击关键点才打开；这些操作不移动 playhead，也不改变 transport。
- 空白 Cue row 提供 **Place selected Cue here** 与 **Paste here**。Automation row/keyframe 提供 Add、Edit、Interpolation、Copy/Paste、Delete selected 和 Delete lane；离散参数只允许 hold。
- 单 Layer label 使用 `Cue · Parameter`；多 Layer 依次用 TargetSet、Effect 或 `Layer N` 消歧。label 每次从 exact ref 动态解析，不持久化 display string，也不显示 raw Layer ID 或 revision。

### Automation 视觉与颜色

Automation header、row、curve 和 hit geometry 统一为 32 px，关键点使用紧凑的 10 px 圆点。关键点拖动在每个 rAF frame 计算一次 projected integer tick；所有选中点以及前后相邻 segment 共用该 projection，点中心与 curve endpoint 保持对齐。pointerup 只提交一次，取消会恢复 DOM preview。

`hold` 使用“前一点保持到边界、在边界点立即写入新值”的阶梯路径，不需要 `boundary + 1 tick`。既有数据不会被静默重写。

Color automation 使用 typed `color` 值：keyframe 是实际色块，segment 是居中的端点色带，Inspector 同时提供 native color picker 和 `#RRGGBB` 输入。Color 点在纵向中线，不伪装成标量高低曲线；runtime 使用 Lab 插值并将结果写入 `color.rgb`。Production Effect 都声明 standard Color 参数，因此 Context menu 可从具体 CueClip 创建 Color lane；即使该 Effect 默认不写颜色，lane 也是只对该 CueClip 的显式颜色覆盖。

### Track、Layer 与视觉行

- 一个 Arrangement 可以包含多个 CueTrack；每个 CueTrack 保存 CueClip 及附属于该 Track 的 typed automation lanes。当前编辑器将这些轨道统一呈现为 **Cues**，CueClip 始终允许按语义 Layer 重叠并自动装箱到视觉行；历史 `name` / `overlap_policy` 字段会规范化为 `Cues` / `layer`，不再形成编辑行为分支。
- `CueClip.layer` 是保存到文档中的语义 Layer，用于调度顺序和混合优先级；它不等同于固定的屏幕行。
- Timeline 先按语义 Layer 分组。同一 Layer 内不重叠的 CueClip 复用同一视觉行；时间重叠的 CueClip 自动稳定装箱到额外视觉行。不同语义 Layer 始终分行展示。
- 视觉行只防止编辑器中的 CueClip 互相遮挡，不改写 `CueClip.layer`、Track、MixPolicy 或编译结果。Track 标题会同时显示 CueClip 数、语义 Layer 数和实际视觉行数。

## Overlap 与 MixPolicy

Track overlap policy 处理 Clip 的时间占用；fixture 属性的冲突仍由 Cue Layer/Clip layer overrides 的显式 MixPolicy 处理。跨 CueClip 的相交 fixture 和相同 attribute 必须可证明有策略，否则 Arrangement validation fail closed。

Automation target 必须能经 Cue → Layer → Effect parameter 精确解析；同一 Arrangement 中一个 typed target 只允许一条权威 lane。continuous 参数允许曲线插值，discrete 参数强制 hold。

## Authoring transport

Lab、Cues 和 Arrange 共用 Authoring Transport 语义：Play、Pause、Stop、Seek、Loop。页面打开和资产选择不会自动 Play；Lab/Cues 中若当前 session 正在播放，选择另一个 Effect/Cue 会把 cursor、loop 与 playing 状态连续迁移到新 session。切换功能区则执行 Stop 并回到 loop start；未启用 loop 时回到 tick 0。

## 内置多分区示例

Authoring Starter 物化两份可直接打开、播放和复制的 128 BPM 示例；它们引用 Project Template 中的 starter Cue，不把 TargetSet 复制进 CueClip：

- **Quadrant Motion · 128**：一个四 Layer Cue 同时驱动 20×20 Matrix 的四个 10×10 象限。前半段对左上 Ping-Pong 的 speed 做 1×→2× automation；后半段用 Clip layer override 将右上 Column Rain 切到 2×。
- **Four Corner Chase · 128**：四个单 Layer Cue 分时驱动 2×2 网格中的左上、右上、左下、右下四个 10×10 区域。Clip 交错重叠，但区域互不相交；最后一次回到左上并使用 2× speed。示例使用足够密集的空间采样，不为极小 TargetSet 改写 Effect 的作者宽度。

示例既覆盖“同时效果使用一个多 Layer Cue”，也覆盖“分时效果使用多个 Cue”。若把区域改成相交 TargetSet，并让层或 Clip 写相同属性，仍必须显式提供 MixPolicy，Catalog/Project validation 会 fail closed。

## 关键实现

- Contract：`src-tauri/src/document/project.rs`、`src-tauri/src/document/timeline.rs`
- Pure evaluation：`src-tauri/src/engine/timeline.rs`、`src-tauri/src/engine/render.rs`
- Frontend clock：`src/authoring/transport.ts`、`src/authoring/musicalTime.ts`
- Timeline：`src/workspace/arrange/`、`src/panel/`

## 验收

- 多 Cue placement、重叠、resize、automation、Undo/Redo 和 save/reopen 保持 tick 不变。
- 两份多分区示例的所有 Cue/Effect/Stage exact ref 均可解析；四象限各 100 fixtures，四角各 25 fixtures。
- 3/4、4/4、拍号切换、多 TempoMap 和任意 Seek/Replay 结果确定。
- 1,000 CueClip 的 viewport 和 DOM-ref 高频路径满足交互预算。
- 1100×720 与常用大窗口下，默认/Focus mode、library、canvas、timeline、context menu 和 inspector 均可操作且无横向抖动。

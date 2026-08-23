# Arrange 编辑器体验收敛 Goal 规划

> 状态：供下一次 Arrange 编辑器 Goal 直接使用的实施规格，不代表当前功能已经完成；AI Full Arrange Skill 已拆分到独立规划。
>
> 基线：从包含 PR #29 的最新 `main` 开始，最低基线提交为 `c38e155`。创建语义化分支 `codex/arrange-editor-experience`。如果后续 `main` 已前进，以最新 `main` 为准，但不得回退 Authoring V1 已完成的契约、Catalog、Layout Generator、TargetSet、Cue、Arrange、Live 和 transport 行为。

## 1. Goal 指令

一次性完整实施本规划中的全部阶段，不要只输出分析，也不要把其中任一阶段拆成后续 Goal。规划完成前不得将 Goal 标记为 complete。

实施时必须先阅读：

- `AGENTS.md`
- `docs/authoring/README.md`
- `docs/authoring/arrangements.md`
- `docs/authoring/target-sets-and-cues.md`
- `docs/authoring/effects.md`
- `docs/authoring/catalog.md`
- `docs/authoring/schema.md`
- ADR-0003、ADR-0004、ADR-0005、ADR-0010、ADR-0011、ADR-0013

本规划和届时的用户 Prompt 优先于历史文档。每个阶段完成后自审并创建语义化增量提交；不要自动 push 或创建 PR。

## 2. 本次分析的来源和限制

### 2.1 数据来源

本规划以用户当前开发工作区中的 `House 128 Custom @2` 为真实样本。分析过程只读解析 WebView 当前 V1 工作区缓存，没有修改、复制、重置或删除 localStorage/SQLite 数据，也没有把用户缓存直接提交为仓库 fixture。

下一 Goal 若需要可重复测试数据，应通过仓库测试工厂创建一份结构等价、ID 可读的 Golden fixture，或通过应用正式的导入/导出流程取得用户明确导出的资产包；不得直接操作 WebView/localStorage 数据库。

### 2.2 视觉复核限制

本次已重新构建并启动当前 debug app，并多次以完整应用路径、应用名、Bundle ID 和 `/Applications` 安装路径调用 computer-use；在用户要求后又单独重试了一次完整 debug app 路径。computer-use 能识别 Lumina 正在运行，但在读取窗口图像时仍持续返回：

```text
Computer Use server error -10005: failedToCreateImageDestination
```

因此本次没有把“新鲜的 House 128 Custom 窗口截图”冒充为完成证据。现状视觉判断同时参考了以下已保存证据：

- `docs/evidence/authoring-v1-followup-2/01-four-corner-effects-and-packed-rows.jpg`
- `docs/evidence/authoring-v1-followup-2/02-automation-curve-alignment.jpg`
- `docs/evidence/authoring-v1-followup/11-min-window-arrange.jpg`

这些证据显示当前 Arrange 在默认/最小窗口下，上方 Stage 预览、左右侧栏和下方时间轴共同挤压编辑区域。下一 Goal 必须重新使用 computer-use 完成实际 UI 验收并保存新的证据，不能沿用本次工具故障作为豁免。

## 3. `House 128 Custom @2` 基线分析

### 3.1 文档元数据

| 字段            |                当前值 | 结论                                          |
| --------------- | --------------------: | --------------------------------------------- |
| Schema          |                    V1 | 不需要恢复或引入历史 Schema                   |
| Arrangement ID  |    `house-128-custom` | 当前选择的是 revision 2                       |
| 名称            |    `House 128 Custom` | 名称中的 128 与实际 BPM 不一致                |
| BPM             |                   132 | 产品默认仍为 128；此 Arrangement 必须保持 132 |
| PPQ             |                   960 | 所有编辑继续使用整数 tick                     |
| 拍号            |                   4/4 | 每小节 3840 ticks                             |
| 总长度          |          245760 ticks | 256 拍，即 64 小节                            |
| 已编排终点      |          107520 ticks | 第 28 小节结束/第 29 小节起点                 |
| 未使用尾部      |          138240 ticks | 36 小节，占总长度 56.25%                      |
| CueTrack        | 1 条：`cues` / `Cues` | Schema 支持多 Track，但当前样本只有一条       |
| CueClip         |                 39 个 | 全部位于语义 `layer: 0`                       |
| Automation lane |                  4 条 | 2 条 Speed、2 条 Intensity                    |
| 实际重叠        |                  0 对 | 当前视觉上只需一条 Cue 子行                   |

### 3.2 Cue 角色

| Cue              | Effect                     | TargetSet | 当前用途                        |
| ---------------- | -------------------------- | --------- | ------------------------------- |
| `FullFade`       | Fade / Crossfade           | all       | 长铺底                          |
| `FullBreath`     | Blackout-safe Transition   | all       | buildup 主体及速度/强度变化     |
| `FullRain`       | Seeded Column Rain         | all       | 上升、转场和 fill               |
| `FullFlash`      | Color Accent               | all       | 一拍平滑 drop accent            |
| `FullBloom`      | Center-out / Edge-in Bloom | all       | 与 Accent 交替形成 drop pattern |
| `CenterPingPong` | Column Ping-Pong           | center    | 中心区域 fill                   |
| `CenterPulse`    | Column Center Ripple       | center    | 半拍中心波纹 accent             |
| `EdgePulse`      | Breathe                    | edges     | 半拍边缘回应                    |
| `Gentle Breathe` | Breathe                    | all       | 短暂 recovery                   |

TargetSet 仍然属于 Cue Layer。下一 Goal 不得在 CueClip 上新增 TargetSet 选择或覆盖概念。

### 3.3 音乐结构

| 小节/拍位                       | 内容                               |      数量/时长 | 结构含义                                |
| ------------------------------- | ---------------------------------- | -------------: | --------------------------------------- |
| 第 1–8 小节                     | `FullFade`                         |         8 小节 | Foundation / Intro                      |
| 第 9–16 小节                    | `FullBreath`                       |         8 小节 | Buildup，带阶梯 Speed 和 Intensity 上升 |
| 第 17–18 小节                   | `FullRain`                         |         2 小节 | Transition，Intensity 由 0 到 1         |
| 第 19–22 小节                   | `FullBloom` / `FullFlash` 每拍交替 | 16 个一拍 Clip | Drop A                                  |
| 第 23 小节至第 24 小节第 3 拍   | `FullRain`                         |           6 拍 | Fill / acceleration                     |
| 第 24 小节第 3 拍               | `CenterPingPong`                   |           1 拍 | 中心 fill                               |
| 第 24 小节第 4 拍前半拍         | `CenterPulse`                      |         1/2 拍 | 中心 accent                             |
| 第 24 小节第 4 拍后半拍         | `EdgePulse`                        |         1/2 拍 | 边缘回应                                |
| 第 25 小节第 1 拍               | `Gentle Breathe`                   |           1 拍 | Recovery                                |
| 第 25 小节第 2 拍至第 28 小节末 | `FullFlash` / `FullBloom` 每拍交替 | 15 个一拍 Clip | Drop B                                  |
| 第 29–64 小节                   | 空                                 |        36 小节 | 当前是未显式表达的空尾段                |

39 个 Clip 中：

- 33 个是一拍；
- 2 个是半拍；
- 只有 4 个长于一拍；
- 即 35/39（约 89.7%）需要密集的短 Clip 编辑。

大量 ID 已演变为 `copy`、`copy-2`、`copy-copy` 等后缀。这不是数据错误，但准确说明目前通过逐个 Duplicate 生产重复 pattern 的成本过高，也不利于调试和 Golden review。

### 3.4 自动化结构

| 目标                        | 当前关键点                                                                                                  | 意图               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| `FullBreath` Speed          | 第 9 小节 0.5；第 13 小节仍为 0.5，之后 1 tick 跳到 1；第 15 小节仍为 1，之后 1 tick 跳到 2；第 17 小节为 2 | Buildup 阶梯加速   |
| `FullBreath` Intensity      | 第 13 小节 0.7；第 16 小节 1；第 17 小节保持 1                                                              | Buildup 后半段增强 |
| 第一段 `FullRain` Intensity | 第 17 小节 0，至第 19 小节 1                                                                                | 两小节上升         |
| 第二段 `FullRain` Speed     | 第 23 小节 0.5；第 24 小节仍为 0.5，之后 1 tick 跳到 1；第 24 小节第 3 拍保持 1                             | Fill 加速          |

相邻的 `boundary` / `boundary + 1 tick` 关键点是在手工模拟瞬时阶梯。下一 Goal 不应迁移或偷偷改写现有用户数据，但新的编辑入口应支持使用 `hold` interpolation 表达边界跳变，避免迫使用户继续制造“一 tick 兼容点”。

### 3.5 当前 Track、Layer 和视觉行的含义

下一 Goal 的 UI 和文档必须明确区分四个概念：

| 概念            | 归属        | 当前 House 状态          | 语义                                                |
| --------------- | ----------- | ------------------------ | --------------------------------------------------- |
| CueTrack        | Arrangement | 1 条 `Cues`              | 保存 CueClips 和 automation lanes；Schema 允许多条  |
| CueClip `layer` | CueClip     | 全部为 0                 | 运行时语义混合层级，不是视觉行号                    |
| Visual subrow   | UI 派生     | 当前只需 1 行            | 同一语义 layer 的 Clip 重叠时自动打包，不能写回文档 |
| Cue Layer       | Cue         | 每个样本 Cue 当前为 1 层 | 绑定 Effect、TargetSet、参数和 MixPolicy            |

现有 `cueTrackVisualLayout()` 已会在同一语义 layer 内为重叠 Clip 自动增加视觉子行。下一 Goal 必须保留该行为；框选、移动和复制不能为了“看起来不重叠”而偷偷修改 CueClip 的语义 `layer`。

## 4. 已确认的根因

### 4.1 Zoom 与 Snap 被错误耦合

当前 `src/panel/timelineGeometry.ts` 根据 `beatWidth` 隐式计算 `snapTicks`：

- `beatWidth >= 96`：1/4 拍；
- `beatWidth >= 48`：1/2 拍；
- 更小：1 拍。

这会导致“为了看全局而缩小”同时改变编辑吸附精度，直接违背本 Goal 的要求。当前最小 `beatWidth` 为 24 px/beat；64 小节共有 256 拍，即使缩到最小仍需 6144 px，无法形成全局视角。

必须把以下三件事彻底分离：

1. 时间轴缩放比例 `beatWidth`；
2. 编辑吸附 `snapTicks`；
3. 视觉网格/标尺标签密度。

视觉网格可以随缩放自适应，Snap 不可以随缩放偷偷变化。

### 4.2 Cue Layer ID 同时承担内部身份和历史语义

当前 `automationOptions()` 和 `resolveAutomationOption()` 使用：

```ts
`${cue.name} · ${layer.id} · ${definition.name}`;
```

因此 `FullBreath · corner-bottom-left · Intensity` 中：

- `FullBreath` 是动态解析的 Cue 名；
- `corner-bottom-left` 不是未更新的 Cue 名，而是持久化、不可直接编辑的 `CueLayer.id`；
- `Intensity` 是参数显示名。

样本中还有更明显的历史 ID：`FullBloom` 和 `CenterPulse` 的 Cue Layer ID 仍为 `builtin.transition.fade-crossfade-layer`，但 Effect 已经不是 Fade。这证明把业务语义编码进不可编辑 ID 会随着 Cue 演进产生误导。

自动化 target 仍必须精确保存 `clip_id + layer_id + parameter_id`。新的 Cue Layer ID 应改为创建时生成一次、之后稳定保留的无语义 opaque ID，例如 `layer_<random-id>`；built-in 声明中的 opaque ID 生成后固定提交到源码。普通 UI 不提供修改入口，也不在名称、Tooltip、aria-label 或常规 Inspector 中展示它。

既有 layer ID 不能为了美观被盲目重生，否则会切断 Arrangement automation target。修复顺序应是：

1. 彻底停止普通 UI 外露；
2. 新建/复制 Layer 使用 opaque ID；
3. 编辑 Cue 名、Effect、TargetSet 时保留该 Layer 的稳定 ID；
4. 复制 Layer 时生成新 ID；
5. 如果确实迁移某个内置或项目 Cue revision，必须在同一事务内精确重映射所有引用并通过语义验证，不能做宽泛字符串替换。

### 4.3 自动化点拖动时只有点在预览

`ArrangementAutomationLane` 在 pointer move 时只对关键点按钮设置 DOM transform。`AutomationCurveSegment` 仍按已提交的 `lane.keyframes` 渲染，所以拖动过程中连接线留在旧位置，直到 pointerup 提交后才跳到新位置。

修复必须让关键点和所有受影响的相邻线段共用同一份临时投影，同时保持：

- Pointer move 使用 refs + `requestAnimationFrame`；
- 拖动过程中不提交 Project/Zustand/history；
- pointerup 只提交一次事务；
- Escape、pointercancel、lost capture 完整回滚预览。

### 4.4 自动化创建入口是全局长列表

当前 `ArrangementAutomationMenu` 位于 Track header，只展示一个按文本排序的全局参数列表。用户必须先从大量“Cue · 内部 layer ID · 参数”中定位目标，而且创建位置使用 playhead，不是右键所在 Cue 和 tick。

另外，当前 `automationOptions()` 遍历所有 Effect 参数，没有在 UI 选项层显式排除 `automation: disabled` 或非 `cue_override` 参数。下一 Goal 必须以正式契约过滤可自动化目标，不能只靠后端报错兜底。

### 4.5 Clip 和关键点选择状态彼此割裂

当前：

- Arrange 顶层只有 `selectedClipId`，只能选择一个 Clip；
- 每条 automation lane 各自维护本地 `selectedIds`；
- CueClip 只能单个移动、缩放、删除、Duplicate；
- Arrange automation lane 没有框选；
- 旧 Timeline 的 `AutomationLaneBlock` 有一份局部 marquee 实现，但不能直接复制出第三套交互分支。

下一 Goal 应建立统一的选择模型和手势控制器，并复用/收敛可用的几何逻辑。

### 4.6 颜色类型存在，但当前内置资产没有可达入口

当前 V1 Schema、Inspector、编译器和引擎已经支持 `ParameterValueDSL.color`：

- Inspector 可使用 `<input type="color">`；
- continuous color automation 使用 Lab 色彩插值；
- render path 已支持标准 `color` 参数覆盖 `color.rgb` 输出。

但当前主要内置颜色 Effect 暴露的是结构性 `color_stops` Palette，且它们是 `effect_only + automation: disabled`。因此 Arrange 中实际上没有可选择的标准 `color` 参数，用户看不到有效颜色自动化入口。

本 Goal 应落地“可自动化的单色覆盖”，而不是把结构性 `color_stops` 强行变成运行时自动化。

## 5. 目标体验

完成后，Arrange 应是一套“轻量 DAW 编排器”，而不是完整音频 DAW：

- 可以在 64 小节乃至更长 Arrangement 上快速切换全局与细节视角；
- Space 在编辑器范围内稳定控制播放/暂停；
- 右键某个 CueClip 即可为该 Clip 的某个 Cue Layer 参数创建/定位自动化；
- 可以框选一组 Clip/关键点，并一次复制、移动、删除、撤销；
- 重复 drop pattern 不再依赖几十次单 Clip Duplicate；
- 自动化名称只展示用户能理解和触达的名称；
- 拖动关键点时曲线实时保持连接；
- 可以创建和自动化单色覆盖；
- 内部 Layer ID 不再把历史方位、Effect 或其他业务含义泄漏到普通界面；
- 保持已有 Cue Layer/TargetSet、exact ref、MixPolicy 和 transport 模型不变。

## 6. 完整实施范围

### 6.1 编辑器布局与 Focus mode

1. 使用项目已安装的 shadcn `Resizable` / `react-resizable-panels` 收敛 Arrange 中 Preview 与 Timeline 的垂直分配。
2. 增加明确的 Timeline focus mode：可折叠/压缩上方 Preview，并允许折叠左右辅助区，让时间轴获得主要画布空间。
3. Focus mode 和 splitter 比例属于 workspace UI 偏好，只能保存在工作区 UI cache，不能写入 `ProjectBundle`。
4. 在 1100×720 下：
   - 默认模式仍能操作 transport、Cue Library、Timeline 和 Inspector；
   - Timeline 至少保留可用的编辑高度；
   - Focus mode 可让中心时间轴占据主要宽高；
   - 不出现横向宽度抖动、遮挡、悬浮菜单越界或无法点击的控件。
5. 在全局缩放下，CueClip 的可见宽度必须忠实反映时间范围。不得继续用固定 20 px 最小可见宽度把密集一拍 Clip 画成相互遮盖的大块；当像素不足时隐藏文字、渲染为紧凑色条，并通过模型级 hit-test/适当 hit slop 保持可选择性。

### 6.2 固定快捷键与焦点规则

建立集中式 shortcut controller，并在工具栏提供可发现的 Shortcuts 帮助。Mac 使用 Command，其他平台使用 Ctrl 等价键。

| 快捷键                                        | 行为                                                   |
| --------------------------------------------- | ------------------------------------------------------ |
| Space                                         | 当前 Arrangement 播放/暂停                             |
| Escape                                        | 取消当前拖动/框选/菜单；无活动手势时清除选择           |
| Cmd/Ctrl + Z                                  | Undo                                                   |
| Shift + Cmd/Ctrl + Z；Windows 可保留 Ctrl + Y | Redo                                                   |
| Cmd/Ctrl + C                                  | 复制当前选择                                           |
| Cmd/Ctrl + V                                  | 在 playhead 或最近 context tick 粘贴                   |
| Cmd/Ctrl + D                                  | 按选择跨度进行一次可重复 Duplicate                     |
| Delete / Backspace                            | 原子删除当前选择                                       |
| Arrow Left / Right                            | 按当前 Snap 移动选择                                   |
| Shift + Arrow Left / Right                    | 按一拍移动选择                                         |
| Alt + Arrow Left / Right                      | 对已选 CueClip 的尾端做 resize；不适用于混合关键点选择 |
| Cmd/Ctrl + Arrow Up                           | 放大时间轴                                             |
| Cmd/Ctrl + Arrow Down                         | 缩小时间轴，最终可到全局视角                           |
| Cmd/Ctrl + 0                                  | Fit entire Arrangement                                 |
| Cmd/Ctrl + A                                  | 选择当前编辑范围内的全部项目；范围必须在 UI 中可解释   |
| Shift + Cmd/Ctrl + A                          | 清除选择                                               |

快捷键规则：

- 输入框、Select、Popover、Dialog、菜单和任何 `contenteditable` 获得焦点时，不得劫持 Space、Delete、方向键和复制粘贴；
- Space 只切换 transport，不触发页面滚动；
- 按键不得因为 `event.repeat` 创建多次 history 事务；连续 nudge 可以逐次提交，但每次按键只产生一个可解释的事务；
- 打开页面、切换 workspace 或选择 Arrangement 都不得自动播放；
- 不回归现有 Lab/Cues 行为：已播放时在 Lab/Cues 内切换 Effect/Cue 不应中断，只有切换功能 workspace 才停止并回到起点。

### 6.3 Zoom、Snap 和 Grid 分离

1. 修改 `TimelineGeometry`，让 `snapTicks` 成为显式输入或独立状态；删除“从 beatWidth 推导 Snap”的隐式语义。
2. 默认 Snap 保持 1/2 拍，以兼容当前 Arrange 默认 48 px/beat 的实际编辑精度和半拍 accent。
3. 工具栏提供独立 Snap 选择，至少支持：1 小节、1 拍、1/2、1/4、1/8 拍；所有选项必须转换为 PPQ 下的整数 tick。
4. Zoom 使用连续/乘法步进，不再受 24 px/beat 的高下限限制。动态最小值应允许当前 Arrangement 在当前 viewport 中完整 Fit。
5. `Cmd/Ctrl + Up/Down` 只改变 Zoom；快捷键前后工具栏 `SNAP` 值和实际拖动吸附必须完全一致。
6. Zoom 锚点优先使用鼠标所在 tick；键盘没有有效指针锚点时使用可见 playhead，否则使用 viewport 中心，避免缩放后视图无故跳走。
7. Grid 和 Ruler 标签可以根据像素密度显示拍、小节、4/8/16 小节级刻度，但这只是视觉降采样，不得改变 Snap。
8. 提供显式 Fit 按钮，与 `Cmd/Ctrl + 0` 等价。

### 6.4 统一选择模型与框选

建立顶层 `ArrangementTimelineSelection`，至少能表达：

- 多个 CueClip（带 Track ID）；
- 多条 lane 中的多个 automation keyframe（带 Track/Lane ID）；
- 当前 selection anchor / primary item；
- marquee 开始前的 selection snapshot。

交互要求：

1. 在空白时间轴按下左键并拖动出现 marquee。
2. CueClip 以可见时间矩形与框的相交关系判断；关键点以中心点落入框内判断。
3. 框可跨 Cue visual subrow 和 automation lane；选择计算基于时间/行几何模型，而不是只查询当前挂载的 DOM 节点。
4. Shift 框选为追加；Cmd/Ctrl 单击为 toggle；普通单击空白清除选择。
5. 拖到 viewport 边缘时支持受控的横向/纵向 auto-scroll；更新走 rAF。
6. Escape 或 pointercancel 恢复框选开始前的 selection。
7. 选择视觉在低 Zoom、重叠自动分行和虚拟化下保持稳定。
8. 不引入 React drag-and-drop library；继续使用 native Pointer Events、DOM refs 和 `requestAnimationFrame`。

### 6.5 批量复制、移动、Duplicate 和删除

所有批量操作必须先完整预验证，再用一个 Project history transaction 原子提交；不能部分成功。

#### CueClip 规则

- 移动一组 Clip 时保持它们的相对 tick、Track、语义 layer 和 duration。
- `overlap_policy: reject` 时任何冲突都拒绝整组操作；`layer` 时允许语义重叠并由 visual subrow 自动打包。
- 不允许移出 Arrangement；错误提示给出可操作的最小/最大边界。
- 移动 CueClip 默认同时移动所有以该 `clip_id` 为 target 的 automation keyframes。
- Duplicate/Copy/Paste CueClip 时，同时复制其关联 automation lane，重映射新 `clip_id`、lane ID 和 keyframe ID，并保持相对时间。
- 删除 CueClip 时继续删除其关联 lane；批量删除只产生一条 Undo。

#### Automation 规则

- 只选择关键点而未选择其 Clip 时，只移动/复制这些关键点。
- 支持跨多条 lane 的水平批量移动；每条 lane 都必须保持严格递增、同 tick 唯一。
- 删除后每条 lane 至少保留一个关键点；若选择包含某 lane 的全部关键点，UI 必须提示用户删除 lane 或保留一个点，不能生成无效文档。

#### Clipboard 规则

- 使用 typed internal clipboard payload，不把 raw ProjectBundle 或内部缓存地址暴露给系统剪贴板。
- 本 Goal 至少保证同一 Arrangement 内复制/粘贴；跨项目仍走正式资产包导入/导出，不在 clipboard 中偷渡依赖。
- Paste 以 playhead 或最近 context tick 为 anchor，保持选择内部相对偏移。
- 新 CueClip/lane/keyframe ID 必须稳定、可读、无冲突；批量粘贴不再制造无限 `copy-copy-2` 链。Cue Layer identity 则遵循独立的 opaque ID 规则。
- `Cmd/Ctrl + D` 默认把选择复制到其时间跨度之后，使一拍/一小节 pattern 可以连续重复。

本 Goal 不要求 CueClip 在不同 Track 之间垂直拖动，也不要求新增完整 Track 管理器；但所有命令必须保留 Track ID，不能把未来多 Track 文档拍扁为一条。

### 6.6 Context menu 与直接自动化

使用 shadcn/Base UI `ContextMenu`。实施前执行项目约定的 `pnpm dlx shadcn@latest ... --dry-run/--diff`，不得手写一套与设计系统脱节的浮层，也不得无确认覆盖已有 UI 组件。

#### CueClip 右键

至少包含：

- Add automation → Cue Layer（仅多层时显示分组）→ 可自动化参数；
- Reveal existing automation；
- Duplicate；
- Copy；
- Delete。

参数列表必须：

- 只来自右键 Clip 精确引用的 Cue/Effect；
- 只显示 `automation !== disabled`；
- 只显示允许 Cue/Arrangement override 的参数；
- 使用用户可读 display label；
- 对多层 Cue 以 TargetSet display name、Effect name 或稳定的 `Layer N` 消歧，绝不默认显示 raw `layer.id`。

选择参数时：

- 如果 target lane 不存在：创建该 lane，并在右键 tick 创建一个使用当前有效值的 keyframe；不再默认创建“从 playhead 开始、任意延伸四拍”的无关范围；
- 如果 target lane 已存在：展开/滚动定位该 lane，并在该 tick 没有点时新增点；已有点时选中并打开 inspector；
- 全局最多一条相同 typed target lane，不创建重复 target；
- 创建/定位行为不得改变 playhead 或 transport，除非用户明确选择 Set playhead。

#### 空白 Cue row 右键

至少包含 Place selected Cue here、Paste here。放置位置使用 context tick 并按当前 Snap 处理。

#### Automation row / keyframe 右键

至少包含 Add keyframe here、Edit value、Interpolation、Copy/Paste keyframes、Delete selected、Delete lane。离散参数只允许 hold。

### 6.7 自动化展示与交互修复

#### 动态名称

展示 resolver 使用以下规则：

1. 单 Layer Cue：`Cue Name · Parameter`，例如 `FullBreath · Intensity`。
2. 多 Layer Cue：优先 `Cue Name · TargetSet Name · Parameter`。
3. TargetSet 仍无法消歧时加入 Effect Name；仍冲突时使用用户可理解的 `Layer 1/2/...`。
4. 正常 UI 不显示 raw `layer.id`、revision 或内部精确引用；只有显式的开发者诊断详情可以显示。
5. 标签每次从精确引用的当前文档内容解析，不持久化 display string。

增加回归测试：Cue 名、Effect、TargetSet display name 更新后，标签同步变化；自动化 target 的内部 ID 不被改写。

#### Opaque Cue Layer ID

- 新建 Cue Layer 时生成碰撞概率足够低的 opaque ID，例如 `layer_<base32-random>`；
- ID 只用于引用身份，不编码 corner、TargetSet、Effect、顺序或用户名称；
- 修改 Cue Layer 内容时保留 ID，复制 Layer 时生成新 ID；
- built-in Cue 的 opaque ID 生成一次后写入声明式 Catalog，之后保持稳定；
- 普通 UI、Tooltip、辅助功能名称、导出摘要和自动化 display label 均不展示该 ID；
- 导出的正式 JSON 仍需包含 ID，因为它是精确引用的一部分；
- 不为隐藏 ID 增加普通用户编辑入口，避免用户无意切断引用；
- 既有语义 ID 默认保留但隐藏。只有在创建新 Cue revision 且能原子重映射所有 target 时才允许替换。

#### 行高和密度

- 将 Arrange automation lane 从当前 40 px 收敛到约 32 px，并同步 header、curve、hit area 和虚拟化几何；
- 关键点视觉尺寸适当缩小，但选中 ring 和键盘焦点必须清晰；
- 长标签使用 truncate + Tooltip，不能把 Timeline 推宽；
- 在 1100×720 下至少能同时看到多条 lane 并完成关键点操作。

#### 拖动投影

- 在每一帧计算选中 keyframe 的 projected tick；
- 所有受影响关键点和前后相邻 curve segment 使用同一 projection；
- 线段端点必须始终落在关键点中心，允许的视觉误差不超过 0.5 CSS px；
- 多点拖动、Zoom、横向滚动和 auto-scroll 下仍成立；
- 提交时只写入整数 tick，不能保存浮点兼容值。

#### Step 表达

为 hold interpolation 提供清晰的菜单和曲线形态。编辑器应允许用“前一关键点 hold 到边界、边界关键点写入新值”的方式表达阶梯，不再迫使用户手工制造 `boundary + 1 tick`；现有用户数据不被静默改写。

### 6.8 颜色调整和颜色自动化

利用当前已存在的 `color` typed parameter、Lab 插值和 render override 能力，新增正式可达的单色覆盖：

1. 为确实适合单色覆盖的 built-in Effect 创建新 revision，并声明标准参数：
   - `id: color`；
   - `value_type: color`；
   - `unit/ui_hint: color`；
   - `override_policy: cue_override`；
   - `automation: continuous`；
   - 完整 required/help/safe_fallback/advanced 元数据。
2. 至少覆盖 `House 128 Custom` 参考链路中用于 drop、bloom/breathe 或 transition 的合理 Effect，使用户能在 Lab 调整、在 Cue Layer override，并在 Arrange 创建 Color lane。
3. 不得原地修改 built-in revision；同步更新必要的 built-in Cue exact refs、Catalog Golden 和语义验证。
4. `color` 的语义是对该 Effect 输出的单色覆盖；结构性 Palette 仍在 Lab 中编辑。
5. `color_stops` 在本 Goal 中继续保持 `effect_only + automation: disabled`，不实现运行时 Palette stop 数量变化或 stop-by-stop 插值。
6. Color lane 不使用标量高低曲线误导用户：
   - keyframe 显示实际色块；
   - segment 显示端点色彩和插值方向的 gradient/色带；
   - 关键点仍放在行的垂直中线；
   - inspector 提供可操作的 color input 和 `#RRGGBB` 值。
7. Context menu 只有在 Effect 正式声明 automatable `color` 时才显示 Color；不做隐藏的万能颜色覆盖。
8. Rust 测试验证 Arrangement Color automation 经编译后使用 Lab 插值并实际写入 `color.rgb`。

## 7. 建议的代码收敛边界

避免把现有 `ArrangementTimeline.tsx` 继续膨胀。建议按职责拆分，最终文件名可根据实现调整：

```text
src/workspace/arrange/
├── ArrangementTimeline.tsx
└── timeline/
    ├── arrangementTimelineModel.ts
    ├── arrangementBulkCommands.ts
    ├── arrangementClipboard.ts
    ├── automationPresentation.ts
    ├── cueLayerIdentity.ts
    ├── ArrangementTimelineContextMenu.tsx
    ├── ArrangementMarquee.tsx
    ├── useArrangementEditorShortcuts.ts
    ├── useArrangementSelection.ts
    └── useArrangementTimelineViewport.ts
```

关键原则：

- model 命令保持纯函数、易测、先验证后变更；
- UI gesture 只维护临时 projection，gesture boundary 才提交 store/history；
- 自动化 display resolver 与 exact target resolver 分离；
- Cue Layer identity 生成、保留和复制规则只有一份；
- 新组件使用 `cn()` 和语义色；
- ContextMenu 从 shadcn registry 正式加入，`Resizable` 优先复用已安装组件；
- 不新增 timeline drag-and-drop library。

## 8. 分阶段实施与建议提交

### Phase 0：冻结基线与 Golden

- 用测试工厂建立结构等价的 House reference；
- 记录 39 Clip、4 lane、35 个短 Clip 和 28/64 小节编辑负担；
- 为当前 shortcut、zoom/snap、label 和 curve drag 写失败测试；
- 不复制用户 cache 原文件。

建议提交：`test(arrange): capture house editing baseline`

### Phase 1：编辑器空间、快捷键、Zoom/Snap

- Resizable + Timeline focus mode；
- 集中快捷键；
- Zoom/Snap/Grid 三分离；
- Fit entire Arrangement；
- 低 Zoom Clip 和 Ruler rendering。

建议提交：`feat(arrange): add editor focus and independent timeline zoom`

### Phase 2：统一选择与批量命令

- 顶层 selection；
- marquee + auto-scroll；
- bulk move/copy/paste/duplicate/delete；
- 关联 automation remap；
- 单事务 Undo/Redo。

建议提交：`feat(arrange): add marquee and bulk timeline editing`

### Phase 3：Context menu 与直接自动化

- 引入 shadcn ContextMenu；
- Cue/row/lane/keyframe 上下文动作；
- typed parameter 过滤；
- 在 context tick 创建/定位 lane 和 keyframe。

建议提交：`feat(arrange): create typed automation from timeline context`

### Phase 4：自动化视觉、Layer identity 和颜色

- 用户可读动态 label；
- 新建/复制 Layer 使用稳定 opaque ID；普通 UI 完全隐藏 raw ID；
- 32 px lane；
- 点/线共享 drag projection；
- hold step UX；
- built-in color parameter revisions、Catalog Golden、Color lane。

建议拆成两个语义提交：

- `fix(arrange): align automation presentation and drag preview`
- `feat(authoring): add automatable color overrides`

### Phase 5：文档、全量验证和视觉验收

- 更新 `docs/authoring/arrangements.md`、`effects.md`、`catalog.md` 和 `README.md` 必要链接；
- 新增快捷键、选择、context menu、opaque Layer ID 和颜色文档；
- 完整测试、build、Rust tests；
- computer-use 主链路和证据；
- 自审历史引用、debug log、无效分支、生成 diff。

建议提交：`docs(authoring): document arrange editor interactions`

## 9. 测试要求

### 9.1 Geometry 与快捷键

- Zoom 改变时 `snapTicks` 保持不变；
- 1/2 Snap 在极小和极大 Zoom 下结果相同；
- Fit 64 小节后首尾都在 viewport；
- Zoom 锚点前后 tick 位置稳定；
- Grid density 可变化但不影响 Snap；
- Space 在 Timeline 播放/暂停，在 Input/Popover/Dialog 内不被劫持；
- Cmd/Ctrl+Up/Down 不修改项目数据和 history。

### 9.2 Selection 与批量命令

- Marquee 命中 Clip rect 和 keyframe center；
- Shift add、Cmd toggle、Escape rollback；
- 跨 visual subrow/lane、滚动和虚拟化；
- 多 Clip move 保持相对偏移；
- Reject overlap/range 时整组不变；
- Layer overlap 自动视觉分行但语义 layer 不变；
- Copy/Paste/Duplicate remap Clip、lane、keyframe IDs 和 targets；
- 移动 Clip 同步移动关联 keyframes；
- Bulk delete/undo 只产生一个事务；
- 至少保留一个 keyframe 的约束。

### 9.3 Context menu、label 与 Layer identity

- 右键 Clip 只列出该 Cue 的合法自动化参数；
- disabled/effect_only/locked 参数不会出现；
- 不存在 lane 时在 context tick 创建；已存在时定位/选中；
- 不创建重复 typed target；
- 单 Layer 不显示 raw ID；多 Layer 使用 TargetSet/Effect/Layer N 消歧；
- Cue/TargetSet/Effect display name 更新后 label 动态更新，内部 target 不变；
- 新建 Layer ID 无业务语义且同一 Cue 内唯一；
- 编辑 Layer 保留 ID，复制 Layer 获得新 ID；
- built-in opaque ID 在重复构建中稳定；
- normal UI、Tooltip 和 aria-label 均不出现 raw ID；
- 任何显式 ID 重映射都同步更新 automation target，并可完整 Undo。

### 9.4 Automation visual

- 单点和多点 drag 中，受影响 curve endpoint 与点中心误差 ≤ 0.5 CSS px；
- 横向滚动、Zoom、auto-scroll 中仍对齐；
- pointercancel/Escape 回滚；pointerup 只提交一次；
- 32 px header/row/curve 几何一致；
- hold 在边界正确跳变，不需要 `+1 tick`。

### 9.5 Color

- Catalog Schema/semantic/Golden 验证；
- Cue override 和 Arrangement target 都解析 standard `color`；
- Color inspector round-trip `#RRGGBB`；
- Lab 插值的中间帧和 endpoint；
- render path 实际写入 `color.rgb`；
- 不支持 Color 的 Effect 不显示入口；
- `color_stops` 仍不可自动化。

### 9.6 性能与回归

- 保留并扩展 1000 Clip virtualization 测试；
- 增加密集短 Clip、多 visual subrow 和多 automation lane 场景；
- pointer move 期间不产生 store/history 高频写入；
- Stage → Lab → Cues → Arrange → Live 主链路不回归；
- 128 BPM 产品默认值不变；现有 132 BPM Arrangement 仍能精确播放和编辑。

## 10. 必跑验证

完成实现后至少运行：

```bash
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm check:all
```

如果修改 Schema、生成类型或 Catalog，还必须检查：

```bash
pnpm schema:check
pnpm catalog:check
```

审阅所有 generated Schema/TypeScript 和 Catalog Golden diff。修复本次引入的所有 error 和 warning；已知 Vite chunk size warning 可以在最终汇报中单独说明。

## 11. Computer-use 视觉验收

使用正式导入/测试工厂创建一个可丢弃的 `House 128 Custom` 结构副本，不直接改用户 cache。分别在 1100×720 和常用大窗口（建议 1440×900 或更大）走查并保存证据到：

```text
docs/evidence/arrange-editor-experience/
```

必须完成：

1. 打开 Arrange，确认默认不播放。
2. Space 播放/暂停；输入框内 Space 不触发 transport。
3. 连续 Cmd+Down 缩到可看到完整 64 小节；SNAP 始终保持 1/2 拍；Cmd+Up 放大后锚点不跳。
4. 切换 Focus mode，验证 Preview、Cue Library、Inspector 和 Timeline 的折叠/恢复无宽度抖动。
5. 右键 `FullBreath` 对应 Clip，在 context tick 创建或定位 Intensity 自动化，不经过全局长列表。
6. 框选 Drop A 的 16 个一拍 Clip，完成 Copy/Paste、移动、Delete、Undo；相对节奏保持不变。
7. 框选跨 lane 关键点并移动；拖动过程中线和点实时相连。
8. 移动一个带自动化的 Clip，确认关联 lane/keyframes 同步移动。
9. 检查 label 显示 `FullBreath · Intensity`，普通 UI 不再出现 `corner-bottom-left` 或 `builtin.transition.fade-crossfade-layer`。
10. 创建 Color lane，修改两个颜色点并播放，Stage 预览可见颜色变化。
11. 创建并复制 Cue Layer 后回到 Arrange，确认所有 display label 只使用 Cue、TargetSet、Effect 或 `Layer N`，无 raw ID 外露。
12. 播放 `House 128 Custom` 已有的 buildup、drop 和 fill，确认批量编辑和颜色变更实际可见；选择资产本身不自动播放。
13. 切到 Live 验证编译和播放，再返回 Arrange，编辑状态和 transport 规则合理。

至少保存以下截图：

- 64 小节全局 Fit；
- Timeline focus mode；
- CueClip context automation menu；
- Drop pattern marquee selection；
- 多选 Copy/Paste 后结果；
- 自动化点拖动中的点线对齐；
- 紧凑 automation lanes 和可读标签；
- Color lane 与 Stage 颜色结果；
- 多 Layer Cue 的用户可读标签与 Context menu；
- 1100×720 最小窗口；
- Live 播放编辑后的 Arrangement。

证据 README 记录窗口尺寸、Arrangement ref、BPM、Snap、执行步骤、预期和实际结果。

## 12. 明确的非目标

- 不做音频导入、waveform、onset/beat/drop 自动分析；
- 不做完整 MIDI/音频 Track、Mixer、插件或录音 DAW；
- 不在 CueClip 中加入 TargetSet 选择；
- 不新增 React drag-and-drop timeline library；
- 不把 `color_stops` 变成运行时自动化；
- 不实现自由 Bézier handle 编辑；
- 不实现完整 Track 创建/删除/重排和跨 Track 垂直拖动；
- 不覆盖 built-in、用户现有 Arrangement 或输入资产包；
- 不改变 Stage/Lab/Cues/Arrange 默认 128 BPM 基线；
- 不把内部 Schema、revision、raw layer ID 暴露到普通 UI；
- 不为 opaque Layer ID 增加普通用户编辑入口；
- 不自动补齐或重写 `House 128 Custom` 的 36 小节空尾；
- 本 Goal 不创建 AI Full Arrange Skill，不实现固定 pattern Generator、Rust Generator、Recipe、CLI 或其他生成通信机制；相关探索见独立规划 `docs/plans/ai-full-arrange-skill.md`。

## 13. 最终自审与汇报

完成前逐项检查：

- [x] 所有规划阶段均已实施，无“后续再做”占位；
- [x] `House 128 Custom` 暴露的 Zoom/Snap、短 Clip 批量编辑、名称和点线问题均有验收；64 小节空尾能被全局查看但不会被自动改写；
- [x] Context menu 直接创建 typed automation；
- [x] 框选 Copy/Move/Delete 和 Undo 实际可用；
- [x] Track、CueClip layer、visual subrow、Cue Layer 语义没有混淆；
- [x] 新 Cue Layer 使用 opaque 稳定 ID，普通 UI 无 raw ID 外露；
- [x] Color 参数、Catalog revision、Cue refs、Golden 和 runtime 全链路通过；
- [x] 1100×720 和大窗口 computer-use 通过并有截图；
- [x] `pnpm check:all` 通过；
- [x] 无 debug log、无 stale comment、无重复 switch/gesture 分支；
- [x] 没有直接 localStorage/SQLite 操作；
- [x] 已创建语义化增量提交；
- [x] 未自动 push 或创建 PR。

最终汇报必须包括：

- 核心交互和架构改动；
- House reference 前后对比；
- Opaque Layer ID 策略和引用安全性；
- Schema/Catalog/Golden 变化；
- 全部测试命令和结果；
- computer-use 证据路径；
- 提交记录；
- 已知剩余风险。

只有代码、文档、测试、完整构建、Rust 验证、computer-use 主链路和视觉证据全部通过，且没有规划内遗留项时，才可将下一 Goal 标记为 complete。

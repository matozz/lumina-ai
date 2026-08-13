# AI Full Arrange Skill 独立后续规划

> 状态：首个 repo-local 可用版本已于 2026-08-13 实现于 `.agents/skills/lumina-full-arrange/`。当前交付覆盖显式 Base Pack / Project Pack 输入、资产审查、对话式 brief、新 Project Pack 生成、校验和 section 局部调优；真实窗口、computer-use、App transaction、authoring bridge 与 Live 验收仍是后续方向。
>
> 核心决定：这不是固定 pattern 自动生成器，也不应引入 Rust generation engine。Skill 以用户显式提供的 Base Asset Pack 或 Project Pack 为入口，通过多轮对话理解输入资产、设计音乐叙事、创建或修改一版完整 Arrangement，再结合用户试听和视觉反馈持续打磨。

## 1. 与当前实现的边界

当前实现已经提供：

- 收敛后的 Arrange 时间轴、独立 Zoom/Snap/Grid、固定快捷键和 Focus mode；
- Context menu、跨行框选、批量编辑、typed automation 和原子 Undo；
- 创建时生成、复制时重生且普通 UI 不暴露的 opaque Cue Layer ID；
- 所有 Effect 共用的标准可选 Color、Cue override 和单 CueClip Arrangement Color automation；
- 以 Project 文件夹为权威来源的两秒 trailing autosave、原子 latest 和最近 50 版 history。
- 两种显式 UserAssetPack V1 输入：确定性的内置 Base Asset Pack，以及普通 **Export asset pack** 导出的项目相关资产依赖闭包（下文简称 Project Pack）。

这些能力不等于已经存在 AI 编排入口。当前实现仍明确不包含：

- 创建 Full Arrange Skill；
- 自动补齐 `House 128 Custom`；
- 固定 EDM pattern Generator；
- Recipe contract；
- Rust Generator；
- CLI、MCP、Tauri authoring bridge 或其他 AI 通信机制。

本文件描述的内容必须在单独 Goal 中获得实施授权，也不能反向改变 Cue Layer 绑定 TargetSet、Arrangement 调度 Cue、CueClip 不持有 TargetSet 的现有模型。

## 2. 正确的产品意图

用户需要的不是“选择 buildup/drop 模板后机械铺 Clip”，而是一个懂 Lumina authoring 模型、懂基础 EDM 编排语言、能观察实际灯光结果的协作式 AI 编排伙伴。

这个 Skill 应做到：

1. 先校验并理解用户显式提供的 Base Pack 或 Project Pack 中真正可用的 Stage、TargetSet、Effect、Cue 和 Arrangement。
2. 识别哪些 Effect/Cue 在实际布局上有效、重复、过弱、过密或缺乏变化。
3. 通过对话理解用户想要的音乐类型、BPM、时长、段落、情绪、颜色、能量曲线和关键时刻。
4. 提出一版有理由的完整灯光叙事，而不是直接倾倒大量 JSON。
5. 尽量复用和打磨现有 Effect/Cue；只有确有缺口时才创建 project-local 资产。
6. 制作从开头到结尾的 full Arrangement，包括有目的的 CueClip、通过不同 Cue Layer 实现的 TargetSet 变化、typed automation 和 MixPolicy。
7. 在 Lumina 中播放、观察并让用户评价具体段落。
8. 根据反馈迭代，直到它在视觉、节奏和操作上都可用。

EDM 的 intro、buildup、drop、breakdown、fill、outro 等只作为 AI 的音乐组织知识和对话词汇，不是硬编码的生成状态机。

## 3. Project Pack 中 `House 128 Custom` 副本提供的参考

以下数字来自迁移与验收时的项目副本，不是内置 Catalog contract，也不能假设未来提供的同名 Arrangement 仍然相同。只有用户提供的 Project Pack 确实包含该 Arrangement 时，Skill 才从包内内容重新计算；不能按名称、历史 revision 或 Base Pack 猜测。

当时样本的真实信息：

- 名称为 `House 128 Custom`，实际 BPM 为 132；
- 4/4、PPQ 960、总长 64 小节；
- 当前内容只到第 28 小节，后 36 小节为空；
- 39 个 CueClip，其中 35 个是一拍或更短；
- 有 Foundation、Buildup、Transition、Alternating Drop、Fill、Center/Edge response 和 Recovery 的雏形；
- Buildup 使用 Speed 阶梯和 Intensity 上升；
- TargetSet 使用 all、center 和 edges；
- 有 4 条 typed automation lane；
- 大量重复短 Clip 说明手工制作 pattern 成本高。

Skill 应把它视为用户审美和工作方式的参考，而不是要逐 tick 复制的 Golden。第一次对话必须确认：

- 继续使用 132 BPM，还是名称所暗示的 128 BPM；
- 64 小节是否都需要内容；
- 当前前 28 小节哪些段落保留、调整或推翻；
- 后半段希望是第二个 buildup/drop、breakdown、variation 还是 outro；
- 颜色、能量、闪烁风险和多分区使用偏好。

## 4. Skill 的对话式工作流

### 4.1 Input pack 与 context acquisition

Skill 必须从用户显式提供的一个输入包开始，不默认扫描当前 App 或项目文件夹：

- **Base Asset Pack**：Assets 中 **Export base asset pack** 导出的确定性内置基线，包含内置 Stage、全部内置 Layout/Effect、空 Cue 集合和空的 `House 128`。它适合从基准创建新的 Effect、Cue 或 Arrangement；任何需要修改的 built-in 都必须先成为 project-local 副本。
- **Project Pack**：Assets 中普通 **Export asset pack** 导出的当前项目相关资产依赖闭包。它适合继续创建、编辑或修改既有 Effect、Cue 和 Arrangement。它不是完整 Project manifest，也不保证包含与导出闭包无关的资产；上下文不足时必须请用户提供覆盖目标内容的新 Project Pack。

两者都使用 UserAssetPack V1，并先经过 schema、semantic/reference 和 exact-ref 校验。不能只根据文件名判断类型；Base Pack 以固定 built-in provenance 和内容识别，其他普通项目导出按 Project Pack 处理。如果用户同时提供两者，必须明确哪一个是本轮主要输入；Project Pack 可作为修改目标，Base Pack 只能补充内置能力参考，不能覆盖项目资产。

校验后，Skill 汇报它看到的输入上下文：

- 输入类型、来源和用途：基准创建，或既有项目资产的编辑/修改；
- 包中 Stage、Layout 和 fixture 数，以及用户指定的目标 Stage；
- TargetSet 名称、选择范围和分区；
- Effect 名称、能力、参数、风险和视觉用途；
- Cue 名称、Cue Layers、TargetSets、参数覆盖和 MixPolicy；
- 包中 Arrangement 的 BPM、长度、Clip、automation 和空白区，以及用户指定的创建/修改目标；
- exact refs 和任何缺失/不兼容诊断。

输入包是本轮创作与审查的可审计边界，不自动等于当前 App 的已加载 Project。真正应用修改前，Skill 必须让用户确认目标 Project，再通过正式导入/Project transaction 写入。Project 文件夹中的 latest 仍是 App 持久化权威；Skill 不直接读取它，也不读取旧 `FullDSL`、`createStarterProject()` 输出、localStorage 或 WebView SQLite 来推断输入之外的状态。

如果没有合法的 Base Pack/Project Pack，或包中缺少目标 Arrangement 及其依赖，Skill 应停止在“缺少输入上下文”，不能凭内置 Cue 名称、App UI 文本或历史记忆想象项目状态。exact refs、revision 和 raw Layer ID 可以用于机器校验，但面向用户的摘要只显示可理解的资产名、Layer 序号、TargetSet 和参数名。

### 4.2 Effect/Cue audit

AI 对输入包中的资产做一次面向实际编排的 review：

- 哪些 Effect 只是在参数上近似，视觉意义重复；
- 哪些适合铺底、上升、drop、accent、fill、recovery 或 outro；
- 哪些需要 coordinates、matrix、radial 或较大 TargetSet 才可见；
- 哪些在当前 TargetSet 太小、效果太弱或容易过密；
- 哪些参数适合 Arrangement automation；
- standard `color` 的 `schema.default` 是否存在、清除后回到哪种 Effect authored/fallback 行为；不存在单独的 `default_enabled`；
- `color_stops` 是否构成结构性 Palette；它只属于 Effect scope，不能当作 Arrangement automation；
- 哪些组合会写相同属性并需要明确 MixPolicy；
- 当前素材是否足以完成 full arrange。

Review 结果要先展示给用户。不要未经讨论就删除、替换或新建一批 Effect。

### 4.3 Creative interview

Skill 用少量、有信息密度的问题补齐创作约束，优先一次问 1–3 个：

- 音乐类型和参考气质；
- BPM、拍号、总小节/时长；
- 已知 section 和关键时间点；
- 能量曲线、主 Drop 数量和差异；
- 主色、段落颜色变化或是否保持当前 Palette；
- 是否允许 strobe，以及是否有具体的安全或现场约束；风险 metadata 只用于提示和审查，不形成一个全局 pinned risk 限制；
- 多分区希望同时、追逐、call-response 还是重叠；
- 必须保留的 Cue/段落；
- 用户希望 AI 自主决定到什么程度。

已有信息不重复询问。对名称/BPM 等矛盾必须明确指出。

### 4.4 Arrangement brief

在改项目之前，AI 先给出一个可以讨论的完整 brief：

- 从头到尾的 section map；
- 每段的情绪、能量和视觉目标；
- Cue role 与现有 Cue 的映射；
- TargetSet/多分区策略；
- 关键 automation 计划；
- 颜色发展；
- 重叠和 MixPolicy 风险；
- 需要新建或打磨的最小资产集合；
- 如果 Project Pack 含有 `House 128 Custom`，说明其保留/替换关系；Base Pack 创建模式则说明如何从空的 `House 128` 起步。

用户可以只修改其中一部分。Skill 应保留已确认的创作决定，避免每轮重新设计整场。

### 4.5 First full draft

得到方向后，AI 制作一版从开头到结尾的 Arrangement：

- 不留下未经说明的大段空尾；
- 每个短 pattern 都服务于 section 目标；
- Drop variation 不能只是机械复制同一拍序列；
- Automation 有清晰意图，避免装饰性乱动；
- CueClip 不重新选择 TargetSet；
- 编辑过程中允许暂存尚未解决的同属性重叠诊断，但最终 Preview/Go Live 前必须落实明确 MixPolicy；
- exact refs、整数 tick、PPQ、TempoMap 和 Arrangement 范围合法；
- 新资产是 project-local；修改 built-in 必须先复制，不能覆盖受源码管理的 Catalog；
- Cue Layer ID 创建时生成、后续稳定、复制 Layer 时重生；普通说明、Tooltip、aria-label 和 automation label 都不能暴露 raw ID；
- 每个用户确认的逻辑修改通过正式 ProjectBundle transaction 原子应用并形成一个 Undo boundary；两秒 autosave 和最多 50 版文件历史由现有存储层自动完成，Skill 不直接操作 latest/history；
- revision 只用于内部 exact ref 和 immutable snapshot。Project authoring 沿用现有 revision transaction；兼容的 built-in 行为修复直接更新 Catalog 源文件，只有必须让新旧 identity 并存时才增加 Catalog revision。

“Full” 是指用户要求的完整时长都得到明确处理。允许有 Silence/Blackout，但必须是创作决定，而不是生成遗漏。

### 4.6 Playback review

Skill 使用 Lumina 的真实 Stage → Arrange → Live 路径复核，不以 JSON 合法代替效果可见：

- stopped frame 和播放第一拍是否自然；
- buildup 是否持续积累而不是过早耗尽变化；
- drop 是否有足够对比和主体；
- center/edges/多分区变化是否能被看见；
- automation 与节拍是否对齐；
- 颜色过渡是否合理；
- Cue 重叠和 MixPolicy 是否符合预期；
- 1100×720 下用户是否还能编辑生成结果。
- 常用大窗口下 Preview、Timeline 和 Inspector 是否仍完整可操作。

每轮 review 保存少量关键截图，并按 section 给出简短结论。

### 4.7 User feedback loop

不要只问“满意吗”。应让用户可以针对具体部分反馈，例如：

- “第 17–24 小节 buildup 太平”；
- “第二个 drop 想要更多左右来回”；
- “颜色变化太频繁”；
- “CenterPulse 应该晚半拍”；
- “Outro 希望更干净”。

AI 把反馈映射到最小必要的 Effect、Cue 或 Arrangement 修改，并说明为什么。每轮保留一个可撤销的 Project transaction 和变更摘要；Project 文件 history 是灾难恢复版本，不替代编辑器 Undo。

### 4.8 Final handoff

最终交付至少包括：

- 完整 Arrangement 名称、BPM、总小节和 section summary；机器可验证结果可以附内部 exact ref，但普通交付文案不显示 raw revision；
- 新增/修改的 project-local Effect 和 Cue；
- automation、颜色和多分区策略摘要；
- 已确认的 MixPolicy；
- Schema、semantic、preview compile 和 Go Live validation 结果；
- Project 自动保存状态；
- Arrange/Live 视觉证据；
- 用户反馈如何被落实；
- 仍需人工注意的风险。

## 5. 通信机制：先设计，后决定是否实现

Skill 需要安全地“读取输入包、提出变更、确认目标 Project、应用变更、验证和打开 UI”。这不等于需要一个内容 Generator。

### 5.1 首选能力顺序

1. 用户显式提供并通过校验的 Base Asset Pack 或 Project Pack，作为本轮基准创建、编辑或修改的输入边界。
2. 用户确认目标 Project 后，使用当前 App 的项目 store transaction 和正式 Tauri validation/storage commands 应用 proposal；输入包本身不直接覆盖已加载项目。
3. 使用普通 UserAssetPack 导入/导出接口承接可审计的资产传递与结果交付。
4. computer-use，用于 UI 观察、播放和用户可见操作。
5. 只有上述能力无法支持可审计的编辑闭环时，才设计一个最小 authoring bridge。

任何 bridge 只负责 transport/CRUD/validation：

- 列出 Project assets；
- 读取精确引用的资产；
- 提交一个显式 proposal；
- 通过正式 transaction 原子创建或更新 project-local asset/Arrangement；
- 返回 diagnostics；
- 导出新资产包。

AI 的编排判断、Effect review 和迭代策略仍在 Skill 对话中，不进入 Rust、CLI 或固定 pattern engine。

### 5.2 CLI 只是一种候选通信适配器

如果未来验证确实需要 CLI：

- CLI 只包装已有 authoring/validation 操作；
- 不包含 EDM section、pattern 或生成逻辑；
- 输入必须是用户显式提供的 snapshot/proposal；
- 默认 dry-run，写入需要明确目标；
- 不覆盖输入文件或 built-in；
- 不直接写 `lumina-project.json` 或 `history/`，只调用与 UI 相同的 Project transaction/storage 边界；
- 输出结构化 diagnostics；
- 与 UI 使用同一语义校验和事务边界。

在没有证明必要性前，不为 Skill 预先增加 CLI。

### 5.3 禁止路径

- 直接读取或修改 localStorage/WebView SQLite；
- 绕过 App 直接读取或修改 Project 文件夹中的 `lumina-project.json`、临时文件或 `history/`；
- 没有合法 Base Pack/Project Pack 时从 App UI 文本、历史对话或内置名称猜测输入资产；
- 根据 UI 文本拼接未验证 JSON；
- 在 Skill 中复制 Project Schema 或 compiler 逻辑；
- 绕过 exact refs、revision 和 semantic validation；
- 让 computer-use 应用 Project transaction 前没有可审阅的变更摘要；
- 使用旧 `FullDSL`/`createStarterProject()` 作为当前 authoring snapshot；
- 以 Rust Generator 替代 AI 创作对话。

## 6. 建议的 Skill 结构

```text
.agents/skills/lumina-full-arrange/
├── SKILL.md
├── references/
│   ├── authoring-model.md
│   ├── edm-arrangement-heuristics.md
│   ├── effect-and-cue-review.md
│   ├── playback-review.md
│   └── communication-boundary.md
└── evals/
    └── evals.json
```

初版不创建 `scripts/`。只有多次评测证明存在重复、确定、非创作性的通信或校验步骤时，才增加薄脚本。

`SKILL.md` 应小于约 500 行，只保存流程和路由。Effect 审查、EDM 编排启发、视觉复核和通信边界分别放入 references，并明确何时读取。

Skill description 应在以下意图触发：

- “基于这个 Base Pack 从零做一套完整灯光编排”；
- “基于这个 Project Pack 编辑/完善现有 Arrangement”；
- “帮我做/完善一整套 Lumina 灯光编排”；
- “分析现有效果并做一个完整 House/EDM arrange”；
- “根据 buildup/drop 逐段和我打磨灯光”；
- “把当前半成品 Arrangement 做完整”；
- “先 review Effects/Cues，再编完整 show”。

不应在以下请求触发：

- 只修一个 Effect；
- 只调整一个 Cue 或自动化点；
- 只修 Timeline UI；
- 请求固定模板批量生成 JSON；
- 请求音频波形/自动 beat detection。

## 7. 评测方式

这是带主观创作判断的 Skill，不能只用结构断言判定质量。评测必须同时包含客观验证和用户视觉/音乐判断。

### 7.1 客观检查

- Arrangement 覆盖用户要求的完整长度；
- 无未经说明的空尾；
- exact refs 和 Stage compatibility 有效；
- TargetSet 只属于 Cue Layer；
- integer ticks、TempoMap、PPQ 和范围合法；
- automation target/type/interpolation 合法；
- 最终版本中的重叠同属性有明确 MixPolicy；编辑中间状态可以保留非阻塞 semantic diagnostics；
- standard Color、可选 default、fallback 和 Effect-only `color_stops` 语义正确；
- 新资产均为 project-local；
- 没有覆盖 built-in 或旧 Arrangement；
- 完整 Schema/semantic validation 通过。

### 7.2 人工 Rubric

- 段落能量发展是否清楚；
- buildup 和 drop 是否有对比；
- 第二次出现是否有 variation；
- 多分区是否有目的而不是随机切换；
- 自动化是否增强音乐结构；
- 颜色叙事是否连贯；
- Effect/Cue 是否被合理复用和打磨；
- 整体是否像一场可播放的 show，而不是参数 demo；
- AI 是否理解并落实了用户反馈。

### 7.3 建议 eval

1. Base Pack 创建：从确定性空 `House 128` 和内置能力基线出发，经用户确认后创建 project-local Cue/Arrangement，不修改 built-in。
2. Project Pack 修改：重新读取包内 `House 128 Custom` 而不是假定 revision；指出 128/132 冲突和空尾，经用户确认后完成约定长度。
3. 素材不足 Project Pack：识别缺口，只创建最小必要的 project-local Effect/Cue，再完成 full arrange。
4. 20×20 多分区：使用 all/center/edges/四象限组织两次不同 Drop，保持 TargetSet/Cue Layer 模型和 MixPolicy。
5. 反馈迭代：用户要求“第二个 Drop 更左右、颜色更克制”，验证 Skill 做局部修改而不是推翻整场。

按照 `skill-creator` 流程运行 with-skill 与 baseline，保存对话 transcript、项目 diff、验证结果和视觉证据，通过 review viewer 收集用户反馈并迭代 Skill。

## 8. 独立后续 Goal 的建议阶段

### Phase 0：通信可行性与边界

- 审计现有 Project 文件夹加载/自动保存、ProjectBundle transaction、导入导出、Tauri commands、store actions 和 computer-use；
- 用 Base Pack 与 Project Pack 各验证一次输入识别、完整性诊断和只读 context acquisition；
- 决定无需新 bridge、扩展正式 API，或确实需要薄 CLI；
- 输出 ADR/设计说明，不实现任何生成逻辑。

### Phase 1：Skill draft

- 创建 Skill 和 references；
- 固化对话阶段、资产审查、创作 brief 和 feedback loop；
- 建立 eval prompts 和 rubric。

### Phase 2：最小安全编辑闭环

- 复用现有接口完成 Base Pack/Project Pack → proposal → target Project confirmation → structural validate → atomic transaction → final semantic/compile validate → autosave/export；
- 只有 Phase 0 证明必要时才增加通信 bridge；
- computer-use 负责播放和视觉观察。

### Phase 3：House 参考实战

- 以用户提供的 Project Pack 中 `House 128 Custom` 正式副本运行完整对话，不在用户确认前自动补齐或改写原 Arrangement；
- 让用户确认方向；
- 完成一版 full arrange；
- 在 Arrange/Live 试听并迭代。

### Phase 4：Skill eval 和泛化

- 运行不同素材、多分区和反馈迭代用例；
- 比较无 Skill baseline；
- 根据用户 review 修改 Skill；
- 优化 description 的触发/不触发边界。

### Phase 5：文档和交付

- 记录通信方式、安全边界和恢复方案；
- 更新 Authoring 文档的 AI 协作入口，但不把 Skill 当作 Project Schema；
- 汇报 transcript、资产 diff、测试、视觉证据和剩余风险。

## 9. 独立 Goal 终止条件

只有满足以下条件，未来的 Skill Goal 才可 complete：

- Skill 先审查现有资产并通过对话形成 brief，而非一键套模板；
- Skill 只从用户显式提供且通过校验的 Base Pack 或 Project Pack 开始，并正确区分基准创建与既有内容编辑/修改；
- Base Pack 创建与 Project Pack 修改两条入口都完成独立 eval；
- 能安全读取、修改、验证和导出 project-local authoring 数据；
- 只通过正式 Project transaction 修改当前项目，不直接读写 latest/history/localStorage/WebView SQLite；
- 编辑中间状态不会被重复 semantic validation 阻断，最终 Preview/Go Live validation 必须通过；
- 没有 Rust Generator、固定 Recipe engine 或 localStorage hack；
- `House 128 Custom` 参考用例得到用户认可的完整版本；
- 至少完成一次明确反馈后的局部迭代；
- 客观验证、Arrange/Live 播放和视觉复核通过；
- Skill eval、baseline 对照和人工 review 完成；
- 没有覆盖 built-in 或用户原 Arrangement；
- 通信 bridge（如有）只承担最小、安全、可审计的 authoring 操作。

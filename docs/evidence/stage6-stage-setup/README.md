# Stage 6 Stage Setup 原生证据

## 范围

- Fixture profile：直接读取 Rust schema generator 产出的
  `schemas/fixture-profiles-v1.json`，显示 profile 名称、channel footprint 与 capability
  attributes，避免前后端重复维护能力表。
- Patch：编辑首个 fixture range 的 profile、first fixture ID、quantity、universe 与 start
  channel；DMX 地址作为持久化 workspace metadata 保存，避免写入尚无协议地址字段的 V4 show
  compiler contract。
- Layout：支持 Matrix、Circle、Formula 与 Custom 草稿生成；Matrix 暴露 columns，草稿通过新的
  side-effect-free `preview_dsl` 编译并直接更新 Canvas，不发布也不替换 Live Snapshot。
- Group：按 all/left/right/top/bottom 空间筛选创建用户命名 group，保存空间 sort，支持测试点亮
  toggle；被 EffectInstance 引用的 group 禁止删除。
- Conflict：在 Apply 前检测非法 universe/channel、单 patch 跨越 512 以及同 universe 地址重叠；
  编译器继续负责 fixture ID、layout reference 与 capability 等语义诊断。

所有 Stage Setup 更改通过单个 `replace_stage_setup` DocumentCommand 提交，继续进入既有 Undo/Redo
history；Canvas 草稿布局与测试点亮不调用 Publish 或 Take live。

## 原生窗口证据

| 场景                   | 原生逻辑尺寸 | 证据                                                                     | 结果                                                                   |
| ---------------------- | ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 4×4 starter 最大化     | `1512 × 892` | [`stage-setup-maximized.png`](./stage-setup-maximized.png)               | Matrix、16 fixtures、1–64 channels、capability 与 group 表单同时可见   |
| 4×4 starter 最小窗口   | `1100 × 720` | [`stage-setup-minimum-1100x720.png`](./stage-setup-minimum-1100x720.png) | Canvas 保持主区，Inspector 内部滚动，无 panel 重叠                     |
| All fixtures 测试点亮  | `1512 × 891` | [`stage-group-test-maximized.png`](./stage-group-test-maximized.png)     | 16 个 Canvas fixture 明确点亮，Eye button 有 focus ring 与 toggle name |
| Publish 尚未 Take live | `1512 × 891` | [`revision-published-not-live.png`](./revision-published-not-live.png)   | 原生 AX 返回 `Published r2 / Live r1`，Take live enabled               |
| 显式 Take live         | `1512 × 891` | [`revision-taken-live.png`](./revision-taken-live.png)                   | 原生 AX 返回 `Published r2 / Live r2`，Take live disabled              |

## 自动化验证

- Frontend：36 files / 76 tests。覆盖 generated profile footprint、DMX overflow/overlap、四种
  layout、空间筛选、稳定 group ID、原子 Draft transaction、Canvas draft event 与 test-light
  toggle。
- Rust：`preview_dsl` 编译 2×2 Draft，返回 4 个 coords 且 `show_revision=None`；证明 preview
  不进入 ShowStore。
- 完整 `pnpm check:all` 通过：76 frontend tests、75 Rust unit + 12
  contracts/golden/templates、schema、format、typecheck、strict Clippy 与 Vite build 全绿。

首次组件测试的文档断言已通过，但 Base UI ScrollArea 在 happy-dom 清理阶段调用缺失的
`Element.getAnimations()` 造成进程失败。测试随后只对该测试文件 mock ScrollArea 的布局容器，
保留真实产品 ScrollArea，并重跑全量 frontend 通过。

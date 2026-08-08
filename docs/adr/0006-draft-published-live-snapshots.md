# ADR-0006: 旧发布状态模型

- Status: Superseded
- Date: 2026-08-02
- Superseded: 2026-08-08 by ADR-0010 and the consolidated Authoring V1 workflow

本 ADR 的多状态产品界面已退出主流程，不再是实现指导。当前 UI 使用 session-local working changes、ProjectBundle save transactions 和单一 **Go Live** 操作；只有 Go Live 会验证、编译并激活 immutable runtime snapshot。

Authoring Preview 与 Live 输出仍严格隔离。当前规则见 [`../authoring/project-model.md`](../authoring/project-model.md) 和 ADR-0010。

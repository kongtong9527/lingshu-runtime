# 分阶段演进:读侧优先的插件 SDK

## Status

superseded by [ADR-0005](./0005-declarative-interaction-write-side.md)(写侧留后决定作废;本文的三层词汇——纯读侧/认证读侧/写侧——仍保留)

## Context

对照 Venera(完整消费级漫画 App)的插件 SDK,Lingshu 当前定位是「插件运行时 + 可视化调试平台」。Venera 的插件要支撑登录、收藏、评论、评分、设置、多语言、UI 交互——这些是终端用户在 App 里做的事。若一次性补齐,Lingshu 会在还没站稳读侧运行时之前就背上整个写侧 + 消费级 UI 的复杂度。

## Decision

**当前阶段只补"读侧"能力,写侧(账号登录、收藏、评论/评分)留后。** 读侧细分为两层:

- **纯读侧**——fetch / parse / render,无状态。进当前阶段。
- **认证读侧**——需 cookie 才能读(年龄门、地区限、登录可见章节)。cookie 传递进当前阶段,密码/webview **登录 UI** 留后(属写侧)。

据此,当前阶段落地 5 项:cookie 传递、发现页数据类型(`ExploreFeed`)、结构化导航(`PageJumpTarget`)、uuid/random 工具、解密算法覆盖扩展。详见 venera-gap-analysis.md。

## Considered Options

- **全量对齐 Venera(一次性补齐写侧)**:否决。在运行时尚未稳定时引入账号/收藏/评论会过早放大复杂度,且写侧强依赖真实 Swift JSC 端的 UI 能力。
- **窄定位(永久只做调试平台)**:否决。Lingshu 终究要演进为可终端使用的阅读器,写侧在路线图上,只是排序靠后。

## Consequences

- 登录墙站点的**登录动作**本阶段不可适配,但**带上预置 cookie 读取**可以——这覆盖了"有 cookie 即可读"的大多数源。
- 图片切片打乱(scrambling,非密码学变换)本阶段无法适配,已标记为已知限制,等具体源驱动再定架构。
- 认证读侧把原本二分的"读侧/写侧"细化为三层,该术语已进 CONTEXT.md,避免后续讨论边界时再混淆。

# 写侧验证:声明式交互(不破纯函数沙箱)

## Status

accepted — supersedes [ADR-0002](./0002-read-side-first-phased-sdk.md) 的「写侧留后」决定(保留 0002 的纯读侧/认证读侧/写侧三层词汇);其「无 callback、无中途暂停」约束被 [ADR-0006](./0006-libui-plugin-prompt-channel.md) 取代(字段 schema + 多 run 流机制保留)

## Context

ADR-0002 把写侧(账号登录、收藏、评论)留后,理由是运行时尚未稳定、写侧强依赖 Swift 端 UI。但实践中暴露一个反过来的成本:**插件(Venera 形态)的写侧代码路径——`account.login`、`favorites`、`loadComments`/`sendComment`、`UI.showDialog`——在只读的 Lingshu 里根本无法 exercise**。这些路径的 bug(字段拼错、回调签名、表单交互、cookie 续期)只有移植到 Swift 客户端后才暴露,而 Swift 调试循环远慢于 TS。

结论:Lingshu 必须能当「完整客户端」用,目的是**在 TS 闭环里验证插件的写侧流**,而非成为终端发行产品(发行仍走 Swift)。

## Decision

**进入写侧,但用「声明式交互」承载,不引入 callback、不破纯函数沙箱。**

插件不直接调用 UI,而是:

1. **字段 schema 声明** —— 插件用 `getAccountSchema()`(及后续的收藏/评论 schema)声明表单字段,宿主据此渲染。这是 `getSettingsSchema` 的泛化,同构扩展。
2. **宿主编排的多 run 流** —— 某个插件方法产数据(如 `loadFolders` 返回夹子),宿主渲染选择 UI,用户的选择作为**下一次 run 的 `PluginContext.inputs`** 回传,驱动后续方法(如 `addOrDelFavorite`)。每个方法仍 run-to-completion。
3. **无中途暂停、无 callback** —— 插件不会在执行中途发「action descriptor」再等用户;多步交互拆成多次 run(对「调试」恰是正确颗粒)。

保留 gap-analysis line 76 的决定:`setTimeout`/`setInterval`/事件回调继续禁用,沙箱执行确定性、可重放、Swift 可廉价镜像(声明式契约远比整套 UI 运行时易移植)。

## Considered Options

- **真 callback / `UI.*` 运行时(对齐 Venera)**:否决。插件跨用户交互保活,撞上禁回调/确定性的决定;且要求 Swift 复制整套 Venera UI 运行时——等于把写侧 UI 建两遍。
- **声明式交互(本决策)**:选中。拿得到写侧流的端到端验证,代价仅是「多步 = 多 run」。
- **永久只读(维持 0002)**:否决。写侧插件路径无法在 TS 验证,bug 后置到 Swift,成本更高。

## Consequences

- **cookie jar 必须跨 run 共享**:当前 `createHttpAPI` 的 `cookieStore` 是 per-run 短命(`http.ts:95`),login run 结束 cookie 即失,「登录后读取」不成立。login 切片的前置是把 jar 提升为进程内共享(按 base URL / 插件隔离)。详见行动项。
- **`PluginContext` 新增 `inputs` 信道**:承载宿主从表单/选择器收集、回传给下一次 run 的值。
- **`executeRun` 的动作词表扩展**:新增 `login`(及后续 `favorite`/`comment` 等),与 `list`/`detail`/`setting-action` 并列。
- **宿主(DevConsole)新增渲染面**:登录表单、选择器、结果反馈(后者 `runSettingAction→{message}` 已有,复用)。
- **多步写侧交互 = 多次 run**:调试日志/请求记录天然按步切分,利于排查。
- **Swift 移植路径**:镜像声明式契约(字段 schema + inputs 回传),不需复制 callback 运行时;这与 Lingshu 的 Swift JSC 目标一致。
- 写侧只做「能 exercise 插件路径」所需的最薄面;消费级打磨(多语言、动画、离线)仍随发行阶段,不在此列。

## 行动项(本决策首批)

1. cookie jar 跨 run 共享(前置,login 的前置)。
2. Login 垂直切片:`getAccountSchema()` + `login` 动作 + `PluginContext.inputs` + DevConsole 登录表单。
3. manga_site_b.plugin.js 落地 `/login` POST 验证;顺带补读侧缺口(每週必看 `/week`、`category_sub`/`description` 字段)。

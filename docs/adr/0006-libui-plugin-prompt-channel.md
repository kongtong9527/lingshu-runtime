# `$lib.ui`:插件直问用户的命令式信道(supersede ADR-0005 的「无中途暂停」)

## Status

accepted — supersede [ADR-0005](./0005-declarative-interaction-write-side.md) 的「无 callback、无中途暂停」约束(保留 ADR-0005 的字段 schema + 多 run 流两套机制)。

## Context

ADR-0005 否决了「真 callback / `UI.*` 运行时」,给出两条理由:(R1) 撞禁回调/确定性;(R2) Swift 要复制整套 Venera UI 运行时,等于建两遍。重新审视发现 **R1 不成立**:

- `$lib.http.get()`(`runtime/http.ts`)**本身就是一个「中途暂停、依赖外部系统、非确定性」的异步原语**——冻结插件执行、等网络返回、再续跑。现有 fixture 层(`run.ts` 的 fixture 模式)已证明这类暂停**可记录、可回放**。
- `$lib.ui.showInputDialog()` 与之**结构同构**:一个暂停等网络,一个暂停等人类。录下人类输入即可回放,确定性剖面完全一致。「禁 callback 撞确定性」是误判——HTTP 早就在暂停,且已解决。

真实动因是**作者人体工学**:Venera 插件 `await UI.showInputDialog(验证码图)` 把「取图→等输入→提交」写成一条线性 async;ADR-0005 的声明式多 run 强制拆成两次 run + 手工接力 captcha key,可读性差、易错。

## Decision

**新增 `$lib.ui` 为第三个交互信道(mid-run、插件直发),保留字段 schema(pre-run)与多 run 流(mid-run、宿主编排)。**

三信道按「时间位置 × 发起方」分界(详见 CONTEXT.md):

| | pre-run | mid-run |
|---|---|---|
| 宿主编排 | 字段 schema(`getAccountSchema`/登录表单) | 多 run 流(收藏夹子选择) |
| 插件直发 | —(插件未起) | `$lib.ui.*`(验证码/确认/toast/开链接) |

`$lib.ui` **窄口径**:只收插件在 run 中途、无法预声明、直接面向用户的交互——`showInputDialog`/`confirm`/`showMessage`/`launchUrl`。**不收**宿主 owns 渲染面的结构化选择器(夹子/列表)——那是多 run 流的职责(Venera 的 `loadFolders`→宿主 picker→`addOrDelFavorite` 亦如此,从不用 `UI.*`)。

API 形态:**Promise 式 `await`**,非 Venera 的 callback。`await $lib.ui.showInputDialog(...) → string`、`await $lib.ui.confirm(...) → 按钮序号`;toast/开链接为 fire-and-forget(可不等)。`module.exports` 函数式方言不变,不切 `class extends`。

headed 处理:`$lib.ui` 的查询类原语要求人类在场;把现有 HTTP fixture 层**扩到 `$lib.ui.*`**(录一次交互、回放);无 fixture 且无头(CLI/CI)时**清晰报错**,不静默降级——降级会把验证码吞成空串,重新藏起 Lingshu 要消灭的 bug。

## Considered Options

- **全量 `UI.*` 运行时(对齐 Venera verbatim)**:否决。callback 式 + 含 picker 等结构化 UI,与多 run 流重叠;且要求近原样跑 Venera 插件,推翻「`module.exports` 函数式、有意为之」整个方言方向。
- **`$lib.ui` 窄口径 Promise 式(本决策)**:选中。拿到 captcha 等直问场景的线性人体工学,代价仅是扩 fixture 层 + Swift 走 Promise 桥接。
- **维持 ADR-0005 纯声明式(多 run 拆 captcha)**:否决。R1 既已证伪,无理由继续付人体工学成本。

## Consequences

- **ADR-0005 的 R1(确定性)作废**;R2(Swift 双端)被重新定性为边际成本(Promise 桥接是 JSC 标准模式,UI 组件本就 React/Swift 各建一遍)。ADR-0005 的字段 schema + 多 run 流机制保留。
- **CONTEXT.md「声明式交互」词条已不准确**(原写「无 callback、无中途暂停」),已改写为 redirect 并新增 `$lib.ui` 词条。
- **fixture 层扩展**:`runtime` 增加 `$lib.ui` 录放;`SandboxOptions`/`RunOptions` 增设 ui 交互记录与回放。
- **`executeRun` 透明**:run 仍是「调一个方法→拿结果」,内部 `await $lib.ui.*` 对其透明;DevConsole server 需 Promise 桥(host 持 Promise → ws 推前端 → 收人类输入 → resolve)。
- **Swift 镜像**:经 JSC Promise 桥(同 `$lib.http`),不引入 callback 运行时。
- **行动项(首批)**:(1) `$lib.ui` 注入 + DevConsole Promise 桥;(2) fixture 录放扩展 + 无头报错;(3) ccc 验证码为首个验证场景(取图→`await $lib.ui.showInputDialog`→提交)。

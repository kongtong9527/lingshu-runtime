# 契约单一事实源（contracts/）

> 本目录是**跨端契约的唯一事实源**：卡片 DSL 的机器可读 schema、`$lib` 注入面清单、跨端 conformance 语料。
> 三端（runtime 的 Node 沙箱 / DevConsole 的 BFF 与预览 / iOS 的 JavaScriptCore 宿主）都从这里取契约，
> 并由 `scripts/contract-gates/` 的四道门在 CI 里强制一致——**禁止只改一端**。
>
> 归属与发布口径见 `../docs/opensource/repo-whitelists.md` §5。
>
> **哪仓带什么**（母仓与公开仓的差别只在这里）：
> | 仓 | 带的内容 | 怎么验证 |
> | --- | --- | --- |
> | 母仓 | 全部 + `scripts/contract-gates/**` | `CONTRACT_REQUIRE_ALL=1 npm run contract:gate`（三方齐备） |
> | `lingshu-runtime` | 全部（含门脚本） | `npm run contract:check`（缺 Swift 腿跳过并汇报） |
> | `lingshu-ios` | `card-dsl.schema.json` + `conformance/**` + 本文件（**不带门脚本**） | 模拟器跑 `CardDSLConformanceTests`（macOS；母仓同样跑） |
> | `lingshu-devconsole` / `lingshu-plugins` | 不带契约（消费已发布的 `lingshu-runtime` 类型） | 各自 CI |

## 文件

| 文件 | 是什么 | 消费者 |
| --- | --- | --- |
| [`card-dsl.schema.json`](card-dsl.schema.json) | 卡片 DSL v1 的 JSON Schema（2020-12）：节点/颜色/格式化值/跳转/写侧调用/筛选组 | 插件作者、各宿主、门 1、门 3、iOS 单测 |
| [`lib-api.json`](lib-api.json) | `$lib` 注入面的机器可读清单：7 个宿主命名空间的方法与参数个数、8 个第三方库的注册表、`contractVersion`（**契约版本**，插件 `minRuntimeVersion` 的基准；与 runtime 包版本是**两条号段**）、`surfaceHash`（注入面指纹） | 门 2 |
| [`lib-api.md`](lib-api.md) | 上者的**人读版**（签名/单位/缺省值），插件作者的签名依据 | 插件作者、门 2（文档腿） |
| [`conformance/`](conformance/) | 跨端语料：每个节点类型一份「最小 + 边界」卡片 JSON + 期望（回退判定 / warnings / 计数） | 门 3、iOS `CardDSLConformanceTests` |

## 四道门（`npm run contract:check`）

| 门 | 脚本 | 钉死什么 | 腿 |
| --- | --- | --- | --- |
| 0 命名 | [`naming.mjs`](../scripts/contract-gates/naming.mjs) | 旧名 `simulator` 的路径/包名形态零回退；workspace/包名一致 | 全树文本 + package.json |
| 1 字段集合 | [`field-set.mjs`](../scripts/contract-gates/field-set.mjs) | schema ↔ `runtime/src/types.ts` ↔ `ios/**/CardModels.swift` 的**逐容器字段集相等**（含必填集合比对、`CardNode.CodingKeys` 并集） | 三方 |
| 2 `$lib` 签名 | [`lib-api.mjs`](../scripts/contract-gates/lib-api.mjs) | `lib-api.json` ↔ Node **真跑** `createSandbox()` 反射 ↔ iOS 桥静态抽取（键名 + 形参个数）↔ `lib-api.md`；**L4 版本腿**：iOS `PluginRuntimeContract.version` ↔ 契约 `contractVersion` **恒等**、`runtime/package.json` 版本 **≥** 契约版本、**注入面指纹** `surfaceHash`（改了面必须显式决定：递增契约版本，或 `--record-surface-hash`） | 五腿 |
| 3 conformance | [`conformance.mjs`](../scripts/contract-gates/conformance.mjs) | 同一份语料同时喂 JSON Schema 与 runtime `validateCardDSL`；**字段覆盖率**（schema 声明的每个字段都必须被某个合法语料真实用到） | schema + runtime + iOS 单测 |

```bash
# 母仓（workspace 布局）
npm run -w runtime build      # 门 2/3 消费 dist
npm run contract:check        # = build + 四道门
CONTRACT_REQUIRE_ALL=1 npm run contract:gate   # 母仓 CI：三方必须齐备，缺腿即红
# 公开仓（仓根布局：`runtime/` 即仓根，`runtime/src/**` → `src/**`）
npm run build && node scripts/contract-gates/run.mjs     # 或 npm run contract:check
node scripts/contract-gates/conformance.mjs --record     # 只补缺失的 expect.counts（CI 不得带）
```

> 门是**布局无关**的：`scripts/contract-gates/lib.mjs` 用 `resolveLayout()` 同时认母仓 `runtime/src/types.ts`
> 与公开仓 `src/types.ts`；`CONTRACT_ROOT=<dir>` 还能把门指向别处（发布脚本就是用它复用母仓 node_modules
> 对**发布快照**跑门）。缺腿（如公开 runtime 仓没有 `CardModels.swift`）跳过并汇报，不报错。

- **缺腿语义**：公开仓只有部分文件（如 runtime 仓没有 Swift），缺的腿**跳过并汇报**；母仓 CI 设 `CONTRACT_REQUIRE_ALL=1` 要求齐备。
- **门管什么、不管什么**：门管**结构**（字段名/必填/参数个数/库注册表）；**取值容差回退**（`aspect:'abc'` → 16:9、越界钳制、超限截断）由语料的 `expect.warnings` 管，不算结构非法。
- **iOS 腿怎么跑**：`CardModels.swift` 的解析是**文本级**的（`case x(labels:)` 单行声明 + struct 的 `let/var`），所以改模型文件风格前先看 `scripts/contract-gates/lib.mjs` 的句式约定；语料侧由 `ios/LingshuTests/CardDSLConformanceTests.swift` 在模拟器上执行（`xcodebuild test`，母仓 macOS 本地跑；公开 iOS 仓的 CI 同命令）。

## 尚未纳入契约的门（已知缺口，勿当成「已经全保」）

| 缺口 | 影响 | 计划 |
| --- | --- | --- |
| `ListItem` 信封本体（`tags`/`badges` 归一化、`coverWidth/Height` 真实比语义） | 老卡字段没有三方门，靠 iOS `ListItemBadges.swift` 单源纪律 | 下一个契约批次 |
| `ContentBlock` 详情/阅读块、`Listing`/`PluginContext` 等插件接口 | 同上（`types.ts` 已有类型，无 schema/语料） | 下一个契约批次 |
| 筛选组联动求值的**行为**等价 | 语料只覆盖 `CategoryGroup` 的字段集与解码，不覆盖显隐/清子求值 | 各端自带单测（`FilterStateTests` / `filters-linkage.test.ts` / `FilterLinkageTests`） |
| codegen（由 schema 生成 Swift 模型 + 文档字段表） | 暂无；先用四道门把漂移钉死 | Phase 4 可选 |

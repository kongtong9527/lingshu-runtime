# 插件运行时（runtime）开发准则

灵枢的 **Node 发行端**（`node:vm` 沙箱 + `lingshu` CLI）。本文件记录 **runtime 宿主侧** 的行为约定——即「沙箱如何注入 `$lib`、如何派发动作、运行时 API 的语义」这类与 runtime 实现强相关、而与单个 `.plugin.js` 无关的内容。

> 插件侧（`.plugin.js`）的约定见 `<项目根目录>/lingshu-skills/lingshu-plugin-dev/SKILL.md`；DevConsole 宿主侧见 `devconsole/AGENTS.md`。职责划分边界见 `docs/agents/plugin-host-boundary.md`。

## 契约门（改动卡片 DSL / `$lib` 前必读）

`contracts/` 是本仓与 iOS / DevConsole 之间的**唯一事实源**（`docs/opensource/repo-whitelists.md` §5），四道门用 `npm run contract:check` 跑（先 `npm run -w runtime build`；母仓 CI 另设 `CONTRACT_REQUIRE_ALL=1` 要求三方齐备）：

- **门 1 字段集合**：schema ↔ `src/types.ts` ↔ `ios/**/CardModels.swift` **逐容器字段集相等**（含必填集合、`CardNode.CodingKeys` 并集）。**加/删卡片字段必须同时改三处 + 语料**——这条替代了根 `AGENTS.md` 第 8 条的人工纪律。
- **门 2 `$lib` 签名**：`contracts/lib-api.json` ↔ 本仓**真跑** `createSandbox()` 反射（键名 + `fn.length`）↔ iOS 桥静态抽取 ↔ `lib-api.md`。
  **实现里禁止给可选参数写 JS 默认值**（`options = {}` 会让 `fn.length` 截断、两侧口径不再可比），可选性用 `??`/判空表达。
  **另含 L4 版本腿与注入面指纹**（见下面那条红线）。
- **门 3 conformance 语料**：`contracts/conformance/*.json` 同时喂 schema 与 `validateCardDSL`；**schema 声明的每个字段都必须被某个合法语料真实用到**（加了字段不补语料即红）。补 `counts`：`node scripts/contract-gates/conformance.mjs --record`（只补缺失值，CI 不得带）。
- **门 0 命名**：旧名 `simulator` 的路径/包名形态零回退（历史内部设计记录正文与 `simulator-debugging.md` 文件名是**有意保留**的例外）。

**CLI 版本号必须从 `package.json` 取，勿写死（勿回退）**：`program.version(packageVersion())`（`src/pkg-version.ts`）——写死会静默漂移（2026-10 实测：包已发到 `1.0.1`，`lingshu --version` 仍报 `1.0.0`；那是用户确认「我装的是哪一版」的唯一入口），回归锁 `src/__tests__/cli-version.test.ts`。

**契约版本与包版本是两条号段，勿再互锁（勿回退）**：`contracts/lib-api.json` 的 `contractVersion`（插件 `minRuntimeVersion` 的基准）**只随 `$lib` 注入面变更递增**；`runtime/package.json` 的 `version` 随每次发布递增。门 2 的 L4 腿只要求 **包版本 ≥ 契约版本**，且 iOS 常量与契约版本**恒等**；**改了注入面必须做一次显式决定**（递增契约版本，或 `node scripts/contract-gates/run.mjs --record-surface-hash` 声明「面变了但语义未变」——指纹 `surfaceHash` 会拦）（口径与三条号段对照表见 `contracts/lib-api.md` §0，决策）。

**卡片校验出口单一来源（勿在宿主里自写一套）**：`validateCardDSL` / `shouldFallbackCard` / `CARD_LIMITS` 从 `src/lib.ts` 出口给 Node 宿主复用（DevConsole 预览已改 import）。**未知 root ⇒ 整卡回退**（`KNOWN_NODE_TYPES`），未知**子**节点才跳节点——三端同口径，由 `contracts/conformance/card-root.json` 锁定。

## 工具自迭代原则

当 runtime 无法满足插件调试需求时，按根 `AGENTS.md`「工具自迭代优化」原则，**允许且应当直接优化 runtime**（不要通过改插件来绕过宿主缺陷）。

## 运行时 API（`$lib`）注入

`createSandbox(options)` 在 `sandbox.ts` 构建 `$lib` 并注入沙箱全局。各 API 工厂在 `runtime/`：

| API | 工厂 | 说明 |
|---|---|---|
| `$lib.http` | `runtime/http.ts` `createHttpAPI` | get/post/del + cookie jar（setCookies/getCookies/deleteCookies）+ 二进制（post 发字节 + `responseType:'base64'`，详见 docs/binary-http.md） |
| `$lib.zlib` | `runtime/zlib.ts` `createZlibAPI` | gzipBase64/gunzipBase64 字符串通道（详见 docs/binary-http.md） |
| `$lib.storage` | `runtime/storage.ts` | 文件持久 KV |
| `$lib.settings` | `runtime/settings.ts` | 用户偏好（按 run 注入、只读） |
| `$lib.util` | `runtime/util.ts` | randomUUID/randomInt/randomDouble |
| `$lib.ui` | `runtime/ui.ts` `createUiAPI` | 插件直问用户：showInputDialog/confirm/showMessage/launchUrl |
| `$lib.browser` | `runtime/browser.ts` `createBrowserAPI` | 列表详情浏览器抓取存根：无浏览器恒抛 CHALLENGE |
| 第三方库 | `lib-loader.ts` `loadJsLib` | CryptoJS/cheerio/dayjs/iconv-lite 等 |

**L3 站点 CLI 政策**：runtime 保持纯 Node，L3 在线如实抛 `CHALLENGE`（exit 1 即正确行为，不视为缺陷）；离线验证一律 `--fixture`（同时覆盖 `browser.getHtml`）；禁止给 CLI 加 `--browser`/headless sidecar（在线复核只在 DevConsole headed 窗口做）。

**fixture 两形态（勿只用单文件跑多跳动作）**：`--fixture` 传**文件** = 整份快照覆盖所有请求（单跳够用）；传**目录** = 读 `<dir>/index.json` 的 `routes` 按 URL 逐条匹配（可选 `headers` 条件做**请求头分流**），未命中**显式报错**。多跳动作（`play` 两跳、`getExplore` 1+N、`listings` 逐叶子）必须用目录形态——单文件会把 A 的响应喂给 B，症状是「JSON 解析失败」这类假故障；**同一 URL 两副面孔（判别开关是请求头）时必须给两条路由各挂 `headers`**，否则另一副静默拿到错内容（详见 docs/fixture-modes.md）。

**危险能力显式屏蔽**：`require`/`process`/`Buffer`/`setTimeout`/`setInterval`/`setImmediate` 等置 `undefined`（见 `sandbox.ts`）。其中**定时器类**（setTimeout 等）刻意禁用——引入时间相关的隐式行为、破坏可重放性、且无对应宿主语义。但「异步暂停」本身不禁：`$lib.http`（暂停等网络）与 `$lib.ui`（暂停等人类）都是合法的、可录放的异步原语（经 `onRequest`/`onUiRequest` 由宿主提供结果，fixture 可回放）。二者同构——确定性来自「外部输入被记录、可重放」，而非「无暂停」。「禁 callback 撞确定性」的理由由此作废。新增异步能力前判它属于哪类：定时器/隐式时间 → 禁；显式暂停等外部系统、经宿主回调拿结果 → 许。

## cookie jar 跨 run 共享

`createHttpAPI(onRequest?, sharedStore?)` 的 cookie jar 默认 per-run 短命（随 sandbox 销毁）。**登录场景必须传共享 jar**：登录 run 写入的 session cookie，后续读取 run 才能带上，否则「登录后读取」不成立。

- 类型：`CookieJar = Map<string, Map<string, SimpleCookie>>`（domain → name → cookie），导出自 `runtime/http.ts`。
- 透传链：`RunOptions.cookieStore` → `buildSandbox` → `createSandbox({ cookieStore })` → `createHttpAPI(onRequest, cookieStore)`。
- 宿主（如 DevConsole `plugin-service.ts`）持模块级共享 jar 注入每次 run。CLI 每次 run 是独立进程，跨进程不共享（进程内足够）。
- 隔离：按域隔离，多源同域才会串。如需按插件隔离，需让 http 层感知插件 id（当前未做，debug 场景可接受）。

## `$lib.http.post` body 约定

`post(url, data?, options?)`：`data` 为**字符串时原样透传**（用于 `application/x-www-form-urlencoded` 等已编码体）；为 `Uint8Array`/`$lib.Buffer` 时按字节原样发出（加密接口的二进制体）；为对象时 `JSON.stringify`。写侧动作（登录等）发表单：传字符串 body + `options.contentType: 'application/x-www-form-urlencoded'`。收二进制响应加 `options.responseType: 'base64'`。改此约定前确认不破坏既有对象型 post 调用。

## 动作分派（`executeRun`）

`commands/run.ts` `executeRun(pluginFile, action, target, options)` 按 `VALID_ACTIONS` 派发到插件方法。新增动作时三处同步：`VALID_ACTIONS` 集合 + 错误信息文案 + 分派分支。

现有动作：`list` / `detail` / `search` / `reading` / **`play`** / `categories` / `listings` / `explore` / `tags` / `setting-action` / `login` / `logout` / `me` / `invoke`（最后一个为通用写侧调用：方法名与参数全由调用方给出，宿主通用直调、不映射方法）。

> `list` 动作支持 **`--url <url>`**（页面通道）：透传进 `PluginContext.url`，插件按
> URL 分派到任意列表页解析；`--url` 与 `--category` 可并存（插件定优先级）。
> 另支持 **`--channel <id>`**（列表通道标识）：原样透传进 `PluginContext.channel`，
> 插件优先按它分派、无则回退 URL 正则（`listings` 逐叶子透传 `Listing.channel`）。

## explore 动作（探索页条目）

`explore` 分派到 `plugin.getExplore(context?)`。**listings-first**：`--url`
为**探索页标识**（对应 `getListings()` 里 `kind:'explore'` 条目的 url 字段），透传为
`context.url`（无 url 即 `undefined` = 默认探索页）。旧插件忽略多参零改动；带 context
分支的新插件可按 url 返回不同分区（多探索页）。

## tags 动作（标签索引页 + 分页 + 页级筛选）

`tags` 分派到 `plugin.getTags(context?)`（`TagContext={page?, category?}`，无参时零参调用 legacy 行为），返回 `TagIndex`（legacy 裸 `TagGroup[]` 全量云）或 `TagResult`（`{groups, pagination}` 分页云）；`--page/--category` 透传 context——`category` 是**标签索引页自己的筛选组合串**（与 `list` 的 `category` 同口径同编码，`RunOptions.category` 一字段两用途、按动作分派），如 kvs_site_a `type=album`（换抓图集侧索引页）。**`TagContext.sort` 已退役**（那曾是宿主硬编码的单站排序档，对无此能力的站是假能力；服务端排序现在是普通筛选组）。**标签索引不是视频列表**：`fetchList({url:'/tags/'})` 须报错指引到 `getTags`，标签视频列表走 `/tags/<slug>/` 页面通道。`--fixture` 覆盖单次索引抓取（kvs_site_b fixtures：`tags.html`）。

## play 动作（语义泛化）

`play <出流入口URL>`（target 必填）：分派到 `plugin.fetchPlayUrl(url)`，返回 `PlayUrlResult`
`{url, referer?, platform?, poster?, duration?}`。**target 泛化**：可为剧集播放页、视频详情页，
或任何能解析出最终流的页面——插件在入口页内多跳（详情 → 解包参数 → 解析接口/加密链路 →
m3u8/直链），复用 `$lib.http`/`$lib.CryptoJS`。`--fixture` 只覆盖第一跳（入口页抓取）——
解析接口等后续跳需在线；离线验证建议以「第一跳能解出入口页内嵌参数」为断言，完整链路走在线。
plug-in 侧契约见 SKILL「懒播放解析与文本阅读」。

## listings 命令（/ / 导航树 / 探索页条目）

`node runtime/dist/index.js listings <id> --dir lingshu-plugins`：跑 `getListings()`
后**递归验证导航树**：分组结点（带 `children`）只打印并递归子项；**叶子目录页用其 `url`
（页面通道）优先、否则 `category`** 调 `fetchList` 验证能出条目（两者都缺省用
默认列表）。**`kind:'explore'` 的叶子改调 `getExplore`**（带 url = 探索页标识
透传 context，无 url = 默认探索页），验证返回分区数；explore 条目不消费 filters（打印
「探索页不消费筛选」提示）。** + `kind:'tags'` 的叶子改调 `getTags`**（`url` 仅展示/回退），
验证归一化双形态（Array = legacy 全量，Object = 分页信封，打印 `[page=N hasMore=]`），
返回组数/标签数（空索引判失败）；**tags 叶子同样消费 `filters`**——打印筛选摘要
并**用 `getTags` 验证组合串**（不是 `fetchList`）。
输出带缩进展示树形层级。实现见 `commands/listings.ts`
（内部复用 `executeRun` 的 `listings` / `list` / `explore` / `tags` 动作，`--fixture` 可选）。

**（目录页筛选）**：listing 可携带 `filters: CategoryGroup[]`。命令对声明了
filters 的目录页：打印筛选组摘要（组名 × 选项数，分节组按节计数并取首节首叶子作首选项，`display:'tags'` 后缀 `·tag`），并**用「category + 每组前 2 个非空 id 选项」组合查询串调消费该筛选的动作**
（`list` 叶子走 `fetchList`、`tags` 叶子走 `getTags`，带 `url` 时一并传）验证筛选参数能被消费。**只验首项不够**：类型开关的首项往往就是 listing 自己那页，会漏掉真正换页的那一支（kvs_site_a `type=album`）。筛选验证是**增强信息而非硬门槛**：
目录页本身 fetchList 出条目才是通过标准；筛选验证失败（如站点反爬拦截 `/show/`，
movie_site_c 案例）只提示不置 exitCode，与「不冒充能力」原则一致——声明了筛选但站点
不可达时，命令如实展示而非误判失败。

**筛选组联动（勿回退）**：联动静态校验收敛在 `src/filters-linkage.ts`
（5 类 error 判失败 exitCode=1，覆盖不全只 warn）；摘要给联动子组打 `→父key` 标记，
并逐父值 × 子首选项打组合探针（上限 8 组，只提示不判失败）。校验逻辑禁各命令自写一套。

**落页自声明筛选**：叶子额外打印一行 `落页自声明筛选（ListResult.filters）: 组名(N项) / …`——
它与目录页内嵌 `filters`（上面「filters: …」那行）是**两个来源**，刻意分开打印；
只在结果真带 `filters` 时出现，不消费也不判失败（那是列表页属性，不是目录页属性）。

**网站原页标注（2026-10）**：每个叶子目录页额外打印 `[原页=<地址>]` 或 `·无原页`，取法与
iOS 宿主 `WebsiteOrigin.listingOriginAddress` **同一口径**（显式 `origin` 恒优先 > 非探索页的
`url`；`category` 永不当地址、`kind:'explore'` 的 `url` 是探索页标识不是地址、分组结点无单一
内容页——分组结点自身不进名单、只递归子项）；末尾一行小结 `网站原页（globe）：N/M 个叶子目录页
有地址`，缺地址时在 stderr 列出叶子名（带分组路径）。**只提示不置 exitCode**：站点是否真有对应
目录页只有插件作者知道（manga_site_b 这类纯接口源本就无网页），但「没地址就没 globe」必须显式说出来——
否则整份 listings 缺地址时发现页各页签一颗按钮都没有，CLI 却是一片 `✓`（video_site_f 21 条叶子曾静默
全缺，2026-10 修）。

判定原则：一个目录页 fetchList 抛错或返回空数组即视为未通过（`exitCode = 1`），
但输出仍继续验证其余页签，便于一次看清全部目录页状态。

## 写侧交互运行时

人机交互进 Lingshu 分三个信道，按「时间位置 × 发起方」分界（详见 CONTEXT.md /）：

- **字段 schema（pre-run、宿主编排）**：`LingshuPlugin.getAccountSchema?()` 声明 `loginFields`/`cookieFields`，宿主据此渲染登录表单，收集值经 `PluginContext.inputs` 回传。
- **`login` 动作**：`executeRun` 分派到 `plugin.login(options.inputs ?? {})`，返回 `AccountLoginResult`。
- **写侧动作（`me`/`logout`/`invoke`）**：分派到 `plugin.getMe()` / `logout()` / `plugin[function](params)`（通用直调：方法名取 target，参数取 `--params` JSON；插件未导出该方法即报“插件不支持 <name>”）；终态以服务端返回为准；未登录抛错消息含 `loginRequired`。
- **多 run 流（mid-run、宿主编排）**：宿主 owns 渲染面的结构化选择（如收藏 `loadFolders` → 选夹子 → `addOrDelFavorite`），拆成多个 run、宿主编排。
- **`$lib.ui`（mid-run、插件直发，见下节）**：插件在 run 中途直问用户（验证码/确认/toast/开链接）。

## `$lib.ui` 运行时

`runtime/ui.ts` `createUiAPI(onUiRequest?)`：插件直问用户的命令式信道，Promise 式 `await`（非 Venera callback）。窄口径——只收「插件直问」类（`showInputDialog`/`confirm`/`showMessage`/`launchUrl`），不含结构化选择器（那是多 run 流）。

- **与 `$lib.http` 同构**：都是「暂停 run、等外部系统返回」的异步原语（http 等网络、ui 等人类）。`onUiRequest` 由宿主提供结果；确定性来自「外部输入被记录、可回放」（fixture），而非「无暂停」。
- **透传链**：`RunOptions.onUiRequest` → `buildSandbox` → `createSandbox({ onUiRequest })` → `createUiAPI(onUiRequest)`。
- **宿主注入**：DevConsole 桥接到前端（渲染对话框/输入框/toast，收齐人类输入后 resolve，待 ws/SSE 通道实现）；测试返回 canned 响应（等价 HTTP fixture 回放）。
- **headless 行为（无 `onUiRequest`）**：`showInputDialog`/`confirm` 清晰报错（headed 原语要求人类，不静默降级——降级会把验证码吞成空串、藏起 bug）；`showMessage`/`launchUrl` 静默 no-op（非关键副作用）。
- **`executeRun` 透明**：run 仍是「调一个方法→拿结果」，方法内部 `await $lib.ui.*` 对 executeRun 透明，无需新动作；`login` 等写侧方法可直接在中途 `await $lib.ui.showInputDialog()`。

## 测试

`src/__tests__/` 用 vitest。合成插件需带 `// ==Plugin== ... // ==EndPlugin==` 元数据头（`parsePluginMeta` 强制）。写新测试参考 `settings.test.ts` / `account.test.ts` 的合成插件模式。

**vitest 不做类型检查（勿只看测试全绿）**：`tsc` 连 `src/__tests__/` 一起查（`npm run -w devconsole typecheck` 前置 `build:runtime`），契约里的联合类型/可选字段必须显式收窄——`PageJumpTarget` 是联合（`search` 变体没有 `url`/`filters`）、`CategoryGroup.items` 可选、`feed[0]` 在 `noUncheckedIndexedAccess` 下可为 undefined，直接点下去就是一堆 TS2532/TS2339，**而 vitest 全绿**（2026-10 kvs_site_a 测试实测：39/39 绿 + 12 条类型错误，门禁整条红）。

## 文档索引

| 主题 | 文档 |
|---|---|
| 宿主统一挑战错（判定表 + `challengeError` 构造器） | `docs/challenge-stub-message.md` |
| 二进制 HTTP 与 gzip（post 发字节 + `responseType:'base64'` + `$lib.zlib` 字符串通道） | `docs/binary-http.md` |
| 编程式 API 入口（`lib.ts` 出口政策、dist 消费面） | `docs/program-api.md` |
| fixture 两形态（单文件 vs 目录 / `index.json` routes / 未命中报错） | `docs/fixture-modes.md` |

**挑战识别下沉宿主（勿回退插件判定）**：`$lib.http.get` 命中共享表即抛统一 `CHALLENGE`（`runtime/challenge.ts` 构造，`Lingshu:` 前缀禁站名）；插件只留直连 + `assertParsed` 解析兜底，挑战原样上抛交宿主验证入口（**插件侧浏览器重抓已退役，**，见 docs/challenge-stub-message.md）。

**二进制走显式通道（勿用文本通道传字节）**：发二进制必须传 `Uint8Array`/`$lib.Buffer`（宿主按字节发出），收二进制必须 `responseType:'base64'` + `$lib.Buffer.from(body,'base64')`，gzip 经 `$lib.zlib` 字符串通道；文本 `body` 透传/解析二进制恒坏（详见 docs/binary-http.md）。

**契约类型全量转发（勿回退手工白名单）**：`src/lib.ts` 的契约类型一律 `export type * from './types.js'`——手工白名单会随 `types.ts` 增字段而漂移，消费方只报 TS2305 而单测全绿（2026-10 曾漏列 3 个类型）。`exports` 指向 `dist`，改 `src` 后消费方须先 build（详见 docs/program-api.md）。

**包根是 Node 入口，浏览器侧值 import 必须走 `lingshu-runtime/card-dsl`（勿从包根拿）**：包根 `dist/lib.js` 会带进 `runtime/storage.js` 等 Node-only 模块，浏览器打包器在生产构建里报 `"fileURLToPath" is not exported by "__vite-browser-external"`（`vite dev` 容忍、`vite build` 整包失败，2026-10 实测）；**类型 import 无所谓**（编译期擦除），新增浏览器可用的纯逻辑要一并加子路径出口（详见 docs/program-api.md）。

# 网站分析指南（frx-director MCP）

本指南把“分析目标源”这步工程化：用 frx-director MCP 控制浏览器实测真实站点，判定列表/详情的数据来源、采集离线 fixture、确认选择器或接口结构。**优先用这里的流程，而非凭经验猜测。**

> **实时为准原则（frx-director-mcp 更新频繁，本文数值均为快照）**：开工前先实时读取官方 README（`https://raw.githubusercontent.com/WhiteNightShadow/frx-director-mcp/refs/heads/main/README.md`）的“快速开始 / 工具接入自检 / 工具参考 / 版本更新记录”四节，再调 `agent_tools` 核对工具名与参数。以实时读取为准；本文的工具数量、参数模板、模型名均为快照，不得硬抄。直驱信封统一为 `agent_call_tool({name, args})` 单对象形式，下文 `agent_call_tool("xxx", {...})` 均为其简写。

## 目录

- [调用通道（两种，互斥）](#调用通道两种互斥)
- [工具映射速查（js-reverse → frx-director，快照：参数名以实时 `agent_tools` 为准）](#工具映射速查js-reverse--frx-director快照参数名以实时-agent_tools-为准)
- [0. 前置：打开页面与开启捕获（参数快照，实调前先 `agent_tools` 核对）](#0-前置打开页面与开启捕获参数快照实调前先-agent_tools-核对)
- [0b. 备用：frx 不可用时用 chrome-devtools 顶上（L1，2026-09 video_site_d 实证）](#0b-备用frx-不可用时用-chrome-devtools-顶上l12026-09-video_site_d-实证)
- [1. 判定数据源类型（JSON API vs HTML）](#1-判定数据源类型json-api-vs-html)
- [2a. JSON API 路径](#2a-json-api-路径)
- [2b. HTML 路径](#2b-html-路径)
- [3. 详情页分析](#3-详情页分析)
- [4. 进阶：签名 / 加密参数（当接口请求带动态签名时）](#4-进阶签名--加密参数当接口请求带动态签名时)
- [5. 产物清单（分析阶段必须落到 `_fixtures/<plugin-id>/`）](#5-产物清单分析阶段必须落到-_fixturesplugin-id)
- [6. 站群分析（一份代码多域名时：判身份字段、划内容池）](#6-站群分析一份代码多域名时判身份字段划内容池)

## 调用通道（两种，互斥）

frx-director 的浏览器能力通过 `agent_call_tool({name, args})`（**director 直驱**）或 `agent_start({task, targetUrl, ...})` + `agent_send({tid, guidance})`（**委派 worker**，`tid` 为 `agent_start` 返回的会话 id，后续 `poll/read/send/stop/set_mode` 均带 `tid`）触达。**同一时刻只能用一种**——运行中的 agent 会话会拒绝 `agent_call_tool`，直驱期间也别再 `agent_start` 起 worker（抢同一标签页被拒）。工具名前缀去客户端前缀后以 README 为准（本仓库实测为 `mcp__frx-director__*`）。

| 场景 | 推荐通道 | 理由 |
|---|---|---|
| 第 1-3 节常规分析（判定数据源、采 fixture、试选择器） | **director 直驱** `agent_call_tool` | 步骤确定、需精确控制；直驱一轮拿结果最省心 |
| 第 4 节签名/加密参数逆向 | **委派 worker** `agent_start` + `agent_send` | 费时、多轮试错；交给便宜 worker 模型磨，省 director token |

下文工具名（`page_navigate` / `net_list` / `net_get` / `page_eval` / `code_search` / `signer_trace` …）均为 frx-director 浏览器引擎工具示例，全量以实时 `frx-director_agent_tools()` 为准（有无改名、参数叫什么都以它为准）。直驱时用 `agent_call_tool({name, args})` 调用；委派时把工具名写进 task/guidance 交给 worker。

> 开跑前先按 SKILL.md「阶段 0」做浏览器前置检查（`frx_status` → 桥断则 bash 诊断 + 手动拉起 → 速死则查 pitfalls；委派前另需 `hasKey=true`）。`fs_*` 默认落在会话工作目录（以 README“逆向产物在哪里”实时节为准）：保持默认工作目录、导出后再拷到仓库 `lingshu-plugins/_fixtures/` 下，不要直接把工作目录指到仓库根。`agent_start` 是否支持改工作目录、参数确切叫什么，以实时 `agent_tools` 为准。

## 工具映射速查（js-reverse → frx-director，快照：参数名以实时 `agent_tools` 为准）

| 旧（js-reverse） | 新（frx-director） | 备注 |
|---|---|---|
| `new_page(url)` / `navigate_page(reload)` | `page_navigate({ url })` | frx 单标签模型，无 select_page，直接导航 |
| `clear_network_requests` | `net_capture({ action:"clear" })` | start/stop/clear |
| `list_network_requests(resourceTypes)` | `net_list({ method })` 列摘要 + `net_get({ id, includeBody:true })` 取详情 | net_get 一次给齐 body + 请求头 + initiator 调用栈 |
| `evaluate_script(fn)` | `page_eval({ expression })` | 在页面执行任意 JS（wantXrays:false，全权） |
| `get_request_initiator(reqid)` | `net_get({ id })` 的 `initiatorStack` | net_capture 期间自动抓的 JS 发起调用栈 |
| `get_script_source` / `save_script_source` | `scripts_list({ urlPattern })` + `scripts_save({ url, toWorkspace:true })` | toWorkspace 落到 <工作目录>/scripts/ 可 run_node |
| `search_in_sources(query)` | `code_search({ query, regex })` | 在已捕获脚本里搜字符串/正则 |
| `break_on_xhr` + `get_paused_info` + `step` | `signer_trace` / `closure_read` / `hook_inject` / `page_eval` 装 hook | frx 用高层 trace 工具替代手摇断点 |

## 0. 前置：打开页面与开启捕获（参数快照，实调前先 `agent_tools` 核对）

- **director 直驱**：`agent_call_tool({name:"page_navigate", args:{url}})` 打开目标页（列表页优先）。
- **网络捕获是“先 start 再触发、非回溯”的**：页面若在捕获前已加载完，历史请求不会被记录。所以分析前先 `agent_call_tool({name:"net_capture", args:{action:"start", captureBody:true}})`，再 `agent_call_tool({name:"page_navigate", args:{url}})` 重新导航，确保要分析的请求都在窗口内。`net_capture` start 会**同时抓到 XHR/fetch/beacon/WS 请求的 JS 发起调用栈**（`initiatorStack`）——定位“谁生成了签名参数”的金矿，栈只在请求发起那一刻抓得到，务必先 start 再触发。
- 需要重置登录态/缓存时用 `cookies` 工具清（动作与参数以实时 `agent_tools` 为准，如 `cookies({action:"remove", all:true})`）或重置环境；普通分析不必。

## 0b. 备用：frx 不可用时用 chrome-devtools 顶上（L1，2026-09 video_site_d 实证）

`frx_status` 报 `bridgeConnected=false`、按 `browser-startup.md` 恢复仍不通（或本环境无 Firefox Reverse），但有 chrome-devtools MCP 时，不必死等 frx——chrome 侧同样能完成第 1-3 节常规分析（签名逆向仍建议回 frx 委派 worker）。工具映射：`page_navigate` → `mcp__chrome-devtools__navigate_page`、`net_list` → `list_network_requests(resourceTypes:["xhr","fetch"])`、`net_get` → `get_network_request(reqid)`、`page_eval` → `evaluate_script(function)`。两点差异：① chrome 侧网络列表是导航后累积（无"先 start 再触发"要求），交互（翻页/搜索/切页）后重调 list 即可看到新请求；② body 超长被截断时，用 `evaluate_script` 内 `fetch(url).then(r=>r.text())` 复读确认全量结构。SSR 判定：切到分类/详情页后 xhr/fetch 列表里**零业务请求**即 SSR 落页——插件侧直接调其底层 JSON API（从已加载 chunk 内 `/api/` 字符串、或一次站内搜索/翻页交互暴露），不解析 RSC payload。首屏 SSR 有数也不等于无分页：必须滚屏到底/点下一页后重查 `net_list`（video_site_j 首屏 `initialPosts` 24 条像无分页，滚屏后才暴露 `/api/feed?offset=` 游标接口，v1.0 曾误判）。curl 只能看到 Next.js 骨架时，必须经真实渲染抓包，勿凭 chunk 字符串猜接口全集（video_site_d 静态 chunk 仅暴露 2 个 `/api/`，实测有 7 个）。例外：底层 API 覆盖不全时（如详情接口只覆盖主表、搜索索引独有推文查无），允许回退解析 SSR 内嵌 flight JSON——配平规则与标准 JSON 相反：flight 里所有引号都带反斜杠，反斜杠串奇数才是结构引号、偶数串是值内转义（video_site_d `extractFlightTweet` 实证，错用标准逻辑会进串永不退出）。JS 单层解码必须完整处理转义：`\uXXXX` 按码点解、`\\n` 回车按换行——朴素“取反斜杠下一字符”会把 `\u0026` 吃成字面 `u0026`，标题静默带脏（video_site_j 实证：`>-<` 变 `u0026gt;-u0026lt;`，不报错）；数组形态（`initialPosts`）与按 slug 验签的 `"post"` 对象复用同一套配平+解码（video_site_j `extractInitialPosts`/`extractPostBySlug`）。

## 1. 判定数据源类型（JSON API vs HTML）

这是最关键的一步，决定插件走哪条解析路径。开捕获并重载页面后：

```
agent_call_tool({name:"net_list", args:{method:"GET"}})        # 或 { method:"POST" }，参数名以实时 agent_tools 为准
```

浏览捕获到的请求，找**返回列表/详情数据的那一个**，用 `agent_call_tool({name:"net_get", args:{id, includeBody:true}})` 看 body 判定：

| 信号 | 结论 |
|---|---|
| 某个接口返回的 JSON 里直接含列表/详情字段（title、列表数组、正文等） | **JSON API 路径**（如 bilibili popular、zhihu daily api） |
| xhr/fetch 全是埋点/统计（host 形如 `collector.*`、`*/stats`、`*/collect`、`*.google-analytics.com`），没有业务数据 | **HTML 路径**（SSR，数据在文档里，如 github trending） |
| 列表是 JSON API，但详情页是 HTML；或反之 | **混合**——列表、详情分别判定 |

过滤技巧：`net_list({ urlPattern:"api" })` 或 `{ urlPattern:"list" })` 缩小范围；用 `method` 区分 GET/POST；一眼排除静态资源与埋点 host。

> 经验：很多站点列表走 API、详情走 SSR，或反过来。**列表和详情要分别走一遍本指南**，不要假设两边同源。

## 2a. JSON API 路径

1. 用 `agent_call_tool({name:"net_get", args:{id, includeBody:true}})` 打开命中接口的详情，记下：
   - **URL 模板**（哪些是固定段、哪些是 `pn=1`/`category=xxx` 这类参数）
   - method（GET/POST）、**必要的请求头**（User-Agent、Referer、Cookie、自定义签名头等，都在 `reqHeaders` 里）
   - 响应结构：列表数据在哪个字段路径下（如 `data.list`、`stories`、`result`）
2. 把响应体存为 fixture：
   ```
   agent_call_tool({name:"fs_write", args:{path:"lingshu-plugins/_fixtures/<plugin-id>/list.json", content:<响应体>}})
   ```
   （`fs_*` 落在会话工作目录，默认需拷到仓库 `lingshu-plugins/_fixtures/` 下；`path` 写法与工作目录含义以实时 `agent_tools` 的 `fs_write` 说明 + README“逆向产物在哪里”实时节为准。）
3. 字段映射：对照同目录 `data-model.md`，把接口字段映射成 `ListItem` / `ArticleDetail`。例如 `{ aid, title, pic, bvid, pubdate }` → `{ id: String(aid), title, coverUrl: pic, url: .../bvid, publishTime: pubdate*1000 }`。

## 2b. HTML 路径

1. 采集 HTML fixture（二选一，参数名以实时 `agent_tools` 为准）：
   - **取 document 响应体**（推荐，最贴近插件 `$lib.http.get` 收到的原文）：
     ```
     net_list({ method:"GET" })  → 找到列表页 document 的 id
     net_get({ id, includeBody:true })  → 取 body，再 fs_write 存为 list.html
     ```
   - **或用 page_eval 取渲染后 DOM**（含 JS 动态注入的内容，适合客户端渲染）：
     ```
     agent_call_tool({name:"page_eval", args:{expression:"document.documentElement.outerHTML"}})  → fs_write 存为 list.html
     ```
2. **试跑选择器确认**（必须在写插件前验证能取到字段）：
   ```
   agent_call_tool({name:"page_eval", args:{expression:`
     (() => {
       const rows = document.querySelectorAll('article.Box-row')
       const first = rows[0]
       return {
         count: rows.length,
         href: first?.querySelector('h2 a')?.getAttribute('href'),
         title: first?.querySelector('h2 a')?.textContent.trim(),
         desc: first?.querySelector('p')?.textContent.trim()
       }
     })()
   ` })
   ```
   把能稳定取到 `id`/`title`/`url`/`summary` 的选择器记下来。多试几行（取第 1、中间、最后一行）确认选择器在全列表都成立，不是首行特例。
3. 字段映射到 `ListItem`；详情页 HTML 同理映射到 `ArticleDetail.blocks`。

## 3. 详情页分析

从列表结果里取一个真实的 `ListItem.url`，`agent_call_tool({name:"page_navigate", args:{url}})` 过去，开捕获后重载，对详情页**重走第 1-2 步**。详情常见两种形态：

- **JSON API**：如 `api.example.com/item/<id>`，直接取 JSON 映射成 blocks（text/heading/image/video/...）
- **HTML 正文**：用选择器把正文拆成 blocks（`<p>` → text、`<h2>` → heading、`<img>` → image、`<video>` → video）

把详情响应也存为 `_fixtures/<plugin-id>/detail.json`（或 `.html`），供 `lingshu run <id> detail <url> --fixture ...` 离线验证。

## 4. 进阶：签名 / 加密参数（当接口请求带动态签名时）

部分站点（bilibili wbi 签名、抖音 X-Bogus/a_bogid、各种 `_sign`/`token`/`nonce` 查询参数）的接口请求依赖前端实时计算的签名。发现接口请求的 URL 或 header 里有看起来随机的参数时，**建议委派 worker** 跑这一节（费时多轮，省 director token）：

```
agent_start({
  task: "还原 <站点> 的 <签名参数名> 签名算法，Node 可独立复现",
  targetUrl: "<列表页URL>",
  model: "<README 前置条件实时节推荐的 worker 模型>"
  // provider / 工作目录等其他参数有无、叫什么，以实时 agent_tools 为准，不要硬抄旧示例的 provider / workspaceRoot
})
# worker 阶段门停后，用 agent_poll 等 settled，再 agent_read / agent_read_brief 看结论、agent_send({tid, guidance}) 给方向
```

**worker 模型选型（红线，以 README 实时节为准）**：务必标准 / 快速档（编写时快照为 `deepseek-v4-flash`），**切勿用推理档**（如 `deepseek-v4-pro`）——推理档在长工具循环里易退化成"只吐纯文本计划、不再调用工具"，是 worker 首要失败模式（官方实测结论，详见 README“前置条件”实时节）。

**指挥闭环**（`agent_start` 返回 tid 后）：`agent_poll({tid, ...})` 短轮询（`running`=仍在跑，继续等，不是失败）→ `settled` 后 `agent_read_brief({tid})` / `agent_read({tid})` 看结论 → `agent_send({tid, guidance})` 写具体有序的纠正（"只做第 1+2+3 步""每步先验证再下一步"，防兔子洞）→ 路线锁定仅剩机械收尾时 `agent_set_mode({tid, mode:"auto"})` 无人值守，跑偏则 `agent_stop({tid})` 截停再纠正（进展已落盘，不丢失）。**采信结论前必看 `driftHint`**：勿把"漂移成纯文本 / idle 超时"误判为"路线走不通"。

按下述追踪（worker 执行，或 director 直驱都行；下文工具名均为快照，有无改名、参数叫什么以实时 `agent_tools` 为准）：

1. **定位发起代码**：`net_get({ id })` 直接读该请求的 `initiatorStack`（frx 在 `net_capture` 期间自动抓的 JS 调用栈），一眼定位发起签名的函数位置。比 js-reverse 时代的 `get_request_initiator` + `search_in_sources` 更直接。
2. **读源码**：用 initiator 给的 URL/位置 `scripts_save({ url, toWorkspace:true })` 落盘再 `fs_read`，或 `code_search({ query:"<签名参数名>" })` 在全站脚本里按关键词（签名参数名、`sign`、`md5`、`hmac` 等）定位。
3. **运行时取证**（按需选工具，从轻到重）：
   - **`page_eval` 装 hook**（首选，最省事）：包 `window.fetch`/`XHR`/`crypto.subtle`/具名全局 → 交互触发 → 读 `window.__log` 拿签名 I/O。简单非-JSVMP 站看签名输入输出**首选它**。
   - **`hook_inject`**（治首屏/导航就触发的签名，page_eval 装 hook 来不及）：document-start 注入，跨刷新存活。
   - **`signer_trace`**（重家伙，目标是闭包内部 / 模块 export 的 signer、`page_eval` 包不到时）：引擎层 Debugger 旁观，抓签名函数的**真实入参**（arguments）——签名器收到的 URL/路径实参究竟是完整 URL/相对路径/带不带 query，别再靠猜和暴力试输入。
   - **`closure_read`**（signer_trace 互补）：读函数**闭包绑定**——dispatcher / 解码后字节码 / S-box / 常量池，JSVMP 逆向反复撞的根因（signer_trace 读入参，closure_read 读闭包）。
   - **`jsvmp_trace` / `jsvmp_split_dispatcher` / `jsvmp_disassemble`**（纯 JSVMP 虚拟机站点）：拆 dispatcher（switch-case 用内置 babel，if-else/跳转表走 `dispatcher_probe` 兜底）→ 反汇编字节码。
   - **`wasm_probe` / `wasm_disasm`**（wasm-bindgen 签名器）：`wasm_probe` hook 所有 wbg import 打 I/O，揭示 wasm 在 sign 时读了哪些 DOM/env（选择器/属性名）；`wasm_disasm` 用 wabt 转 WAT。
   - **`whitebox_diff`**（复刻跑偏时）：浏览器真值 vs Node 复刻的引擎级 trace 差分，白盒定位"复刻在哪条分支/哪个 import 走偏"。
   - **`crypto_scan`**：给一段疑似 S-box/密钥/字节码 → 一眼判出用了哪些加密原语（RC4/XXTEA/MD5/SHA/AES/SM4/自定义 base64）。
4. **在插件里复现**：用 `$lib.CryptoJS`（MD5/SHA/HMAC/AES）、`$lib.crypto`（Node crypto 兼容层，createHash/createHmac）、`$lib.Buffer`、`$lib.iconvLite`（非 UTF-8 编码）把签名算法实现出来。注意时间戳/nonce 的取法要与站点一致。可在 frx 工作目录用 `run_node`（必要时先 `npm_install` 装 `crypto-js`/`sm-crypto` 等）先跑通再搬进插件。

> 这一步通常最耗时。先把无签名也能跑的列表/详情路径打通，再啃签名参数。

## 5. 产物清单（分析阶段必须落到 `_fixtures/<plugin-id>/`）

- `list.json` 或 `list.html` —— 列表 fixture
- `detail.json` 或 `detail.html` —— 详情 fixture
- 一份简短的分析记录（可写在插件文件头注释或 PR 描述里）：数据源类型、接口 URL/参数/必要头、关键选择器、是否涉及签名

这些 fixture 直接供"阶段 3 验证"里的 `lingshu run <id> list/detail --fixture ...` 离线使用，也作为后续回归快照。

## 6. 站群分析（一份代码多域名时：判身份字段、划内容池）

排查目标站时，若发现**同一份前端 bundle 服务多个域名**（配置按「当前域名」分支写死）、
或 DNS/证书记录指向同一批镜像，就是撞上了站群。此时要先摸清「哪些域名是同一站」，
再决定做几个插件——**不要一个域名一个插件地盲做**。

**① 域名清单从哪来（比抄参考脚本的 MITM 列表更全）**：共享 bundle 里的配置判断本身就是清单。
在该 bundle 中搜「与当前域名比较」的分支（如 `M.app`：`"a.com"==M.app || "b.net"==M.app ? …`），
把所有被比较的域名提取出来即候选全集（fleet_site_a 案例：78 个候选，参考脚本 MITM 只列了 40 个）。
注意剔除**字符串拼接产物**（`"shirotos.com"+"xxx"` 会提取出 `shirotos.comxxx` 这种假域名）。

**② 站点身份字段靠对照实验定**：先抓一次浏览器真实渲染的条目 id，再用 Node 只改「身份字段」
逐值复测，**与浏览器 5/5 重合的那个值才是该站身份**（fleet_site_a 案例：请求体 `app` 字段 = 站点域名；
`app=porntube.cool` 5/5 重合、`app=fleet_site_a.com` 0/5）。顺带能确认后端对未知身份是**宽松兜底**
（32/32 个 app 值都返回有效数据，无配置的落默认池）——这决定了「插件能否换一个字段覆盖多站」。

**③ 划内容池的指纹必须用「频道列表」，不能用「首页推荐位」**（本指南最容易踩的坑）：
首页板块（`home_*_8` 这类）是**运营推荐位**，在站群内共享/轮换，用它做指纹会得到
「所有站内容都差不多」的**错误结论**（实测同一批站：首页指纹两两 Jaccard 0.33~0.60、
看着像同池；换频道列表指纹后组内 1.00、组间 0.00，分组立刻清晰）。
判据：**用「同一 `type` 取值下的列表 id 集合」做指纹**（多频道 × 多页），
Jaccard ≥ 0.8 归同池。fleet_site_a 案例最终得 14 池 / 72 域名。

**④ 域名相似 ≠ 内容归属**：`1024movies.com` 看着与 `fleet_site_a.com` 同族，
实测落在**默认池**、与后者内容**零重叠**。反之多个 TLD 变体（`xchina.cloud/.cool/.day/…`）
往往是**同站抗封锁镜像**（内容完全相同，做一个即可）。**结论一律以指纹实测为准，别按域名猜。**

**⑤ 框架识别（影响「能不能直接 Node 复刻」的判断）**：Angular + Ionic 的特征是
`data-beasties-container` / `<app-root>` / `--ion-color-*`（主题变量）/ `__zone_symbol__*` /
元素上的 `_ngcontent-*` 属性；Vue 是 `data-v-*` / `__vue__`。二者都可能是 webpack 产物，
**别只看 `polyfills.js`/`main.js` 就断定是 Vue**（fleet_site_a 曾被笔记误记为 Vue，实为 Angular）。
壳页无内容 ≠ 没有数据：SPA 的业务数据全在 API 里，直接走 §1 的接口判定即可。

**⑥ 泛化时唯一需要逐站做的事是「页面 URL 形态」**：后端统一（动作集/密钥/频道 type 空间全家族一致）、
前端路由却各站有别（`/?type=X&page=N` vs `/videos?page=N&type=X`；有的站还有额外内容类型如 `/posts`），
逐站补 listing 的 `url` 即可，抓取逻辑不用改。

**⑦ 落地：站群插件的组织方式（`fleet_site_b.plugin.js` 实证，14 站 / 126 目录页全绿）**：

- **站点身份走「双通道解析」**：`fetchList` 的站点取 `context.category` 里的 `app=`（宿主在目录页
  筛选时会带上）→ 回退页面 URL 的 host → 回退默认站。这样**无筛选时靠 url（页面通道）、
  有筛选时靠 category**，两条路都能定位到同一个站；`category` 串形如
  `app=<域名>&type=<频道>`，用户筛选后宿主追加同名 `type`，靠 「同名后者覆盖」自然生效。
- **listings 顶层按「站点」分组**（`children`），每站内挂一个「发现」+ N 个频道；
  频道 URL **统一用 `/?type=X` 形态**——实测该形态对全家族通用（有的站前端导航用
  `/videos?page=N&type=X`，但直访 `/?type=X` 照样渲染，站点内部再规范化），
  于是不必逐站适配路由。
- **每站内挂的频道可以比该站前端导航多**：`type` 空间是后端定义（§7 矩阵全一致），
  各站前端只是子集（fleet_site_a 挂 8 个、xjjav 只挂 4 个），未挂出的 type 直访 URL 照样出内容
  ——**给全量不违反「不冒充能力」**（服务端确实支持），但仍应在文档里说明来源。
- **同池镜像只取一个域名**：池内多域名内容完全相同（§5），做多个零增量；
  成员列表写进代码注释留档即可。
- **多站探索页**：每站一个 `kind:'explore'` 叶子，`url` 用自定义标识（如 `site:<key>`）、
  `origin` 写该站首页真址；`getExplore(context)` 按标识切站返回该站首页板块。
  （`url` 是探索页标识不是地址，见 listings.md 规则 14/15。）
- **验证口径**：`runtime listings <id>` 必须逐叶子全绿（本例 126/126 目录页、126/126 原页地址），
  再加一轮**跨站端到端**——对每个站各取一条视频跑 `detail` + `play` 并**实测拉流**
  （本例 14/14 站 m3u8 200 + 分片正常），这才能证明「一个插件覆盖 N 站」不是纸面结论。

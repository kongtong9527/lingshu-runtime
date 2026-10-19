---
name: lingshu-plugin-dev
description: 为灵枢(Lingshu)开发/调试数据源插件(.plugin.js)：分析目标站(HTML/JSON API)、实现 fetchList/fetchDetail 等导出、用 $lib 受控能力解析、用 lingshu CLI 离线 fixture 验证。当用户说「支持某个网站」「新增内容源」「写个插件」「抓一下这个站」，或插件报错、列表返回空、详情恒报不存在、封面不显示、要补分类/搜索/阅读页/目录页/播放解析时使用。不适用于宿主侧（DevConsole/iOS 渲染、HLS 播放链路）与插件仓发布审核。
---

# 灵枢插件开发 Skill

**用途：** 为灵枢(Lingshu)漫画/视频/新闻/阅读器开发数据源适配器插件（`.plugin.js`）。输入一个站点，输出单文件插件 + 离线 fixture + 可复跑的验证命令。

## 先看这里：按场景跳转

| 你要做的事 | 先读 |
|---|---|
| 第一次给一个站写插件 | 本文件「开发工作流」阶段 0 → 4，照顺序走 |
| 不确定插件能导出哪些方法/字段长什么样 | `references/data-model.md`（顶部有目录） |
| 要写自定义卡片 | `references/card-dsl.md` |
| 遇到怪现象（解析空、id 截断、封面糊、CF 拦截…） | `references/pitfalls-index.md` 按关键词搜，再读 `pitfalls.md` 同条全文 |
| 需要浏览器实测、签名逆向 | `references/website-analysis.md` |
| 图片加密 / 视频播放 / 目录页 / 分发清单 | `references/image-encryption.md` / `video-playback.md` / `listings.md` / `manifest.md` |
| 找可抄的实现 | `references/examples.md`（按能力索引 15 个真实案例） |
| 母仓维护者（自进化流程） | `references/maintenance.md` |

## 适用场景

当需要为某个内容源（网站/API）开发数据抓取插件时使用：解析列表页/详情页、对接 JSON API、把内容转换成灵枢统一的 ListItem / ArticleDetail 数据模型。

本 Skill 的特点是**自动用 frx-director MCP 控制浏览器实测目标站点**来分析数据源（而非凭经验猜测），见阶段 1。

## 插件是什么

- 单文件 `.plugin.js`，自包含，**不能 require/import 外部模块**
- 通过 `module.exports` 暴露 `fetchList` / `fetchDetail`（必需）+ 可选能力：`getCategories`、`getListings`、`getExplore`、`getTags`、`search`、`fetchReadingPage`、`fetchPlayUrl`、`getSettingsSchema`/`runSettingAction`、`getAccountSchema`/`login`/`logout`/`getMe`，以及卡片 `invoke` 直调的写侧方法
- 运行在沙箱里，**只能**通过 `$lib` 命名空间访问受控能力（网络/存储/第三方库）
- 同一份插件代码在 Node.js 模拟器和未来 Swift JavaScriptCore 端行为一致

## 开发工作流

> **第三方默认走任意目录工作流**：`npm i -g lingshu-runtime` 后装 skill
> （`lingshu skill install` 装进各家 agent 的 skills 目录，全局默认 claude/cursor/codex/agents 四家；
> `--project` 装进当前项目，`--agent claude` 可收窄，`lingshu skill list` 查看包内自带），
> 然后在**任意空目录**开发，全程用全局命令 `lingshu`。下文阶段 2/3 均按此写；母仓内开发的等价命令见各节末尾「母仓等价」备注。

### 阶段 0：启动 Firefox Reverse 浏览器（前置检查，必做）

> **实时为准原则（frx-director-mcp 更新频繁；本文数值快照于 2026-10-20）**：任何实测开始前，先实时读取官方 README（`https://raw.githubusercontent.com/WhiteNightShadow/frx-director-mcp/refs/heads/main/README.md`）的“快速开始 / 工具接入自检 / 工具参考 / 版本更新记录”四节，再调 `frx_status` + `agent_tools` 核对。以实时读取到的字段名、工具名、参数表为准；本 SKILL 及 `references/*` 中的工具数量、工具参数示例、模型名、端口号等均为编写时快照，过期以实时读取为准，不得硬抄。

任何实测（阶段 1 的站点分析、签名逆向）开始前，先确认浏览器已就绪：调 `frx_status`（不同客户端工具名前缀不同，去前缀后的全名以 README 为准，本仓库实测为 `mcp__frx-director__*`），`bridgeConnected=true` 且 `ready=true`，再调 `agent_tools` 确认浏览器工具目录可用（README 基线示例为 `count:68`、`missingDeclared:[]`，实际以 README 当前版本 + `agent_tools` 返回为准）即开工；桥断 / `frx_env_open` 速死按 `references/browser-startup.md` 判定树恢复。

**启动恢复**：桥连通时禁止 kill Firefox、一环境一实例（换环境先 `frx_env_close`）、`open -a` 普通启动不带 marionette 无用、手动拉起只是恢复手段（详见 references/browser-startup.md）。

**Key 检查（按通道区分）**：直驱不需要 worker Key（`hasKey=false` 也能开工）；走委派 worker 前必须 `frx_status` 确认 `hasKey=true`，否则 `agent_start` 仅校验 `hasKey` 会被拒。`hasKey=false` 时按 README 第 0 步引导用户补 Key 后再 `frx_status` 确认。

### 阶段 1：用 frx-director MCP 分析目标源

分析的目标：搞清楚**列表**和**详情**各自的数据来源（JSON API 还是 HTML 页面），采集离线 fixture，并确认接口结构或 DOM 选择器。**优先自动调用 frx-director MCP 实测真实站点**，不要凭肉眼或经验猜。

> 完整工具序列、判定决策树、签名/加密参数等疑难场景见 `references/website-analysis.md`。
>
> **站群（一份代码多域名）先划内容池再动手**（详见 `references/website-analysis.md` §6）：域名清单从共享 bundle 的「当前域名比较分支」提取（比抄参考脚本 MITM 列表全，注意剔除字符串拼接假域名）；身份字段靠**浏览器渲染 id vs Node 换值复测**定（与浏览器 5/5 重合的那个值才是站点身份）；**划池指纹必须用「同一 type 的频道列表」而非首页推荐位**——推荐位是运营位、跨站共享轮换，用它会把「14 个池」误判成「都差不多」（实测：首页指纹 0.33~0.60 vs 频道指纹组内 1.00）；**域名相似 ≠ 内容归属**（`1024movies.com` 与 `fleet_site_a.com` 零重叠），同 TLD 变体多为抗封锁镜像（做一个即可）。

frx-director 有两种调用通道（**二者互斥，同一时刻只用一种**；不同客户端工具名前缀不同，去前缀后的全名以 README 实时节为准，官方叫 `frx_status` / `agent_tools` / `agent_call_tool` / `frx_env_*`，本仓库实测为 `mcp__frx-director__*`）：

- **director 直驱**：`agent_call_tool({name, args})`（单对象信封，README 规范写法，勿写成双位置参数 `(name, args)`）亲自跑浏览器引擎工具（示例：`page_navigate` / `net_capture` / `net_list` / `net_get` / `page_eval`，全量以实时 `agent_tools` 返回为准）。**阶段 1 的常规分析走这条**——步骤确定、需要精确控制，直驱最省心。前置检查见阶段 0。每次直调读返回信封（`ok/data/error`）再定下一步；直驱前先 `agent_tools` 查清目标工具的参数名再填 `args`，不得硬抄本 SKILL 的参数模板。**直驱不需要 worker Key**（`hasKey=false` 也能开工）。
- **委派 worker**：`agent_start({task, targetUrl, ...})` 起一个 worker agent（返回 `tid`，后续 `agent_poll` / `agent_read[_brief]` / `agent_send` / `agent_stop` / `agent_set_mode` 均带 `tid`，完整闭环见 `references/website-analysis.md` 第 4 节，参数名以实时 `agent_tools` + README 为准）。**签名/加密参数逆向（第 4 节）走这条**——费时、需要多轮试错，交给便宜的标准/快速档 worker 模型磨更省 director token（README 示例为 `deepseek-v4-flash`，**切勿用推理档**如 `deepseek-v4-pro`，长工具循环会退化成纯文本计划；模型选型以 README“前置条件”实时节为准，本 SKILL 模型名仅为快照）。

> ⚠ 直驱与运行中的 agent 会话**不能并发**：要用 `agent_call_tool` 必须先 `agent_stop` / `agent_wait_for_stop` 当前会话；反之直驱期间别再 `agent_start` 起 worker（会抢同一标签页被拒）。`fs_*` 落在会话工作目录（默认在 `firefox-reverse-ws/<会话id>/`，以 README“逆向产物在哪里”实时节为准）：保持默认工作目录、导出后再拷到 `./_fixtures/<plugin-id>/` 下（母仓内开发则为 `lingshu-plugins/_fixtures/<plugin-id>/`）；不要为省事把工作目录直接指到仓库根（会把 `ledger.md`/`progress.md`/`scripts/` 混入仓库）。`agent_start` 是否支持改工作目录、参数确切叫什么，以实时 `agent_tools` 为准。

核心流程（列表页与详情页各做一遍，示例为 director 直驱；下文参数模板均为快照，实调前先 `agent_tools` 核对参数名）：

1. **打开页面**：`agent_call_tool({name:"page_navigate", args:{url}})`。注意网络捕获是“先 start 再触发、非回溯”——先 `agent_call_tool({name:"net_capture", args:{action:"start", captureBody:true}})` 开捕获，再 `page_navigate` 导航，确保要分析的请求都在窗口内（`net_capture` start 会同时抓到请求的 JS 调用栈，是定位签名生成的金矿）。
2. **判定数据源**：`agent_call_tool({name:"net_list", args:{method:"GET"}})` 列出请求，`agent_call_tool({name:"net_get", args:{id, includeBody:true}})` 看 body 找返回业务数据的接口。
   - 命中 JSON 接口（响应体里直接含列表/详情字段）→ **JSON API 路径**，记下 URL 模板、method、必要请求头、响应字段路径
   - xhr/fetch 全是埋点统计（`collector.*`、`*/stats` 等）→ **HTML 路径**（SSR，数据在文档里）
3. **采集 fixture**（默认落到会话工作目录，拷到 `./_fixtures/<plugin-id>/` 下直接用，母仓内开发则为 `lingshu-plugins/_fixtures/<plugin-id>/`）：
   - JSON：`net_get(id, includeBody:true)` 拿响应体后 `agent_call_tool({name:"fs_write", args:{path:"_fixtures/<plugin-id>/list.json", content}})` 落盘（`path` 写法以实时 `agent_tools` 的 `fs_write` 说明为准；`path` 按会话工作目录解析，任意目录开发时即为当前插件目录下的 `_fixtures/`）
   - HTML：取 document 响应体同法存为 `list.html`，或 `agent_call_tool({name:"page_eval", args:{expression:"document.documentElement.outerHTML"}})` 拿渲染后 DOM
4. **确认字段映射**：HTML 路径用 `page_eval` 试跑选择器（`querySelectorAll(...).length`、取首/中/末行的字段）确认能稳定取到 id/title/url/summary；JSON 路径对照响应结构映射字段。
5. **详情页**：从列表结果取一个 `ListItem.url`，`page_navigate` 过去，对详情页重走 1-4，产出 `detail.json` 或 `detail.html`。
6. **阅读页**（可选，漫画/图片类站点）：从详情页的章节链接取一个 URL，`page_navigate` 过去，分析阅读页的图片来源（通常为 `<img>` 或 `<amp-img>`），确认选择器能稳定取到所有页面图片 URL。产出 `reading.html` fixture。
7. **播放页**（可选，影视类站点）：从详情页的剧集链接取一个播放页 URL，分析其播放器配置（macCMS 常见 `player_aaaa={...}` + `/static/player/<from>.js` + iframe 播放器），观察它发起的真实 m3u8/视频资源请求，确认 `fetchPlayUrl` 需复刻的链路（可能含签名/加密）。产出 `play.html` fixture 与链路笔记（movie_site_c 案例见 `_fixtures/movie_site_c/analysis.md`）。

### 分类页分析

分类功能的实现需要单独分析分类页面：

1. `agent_call_tool({name:"page_navigate", args:{url:"<分类页URL>"}})` 到分类页面（如 `/classify`）
2. 观察页面的筛选结构——通常按维度分组（地区、状态、题材等），每组多个选项链接
3. 确定分组方式：每组一个独立 URL 参数 key（如 `region`、`state`、`type`），选项链接通过改变对应参数值筛选
4. 检查是否有树形子分类（`children`）
5. 确认 `fetchList` 接收组合查询字符串（如 `region=cn&state=serial&type=rexue`），拼接到分类 URL 后返回正确结果
6. 注意 `filter=%2a` 等必要的固定参数
7. **判定每个维度的筛选类型与多选/排除能力**：分组可声明 `type`（`select`/`check`/`text`/`sort`）等字段，但**必须实测站点**是否支持多选与排除——如 manga_site_a 的 `/api/comic/items` 传逗号多标签实测返回 500，tagIds 只能保持 `select`；不要冒充站点能力。声明方式与值编码契约见 `references/data-model.md` 的 CategoryGroup 节。

**产物**：`categories.html` fixture（分类页 HTML 快照）

### 预设目录页（listings）分析

目录页是源主页页签，不是筛选状态；筛选组是目录页属性，只有 search 真消费的组才留 `getCategories`；`kind:'explore'` 条目走 `getExplore`（listings-first）。红线：**每个 category 必经 fetchList 跑通（`runtime listings` 命令；该命令还逐条打印 `[原页=…]`／`·无原页`，并在末尾列出缺地址的叶子——整份 listings 缺地址 = 发现页颗颗页签都没有按钮，是静默失败，video_site_f 21 条叶子曾全缺）；选项必须真实存在、不冒充能力（反爬 403 如实报错、不静默回退）；能给出真实页面地址的目录页必须写 `url`（`Listing.url` 兼作 iOS 端「网站原页」按钮地址，只有 `category` 的目录页在宿主里没有原页按钮，补 `origin` 亦可；`explore` 条目的 `url` 是探索页标识不是地址——想给它原页按钮就写显式 `origin`，2026-10 起宿主取原页时 `origin` 恒优先于 `url`）；A-Z/共享同名 key/落地页筛选/索引页类型开关/详情页实体跳转等 18 条实战准则见 `references/listings.md`**；契约见 `references/data-model.md` Listing 节。

### 签名/加密参数（接口 URL/header 带动态签名时，如 wbi、X-Bogus）：这类逆向费时多轮，**建议委派 worker**（`agent_start` 起标准/快速档 worker，模型选型以 README 实时节为准，把工具名和目标写进 task/guidance），用 `net_get` 的 `initiatorStack` + `signer_trace` / `closure_read` / `code_search` / `hook_inject` 追踪签名生成逻辑（工具是否存在、有无改名以实时 `agent_tools` 为准），再用 `$lib.CryptoJS`/`$lib.crypto` 在插件里复现——详见 `references/website-analysis.md` 第 4 节。

**产物**（落到 `./_fixtures/<plugin-id>/`，母仓内开发则为 `lingshu-plugins/_fixtures/<plugin-id>/`）：list fixture + detail fixture + 接口/选择器的简短记录。

**KVS 站播放地址**：先按前缀判形态再选链路——`function/` 包裝经 license 置換还原（不可直访，求解用浏览器预言机 + 多样本交集收敛），base64 直链解码直访（curl 验 302 即定案，勿硬套置換；`MQ==` 为空档跳过），详见 `references/video-playback.md`「KVS 播放器地址还原」。

### 阶段 2：编写插件
1. 生成骨架：`lingshu init <plugin-id>`（在目标目录执行；`--dir <path>` 指定他处，`new` 同义。
   产物为 `<plugin-id>.plugin.js` + `_fixtures/<plugin-id>/`）。模板来源：npm 包内 `skills/lingshu-plugin-dev/template.plugin.js`
  （离线可用）或本 skill 同目录 `template.plugin.js`；手工复制模板亦可，但 `init` 能顺手建好夹具目录。
   生成后填好 `// ==Plugin==` 元数据头（`sourceUrl` 填目标站点的公开地址）
2. 实现 `fetchList(context?)` 返回 `ListResult`（`{ items: ListItem[], pagination? }`）；实现 `fetchDetail(url)` 返回 `ArticleDetail`
    - **详情页的实体字段（分类/主演/标签/作者）是可点列表入口，不是死字**：站点若支持按它们筛列表（`cat_id`/`home_id`/`tag_id` 等），用 `tags` / `tagGroups` 芯片 + `target:{action:'list', …}` 接上，**并把站点真实的排序档经 `target.filters` 带上**（别写进 base `category`，宿主是纯拼接）；参数先按「无参/有效/无效」三点对照验生效性、落地地址用自造稳定标识（带参内部路由通常不可深链）——三条口径与案例见 listings.md 规则 18
    - 支持分类筛选的站点可实现 `getCategories()` 返回 `CategoryGroup[]`（分组 + 树形节点），`fetchList` 接收 `context.category`（组合查询字符串）过滤；分组按 `type` 声明筛选类型（`select`/`check`/`text`/`sort`，缺省 `select`），值编码契约见 `references/data-model.md` 的 CategoryGroup 节
    - **目录页自带的页级筛选一律进 `Listing.filters`**：站点索引页右上角的「类型开关」（`Videos | Albums`，**换页不是参数** → 内部键必须拦在 URL 构造处）、A-Z 字母条（服务端 `?section=A`，别做客户端过滤）、榜单/图集列表的排序档都算；`kind:'tags'` 叶子**同样消费**（组合串经 `TagContext.category` 回 `getTags`，`TagContext.sort` 已退役）。两侧档位不同时走**筛选组联动**（`dependsOn` + `optionsWhen`，`items` 放缺省页侧；`fetchList` 的跨侧映射保留作旧宿主/旧串容错，详见 listings.md 规则 16），别硬凑直发
    - 有首页发现流的站点可实现 `getExplore(context?)` 返回 `ExploreFeed`（多分区聚合，每分区 `ListItem[]` + 可选 `viewMore` 跳转）；**探索页条目（listings-first）**：探索内容必须经 `getListings()` 声明 `kind:'explore'` 条目暴露（iOS 不再固定显示「首页」，除非源未配置 listings），条目可配置多个（`url` 为探索页标识，透传为 `context.url`，插件按 context 分支返回不同分区；无 url = 默认探索页）。示例见 video_site_a（「推荐」默认探索页 + 「gossip头条」单分区探索页）。**首页只有一个分区时不设 explore**（做普通列表，翻页并入对应频道，详见 listings.md 规则 12）。详见 [`references/data-model.md`](references/data-model.md) 的 ExploreFeed 节
    - 列表分页：`fetchList`/`search` 在 `ListResult.pagination` 中声明分页元数据（`strategy:'page'` 或 `'cursor'`），宿主据此驱动「加载更多」；详见 [`references/data-model.md`](references/data-model.md) 的 ListResult / PaginationMeta 节
    - **抓到页面才知道的筛选组走 `ListResult.filters`**（`Listing.filters` 同型同编码）：选项**按页不同且只活在页面里**（video_site_c 工作室页题材滑块只在 SSR HTML、XHR 拿到的 JSON 模板没有它）时，别往卡片 target 塞一份全局选项（= 用户能选中站上不存在的值），也在别页面上复用兄弟通道的排序常量（同站两处排序可能是两套 key）。优先级：结果自声明 > 跳转携带 > 目录页条目；宿主行为与应用口径见 [`references/data-model.md`](references/data-model.md) 的 ListResult 节
    - 需要用户偏好（线路/清晰度/开关）或按钮型动作的源，实现 `getSettingsSchema()`（+ 按钮的 `runSettingAction(key)`），值由宿主按 run 注入 `$lib.settings`（见「账号、设置与写侧交互」）
    - 漫画/图片类站点还可实现 `fetchReadingPage(url)` 返回 `ReadingPage`（包含页面图片 URL 列表）
    - 详情页含视频流（HLS / m3u8）的站点在 `video` block 上声明 `url`（原始 CDN URL）和 `referer`（当 CDN 校验 Referer 时）；详见 [`references/video-playback.md`](references/video-playback.md)
3. 使用注入能力（完整参考见 `references/api-reference.md`）：
   - 网络：`$lib.http.get(url, { headers, timeout, rejectUnauthorized })`
   - HTML 解析：`const $ = $lib.cheerio.load(html); $('selector').each((i, el) => { $(el).find('...').text() })`
   - 时间：`$lib.dayjs(ts).format('YYYY-MM-DD')`
   - 加解密：`$lib.CryptoJS.MD5(s).toString()`
   - 日志：`console.warn(...)` / `console.error(...)`
   - 存储：`$lib.storage.get/set`（缓存、配置）
4. 数据格式遵循 `references/data-model.md`

图片加密源的取证、数据契约、宿主解密边界和验证要求见 [`references/image-encryption.md`](references/image-encryption.md)。

### 阶段 3：验证

用全局 CLI `lingshu`（`npm i -g lingshu-runtime` 后就有；先 `lingshu --version` 确认版本）。
`<plugin-id>` 为插件元数据头中的 `id`，`--dir` 缺省即当前目录，任意空目录均可。

> 母仓等价：在母仓根目录先 `npm run -w runtime build`，再把下文 `lingshu` 换成
> `node runtime/dist/index.js`、`--dir .` 换成 `--dir lingshu-plugins` 即可。

**`run` 的动作**（`[target]` 为可选位置参数，只有部分动作消费）：

| action | `[target]` | 调用 | 常用选项 |
|--------|-----------|------|----------|
| `list` | — | `fetchList(context)` | `--page` `--cursor` `--category` `--url` `--channel` `--fixture` `--settings` |
| `detail` | URL（必填） | `fetchDetail(url)` | `--fixture` `--settings` |
| `search` | 查询词（必填） | `search(query, ctx)` | `--page` `--cursor` `--category` `--fixture` |
| `reading` | URL（必填） | `fetchReadingPage(url)` | `--fixture` |
| `play` | URL（必填） | `fetchPlayUrl(url)` → `{url, referer?, platform?}` | `--fixture`（多跳用目录形态） |
| `categories` | — | `getCategories()` | `--fixture` |
| `listings` | — | `getListings()`（同时打印目录页校验） | `--fixture`（目录形态） |
| `explore` | — | `getExplore(context?)` | `--url`（探索页标识） `--fixture` |
| `tags` | — | `getTags(context?)` | `--page` `--category` `--fixture` |
| `setting-action` | 字段 key（必填） | `runSettingAction(key)` | `--settings` |
| `login` | — | `login(inputs)` | `--inputs` |
| `me` | — | `getMe()` | `--settings` |
| `logout` | — | `logout()` | — |
| `invoke` | 方法名（必填） | 通用写侧直调，参数经 `--params` | `--params` `--settings` |

**通用选项**

| 选项 | 用途 |
|------|------|
| `--fixture <path>` | 离线快照。**文件** = 所有请求共用一份（单跳动作够用）；**目录** = 读 `<dir>/index.json` 的 `routes` 按 URL 逐条匹配（多跳动作必须用它——单文件会把 A 的响应喂给 B，静默给出假结果）。未命中的请求显式报错。 |
| `--dir <path>` | 插件目录（缺省当前目录） |
| `--page` / `--cursor` / `--category` / `--url` / `--channel` | 原样透传进 `PluginContext` 对应字段 |
| `--settings <json>` | 注入 `$lib.settings`（`getSettingsSchema` 声明值的测试替身） |
| `--inputs <json>` | `login` 的表单值（模拟宿主从 `loginFields` 收集后回传） |
| `--params <json>` | `invoke` 的方法参数 |

**离线示例**（fixture 采自阶段 1，存到 `./_fixtures/<plugin-id>/`）：

```bash
lingshu run <id> list   --dir . --fixture _fixtures/<id>/list.html
lingshu run <id> detail "https://example.com/post/1" --dir . --fixture _fixtures/<id>/detail.json
lingshu run <id> categories --dir . --fixture _fixtures/<id>/categories.html
lingshu run <id> list   --dir . --page 2
lingshu run <id> search "关键字" --dir . --page 1
lingshu run <id> reading "https://example.com/chapter/1" --dir .
```

**三类最容易漏验的能力**（账号、写侧、多跳/目录页）：

```bash
# 多跳动作：--fixture 指向目录，index.json 里按 URL 配 routes
lingshu run <id> play "https://example.com/play/1" --dir . --fixture _fixtures/<id>
# 目录页：逐叶子跑 fetchList，并打印 [原页=…] / 缺地址叶子
lingshu listings <id> --dir . --fixture _fixtures/<id>
# 账号全链路：login → me → invoke 写侧 → logout
lingshu run <id> login  --dir . --inputs '{"username":"u","password":"p"}'
lingshu run <id> me     --dir .
lingshu run <id> invoke setLike --dir . --params '{"id":"123","active":true}'
lingshu run <id> logout --dir .
# 设置项按钮（action 型字段）
lingshu run <id> setting-action refreshToken --dir .
```

`index.json` 最小形态：`match` 是 URL 子串，`regex` 用于锚定，`headers` 区分「同 URL 两副面孔」，自上而下第一条命中，`match:"*"` 是可选兜底（不写则未命中即报错）：

```json
{ "routes": [
  { "match": "player_api", "file": "player.json" },
  { "headers": { "X-Requested-With": "XMLHttpRequest" }, "match": "api/list", "file": "list.json" },
  { "regex": "^https://site\\.com/zh/$", "file": "home.html" },
  { "match": "*", "file": "fallback.html" }
] }
```

> URL 含 `?`/`&` 等特殊字符时必须用双引号包裹，否则会被 shell 解释（`&` 会被当作后台运行符）。

**格式校验**（只查元数据头 + 源码里有没有 `fetchList`/`fetchDetail` 字符串，**不**验证导出和返回结构，别当测试用）：`lingshu test <id> --dir .`

**列出可用插件**（确认元数据头合法、插件被加载）：`lingshu list --dir .`

**在线回归**：去掉 `--fixture` 即发真实请求。上线前至少跑通 `list` + `detail` + 一条分类/搜索路径。

> 可视化调试工具 DevConsole（Web UI）见 `lingshu-devconsole` 仓 README，适合快速迭代而非命令行。

### 阶段 4：提交
第三方（任意目录）默认流程：
1. 把 `<plugin-id>.plugin.js` + `_fixtures/<plugin-id>/` 一起提交到**自己的插件仓库**（单文件 + 快照即完整交付）
2. 若自建分发仓，按 [`references/manifest.md`](references/manifest.md) 的格式加一条（字段表 + 最小示例 + 三处一致校验），App 填你的 raw manifest 地址即可消费
3. 若向官方 `lingshu-plugins` 投稿，先读该仓 `CONTENT-POLICY.md`（仅收公开、可匿名访问、`nsfw:0` 的源），按其 `CONTRIBUTING.md` 走 PR

> 母仓等价：插件文件 + fixture + `manifest.json` 更新一起提交，再跑阶段 5。

### 阶段 5：技能自进化（母仓维护者，第三方可跳过）

第三方插件开发者**不需要**跑本阶段：阶段 3 验证通过即可交付；踩到通用坑把「现象 + 复现 + 解法」反馈给维护者。

母仓内每次 dev 闭环必跑：通用度判定 → 去重检索 → 路由落盘 → 模板同步，回复末尾附 5 段式进化报告。完整步骤、触发口径与报告模板见 [`references/maintenance.md`](references/maintenance.md)；改完跑 `node scripts/check-skill.mjs`（断链/目录同步/体积预算/CLI 覆盖）。

## 关键约束

- **单文件自包含**，不能加载外部模块
- **没有 fetch / XMLHttpRequest**，统一用 `$lib.http`
- **没有 setTimeout / setInterval**
- **没有 fs / process**，持久化用 `$lib.storage`
- 日志用 `console.*`（沙箱已注入）
- **`$lib.http.post` 的 body 约定**：`data` 为字符串时原样透传（用于 `application/x-www-form-urlencoded` 等已编码体）；为对象时 `JSON.stringify`。写侧动作（登录等）发表单时传字符串 + `contentType: 'application/x-www-form-urlencoded'`。

## 账号、设置与写侧交互

三条信道别混：**pre-run 已知输入**（账号/密码、用户偏好）走声明式 schema；**run 中途才发现要问的**（验证码、确认、toast）走 `$lib.ui`；**写侧状态**（点赞/收藏/关注）走 `getMe` + 通用 `invoke`。

### 登录：getAccountSchema + login

```javascript
function getAccountSchema() {
  return {
    loginFields: [
      { name: 'username', label: '账号', type: 'text', required: true },
      { name: 'password', label: '密码', type: 'password', required: true },
    ],
    // cookieFields: [{ name: 'cookie', label: 'Cookie', type: 'cookie' }], // 可选：cookie 登录
  }
}
async function login(inputs) {   // inputs = 宿主从 loginFields 收集的 { name: value }
  const body = `username=${encodeURIComponent(inputs.username)}&password=${encodeURIComponent(inputs.password)}`
  const data = await $lib.http.post('/login', body, { contentType: 'application/x-www-form-urlencoded' })
  return { uid: String(data.uid), message: '登录成功' }
}
```

- **inputs 回传信道**是 `PluginContext.inputs`，不是 `$lib.settings`（设置是偏好、凭证是动作输入）。
- **cookie 自动跨 run 续期**：登录响应的 `Set-Cookie` 进宿主共享 jar，后续 `fetchList`/`fetchDetail` 自动带上；要预置用 `$lib.http.setCookies(url, cookies)`。
- **要人机验证的站**：账密纯 HTTP 必被拦（服务端先校验证码再校账密，只会回「密码错」误导用户）→ 先 curl 一次假账密定案，主路径改 Cookie 登录。完整做法与红线见 [`pitfalls.md`](references/pitfalls.md) 的「登录强制人机验证」条。
- **验证方式**：`lingshu run <id> login --inputs '{"username":"u","password":"p"}'` → `me` → `logout`。

### 设置项：getSettingsSchema + runSettingAction

```javascript
function getSettingsSchema() {
  return [
    { key: 'apiLine', label: '接口线路', type: 'select', default: '1', options: [{ value: '1', label: '主线路' }] },
    { key: 'hd', label: '优先高清', type: 'switch', default: false },
    { key: 'refresh', label: '刷新令牌', type: 'action', buttonText: '刷新' },
  ]
}
function runSettingAction(key) { return { message: '已刷新' } }   // action 型按钮的副作用
```

宿主按 run 注入 `$lib.settings`（只读、不持久）；插件自持 `default` 常量、与 schema 共用同一份。验证：`--settings '{"apiLine":"2"}'`、`lingshu run <id> setting-action refresh`。

### 写侧（getMe + invoke）

- `getMe()` 返回 `{ user?, states? }`；无 token 直接回空、不发请求（宿主判空即未登录落表单），`states` 是写侧开态表。
- 插件自定写侧方法（如 `setLike({id, active})`），卡片用 `{action:'invoke', call:{function, params}}` 声明，宿主按声明直调、不映射方法名；终态键缺省 `active`，可声明 `resultKey`。
- `logout()` 清 token + `$lib.http.deleteCookies(BASE_URL)`；cookie jar 会被宿主自动附带，不清等于没退。未登录幂等成功。
- 完整链路（未登录两态提示、token 过期重抛、`statesOf()` 水合、按钮组初态）见 [`references/examples.md`](references/examples.md)「video_site_g 写侧实战」。
- **多步写侧流**（如收藏先选夹子）：拆成多个方法，宿主编排「方法产数据 → 渲染选择 → 选择作 inputs 回传下一步」，别在一次调用里既查又问。

## 参考示例

公开 `lingshu-plugins` 仓有 `bilibili-hot` / `zhihu-daily` / `github-trending` 三个干净示例（`git clone` 后 `lingshu list --dir <克隆目录>`）；母仓 `lingshu-plugins/` 另有 12 个进阶案例（含 video_site_g 写侧实战）。

**按能力查表 + 每个案例演示什么的详解见 [`references/examples.md`](references/examples.md)**。入门先读 `github-trending`（HTML 列表 + JSON 详情，最短），再按需抄最接近的片段，不要整体复制。

## 线路 × 剧集 与播放页解析

契约见 `references/data-model.md`「线路 × 剧集」节。插件侧红线：**详情只产结构（线路名 + 播放页 URL 集，`target:{action:'play'}`），不在 fetchDetail 逐集解析；网盘线路按名剔除（网盘/UC/夸克/百度/阿里/115/迅雷）+ fetchPlayUrl 加防护；时效流（auth_key）现算、会话缓存；多跳失败带 URL/状态抛错**。样例 `movie_site_c`。

## 视频清晰度（双通路）

契约见 `references/data-model.md`「视频清晰度」节。红线：**先判形态再选通路——多 URL 型显式声明 `qualities`，master playlist（含 `#EXT-X-STREAM-INF`，拉一次实测确认、别凭接口字段猜）零声明；「线路」不是清晰度，fetchPlayUrl 内择优、不暴露切换**（movie_site_a §10 实证）。

## 页面通道、导航树与递归列表

契约见 `references/data-model.md`「页面通道、导航树与递归列表」节。红线：**新页面形态先问「能否 fetchList({url}) 直出」；同模板多 slug 收敛为目录页 + filters 筛选栏（video_site_a resolveCatalogURL），异构落页/层级导航才用 children 分层（同级平级维度一律收敛为目录页 + filters，别再以「宿主只渲染文字树、封面会丢」劝退 children—— 起 iOS 的 children 叶子是就地渲染的页签）；索引页自身还要翻页/排序时才建递归列表（封面 + target 下钻，详见 listings.md 规则 13）；分页按 URL 形态（query vs path）分别构造**。

## 懒播放解析与文本阅读

契约见 `references/data-model.md`「懒播放解析」+ ReadingPage 节。红线：**先判播放路由三支路——懒解析型（video 无 url + target.play，fetchPlayUrl 多跳）/ 直嵌型（m3u8 内嵌页面 JSON，fetchDetail 直出、无需 fetchPlayUrl）/ 入口页型（页面 URL 绝不当 video.url，B 站教训）；单页全文小说 fetchDetail 直出 text blocks，不进 fetchReadingPage**。

## 列表通道标识 channel

同一 URL 形态可能承载不同语义通道（站群的「相关推荐」跳转即一例），**通道身份由插件声明、宿主原样透传，不再从 URL 反推**。给 `Listing` / `PageJumpTarget.list` 带可选 `channel`（如 `'studio-videos'`、`'related'`），`fetchList` 优先按 `context.channel` 分派、缺省才回退 URL 正则。旧插件不声明即走旧路径（零改动）；新插件别把站点知识藏进宿主特判。验证：`lingshu run <id> list --url <url> --channel <id>`。契约见 [`references/data-model.md`](references/data-model.md) 的「列表通道标识」节。

## 常见问题与踩坑记录

> 全文 70 条在 [`references/pitfalls.md`](references/pitfalls.md)（顶部目录按编号列出；**先 `read` 前 80 行拿目录、再按标题定位**，别整读 1873 行 ≈ 40k token）；**结论速查**在 [`references/pitfalls-index.md`](references/pitfalls-index.md)（按契约/解析/内容/链路/站点专题/工具链分类）。遇到怪现象先搜速查索引，再读同条全文。新增条目先查两处去重（阶段 5），重复则合并。

最常踩、也最贵的几条（其余全在索引里）：

- **契约**：封面缺失用站点自带占位图，别留空也别自造；列表要「看见」时间/数量必须进角标（`publishTime`/`itemCount` 宿主不渲染）；阅读页 `pages` 取**原图链**而不是 `img` 缩略图（取错不报错、只是投糊图）。
- **解析**：详情恒报「不存在」先查 id 提取正则（`\d+` 会把 hex id 静默截断）；「有数据 ≠ 参数有效」，筛选选项用三点对照（无参/有效/无效）验；渲染后 DOM 当 fixture 会掩盖真实运行时的接口。
- **内容**：付费墙先判层级（前端字段驱动 ≠ 服务端鉴权，插件不消费门槛字段、能出流就直取）；全站 CF 拦截交宿主（插件直抛 `CHALLENGE`，别在插件里重抓浏览器）。
- **链路**：同站多 API 镜像按顺序故障转移，判据是「业务数据可解析」而非 HTTP 200；CDN 不校验 Referer 就别声明 `referer`（多写即死链）。
- **工具链**：Marionette 起不来按 [`references/browser-startup.md`](references/browser-startup.md) 判定树恢复，别反复重试。

## 进一步参考

| 文件 | 内容 |
|---|---|
| [`references/data-model.md`](references/data-model.md) | 全部返回契约与字段（顶部目录） |
| [`references/examples.md`](references/examples.md) | 按能力索引的 15 个真实案例 + 写侧实战 |
| [`references/pitfalls-index.md`](references/pitfalls-index.md) | 70 条踩坑的结论速查 |
| [`references/pitfalls.md`](references/pitfalls.md) | 踩坑全文（症状/原因/修复/案例，顶部目录） |
| [`references/listings.md`](references/listings.md) | 目录页分析与 18 条筛选准则 |
| [`references/website-analysis.md`](references/website-analysis.md) | frx-director 浏览器实测完整流程 |
| [`references/api-reference.md`](references/api-reference.md) | `$lib` 注入 API 完整说明 |
| [`references/card-dsl.md`](references/card-dsl.md) | 卡片 DSL 字段与示例 |
| [`references/video-playback.md`](references/video-playback.md) | HLS/m3u8、`video` 块、播放页解析 |
| [`references/image-encryption.md`](references/image-encryption.md) | 图片加密取证与解密边界 |
| [`references/browser-startup.md`](references/browser-startup.md) | 浏览器启动与恢复 |
| [`references/manifest.md`](references/manifest.md) | 分发清单 `manifest.json` |
| [`template.plugin.js`](template.plugin.js) | 插件骨架（`lingshu init` 会生成，通常不必手读） |
| [`references/maintenance.md`](references/maintenance.md) | 母仓技能自进化流程 |

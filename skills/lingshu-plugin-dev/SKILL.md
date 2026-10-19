---
name: lingshu-plugin-dev
description: 为灵枢(Lingshu)开发数据源适配器插件(.plugin.js)：分析目标站点(HTML/JSON API)、实现 fetchList/fetchDetail(及 getCategories/fetchReadingPage/search/getListings/getExplore/getTags/fetchPlayUrl)、用 $lib 受控能力(cheerio/CryptoJS/dayjs)做解析、用 lingshu CLI 离线 fixture 验证。收到插件开发、新增内容源、调试插件时使用。
---

# 灵枢插件开发 Skill

**名称：** `lingshu-plugin-dev`
**用途：** 为灵枢(Lingshu)漫画视频新闻阅读器开发数据源适配器插件（`.plugin.js`）

## 适用场景

当需要为某个内容源（网站/API）开发数据抓取插件时使用本 Skill：解析列表页/详情页、对接 JSON API、把内容转换成灵枢统一的 ListItem / ArticleDetail 数据模型。

本 Skill 的特点是**自动用 frx-director MCP 控制浏览器实测目标站点**来分析数据源（而非凭经验猜测），见阶段 1。

## 插件是什么

- 单文件 `.plugin.js`，自包含，**不能 require/import 外部模块**
- 通过 `module.exports` 暴露 `fetchList` / `fetchDetail`（+ 可选 `getCategories`、`fetchReadingPage`、`search`）
- 运行在沙箱里，**只能**通过 `$lib` 命名空间访问受控能力（网络/存储/第三方库）
- 同一份插件代码在 Node.js 模拟器和未来 Swift JavaScriptCore 端行为一致

## 开发工作流

> **第三方默认走任意目录工作流**：`npm i -g lingshu-runtime` 后装 skill
> （`lingshu skill install` 装进各家 agent 的 skills 目录，全局默认 claude/cursor/codex/agents 四家；
> `--project` 装进当前项目，`--agent claude` 可收窄，`lingshu skill list` 查看包内自带），
> 然后在**任意空目录**开发，全程用全局命令 `lingshu`。下文阶段 2/3 均按此写；母仓内开发的等价命令见各节末尾「母仓等价」备注。

### 阶段 0：启动 Firefox Reverse 浏览器（前置检查，必做）

> **实时为准原则（frx-director-mcp 更新频繁，SKILL 内数值均为快照）**：任何实测开始前，先实时读取官方 README（`https://raw.githubusercontent.com/WhiteNightShadow/frx-director-mcp/refs/heads/main/README.md`）的“快速开始 / 工具接入自检 / 工具参考 / 版本更新记录”四节，再调 `frx_status` + `agent_tools` 核对。以实时读取到的字段名、工具名、参数表为准；本 SKILL 及 `references/*` 中的工具数量、工具参数示例、模型名、端口号等均为编写时快照，过期以实时读取为准，不得硬抄。

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

**`run` 命令的动作与参数**（`[target]` 是可选位置参数，只有部分动作消费）：

| action | `[target]` | 说明 | 可用选项 |
|--------|-----------|------|----------|
| `list` | — | 调用 `fetchList` | `--page`、`--cursor`、`--category`、`--fixture` |
| `detail` | URL（必填） | 调用 `fetchDetail(url)` | `--fixture` |
| `search` | 查询词（必填） | 调用 `search(query, ctx)` | `--page`、`--cursor`、`--category`、`--fixture` |
| `reading` | URL（必填） | 调用 `fetchReadingPage(url)` | `--fixture` |
| `play` | URL（必填） | 调用 `fetchPlayUrl(url)`：播放页解析，返回最终视频流 `{url, referer?, platform?}` | `--fixture`（仅覆盖播放页抓取，artplayer/解析接口两跳需在线） |
| `categories` | — | 调用 `getCategories()` | `--fixture` |
| `explore` | — | 调用 `getExplore(context?)`（探索页多分区 feed；`--url` 为探索页标识，listings-first） | `--url`、`--fixture` |
| `tags` | — | 调用 `getTags(context?)`（标签索引：首字分组全量云裸 `TagGroup[]`，或分页云 `{groups, pagination}` 信封 + `--page/--category`） | `--fixture` |

> URL 含 `?`/`&` 等特殊字符时必须用双引号包裹，否则会被 shell 解释（`&` 会被当作后台运行符）。

**列出可用插件**（确认插件被正确加载、元数据头合法）：
```bash
lingshu list --dir .
```

**离线模式**（使用本地 fixture，不发真实网络；fixture 采自阶段 1，存到 `./_fixtures/<plugin-id>/`）：
```bash
# 列表（fixture 通常为 list.html 或 list.json）
lingshu run <plugin-id> list \
  --dir . \
  --fixture _fixtures/<plugin-id>/list.html

# 详情（<url> 取自列表结果的 ListItem.url；fixture 为 detail.json 或 detail.html）
lingshu run <plugin-id> detail "https://example.com/post/1" \
  --dir . \
  --fixture _fixtures/<plugin-id>/detail.json

# 分类页（fixture 为 categories.html）
lingshu run <plugin-id> categories \
  --dir . \
  --fixture _fixtures/<plugin-id>/categories.html

# 按分类筛选列表（--category 传入组合查询字符串，与 getCategories 返回的 key/id 对应）
lingshu run <plugin-id> list \
  --dir . \
  --category "region=cn&state=serial&type=rexue"

# 翻页（--page，默认 1）
lingshu run <plugin-id> list \
  --dir . \
  --page 2

# 游标翻页（--cursor，回传上一页 pagination.nextCursor；用于 cursor 策略源）
lingshu run <plugin-id> list \
  --dir . \
  --cursor "eyJwIjoxfQ"

# 搜索（<query> 为查询词，支持 --page / --category）
lingshu run <plugin-id> search "关键字" \
  --dir . \
  --page 1

# 阅读页（<url> 为章节链接，自动跟踪 3xx 重定向）
lingshu run <plugin-id> reading \
  "https://example.com/chapter/1" \
  --dir . \
  --fixture _fixtures/<plugin-id>/reading.html
```

**格式校验**（轻量校验：`// ==Plugin==` 元数据头字段 + 源码中是否出现 `fetchList`/`fetchDetail` 字符串；**不**验证真实导出和返回结构，需用上面的 `run` 命令实测）：
```bash
lingshu test <plugin-id> --dir .
```

**在线模式**（去掉 `--fixture` 即可发起真实 HTTP 请求，用于上线前回归）：
```bash
lingshu run <plugin-id> list --dir .
```

> 可视化调试工具 DevConsole（Web UI）见 `lingshu-devconsole` 仓 README，适合快速迭代而非命令行。

### 阶段 4：提交
第三方（任意目录）默认流程：
1. 把 `<plugin-id>.plugin.js` + `_fixtures/<plugin-id>/` 一起提交到**自己的插件仓库**（单文件 + 快照即完整交付）
2. 若自建分发仓，按 [`references/manifest.md`](references/manifest.md) 的格式加一条（字段表 + 最小示例 + 三处一致校验），App 填你的 raw manifest 地址即可消费
3. 若向官方 `lingshu-plugins` 投稿，先读该仓 `CONTENT-POLICY.md`（仅收公开、可匿名访问、`nsfw:0` 的源），按其 `CONTRIBUTING.md` 走 PR

> 母仓等价：插件文件 + fixture + `manifest.json` 更新一起提交，再跑阶段 5。

### 阶段 5：技能自进化（母仓维护用，第三方可跳过）

第三方插件开发者**不需要**跑本阶段：它是母仓维护 skill 用的（落盘位置为母仓的决策记录与 `CONTEXT.md`，不随公开仓发布）。
读完阶段 3 验证通过即可交付；若在开发中踩到通用坑，欢迎把「现象 + 复现 + 解法」反馈给 skill 维护者。

母仓内每次 dev 闭环必跑：

触发：「一次」= 一次有结论的 dev 闭环（调通 / 放弃 / 提交），不是文件保存、不是单次 run。母仓内 commit 触及 `lingshu-plugins/<id>/*` 时再做一次幂等检查。typo / 版本号 bump / 纯格式化免检。

步骤（5 分钟）：
1. **通用度判定**：换个插件是否仍会复现？只与本站 DOM/接口字面量有关 → 无通用经验，写明理由即算跑过；通用 → 进第 2 步。内容分三级：L1 踩坑追加 / L2 模式提炼默认允许，L3 结构重构需显式批准。
2. **去重检索**：`codegraph explore "<新坑关键词>"` 查 SKILL + `references/*` + 相关 docs（grep 兜底），新条目必须列出查过哪几个旧条目；重复则合并，不新增。
3. **路由落盘**：按 `docs/agents/plugin-host-boundary.md` 判定插件侧 / 宿主侧，按母仓文档的分层约定（主文件一行红线、全文进主题文档）落盘；跨侧两侧分别记并互引。决策级进母仓决策记录，术语变化改 `CONTEXT.md` 词条。
4. **模板同步**：结论触及通用契约/骨架（新增方法、返回结构变化、通用 helper、红线约束）时必须同步更新 `template.plugin.js`（只与本站有关的个例不碰；更新后跑 `node --check` 校验）。

输出：在回复末尾附 5 段式**进化报告**：本次改动一句话 / 通用度判定 / 落点 / 去重结果 / 无则「无通用经验」+ 理由。无模板 = 没跑过阶段 5。

## 关键约束

- **单文件自包含**，不能加载外部模块
- **没有 fetch / XMLHttpRequest**，统一用 `$lib.http`
- **没有 setTimeout / setInterval**
- **没有 fs / process**，持久化用 `$lib.storage`
- 日志用 `console.*`（沙箱已注入）
- **`$lib.http.post` 的 body 约定**：`data` 为字符串时原样透传（用于 `application/x-www-form-urlencoded` 等已编码体）；为对象时 `JSON.stringify`。写侧动作（登录等）发表单时传字符串 + `contentType: 'application/x-www-form-urlencoded'`。

## 账号登录（声明式交互）

人机交互进插件分两个时间位置（详见 CONTEXT.md /）：
- **pre-run 已知的输入**（账号/密码）→ **声明式字段 schema**：`getAccountSchema()` 声明表单，宿主渲染、收集值、经 `inputs` 回传给 `login`。插件不调 UI、无 callback。
- **run 中途才发现要问的**（验证码、二次确认、toast）→ **`$lib.ui.*`**：Promise 式 `await` 直问用户（与 `$lib.http` 同构——暂停等人类输入再续跑）。见下方「中途直问用户」与 `references/api-reference.md` 的 `$lib.ui` 节。

```javascript
// 1. 声明登录表单字段（宿主据此渲染）
function getAccountSchema() {
  return {
    loginFields: [
      { name: 'username', label: '账号', type: 'text', required: true },
      { name: 'password', label: '密码', type: 'password', required: true },
    ],
    // cookieFields: [{ name: 'cookie', label: 'Cookie', type: 'cookie' }], // 可选：cookie 登录
  }
}

// 2. 登录：inputs 是宿主从 loginFields 收集、回传的 { name: value }
async function login(inputs) {
  const body = `username=${encodeURIComponent(inputs.username)}&password=${encodeURIComponent(inputs.password)}`
  const data = await post('/login', body) // post 见下方「发 POST」
  return { uid: String(data.uid), message: '登录成功' }
}

module.exports = { /* ...其他导出 */, getAccountSchema, login }
```

**关键点：**
- **inputs 回传信道**：宿主收集的值经 `PluginContext.inputs` 回传给 `login(inputs)`，不在 `$lib.settings`（设置是用户偏好，登录凭证是动作输入，两条信道，见 CONTEXT.md「字段 schema」）。
- **cookie 自动跨 run 续期**：登录响应的 `Set-Cookie` 由宿主共享 cookie jar 存下，**后续读取 run（fetchList/fetchDetail）自动带上**——无需插件手动透传。插件若要预置 cookie，用 `$lib.http.setCookies(url, cookies)`。
- **发 POST（写侧）**：`$lib.http.post(url, bodyString, { contentType: 'application/x-www-form-urlencoded', headers })`，`bodyString` 为字符串时原样发送。
- **多步写侧流**（如收藏：先 loadFolders 再选择夹子）：属**宿主编排的结构化选择**——拆成多个方法，每步跑完即止；宿主编排「方法产数据 → 渲染选择 → 选择作 inputs 回传下一步」。
- **中途直问用户**（验证码、确认、toast）：用 `await $lib.ui.showInputDialog(...)` / `confirm` / `showMessage`，在单次 run 内直问用户即可。**窄口径**：`$lib.ui` 只收「插件直问」类，不收宿主 owns 渲染面的结构化选择器（那是多步写侧流）。
- **通用调用写侧**（video_site_g 真实链路）：`getMe()`（登录态 + `states` 开态表水合；无 token 直接回空 user，不发请求——宿主判空即未登录静默落表单）+ 插件自定写侧方法（如 `setUserState({userId, active})` / `setPostState({url, slot, active})`，宿主按卡片声明通用直调、不映射方法）+ `logout()`（清 token + `$lib.http.deleteCookies(BASE_URL)`，cookie jar 会被宿主自动附带、不清等于没退；未登录幂等成功）；POST 开启 / `$lib.http.del` 取消；终态以服务端返回为准（结果终态键缺省 `active`，可声明 `resultKey` 改）；未登录两态提示（grill-with-docs 决议：插件 `$lib.ui.showMessage` toast，宿主 `catch` 保持静默不弹窗）——没登过（无 token）请求都不发，直接 toast「请先到设置页登录」+ 抛含 `loginRequired` 的错；token 过期（服务端报未登录，文案带 `loginRequired`）在 catch 里 toast「登录已过期，请到设置页重新登录」后原错重抛；错误后缀只进日志供 grep；详情 `metadata.actions` 给宿主按钮组初态（未登录即缺省隐藏）；列表 `statesOf()`（一次 `getMe` 取开态表）水合 pill 初态 + 计数项初态；帖子卡头像/作者名绑 `{action:'list',url:authorUrl}` 进作者列表，底部 actionBar 计数项绑 `{action:'invoke',call,effect}` 直调（宿主成功即时翻转，失败本地不动）。卡片契约见 `references/card-dsl.md`。

- **人机验证型登录（reCAPTCHA / 点击型验证码）**：账密纯 HTTP **必被拦**——服务端**先校验证码、再校验账密**，所以只会回验证码错误（用户误以为自己密码错）；动手写账密登录前先 curl 一次假账密定案。主路径改 **Cookie 登录**：`getAccountSchema` 同时声明 `loginFields` + `cookieFields`（`type:'cookie'`；宿主「登录」按钮不校验 required，只填 Cookie 也能提交）→ `login()` 解析粘贴的 cookie 串、校验**登录态 cookie 名**（实测最小集，别把 `kt_acctoken` 这类 IP token 当登录态）→ `setCookies` 预置 jar → **请求一次验登录态** → 通过才落 `$lib.storage`，失败恢复原登录态；`ensureSession()` 挂统一 `request()` 入口且**只补 jar 里缺的名字**（宿主持有的值可能已被站点轮换）；`getMe()` 无登录态 cookie 时**不发请求**直接回空；`logout()` **只清本机**、不调站点 `/logout/`（那是浏览器共享会话，会连带踢掉用户浏览器）；账密字段保留但**按站点真实响应如实报错**、不预先假定失败（站点放开即零改动可用）。详见 pitfalls.md。

## 参考示例

公开 `lingshu-plugins` 仓（`bilibili-hot` / `zhihu-daily` / `github-trending` 三个干净示例，`git clone` 即得）与下述母仓内实现可对照阅读。
全局安装后本地没有示例插件时，先 `git clone` 该仓再 `lingshu list --dir <克隆目录>`。
- `bilibili-hot.plugin.js` — JSON API + dayjs 时间格式化
- `zhihu-daily.plugin.js` — JSON API 列表 + HTML 详情（cheerio 解析）
- `github-trending.plugin.js` — HTML 列表（cheerio）+ JSON API 详情
- `manga_site_f.plugin.js` — HTML 列表 + HTML 详情 + `fetchReadingPage` 阅读页（漫画图片提取）
- `manga_site_a.plugin.js` — JSON API + HTML 详情 + 分类 + 搜索 + 阅读页 + HLS `video` block（`referer` 用法）+ **探索页条目**（getListings 首项「发现」`kind:'explore'`，listings-first）
- `manga_site_b.plugin.js` — 加密响应（AES-ECB）解密 + 域名线路刷新 + 图片切片 `__s` 标记 + 分类/搜索/发现页 + getListings（2026-08 收敛：原 13 平铺页签 → 1 顶层目录「全部」+ 分类/排序筛选组，2026 listings-first：首项「推荐」`kind:'explore'` 探索页条目）+ **声明式登录**（`getAccountSchema` + `login`）
- `ccc.plugin.js` — OAuth token + 刷新/续登 + **验证码登录经 `$lib.ui.showInputDialog` 直问用户**（账号密码仍走声明式 schema）
- `movie_site_c.plugin.js` — macCMS 影视站：**线路 × 剧集**（episodes block）+ **播放页解析**（`fetchPlayUrl`，NBY 线路 hex → artplayer → 解析接口 → AES 解密 → MP4 直链）+ 网盘线路剔除 + getListings（5 分类页每项内嵌真实筛选组）+ search
- `video_site_a.plugin.js` — 综合gossip站：视频/黑料新闻/小说/精选合集（moviesets 两级专题）四类内容。演示 新契约全链路：**页面通道**（`fetchList` 按 `context.url` 分派六类 SSR 列表）、**目录页筛选栏收敛**（`getListings` 顶层平铺目录、无 children：精选合集/91视频/黑料gossip/91短视频/色情小说各自内嵌筛选组，合集类型+A-Z / 视频类型多模板 / 栏目+排序 / 分类 / 分类，`fetchList` 经 `resolveCatalogURL` 按筛选 key 分发 URL）——见「children 平铺 vs 目录页筛选栏」准则、**多探索页条目**（listings-first 示范：getListings 首两条「推荐」默认探索页 + 「gossip头条」`url:'news'` 单分区探索页，`getExplore(context)` 按 context.url 分支过滤分区）、**递归列表**（合集条目 `target:{action:'list',url}` 任意深度）、**文本阅读**（小说单页全文 → `fetchDetail` 出 text blocks）、**懒播放解析**（`video` 块无 url 播放占位 + `fetchPlayUrl` 解包 packed JS → `detail_play` 接口 → m3u8）、**短剧直嵌流**（91短视频 `/melonshort/*`：m3u8 直嵌详情 `<script type="application/json">`，`fetchDetail` 直接出 `video.url`，另一条播放路由）、**路径分页**（`/melonshort/{N}`、`/melonshort/{slug}/{N}`）、图片 AES-CBC 加密（与 short_site_a 同 key/iv）
- `movie_site_a.plugin.js` — movie_site_a（zw.movie_site_a.top）双资源站。演示 ** 视频清晰度双通路**（短视频板块真实播放为 master playlist，清晰度菜单由宿主 hls.js 自动渲染、插件零声明）+ **AES-CBC 加密响应 + MD5 签名**（`sign=MD5(timestamp+guid+nonce+secret)`，任意 guid 通过）+ **导航树**（视频 5 板块顶层平铺，各带运行时拉取的标签筛选组 + 漫画目录带类型/状态筛选）+ **探索页条目**（getListings 首项「推荐」`kind:'explore'`，listings-first）+ **懒播放占位**（视频详情 `video` 无 url + `target.play`，`fetchPlayUrl` 内三源线路择优：镜像 m3u8 → Twitter master → MP4 直链，线路不暴露切换）+ 漫画章节阅读（`fetchReadingPage` 相邻章节定位 prev/next）+ 搜索仅视频（漫画无搜索接口）、`getCategories` 只保留 search 消费的板块组；**`getLabelVideoList` 的 labelId 必传**（fixture 时代曾记可选，2026-08 实测缺失报「标签ID不能为null」→ `fetchVideoList` 缺省按板块默认标签兜底，见踩坑记录）
- `video_site_b.plugin.js` — video_site_b（JavStream 同构站，SSR）：**分页排序标签云首发**（`getTags({page,sort})` 信封，`views|videos`，120/页）+ **两跳懒播放**（详情 `playEndpoint` → `video_source.php` JSON 取时效 MP4，`fetchPlayUrl` 现算现用）+ **合集 episodes**（`a.badge …&fid=…&ep=N` 单线路“视频”，1189 集实测）+ 分类子菜单各带排序筛选
- `fleet_site_b.plugin.js` — **fleet_site_b 站群聚合**（14 个内容池 / 72 个域名同一后端）。演示**一个插件覆盖多站**的完整做法（详见 `references/website-analysis.md` §6）：站点身份**双通道解析**（`category` 的 `app=` → URL host → 默认站，无筛选走 url、有筛选走 category）、listings **顶层按站点分组**（每站「发现」探索页 `url:'site:<key>'` + 8 频道）、频道 URL **统一 `/?type=X`**（实测全家族通用，不必逐站适配路由）、**同池镜像只取一个域名**；VIP 解锁与 8 镜像故障转移同 `fleet_site_a`。验证口径：`listings` **126/126 目录页 + 126/126 原页**、**跨站端到端 14/14 站实测可播**
- `fleet_site_a.plugin.js` — fleet_site_a（fleet_site_a.com，fleet_site_b 家族；Angular + Ionic SPA + 纯 JSON API、无 SSR）。演示 **VIP 付费墙解锁**（限制只在前端 UI、服务端零鉴权 → 插件不消费门槛字段直取出流；判定法与标注形态见踩坑记录「内容类」）+ **CryptoJS passphrase 响应解密**（OpenSSL `Salted__` 格式，密钥是站点 main.js 里的字面量）+ **8 个 API 镜像顺序故障转移**（判据「业务数据可解析」而非 HTTP 200）+ **时效签名流现算**（`m3u8s` 签名约 2h 过期 → `video` 块懒播放占位、`fetchPlayUrl` 现请求详情；**不声明 `referer`**——实测该 CDN 不校验）+ **首页 8 分区 explore**（`home_<type>_8`，VIP 板块 `viewMore` 落到真实目录页 `?type=c0`）+ **8 频道目录**（VIP 频道库内嵌 22 个制片厂筛选组，key 复用站点自己的 `type` 参数、靠「同名后者覆盖」与 listing 基础串组合）+ 同作者推荐块（复用站点自己的 `searchfleet_site_bs` + `keywords=user_<上传者>`）
- `video_site_h-vlog.plugin.js` — video_site_hVlog（Flutter Web + video_site_h 加密信封 + hash 路由 SPA）。演示 **listings 直接镜像站点底部导航各页的页签**（导航配置由服务端 `/system/info` 下发：首页 7 页签 / Vlog 2 / 尤物圈 6（`dark_nav`）/ 社区 5（`post_nav`）/ 约会抽奖 5（`dating_nav`），顶层 `children` 分组承接；页签形态按站点自报的 `style` 分流——`video_1`→navBlock 分区页走 `explore`、`video_3`→普通列表页走 `filters`）+ **分组与地址按页面注册表/页面类实测**（内部枚举名 `community` 对应的路由是 `#/post`，`#/community` 是死路由；`dark_nav` 属「尤物圈」页而非首页 ☰，见踩坑记录 + listings.md 规则 15）+ **页签参数现取现用**（`/post/navFilter {id}.filters` 才是各页签的整份列表参数，穷举猜键只会全被忽略，见踩坑记录）+ **日期档页级筛选**（首页「每日精选」= `/movie/daily` 的必需参数 `label=<YYYY-MM-DD>`，缺参回「网络异常」→ `type:'text'` 声明 + 缺省当天 + 格式前置校验，见踩坑记录）+ **客户端硬编码榜单页**（`#/ranking` 4 榜签，标签→端点取自 bundle 的 switch 分支；video_site_h榜是创作者榜，条目换 `creatorItem` + 自造 `/up/<id>` 通道进其作品列表）+ **分区「更多」落合集页**（`/movie/blockDetail` 的 4 档 filter 即 `/search/movie` 整份参数，原样透传 + `ListResult.filters` 回给宿主）+ **详情页可点实体**（分类/主演/标签各自进对应列表：`cat_id`/`home_id`/`tag_id`，帖子标签另起 `post-tag` 通道；四档排序经 `target.filters` 携带、不写进 base category；落地地址是自造稳定标识——站点**带参内部路由实测全都不是地址**，见 listings.md 规则 15/18）+ **三种 id 形态**（纯数字 / 16 位 hex / 24 位 hex，`\d+` 取 id 会静默截断致详情恒报「不存在」，见踩坑记录）+ 三类内容形态（`/movie`、`/post`、`/dating` 各自 detail 通道）

## 线路 × 剧集 与播放页解析

契约见 `references/data-model.md`「线路 × 剧集」节。插件侧红线：**详情只产结构（线路名 + 播放页 URL 集，`target:{action:'play'}`），不在 fetchDetail 逐集解析；网盘线路按名剔除（网盘/UC/夸克/百度/阿里/115/迅雷）+ fetchPlayUrl 加防护；时效流（auth_key）现算、会话缓存；多跳失败带 URL/状态抛错**。样例 `movie_site_c`。

## 视频清晰度（双通路）

契约见 `references/data-model.md`「视频清晰度」节。红线：**先判形态再选通路——多 URL 型显式声明 `qualities`，master playlist（含 `#EXT-X-STREAM-INF`，拉一次实测确认、别凭接口字段猜）零声明；「线路」不是清晰度，fetchPlayUrl 内择优、不暴露切换**（movie_site_a §10 实证）。

## 页面通道、导航树与递归列表

契约见 `references/data-model.md`「页面通道、导航树与递归列表」节。红线：**新页面形态先问「能否 fetchList({url}) 直出」；同模板多 slug 收敛为目录页 + filters 筛选栏（video_site_a resolveCatalogURL），异构落页/层级导航才用 children 分层（同级平级维度一律收敛为目录页 + filters，别再以「宿主只渲染文字树、封面会丢」劝退 children—— 起 iOS 的 children 叶子是就地渲染的页签）；索引页自身还要翻页/排序时才建递归列表（封面 + target 下钻，详见 listings.md 规则 13）；分页按 URL 形态（query vs path）分别构造**。

## 懒播放解析与文本阅读

契约见 `references/data-model.md`「懒播放解析」+ ReadingPage 节。红线：**先判播放路由三支路——懒解析型（video 无 url + target.play，fetchPlayUrl 多跳）/ 直嵌型（m3u8 内嵌页面 JSON，fetchDetail 直出、无需 fetchPlayUrl）/ 入口页型（页面 URL 绝不当 video.url，B 站教训）；单页全文小说 fetchDetail 直出 text blocks，不进 fetchReadingPage**。

## 常见问题与踩坑记录

> 全文在 `references/pitfalls.md`（70 条）；本节只留索引。新增先查全文去重（阶段 5），重复则合并。
>
> 契约类：**标签索引页也消费 `Listing.filters`（组合串走 `TagContext.category`；`TagContext.sort` 已退役，勿回退宿主硬编码排序行）** / **索引页「类型开关」是换页不是参数（`type` 必须拦在 URL 构造处，漏拦静默返回未筛选结果；A-Z 走服务端 `?section=A` 别做客户端过滤）** / link-target 内跳（旧契约忽略 target，宿主已扩展）/ tags-url 构造约定 / description 与 manifest 一致（**改任一侧必当次同步另一侧，先判哪边是事实真相**）/ url 通道目录页 filters 不受 CLI 强验（**声明前手工实测该页真消费参数**，详见 pitfalls.md）/ labelId 在线验证（fixture 会过期）/ 懒解析 video 块 poster 与顶层 coverUrl 必填（否则观看历史无封面）/ getExplore 裸数组与 viewMore 对象（勿包 { sections } 信封、勿传裸 URL 字符串）/ **详情推荐块块级 viewMore（与分区 viewMore 同型；无对应列表页就不写、落地页 url 必是真实页——**没有独立列表页时它就是承载页本身**（KVS 相关推荐落 `url` = 详情页，同一串 url 既是抓取通道也是落地页的「网站原页」，勿隐藏勿改指），`related` 这类通道标记进 category 而非合成 url，详见 data-model.md「块级『更多』入口」）** / 详情禁内联阅读图一律走 chapter+fetchReadingPage（单话站单条目指向自身）/ 阅读页 `pages` 必须取**原图链**（`a[href]`/查看器地址）而非 `img` 缩略图（**取错不报错、只是投糊图**，以「页数 == 站点声明张数」兜底；以上两条详见 data-model.md）/ **详情 `gallery` 同规矩**（该组图没有阅读页通道时必须给原图链——宿主全屏预览复用同一 URL，给缩略图 = 点开还是糊的）/ **封面缺失用站点自带的占位图**（站点 `.no-thumb`/`.no-image` 的 `background` url，别留空——iOS 空 URL 是**常驻 spinner**、别自造；**⚠ 该资源是 SVG 时 iOS 走自绘子集**（0.1.29 起可用；站点有位图版本仍优先位图，子集外特性会落失败态），DevConsole 正常，详见 pitfalls.md）/ **列表要「看见」时间/数量必须进角标**（`publishTime`/`metadata.itemCount` 都只是数据字段，宿主瀑布流卡不渲染它们——**条数用 `{value, format:'count'}` + `play` 图标，别用 `eye`（那是播放量）**，详见 data-model.md：站点给**绝对日期**才写 `{value, format:'relative'}`，站点原文本来就是**相对文案**（`2 days ago`）就**只换词直给中文串**（`'2天前'`/`'1周前'`/`'12个月前'`）——**别把相对文案换算成时间戳**，宿主 `publishTime` 走**绝对**时间格式化，会渲染成凭空的「2026年10月9日 00:00」，详见 data-model.md / pitfalls.md）/ 详情信息能收尽收（分类作者日期页数热度留言收藏标签简介封面推荐，有则收录无则省略不伪造，详见 data-model.md）；
> 解析类：**同一个 URL 两副面孔的「页面即接口」站——判别开关是请求头 `X-Requested-With` 而不是请求方法**（带该头回 JSON 信封、不带回 SSR 骨架；信封里 `template` 又可能是**HTML 片段串**，用 cheerio 解属性别用正则；分页 `hasMore` 主判据用 `current_page < total_pages`，**末页 `next` 可能回指自身**；多跳动作离线必须用目录式 fixture，详见 pitfalls.md 与 runtime/docs/fixture-modes.md） / **详情元数据靠 JSON-LD 而站点 JSON-LD 畸形（尾部多一个 `}`）→ 按大括号配平截取第一个完整对象**（模板 helper `extractBalancedJson`；必须跳过字符串内括号与转义，与 flight payload 的配平规则不是一回事；解析失败要留痕，别静默丢一半元数据，详见 pitfalls.md）
> 解析类：**服务端对无效参数可能「宽松兜底」——有数据 ≠ 参数有效**（未知 type 不报错、返回满页默认内容；选项真实性用「兜底指纹」验：随机无效值取 id 集合作指纹，逐候选比对，相同即无效；条数都是 24 区分不出来。某池为空/两入口同内容都不等于无效，详见 pitfalls.md） / **CryptoJS 传字符串密钥（passphrase）的密文是 OpenSSL 格式**（密文前缀 `U2FsdGVkX1`/`Salted__` + `EVP_BytesToKey-MD5` 派生 key/iv，非裸 CBC；插件用 `$lib.CryptoJS.AES.decrypt(密文, 密钥)` 直解、**不用手搓**，Node 原生复刻只在分析期脱浏览器批量验证时用——对象 key `{key,iv}` 才是裸 CBC，先看前端调用形式，详见 pitfalls.md） / 首屏 HTML 与翻页 AJAX 接口分离的站 cursor 必须拼翻页锚接口（拼首屏 URL 等于反复要首屏；到底认 fail/cursor=0 双标记，详见 pitfalls.md） / **动图封面别信后缀与 Content-Type（按字节魔数判；iOS 只显首帧、不失败，http 图床能升 https 就升，详见 pitfalls.md）** / 渲染后 DOM-fixture 掩盖运行时接口 / 同站多播放器形态（新老视频出流双栈，渲染后 blob 反向掩盖，看原始 HTML，详见 video-playback.md）/ 沙箱无 URL 全局 / 已返回对象勿二次 JSON.parse / 写侧以 code 判定 / SSL 证书失败 / 父容器 text 相邻粘连 / 多行简介换行丢失（逐行清洗 + `<br>` 先转 `\n`）/ 详情缺尾斜杠回首页站 fetchDetail 入口补斜杠（iOS 历史库去尾斜杠，manga_site_e）/ lazy-load 双态（**SSR 真值在 data-original、渲染后该属性被库删掉而 src 才成真值**；取图 `data-original→data-webp→data-src→src` 并跳 `data:`，详见 pitfalls.md）/ 页面通道形态判定先剥协议+域名（`context.url` 是完整地址，只对 path 判）、且**页码段与详情 ID 段同为数字时按段数/slug 分类**（勿只看前缀，详见 pitfalls.md） / **详情恒报「不存在/已下架」而列表正常 → 先查 id 提取正则**（`\d+` 只吃数字前缀，hex/字母 id 被静默截断：`5887fcd476654036`→`5887`，请求照样发出；id 一律按路径段全取，构造侧同理，详见 pitfalls.md；页签形态与地址两条纪律见 listings.md 规则 12/15）/ **SPA 的 `origin` 地址要按「这地址实际发什么请求」验，别按内部路由枚举名拼**（枚举名 `community` 的路由是 `#/post`、`#/community` 是死路由（零请求、页面空白不报错）；分组归属同样会照名字猜错——静态找页面注册表/页面类读的配置字段 + 在已加载页里改 `location.hash` 逐跳对齐接口，别用整页重载，详见 pitfalls.md；**且带参内部路由不是地址**——`A.b6(path,params)` 是 push 路由、参数不进 URL，`#/home/movie/detailH?id=`、`#/home/movie/tagDetail?id=`、`#/home/movie/blockDetail?id=`、`#/profile?homeId=` 四个实测全无页面（零请求或回退首页）：参数化列表页一律自造稳定标识当地址，见 listings.md 规则 15/18）/ **子页签参数穷举不出来 ≠ 站点不支持：多半是服务端 navFilter 类接口在下发**（`/post/navFilter {id}.filters` 才是各页签整份参数，现取现用 + 只回退首页签档；页签的 `style` 是布局形态不是参数值，详见 pitfalls.md） / **聚合页分区是异构的：条目映射器按分区自报类型分派**（`style:'20'` 的作者块条目是创作者，用视频映射器会逐条判空、随后整块被 `if (!items.length) return` 静默丢掉——CLI 只少打一个分区号不报错；逐块打 `style/route/条数/首条字段集` 排查，详见 pitfalls.md）/ **端点回「网络异常」≠ 网络问题：缺的多半是站点自己的语义参数**（`/movie/daily` 必需 `label=<YYYY-MM-DD>`，缺参文案与原因无关；搜 dart2js 里端点字面量的 `A.by(...)` 实参表拿参数名、顺调用者拿格式，比试参数快；日期档做成 `type:'text'` 的页级筛选 + 缺省当天 + 格式前置校验，详见 pitfalls.md 与 listings.md 规则 16）/ **筛选参数「看着像」不等于生效：固定三点对照**（无参 total / 有效值 / **无效值必须回 0**，两两不同才算真维度；total 有封顶噪声时改看首几条 id——video_site_h `/search/post` 换 tag_id 时 total 都是 10000 而 id 真的变了，只盯 total 会误判「参数无效」，详见 pitfalls.md） / **服务端下发的 filter 对象不能整份照抄：里面混着页级/广告键**（`position`/`ad_code` 属于页面白名单；`/movie/tagDetail` 会把你传的 position 原样回填进四档 filter（**回填 ≠ 校验**），照抄给 `/search/movie` 直接 0 条——只取「三点对照」验过的内容键，详见 pitfalls.md） / **一页多块时条目与分页都必须带块作用域**（`.pagination`/`.item` 是块内通用类名，`$('.pagination').first()` 会拿到**文档顺序第一组**——页码与 hasMore 静默全错，详见 pitfalls.md）/ 标签分组云分组边界不保证是独立容器（同 ul 内混排多分组，按 li 顺序扫，详见 data-model.md）/ 列表推广卡按 href 形态剔除（详见 pitfalls.md）/ 作者链接取文本最长者（头像 fallback 同 href 干扰，详见 pitfalls.md）/ 卡片三件套（根自带底 + 列容器显式左对齐 + 明图混排不断言加密，详见 pitfalls.md）/ 卡片子行独立链接行级 detail-target（只取文本会冒泡进父列表，详见 pitfalls.md）/ 榜单序号跨页加偏移（页内 i+1 会每页重排，详见 pitfalls.md）/ 图片 URL 禁硬编码 host（图床迁独立 CDN 即 404，封面从页内解析，详见 pitfalls.md）/ 站点迁 canonical 域名致全站 0 条（**0 条但分页正常解析 = 拉取成功、匹配失败，先查域名勿当改版**；主机判定用站点家族正则、内容 URL 判定收敛成一个助手，详见 pitfalls.md）/ 图片套第三方代理层致封面全裂（**代理回源不带 Referer，防盗链源站必 403**；剥代理直取源站、全图走同一个 imageUrl()；同类资源只裂一部分即此症，详见 pitfalls.md）/ 详情库旧 CDN 下线（列表新域活、详情旧域 530，同路径换 host，详见 pitfalls.md）/ 文本截断不断代理对（**slice 砍 emoji 半边致 iOS 3840 整页挂**；截断按码点 + 进 JSON 前清孤立代理，详见 pitfalls.md）/ **CF 邮箱混淆**（用户名取 `.text()` 会得到 `[email protected]` **占位符假名**，不报错不空——解 `data-cfemail`（首字节密钥逐字节异或）或取同元素 `title` 明文，详见 pitfalls.md）；
> 内容类：**「解锁 VIP」需求先判付费墙层级——前端字段驱动 ≠ 服务端鉴权**（改写脚本改的是客户端 UI 层，插件不经过前端；用身份对照实验定层级：身份参数四值——不传/空/真实值/乱码——响应一致即零鉴权，插件**不消费门槛字段**，能出流以接口是否给地址为准，标注走形态。**第二形态：门槛只差「前端自己少传的一个请求参数」（预告档 `&is_trailer=1`）——身份维度照样四值一致，去掉该参数即拿全量，`role/max-duration/join` 一律不读**，详见 pitfalls.md） / 阅读页 prevNext / HLS-403 先查视频调试日志 / 全站CF拦截L3（挑战识别下沉宿主，插件只留直连+解析兜底、CHALLENGE 直抛交宿主验证入口——**插件侧浏览器重抓已退役，**）/ challenge-platform 信标注入正常页（宿主强特征集已剔除，插件用 assertParsed 解析兜底，勿另写否定门）/ 按窗口计数烧声誉（frx 一次拿全、一页一环境，anime_site_a）/ macCMS-show 筛选路由被 CF 拦截 / SSR 懒加载标记勿依赖运行时属性 / packed 解包链路自足 / 分页 query-vs-path 两形态 / 列表 summary 长文本致 iOS 滚动掉帧（视频简介默认不发，留详情页，movie_site_a 动漫，详见 pitfalls.md）。
> 链路类：播放页 encrypt/签名/时效 URL（见 pitfalls.md + `_fixtures/movie_site_c/analysis.md`）。**同站多 API 镜像（v2.a/v2.b/…）要顺序故障转移，别写死一个域名**（判据用「业务数据可解析」而非 HTTP 200——失活镜像常回 200 的错误页；与 movie_site_a「播放线路择优」不同层级：镜像择数据入口、线路择出流地址，详见 pitfalls.md）。**flight 解码必须完整处理 `\uXXXX`（朴素取下一字符静默坏标题，详见 website-analysis.md）** / **不校验 Referer 的 CDN 不声明 `referer`（多写即死链，详见 video-playback.md）** / **站点展示数可能是前端现算假数（角标只认接口字段，详见 pitfalls.md）** / **首屏 SSR 有数不等于无分页（滚屏后重查 net，详见 website-analysis.md）** / **无封面大索引走标签云（详见 listings.md 规则 13）**。
> KVS 站搜索：翻页/筛选是 AJAX-only（`?page=` 与 `/search/{q}/{N}/` 均被忽略），必须走 `mode=async&function=get_block` 片段接口；`category_ids=1,5` 逗号是多选并集（`[]=` 形态回 500），`sort_by` 对 `/latest-updates/` 无效（见 pitfalls.md）。
> KVS 站会员（`/members/{id}/` 与 `/members/` 同前缀不同形）：`/members/{id}/` 是会员作品页、本身是列表页但**只有 3 条/页**、`/members/{id}/2/` **404**（分页同走 `get_block` + `block_id=list_videos_uploaded_videos`），`/members/` 是「社区」**多区块聚合页**（成员榜 18 条/页 + 新私密视频 12 + 新私密图集 12）→ listings 走 `kind:'explore'` 三分区，成员榜分区的 `viewMore` 落成员榜列表页（`from_members=N` **整页 SSR 可直取**、`?sort_by=` 5 档、`/members/2/` 404）→ 两页**都必须带块作用域**取条目与分页，路径分类把 `{id}` 判在前（见 pitfalls.md / `_fixtures/kvs_site_a/analysis.md` §7/§12）。
> KVS 站图集（`/albums/`）：与视频**同前缀不同形**——索引/页码页（`/albums/`、`/albums/{N}/`）是列表、带 slug 的 `/albums/{id}/{slug}/` 是详情（路径分类靠 slug 段，勿只看前缀或裸数字 ID）；列表卡 `.list-albums .item`（`.photos` 张数 + `.rating` 百分比），原图在 `.block-album .images a.item[href]`（`img` 只是缩略图）；path 分页且 `?sort_by=` **生效**（档位 `album_viewed` ≠ 视频 `video_viewed`）；整本一次给全（见 pitfalls.md / data-model.md）。
> KVS 站私有内容（需登录）：列表 `span.ico-private` → 打 `tags`「需登录」（照常列出，**不许**省略——站点图标只在网页上、不落标签行等于用户白点）；详情 `span.message` → 置顶提示块，且**不许**产出点进去必报错的入口（私有图集原图清单恒空）；阅读页私有必须先于通用分支抛「需登录」，别用「页面结构可能已变化」描述它（见 pitfalls.md）。
> KVS 站相关推荐块（`#list_videos_related_videos` / `#list_albums_related_albums`）：详情页首屏只给一屏，**「更多」是 AJAX 锚且 `href="#more"` 不是地址**（只带 `data-block-id` + `data-parameters`）→ 站方没有可跳转的列表页；要「更多」落地的站，落法是块级 `viewMore: {action:'list', url: 本详情页, category:'related=1'}` + `fetchList` 在该标记下走 `get_block&from=N` 片段（**参数名照各自锚抄**：相关块 `from`、会员作品块 `from_videos`，互套会静默取不到条目；`hasMore` 以 `#<blockId>_pagination a` 在不在为准，`.pagination`/`li.next` 在这条通道恒判 false）。`from=1` 与详情页首屏那块**同源**（快照实测完全同序同内容，故列表页首屏接得上；站点该块会随新投稿小幅漂移，属正常 churn）。**凡块渲染了 `li.next > a[data-container-id="<blockId>_pagination"]` 的都算「有列表页」**（末页退化成 `<span>Next</span>` 即停），别只看锚的 `href="#…"` 不是地址就判没有——**漏判 = 把站点能力丢掉**（kvs_site_a 社区页两个私密分区曾因此不给 `viewMore`，v1.9.0 补 `private=videos|albums` 块通道）；给 `viewMore` 时**别漏该块自己的排序档**（同一页各块档位各不相同，抄块头 `<ul id="<blockId>_sort_list">`，见 pitfalls.md）（kvs_site_a 案例，见 data-model.md「块级『更多』入口」）。
> 工具链类：Marionette 起不来（`frx_env_open` 速死 / 2828 不可达，见 pitfalls.md）。

## 进一步参考
- 浏览器启动与恢复（阶段 0 全文）：`references/browser-startup.md`
- 网站分析（frx-director MCP 完整流程）：`references/website-analysis.md`
- 注入 API 完整说明：`references/api-reference.md`
- 数据模型（线路剧集/清晰度/页面通道/懒播放契约）：`references/data-model.md`
- 预设目录页分析与筛选准则（18 条）：`references/listings.md`
- 踩坑记录全文（70 条）：`references/pitfalls.md`
- 视频播放（HLS / m3u8 / `video` block 的 `referer`）：`references/video-playback.md`
- 分发清单（`manifest.json` 字段表 + 最小示例 + 三处一致）：`references/manifest.md`

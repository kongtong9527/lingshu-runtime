# 踩坑记录（插件侧）

> 归属：`lingshu-plugin-dev` 技能的插件侧踩坑全文。SKILL.md 只留索引表；新增条目先查本文件去重（阶段 5），重复则合并。宿主侧坑见 devconsole/runtime docs，跨侧互引。

## 常见问题与踩坑记录

> 索引（按需跳转，全文仍在本节；新增条目先查索引去重，重复则合并——阶段 5）：
> 契约类：link-target / tags-url / description一致（**改任一侧必当次同步另一侧，先判哪边是事实真相**） / labelId在线验证 / explore信封与viewMore / **详情推荐块块级「更多」（无对应列表页就不写 / url 必是真页、通道标记进 category）** / url通道filters不受CLI强验（**声明前手工实测该页真消费参数**） / 封面缺失用站点自带占位图（**别留空别自造；站点有位图版本优先位图，只有 SVG 也照用——iOS 0.1.29 起自绘子集支持**）；
> 解析类：渲染后DOM-fixture / 无URL全局 / 二次JSON.parse / code判定 / SSL / 父容器text粘连 / 简介多行压平 / 作者链接取最长文本 / 页码段与内容ID段同位（**路径分类靠段数/slug，勿只看前缀**） / CF邮箱混淆（**用户名 `.text()` 得 `[email protected]` 假名，解 `data-cfemail`**） / **块翻页锚 `href="#…"` 不是地址 ≠ 没有列表页**（块片段接口就是它的列表页，判据 `li.next > a[data-container-id]`）；
> 内容类：阅读页prevNext / HLS-403 / 全站CF拦截（L3） / macCMS-show拦截 / SSR懒加载标记 / packed解包 / 分页两形态；
> 链路类：encrypt播放页解析。
> 工具链类：Marionette 起不来（env_open 速死 / 2828 不可达）。
> 宿主侧判定与互引见「跨侧问题速查」一节。


### link 块传 `target` 会被宿主忽略（旧契约无此字段），详情页内跳要用它

**症状**：详情页作者/来源链接期望在 app 内打开列表，实际点了跳浏览器新标签页。

**原因**：`link` 块旧契约只有 `content`+`url`，宿主一律按外链渲染（`<a target="_blank">`）；
`tags`/`recommendations`/`chapter` 才有「target 优先内部导航」的支持（devconsole
`onTagClick`/`onDetailClick`/`onChapterClick` 回调）。插件给 link 传 `target` 会被忽略。

**现状（2026-08 宿主已扩展）**：`link` 块可选 `target?: PageJumpTarget`——带 target 时
宿主内部导航（`onLinkClick` 回调，同「有 target 优先、url 退为外链回退」准则），
无 target 仍为外链。插件侧写法：

```javascript
blocks.push({
  type: 'link',
  content: `作者：${author.name}`,
  url: authorPageUrl,
  target: { action: 'list', url: authorPageUrl } // 页面通道：宿主内调 fetchList({url})
})
```

**真实案例**：`manga_site_c.plugin.js` 作者块首版在旧契约下传 target 无效（跳浏览器），
宿主扩展 link 块契约后无需改插件即内部跳作者列表页。

### 渲染后 DOM 当 fixture 可能掩盖「数据全靠运行时接口」，在线实测为准

**症状**：离线 fixture 验证详情页推荐/相关区块有数据（6 张卡片），在线跑同一插件输出为空。

**原因**：fixture 用了浏览器 `page_eval` 渲染后的 `outerHTML`——页面停留期间运行时 XHR
（懒加载接口）已把数据填进 DOM；而插件 `$lib.http.get` 拿到的是**SSR 原文**，该区块
可能本来就是空的（数据全靠运行时接口）。fixture 与真实运行环境不一致 → 在线暴露。

**修复**：
1. 判数据源时把「渲染后 DOM」与「document 响应体（SSR 原文）」分开看：SSR 原文里
   `x-html`/懒加载容器为空 + 有对应 XHR 接口 → 区块数据在接口，不在 SSR。
2. fixture 优先存 **SSR 原文**（`net_get` 取 document body 或 curl 抓取），与插件真实
   输入一致；渲染后 DOM 只用于确认交互行为。
3. 需求语义是「站点该区块的数据」时，复刻站点的接口调用（`$lib.http.post` JSON body
   即可），接口失败静默省略/回退 SSR，行为确定。

**真实案例**：`manga_site_c.plugin.js` 首版详情页「更多相关」按渲染后 fixture 写 SSR 解析，
在线实测 recommendations 恒为空——站点 SSR 原文该区块 0 卡片，数据来自运行时
`POST /api/comic/recommend-html`；改为 fetchDetail 复刻该接口后在线正常（约 6 张）。

### 沙箱没有 `URL` 全局，别用 `new URL()` 解析请求地址

**症状**：`fetchList`/`fetchDetail` 运行时抛 `ReferenceError: URL is not defined`。

**原因**：沙箱只注入 `$lib` 命名空间的能力（`$lib.http`/`$lib.cheerio` 等），Node 的 `URL`
等标准全局不暴露。插件虽是 `.js` 但运行环境 ≠ Node 完整标准库。

**修复**：不要 `new URL(url)`；用正则/字符串切分解析。取查询参数等轻量需求：

```javascript
const pageMatch = String(url).match(/[?&]page=(\d+)/)
const page = pageMatch ? Number(pageMatch[1]) : 1
```

**真实案例**：`manga_site_c.plugin.js` 首版 `fetchList` 用 `new URL(url).searchParams.get('page')`
在 runtime 离线/在线均炸 `URL is not defined`；改为正则后通过。

### 统一请求封装已返回对象时不要二次 `JSON.parse`

**症状**：设置 action（签到等写侧操作）运行时报 `SyntaxError: "[object Object]" is not valid JSON`。

**原因**：插件的 `get/post` 统一封装已负责 `JSON.parse(res.body)`（含解密后的解析），调用方再 `JSON.parse(返回值)` 时，对象会被字符串化为 `[object Object]`。

**修复**：直接消费 `get/post` 的返回值；只有 `$lib.http.get/post` 的原始响应才需要 `JSON.parse(res.body)`。

**真实案例**：`manga_site_b.plugin.js` 的每日签到对 `get('/daily...')` 与 `post('/daily_chk', ...)` 的返回值各包了一层 `JSON.parse`，导致手动签到按钮报错；移除后恢复正常。

### 写侧接口以 `code` 判定结果，不要只认 `msg`

**症状**：签到等写侧请求返回 `{"code":200,"data":null}`，插件仍提示失败。

**原因**：接口成功时可能没有 `msg`，`code===200` 即代表成功；只检查 `msg` 会把成功误判为失败。

**修复**：成功判定覆盖 `code===200`（或接口文档明确的其他成功码），`msg` 仅作为可选提示文案。

**真实案例**：`manga_site_b.plugin.js` 的 `/daily_chk` 成功返回 `{code:200,data:null}`，原代码只认 `msg`，导致签到按钮误报失败；改为按 `code` 判定后正常。

### SSL 证书验证失败（`UNABLE_TO_VERIFY_LEAF_CERTIFICATE`）

**症状**：请求目标站点时抛出 `TypeError: fetch failed`，错误信息为 `unable to verify the first certificate`。

**原因**：目标站点使用了 Node.js CA 信任库无法验证的 SSL 证书（自签名、过期、或由非权威 CA 签发）。curl 等工具可正常访问是因为它们使用系统证书库，而 Node.js/undici 使用自己的信任库。

**修复**：在 `$lib.http.get/post` 的 options 中传入 `rejectUnauthorized: false` 跳过证书验证：

```javascript
function request(url) {
  return $lib.http.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
    rejectUnauthorized: false  // 跳过 SSL 证书验证
  })
}
```

**真实案例**：`short_site_a.plugin.js` 开发时，目标站点 `short_site_a.com` 使用了无法被 Node.js 验证的证书，导致 `getCategories` 等所有网络请求均失败。

### 漫画阅读页：`fetchReadingPage` 应提取上一话/下一话（`prevUrl`/`nextUrl`）

**症状**：App 阅读页滚到章末不加载下一话（连续章节流 失效），
或用宿主侧章节列表兜底推导出**跳漏小节**的章节链。

**原因**：阅读页的 prev/next 是**站点自身导航**（分卷/小节拆分只有它知道——
如 manga_site_f「第6話(1/3)→(2/3)→(3/3)」，详情页章节列表只有「第6話」一个入口；
按列表推导会把 (2/3)、(3/3) 整个跳漏）。宿主侧已有「详情页章节列表兜底」
（插件没返回时才用），但**分卷小节链必须让位站点导航**——插件不提取等于
放弃了最准确的相邻章信息。

**修复**：`fetchReadingPage` 解析阅读页底部导航条（常见形态：
`#prev-chapter` / `#next-chapter` 锚点，或含「上一話/下一話」的链接），
把 href 原样放进返回值的 `prevUrl` / `nextUrl`（可选字段，没有就省略）。

**真实案例**：`manga_site_f.plugin.js` 首版阅读页只取图不取导航（`comic-contain__item`），
App 滚到章末永远不触发加载下一话（真机用户报修「拖到 80% 下滑不加载下一话」）。
补上后：`page_direct?chapter_slot=5` → 302 到 `twmanga.com/.../0_5.html`，
底部导航链 `0_5 → 0_5_2 → 0_5_3 → 0_6 (第7話)` 无缝贯通（fetchReadingPage
自动跟踪重定向，页面导航即目标域下的链，href 原样透传即可）。

### HLS 视频 403 / 无法播放

**症状**：详情页 `video` block（m3u8）在 DevConsole 中报 `key.bin 403` 或 `MEDIA_ERR_SRC_NOT_SUPPORTED`。

**插件侧检查**：
- `video.url` 是否为完整的原始 CDN URL（带 `verify=`/`token=` 等鉴权参数），不要被改写成代理 URL
- CDN 校验 Referer 时是否在 block 上设置了 `referer`（值为详情页或同站 URL）

> DevConsole 宿主侧的 HLS 播放链路与已知处理（`key.bin` 直连、VideoPlayer 优先 `Hls.isSupported()`、完整排查）见 `devconsole/AGENTS.md`。

插件侧数据契约与验证清单见 [`video-playback.md`](video-playback.md)。

### 全站 Cloudflare 拦截（L3，Node 无解型）

**症状**：全路由（列表/详情/搜索）`$lib.http` 403，body 为挑战页（`Just a moment...`）或
WAF block 页（`Attention Required!`），常带 `cf-mitigated: challenge` 响应头。

**先定级再动手**：L1 单资源 / L2 资源链仍有插件侧解法（见 HLS-403 与宿主直连）；
L3（全站）的 Node 通道彻底无解——`cf_clearance` 全套复用（同机同 IP、同 UA、齐浏览器头）
经 curl 仍 403（clearance 绑 TLS 指纹），"粘贴 Cookie"路线已否决，不再投入。

**修复（L3 插件侧只做一件事：纯直连，CHALLENGE 直接抛由宿主验证入口接管；到万不得已禁止用 `$lib.browser.getHtml`，例外判据见 `api-reference.md`「Cloudflare 挑战」节）**：

挑战识别 + 如实报错已下沉宿主：`$lib.http.get/post/del` 命中共享判定表
（403/503 + `cf-mitigated` 头或正文强特征串，见 runtime `runtime/challenge.ts`）
即抛统一错（`code == 'CHALLENGE'` + `url` + `Lingshu:` 前缀人话），不 resolve
挑战页给插件。**禁止插件自写 `isBlockedResponse`/`challengeError`**
（anime_site_a/video_site_f 的旧判定已删）；半信任 403 + 真内容（无强信号）宿主放行，
插件按"解析出条目即成功"兜底。标准形态见 `api-reference.md`「Cloudflare 挑战」节
（`request()` try/catch + `assertParsed(url, res, got)`），此处不复述。

路由级指引是唯一的例外：如 movie_site_c 筛选路由被拦需告诉用户改走搜索，只以前缀改写
`e.message`，保留原错的 `code`/`url`（验证链路不断；message 仍含原文，宿主二次识别
与提 URL 不受影响）。

在线验证全部标 `[在线待验]` 留给浏览器通道就绪后的复核（referer 校验、编码形态、时效 URL），
骨架版以 `--fixture` 离线验证解析逻辑为上线标准。

**真实案例**：`anime_site_a.plugin.js` v0.1.0（全站 Managed Challenge + WAF，list.html/detail.html/search.html
三 fixture 离线全绿，在线抛指引错；宿主侧 `isChallengeResponse` 标记）→
v0.2.0（插件切显式 `$lib.browser.getHtml`，直连 403 → 单次浏览器重抓，
仍拦抛结构化 `code == 'CHALLENGE'` + `url`；runtime 无浏览器恒抛、`--fixture` 短路 browser；
iOS 真机隐藏抓取仍 403，证隐藏通道对 L3 无解，转正需可见手过验证）→
（判定下沉宿主，插件删判定函数与站名前缀错）→
**现行（插件侧弃用浏览器重抓，纯直连 + `CHALLENGE` 直抛交宿主验证入口接管，
只留 `assertParsed` 解析兜底；`request()` 回到一行 `$lib.http.get`）**。

**L3 转正 checklist（在线复核逐项打勾）**：referer 校验（详情三档 secure= 是否验详情页）/
sort `+` 编码（表单空格转 `+`，勿 `%20`）/ secure= 时效（约 12h，现算现用不落盘）/
详情 playlist 上限（同社团推荐数）/ 反爬门控回归（isActive + 8s 冷却，禁并发打爆）/
隐藏 WebView 屏外（block 页鬼影）/ 挑战判定三端拉齐（`cf-mitigated` 头 + 强特征集，
弱信标 `challenge-platform` 已剔除，见 runtime `runtime/challenge.ts`）。

**clearance 綁定粒度分站（video_site_f 實證，2026-09）**：L3 的"複用無解"結論以 anime_site_a
（綁 TLS：同機同 UA 全套頭 curl 仍 403）為準，但綁定粒度分站——video_site_f 綁 UA：
瀏覽器 `cf_clearance` + 同 UA（Firefox 153）+ Referer 經 curl 重放可 200（含真內容），
換 UA（Chrome）同 clearance 仍 403。新站定級時加一發判定實驗再下結論：
同 UA + Referer + clearance curl 一發——200 = UA 綁定（fixture 可 curl 直下全量、
DevConsole 共享 jar 預熱後直連可能沾光，但 CLI 無 clearance 仍按 L3 如實報錯），
403 = TLS 綁定或更嚴（徹底無解）。插件 UA 必須與 clearance 簽發 UA 一致才能沾光，
換 UA 即失綁（video_site_f 插件固定 Firefox UA 即為此）。

**硬關重抓分支的前提（video_site_f 2026-10 實證）**：iOS 唯一 WK→宿主 jar 拷貝原只在
browser 腿內跑，可見驗證 Sheet 自己不寫 jar——直刪分支，驗證後純 `$lib.http`
仍帶舊 jar 注定 403。硬關僅在宿主補齊兩件後才成立：① 驗證頁「已驗證」先回填
落盤 + `execute` 起手合併；② http 腿每次記 UA 供驗證頁復用（clearance 綁 UA）。
兩件見 ios `docs/http-bridge.md`「無 browser 腿亦回填」條，缺一即回退重抓形態。

**真內容否定門首選站內不變量（video_site_f 實證）**：挑戰頁標題恆為 `Just a moment`，
正常頁恆含 `__NEXT_DATA__`——以 `__NEXT_DATA__` 為真內容門（anime_site_a 用標題含站名，
video_site_f 標題無站名不適用）：403 + 無該串才判挑戰，403 + 有該串照常解析。

### `tags` / `recommendations` 块的 URL 约定（插件侧）

**症状**：详情页的 `tags`、`recommendations` 块点击后跳到外站，没有在宿主（DevConsole / App）内打开对应的「列表预览」/「详情预览」。

**根因（插件侧）**：宿主按 [`data-model.md`](data-model.md) 消费这两类块的 `url`：
- `recommendations.content[].url` 必须是**详情页 URL**（即传给 `fetchDetail` 的那个 URL），宿主点击会调 `fetchDetail(url)`。
- `tags.content[].url` 是**标签页链接**，宿主点击会回到 `fetchList` 并把 URL 的 query string 作为 `context.category` 传入。

所以插件要保证 url 自描述了「如何复现这次跳转」：

1. **`fetchList` 必须从 `context.category`（组合查询字符串）解析参数**，而非读自定义的 `context.xxx`。例：
   ```javascript
   function parseCategory(category) {
     const raw = String(category || '').trim()
     if (!raw) return {}
     if (raw.indexOf('=') < 0) return { category: raw } // 兼容裸值
     const params = {}
     raw.split('&').forEach((pair) => {
       const idx = pair.indexOf('=')
       if (idx > 0) params[decodeURIComponent(pair.slice(0, idx))] = pair.slice(idx + 1)
     })
     return params
   }
   ```
   value **不要 decode**（label id 常含 `%3D`，需原样拼回 path）；`getCategories` 的 group `key` 与此处的 params 键名对齐（如 `key: 'label'` ↔ `params.label`）。

2. **标签 URL 若是 path 形式**（标签 id 在 path 而非 query，如 `/label_list/<id>`），构造 `tags.content[].url` 时补一个 query 让宿主能还原筛选参数：
   ```javascript
   `${BASE_URL}/label_list/${labelId}?label=${labelId}`
   ```
   真实 App 跳转时忽略冗余 query、用 path 部分即可。若标签链接本身就是 query 形式（如 manga_site_a 的 `/search?tagIds=xxx`），则无需补。

> 宿主（DevConsole）具体如何消费这些 url 属于宿主侧实现，见 `devconsole/AGENTS.md`。

**块级「更多」入口（2026-10 补，`recommendations.viewMore`）**：推荐块还有**块级**跳转——`title?`（缺省宿主渲染「推荐」）与 `viewMore?`（`PageJumpTarget`，与发现页分区 `ExploreSection.viewMore` 同型同语义，宿主在块标题右侧渲染「更多」）。两条易错点：

- **无对应列表页就不写**：宿主只认字段在不在，`viewMore` 缺失即不渲染按钮；写了却落不了地（站点该维度只有一屏、或翻页只在站点自己的 AJAX 里而插件没复刻通道）= 点开还是那几条的死「更多」。
- **`viewMore.url` 必是真实页面**（落地页的「网站原页」按钮取它，合成地址会指向不存在的页）；通道标记/筛选参数进 `category`。站方「更多」是 AJAX 锚、`href` 不是地址时（KVS 站典型：`div#…_pagination > a[href="#more"]`），标准落法是 `url` = 当前详情页 + `category` 带通道选择器（如 `related=1`），由 `fetchList` 在该标记下复刻分页（kvs_site_a 案例；契约全文见 [`data-model.md`](data-model.md)「块级『更多』入口」）。

**真实案例**：`short_site_b.plugin.js` 原本读 `context.label`（不存在，应为 `context.category` 解析），导致标签筛选失效；详情页标签当纯文本渲染。修复后从 `context.category` 解析 label，并新增 `tags` 块（url 补 `?label=`）。

### macCMS 影视站：`/show/` 筛选路由被 Cloudflare 拦截，分页别依赖它

**症状**：`fetchList` 走 `/show/<tid>--<order>----.html` 等筛选/排序/分页形态时，偶发 `fetch failed` / HTTP 403（CF 挑战页）。

**原因**：部分 macCMS 站把 `/show/...`（筛选、排序、翻页链接）放在更严的 CF 规则下，Node 侧无浏览器执行挑战拿不到页面；但 `/type/<tid>.html`、`/type/<tid>-<page>.html`、`/detail/`、`/play/`、`/search/` 等页面路由可直连。

**修复**：
- 分页改用 `/type/<tid>-<page>.html`（第 1 页 `/type/<tid>.html`），`hasMore` 取分页块内「当前/总页数」（如 `2/20`），取不到用「列表非空」启发式。
- **筛选能力声明与请求解耦（修订）**：`/show/` 被拦不影响**声明真实筛选组**——`getListings` 的每个 listing 可带 `filters`（从目录页内嵌筛选块逐链接提取，id 取 `/show/` 段位值原文），`fetchList` 检测到筛选键时构造 `/show/` 路由请求，403/挑战页**如实报错**（带站点信息与替代路径），不静默回退未筛选列表。声明真实存在的选项不是冒充能力；请求侧不可达就明说。
- 详情页里的分类/主演/导演链接虽指向 `/show/`、`/search/` 异位形态，插件生成的 `target` 用结构化跳转（`{action:'list', category:'tid=N'}` / `{action:'search', query}`）替代原 URL 约定。

**真实案例**：`movie_site_c.plugin.js` 开发时 `/show/2--------2---.html` 等全部 403/000、`/type/1-2.html` 稳定 200——分页与无筛选目录页收口到 `/type/` 路由；筛选则按声明进 `Listing.filters`（五分类各一套真实选项，如电影 28 题材/27 地区、综艺无地区组），`fetchList` 对筛选键请求 403 时如实报错并引导站内搜索。

### 播放页解析：encrypt、签名接口与时效 URL（`fetchPlayUrl`）

**症状**：`fetchPlayUrl` 产出的 URL 无法播放 / 报错，或播放页解析链路（播放器 iframe → 解析 API）在 Node 沙箱里失败。

**根因与对策**（macCMS 常见形态，movie_site_c 完整样例见 `_fixtures/movie_site_c/analysis.md`）：
- **`player_aaaa.encrypt` 处理**：macCMS 播放器 `MacPlayer.Init` 只处理 `encrypt==1`（unescape）与 `==2`（base64+unescape）；`==3` 原样传 `<hex>`，由 `/static/player/NBY.js` 这类播放器 JS 构 iframe 到自定义播放页（如 `/static/player/artplayer/?url=<hex>`）。**hex→vkey 常在服务端 PHP 完成**——插件只需 GET 播放页读常量（`playPageUrl`/`secretKeySeed`/`timestamp`），不要逆向 hex 本身。
- **解析 API 需要 Origin/Referer/UA**：POST 无这三者返回 `{"error":""}`。
- **AES 派生注意 Utf8.parse**：key/iv 由 `MD5(timestamp + 硬编码seed)` 派生时，用 `CryptoJS.enc.Utf8.parse`（非 `Hex.parse`）；seed 可能与页面的 `secretKeySeed` 无关（execB 内硬编码）。
- **时效 URL**：最终流常带 `auth_key`（约 1h 有效），每次点击现算；不要试图长缓存。
- **最终产物可能是 MP4 直链而非 m3u8**：`fetchPlayUrl` 返回 `{ url }` 即可，宿主播放器按 URL 形态自动处理。

**真实案例**：`movie_site_c.plugin.js` 的 NBY 线路：GET artplayer 页（桌面 UA 即可）→ POST `hd.movie_site_c.com/...`（移动 UA + Origin/Referer）→ AES-128-CBC-Pkcs7 解密 → `pcdn-qn-new.samtory.cn/...mp4?auth_key=...`，与浏览器真实请求逐字节一致。

### SSR 缺懒加载标记：列表封面/正文图选择器别依赖运行时属性

**症状**：列表页封面、正文图片解析不到（Linux 上桌面 UA 抓的 SSR HTML 里 `img` 没有
`_type="data-src"` 属性、只有 `data-src` + `src=占位图`），但浏览器实测（运行后 lazyload
脚本补了 `_type`）却能看到——凭浏览器 fixture 写的 `img[_type]` 选择器在 Node SSR 侧扑空。

**原因**：`_type` 是运行时 lazyload 检测的标记，SSR 不一定输出；常见形态是「`data-src`
指向 CDN 密文 URL / `src` 指向 `/static/web/images/poster_loading.*` 占位」。

**修复**：只要 `data-src` 是「非占位、非 `data:image/` 的 URL」即视为密文 URL 原样透传（宿主
经 `metadata.imageEncryption` 解密）。显式 `_type` 非 `data-src` 才跳过。

**真实案例**：`video_site_a.plugin.js` 封面首轮为空——`img[_type]` 匹配不到 SSR 的裸 `data-src`；
放宽为「卡内第一张 img 的 data-src」后封面回归；并 curl 实测该 URL 响应为
`binary/octet-stream` 密文（非 JPEG 头），确认仍须走解密。

**背景图形态**：lazysizes 背景懒加载的卡片封面不是 `<img>` 而是
`<div class="card-img-top" data-bg="...">`（SSR 只有 `data-bg`，渲染后才补 `style`）。
选择器取 `data-bg` 优先、`style` 内 `url(...)` 兜底，不要只读 `style`。
**真实案例**：`manga_site_d.plugin.js`（WordPress joy5 主题）列表封面与详情封面均为
`div[data-bg]`，curl 原文无 `style`，浏览器渲染后才有——按 `data-bg || style` 双通道后离线/在线一致。

**反向形态：lazy-load 会「删掉」SSR 的真值字段，同一份页面两态真值所在字段相反**。
KVS 类站的 `img` 在 SSR 原文里是 `src="data:image/gif;base64,…"`（1px 占位）+
`data-original="真图"` + `data-webp="真图"`；浏览器渲染（lazyload 执行）后 **`data-original`
被库移除、`src` 变成真值**，`data-webp` 保留。只读 `data-original` 的实现在线必空（渲染后没这属性），
只读 `src` 的实现在离线 fixture 上必空（SSR 里是占位）。

**修复**：取图写成三段兜底并跳过占位 —— `data-original → data-webp → data-src → src`，
任一候选命中 `^data:` 一律跳过。渲染后仍有部分卡片 `src` 是占位（未进视口、lazyload 未触发），
所以 `src` 只能作最后兜底，不能作首选。

**真实案例**：`kvs_site_a.plugin.js`（2026-10）——列表页 25 张卡在无头浏览器快照里仅 16 张
`src` 为真值、9 张仍是占位；`pickImage()` 三段兜底后离线（SSR fixture）与在线（渲染后）取图一致。

### 站点展示数是前端现算的假数：角标/计数只认接口原始字段（video_site_j 实证）

**症状**：列表卡 `.card-badge` 有秒数（如 `12s`），照抄进角标后用户发现与真实片长完全对不上。

**原因**：该秒数是前端按帖子 id 哈希现算的（`12+hash(id)%50`，chunk 内 `deriveMeta` 明文可查），同站点的点赞/评论/收藏/粉丝在源字段为 null 时也是同款种子随机数——渲染层装饰，不是数据。ffprobe 反证：显示 `12s` 的片子真实 2145s。

**修复**：角标时长必须有诚实来源（接口字段或实测片长），站点现算数一律不用（宁缺不伪造）；`source_likes` 这类源字段为 null 时不回落展示数，`metadata` 留空即可。

### 列表混入站外推广卡：卡片解析必须按 href 形态过滤

**症状**：列表/搜索结果混入一条标题正常的推广卡（如「雙馬尾巨乳蘿莉公開校園調教計劃」），
点进去是站外广告页；插件不做过滤会把广告当内容返回。

**原因**：WordPress 类站点在列表流、搜索结果中插入与内容卡**同构**的推广卡
（同样的 `div.card > a > div.card-img-top + p.card-text`，只是 `a[href]` 指向站外短链
如 `url.268888.xyz`）。按 class 选择器全收即中招；浏览器实测肉眼不易察觉（混在流中只有一条）。

**修复**：`parseCard` 按 `href` 形态白名单过滤——真内容链有固定形态
（如 manga_site_d 一律为 `<本站域名>/<数字>/`），非本站/非数字 id 的 `href` 直接跳过；
同时用 `Set` 按 URL 去重（详情页「相關熱門」区与正文卡片同构，防止串入）。
不要按标题关键词黑名单（广告标题常换）。

**别维护广告域名黑名单**：判定写成「**站点家族主机 + 数字路径**」即可让站外短链
（`url.268888.xyz`）、站内非数字路径（首页「热门口袋」卡 `/search/<词>/`）与站内广告
同时落空，而黑名单会随广告商换域名过期。主机部分务必用**站点家族正则**而非单一 TLD
字面量——单一 TLD 正是 manga_site_d 2026-10 全站 0 条的成因（见「站点迁移 canonical 域名」条）。

**真实案例**：`manga_site_d.plugin.js` 搜索页 18 张卡含 1 张站外推广卡，
`contentIdOf`（`<站点家族域名>/<digits>/` 或 `/<digits>/` 才收）后稳定返回 17 条真内容。
首页实测 48 张 `div.card` = 38 张真内容 + 6 张 `/search/…` 快捷键卡 + 4 张站外广告，
过滤并按 URL 去重后 35 条（3 条为跨分区重复）。

### packed JS（p,a,c,k,e,d）解包 → 播放链路参数自足

**症状**：视频地址不在 HTML / 普通 API 里，要经过「内嵌 packed 脚本 → 调解析接口 → 响应又是
packed 脚本 → m3u8」。

**对策**（video_site_a 实例，`fetchPlayUrl` 内闭环，零硬编码）：
1. GET 视频详情页 → 遍历 `<script>` 找含 `detail_play` 的那段 → 用标准 p,a,c,k,e,d 解包器
   （`eval(function(p,a,c,k,e,d){...}('BODY',A,C,'K0|K1|…'.split('|'),0,{}))`）解出明文。
2. 解包结果里正则取 `detail_play?img=…&ads=…&u="+encodeURIComponent("TOKEN")` —— `img/ads/u`
   全部自足，`t` 现算（`parseInt(Date.now()/1000/2100)`）。
3. GET `/index/detail_play?img=…&ads=…&u=…&t=…` → 响应是第二个 packed 脚本，m3u8（带时效
   `auth_key`）直接明文出现在 k 数组或解包后 —— 正则 `https://[^'"|)]+\.m3u8[^'"|)]*` 提取。
4. 返回 `{ url: m3u8, referer: 详情页URL, platform }`。
同一解包器对 `detail` 与 `avdetail` 两种详情 URL 都工作（参数都在页内脚本、与 URL 形态无关）。

### 分页 URL 两种形态（query vs path）要分别构造

**症状**：站点不同列表页分页形态不同——`?page=N`（视频/新闻/小说/搜索）vs 路径 `/N`
（moviesets 合集详情 `/moviesets/category/<slug>/<page>`）；把 query 分页拼给路径页会翻不动。

**修复**：`hasMore` 统一读 `.pager-label`「第 cur/total 页」（拿不到用「列表非空」启发式）；
翻页 URL 按请求页 URL 的形态构造：`/moviesets/<type>/<slug>` 形态 → 去掉尾数字段再拼 `/page`，
其余 → 追加 `?page=`/`&page=`。可再以「下一页」链接 href（`?page=N` 或 `/N`）做形态确认。

### KVS 站 `data-parameters` 的 `from:max` 不是总页数（滑动窗口），`hasMore` 以 `a.next` 为准

**症状**：KVS 站分页块 `data-parameters="...from:N"` 的最大 N（如 9）看起来像总页数，
按它算 `totalPages` 会导致第 9 页 `hasMore:false`——但实际点到第 9 页后又冒出 10、11（滑动窗口，总数不可预知）。

**修复**：`hasMore` 只认 `a.next` 链接——无 next / `href="#"` / 指向当前页即无更多；
`totalPages` 按契约为可选，未知即省略（不要拿窗口最大值冒充）。
超界页站方回 404 时：`page>1` 收敛为空列表（`hasMore:false`），第 1 页 404 照常抛错。
`items.length === 0` 时 `hasMore` 必为 `false`（已有红线，见 `data-model.md`）。

**真实案例**：`video_site_e.plugin.js` v1.2.0——`data-parameters` 最大 9，第 9 页分页条变为
`1 … 4 5 6 7 8 [9] 10` 且第 50 页仍有 30 条；超界（如 99999）站方回 404。改用
`nextPageNumber(a.next.href) !== page` 判定后第 9 页 `hasMore:true` 恢复正常。

### 列表页码段与内容 ID 段同位（都是数字）时，路径分类必须靠「段数/slug」而非前缀

**症状**：同一前缀下的页面被判成一类——图集页混进视频列表解析（0 条或串味），
或列表页码页被当详情页（`fetchDetail` 解析成空）。

**原因**：站点把列表索引、列表页码、内容详情放在同一前缀下，且**页码段与 ID 段都是数字**，
肉眼同形：`/albums/`（索引）、`/albums/{N}/`（页码，可到 2878）、
`/albums/{id}/{slug}/`（详情）。只写 `/^\/xxx(\/|$)/` 会把三者归一，
只写 `/xxx\/\d+\//` 又会把页码页当详情。

**修复**：分类先判**带 slug 的详情**（`/^\/xxx\/\d+\/[^/]+\/?$/`），其余同前缀归列表；
列表卡与详情内容常是**同容器名不同类**（`.list-albums .item` vs `.list-videos .item`），
按路径选解析器而不是一个通吃；`fetchList` 收到详情 URL 要如实报错并指路 `fetchDetail`，别静默回落。

**真实案例**：`kvs_site_a.plugin.js`（2026-10）——`/albums/2/` 是真第 2 页（首条与第 1 页不同、
末页 `/albums/2878/` 的 `li.next` 退化成 `<span>` → `hasMore:false`），
`/albums/38054/ns-eyes-sf-445-…/` 才是详情，两者都含数字段。

### KVS 站搜索页翻页/筛选是 AJAX-only，必须走 `mode=async&function=get_block` 片段接口

**症状**：KVS 站搜索结果页翻不动——`/search/{q}/?page=2` 与 `/search/{q}/2/`（后者回 **404**）
都被忽略，回包仍是第 1 页（`li.page-current` 显示 1、首条 id 与第 1 页相同）。

**原因**：KVS 搜索页的分页/排序/筛选链接是 `href="#search"` + `data-action="ajax"` +
`data-parameters="q:…;category_ids:;sort_by:;from_videos+from_albums:N"`，**没有真实 href**；
列表页（`/latest-updates/{N}/`）是 path 型真实链接，两类页面的翻页机制不同，
套用列表页的 path 拼法必然扑空。

**修复**：搜索统一走 KVS 片段接口（返回 HTTP 200 + HTML 片段，含 `.list-videos`/`.pagination`）：

```
GET /search/{q}/?mode=async&function=get_block
    &block_id=list_videos_videos_list_search_result
    &q={q}&category_ids={ids}&sort_by={sort}
    &from_videos={page}&from_albums={page}
```

`from_videos`/`from_albums` 是**页码**（不是偏移量），两键各传当前页。片段只含视频分支，
天然排除 albums 卡片（搜索页 SSR 首屏是 24 videos + 12 albums 混排，必须另按 href 白名单过滤）。

**参数形态**（逐个实测，勿凭直觉）：

| 参数 | 有效形态 | 无效/报错形态 |
|---|---|---|
| 分类多选 | `category_ids=1,5`（**逗号**，实测返回真并集） | `category_ids[]=1&category_ids[]=5` → **HTTP 500** |
| 排序 | `sort_by=video_viewed`（搜索/分类/模特/标签页有效） | `/latest-updates/` 上传 `sort_by` **被忽略**（勿声明该页筛选） |

裸 `category_ids=` 走页面形态会返回 **404 + 有效 body**（`$lib.http` 不因 4xx 抛错仍可解析）——
统一走片段接口可避开 404 语义。

**真实案例**：`kvs_site_a.plugin.js`（2026-10）——`?page=2` 回第 1 页、`/search/office/2/` 回 404；
改走片段接口后 `from_videos=2` 正确回第 2 页；`category_ids=1,5` 结果中同时出现
Gravure Idols 与 JAV & AV Models 两个分类的视频，确认是并集，故声明 `check`（而非 `select`）。

**不止搜索页**（2026-10 补测）：**会员作品页** `/members/{id}/` 同为 AJAX-only——`/members/{id}/2/`
→ **HTTP 404**，分页链接是 `href="#videos"` + `data-block-id="list_videos_uploaded_videos"` +
`data-parameters="sort_by:;from_videos:N"`。第 2 页起改走：

```
GET /members/{id}/?mode=async&function=get_block
    &block_id=list_videos_uploaded_videos&from_videos={page}
```

返回片段里**同一个** `_items` 容器与 `.pagination` 都在（解析器与整页共用，无需第二套选择器）。
判定通法：**凡站点自己都用 `data-action="ajax"` 翻的块，插件侧一律走 `get_block`，别猜 path 页码**
——path 页码存不存在只有实测知道，错形态是 404（kvs_site_a 会员页）或静默回第 1 页（搜索页）。

**新站自查**：KVS 站（`flashvars` + `license_code` + `kt_player.js`）的搜索页首版即验
`--page 2` 首条是否与第 1 页不同；同 URL 上再跑一次 `--category "sort_by=…"` 确认排序生效。

### 一页多块：条目与分页都必须带块作用域（`.pagination` 取 `.first()` 会静默取错）

**症状**：翻页的 `hasMore` / 页码恒不对（恒 false 或恒 1），条目也可能混入别的块；**不报错、不抛异常**，
纯看条目还能看（只是页次全错），最容易被当成「站点就是这样」。

**原因**：`.pagination`、`.item` 这类**块内通用类名**在一页里出现多组时，全页选择器（`$('.pagination')`）
拿到的是**文档顺序里的第一组**，而它未必属于你要的那个块。实测 kvs_site_a 会员作品页并排 3 组
（`list_playlists_created_playlists_pagination`、`list_videos_uploaded_videos_pagination`、
`list_albums_created_albums_pagination`），**playlists 那组在文档里更靠前** → 不带作用域时取到的是
「播放清单」的页码与 `next`。首页（多分区 `.list-videos`）同理。

**修复**：解析器一律带块作用域——`parseX($, scopeSel)`；**条目与分页共用同一个块前缀**
（`parsePagination($, page, scopeSel)` 内部取 `${scopeSel} .pagination`），作用域常量提到文件头
（`MEMBER_ITEMS_SCOPE` / `MEMBER_BLOCK_SCOPE`），别在调用点手写字符串。

**新站自查**：先数一遍——`document.querySelectorAll('.pagination').length` 或 `$('.list-videos').length`
> 1 就必须带作用域；再确认各组 `id` / `data-block-id` 不同（同 `id` 出现多次说明选错了容器层级）。
`--fixture` 单页回归最好同时断言 `pagination.page`（而不仅是条目数）——页码错时条目数往往是对的。

### 插件元数据头 description 与 manifest.json 必须一致

**症状**：`vitest` 挂 `examples.test.ts`「header 与 manifest description 一致性」。

**原因**：runtime 测试校验每个插件 `// ==Plugin==` header 的 `description` 与
`manifest.json` 对应条目完全相等（Object.is）。

**修复**：**改任一侧必须当次同步另一侧，且不是照抄——先判哪边是事实真相**：插件行为已变 →
以插件头为准改 manifest（反之会把新行为写回旧描述）；只是信息量/措辞优化 → 以 manifest 为准
改插件头。改完立刻跑该项测试，别留着红。

**真实案例（已复发两轮）**：video_site_a 首版两侧措辞不同（1 个测试失败）；2026-10 批量漂移 4 个——
`anime_site_a`/`video_site_f` 是**行为改了**（弃用浏览器重抓）却只改插件头、manifest 留旧文，
`manga_site_d`/`video_site_h-vlog` 是 manifest 被写丰富后没回填插件头。漂移长期没人修 = 红测试被当噪音，
下一个人会以为「本来就失败」而跳过整份测试（勿回退）。

### url 通道目录页的 `filters` 不受 CLI 强验，声明前必须手工实测该页真消费参数

**症状**：listing 声明了 `filters`，`listings` 命令一片 ✓ —— 但用户在目录页点筛选毫无变化。

**原因**：`listings` 只用「`category` + 每组首选项」组合调 `fetchList` 验证**能出条目**，
对 `url` 通道目录页更是只打印「筛选摘要仅展示，不强验组合」；**参数是否真被站点消费**
它测不出来（站点常只对部分路径生效）。

**修复**：声明 filters 前手工跑两遍同一 URL 的 `--category "<key>=<非默认值>"`
（如 `--url /albums/ --category "sort_by=album_viewed"`），**比对首条是否变化**；
无变化即该页不消费该参数 → 不要声明（或改走真正消费它的路由）。

**真实案例**：`kvs_site_a.plugin.js`（2026-10）同站三态：`/latest-updates/` 忽略 `sort_by`、
`/categories|models|tags/{slug}/` 生效、图集索引 `/albums/` 也生效（且图集档位与视频档位不同：
观看数是 `album_viewed` 不是 `video_viewed`）——故视频列表不声明排序组、图集声明。

### 接口参数契约要在线复现验证，fixture 记录可能过期（movie_site_a labelId 案例）

**症状**：iOS 端搜索页报「脚本错误：接口返回异常：{"returnValue":3,"msg":"标签ID不能为null！"}」；
Node 模拟器 `run <id> list`（无 `--category` 或 `--category "plate=4"`）同样失败，`search` 却正常。

**原因**：列表接口 `getLabelVideoList` 的 `labelId` 是**必传**参数（缺失/空串报「标签ID不能为null！」、
`labelId=0` 报「参数异常」，服务端无「全部」语义）；旧 fixture 时代记录为可选，插件在 labelId 为空时
省略该参数 → 列表全挂。同站 `getSearchList` 则**不需要** labelId——先分清是哪个接口在报错再动手。

**修复**：labelId 缺省时按板块默认标签兜底（movie_site_a：`PLATES` 表带 `defaultLabel`，`fetchVideoList`
查表补参），任何入口（列表页、页面通道、搜索页联动）都不再省略。**验证**：`run <id> list` 无参 /
`--category "plate=4"` / 各板块 category 全部返回条目；`--category "plate=4&label=0"` 应如实报错
（无效值服务端同样拒绝，不冒充能力）。

**真实案例**：`movie_site_a.plugin.js` 2026-08-26 修复，探测证据见 `_fixtures/movie_site_a/analysis.md` §3.8。

### 卡片摘要：父容器 `.text()` 把相邻内联元素粘连（无分隔）

**症状**：列表摘要出现 `78Sep 3, 2026` 这类「数字+日期粘连」——父容器 `.meta` 内播放数
`<span>` 与日期 `<span>` 相邻无空白，`cleanText($a.find('.meta').text())` 压平成一串。

**修复**：子字段分别提取再用分隔符拼接（如播放数取 `.view-meta`、日期取
`.meta > span:last`，`[duration, views, date].join(' · ')`），不要对含多子字段的
父容器整体 `.text()`。

**真实案例**：`video_site_b.plugin.js` 首版摘要粘连，改按子字段提取后为 `78 · Sep 3, 2026`。

### 多行简介被 `cleanText` 压成一行（换行丢失）

**症状**：详情简介（如 anime_site_a `Title/Brand/Release/File size/…` 逐行）在站内多行显示，
插件出的 text 块却是一整行——宿主 `pre-wrap`/`Text` 已保留换行，但收到的 `content`
里根本没有 `\n`。

**根因**：`cleanText`（`\s+ → ' '`）压掉了所有换行；且 `.text()` 不产出 `<br>` 的分行
（`<br>` 无文本子节点，直接丢失）。

**修复**：简介类多行字段用逐行清洗（`cleanMultiline`：按 `\n` 切分 → 逐行 `cleanText` →
去空行 → `\n` 拼回），调用前先 `$el.find('br').replaceWith('\n')` 把 `<br>` 分行转出来。
单行字段继续用 `cleanText`，不要全局替换（标题/摘要压平仍是对的）。

**真实案例**：`anime_site_a.plugin.js` 1.3.3（fixture `detail.html` caption 5 行源码换行；
回归测试断言简介 text 块含 `\n` 且 6 行）。

### 懒解析 video 块无封面 → 观看历史无封面：`poster` 与顶层 `coverUrl` 必填

**症状**：`short_site_b` / `video_site_a` 观看历史全是占位图、无封面。

**根因链**：历史封面 = `PlayContext.poster` ← video 块 `poster`（`VideoTileBlock`，直链/懒解析同口径）
/ episodes 块 `poster ?? detail.coverUrl` ← 插件 `fetchDetail`。懒解析块（无 `url` +
`target.play`）只想到"播放占位"，没带 `poster`；`short_site_b` 更把 `coverUrl` 写死 `''`——
详情有播放、无封面，历史自然无封面。

**对策**：
1. 懒解析 video 块也要带 `poster`，`fetchDetail` 顶层也要回 `coverUrl`（与直链块同要求，
   数据模型 `video` 行 `poster?` 不是摆设）。
2. 详情页无主封面节点时，按"探测优先、搜索兜底"三级策略（`short_site_b` 实例）：
   先按 id 模板 Range 探测（见第 4 点），再站内搜索按标题精确定位同 id 条目取其
   `data-cover`（哈希图床同样命中），仍无则不带封面、不冒充。
3. 封面 host 必须与列表同链路（同套 `imageEncryption` 才解得开）：`og:image` / JSON-LD
   的 `expose` 镜像 host 不用（video_site_a 实例三处一致指向镜像，仍弃用）。
4. 同 id 模板扩展名可能因视频而异（`oshort_image/{id}ss.jpg` / `ss.png` 实测并存，
   直接写死一种必有 404）：用 `Range: bytes=0-0` 逐个探测存在性（CDN  honor Range，
   命中 206 / 缺失 404，1 字节零成本），不要凭单个样本定死模板。
5. `unpackPacked` 只做词替换不反转义，解包结果是 `url(\'https://…\')` 转义形态，提 URL 的
   正则必须兼容反斜杠：`/background-image:url\(\\?['"]?(https:\/\/[^'")\\]+)/`
  （不兼容则静默提不到封面）。

**真实案例**：`short_site_b.plugin.js`（首版按单样本写死 `ss.png`，部分视频 404 → 三级策略，
v1.1.2）/ `video_site_a.plugin.js`（packed background 提取 + 短视频分支补顶层 `coverUrl`）；
离线 fixture + 在线双验证通过。

### frx-director 浏览器起不来：`frx_env_open` 报 `Firefox exited before Marionette became ready`（工具链）

> 本节 `env_open`/`env_close`/`env_list` 均为 `frx_env_*` 简写，去客户端前缀后的全名与参数以官方 README（`https://raw.githubusercontent.com/WhiteNightShadow/frx-director-mcp/refs/heads/main/README.md`）实时节 + `agent_tools` 为准。

**症状**：`frx_env_open` 返回 `Firefox exited before Marionette became ready`
（`startupDurationMs` 仅几百毫秒——正常启动约 1.1～1.3s）；或 `frx_status`
报 `Marionette 127.0.0.1:2828 不可达`、`bridgeConnected=false`，所有 `frx_env_*`
调用连带 `ECONNREFUSED 127.0.0.1:2828`。

**原因**（三选一，先诊断再动手）：
1. **同 profile 已有实例在跑**：第二个实例抢 profile 锁直接退出（约 500ms 速死）。
   动手前先 `ps aux | grep "firefox -marionette"` 确认实例与 profile 是否一一对应。
2. **端口被失败的启动改写**：失败的 `env_open` 会把该环境 `profile/user.js` +
   `prefs.js` 的 `marionette.port` 重写成 2829（见 `control/runtime.json` 的
   `marionettePort`），而桥固定连 **2828**——进程即使在跑也连不上。
3. **正在跑的那个 Firefox 可能正是桥本身**（`bridgeConnected=true` 时）：直接
   `kill` 会把桥一起掐断，所有 MCP 工具全挂，比不动更糟。

**诊断**：
- `ps aux | grep "firefox -marionette"`：看实例与 `--profile` 是否一一对应
- `lsof -i :2828 -i :2829`：谁在监听（2828=桥，2829+=环境；`lsof` 服务名显示里 `itm-lm`=2828、`silkp1`=2829，认数字端口为准）
- `grep marionette.port <env>/profile/user.js <env>/profile/prefs.js`：核对端口是否被改写
- `<env>/control/runtime.json` 的 `marionetteStatus`/`stopReason`：看上次失败原因
  （`process-exited-before-marionette` 即抢锁速死）；注意该文件是 launcher 记账，
  手动拉起后会滞后显示 stopped，以实际进程为准
- `frx_status` 的 `startup.reachable=false` 可能是 stale 检测，以
  `bridgeConnected`/`ready` + `note` 为准

**修复**：
1. 同 profile 冲突：不要无脑重试，先处理旧实例（`env_close`；确认是孤儿进程才 kill）。
2. 绝不在 `bridgeConnected=true` 时 kill 正在服务的 Firefox；要动先 `env_close`。
3. 端口被改写后的恢复：停掉实例 → 把 `user.js`/`prefs.js` 的 `marionette.port`
   改回 2828（**必须停服改**，运行中改 `prefs.js` 会被 Firefox 回写覆盖）→
   用原命令行重拉（`-marionette -remote-allow-system-access -no-remote
   -profile <profile>`，先删残留 `.parentlock`）→ `lsof -i :2828` +
   `frx_status` 确认 `bridgeConnected=true`。
4. 一环境一实例；启停统一走 `env_open`/`env_close`，不手敲 firefox 命令
   （手动拉起只是桥断后的恢复手段，不是常规流程）。

**真实案例**：2026-09-06 `New Environment`：19:47 已有实例在 2828 上服务（即桥），
19:54 的 `env_open` 因抢锁 517ms 速死并把端口改写为 2829；误 kill 旧进程致桥断
（全工具 `ECONNREFUSED`），按上述步骤改回 2828 重拉后 `ready=true`、`frx_env_list` 恢复。

### `getExplore` 必须返回裸 `ExploreSection[]`，`viewMore` 必须是 `PageJumpTarget` 对象

**症状**：iOS 推荐页（`kind:'explore'`）中央报错「加载失败／未能读取数据，因为它的格式不正确」，
点「重试」依然同样报错；runtime `run <id> explore --fixture` 看似正常出数据。

**原因**：iOS 用 `JSONDecoder().decode([ExploreSection].self)` 解探索页（探索页条目／兜底首页，`DiscoverView`），
与契约 `type ExploreFeed = ExploreSection[]`（裸数组）严格对应。两类写法都会触发 `typeMismatch`／
`keyNotFound`（用户侧即「格式不正确」）：
1. 包信封：`return { sections }`（把内部变量名当返回结构）——对象解成数组直接失败；
2. `viewMore` 传字符串 URL：`sections.push({ title, items, viewMore: urlString })`——Swift 期望
   `PageJumpTarget` 对象（`{ action:'list', url }`），字符串解成对象失败。

**修复**：
```javascript
const section = { title: name, items }
if (viewMoreUrl) section.viewMore = { action: 'list', url: viewMoreUrl } // 页面通道，勿传裸字符串
sections.push(section)
// ...
return sections // 裸数组，勿包 { sections } 信封
```
**验证**：`run <id> explore --fixture` 后断言顶层为数组、`viewMore.action=='list'` 且
`viewMore.url` 可被 `fetchList({url})` 页面通道消费（`run <id> list --url "<viewMore.url>" --fixture` 出条目）。

**真实案例**：`anime_site_a.plugin.js` v0.1.0 `getExplore` 同时踩中两条（`return { sections }` +
`viewMore` 裸字符串），推荐页 100% 复现；iOS 侧解码与契约本身无误，不改宿主。v0.1.1 按上修复，
12 分区 144 条离线全过、`viewMore` 落地列表 41 条／73 页。


### Cloudflare `challenge-platform` 信标会注入正常页（已由宿主强特征集根治，勿在插件另写否定门）

**症状（历史）**：站点回 403 + 完整真内容（标题、正文俱全），插件仍判挑战
（`isBlockedResponse` 命中 `challenge-platform`），浏览器通道也拿回真内容却报 403，
验证死循环。

**原因**：Cloudflare 给正常页也注入 `/cdn-cgi/challenge-platform/…` 隐形信标脚本
（anime_site_a 四 fixture 全含，2026-09 实证）——该串无区分度；且部分站点会对半信任
客户端回"403 状态 + 完整正文"（软拦截）。只看"状态 + 特征串"必误判。

**现状（后）**：宿主共享判定表已剔除该串（见 runtime `runtime/challenge.ts`），
插件侧**不再写 `hasRealContent` 前置判定**（anime_site_a/video_site_f 已删）——"403 + 真内容照常解析"
由 `assertParsed(url, res, got)` 承载（解析出条目即成功，见 `api-reference.md`
「Cloudflare 挑战」节）。

宿主侧同理：DevConsole 一次性复用的正文嗅探剔除 `challenge-platform`
（见 `devconsole/server/src/browser-channel.ts` 注释）。

**验证**：真页 fixture 配 403 状态跑 `fetchList` 照常出条目、宿主抛统一 `CHALLENGE`、
普通 5xx 照旧抛错（断言见母仓回归锁 `runtime/src/__tests__/anime_site_a-403-content.test.ts`；
共享表强特征断言见母仓回归锁 `runtime/src/__tests__/challenge.test.ts`）。

**真实案例**：`anime_site_a.plugin.js`（2026-09：`BROWSER(headed-ephemeral)` 403
+ 真首页被两边同时误判 → 加否定门后 Node 403 + 真内容直解，常态连浏览器都不用；
 后否定门退役，宿主天然放行）。

### 按窗口计数烧声誉的站（同一窗口第二次请求必 403）：frx-director 一次拿全 + 一页一环境

**症状**：frx-director 里第一次 `page_navigate` 成功，第二次导航即 403；或
`net_get` 状态 403 但 body 是完整真内容（软拦截）。

**原因**：站点按窗口/会话计数烧声誉（anime_site_a 2026-09 实证：同一窗口第二次请求
必 403；计数疑似服务端/TLS 层，清 cookie 不回血）。frx 是单标签模型
（`page_navigate` 即同一上下文内导航，无新窗口概念），天然连踩。注意这是
**分析时**约束——运行时抓取归 runtime/`$lib.http` + DevConsole
`browser-channel`（`ephemeral` 一次一焚），不归 frx 管。

**打法**（按成本从低到高）：

1. **先 Node 看一眼**：curl/Node 直连拿 body，有真内容（本站标题在）就直接当
   fixture，浏览器只做 corroborate——软拦截站常态连浏览器都不用（anime_site_a 即此例，
   分析期 Node 403 + 真内容直解）。
2. **浏览器内一次拿全**：`net_capture start` → 单次 `page_navigate` →
   `net_get` 全量（body + `initiatorStack`），不回来补看第二眼；`page_eval`
   选择器验证在同一页内做完（指南第 0 节本来就要求先 start 再触发）。
3. **跨页先做判定实验**：第二跳换不同 URL 是否也 403——一次实验决定后面花多少钱。
   烧 → 一页一环境（`env_close` + 新环境，贵但真隔离，对应宿主按次 launch 回退预案；
   采 list + detail 两三个 fixture 可接受）。`cookies remove all` 大概率没用
   （服务端计数），只配顺手一试。
4. **签名逆向（委派 worker）必须换打法**：静态优先（`scripts_save` +
   `code_search` + `run_node` 本地复现，零新请求），动态触发压到一次拿全；
   guidance 里写明窗口计数约束，禁止"导航→看→再导航"的交互式磨法
   （每次新导航都烧窗口，token 和窗口双烧）。

**真实案例**：`anime_site_a.plugin.js`（2026-09，无签名需求，HTML 直解；
运行时一次一焚 修订史）。

### 详情页缺尾斜杠回首页的站：`fetchDetail` 入口必须补齐尾斜杠（历史入口形态）

**症状**：列表页进详情内容正常，从 iOS 观看历史页进同一条详情却显示错误内容
（首页标题如"请截图收藏备用地址"、章节列表为空）。

**原因**：两点叠加——①本站详情页 URL 语义依赖尾斜杠（`/novel123/` 有内容，
`/novel123` 服务端不 301、直接回 200 首页）；② iOS 历史库唯一键归一化
（`HistoryStore.normalizedURL`，trim + 去尾斜杠，见 `ios/docs/history.md`）
把落库的 `detailURL` 剥掉斜杠，历史入口 `fetchDetail` 拿到的恒为无斜杠形态。
只测列表入口（自带斜杠）永远复现不了。

**修复**：`fetchDetail` 入口用字符串切分（沙箱无 `URL` 全局）识别详情形态并补 `/`，
用补齐后的地址请求，并以它作为 `sourceUrl` 回传（别把不可抓的形态向下游传播）；
章节页（`*.html` 等）原样透传：

```javascript
function normalizeDetailUrl(url) {
  const raw = String(url || '')
  let end = raw.length
  const queryIdx = raw.indexOf('?')
  if (queryIdx !== -1) end = Math.min(end, queryIdx)
  const hashIdx = raw.indexOf('#')
  if (hashIdx !== -1) end = Math.min(end, hashIdx)
  const head = raw.slice(0, end)
  const tail = raw.slice(end)
  if (/\/novel\d+\/?$/i.test(head) && !head.endsWith('/')) {
    return `${head}/${tail}`
  }
  return raw
}
```

**验证**：同一详情分别用有/无尾斜杠跑 `detail`，两者标题与章节数一致；
再跑一章 `reading` 确认章节形态未被误改。

**真实案例**：`manga_site_e.plugin.js`（2026-09：`fetchDetail("https://manga_site_e.com/novel115552")`
回首页标题 + 0 章节，加归一化后与斜杠形态同为 2 章节；版本 1.1.2）。

**新站自查**：凡详情 URL 以 `/` 结尾的站，首版即加此归一化——不要等历史入口报障。

### 页面通道必须消费 `context.page`，不得只从 URL 反解析页码

**症状**：从详情 `target:{action:'list',url}` 进的列表翻不到第 2 页——iOS
侧初现为总页数=2 时无限复读第一页，宿主终结门收紧后则表现为直接停在第 1 页。

**原因**：宿主把页码单独放 `context.page` 传，通道 URL 本身不带 `?page=`；
`fetchList` 若只从 URL 正则反解析页码（`/[?&]page=(\d+)/`），通道页恒为 1，
第 2 页请求实际拉的还是第 1 页 URL。

**修复**：先取 `pageNumber(context)`，通道 URL 无 page 参数且 `page > 1` 时按
该站形态拼翻页（query 拼 `?page=`/`&page=`，path 按站规则拼段）；URL 自带
page 时以 URL 为准（与 anime_site_a 通道约定一致）。

**真实案例**：`manga_site_c.plugin.js`（2026-09：作者列表 `context.url=/cn/artist/...`
恒取第 1 页；改后实网验证作者页 `--page 2` 回 `page:2`、首页第 1/2 页首条
id 不同；版本 1.0.3）。

**新站自查**：凡 `fetchList` 消费 `context.url` 的站，首版即用 `run <id> list
--url <通道URL> --page 2` 实网验证回包 `page:2` 且首条与第 1 页不同。

**页面通道按 URL 分派时，判定必须只看 path——先剥掉协议+域名**。`context.url` 是**完整绝对地址**
（`https://host/path/`），拿正则判形态时若直接对整串匹配（`/^\/tags\/?$/` 这类），
`https://…` 开头一律不命中，全部落到「未知形态」兜底分支——表现是**入口页悄悄退化**：
索引页被当视频列表解析（0 条）而不报错、该报错指路的页（标签索引/首页）静默走错分支。

**修复**：写成 `pathOf(url)` —— 先 `match(/^https?:\/\/[^/]+(\/.*)?$/i)` 取捕获组（无路径则 `/`），
再切掉 `?query` 与 `#hash`，之后所有形态判定只对返回值做。

**真实案例**：`kvs_site_a.plugin.js`（2026-10）——首版 `pathOf` 只去 query/hash，
`--url https://www.kvs_site_a.com/categories/` 判成未知形态、按视频列表解析返回 0 条，
且 `/tags/` 的「请走 getTags」指路不触发；补剥域名后索引页 12 条、指路报错均恢复。
（沙箱无 `URL` 全局，只能用正则/字符串切分，别想 `new URL()`。）

### 社交帖子卡作者链接取文本最长者（头像 fallback 同 href 干扰）

**症状**：列表/详情作者全变成单字（头像占位 fallback 如 `O`/`色`），信息块 `作者：O`。

**原因**：帖子 header 内头像链接与名字链接同 `href`（同作者页），头像链接文本为单字 fallback；且外层 flex 与内层 div 同带 `min-w-0`，`div.min-w-0 a` 按文档序先命中头像链接。

**修复**：同 href 候选中取 `cleanText` 最长者，不取首个：

```javascript
let bestHref = '', bestName = ''
$root.find('header a[href*="/account/"]').each((i, a) => {
  const t = cleanText($(a).text())
  if (t.length > bestName.length) { bestName = t; bestHref = $(a).attr('href') || '' }
})
```

**真实案例**：`video_site_g.plugin.js`（2026-09：首版详情作者 `O`，改后为 `Onlyfans网黄集中营`；列表 HTML 通道同修）。

**新站自查**：凡帖子卡 header 含头像 + 名字双链接的站，首版即断言作者长度 >1。

### 卡片三件套：根自带底 + 列容器显式左对齐 + 明图混排不断言加密

**症状**：卡片无底透明一片；文字整体居中；宫格里某张视频海报恒加载失败（黑格/乱码）。

**原因**：① 根 stack 没声明 `backgroundColor/padding/borderRadius`——宿主 cell 本身无底，底色只能插件自带；② 列容器缺 `alignItems:'start'`——两端宿主 `alignItems` 缺省都是 center，不写即整卡居中（`textAlign` 两端缺省即左，不用逐节点写）；③ 站内加密图与明图混排（如 video_site_g 视频海报是无 `auth_key` 的明图），插件把整卡标加密后宿主会把明图也解密成乱码——两端宿主解密前已有魔法头直通（镜像站内解密器），插件侧不断言、只如实传原始 URL。

**修复**：根统一 `cardRoot(direction, gap, children)`（`$surface` + padding 12 + radius 12）；所有 direction:column 容器显式 `alignItems:'start'`（居中的小章列除外）；横排左右配比用 `flex:1/flex:2`（两端都 honor，iOS 仅横向）；混排明图不做特殊标记、保持原始 URL。

**真实案例**：`video_site_g.plugin.js`（2026-09：六类卡返工；视频海报 `imgpublic.ycomesc.live` 明图被整卡解密误伤，curl 直取 200 JPEG 实锤）。

**新站自查**：首版即断言根有底三件套 + column 容器全显式对齐；逐图 curl 验明/密再决定整卡加密声明。

### 卡片内子行独立链接：逐行取 href 并给行节点绑 detail target（只取文本则冒泡进父列表）

**症状**：专题卡 Top3 榜单行点哪都进专题列表，到不了对应帖子详情。

**原因**：解析只取 `.topic-item-title` 文本，丢了外层 `li > a[href*="/post/"]`；行 stack 无 `target`，按卡片 DSL 缺省冒泡到整卡（`item.target=list` 专题页）。

**修复**：按 `li` 逐行取标题 + href，行节点有 url 即绑 `{ action: 'detail', url }`，无则留空冒泡；`item.target` 保持 `list`（整卡点进专题）：

```javascript
$el.find('.topic-list li').each((j, li) => {
  const $a = $(li).find('a[href*="/post/"]').first()
  const s = cleanText($(li).find('.topic-item-title').first().text() || $a.text())
  if (s) topItems.push({ title: s, url: $a.attr('href') ? absoluteUrl($a.attr('href')) : '' })
})
// buildTopicCard 行侧：兼容字符串与 {title,url}，有 url 即绑 detail
if (rowUrl) row.target = { action: 'detail', url: rowUrl }
```

**真实案例**：`video_site_g.plugin.js`（2026-09：榜单行只取文本无 target，全冒泡进专题列表；改后行级 detail，整卡仍进专题）。

**新站自查**：凡卡片内含子链接行（榜单/合集选集/相关推荐），首版即断言行级 `target` 存在且 `detail` 可出。

### 榜单序号跨页必须加偏移（页内 `i+1` 会每页从 1 重排）

**症状**：排行榜第 2 页左排序圈仍从 1 开始，与第 1 页重复。

**原因**：解析按页内下标 `i + 1` 生成 `rank`，丢了前面页累计条数。

**修复**：解析函数收 `rankBase = (cur - 1) * perPage`（以服务端回包 `per_page` 为准），序号 `= rankBase + i + 1`；调用方两处（页面通道 `context.url` 与目录 `channel=rank`）均透传。

**真实案例**：`video_site_g.plugin.js`（2026-09：新内容榜/账号榜 `parseRankContentCardsFromHtml`/`parseAccountCardsFromHtml` 首版页内 `i+1`；改后第 1 页 1、2，第 2 页 3、4；版本 1.4.1）。

**新站自查**：凡列表展示序号/名次的站，首版即用不同 `rankBase` 断言第二页首条 `= perPage + 1`。

### 站点原文是相对文案（`2 days ago`）时别换算时间戳：宿主按**绝对**时间渲染 = 凭空的「具体时间」

**症状**：列表发布时间角标/详情头部显示成「2026年10月11日 00:00」这类具体日期时间，而站点自己只写
`2 days ago`；或站点原文被磨掉——`12 months ago` 显示成「1年前」、`1 week ago` 变成「7天前」。
（用户 2026-10 原话：「发布时间大于 1 day ago 显示的是具体的日期」；2026-11 补充：「网站返回时间格式
就是 `xxx hours/day/week/months/years ago`，直接替换成中文即可，不用 dayjs 转时间戳」。）

**原因**：插件把相对文案 `dayjs().subtract(n, unit).valueOf()` 反推成毫秒戳写进 `publishTime`。
宿主读 `publishTime` 的两处（详情头部 `ArticleHeaderView`、兼容保留的旧列表行）走的都是**绝对**
时间格式化 `formatTimestamp`（`date: .abbreviated, time: .shortened`）；而走角标的
`format:'relative'` 是**分档**的（<30 天 / <12 个月 / 年），站点原文的周与 12 个月档都会被改写。

**修复**：站点原文就是相对文案时**只做词表替换**，角标直给中文串，`publishTime` 不写（宁缺不伪造）：

```javascript
// just now / N seconds ago → 刚刚；minute/hour/day/week/month/year → 分钟/小时/天/周/个月/年
const m = cleanText(text).toLowerCase().match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/)
const units = { minute: '分钟', hour: '小时', day: '天', week: '周', month: '个月', year: '年' }
badges.topRight = `${Number(m[1])}${units[m[2]]}前`   // 认不出就不出角标，不抛错、不伪造
```

只有站点给的**绝对**日期（`meta[itemprop=uploadDate]` / JSON-LD `"uploadDate"`）才 `$lib.dayjs` 换算；
`metadata` 里留站点**原文**（与 `viewsText` 同规矩），中文串只上展示位。

**真实案例**：`kvs_site_a.plugin.js` v1.2.1（2026-11）。KVS 的 `.added em` 与详情信息区 `Submitted:` 都是相对
文案；改前列表角标靠宿主 `relative` 二次分档、详情头部的 `publishTime` 是相对文案反推的假戳。改后在线
6 个页面 121 条实测：`4 hours ago`→「4小时前」、`1 week ago`→「1周前」、`12 months ago`→「12个月前」，
零漏译（`metadata.addedText` 仍留英文原文）。

**顺带一提（同一条红线）**：详情信息区那行也是展示位——`发布：${submittedText}` 直出会把英文原文拼进
中文界面（改前实测「发布：2 days ago」），必须同样过词表；认不出的形态原样透出（不吞信息）。

**新站自查**：把列表时间的**站点原文**打出来看一眼——只要形如 `N unit(s) ago` / `just now`，
就别换算成时间戳；`publishTime` 非空与否由「站点有没有给绝对日期」决定，不是由「能不能凑出来」决定。

### 详情发布时间：`meta[itemprop=uploadDate]` 缺失时回退 JSON-LD `"uploadDate"`

**症状**：改版后详情 `publishTime` 变空（旧 `meta[itemprop="uploadDate"]` 被移除），即使页面仍展示日期。

**原因**：只认单一 meta 锚点；新版主题把时间搬进 JSON-LD（`<script type="application/ld+json">` 内 `"uploadDate": "…"`）。

**修复**：meta 与 JSON-LD 双写兼容，meta 优先、JSON-LD 回退（`body.match(/"uploadDate"\s*:\s*"([^"]+)"/)` 后 `Date.parse`）：

```javascript
const publishMeta = $('meta[itemprop="uploadDate"]').attr('content')
  || (body.match(/"uploadDate"\s*:\s*"([^"]+)"/) || [])[1]
```

**真实案例**：`kvs_site_b.plugin.js` v1.2.0（2026-09-23 改版：meta 移除，JSON-LD 回退后 `publishTime` 恢复）。

**新站自查**：详情时间首版即断言非空；改版时间为空时先查 JSON-LD 是否有 `uploadDate`/`datePublished`。

### 图片 URL 禁止硬编码 host：图床迁独立 CDN 即 404，封面从页面解析

**症状**：详情页封面突然加载不出来（404），列表/缩略图正常。

**原因**：图片 CDN 由本站本域迁至独立 host（如 `manga_site_c.cc/galleries/…` → `i.manga_site_c.cc/galleries/…`，本域原路径直接 404）；插件详情封面是 `BASE_URL + '/galleries/<id>/c.webp'` 硬拼，而列表/缩略图走页内绝对地址透传故不受影响。

**修复**：图片 host 抽常量（如 `IMG_CDN`）；封面按优先级从页面解析——ld+json `"image"` → 封面 `x-data` 的 `realSrc` → 常量拼装 → 首张缩略图兜底；相对 `/galleries/…` 经 `imageUrl()` 归一化到图床（勿拼本域）；缩略图先归一化 host 再做 `/t/`→`/i/` 等路径变换。

**真实案例**：`manga_site_c.plugin.js` v1.0.4（2026-09-23：`curl -I` 定案本域 `c.webp`/`t.webp` 均 404、`i.manga_site_c.cc` 200；fixture 同步刷新为新标记）。

**新站自查**：凡图片 URL 首版即断言 `curl -I` 在线 200；封面字段必须来自页内解析而非字符串拼接；fixture 超过一周即视为可能过期，修前先 `curl` 复核。

### 站点迁移 canonical 域名 → 全站列表 0 条（分页却正常解析）

**症状**：插件突然**所有列表都取不到内容**（`items: []`），日志打「未解析到内容列表，页面结构可能已变化」，
但 `pagination.totalPages` 仍能正常解析出数字；详情/阅读页若走 URL 入参，则一律抛「不支持的 URL」。
**离线 fixture 跑仍是好的**（旧域名快照），只有在线跑空——「离线好、在线空」是域名迁移的典型指纹。

**原因**：站点换了 canonical 域名（manga_site_d 2026-10 由 `manga_site_d.top` 迁至 `manga_site_d.cc`），
页内所有内容链变成**新域绝对地址**，而插件把旧域字面量硬编码在**两处**：
① `BASE_URL`（拼列表/标签/搜索 URL）；② 卡片 `href` 白名单与 `fetchDetail`/`fetchReadingPage`
入参校验里的 `manga_site_d\.top\/\d+\/` 正则。旧域当时**仍可访问**（镜像），所以请求全 200、
分页器照常解析，**只有匹配这一关静默滤掉了全部卡片**——症状像「改版」，实为域名。

**判定（关键，先记住这条）**：`items` 空**但**分页/结构类字段仍解析成功 = **拉取成功、匹配失败**，
先怀疑域名/URL 形态，**不要**当成反爬或 DOM 改版去重写选择器。
一行取证：`curl -s <列表URL> | grep -o 'href="https\?://[^/"]*' | sort | uniq -c | sort -rn | head`
——看页内绝对链的主机是否已不是 `BASE_URL` 那个域。

**修复**：
1. `BASE_URL` 取站点**当前 canonical**（页面 `<link rel="canonical">` / 页内绝对链的主机）。
   若官方另有「永久網址」但 301 到 canonical（manga_site_d 的 `manga_site_d.com` → `manga_site_d.cc`），
   直接用 canonical 省一跳。
2. 主机判定抽**站点家族正则**（`/^(?:www\.)?manga_site_d\.(?:cc|top|com)$/i`）而非单一 TLD 字面量，
   让**历史库已存的旧域 URL 仍能解析**（iOS 历史/收藏里存的是旧域条目）。
3. 把「内容 URL」判定收敛成**一个** `contentIdOf(href)` 助手，删掉散落在
   `parseCard` / `fetchDetail` / `fetchReadingPage` 三处的重复正则——否则下次迁域必漏改一处，
   而漏改的那处就是新的「静默 0 条」。顺带 `parseCard` 只解析一次，`id` 直接复用结果。
4. 插件元数据头 `sourceUrl` 与 `manifest.json` 的 `sourceUrl` 同步更新。
5. **别指望 301 兜底**：迁域期间旧域常仍 200（镜像），插件必须自己产出新域 URL。

**找最新域名**：此类站常自营「發布頁/公告页」（manga_site_d 为 `https://manga_site_d.pages.dev`，
另配 netlify 镜像）公布「最新網址 / 永久網址」。域挂了先开它，别猜 TLD。
注意發布頁链接多为 `nofollow` 外链，**不要**当内容卡收进列表。

**真实案例**：`manga_site_d.plugin.js` v1.1.1（2026-10-04：`.top` → `.cc` 致全站列表 0 条；
实测 `.cc` 现行、`.top` 历史镜像、`.com` 官方永久址 301→`.cc`；修后列表 17 条、
4 个目录页（漫畫/動畫/新聞/標籤）全绿，默认域与旧域 URL 均可用）。

**新站自查**：`BASE_URL` 与各类 URL 形态度量首版即抽常量/助手，勿把域名写字面量撒在多处；
回归必须**离线 fixture + 在线各跑一遍**——只跑 fixture 会漏掉域名迁移这类「在线才现形」的故障。

### 图片套了第三方代理层：代理回源不带 Referer，防盗链源站必 403（封面全裂）

**症状**：某一类列表（如 manga_site_d 動畫）的封面**全部**加载不出来，同站其它列表封面却正常；
URL 看着毫无问题（HTTPS、后缀对、浏览器里手贴甚至能开）。

**原因**：站点把图套了一层第三方图片代理/CDN——WordPress 站常见 Jetpack Photon
（`https://i0.wp.com/<源站host>/<path>`，亦有 `i1/i2`；同类还有 images.weserv.nl 等）。
代理是**从它自己的服务端回源**、带的是它自己的 Referer（或无 Referer），
所以对**校验 Referer 的源站**（防盗链 CDN）永远拿不到图，直接把 403 透传给客户端。
manga_site_d 動畫封面挂在视频 CDN `v.manga_site_d.cc`（缺 Referer 即 403）→ 经 Photon 必裂；
而漫画封面挂 `supercdn.site`（不校验）→ 经同一层 Photon 就没事。
**「同一站的同类资源里只裂一部分」是代理回源失败的最佳指纹**（全站都裂更像域名/改版）。

**判定（两步 curl 定案，勿猜）**：
1. 代理形态：`curl -sI 'https://i0.wp.com/<host>/<path>'` → 403 且 `content-type: text/html`（错误页，非图）。
2. 直链 + 宿主默认 Referer：`curl -sI -H "Referer: https://<host>/" 'https://<host>/<path>'` → 200 `image/*`。

**修复**：`imageUrl()` 一处归一，剥掉代理前缀直取源站
（`raw.replace(/^https?:\/\/i\d\.wp\.com\//i, 'https://')`），
**列表封面 / 详情封面 / poster / 正文图 / 阅读页图全走它**——漏一处就那一处继续裂。
剥完还有红利：原先为对齐代理而写的 `stripImgProxy` 之类「比较前先归一」的逻辑
可直接退化成两个归一后 URL 的正串比较。

**关键前提（插件侧可依赖的宿主契约）**：宿主管线（iOS `ImageLoader`、DevConsole 代理）
在**未显式指定 Referer 时以「图片自身 origin + /」兜底**（`referer ?? (origin + "/")`），
而防盗链 CDN 普遍接受「自己域名」作 Referer——实测 `v.manga_site_d.cc` 接受
`v.manga_site_d.cc/`、`manga_site_d.cc/`、`manga_site_d.top/`，拒绝 `example.com/` 与无 Referer。
**所以图片防盗链通常不需要新契约字段**：只要图在源站自己域名下、给出**直链**即可。
例外是「必须带站点页 Referer」的资源（详情 `video` 块），那才要显式 `referer`（见 video-playback.md）。

**真实案例**：`manga_site_d.plugin.js` v1.1.2（2026-10-04：動畫列表 17 张封面经 `i0.wp.com`
全 403；剥代理后 6 个列表源共 102 张封面实测 0 失败）。该站图片源站共 5 个
（`supercdn.site` / `v.manga_site_d.cc` / `i.postimg.cc` / `image1|images2.gamme.com.tw`），
直链带自身 origin Referer 均 200。

**新站自查**：封面首版即断言「用宿主默认 Referer（图片自身 origin）能 200」，
且**按渠道抽查**（不同栏目可能挂不同图床，只测一个栏目会漏）；
页内图片域名形如 `i\d\.wp\.com/...` 等**第三方代理**时，先剥代理再入库，
勿把代理 URL 当最终地址写进 fixture 与代码。

### 二进制接口勿走文本通道 + 沙箱无 randomBytes（Flutter video_site_h 类站）

**症状**：请求体为 `IV + AES 密文` 的二进制 POST，`$lib.http.post(url, strBody)`
发出去服务端解密失败；或 `$lib.crypto.randomBytes()` 直接抛
`Secure random number generation is not supported`。

**原因**：string 透传按 UTF-8 编码，非 UTF-8 字节必坏；响应 `res.text()` 同理。
browserify 的 `randomBytes` 依赖浏览器安全 RNG，node:vm 沙箱没有。

**修复**：发字节传 `$lib.Buffer`/`Uint8Array`（宿主 `ArrayBuffer.isView` 跨 realm
识别后按字节发出），收二进制加 `responseType: 'base64'` 再
`$lib.Buffer.from(body, 'base64')`；gzip 走 `$lib.zlib` 字符串通道；
随机 IV 用 `$lib.util.randomInt(0, 255)` 拼。样例 `video_site_h-vlog.plugin.js`，
宿主实现见 `runtime/docs/binary-http.md`。

### 列表 summary 长文本致 iOS 瀑布流滚动掉帧：视频站简介默认不发（movie_site_a 动漫）

**症状**：iOS 端某板块列表滚动持续掉帧，宿主侧文本测高缓存已优化（主线程 −11.7%
实测）仍偶发卡顿；注释掉 `toVideoItem` 里 `item.summary = videoDes` 一行即顺滑。

**原因**：`videoDes` 动辄数百字多换行，宿主每卡多渲染两行摘要文本——测高只是零头，
大头是逐 cell 的文本布局与光栅化 + 更高 cell 带来的布局/动画成本，且只在有简介的
板块发作（无简介板块天然免疫，极易误判成宿主 bug）。

**修复**：视频列表项默认不发 `summary`（简介留详情页正文展示）；确需列表摘要时截到
首行约 60 字以内。样例 `movie_site_a.plugin.js`（`toVideoItem` 注释）。

### 详情库旧 CDN 下线：列表新域活、详情旧域 530，同路径换 host 即活（movie_site_a AV/动漫）

**症状**：某几个板块（如 AV/动漫）详情页顶层封面 + video 块 poster 双黑（显示重试），
点播报「无可用资源」；同站其它板块正常；列表页封面正常。

**原因**：站点 CDN 迁移后列表库与详情库分叉——列表接口已回新域（如 `v.hersav.me`，
`curl -I` 200），详情接口仍回旧域（封面 `st2dc.ybxzk33o1.top` 与 AV 视频 `s3.jehih2z.xyz`
同报 530 Origin DNS error；列表 AV 视频 `v.imgcaches.cc` 则 TLS 握手失败）。
同路径换到新域即活（AV m3u8 24KB 有效 media playlist、分片 200，动漫 MP4 206）。

**判定（两步 curl 定案，勿猜）**：
1. 对比列表项与详情项同名字段的 host 是否分叉（`videoCover` / `videoUrlOne`）。
2. 旧域 `curl -I`（530/TLS 失败）vs 同路径新域（200/206）。
「列表活、详情死」是详情库 stale 的指纹，与硬编码 host（同资源全裂）不同。

**修复**：一处 `migrateMediaUrl()` 做字符串前缀替换（沙箱无 URL 全局，不用 `new URL`），
旧域名单 → 新域，同路径 + 查询原样保留（旧 S3 签名串与动漫 secure 串在新域可透传，
实测带旧串仍 200）；列表封面 / 详情封面 / poster / 三源择优全走它。
`video-playback.md`「保持原始 CDN URL」红线指的是勿改写成代理 URL，
first-party CDN 之间的旧→新迁移不在此限。

**真实案例**：`movie_site_a.plugin.js` v1.0.2（2026-10-08：AV/动漫详情旧三域
`st2dc.ybxzk33o1.top` / `s3.jehih2z.xyz` / `v.imgcaches.cc` → `v.hersav.me`；
AV×2 + 动漫×2 + 短视频的详情与播放全 200/206，长视频/短剧/漫画/搜索/探索回归全绿）。

**新站自查**：视频站首版即断言「列表与详情同名字段 host 一致」；
fixture 超过一周视为可能过期，修前先活接口复核；多板块站点按板块抽查
（迁移常只影响部分板块，只测一个板块会漏）。

### 文本截断砍断 emoji 代理对：iOS 整页 3840「格式不正确」（video_site_d热门推荐）

**症状**：某一个列表页（分类/推荐位）在 iOS 报「加载失败：未能读取数据，因为它的格式不正确」，
同插件其它页正常；runtime 跑同一接口全绿（Node 容忍孤立代理）。

**原因**：JS `str.slice(0, N)` 按 UTF-16 码元截断，正好砍在 emoji 代理对中间（如 🥹=`\uD83E\uDD79`
只留下 `\uD83E`），`JSON.stringify` 将其转义为单个 `\ud83e`。iOS `JSONSerialization` /
`JSONDecoder` 严格拒收孤立代理（`NSCocoaErrorDomain 3840`），**整单解码失败**——一条标题
带毒即整页全挂，且只在含该条数据的页复现（随数据走，换页/换类目即消失）。

**判定**：原始 JSON 文本里搜 `\\ud83e` 这类高代理转义、其后未跟 `\\udc..` 低代理即定案；
注意要在**原始文本**上扫（`JSON.parse` 后的内存串里它是真孤立码元，`charCodeAt` 扫亦可）。

**修复**：截断一律按码点（`Array.from(s).slice(0, N).join('')`，不断代理对），
所有进 JSON 的服务端文本先过 `stripLoneSurrogates()`（逐码元配对、丢弃孤立高/低代理）。
样例 `video_site_d.plugin.js`（`stripLoneSurrogates` + `safeSlice`，列表标题/简介/作者名、
用户简介、详情正文/作者块全覆盖）。

**新站自查**：凡有 `slice/substr/substring` 截中文案（标题/简介/描述）即用 `safeSlice` 同构；
`encodeURIComponent` 遇孤立代理直接抛 `URIError`，拼 URL 前同样先清理。

### 私有（需登录）内容的空结果被误报成「站点改版」（KVS 站 kvs_site_a）

**症状**：列表能列出、点开详情标题/信息区/上传者全在，但播放器位空白；图集详情给出
「查看全部 37 张图片」入口，点进去却报「图集页未解析到原图…**页面结构可能已变化**」；
视频详情 console 落「未解析到播放地址（**flashvars 缺失或改版**）」。两条告警都指向改版，
而站点其实**一行没改**。

**原因**：站点对私有内容**故意不下发**数据，插件侧一切「有则取、无则省略」的逻辑都静默产出空结果，
下游断言再把「空」一律解释成「改版」：
- 列表卡：`<div class="item private">` 内含 `<span class="line-private"><span class="ico-private">Private</span></span>`；
- 详情页：播放器（视频 `.no-player`）/ 图集图片区换成
  `<span class="message">This video is a private video uploaded by … Only active members can …</span>`；
- 私有视频**整页无 flashvars**（`grep -c video_url` = 0）；私有图集图片区只有
  `span.item.private` 缩略图，**没有** `a.item` 原图链 → `pages` 恒空。

**判定**：详情页 `span.message` 文案含 `/private/i` 即定案（列表侧 `span.ico-private`）。
curl 直取对照：HTTP **200**、标题与信息区齐全、`video_url` 出现 0 次——「200 但关键数据位空」，
不是 4xx，所以断言与日志都拦不住。

**修复**（三条都不许省）：
1. **列表**：私有项**照常列出**（站点自己也列，只是点开要登录），但打宿主可见的标记——
   `tags: [{ name: '需登录' }]` + `metadata.private = true`。宿主瀑布卡只渲染标题/摘要/标签/封面角标，
   站点那个 `Private` 图标只存在于**网页**上，不落 `tags` 行 = 用户白点一次（与「时间要看见就得进角标」同一条红线）。
   标签**别带图标**：卡片图标表没有锁形图标，未知图标 iOS 会渲染成占位圆点，反而更糟。
2. **详情**：以 `span.message` 为准**提前分派**——私有分支出置顶 `text` 提示块（中文直译、上传者名如实保留），
   且**不产点进去必报错的入口**（私有图集的 `chapter` 入口就是空跳转）；同时把「flashvars 缺失」那条
   告警限定在 `!privateNotice` 时才落，别再用改版文案描述需登录。
3. **阅读页**：私有判定必须**先于**通用的「未解析到原图」分支抛「需登录」，否则用户看到的仍是
   「页面结构可能已变化」。并收紧断言：`assertParsed(..., Boolean(title || pages.length))` 因 `title`
   恒有而**恒真**，白放行私有页——改成「非私有却拿不到原图才是失败」。

**新站自查**：详情页「该给的数据没有」时先分清三种可能——① 真改版 ② 需登录/付费/年龄门 ③ 接口抖动。
站点一定留了标记位（图标、提示文案、`message` span），把它找出来单独进分支；
**别让空结果落进「改版」告警**——那会让用户和后来者都去查一个不存在的问题。
列表侧同理：站点标了「不可用」而插件不落宿主可见槽位，就是静默失败。

**真实案例**：`kvs_site_a.plugin.js` v1.4.0（`/albums/` 列表 1/12 条私有、`/tags/japanese/` 1/25 条私有；
`/albums/38062/hot-red-lingerie-for-eunji/` 详情与 `/videos/127967/…` 详情各一条 message；
在线复核 + fixture 离线回归双跑，正常内容零误标）。

### 登录强制人机验证（reCAPTCHA）的站：账密路线不通，改走 Cookie 登录（KVS 站 kvs_site_a）

**症状**：插件 `login(inputs)` 提交账号密码，服务端**只**回验证码错误
（`{"code":"required","field":"code"}` / `{"code":"invalid","field":"code"}`），
永远看不到「账号或密码错误」——用户以为自己密码填错，反复重试。

**原因**：站点登录表单里放 **reCAPTCHA v2**（`div[data-recaptcha-key]` 渲染在 `<form>` 内），
reCAPTCHA 自注入 `g-recaptcha-response` textarea 随表单提交，且服务端**先校验证码、再校验账密**。
纯 HTTP 拿不到有效 token（要浏览器执行 JS + 人工点勾选框）；KVS 的
`?mode=async&function=login` 旁路实测回 `invalid_params`，不是可用通道。

**判定（三步 curl 定案）**：① 不带 token → `required`；② 带假 token → `invalid`
（**字段名是 `g-recaptcha-response`**，站点内部字段名叫 `code`——用 `code=…` 提交仍是 `required`，
别被错误信封的 `field:code` 带偏）；③ 先 GET 建 session 再带全套浏览器头 POST 仍 `required`
→ 与 session 无关，无条件要求。

**修复**（主路径改 cookie 登录，账密留着但如实报错）：
1. `getAccountSchema()` 同时声明 `loginFields`（账密）与 `cookieFields`（`type:'cookie'`）；
   宿主「登录」按钮**不校验 required**，用户只填 Cookie 也能提交。
2. `login()` 分支：填了 cookie → 解析（`a=1; b=2`，容忍换行、值里含 `=` 只按首个切分）→
   校验**登录态 cookie 名**在不在（kvs_site_a 是 `kt_member`）→ `setCookies` 预置 jar →
   **请求一次首页验登录态** → 通过才落 `$lib.storage`；失败把 jar 恢复成原登录态
   （填错一次不该顶掉已有登录）。
3. 账密分支**照常真发一次请求**，按站点真实错误码翻译成「本站强制人机验证，请改用 Cookie」——
   **不预先假定失败**，站点将来放开验证码即零改动可用。
4. `ensureSession()` 挂在统一 `request()` 入口：把 storage 里的会话补进 jar，**只补 jar 里缺的
   名字**（宿主持有的值可能已被站点轮换，旧值不许覆盖）。iOS 宿主 `CookieJar` 本就持久到
   UserDefaults，这层是为 **runtime CLI**（每次 run 新进程、jar 不共享）与换设备兜底。
5. `getMe()` 无登录态 cookie 时**不发请求**、直接回空 user（宿主判空即未登录、静默落表单）；
   `logout()` **只清本机**（storage + jar）——调站点 `/logout/` 会把用户自己浏览器的登录一起踢下线。

**新站自查**：动手写账密登录前先 curl 一次**假账密**——若回的是验证码/参数类错误而非
「账号或密码错误」，就是人机验证门，直接上 cookie 登录；登录态 cookie 名要**实测**
（拿浏览器 cookie 逐个最小化试），别把 `kt_acctoken` 这类 IP token 当登录态。

**真实案例**：`kvs_site_a.plugin.js` v1.5.0（端到端：登录后私有图集 37 张原图、私有视频
`Best Quality`/`SD` 双档播放；退出后回到「需登录」提示块；普通内容零回归）。

### Cloudflare 邮箱混淆：用户名 `​.text()` 取到 `[email protected]` 占位符（静默假名）

**症状**：列表/索引页的用户名（会员名、评论作者、上传者）显示成字面量 `[email protected]`
（带 `&#160;` 时是 NBSP 变体）。**不报错、不空、不像是坏数据**——看着像站点里真有个叫
「[email protected]」的用户；换成邮箱型用户名的条目越多，界面越荒诞。

**原因**：Cloudflare 的邮箱混淆把页面里任何邮箱样式的文本换成
`<span class="__cf_email__" data-cfemail="c6bcffb6…">[email protected]</span>`，
浏览器里由 CF 脚本**就地**还原成明文；SSR HTML 的 `.text()` 只能拿到占位符。
明文的两条出路：同元素的 `title`/`alt`/`data-*` 属性（站点常把真名留在 `<a title="{真名}">`），
或 `data-cfemail` **自解**——首字节是密钥，其余字节每两字节十六进制与密钥**异或**即明文。
注意 `title` 属性**不保证有**（有的站只留 `data-cfemail`），只认它不够稳。

**修复**：解 `data-cfemail`，解不出才回落 `.text()`（宁可显示站点原文，不伪造）：

```js
/** `data-cfemail` = 首字节密钥 + 其余字节逐字节异或（浏览器里由 CF 脚本还原） */
function decodeCfEmail(hex) {
  const s = String(hex || '').trim()
  if (!/^[0-9a-f]+$/i.test(s) || s.length < 4 || s.length % 2 !== 0) return ''
  const key = parseInt(s.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < s.length; i += 2) {
    out += String.fromCharCode(parseInt(s.slice(i, i + 2), 16) ^ key)
  }
  return out
}
```

**自查**：拉一份 fixture 后 `grep -c '__cf_email__'` ——非 0 就说明**有字段会静默变假名**，
逐个定位是哪个选择器命中的（本站是成员榜的 `strong.title`）。

**别做的事**：① 别把 `[email protected]` 当站点真实数据透出（等于把 CF 的占位符当用户名）；
② 别为此整段正则替换 HTML——只解用到的那一两个字段；
③ 无 CF 命中的站别预先套这层（多一步无谓解析，还会掩盖真名的来源）。

**真实案例**：`kvs_site_a.plugin.js` v1.7.0 社区成员榜（`/members/`）：第 1 页 18 条里 1 条命中，
`[email protected]` → 解码得 `z9p5nlaul@mozmail.com`（`?sort_by=added_date` 档 18 条里 1 条）。

### 封面缺失别留空：用**站点自带的**占位图（SVG 可用，位图优先）

**症状**：站点有一批卡片本来就没图（会员头像、没上传封面的分类/合集），插件只取 `img`
→ 取不到就 `coverUrl` 缺省。各端表现还不一致：iOS 走 `RemoteImageView` 的**空 URL 分支**
（灰底 + **常驻 spinner**，看着像一直在加载），DevConsole 是空框；用户观感就是「图裂了」，
条目多的时候整屏花。

**原因**：站点对「没图」的卡**自己渲染一个占位**，而占位常常**不是 `<img>`**——
KVS 站是 `<span class="no-thumb">no photo</span>` + CSS
`.no-thumb { background: url("../images/kvs_black.svg") no-repeat center; }`
（kvs_site_a 实测）。插件只按 `img[data-original]` 取图，自然什么都拿不到。

**修复**：去**站点自己的 CSS** 里找它的占位资源（`.no-thumb` / `.no-image` / `[class*=placeholder]`
的 `background` url），插件统一兜底：

```js
const PLACEHOLDER_COVER_URL = 'https://static.<cdn>/static/images/kvs_black.svg' // 站点 .no-thumb 用的那张
function coverOrPlaceholder(url) {
  return String(url || '').trim() || PLACEHOLDER_COVER_URL
}
```

用**站点自己的**图 = 与站点呈现一致；**别留空**（各端兜底形态不一，且 iOS 是常驻 spinner），
**也别自造**（自己拼图床路径或塞 base64，换站即废）。

**⚠ SVG 占位图：站点只给 SVG 时照用（iOS 侧已支持自绘光栅化，2026-10 起）**（跨侧）：iOS 图片管线
`ImageLoader.decode` 走 `CGImageSource`，而 **ImageIO 在 iOS 上没有任何 SVG 通路**——
`CGImageSourceCreateWithData` 对 SVG 返回非 NULL 但 **type 空 / count = 0**，全分辨率与缩略图
两条解码路径**双双 NULL**（同目录 PNG 对照两条都 OK）。**别被 macOS 误导**：同一份 SVG 在 macOS 上
`sips -g pixelWidth` 能读出尺寸（macOS ImageIO 走 CoreSVG），判据只能拿模拟器实跑。
**iOS 侧现在的做法是自绘**：`ImageLoader.decodeAny` 按头部 `<svg` 分流给 `SVGRasterizer`
（静态子集：图元/路径/渐变/`<use>`/内嵌 `data:` 位图/单行文字，**只缩不放**；一个图元都画不出
即抛 `svgFailed` 落失败态）。于是：
- 站点**同时**有位图版本时**优先位图**（省一次光栅化，且位图一定在覆盖内）；
- 站点只有 SVG（kvs_site_a 的 `kvs_black.svg` 就是，CDN 上 `kvs_black.png/.jpg/.webp` 全 404）→ **照用**，
  别留空、别自造；
- 用到子集外的特性（CSS `<style>` 选择器、`clipPath`/`filter`、外部 `href` 的 `<image>`、动画…）
  仍会落失败态——**别拿复杂插画 SVG 当占位图**，占位图/logo 这类静态图形才在覆盖内。
宿主侧全文见 `ios/docs/image-pipeline.md`「支持的图片格式」条（iOS 0.1.29 起支持）。

**自查**：拉一份 fixture 后 `grep -c 'no-thumb\|no-image'` ——非 0 就说明有卡片会走到「没图」分支，
再回 CSS 找站点用哪张图，别猜路径。

**真实案例**：`kvs_site_a.plugin.js` v1.8.0 —— 社区成员榜 18 条里 **10 条**没头像、
`/categories/` 12 条里 1 条没封面；统一填 `.no-thumb` 的 `kvs_black.svg`（200 `image/svg+xml` 386×438）。

### 块的翻页锚 `href="#videos"` 不是地址 ≠ 没有列表页（漏判 = 把站点能力丢掉）

**症状**：详情/聚合页上的某个区块（如「新私密视频」「相关推荐」「每日更新」）看着只有一屏，
插件于是**不给 `viewMore`**——用户点不到更多，而站点其实完全支持翻页。
反向症状同样存在：块**确实**只有一屏，插件硬写 `viewMore`，点进去还是那几条（造死按钮）。

**原因**：KVS（及同类）块的翻页锚是 `data-action="ajax"` 的**伪链接**：
`<li class="next"><a href="#videos" data-container-id="list_videos_private_videos_pagination"
data-block-id="list_videos_private_videos" data-parameters="sort_by:post_date;from_videos:2">Next</a></li>`
——`href` 是页内锚点、**不是地址**，容易被读成「没有独立列表页」。但**块片段接口就是它的列表页**：
`GET <承载页>?mode=async&function=get_block&block_id=<块id>&<分页参数>=N`（返回 HTML 片段、HTTP 200）。
这正是本仓「相关推荐」通道（`related=1`）已经在走的路——同一套机制，别只在相关推荐上用。

**判据（一条选择器定案）**：`li.next > a[data-container-id="<blockId>_pagination"]` **在不在**——
站点在**末页把它退化成 `<span>Next</span>`**（kvs_site_a 私密图集块第 2 页实测）。
在 → 有列表页，该给 `viewMore`；不在 → 就一屏，别写。

**落法**（照抄 kvs_site_a 的 `private` 通道）：
1. `viewMore: { action:'list', url: <承载页>, category: '<标记>=<值>', filters:[<该块排序组>] }`
   ——`url` 是**块所在的那一页**（落地列表页的「网站原页」就是它），标记进 `category`（同 `related=1`）。
2. `fetchList` 在该标记下走块片段：**块 id 与分页参数名照锚上的 `data-parameters` 抄**
   （视频块 `from_videos`、图集块 `from_albums`、相关块 `from`——互套会**静默取不到条目**）。
3. `hasMore` 用上面那条选择器判（**别用 `#<blockId>_pagination a` 计数**：末页仍有 First/Back 等其它锚；
   也别用 `.pagination`/`li.next` 的通用口径，那条只对整页列表成立）。
4. **别漏该块的排序档**：同一页不同块**各有一套**（私密视频 5 档含 `duration`、私密图集 4 档含
   `album_viewed`），站点把档位也渲染在块头 `<ul id="<blockId>_sort_list">` 里——逐档抄进
   `viewMore.filters`，`fetchList` 再把 `sort_by` 直传片段接口（实测生效）。
5. 超界页（`from_videos=9999`）站方回 **404 空体** → `page > 1` 且无条目时收敛为空列表、不当失败。

**真实案例**：`kvs_site_a.plugin.js` v1.9.0——社区页两个私密分区（12 条/页、图集末页 6 条）
此前被判「没有独立列表页」而不给 `viewMore`（**能力判丢**，v1.8.0 的注释里还写着「AJAX-only」）；
补上 `private=videos|albums` 两个块通道后，页 1 与页面首屏同源（首条 127967）、
页 2 首条 125278、图集末页 `hasMore:false`。

### 索引页的「类型开关」是**换页**不是查询参数：内部键漏拦会静默返回未筛选结果

**症状**：给分类/模特/标签索引页声明了「类型」筛选（站点右上角 `Videos | Albums`），
用户切到「图集」后列表**看着正常**——条数对、标题对、也不报错，但内容还是视频侧的。

**原因**：站点那个开关在 HTML 里是**两条链接**（`/categories/` ↔ `/albums/categories/`、
`/models/` ↔ `/albums/models/`、`/tags/` ↔ `/albums/tags/`），**不是查询参数**。
插件把 `type=album` 当普通筛选参数交给 `buildListUrl` 转发，站点不认 `type`、
原样返回未筛选页——**静默错**（既不 404 也不空，最坏的一种）。

**落法**：
1. `type` 是**插件内部键**：URL 构造处（`buildListUrl` 的转发白名单）显式拦下，只用于
   `fetchList`/`getTags` 内部换抓目标页；顺手把「空值/未知值一律按视频侧」写死，
   **不静默换成图集**。
2. 目标页与 listing 自己的 `url` **无关**：宿主恒传 listing 那页，切换在插件内完成
   （`fetchList` 里按 kind + type 选 base，`getTags` 里按 type 选索引页）。
3. 图集侧索引页**与图集列表页同前缀不同形**（`/albums/models/` 索引 vs
   `/albums/models/<slug>/` 列表，还有 `/albums/<id>/<slug>/` 详情）——路径判定必须
   「锚在 `/?$` 的索引」优先于「`/albums` 通配」，判错会被 `.list-albums` 解析成 **0 条**。
4. 两侧索引页 DOM 同形、只有计数类名不同（视频侧 `.videos` / 图集侧 `.albums`）→
   共用一套卡片解析，别抄两份（抄了迟早只改一侧）。

**真实案例**：`kvs_site_a.plugin.js` v1.10.0——分类/模特/标签三页各补「类型」筛选、
模特另补 A-Z（`?section=A`，两侧同效）；回归锁直接断言**实际请求的 URL**（
`/albums/models/?section=A`）而不是只看条数，就是为了防这一类静默错。

### 标签索引页的「服务端排序」别做成宿主硬编码（`TagContext.sort` 已退役）

**症状**：所有 `kind:'tags'` 页签都显示一枚「默认/HOT/视频数」排序行——点它对
kvs_site_b/manga_site_d/kvs_site_a **毫无反应**（那些站的 `getTags` 根本不读 `sort`），只有 video_site_b 有效。

**原因**：那是宿主为单个插件写死的档位（iOS `TagServerSort` 枚举 + `TagContext.sort`
字段），违反「不冒充能力」：插件没声明能力，宿主却渲染了控件。

**落法**：标签索引页的页级筛选（含服务端排序）与其它目录页**同一条通道**——
插件在 `Listing.filters` 里声明（排序就是一个 `key:'sort'` 的普通 `select` 组），宿主渲染、
选中项与 `Listing.category` 合并成组合串，经 **`TagContext.category`** 回 `getTags`
（与 `fetchList` 的 `context.category` 同口径）；`TagContext.sort` 与宿主硬编码排序行**已删除**，
勿回退。无 `filters` 的 tags listing = 纯标签云、零控件。

**真实案例**：`video_site_b.plugin.js` 1.0.3（`views|videos` 改声明为 tags listing 的 `filters`）、
`kvs_site_a.plugin.js` 1.10.0（`type=album` → 换抓 `/albums/tags/`，与视频侧同结构复用同一解析）。

### 首屏 HTML 页与翻页 AJAX 接口分离的站：cursor 必须拼到翻页锚的接口上

**症状**：列表首屏正常，翻页（第 2 页起）永远返回与首屏相同的条目、相同的 `nextCursor`，
宿主无限打转；只有走默认路由的「全部」页能翻页。

**原因**：这类站（Vue `axios.get(url)` 加载更多）首屏是 SSR 整页（如
`/short/label_related_list/<id>`），对 `?cursor=` 无感；iOS/插件真正要请求的翻页接口
写在页内 `let url="..."` / `<script name="cc">` 翻页锚里（如
`/m_sns/short_video/label_related_list?label_id=<id>&cursor=<ts>`），与首屏 URL 不同。
把 cursor 拼到首屏 URL 上等于每次都请求首屏。

**落法**：实测页内翻页锚（`let url=` 首屏形态、`name="cc"` 片段形态），`fetchList`
首屏即走翻页接口（无 cursor 版与首屏同源）；到底页认双标记——`<script>fail</script>`
出现或 `cursor=0` 即 `hasMore:false`（通用 `cursor=(\d+)` 正则会误取 `cursor=0`
造成无限空页；空页不再告警「结构变化」，只在非到底空页告警）。

**真实案例**：`short_site_b.plugin.js` 1.1.4（标签 6 页全中，`category=new/hd` 碰巧走对接口而幸免）。

### 动图封面伪装成静态图：别信后缀与 Content-Type，按字节魔数判（iOS 只显首帧）

**症状**：封面 URL 全是 `.jpg`、响应头全报 `image/jpeg`，但部分封面在 Web 端会动；
iOS 端同一张封面静止不动——误以为插件取错图或 iOS 解码失败。

**原因**：站方把动态 GIF89a 与静态 JPEG 混排在同一 CDN 路径下（video_site_k 实测：同为
`.jpg` 后缀、同报 `image/jpeg`，字节头 `GIF89a` 即动图、`FF D8 FF` 即静图；动图单张
4~8MB）。iOS `ImageLoader.decode` 只取 `CGImageSource` 第 0 帧（`UIImage(cgImage:)`），
动图天然只显示首帧——是宿主既有行为，不是失败，不必修也不必绕。

**落法**：插件侧三条——① 封面 URL 原样直出，不做「转静态缩略图」之类的自作聪明
（无此能力）；② 站内写 `http://` 明文图床而 CDN 支持 https 时，统一升 `https://`
（iOS ATS 默认拦截 http，否则动静一起裂）；③ 需要区分动静（如打标、估流量）时用
`$lib.http` 取首字节看魔数，别用正则判后缀。

**真实案例**：`video_site_k.plugin.js` 1.0.0（抽查 4 张两动两静；详情 `poster` 与列表共用同一地址）。

### 「解锁 VIP」类需求先判付费墙层级：前端字段驱动 ≠ 服务端鉴权（判定法：身份对照实验）

**症状**：接到「解锁某站 VIP」的需求，参考脚本（Loon/Surge/QuantumultX 的 `[Script]` 改写）
做的是一堆字段改写——`videoType:'cvideo'→'tvideo'`、`isPaid/premium/vip→false`、
`activeUntil→2100年`、往 localStorage 写死一份会员态密文并覆写 `Storage.prototype.setItem` 冻结写入。
照抄这套进插件会**无处落脚**（插件没有 localStorage/DOM/前端 UI），也很容易误判成
「需要在插件里伪造会员身份」。

**原因**：这类改写脚本作用于**客户端 UI 层**——站点把会员校验做成**字段驱动的前端遮罩**
（`cvideo` 卡片盖会员罩、不给播放入口），**接口侧根本不校验身份**。
改写脚本骗的是前端渲染分支，不是服务端。插件本来就不经过前端，于是「解锁」在插件里
**天然成立**，需要做的只是**不去消费门槛字段**。

**落法**：① **对照实验定层级**（10 分钟，先做再写码）：取一条 VIP 资源，把身份参数
逐个变换——不传 / 传空 / 传站点真实值 / 传乱码（本例：详情接口的 `token` 参数四种取值），
看响应是否变化。**四者一致 = 服务端零鉴权**，限制只在前端；有差异才需要复刻身份链路。
② 读参考脚本时**分清它改的是哪一层**：改响应 JSON 字段 / 改 localStorage / 覆写 DOM
→ 都是客户端层，插件不需要；改请求头/签名/token → 才是服务端层。③ 插件实现上
**不写任何门槛字段判定**（不写 `if (vip) throw` / `if (isPaid) skip`），能否出流以
**接口是否给了地址**为准。④ 用户可见处**如实标注**（本项目走形态：列表 `tags`
状态标记 + 详情状态块），别假装站点已放开，也别把可播内容误报成「需登录」。

**真实案例**：`fleet_site_a.plugin.js` 1.0.0（fleet_site_b 家族；`token` 四种取值响应完全一致，
详情对 `cvideo` 直出 `m3u8s`；参考脚本 `ios151/Rewrite` 的 `porntube.lpx` 全程只做字段改写）。

#### 第二形态：门槛只差「前端自己少传的一个请求参数」（参数档位型）

**症状**：同一个出流接口，访客拿到的和会员拿到的是**同一份响应结构**，只是**内容档位不同**
（预告片 vs 全量片源）；站点没有任何 `isPremium/needLogin` 字段可看，也没有 4xx。
照抄参考脚本去改字段会找不到落点。

**原因**：站点把降级做在**请求参数**上——前端对访客请求 `GET /player_api?videoId=N&is_trailer=1`
（只回 1 条预告 mp4），对会员请求**同一个 URL 但不带 `is_trailer`**（回 1080p/720p/480p/240p 全量）。
再叠加播放器组件上的 `:max-duration="30"` + `:viewed-count-limit="2"` 做双保险，
但这**全是前端行为**：接口侧对身份零校验。

**落法**（判据比第一形态更省事，一次对照实验即定案）：
把「身份参数」（cookie 有无 / token 乱填 / 登录态）与「档位参数」（本例 `is_trailer`）**分开对照**：
- 身份维度四值响应**完全一致** → 服务端零鉴权（第一形态的判据，同样适用）；
- 档位参数才是唯一的档位开关 → 插件**去掉该参数**即可拿全量，不需要伪造任何身份。

实现上照抄第一形态的三条纪律：**不写门槛字段判定**（`role="GUEST"` / `max-duration` /
`join` 按钮一律不读）、**能否出流以接口是否给了地址为准**、**如实标注**（
列表 `tags` 状态标记 + 详情状态块说明「本站对访客只放 30 秒预告，本插件直取完整片源」）。

**参考脚本读法补充**：`video_site_c.lpx` 那份脚本改了三处——① 页面字段（`zone:'NONAUTHORIZED'→'AUTHORIZED'`、
`app--GUEST→app--MEMBER`）；② 详情页把 `content-path` 里的 `&is_trailer=1` 摘掉（并另用 `fetch` 直调
player_api）；③ CSS 去模糊 + 删限制文案。**只有 ② 是插件需要的语义，而且不用"改"任何东西——
直接不带那个参数就行**；① ③ 纯客户端渲染层，插件不经过，天然不需要。

**真实案例**：`video_site_c.plugin.js` 1.0.0（video_site_c.com/zh；两档会员内容各 2 条样本，身份四值一致、
`is_trailer` 是唯一开关；去掉后 4 档全量源，CDN 实拉 206；参考脚本 `ios151/Rewrite` 的 `video_site_c.lpx`）。


### 同站多 API 镜像（v2.a/v2.b/…）：插件要顺序故障转移，别写死一个域名

**症状**：站点前端并发请求 8 个 `v2.*` 镜像域名做测速（把结果写 `latency_<mirror>` 进
localStorage 后择优），插件若照抄抓包里那一个域名，遇到该镜像被墙/下线即整体不可用；
换域名又要改码。

**原因**：这类站的镜像**互为等价后端**（同一套 `POST /js` 信封协议），是站方为对抗封锁做的
多入口。前端自己就在做故障转移，插件写死一个 = 主动放弃站方的容灾。

**落法**：把镜像表声明成常量数组，`apiCall` 顺序 try：**能解出业务数据就返回，否则换下一个**
（判据用「业务数据可解析」而非「HTTP 200」——镜像失活常表现为返回非信封/加密解不开的
HTML 错误页，状态码仍是 200）。全失败才抛错，错误信息带上「N 个镜像均不可用」+ 最后一次
异常，便于用户分辨是网络问题还是站点改版。本模式与 `movie_site_a` 的「播放线路择优」不同层级：
**镜像择的是数据入口，线路择的是出流地址**，别互相套用。

**真实案例**：`fleet_site_a.plugin.js` 1.0.0（8 个镜像：`v2.fleet_site_a.com` / `v2.fleet_site_a.net` /
`v2.fleet_site_a.example` / `v2.fleet_site_a.example` / `v2.fleet_site_a.example` / `v2.fleet_site_a.com` / `v2.fleet_site_a.example` /
`v2.fleet_site_a.example`）。

### CryptoJS passphrase 加密的响应：密文是 OpenSSL 格式，Node 侧别直接丢给 createDecipheriv

**症状**：站点前端写 `AES.encrypt(JSON.stringify(x), "密钥").toString()`、响应是
`{"r":"U2FsdGVkX1+..."}`；在分析期想脱离浏览器用 Node 批量验证时，把 base64 解出来
直接 `createDecipheriv('aes-256-cbc', Buffer.from(密钥), iv)` 解不开（或 `bad decrypt`）、
也不知道 key/iv 从哪来。

**原因**：CryptoJS 传**字符串密钥**（passphrase）时走的是 OpenSSL 兼容封装，**不是**裸 CBC：
密文 = `"Salted__"` + 8 字节随机 salt + AES-256-CBC(Pkcs7) 正文；
key/iv 由 `EVP_BytesToKey(password, salt)` 派生——**MD5 迭代**，前 32 字节为 key、
再 16 字节为 iv（`D_i = MD5(D_{i-1} || password || salt)`，`D_0` 为空）。
`U2FsdGVkX1` 正是 `Salted__` 的 base64 前缀，看到它就是这套。

**落法**：插件侧**不用手搓**——`$lib.CryptoJS.AES.decrypt(密文, '密钥').toString($lib.CryptoJS.enc.Utf8)`
直接可用（沙箱已注入 CryptoJS），本项目插件即如此；Node 复刻只在**分析期**脱浏览器批量验证时
才需要（约 20 行 `crypto` 原生：MD5 迭代派生 + `aes-256-cbc` + 跳过前 16 字节）。
反过来，站点用**对象 key**（`{key: Utf8.parse(...), iv: ...}`）时才是裸 CBC，
参数得从页面脚本抄——两种形态先看前端调用形式再决定，别混。

**真实案例**：`fleet_site_a.plugin.js` 1.0.0（密钥就是字面量 `"xxx"`，见站点 `main.js` 的
`encrypt/decrypt`；`CapacitorStorage.*` 用户态另用 `"xxxxx"`）；
对照 `manga_site_b.plugin.js` 的 AES-256-ECB（对象 key + NoPadding，完全另一套）。

### 服务端对无效参数「宽松兜底」：有数据 ≠ 参数有效，选项真实性要用「兜底指纹」验

**症状**：照站点配置（bundle 里的频道表 / 筛选表）把选项搬进插件，其中某个参数值其实
服务端**不认**——但请求**不报错、HTTP 200、还返回满页 24 条**。用户点开那个频道/筛选，
看到的是**毫不相干的默认内容**，插件侧毫无异常信号。

**原因**：这类站（fleet_site_b 站群实测）对未知参数**宽松兜底**——落到默认内容池，
而不是返回空数组或 4xx。于是「拿到数据」这个最常用的健康判据在这里**完全失效**。
与两类已知坑都不同：不是 「参数被忽略、返回**同一集合**的未筛选结果」
（这里是**另一批内容**），也不是「0 条 = 匹配失败」（这里有满页数据）。

**落法**：**兜底指纹比对**——先用一个随机无效值（如 `zzz_<时间戳>`）请求一次，
把响应条目 id 集合存为「兜底指纹」；再逐候选值请求，**指纹与兜底完全相同即该值无效**。
判据必须用 id 集合而非条数（条数都是 24，区分不出来）。候选多时脚本化跑
（本站群 61 个候选 × 3 个池，一次跑完）。

**顺带两条同族判据**：
- **某池条数少或为空 ≠ 参数无效**：可能是「该池确无此类内容」（`cm` 在 fleet_site_a 空、
  `torture_other` 在两池空），要结合**其它池**是否有效来判——`cm` 在默认池有 24 条，
  故参数有效、只是该池没内容。
- **「内容相同」≠「参数无效」**：两个语义不同的入口当前返回同一批内容（`hot` = `month_favs`、
  `japan` = `av` = `t_high_gaoqing`）属站点自己的入口设计，**保留全部**，别去重掉。

**真实案例**：`fleet_site_b.plugin.js` v1.1.0（从共享 bundle 的 6 张配置表求并集得 61 个候选，
兜底指纹比对后 **60 个有效、仅 `91original`（91原创）无效**，已剔除；脚本
`_fixtures/fleet_site_a/family/type-validate.mjs` 可复跑）。

### 「页面即接口」站：同一个 URL 两副面孔，判别开关是**请求头**而不是请求方法

**症状**：列表页 URL 直连返回的是 SSR 骨架（卡片区是一个空壳组件，
`<div class="section__thumbs" :is="showThumbs"></div>`，`querySelectorAll('.thumb-wrapper').length === 0`），
但浏览器里明明有 36 张卡。于是去抓包找「列表接口」——抓不到独立接口：站点前端就是在**同一个 URL** 上
换了个头再请求一次。

**原因**：这类站（Vue inline-template + axios 拦截器）把「页面」与「数据」做成同 URL 双形态：
请求头带 `X-Requested-With: XMLHttpRequest` → 回 JSON 信封；不带 → 回 SSR HTML。
**判别开关是请求头，与请求方法无关**——实测 GET/POST **带**该头都回 JSON、**不带**都回 SSR HTML。
只按 `method === 'POST'` 判会得出「必须 POST」的错误结论（前端恰好用 POST 而已）。

**落法**（三层，逐层剥）：

1. **统一封装「带 XHR 头的取数」**（`fetchApi`），与普通页面抓取（`fetchPage`）分开；
   不要按 `content-type` 判——实测有的列表接口回 `text/html` 而 body 是 JSON
   （`/zh/model`，`JSON.parse` 才成功），按类型判会把数据当 HTML 丢掉。
2. **`template` 字段是「HTML 片段串」不是结构化数组**：`JSON.parse` 出来的
   `{ template, results_count, pagination_params }` 里，`template` 是一长串
   `<thumb-component type-thumb="video" video-id=… url-thumb=… title=… views=… has-label=…>`。
   **别用正则抠属性**——`$lib.cheerio.load('<div id="x">' + template + '</div>')` 后
   `$('#x thumb-component')` 再 `.attr()` 逐个取，实体解码与引号内特殊字符（属性值里有
   `{ goal_id: 825, pd: 'watch_next' }`）全交给解析器。同一站的不同通道可能一半是
   HTML 片段串、一半是**结构化对象数组**（首页内容块接口 `{template: [{id,title,thumbs,…}]}`），
   按 `typeof data.template === 'string'` 分流，别写成一种。
3. **分页只认 `pagination_params`**：`{total_pages, current_page, per_page, current_url, next}`。
   `next` 作 `hasMore` 的**辅**判据——实测有站的末页 `next` **回指自身**
   （video_site_c `/zh/dvds/211` 的 `next` = `/zh/dvds/211`），只看 `next` 会让「加载更多」无限可点；
   主判据用 `current_page < total_pages`，再用 `items.length > 0` 兜底契约不变式。

**离线 fixture 的连带影响**：双形态站一个逻辑动作要发多次请求（列表 + 翻页、详情 + 解析接口、
探索页 = 首页 + N 个分区接口），**单文件 `--fixture` 会把同一份 body 喂给所有请求**，
症状是「JSON 解析失败」这类假故障。用 runtime 的**目录式 fixture**
（`--fixture <dir>`，读 `<dir>/index.json` 的 `routes` 按 URL 逐条匹配，未命中显式报错）
才能离线跑通；见 `runtime/docs/fixture-modes.md`。

#### 第二形态：JSON 那副面孔里**少的是页面级控件**（筛选项只在 SSR HTML 里）

上面说的是「要数据就带 XHR 头」。反过来还有一半：**页面级控件（筛选滑块/排序按钮/题材条）
只渲在 SSR HTML 那副面孔里**，带 XHR 头拿到的 JSON `template` 里**一个字都没有**。

- 实测：video_site_c 工作室页 `/zh/studio/room/<slug>` 的「题材」滑块（`categories-slider-component`，
  每项 `@click="handleClickCategoryByName($event, '<值>')"`）**只在 SSR HTML 里**；
  同一 URL 带 `X-Requested-With` 拿到的 JSON 里它不存在（连类名都搜不到）。
  所以「列表页要声明筛选组」时，纯 XHR 通道**天然拿不到选项**。
- 判据：想声明筛选组但页面里找不到控件 → 先**再抓一次不带 XHR 头的页面**（同一 URL）。
  代价是每页多一跳 → 按维度缓存（video_site_c 按工作室 slug 存 `$lib.storage`、24h，
  冷路径与列表请求**并发**发、热路径只发列表）。
- ⚠️ **别把「解析不到控件」当常态**：控件缺失可能就是「这一页真没有」
  （video_site_c 多数工作室没有题材滑块 → 该组不声明），与「抓错了那副面孔」症状一样。
  两者的区分靠**离线 fixture 分开摆**：SSR 与 XHR 两条路由（同一 URL 用**请求头条件**
  分流，见 `runtime/docs/fixture-modes.md`），摆错就会静默丢组。

**真实案例**：`video_site_c.plugin.js` 1.1.0（工作室页筛选组；离线 2 家工作室抽样：
redhot 32 项含「所有题材」、catwalk 0 项只留排序组）。

**真实案例**：`video_site_c.plugin.js` 1.0.0（video_site_c.com/zh：视频/工作室/模特/DVD/搜索五个 JSON 通道 +
写真集/分类索引两个 SSR 通道；按 method 判、按 content-type 判、只信 next 三个坑各踩过一次，
均在 fixture 与在线双跑中暴露）。

### 详情元数据靠 JSON-LD、而站点的 JSON-LD 是**畸形**的（尾部多一个 `}`）

**症状**：`<script type="application/ld+json">` 里字段很全（`description` / `duration` /
`datePublished` / `thumbnailUrl` / `aggregateRating` / `interactionStatistic`），
但 `JSON.parse($('script[type="application/ld+json"]').text())` 抛
`Unexpected non-whitespace character after JSON at position N`——
详情简介、时长、发布日期**整块静默丢失**（若被 try/catch 吞掉，就是一个字段都填不上、
还不报错的静默失败）。

**原因**：站点把模板拼错了：`…"playerType":["HTML5","Flash"]    }}  }` —— 尾部多一个 `}`。
前面的 JSON 本身**完全合法**，只是后面跟了垃圾。

**落法**：**按大括号配平截取第一个完整对象**再 parse（模板已带 helper `extractBalancedJson`）：
从第一个 `{` 起扫，遇字符串开/关切换（并处理 `\\` 转义）时跳过括号计数，深度回到 0 即截止。
两个易错点：① 必须处理**字符串内的括号**（`{"a":"}"}` 不处理会提前截断）；
② 与 flight/RSC payload 的配平规则**不是一回事**（那类引号带反斜杠、判据是反斜杠奇偶，
见 `website-analysis.md`），别互相套用。
取到之后仍要 `try/catch` 兜底，但**失败要留痕**（`console.warn`）——
本坑的原始症状就是「一声不响地少了一半元数据」。

**顺带一条取值纪律**：JSON-LD 的 `duration` 是 ISO 8601（`T7M48S`，**没有 `P` 前缀**，
别按严格 `PT…` 正则解析），`datePublished` 是带时区的绝对时间戳（可安全落 `publishTime`）。
`associatedMedia` 里的推荐 URL 可能是**另一条路径写法**（video_site_c 详情页是 `/zh/studio/room/…`、
JSON-LD 里写 `/zh/creator/room/…`），实测两种都 200——**照抄 JSON-LD 的原始 URL**即可，
不要"归一化"成自己以为的那种（多一次改写就多一个 404 面）。

**真实案例**：`video_site_c.plugin.js` 1.0.0（`extractBalancedJson` 已进 `template.plugin.js`；
详情 6 个字段全部来自这一段 JSON-LD）。

### 索引卡落的是**详情页**时，`target` 不能写 `action:'list'`

**症状**（用户报障原文「DVD 和 图片 页的列表项进入后报错 `无法识别的列表页地址`」）：
DVD 目录与图片目录里点任意一张卡，宿主不打开详情，而是把**详情页 URL 当列表页地址**
去调 `fetchList`，插件按「未知列表页」如实抛错。

**原因**：索引类卡片（工作室/模特/分类/DVD/写真集）通常共用一个映射函数，
里面**统一**挂了「点这里进列表」：

```js
// ❌ 所有索引卡都写 target
item.target = { action: 'list', url: link, channel }   // DVD/写真集的 link 是详情页
```

而 `channel` 是按卡片类型传的：工作室/模特/分类是 `*-videos`（真列表页），
DVD/写真集是 `*-detail`（详情页）——**同一个函数同时服务两种落页语义**，
宿主只看 `action:'list'` 就调 `fetchList({url: <详情页>})`。

**落法**：target 是**列表页专属**声明，用白名单按通道判，详情卡留空（走宿主默认详情行为，
与视频卡 `videoNodeToItem` 同口径）：

```js
const LIST_CHANNELS = { [CHANNEL.VIDEO_LIST]: true, [CHANNEL.STUDIO_VIDEOS]: true, [CHANNEL.MODEL_VIDEOS]: true }
if (LIST_CHANNELS[channel]) item.target = { action: 'list', url: link, channel }
```

**自查口径**（一条命令看全）：列表跑完统计「带 target 的卡数」——
本插件实测 DVD 24/24→0/24、图片 30/30→0/30，而工作室 24/24、模特 36/36、分类 382/382 照旧带
`channel=studio-videos|model-videos|video-list`。**详情卡带 list target 的比例应当是 0**。

**真实案例**：`video_site_c.plugin.js` 1.1.0（三处调用点共用 `indexNodeToItem`，1.0.1 及之前两类卡必报错）。

### 同族页面的排序/筛选 key 不是同一套：别复用兄弟通道的常量

**症状**：筛选组渲染正常、点下去也「成功」了，但**结果没变**（服务端把未知档位当缺省），
或报 302/404 —— 排查半天发现只是档位名不对。

**原因**：同一个站的不同列表页**各写各的档位名**，看着是一回事：
video_site_c 视频目录页 `/zh/japanese-porn-videos/<sort>/all` 的排序是 `justadded|popular|top`
（站点 `.list-filter__sorting-btn` 的 `data-name`），
而**工作室**作品页 `/zh/studio/room/<slug>?sorting=` 是 `newest|popular|rating`
（`handleClickSortingByName`，页面 URL 是查询串不是 path）。
两处都有个 `popular`，很容易顺手把视频目录的常量表套到工作室页上，
于是 `justadded`/`top` 两个档位**静默失效**。

**落法**：**一个通道一套常量 + 一套校验**（`SORT_FILTERS` / `STUDIO_SORT_FILTERS` 各配
`pickXxxSort` 白名单），并且**别用 URL 形态猜**：同一站排序可能一处走 path
（`/<sort>/all`）、一处走查询串（`?sorting=`），承载方式也要各写各的
（video_site_c 工作室页页码仍是 path：`/zh/studio/room/<slug>/2?sorting=…`，
而 `?page=2` 会被服务端**忽略**——实测 `current_page` 仍是 1）。

**取证口径**：站点自己的控件就是唯一真相源——排序按钮上带 `data-name`/`data-url`
或 `@click="handleClickSortingByName($event, '<值>')"`，界面语言（都是「最受欢迎」）
不能当判据。**声明筛选组前逐个档位 curl 一遍**，比对 `results_count` 与 `current_url`。

**真实案例**：`video_site_c.plugin.js` 1.1.0（工作室页排序/题材；同站两套排序 key 已分别建表）。

### 详情恒报「不存在/已下架」而列表正常：先查 id 提取正则有没有把 id 截断

**症状**：同一个源里**部分**目录页点进详情必失败，另一些目录页全好；错误是服务端文案
（「视频不存在或已下架」/「帖子不存在或已下架」），看着像内容下架、接口改版、或缺鉴权参数——
于是开始试 `lid`/`token`/`referer` 各种参数，全是白费。

**原因**：`fetchDetail` 用 `String(url).match(/\/movie\/(\d+)/)` 取 id，而**站点的 id 不止纯数字**。
video_site_h（2026-10）三种形态并存：纯数字 `313524`、16 位 hex `5887fcd476654036`、
24 位 hex `6ac9bbac71d21bf0d4027483`；`\d+` 对 hex id 只吃到开头的数字段
（`5887fcd476654036` → `5887`），**不报错、不抛异常**，照常发出一个「合法但不存在」的请求。
哪几个目录页出问题取决于它们的 id 形态：会员专区/榜单全是老数字 id ⇒ 一直好好的，
短视频/短剧/新投稿是 hex ⇒ 全挂——所以「部分页面坏」这个分布本身就是线索。

**修复**：id 一律按**非分隔符字符**全取，不写 `\d+`——路径段用 `splitPath()` 按下标取
（模板 helper），或 `/\/movie\/([0-9A-Za-z_-]+)/`。构造侧同理（`movieUrl(id)` 别再假定纯数字）。

**取证口径**：错误文案可反推走错通道——`/movie/detail` 与 `/post/detail` 各有自己的文案，
拿到的文案与预期通道不符 = 分流分支错了。真值用「同一 id 直连接口」比对：
`{id, lid:null}` 与 `{id, lid:id}` 两种都试——**两种都失败说明 id 本身错了，两种都成功说明
lid 不是变量**，别在 lid 上继续耗。

**真实案例**：`video_site_h-vlog.plugin.js` 2.0.0（v1.1.0 起该 bug 存在；修复后三种形态回归样本
存 `_fixtures/video_site_h-vlog/detail-id-shapes.json`）。

### 把内部路由枚举名当地址用：站点照常渲染、只是内容不是那一页（video_site_h Vlog）

**症状**：listings 的「网站原页」按钮点开**不是那一页**（甚至是空白页），但**不报 404、不报错**，
CLI 逐条 `✓`、地址计数也「N/N 全有」——纯粹是地址指错了地方。同类症状还有**整组装错**：
分组名与页签都对得上，装的却是不属于它的页签。

**原因**：Flutter（dart2js）SPA 里有**两套名字**——代码里的内部路由枚举名，与浏览器 hash 路由。
video_site_h（2026-10）底部导航 5 项枚举 `home|vlog|dark|community|mine`，真实路由是
`#/home|#/vlog|#/dark|#/post`（+「我的」）：

- 第 4 项枚举名 `community`，路由却是 **`#/post`**；`#/community` 实测**一个业务请求都不发**
  （死路由，Flutter 照样画出空壳，控制台无错）。
- 第 3 项枚举名 `dark` 与路由 `#/dark` 同名——**同名不代表可以类推**：我按「枚举名 = 路由」写出
  `#/community`，又按「dark 听着像猎奇」把它判给了别处，两次都错。
- 分组归属同样中招：`dark_nav` 被归成「首页顶部栏 ☰ 的更多频道」（实际 ☰ 走的是
  `/search?position=dark` 搜索页），真身是底部导航第 3 项**尤物圈页**的 6 个页签。

**修复 / 取证口径**（三条独立证据链，缺一不可）：

1. **静态找真值**：dart2js 产物里的**页面注册表**直接给「中文标签 → 路由」——
   `A.bZ(new A.cvX(), "尤物圈", q, "/dark", q, …)`、`"约会抽奖" → "/dating"`、`"帖子" → "/post"`；
   再找**页面类读哪个配置字段**（`$.bY().z`=dark_nav、`.as`=post_nav、`.k2`=dating_nav、
   `$.bY().id`=vlog_nav），分组归属就没有猜的余地。
2. **浏览器逐跳对齐**：**在已加载的应用里改 `location.hash`**，按时间戳把「页 → 接口」一一对上
   并互相印证（`#/post`→`/post/navFilter`+`/search/post`、`#/dark`→`/movie/navBlock`、
   `#/dating`→`/search/dating`、`#/community`→**无**、`#/vlog`→`/search/movie`+detail+danmaku）。
   ⚠ **别用整页重载（`page_navigate`）到 hash 地址**来做这个判定：启动路由会重走一遍，
   实测被送回 `#/home`（当时页面上还有人在手动点击，更不可靠）。
3. **内容侧交叉验证**：接口响应常自带站点自己的叫法——`/movie/navBlock {id:11}` 首个分区名
   就叫「尤物圈 - video_site_h独家冠名制作」，一条就定案。

**教训一句话**：SPA 的地址要用「这个地址**实际发什么请求**」验，不是用「名字像不像」推；
写完 `origin` 后拿接口时序对照一次页签内容。

**真实案例**：`video_site_h-vlog.plugin.js` 2.1.0（2.0.0 的 listings：`dark_nav` 归组错、社区写死
`#/community` 且只收 1 条叶子、原「尤物圈」组装的其实是约会抽奖页的页签）。

### 子页签参数穷举不出来 ≠ 站点不支持：参数是服务端 navFilter 下发的（video_site_h社区页）

**症状**：一个页面有 5 个子页签（最新/官方/约会/尤物/反差），挨个把页签对象的字段
（`id`/`nav_id`/`type`/`name`/`code`/`style`/`group`）当列表接口的参数试，**返回全都一样**——
于是判定「站点不支持子页签筛选」，只收录默认那条，砍掉 4 个页签。

**原因**：参数根本不由客户端拼。该页每个页签进页面时先打 `/post/navFilter {id}`，
响应里的 `filters` 才是那一页签的**整份列表参数**：

| 页签 | `/post/navFilter {id}.filters` |
|---|---|
| 最新(1) | `{order:'new', position:'normal'}` |
| 官方(2) | `{home_id:'32581', order, position}` |
| 约会(3) | `{home_ids:'9205859,…', order, position}` |
| 尤物(5) | `{order, tag_id:'690,715,702,694,705,688,769', position}` |
| 反差(6) | `{order, tag_id:'676,…', position}` |

把 `filters` 原样喂给 `/search/post`，5 个页签立刻五份不同内容（逐页签对 id 集合，
10 组两两比对全不同）。**参数是运营数据（作者/标签 id 集合），会腐**——必须现取现用，
取不到时只回退**站点首页签那一档**，不硬编拷贝别的页签。

**识别法**：同族接口常有个「XXFilter / XXBlock」伴随端点在下发参数（该站三个都有：
`/movie/navFilter`、`/movie/blockDetail`、`/post/navFilter`）。见到响应里有 `filters`
字段就该想到「它是给下一个请求用的」，而不是「这是筛选 UI 的描述」。
**判据是「有没有接口在下发参数」，不是「我试的键生不生效」**——后者只会得到「全被忽略」。

**旁证**：页签自己的 `style: 'post_2'` 是**布局形态**（Dart 里按它选页面控件 `A.UB`/`A.a73`），
不是任何参数的值——`position=post_2` 实测 0 条，正是把布局字段当参数试的产物。

**真实案例**：`video_site_h-vlog.plugin.js` 2.1.0（2.0.0 社区组只收「最新」1 条叶子；
夹具见 `_fixtures/video_site_h-vlog/post-nav-filter.json`）。

### 端点回「网络异常」≠ 网络问题：缺的是站点自己的语义参数（video_site_h每日精选）

**症状**：某个端点怎么调都回 `status:'n'` + `errorCode:-2` + 文案「网络异常-02,请稍后再试」——
不带参、带 `page`、带 `page_size` 全一个样。看着像接口挂了 / 反爬 / 要登录，于是把
**用户明确点名的入口**（首页「每日精选」）判成「站点没开放」放弃掉。

**原因**：该端点的必需参数是**站点自己的语义值**，名字和取值都不在响应里：
`/movie/daily` 要 `label=<YYYY-MM-DD>`（页面把当天格式化成 `年-月(补零)-日(补零)`）。
**服务端把「参数缺失」报成了「网络异常」**——错误文案跟真实原因无关，别拿它当根因。

**取证口径（10 分钟定案，比试参数快）**：在 dart2js 产物里搜端点字面量，直接读它的请求构造：

```javascript
// main.dart.js：参数名与来源一目了然
bv8(a){ … A.by(null,null,"post", A.B(["label",a], …), "/movie/daily") … }
// 再顺调用者找取值与格式：
A.ceD.prototype={$0(){return A.bv8(this.a.ga2O())}}      // 传的是当天
A.aeR.prototype={ga2O(){return ""+年+"-"+月(补零)+"-"+日(补零)}}
```

顺着 `A.by(...)` 的第 4 个实参看**参数表**、顺着调用者看**格式**，比在响应里猜参数名快得多；
同理，`null` 实参就是「这端点不要参数」。

**修复**：缺省给站点会用的值（当天），并把该值作为**页级筛选**暴露（日期选择器 → `type:'text'`，
见 listings.md 规则 16）；**格式校验前置**——不符合就抛清晰错误，别把畸形值发出去等一句
「网络异常」。同一族「日期档」端点（每日更新/今日精选）都吃这套：先看站点日期选择器的格式。

**真实案例**：`video_site_h-vlog.plugin.js` 2.2.0（夹具 `_fixtures/video_site_h-vlog/daily.json`）。

### 分区整块消失：聚合页的分区是**异构**的，单一映射器会把整块静默丢光（video_site_h原创页）

**症状**：用户点名「某某页里少了某某块」——接口里**明明有**这个分区和它的几十条条目，
App/CLI 里那一块就是不出现；CLI 只把分区数打成 5 而不是 6，**不报错、不置 exitCode**，
逐条 `✓` 一切正常。这是最容易被放过去的一类静默数据丢失。

**原因**：聚合页（navBlock/首页分区/社区块）的各分区**条目实体不是同一种**。
video_site_h `/movie/navBlock {id:4}`（原创）6 个分区里，首个内容分区「video_site_h女郎」
（站点自报 `style:'20'`）的条目是**创作者**（`{id,nickname,username,headico,type:'user'}`），
其余 5 个分区是视频条目。插件对所有分区都用 `movieItem` 映射，而该映射器第一行是
`if (v.type && v.type !== 'video') return null` → 44 条创作者**逐条判空**，
紧接着 `if (!items.length) return` 把**整块**丢掉。少一块但全绿。

**修复口径**：按**分区自己声明的类型字段**（这里是 `style`）选映射器，别指望一个映射器
兼容两种实体；站点怎么分派，插件就怎么分派（Dart 里就是 `if (style === "20")` 走作者块分支，
其「更多」也走专属通道 `/profile/upSearch {filter}` 而不是通用 blockDetail）。

**判据/取证**：分区级排查要看**响应里有哪些分区**与**每块首条的字段集**：

```
for (const b of resp.data) console.log(b.id, b.name, b.style, b.route, b.items.length, Object.keys(b.items[0]||{}))
```

字段集不同（`nickname/headico` vs `name/img/duration`）= 异构块。**别只看分区数**——
数字对不上要追到「哪块被谁吃掉了」，count 一致则查 `items.length` 与映射器返回 null 的比例。

**同类风险**：`toItems(list, mapper)` 里 `mapper` 返回 null 被静默过滤（本站在这里栽过两次：
一次是创作者条目被 `movieItem` 吃掉；另一次是判空后连块一起丢）。给聚合页写映射时，
**先按块的类型分派，再判空**；块内条目全被过滤时至少要 `console.warn` 出来。

**真实案例**：`video_site_h-vlog.plugin.js` 2.2.0 修复（夹具 `nav-block-4.json`：6 分区、
首块 44 创作者；`search-up.json`：作者块「更多」的 `/search/up {ids}` 翻页 20/20/4）。

### 筛选参数「看着像」不等于生效：三点对照（无参 / 有效值 / 无效值），且别拿 total 当判据

**症状**：详情页的实体（分类/主演/标签）点进去「能出列表」，但内容与所选维度无关；
或者反过来——明明站点的标签页有内容，自己拼的参数却回 0 条。两种都不会报错。

**原因**：服务端对**不认识的键/值**有三种沉默反应：① 直接忽略（返回全量，看着正常）；
② 当成别的语义（返回另一批数据）；③ 回空数组。凭「有返回」断定「参数生效」必栽。

**判据（固定三点，30 秒定案）**：同一端点跑三遍，**对照 total 与首几条 id**：

```
无参→ total=10000   ← 基线
有效值 tag_id=72 → total=4244    ← 与基线不同 = 真筛
无效值 tag_id=99999999 → total=0 ← 必须回 0；不回 0 说明这个键根本没被消费
```

三点的 total **两两不同**才算「参数真实存在」；**无效值回 0** 是最硬的那一条（只比有效值
与基线，遇到「无参本身就带默认筛」的站会误判）。**total 不可信时只看 id**：video_site_h
`/search/post` 的 total 有封顶/噪声（无参 10000、`tag_id=683` 9800、`tag_id=692` **10000**），
但换 tag_id 时**前几条 id 确实变了**——筛是生效的，是计数不可信；只盯 total 会得出
「tag_id 无效」的错误结论。

**附带结论**：同一套 `order` 档（new/hot/click/favorite）要按维度各验一遍（video_site_h
`tag_id`/`cat_id`/`home_id` 三种维度四档结果两两不同，基线存成
`_fixtures/<id>/sort-matrix.json`）。四档里某两档结果一致，多半是**站点数据**如此
（video_site_h帖子 `tag_id=702` 的 hot 与 favorite 同结果，换 tag 683 又不同），别急着改代码。

**真实案例**：`video_site_h-vlog.plugin.js` 2.3.0（夹具 `_fixtures/video_site_h-vlog/sort-matrix.json`、
`movie-tag-detail-72.json`）。

### 服务端下发的 filter 对象不能整份照抄：里面混着**页级/广告键**，照抄即空列表

**症状**：站点自己的标签页/合集页「配置接口」下发的 filter 看着就是列表请求的整份参数，
原样透传却**回 0 条**；而少传一个键就正常。

**原因**：这类 filter 是给**页面**用的，里面除内容键（`tag_id`/`order`）外还带
**页级键与广告键**（`position`、`ad_code`、`page_size`）。它们进的是页面自己的白名单，
列表端点只认有限取值：video_site_h `/movie/tagDetail {id,position}` 把**你传的 position 原样
回填**进四档 filter，而 `/search/movie` 只认 `position=normal`（4242 条）——
站点视频详情页的页级代码 `movie_info`（`play_ads[].position_code=movie_info_play` 可见其家族）
以及任意串都**回 0 条**。**回填 ≠ 校验**：值被原样写回响应，不代表它是可用取值。

**修复口径**：从服务端 filter 里**只取内容键**（能对上「无参/有效/无效」三点对照的那几个），
页级/广告键要么丢掉、要么按站点真实取值显式给（`position=normal`），**绝不全量透传**。
判别方法：把 filter 的键逐个删掉试，删哪个能从 0 变有结果，哪个就是不能照抄的页级键。

**真实案例**：`video_site_h-vlog.plugin.js` 2.3.0（夹具 `movie-tag-detail-72.json` 的 filter 带
`position`；`tag_id=72` 带 `position=movie_info` → 0 条、`position=normal` → 4242 条）。

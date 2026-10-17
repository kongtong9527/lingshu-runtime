# 视频播放参考（插件侧）

> 本文只讲**插件作者**需要知道的：如何正确产出 `video` block、以及影视站「播放页解析」（ADR-0020）。DevConsole/宿主如何播放、代理重写、处理 Cloudflare 与浏览器兼容，属宿主侧实现，见 `devconsole/docs/video-playback.md`（索引入口 `devconsole/AGENTS.md`）。

## 适用场景

详情页正文里包含视频流（HLS / `.m3u8`、分片 `.ts`、AES-128 密钥 `key.bin` 等）时适用。插件作者只需按规则产出 `video` block，伪装请求头、重写 HLS 子资源 URL、浏览器解码等复杂工作都由宿主承担。

**影视站的另一类场景**：详情页只有「线路 × 剧集」，剧集 URL 指向**播放页**而非 m3u8（macCMS 常见）。此时不需要在 `fetchDetail` 里解析，而是产出 `episodes` block + 实现 `fetchPlayUrl`（懒解析），见下文「播放页解析（fetchPlayUrl）」。

## 数据契约

`ArticleDetail.blocks` 中的 `video` 块结构（见 `runtime/src/types.ts`）：

```typescript
{
  type: 'video'
  url?: string             // 可选（ADR-0026）：视频流原始 URL（m3u8 或直链）；缺省时必须带 target.play
  target?: { action: 'play', url: string }  // 出流入口 URL（详情页/播放页），宿主懒调 fetchPlayUrl
  poster?: string          // 封面图
  duration?: number        // 时长（秒）
  platform?: string        // 平台标识（如 'manga_site_a'、'bilibili'）
  referer?: string         // 播放该视频时要求代理向上游声明的 Referer
  qualities?: VideoQuality[]  // 可选（ADR-0029）：多清晰度档位（多 URL 型站点），url 为默认档
}
```

`qualities` 与 master playlist 的关系见 `data-model.md`「视频清晰度（ADR-0029）」节：
**多 URL 型站点显式声明各档 URL；master playlist 型（单个 m3u8 含 `#EXT-X-STREAM-INF`
多码率）零声明——宿主播放器自动渲染清晰度菜单**。`fetchPlayUrl` 返回的 `PlayUrlResult`
同样可带 `qualities`（懒解析时才出多档的站点用）。

`url` 与 `poster` 必须是完整的绝对 URL。**`target.play` 与 `url` 同时存在时，宿主优先懒解析**（url 可能是页面/入口地址而非媒体直链，直接给 `<video>` 会 `MEDIA_ERR_SRC_NOT_SUPPORTED`）。

## 何时设置 `referer`

只在没有 `referer` 时视频请求会失败（CDN 校验 `Referer` 头）的场景下才设置。规则：

- **CDN 要求 `Referer` 等于嵌入页 URL**：典型如 `mo.manga_site_a.xyz`，要求 `Referer: https://manga_site_a.com`。此时把 `referer` 设为详情页 URL（或同站根 URL），宿主会用它作为上游请求头。
- **直链带鉴权参数时通常也校验 `Referer`**：B 站 playurl 返回的 mp4 直链实测缺 `Referer` 返回 403（`Referer: https://www.bilibili.com/` 时 206）——此类 `referer` 必须返回。
- **`referer` 必须是真实嵌入页 URL**：用详情页 `sourceUrl`，不要伪造无关域名，否则可能触发反爬或被识别为盗链。
- **反向：不校验的 CDN 不要加**：Twitter 视频 CDN（`video.twimg.com`）无 `Referer` 回 200、带站内 `Referer` 反而 403——多写即把可播流写成死链（video_site_j 实证，先 curl 无头与带站头双验再定）。

示例（来自 `manga_site_a.plugin.js`）：

```javascript
const sourceUrl = absoluteUrl(url)
const playUrl = parseAnimePlayUrl(body)   // https://mo.manga_site_a.xyz/video/.../playlist.m3u8?verify=...
blocks.push({
  type: 'video',
  url: playUrl,
  poster: coverUrl,
  duration: parseDurationSeconds(durationText),
  platform: 'manga_site_a',
  referer: sourceUrl                       // mo.manga_site_a.xyz 校验 Referer 必须为 manga_site_a.com
})
```

## 插件只需做（不要越界）

视频播放的复杂部分都由宿主承担，插件只负责产出正确的 `video` block。插件侧务必做到：

1. **只解析清单入口**：`video.url` 只放播放清单（playlist.m3u8）或直链，**不要**把 m3u8 内部的 key/分片 URL 拼进 `video.url`。
2. **保持原始 CDN URL**：**不要**伪造或重写 `video.url` 为代理 URL（如 `/api/proxy?url=...`）。保持原始 CDN URL，由宿主决定哪些资源走代理、哪些直连。

> 哪些子资源走代理、哪些必须浏览器直连（如受 Cloudflare 保护的 `#EXT-X-KEY`），由宿主在播放时重写 HLS 清单决定，插件无需也无法干预。

## 播放页解析（fetchPlayUrl，ADR-0020）

影视站的剧集 URL 是播放页（含播放器配置），不是媒体 URL。插件产出 `episodes` block（`lines[].episodes[].url` = 播放页 URL）+ 实现 `fetchPlayUrl`，把播放页解析成最终视频流：

```javascript
async function fetchPlayUrl(playPageUrl) {
  // 1. 抓播放页，取播放器配置（macCMS：player_aaaa={...}）
  const html = await get(playPageUrl)
  const config = extractPlayerAAAA(html)   // {from:'NBY', encrypt:3, url:'<hex>'}

  // 2. 网盘线/不可解析来源：明确报错，不冒充能力
  if (isPanFrom(config.from)) throw new Error(`线路「${config.from}」是网盘资源，暂不支持应用内解析`)

  // 3. 自定义播放器链路（示例：artplayer 页 + 解析接口 + AES 解密，movie_site_c 案例见 _fixtures/movie_site_c/）
  const vkey = await fetchVkeyFromArtplayer(config.url)   // GET /static/player/artplayer/?url=<hex>
  const encrypted = await postResolveApi(vkey)            // 带 Origin/Referer/UA 的 POST
  const url = aesDecrypt(encrypted)                       // 注意 key/iv 用 Utf8.parse 派生

  return { url, platform: config.from, referer: undefined }
}
```

**插件侧规则**：
- `fetchPlayUrl` 可多跳（播放页 → 播放器 JS → iframe 播放页 → 解析 API），复用 `$lib.http` + `$lib.CryptoJS` 复刻链路，产出对宿主透明的 `PlayUrlResult`（字段与 `video` block 对齐）。
- **保持原始 CDN URL**：返回的 `url` 是最终 m3u8/直链（常带 `auth_key` 等时效鉴权，约 1h），不要改写成代理 URL；宿主按会话缓存即可。
- **最终产物可能是 MP4 直链而非 m3u8**：宿主播放器按 URL 形态自动处理，插件照常返回 `{ url }`。
- **多跳失败带来源报错**：每跳失败带 URL/状态/片段，宿主就地展示错误与重试。

## KVS 播放器地址还原（flashvars `function/` 包裝，kvs_site_b 案例）

KVS（Kernel Video Sharing）站的详情页内嵌 `flashvars`（`video_url` / `video_alt_url…` 多清晰度），
其 get_file 地址是加擾的，不能直访（404），链路为：

`flashvars` H1（`function/0/…/get_file/3/<H1>/…`）→ 置換 P 还原 H2 → GET H2 302 → `remote_control.php?…`（CDN 签名地址，time 时效）→ mp4

识别信号：`video_url: 'function/0/https://…/get_file/…'` + 同页 `license_code: '$…'`（全站常量）+ `kt_player.js`（KVS player）。

- **P 是本站 license 下的固定 32 字符置換**（`H2[i] = H1[P[i]]`，只作用于 32 位 hex hash，其余 URL 部分原样保留）。
  同 license 下全站通用；换 license 则 P 变化（插件须告警，见下）。
- **求 P 用浏览器预言机**（别手算混淆代码）：页面上 `kt_player(div,'x.swf','100%','100%',fv)` 会原地改写
  `fv.video_url`（去掉 `function/0/` 前缀并置換 hash）。用该预言机跑若干组（各清晰度 H1 + 全 0/全 1/单位探针），
  对输出做“跨样本一致的单置換”约束求解（每位候选交集唯一即收敛）。再用无 cookie 的 GET 验证 H2 是否 302。
- **插件实现**：从本页 `flashvars` 取新鲜 H1（H1 可能随请求变化，每次现取现算）+ 校验 `license_code`，
  应用 P 得 H2（无 cookie/referer 要求，宿主播放时跟随 302 即可拿新鲜 CDN 地址，不存时效地址）。
  license 与已知常量不一致时打 `console.warn`（P 可能失效，播放 404 即需重跑探针更新 P）。
- **坑**：播放器内另有一套 `dJ/dH/dI` 定时改写逻辑（全局 `bw`/`db` 累加器，输出随历史漂移），
  预言机探针必须用“原地改写后的 `fv.video_url`”读数、且以多样本交集收敛为准，不要信任单次调用的中间态；
  `video_alt_url2_text` 這類標籤不要跨键取错（720p 档的 label 取 `video_alt_url_text`）。
- **同家族不同形态（video_site_e 案例，2026-09）**：同为 KVS（`flashvars` + `license_code` + `kt_player.js`），
  但 `video_url` 是**纯 base64 直链**（`atob` → `https://…/get_file/11/<hash>/…mp4?br=`，无 `function/` 前缀）时**无需置換**——
  解码地址直接 GET 即 302 到 CDN 签名地址（双样本 curl 验证，改错一位则 404）。
  **先按前缀判形态再选链路**：`function/` 包裹 → 走置換 P；base64 直链 → 解码直访（curl 验证 302 即定案，
  不要为“同家族”硬套置換）。`video_url_hd` 恒为 `MQ==`（即 `"1"`）表示无二档，不是真实清晰度，解析时跳过。
- **改版取消置換（kvs_site_b 案例，2026-09-23）**：同站升级 kt_player 7.11.4 → 15.8.3 后，
  `video_url` 无 `function/` 前缀、非 base64、裸 `get_file/3/<32位hex>/…?v-acctoken=…`，
  页内原 hash（H1）免 cookie/referer 直接 GET 即 302 到 CDN（2 片源 curl 定案，无 cookie 也 302），
  对 H1 再套旧 P 反而 404。**改版后先 curl 直验 H1（302 即定案用原值），勿沿用旧 P**；
  播放器配置变量名可改名（`flashvars` → `var t<hash> = {…}`），解析锚定键名正则
 （`video_url(_text)` / `video_alt_url…`）而非变量名，改名不受影响。
  判定链补第三支：裸 get_file hash → 直访（302 即用，不置換）。

## 同站多播放器形态（出流发现，anime_site_a 案例）

同一站点不同时期视频可能用完全不同的播放器栈——不能只凭一个详情页样本定出流解析，
新老样本至少各取一个对照。

- **识别信号**：渲染后 DOM 的 `<video>` 无 `<source>` 子节点、`src="blob:…"`、
  播放器画质菜单显示 `undefined` → 真实出流在原始 HTML 内联脚本里（如
  `const source = 'https://…/master.m3u8?…'` + `Hls.isSupported()/hls.loadSource`），
  而非 `<video><source size>`。
- **渲染后 DOM 会反向掩盖**：与 pitfalls「渲染后 DOM-fixture 掩盖运行时接口」相反，
  这里是 JS 执行后把出流藏进了 blob——出流发现必须看**原始 HTML**（`rawHtml` /
  document 响应体），渲染后 DOM 只用于确认播放行为。
- **解析**：内联 m3u8 正则提取时必须同时命中播放器上下文
  （`Hls.isSupported|hls.loadSource|new Hls`），避免误命中无关脚本；`&amp;` 解实体；
  master playlist（含 `#EXT-X-STREAM-INF`，curl 拉一次实测确认）按 ADR-0029
  零声明 `qualities`。
- **兜底链**：`video source[size]`（多 URL 型）→ 内联 m3u8（master 型）→
  `<link rel="preload" as="video" href="…mp4">`，三者皆无才抛错（带 URL 与缺失形态指引）。

**真实案例**：`anime_site_a.plugin.js` v1.0.1——新视频（v=408091）hembed 三档 `source[size]`；
老视频（v=25314/25315，2003 年）ext_site_a HLS（`abre-videos.ext_site_a.com/_hls/…/master.m3u8`，
单码率 1440x1080，curl 实测 200 可播、CDN 不校验 Referer）+ `cdne-mobile` 720p MP4 preload；
fixture 双份：`detail.html`（A 形态）+ `detail_hls.html`（B 形态）。

## 验证清单（插件侧）

- `video.url` 是完整的原始 m3u8 URL（通常带 `verify=`、`token=` 等鉴权参数），未经过任何代理前缀改写
- 在 CDN 校验 `Referer` 的源上，`video` block 携带了 `referer` 字段，值是详情页或同站 URL
- 在 DevConsole 中真实播放能加载成功（若报 `key.bin 403` / `MEDIA_ERR_SRC_NOT_SUPPORTED`，先按本清单自查插件侧；确认插件侧无误后，属宿主侧问题，见 `devconsole/docs/video-playback.md`）

# 详情/阅读模型泛化：文本章节内容与懒播放解析

2026-08 为接入 video_site_a.com 发现缺口：该站「小说」是 `/novels/<id>` **单页全文、无章节、
纯文本**（正文落在单个 `article.markdown-body` 内），现有 `ReadingPage` 是
`pages: string[]`（**只装图片 URL**，为漫画设计）——小说正文塞不进去，也没有「图文混排章
节」的表达。视频详情页 `/comic/index/detail?video_key=<id>` 则在详情页内嵌 packed JS →
调 `/index/detail_play` 接口动态拿 m3u8（带时效 `auth_key`），属于「详情页即播放入口」，
不是 ADR-0020 的「剧集 → 播放页」形态。决策：

1. **`ReadingPage` 增加 `content?: ContentBlock[]`（章节内容块）**：语义从「图片阅读」泛化
   为「章节内容阅读」——`content` 可放图文任意混合（`text`/`heading`/`image`/`link`…）。
   `pages: string[]` **保留**作为兼容通道（旧漫画插件零改动；宿主渲染 `content` 有则优先，
   无则把 `pages` 逐张转成 `image` 块回退）。video_site_a 小说单页全文用 `content` 返回全文，
   无需章节列表。一次性迁移成本≈〇。
2. **单页全文（整本书/整篇详情）不进 `chapter`/`fetchReadingPage`**：video_site_a 小说「详情即
   全文」——`fetchDetail` 直接把正文出成 `text`/`heading` blocks；`chapter` + `fetchReadingPage`
   仍只用于**逐章翻页**的站点。这是实现语义（详情直出），不是新契约。
3. **`video` block 支持「无 url 播放占位」**：`video` 的 `url` 从必填变**可选**；缺省时必须
   携带 `target: { action:'play', url }`（url 为详情页或播放页 URL）。宿主对「无 url 的
   video」渲染为**播放占位**（封面 + «解析播放»），用户点播时才懒调 `fetchPlayUrl(target.url)`
   ——详情渲染不阻塞、播放地址现算、时效 URL 最大化新鲜度。
4. **`fetchPlayUrl` 语义泛化**：入参从「剧集播放页 URL」（ADR-0020）放宽为「**任意出流入口
   URL**」（详情页 URL / 播放页 URL / 任何能解析出最终流的页面）——契约类型不变
   （`fetchPlayUrl(url) => PlayUrlResult`），语义从「播放页解析」扩展为「出流解析（Play
   Resolution 的通用化）」。产物仍是原始 CDN 直链（m3u8 或 MP4），宿主按会话缓存。
5. **simulator `play` 动作语义同步放宽**：`play <URL>` 的 target 不再限定「播放页」，可为
  详情页 URL；`--fixture` 仍只覆盖第一跳抓取。

## Considered Options

- **新增独立 `fetchTextChapter → { title, content: string }`（否决）**：会留「纯文本阅读」与
  「图片阅读」两个并行语义，图文混排站点难以表达（正文里插图怎么办）；`content: ContentBlock[]`
  一次到位覆盖纯文本、图文混排、多段结构。
- **`ReadingPage.pages` 直接废弃改 `content`（否决）**：旧漫画插件（manga_site_f/manga_site_b/manga_site_a/manga_site_e）
  全部要迁，且这次升级不必重写它们；保留 pages 作兼容回退，语义「content 优先」。
- **`fetchDetail` 内联把视频流一次性解出成 `video.url`（否决）**：详情加载慢一拍、`auth_key`
  早解析早过期（video_site_a 视频/图片 URL 均带时效签名）；懒播放占位 + `fetchPlayUrl` 现算与
  ADR-0020「懒解析、按需现算」一致。
- **复用 `episodes` 块承接单视频（否决）**：episodes 是「线路 × 剧集」结构，video_site_a 是单视
  频无线路；硬塞产生单线路单集，表达虚假。video 块自身支持懒播放更直接。

## Consequences

- 数据模型（`runtime/src/types.ts`）：`ReadingPage.content?`、`video` 块的 `url` 变可选并
  + `target?: { action:'play' }`、`PageJumpTarget.play` 语义注释泛化；devconsole 模型桥继承。
- 宿主行为：simulator `reading` 动作输出 content 块、`play` target 语义放宽；渲染侧（devconsole
  已落地）对无 url 的 video 块渲染播放占位（`VideoLazyBlock`，点击懒调 `play`）、reading 优先
  渲染 content（`ReadingPagePreview` 按 content 逐块渲染，缺则回退 pages 成图）；iOS 渲染侧待补。
- 词表：CONTEXT.md 新增**章节内容 (Chapter Content)**（ReadingPage.content）、**播放占位
  (Play Placeholder)**；修订**播放解析 (Play Resolution)** 语义（出流入口 URL 泛化）、
  **阅读页 (ReadingPage)**。
- video_site_a 插件：`fetchDetail` 对小说 URL 出全文 text blocks；视频详情 URL 出「无 url 的
  video 播放占位 + `target.play`」；`fetchPlayUrl(detailUrl)` 实现 packed JS 解包 → `detail_play`
  接口 → m3u8（复用 `$lib.CryptoJS`，无需新宿主能力）。

**Status**: accepted

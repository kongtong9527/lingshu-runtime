# 线路 × 剧集数据模型与播放页解析契约（episodes block + fetchPlayUrl）

2026-08 为接入影视站（`www.movie_site_c.xyz`，macCMS/mytheme）发现缺口：详情页的「线路」×「剧集」两级结构无法用现有 `ContentBlock` 表达，且**剧集 URL 指向播放页而非 m3u8**——必须进入播放页解析才能拿到最终视频流，现有插件契约（`video` block 直出流地址）不支持。决策：

1. **`ContentBlock` 新增 `episodes` 块**：`{ type:'episodes', lines:[{ name, episodes:[{ title, url, target? }] }], poster? }`。剧集 `url` 为播放页 URL，并带 `target: { action: 'play', url }`；`PageJumpTarget` 新增 `{ action:'play', url }`。走 blocks 判别联合而非顶层字段——devconsole/iOS 的渲染管线（`BlockRenderer`/`BlockView` 均 switch on type）自动获得渲染位。
2. **`LingshuPlugin` 新增可选 `fetchPlayUrl(url)`**：入参播放页 URL，返回 `PlayUrlResult { url, referer?, platform?, poster?, duration? }`（字段与 `video` block 对齐，暂不加 `headers`——播放链路请求头走宿主既有 HLS/代理机制，踩坑再升级）。宿主在用户点选剧集时**懒调用**，结果按会话缓存（播放页 URL → 结果），详情页会话常驻期间复用。
3. **播放形态：就地播放（Inline Playback）**：点剧集后详情页 episodes 块内直接渲染播放器，不跳独立播放页路由（devconsole 单页 Web 最轻；iOS 全屏播放页留作演进方向）。
4. **线路策略：只出可解析线路**：网盘线路（夸克/UC/百度等分享页，宿主内无法出流）在 `fetchDetail` 按线路名/来源启发式剔除，`fetchPlayUrl` 侧再设防护（`from` 命中网盘即明确报错，不冒充能力）。
5. **simulator CLI 新增 `play <播放页URL>` 动作**；`--fixture` 仅覆盖播放页抓取跳（自定义播放器/解析接口两跳需在线验证）。

## Considered Options

- **顶层 `ArticleDetail.playSources` 字段（否决）**：不走 blocks 判别联合，devconsole/iOS 渲染管线需另开分支，与「正文 = blocks 单一事实来源」背离。
- **复用 `chapter` 块 + metadata 标记（否决）**：chapter 是「章节阅读」语义（阅读页 URL），强塞播放页语义污染渲染与跳转模型。
- **`fetchDetail` 一次性全量解析所有剧集（否决）**：电视剧上百集 × 多线路，慢且网盘线路无解；懒解析（点哪集解哪集）与既有「播放器装配」会话级按需模式一致。
- **播放页当作详情页骗 `fetchDetail`（否决）**：语义错位，无 referer/缓存契约；播放页有自己的解析链路。
- **获取最终流的两种形态（取舍记录）**：movie_site_c 的 NBY 线路经 artplayer 页 + 解析接口（signature=MD5(t)）+ AES 解密产出 **MP4 直链**（带 `auth_key` 时效 ~1h），非 m3u8——`PlayUrlResult.url` 支持 m3u8 与直链两种形态，宿主播放器按 URL 自动处理。

## Consequences

- 数据模型（`runtime/src/types.ts`）：`ContentBlock`/`PageJumpTarget`/`LingshuPlugin`/`PlayUrlResult` 同步扩展；devconsole 与 iOS 的模型桥继承。
- 宿主行为：episodes 块渲染线路 tab + 剧集网格 + 播放器区；`play` 动作进 simulator CLI 与 devconsole RunBar；播放页解析链路出错判宿主侧/插件侧按 `docs/agents/plugin-host-boundary.md`。
- 词表：CONTEXT.md 新增**线路 (Play Line)、剧集 (Episode)、播放页 (Play Page)、播放解析 (Play Resolution)、episodes 块 (Episodes Block)、就地播放 (Inline Playback)、网盘线路 (Cloud-Drive Line)**。
- 已知后置：~~iOS 端 episodes 渲染与全屏播放导航、自动连播~~（已由 ADR-0022 落地）、网盘直链解析（需云盘登录态/签名逆向，成本高）、`/show/` 筛选路由的 Cloudflare 放行（当前 Node 侧被拦，筛选/排序能力未声明）。

**Status**: accepted
# 视频清晰度（Video Quality）：多 URL 契约 + master playlist 自动菜单

2026-08 为接入 zw.movie_site_a.top（movie_site_a）发现缺口：该站视频的「清晰度」存在于两个
不同层——(1) **master playlist 层**：短视频（`plateId=4`）的 Twitter CDN m3u8 实测是
master playlist，含 3 档（480×270 / 640×360 / 1280×720）+ 3 档音频，前端 FluidPlayer
用 hls.js 自动构建清晰度菜单（720p/360p/270p/auto）；(2) **数据层**：该站的三源
（`videoUrlOne/Two/Three`）本质是**线路**不是清晰度（前端标签：全球线路/优化线路/高清），
AV 板块只有单码率 S3 m3u8。现有 `video` block 与 `PlayUrlResult` 只有单一 `url`，宿主
播放器也无清晰度切换 UI——「视频有多档清晰度可选」这个事实无法表达。决策：

1. **契约：`video` block 与 `PlayUrlResult` 双端增加可选 `qualities?: VideoQuality[]`**
   （`VideoQuality = { label: string; url: string; width?: number; height?: number }`）。
   `url`（顶层）仍是默认档；缺省 `qualities` = 单档（旧插件零改动）。`qualities` 服务于
   「每个清晰度独立 URL」的站点形态（多 URL 型），插件显式声明各档。
2. **宿主：master playlist 自动清晰度菜单（通路二，无需插件声明）**：devconsole
   `VideoPlayer` 用 hls.js 解析 master playlist（`MANIFEST_PARSED` → `data.levels`），
   >1 档时自动渲染清晰度切换按钮（当前档 + 下拉列表，含「自动」），点选设
   `hls.currentLevel`（原地切档，不重建播放器）；≤2 档不显示菜单（与 FluidPlayer 行为
   一致）。显式 `qualities` 优先于自动菜单（两者互斥）。两条通路合称「清晰度双通路」。
   语义统一为「点选**锁定**所选档」。
3. **不做**：不为「线路」（同视频多个 CDN 源）新增切换 UI——线路是站点容灾设计，
   插件在 `fetchPlayUrl` 内部择优（镜像源优先）即可，不暴露给用户。
4. **simulator 契约同步**：`types.ts` 定义 `VideoQuality` 并挂在 `video` block /
   `PlayUrlResult`；CLI `play` 动作返回透传；devconsole `types.ts` re-export。

## iOS 落地（2026-09，含一次事实修正）

部署目标 iOS 17.0。`LingshuModels.swift` 新增 `VideoQuality`（+ `qualities?` 双端
decodeIfPresent 容差）；`VideoSession` 演进为**多档会话**：

- **会话建模（内容身份）**：会话持「集身份」（= 初始/默认档 URL）与「当前装配 URL」；
  `sessions` 字典与播放位置记忆均按集身份索引，**切档不换会话、不丢位置**。
- **显式通路**：切档 = 会话内重建装配（换 `activeURL`，`resumeTime` 续播，倍速/位置保留）。
- **自动通路**：宿主自解析 master playlist（`HlsPlaylist.variantRecords` 解析
  `EXT-X-STREAM-INF` 的 RESOLUTION/BANDWIDTH，带 UA/Referer 拉取、失败静默），切档 =
  重建装配**单变体合成 master**（见下「切档无声修复」），严格锁定所选视频档
  （自定义 scheme 管道天然支持；语义与 devconsole `currentLevel` 一致）。
- **UI（2026-09 改版：弹层 → Menu 选择器）**：沉浸模式控件行「清晰度」胶囊按钮 = 与
  顶栏倍速同款 `Menu` 单选（胶囊显示当前档名；菜单逐档展开、当前项勾选，选定即切档）；
  无独立弹层/背板（与选集面板天然互斥）；锁定态跟随隐藏。
- **选择生命周期**：会话内跨集保持（`PlayerChromeState.selectedQualityID`，pop 即弃），
  与倍速语义一致；detail video 块（form① preloadedResult）透传 `qualities`。

**事实修正（Q1 原推荐被 SDK 否决）**：初稿自动通路拟用 `AVPlayerItem.variantPreferences`
实现「播放中偏好切档」——实测 iOS SDK 中该 API 只是音频保真 NS_OPTIONS（iOS 14.5+），
**不存在「选择特定 variant」的公开 API**（`AVAssetVariant.URL` 要到 iOS 26 才有），
故自动通路改为「master 解析 + media playlist 直装重建」（用户确认，见 Considered）。
代价：切档短暂重缓冲（1~2s）；收益：语义与 hls.js `currentLevel` 完全一致（锁定）。

**切档无声修复（2026-09 实测修正）**：`直装 variant media playlist` 在 **discrete-audio
站点**（Twitter CDN 型 master：`EXT-X-MEDIA` 独立音频组 + 纯视频 variant，movie_site_a 即此
结构）会丢音频——variant playlist 只有视频段，AVPlayer 装配后「有画无声」。修复：切档
改为重建装配**单变体合成 master**——`HlsPlaylistRewriter.syntheticVariantMaster` 保留
原 master 的 `EXT-X-MEDIA`（音频/字幕组）声明与全局密钥标签，只留所选 variant 一条
`#EXT-X-STREAM-INF`；子资源 URI 全部重写为自定义 scheme；合成文本由
`HlsResourceLoader.syntheticMasters`（URL 字典）直接响应，AVPlayer 装配后自动选默认
音频轨并严格锁定所选视频档（muxed 站点无音频组，合成结果等价直装，两形态统一走合成）。
master 原文/最终 URL 由会话缓存（`fetchMasterVariants` 成功时），合成 URL 在 master
同目录派生（`__lingshu_variant_<N>.m3u8`，去 query）且 `pendingSyntheticMaster` 不清空
（失败重试/重新装配仍能注册）。

## Considered Options

- **只加 `qualities` 契约、宿主播放器不自动解析（否决）**：master playlist 型站点（本插件、
  以及大多数 HLS 站）的清晰度在播放列表层，插件逐档声明不现实（档位由上游决定、每次请求
  解析成本高）；契约 + 自动解析双通路才覆盖两种站点形态。
- **只做播放器自动菜单、不加契约（否决）**：多 URL 型站点（每个清晰度独立 m3u8/MP4 地址）
  无法表达——清晰度菜单只能由插件数据驱动。契约字段是一次性成本，为未来站点留通用路。
- **`qualities` 做成必填（否决）**：全部旧插件（bilibili-hot/manga_site_a/movie_site_c/video_site_a/short_site_b）
  都要改；「单档」是合法的缺省语义（AV 板块即此形态），可选字段向后兼容。
- **为「线路」建独立切换 UI（否决）**：本项目目标是「播放」而非「运维多 CDN」；线路在
  `fetchPlayUrl` 内择优（Q5 决策，镜像源优先）是站点侧容灾，用户无需感知。
- **iOS 自动通路用 `variantPreferences` 偏好切档（实测否决）**：Apple 无「选 variant」
  公开 API（variantPreferences 为音频保真标志；AVAssetVariant.URL iOS 26+；preferredPeakBitRate
  只是码率上限近似、无锁定语义、菜单标签仍需解析 master）——改走「master 解析 +
  media playlist 直装重建」（iOS 落地节），与显式通路共用装配 URL 切换机制。
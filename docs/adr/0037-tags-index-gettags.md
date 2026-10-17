# 标签索引页：`getTags()` 与 `kind:'tags'`（kvs_site_b 首发）

2026-09，kvs_site_b `/tags/` 为全量标签云（首字分组 + 计数，876 组 / 2537 标签），既有契约表达不了：`fetchList` 产 `ListItem[]`（视频条目，拿来装标签是语义扭曲）、`CategoryGroup` 是查询维度（数千标签塞筛选组会冒充能力且无法渲染）、`getExplore` 是视频聚合 feed。决策：新增一级契约——插件可选导出 `getTags(): Promise<TagGroup[]>`（`TagGroup={title:首字原文, tags:[{name,url,count?,target:{action:'list',url}}]}`，组序/组内序忠于 DOM，不做拼音排序），`getListings()` 经 `{ name:'標籤', url:'/tags/', kind:'tags' }` 暴露（`url` 仅展示/回退，验证走 `getTags`）；`fetchList({url:'/tags/'})` 明确报错指引到 `getTags`，标签视频列表仍走 `tag=<slug>` / `/tags/<slug>/` 页面通道。

## Considered Options

- **复用 `fetchList({url:'/tags/'})` 返回标签条目（零宿主改动）**：无需新方法，但 `ListItem` 必带封面/详情语义，标签无封面，宿主瀑布流渲染空卡；且索引与视频列表同动作，宿主无法区分渲染。否决。
- **塞进导航树 `children`（全量标签作叶子）**：数千叶子，`getListings` 体积爆炸、宿主树渲染即卡；且标签云高频增量，静态声明即过期。否决。
- **塞进 `Listing.filters` / `getCategories`**：筛选是查询维度（`key=id` 编码进 `category`），标签云是导航入口（点进是列表页）；混用即冒充筛选能力。否决（延续 ADR-0021「不冒充能力」）。
- **新增 `getTags()`（采用）**：与 `getExplore/getCategories` 同构（可选导出、缺失即无能力），simulator（`types.ts:TagItem/TagGroup/TagIndex` + `tags` 动作 + `listings` 命令 `kind:'tags'` 验证）、DevConsole（`Capabilities.tags` + `RunRequest.action`）同步；iOS/DevConsole 渲染留后（先契约，后渲染）。

## Consequences

- CONTEXT.md：新增**标签索引页 (Tag Index)** 词条，与**标签 (Tag)** chip 区分。
- simulator：`tags` 动作（`run <id> tags [--fixture]`，fixture 覆盖单次索引抓取）、`listings` 命令对 `kind:'tags'` 叶子调 `getTags` 验证（空索引判失败），`kind` 开放字符串未知降级不变。
- kvs_site_b：`getListings` 首项 `首頁 kind:'explore'`（`getExplore`：正在觀看无 viewMore + 最新影片 viewMore 指 `channel=latest-updates`，各 12 条）+ 末项 `標籤 kind:'tags'`；`version 1.1.0`；fixtures 新增 `home.html/tags.html`（离线可验）。
- 渲染留后：iOS `DiscoverView`/`ListView` 的标签云 UI 与 DevConsole `ListingsPreview` 的 tags 条目渲染本次不做，契约先行。

**Status**: accepted

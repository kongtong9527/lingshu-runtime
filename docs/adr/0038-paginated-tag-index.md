# 分页标签索引：`getTags(context?)` 与 `TagResult` 信封（video_site_b 首发）

2026-09，video_site_b `/tags.php?sort=views|videos&page=N` 为排序式扁平标签云（每页 120 个、至少 4 页，无首字分组），ADR-0037 的 `getTags(): Promise<TagGroup[]>`（无参单次全量、首字分组假设）装不下：无参一次只能拿第一页（静默丢数据），扁平页硬塞首字分组是语义扭曲。决策：`getTags` 泛化为 `getTags(context?: TagContext): Promise<TagIndex | TagResult>`（`TagContext={page?, sort?}`，`sort` 为站点排序标识原文；`TagResult={groups, pagination?}`，扁平云每页单组、标题为排序页标识如 `HOT 第1页`），宿主判 `Array` = legacy 全量、`Object(含 groups)` = 分页；三端同步——simulator（`tags` 动作 `--page/--sort` + `listings` 命令信封归一化）、DevConsole（`RunRequest.sort` + `tagsGroups/tagsPagination/loadMoreTags` 累加器 + `TagsPreview` 加载更多 + RunBar `page/sort` 输入）、iOS（`RunEngine.execute` 新增 `sort` 参 + `decodeTagGroups` 双形态解码 + `TagsContentView/TagsView` 服务端排序行与加载更多）。旧插件零改动（无参调用返回 Array，宿主按 legacy 渲染）。

## Considered Options

- **插件内循环拉全量（零宿主改动）**：`getTags()` 内部翻完 4+ 页合并返回，但页数随站点增长而变慢、排序语义丢失（只能取默认 HOT）、失败一页则全云失败。否决（把宿主该做的分页转嫁给插件，且不可持续）。
- **标签云走 `fetchList` 目录页（零新契约）**：`ListItem` 是视频条目（封面/详情语义），标签无封面，瀑布流渲染空卡；且索引与视频列表同动作宿主无法区分渲染。否决（ADR-0037 已否决同款）。
- **新增独立方法（如 `getTagPage`，采用信封的替代）**：多一个方法多一套探测/验证/渲染分支，而 `getTags(context?)` 与 `getExplore(context?)`（listings-first 多探索页，ADR-0030）同构——可选参数泛化，旧插件忽略多参零改动。否决独立方法，采用 context 泛化。
- **`getTags(context?)` + `TagResult` 信封（采用）**：与 ADR-0001 分页信封（`PaginationMeta` 判别联合）复用同一分页器语义，`hasMore` 驱动三端「加载更多」；`sort` 与目录页筛选（ADR-0021）正交——排序是索引页属性（换序换会话重拉），筛选是目录页属性。

## Consequences

- CONTEXT.md：新增**分页标签索引 (Paginated Tag Index)** 词条，与**标签索引页 (Tag Index)**（首字分组全量）并列为标签索引两种形态；**标签索引排序**词条扩展服务端排序与本地显示排序的区分。
- simulator：`TagContext/TagResult` + `getTags(context?)`；`tags` 动作 `--page/--sort`（无参时零参调用，legacy 行为不变）；`listings` 命令 `kind:'tags'` 信封归一化（打印 `[page=N hasMore=]`）。
- DevConsole：`TagsPreview` 双形态归一化 + 分页累加 + 加载更多；iOS：`TagResult/decodeTagGroups` + 服务端排序行（默认/HOT/视频数）+ 加载更多；本地过滤/拼音排序保持零请求显示层不变。
- video_site_b：`getTags` 分页（`views|videos`，120/页）+ `getListings` 末项 `{ name:'标签', url:'/tags.php', kind:'tags' }`；`version 1.0.0`；fixtures 新增 `list/tags/detail/detail-multi/search.html`。
- kvs_site_b：零改动，legacy Array 路径回归通过（simulator tags fixture 876 组离线可验）。

**Status**: accepted

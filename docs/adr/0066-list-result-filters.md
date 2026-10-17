# 列表页自声明筛选组（ListResult.filters）

2026-10 接入 `video_site_c.com/zh` 发现缺口：站点有两类「落地列表页自带筛选」，**选项只有抓到页面才知道**：

- 工作室作品页 `/zh/studio/room/<slug>` 的**题材**滑块按工作室不同
  （redhot 31 项 + 所有题材、modelmediaasia 28 项、sky-high 4 项，
  catwalk/mugen/1pondo 等则整块不渲染），且它**只存在于 SSR HTML**：
  同一 URL 带 `X-Requested-With` 拿到的 JSON 模板里没有这个滑块。
- 同页排序档是站点另一套 key（`newest|popular|rating`，走 `?sorting=`），
  与视频目录页的 `justadded|popular|top`（走 path `/<sort>/all`）**不是同一套**。

既有契约两处都表达不了：

| 既有 | 时机 | 为什么不够 |
|---|---|---|
| `Listing.filters`（ADR-0021） | 进页**前**（listings 页签） | 那是目录页条目自己的属性；从**卡片**点进的工作室页不在 listings 里 |
| `PageJumpTarget.list.filters`（ADR-0021 型） | 跳转时 | 卡片渲染时才知道的信息；工作室卡上只有「340 部视频」，题材列表不在卡片数据里 |

若硬把「站点全部题材」塞进卡片的 target，等于给每个工作室发一份它并没有的选项集
（**假能力**）；若每次都多抓一份 SSR 只为声明筛选，则在插件侧无法回避却也不该由宿主猜测。决策：

1. **`ListResult` 增加可选 `filters?: CategoryGroup[]`**：列表页自己声明「本页可切换的筛选维度」，
   与 `Listing.filters` / `PageJumpTarget.list.filters` **同型同编码**（ADR-0014 组合串、
   ADR-0019/0021 宿主渲染与合并口径全部复用，零新形态）。插件在 `fetchList` 里连同 `items`
   一起返回；宿主在落地列表页渲染筛选行，用户组合后并入 `category` 再调 `fetchList`（同一 `url`）。
2. **三个来源的优先级（宿主侧唯一口径）**：结果自声明的 `ListResult.filters` 非空时用它，
   否则回退 `PageJumpTarget.list.filters`，再否则 `Listing.filters`（页签场景）。
   「页面实际长什么样」优先于「跳转时以为的样子」——同一次进入只有一条渲染路径。
3. **选项只声明站点真实存在的**：工作室页无题材滑块 ⇒ 该组不声明、只留排序组；
   视频目录页/分类列表页的排序与内容档从**站点自己的控件**读（video_site_c 两处 key 不同就写两组）。
4. **不新增惰性导出**：`getListingFilters(listingKey?)` 一类按页拉取的导出仍不做
   （ADR-0021 第 5 条的判断不变）；本次是**结果信封**多带一个字段，宿主无需额外往返。
5. **零回归**：缺省/空 = 本页无筛选，旧插件与旧宿主按原行为走
   （Swift/TS 侧均为可选字段容差解码）。

## Considered Options

- **把题材选项塞进卡片 `target.filters`（否决）**：卡片在工作室索引页，题材列表要到工作室页
  SSR 才知道；伪造一份全局题材 = 用户选了站上不存在的值，违背「不冒充能力」。
- **每次 `fetchList` 都多抓一份 SSR、宿主按 `Listing.filters` 的旧路径渲染（否决）**：
  选项来源与渲染时机仍是「进页前」，从卡片进入时拿不到；且筛选组与结果不同源，会漂移。
- **新增 `getListFilters(url)` 导出 + 宿主二次调用（否决）**：每次进列表页多一次往返 +
  加载态与竞态；结果信封里顺带带回来是零额外成本的（video_site_c 那份 SSR 本来就要抓来出题材）。
- **让插件把筛选组塞进 `ListItem.target` 或 `metadata`（否决）**：metadata 不渲染（红线）、
  `target` 是单条目跳转语义，都会把「页面属性」记成「条目属性」。
- **本字段替代 `PageJumpTarget.list.filters`（否决）**：静态场景（manga_site_a 星期筛选）跳转时
  就知道选项，进页即渲染、少一次闪烁；两者并存、按上面第 2 条取优先级。

## Consequences

- 数据模型：`runtime/src/types.ts` `ListResult.filters?`；iOS `ListResult.filters?`
  （`CategoryGroup` 复用）；devconsole `store.listFilters` + `ListPreview` 渲染。
- 宿主行为：落地列表页筛选行来源变为「结果优先 + 跳转回退」；应用筛选仍是
  `mergeListingCategory(base, filterCategory)` → 同 url 重跑（ADR-0014 编码不变）。
  iOS `ListView` 把结果筛 selected 组落在 `@State resultFilters`，**只在非空时覆盖**——
  应用筛选重建模型、重载期间沿用上一份，筛选行不闪、`safeAreaInset` 不抖。
- 插件侧（video_site_c v1.1.0）：`video-list` / `studio-index` / `model-index` / `studio-videos`
  四条通道声明筛选组；工作室「题材」选项按工作室缓存 24h（`$lib.storage`），
  冷路径并发抓 SSR + XHR，热路径只抓 XHR。
- 词表：CONTEXT.md 新增**列表页自声明筛选 (List Result Filters)**。
- 技能：`references/data-model.md` 记三层来源与红线；`pitfalls.md` 记
  「题材只在 SSR HTML」「同族通道的排序 key 可能不是同一套」「详情卡勿写 `action:'list'`」三条。

**Status**: accepted

# 标签索引页消费 `Listing.filters`：`TagContext.sort` 退役、改 `category`（kvs_site_a 首发）

2026-10，kvs_site_a `/tags/` 页右上角有站点自带的「Videos | Albums」内容类型开关（切到
`/albums/tags/`，与 `/categories/`、`/models/` 两页同款），而 `kind:'tags'` 叶子在 ADR-0037/0038
里被定为**不消费 `Listing.filters`**（索引页属性只有 `sort`）——站点真实存在的能力因此无法声明，
用户看到「标签」页签比站点少一枚筛选。同一时期还暴露一个既有缺陷：iOS 宿主给**所有** tags 页
渲染一枚写死的服务端排序行（`TagServerSort`：默认/HOT/视频数，那是 video_site_b 一个站的档位），
对 kvs_site_b/manga_site_d/kvs_site_a 是**假能力**（点了没用，违反「不冒充能力」红线）。

决策：

1. **`Listing.filters` 对 `kind:'tags'` 叶子同样生效**（与 `kind:'list'` 同语义、同 ADR-0014 编码）。
   宿主在标签索引页渲染筛选栏，选中项与 `Listing.category` 合并成组合串后透传。
2. **`TagContext.sort?: string` 退役，改 `category?: string`**——与 `fetchList` 的
   `context.category` **同口径同编码**（`key=id`，`&` 连接，空筛选不传键），只是落到的
   context 字段不同。服务端排序不再是独立通道：它就是一个普通的筛选组（video_site_b 的
   `views|videos` 改为 `filters: [{key:'sort', type:'select', …}]`，插件从 `context.category`
   解析 `sort`）。
3. **宿主删掉硬编码排序行**（iOS `TagServerSort` 枚举、DevConsole `Selected.sort`、CLI `--sort`）；
   无 `filters` 的 tags listing = 纯标签云、零筛选/排序行。

## Considered Options

- **保留 `TagContext.sort`，另加 `category` 两条通道**：改动最小，但同一件事（页级筛选）有两条
  通道，宿主渲染出「硬编码排序行 + 筛选栏」两排控件，且假排序行继续留在所有 tags 页上。否决。
- **给 tags 单独造一个 `TagFilterGroup` 契约**：与 `CategoryGroup` 同型，纯重复；宿主/DevConsole
  要多一套渲染与编码分支。否决（ADR-0014 组合串就是通用编码，没有 tags 专属语义）。
- **把类型开关做成两个 tags listing（「标签」+「图集标签」）**：零宿主改动，但站点那侧是一枚
  开关、不是一个新页签；页签数量膨胀且用户找不到「筛选」在哪。否决（与「忠于站点结构」冲突）。
- **`Listing.filters` 对 tags 生效 + `sort` 退役（采用）**：一条通道、一套编码，顺手拆掉宿主里
  单站硬编码的假能力；代价是 video_site_b 需同步迁移（本仓库三端同版本升级，见 data-model.md）。

> 与 ADR-0037 的关系：0037 否决的是「**把标签本身**塞进 `Listing.filters`/`getCategories`」
> （标签云是导航入口，不是查询维度）——本条不触碰该结论。这里说的是**索引页自己的页级筛选**
> （内容类型开关），与分类/模特索引页的「类型」开关同一形态。

## Consequences

- 契约：`runtime/src/types.ts` 的 `TagContext`（`sort` → `category`）、`Listing` 注释
  （tags 条目消费 filters）、`getTags` 注释；`getTags` 的三种调用形态（无参 legacy / 分页 /
  带筛选）保持不变，旧插件零改动。
- simulator：`tags` 动作 `--sort` → `--category`（`RunOptions.category` 一字段两用途，由动作分派）；
  `listings` 命令对 tags 叶子打印筛选摘要并**用 `getTags` 验证组合串**，且筛选验证从
  「每组首选项」改为「每组前 2 个非空 id 选项」（类型开关的第一项往往就是 listing 自己那页，
  只验首项会漏掉真正换页的那一支）。
- DevConsole：`Selected.sort` 删除（`category` 一字段两用途）、RunBar tags 分支改渲染 `category`、
  BFF `plugin-service.ts` 去掉 `sort` 透传。
- iOS：`RunEngine.execute` 的 `sort` 参 → `category`；`TagsView`/`TagsContentView` 删硬编码排序行、
  改渲染 `Listing.filters`（复用 `FilterRowView`/`FilterSheetView`）；`Route.tags` 带
  `filters`/`category`；合并实现提为 `FilterState.mergedCategory(base:filters:)` 供列表页与
  标签索引页共用。`MARKETING_VERSION` 0.1.30。
- 插件：video_site_b 1.0.3（tags listing 声明排序筛选 + `getTags` 读 `context.category`）；
  kvs_site_a 1.10.0（五处 listings 补齐页级筛选，见下）。
- 术语：CONTEXT.md「标签索引排序」词条改判（服务端排序 = 索引页自己的筛选组，不再是独立 context 字段）。

**Status**: accepted

# 预设目录页可携带专属筛选组（Listing Filters）

2026-08 为接入影视站（`www.movie_site_c.xyz`，macCMS/mytheme）发现缺口：该站 5 个分类
（tid=1..5）每个都有自己的筛选维度与选项——电影 28 题材/27 地区、电视剧含「欧美/国产」
题材、综艺**没有地区与语言组**。这是「listings 每一项的筛选都不相同」的实物：目录页的
筛选是目录页的属性，不是全站统一的搜索筛选。现有契约 `Listing = { name, category }`
无法表达，宿主（devconsole/iOS）浏览 listings 页签时也没有筛选入口（ADR-0015 明写
「本组件不含筛选入口」）。决策：

1. **`Listing` 增加可选 `filters?: CategoryGroup[]`**：每个预设目录页可内嵌自己的筛选组
   （复用 ADR-0014 的 `CategoryGroup` 类型与值编码，不发明新形态）。`getListings()` 静态
   声明，一次到位；宿主在浏览该目录页时渲染筛选控件，用户组合后把启用项并入 `category`
   再调 `fetchList`。
2. **筛选状态不持久化**：listings 保持「目录页」语义，筛选是每次进入的临时组合——与搜索
   模式（`lingshu.filters.<pluginID>` 按源持久化，ADR-0015）刻意不同。目录页筛选若持久化
   会产生「源 × 目录页 × 组」三维状态矩阵，价值低、实现贵。
3. **`fetchList` 同时消费两类来源的筛选**：搜索模式的 category（已有）与目录页合并后的
   category（`mergeListingCategory`：listing.category 为基础，筛选组追加在后，同名键后者
   覆盖）。插件无需分辨来源——都是 ADR-0014 查询串。
4. **只声明站点真实存在的选项**：movie_site_c 的筛选组从 `/type/<tid>.html` 页面内嵌筛选块逐
   链接提取（含各 tid 差异）；站点筛选路由 `/show/` 全系被 Cloudflare JS 挑战拦截（403，
   Node/iOS 沙箱无法执行挑战）时，`fetchList` 对筛选查询**如实报错**而非静默降级——延续
   「不冒充能力」原则：选项是真的，请求侧不可达就明说。
5. **方向：getListings 内嵌静态 filters，而非新增按 listing 惰性拉取的导出**。movie_site_c 每
   tid 约 50-60 个选项，静态内嵌体积可接受；选项随站点变化时改插件即可（与
   `getCategories` 的静态声明同源）。站点筛选选项巨大或高度动态时再演进惰性拉取。

## Considered Options

- **新增 `getListingFilters(listingKey?)` 惰性导出（否决）**：契约为每次切页签增加一次异步
  拉取 + 加载态，复杂度高；movie_site_c 的筛选选项是静态目录页内容，无动态性。留作未来演进方向。
- **选项目录页复用全局 `getCategories`（否决）**：movie_site_c 各 tid 筛选不同，全局声明无法表达
  「综艺无地区/语言」这类差异；且该站搜索页无筛选维度、`getCategories` 本就缺位。
- **listings 筛选与搜索模式共用持久化状态（否决）**：语义本就不同（目录页临时组合 vs 搜索
  模式恢复），共用会造成「综艺页选了地区」污染「电影页」的错乱。
- **筛选应用后静默回退 `/type/` 列表（否决）**：用户选了「地区=大陆」却看到全量列表，
  是无声的假能力；如实报错让用户知道站点反爬拦截，可改站内搜索。
- **filters 走 `{ action:'list' }` 之外的跳转模型（否决）**：目录页筛选就是加强版 list，
  复用 category 查询串与既有 `PageJumpTarget { action:'list' }`，零新跳转。

## Consequences

- 数据模型（`runtime/src/types.ts`）：`Listing` 增加 `filters?: CategoryGroup[]`；
  devconsole 模型桥 (`src/types.ts` re-export) 自动继承。
- 宿主行为：devconsole `ListingsPreview` 页签卡内渲染筛选控件（抽取共享的筛选状态逻辑
  `filterState.ts` + `FilterGroupEditor`，与 `CategoriesPreview` 复用），选择后
  `mergeListingCategory` 合并 category 再进 list（ADR-0014 编码）；simulator `listings`
  命令打印各目录页筛选摘要，并用「category + 首选项」组合验证 fetchList 能消费（站点反爬
  拦截时提示不判失败，与「不冒充能力」一致）。
- 词表：CONTEXT.md 新增**目录页筛选 (Listing Filters)**，并修订**预设目录页 (Preset
  Listing)**（现为可携带筛选的目录页，不再「不是筛选状态」一刀切）。
- ~~已知后置（iOS 发行端）：BrowseContentView 页签不渲染 filters 控件、Swift `Listing` 模型
  需增字段~~（2026-08 已落地）：Swift `Listing` 增 `filters?: [CategoryGroup]`；
  `BrowseContentView` 页签栏下渲染筛选行（复用搜索模式 `FilterRowView` idiom +
  `FilterSheetView`，当前页签无 filters 则收起）；`listModels` 改按 listing id 持有，
  页签内应用筛选 = merged category 换新模型（组合替换，in-flight 结果随旧模型丢弃
  防竞态）；筛选状态浏览会话内页签间保留、不持久化。iOS 端详细取舍见本 ADR 第
  1/2 条与 ADR-0020/0022。
- movie_site_c 插件：`getListings()` 每目录页内嵌真实筛选组；`fetchList` 检测筛选键走 `/show/`
  段位构造（12 段，与站点链接逐字节对齐），403 时带站点信息与替代路径报错。

**Status**: accepted
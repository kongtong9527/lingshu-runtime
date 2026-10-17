# 筛选组联动（Listing.filters 组间依赖）

2026-10，kvs_site_a v1.11.0「分类」页签暴露缺口：站点「类型」（视频/图集）+「排序」两组，
排序档位随类型变化（`avg_videos_rating` vs `avg_albums_rating`、`total_videos` vs
`total_albums`），图集侧自带排序条、视频侧无控件但后端同效。此前三端
（DevConsole `filterState.ts`、iOS `FilterState.swift`、simulator `listings.ts`）全是
独立静态组——各自编码、按 key 合并、全量展示，无条件显隐、无动态选项、无切父清空子。
插件侧只能「单静态组声明图集侧原值 + `fetchList` 按 type 映射」（`mapCategoryIndexSort`）
绕过去，治标不治本。决策：

1. **纯声明式契约**：`CategoryGroup` 新增四字段（与 `getCategories` 同型的共享类型上，
   全局同语义；首轮验证只锁 `Listing.filters` 含 `kind:tags` 页级筛选）：
   `dependsOn?: string`（父 key，单边声明）、`visibleWhen?: { equals: string | string[] }`
   （缺省恒显）、`optionsWhen?: Record<父值, CategoryNode[]>`（缺键/父空回落默认
   `items`/`sections`，命中按单节扁平渲染）、`clearPolicy?: 'always'|'if-invalid'`
   （缺省 `always`）。写后两者无前者即错；`items` 必须是缺省页侧（父空回落语义）。
2. **组间依赖语义**：父按 `key` 寻址（参与联动的 key 同数组内唯一，共享 key 组如 manga_site_a
   6 组 `tagIds` 不得做父/子）；父限 `select`/`sort` 单值组（`check`/`text` 做父即错）；
   切父清空全切片（single/include/exclude/text/ascending）并传递级联，环即错；
   隐藏组不编码、不计角标，变隐藏时同样按策略清（不复活幽灵值）；求值拓扑序
   （声明序只定渲染/编码序）+ 隐藏传递（父隐则后代恒隐）+ 读父原值。
3. **兼容**：纯新增可选字段，老宿主忽略即今天行为；`mapCategoryIndexSort` 类旧映射保留作
   旧宿主/旧串的双向容错。`getCategories` 本次不动（冻结亦不议，另起 ADR 算账）。

## Considered Options

- **命令式回调 `getListingFilters`（否决）**：每次切父多一次异步拉取 + loading/缓存/竞态，
  三处宿主各写一套，与 ADR-0021「静态声明、一次到位」冲突；动态拉取真需要时再演进。
- **布尔小语言 AND/OR/NOT + 多值父（否决）**：交/并/优先级三端必各错一半；v1 只判单值相等。
- **整组变体 `variantsWhen`（否决）**：为不需要的「整组替换（含改 key/type）」付递归代价。
- **合法保留优先（否决作缺省）**：`if-invalid` 留作可选，缺省 `always`——text 无选项集、
  check 半合法时「判合法」三端必分叉。
- **隐藏保留状态（否决）**：与无条件清空打架；隐藏即不存在，可见才编码。
- **父空并集/父空隐藏（否决）**：并集 id 撞车无定义；恒显子初始空白一片。回落默认 `items`
  是唯一让老宿主与新宿主看到同一套的语义。
- **运行时白屏报错（否决）**：插件 bug 不得变宿主崩溃；硬失败只在 CLI 发布门。
- **`getCategories` 一并退役（否决，本次不议）**：搜索页状态三件套
  （组来源、空词路径、持久化归属）会拖超载；Q8 作废。

## Consequences

- 数据模型（`runtime/src/types.ts`）：`CategoryGroup` 加四字段 + 新类型
  `CategoryVisibleCondition` / `CategoryLinkageClearPolicy`；iOS `LingshuModels.swift`
  同构（含单/数组双形态 `VisibleEquals` 解码）；DevConsole 经 simulator `dist` 自动继承。
- 静态校验（`runtime/src/filters-linkage.ts`，Q12 矩阵）：5 类 error
  （未知父、无边有条件、check/text 父、环、联动 key 重）→ `listings` 命令判失败
  （exitCode=1）；映射缺父值/多余键/`equals` 指未知值 → warn 回落默认集。
  运行期三端容差（未知父恒显、环截断、缺边忽略）。
- 宿主行为：DevConsole `filterState.ts` 求值器（`isGroupVisible`/`resolvedLinkedItems`/
  `visibleGroups`/`applyLinkageClear`）+ 三预览过滤可见组 + `FilterGroupEditor` 扁平渲染；
  iOS `FilterState.swift` 同算法 + `FilterRowView`/`FilterSheetView` 同款过滤/解析/清子；
  simulator `listings` 摘要标注 `→父key` + 逐父值组合探针（上限 8 组，只提示）。
- kvs_site_a 分类页翻面：排序 `items` 切视频侧（缺省页）+ `optionsWhen{video,album}`，
  `mapCategoryIndexSort` 留作容错；旧宿主恒看视频侧（缺省侧正确，不错序）。
- 测试：validator 单测 + DevConsole 求值器单测 + iOS 镜像同案 + listings 逐父值探针。
- 词表：CONTEXT.md 新增**筛选组联动**；skill `data-model.md` CategoryGroup 节 +
  `listings.md` 规则 16 同步；三宿主 AGENTS 各一行红线；iOS `MARKETING_VERSION` +0.0.1。

**Status**: accepted

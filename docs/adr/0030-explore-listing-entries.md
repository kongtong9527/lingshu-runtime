# 探索页条目：iOS 内容页统一走 listings（listings-first）

2026 修订 iOS 源主页结构：**listings 决定一切内容页形态**。

既往结构（ADR-0015）里「首页」是固定页签 0（有 `getExplore` → 探索流，否则默认列表），
`getListings()` 只承载其余目录页签；`getExplore()` 零参数、每源一份 feed。由此产生三个
缺口：

1. **「首页」被宿主强占**：插件的首个页签永远被宿主合成（探索流/默认列表），插件无法自
   己决定浏览入口的排列组合——想「把探索流放第二」做不到，想「首页就是列表页」也要先
   经过宿主合成逻辑。
2. **探索页只能有一个**：`getExplore()` 零参 = 每源一份 feed。混合站（video_site_a 的视频/
   新闻/小说/合集）希望「同一源多个探索型首页」（如全网推荐 + 单分区gossip头条）无法表达。
3. **内容页通道不统一**：目录页走 listings、探索流走固定首页，两种「内容页」两套规则。

决策：**iOS 插件内容页统一走 listings**——listings 非空时浏览页签 = `getListings()`
逐条按 `kind` 分派（列表页 / 探索页 / 导航树），**不再固定显示「首页」**；listings 为
空（未导出或返回空数组）才回退原首页行为（探索流/默认列表）。

## 决策

1. **探索页条目**：`Listing` 新增语义 `kind: 'explore'`（开放字符串，无需新导出/新动作）。
   该条目的内容形态 = `getExplore(context)` 返回的 `ExploreSection[]`，不是 `fetchList`
   列表。**不消费 `category`/`filters`**（feed 无目录页筛选语义；`Listing.filters` 仍
   是列表页属性）。
2. **多个探索页**：`getExplore(context?: { url?: string })` 增加可选上下文，宿主持有
   explore 条目的 `url` 逐条透传为 `context.url`；插件按 context 分支返回不同分区。
   无 `url` 的 explore 条目 = 默认探索页（等价零参调用）。旧插件忽略多参零改动。
   多个 explore 页 = 多写一条带不同 `url` 的条目。
3. **iOS 分派**：`DiscoverView` 页签 = listings 逐条——分组结点（children）→ 导航树；
   `kind: 'explore'` → 探索页内容；其余 → 列表页。**listings 为空时才渲染「首页」兜底**
   （有 `getExplore` → 默认探索页；纯 list 插件 → 默认列表），且此时无页签栏。
   每条 explore 页独立内容状态（按 listing.id，与列表页签 `listModels` 同构），
   **isActive 门控懒加载**（多探索页不并发打爆反爬），下拉刷新各自生效，返回复用
   （ADR-0007）语义不变。
4. **导航树叶子**：`kind: 'explore'` 的叶子可 push 独立探索页（新路由 `AppRoute.explore`，
   pluginID + title + url），深链 `lingshu://explore?url=` 后置。
5. **全量同步**：契约（`simulator/types.ts` 的 `ExploreContext` 与 `getExplore` 签名）、
   simulator（`explore` 动作 `--url` 透传 + `listings` 命令对 explore 叶子调 `getExplore`
   验证）、devconsole（`ListingsPreview` explore 条目渲染与打开）、iOS（RunEngine /
   DiscoverView / 路由）、规则文档（SKILL / data-model）同步落地。
6. **插件迁移为必要条件**：拥有 `getExplore` 的插件必须在自己的 `getListings` 里声明
   explore 条目，否则 iOS 不再展示其探索内容。已迁移：manga_site_b（「推荐」）、manga_site_a（「发现」）、
   movie_site_a（「推荐」）各 1 条默认探索页；video_site_a（「推荐」默认 + 「gossip头条」
   `url:'news'` 多探索页示范，`getExplore` 按 context 分支过滤分区）。

## Considered Options

- **保持固定首页 + 零参 getExplore（现状）**：宿主强占首个页签、每源一份 feed，插件
  无法自定浏览入口组合。否决。
- **宿主自动补 explore 页签（有 getExplore 但 listings 无 explore 条目时）**：平滑但
  「统一走 listings」不彻底——宿主越权替插件做取舍，又与「不在固定显示首页」矛盾。否决。
- **`ExploreSection` 加稳定 id + 条目带 `sections: string[]` 声明分区（宿主一次调用
  过滤）**：插件改动小（`id = title` 已有弱标识，需新增稳定 id + 全插件补字段），但
  多个探索页只共享一次请求、同一份数据，做不了「多接口多首页」。否决，采用 context
  透传（与 ADR-0025 页面通道同一哲学：任意探索页无需新契约）。
- **iOS 先行、契约后置**：破坏性契约窗口内一次做完最省（DevConsole 是验证客户端，
  契约不一致会让插件开发者无法在 devconsole 闭环验证 explore 条目）。否决，全量同步。

## Consequences

- CONTEXT.md：新增**探索页 (Explore Page)** 词条；「search 页」等词条中「首页」语义
  修订为「listings 空时的兜底首页」。
- 插件侧：SKILL/data-model 把「探索内容必须经 listings 的 explore 条目暴露」写成规范；
  `explore` 动作的 `--url` 文档化。
- iOS：`DiscoverView` 不再硬编码「首頁」页签（`BrowseTabsView` 删除固定项）；
  `ExploreContentView`（页签/兜底共用）新增、`ExploreView`（push 独立页）新增——**后者已由 ADR-0067 删除**（页签化后探索页叶子就地渲染，无生产者；带 url 的探索页深链将来走页内定位，勿再加 push 页）；
  `AppRoute.explore` 加入路由矩阵与 `AppView` 分派。深链矩阵（ADR-0012）不变
  （`lingshu://explore` 仍垫底发现页）。
- simulator：`listings` 命令对 `kind:'explore'` 叶子改走 `getExplore` 验证
  （带 url = 探索页标识透传），不再调 `fetchList`。
- 修复既有 bug：`RunEngine.sampleThreadStack` 的 `state`/`addresses` 引用原在
  `#if arch(arm64)` 块外，x86_64 slice 编译必炸（generic simulator 构建暴露）——
  PC/FP 遍历与 dladdr 符号化整体移入 arm64 块，x86_64 提前返回占位。

**Status**: accepted
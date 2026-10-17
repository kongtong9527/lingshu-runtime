# 页面通道与导航分组（Page Channel + Navigation Groups）

2026-08 为接入 video_site_a.com（视频/gossip新闻/小说/精选合集混合站）发现缺口：该站一级导航
约 50 项、混合 6 种形态——分类列表页（`/comic/index/video?category=<slug>`）、预设搜索跳转
（`/comic/index/search?keyword=<kw>`）、短视频分类（`/melonshort/cat/<slug>`）、新闻分类
（中文路径 `/黑料gossip/<分类>/推荐`）、AV 主题筛选（`?model=&type=&order=`）、电影合集
（`/moviesets`），且**每类导航落页结构各不相同**、原生即带下拉子菜单。精选合集（moviesets）
是「合集首页 → 可选类型页（分类/人物/品牌…）→ 合集详情（视频列表）」的两级专题嵌套。

现有入口契约只有两条：`getListings()` 固定目录页签（每个 listing 关联一个 category 查询串
+ 目录页专属筛选，ADR-0015/0021）与 `getExplore()` 首页固定分区 feed——两者都无法表达
「**任意页面 URL 驱动的列表**」与「合集/专题的**递归嵌套**」，也无法承载 50 个页签。
决策：

1. **页面通道（Page Channel）**：`PluginContext` 增加可选 `url`；`fetchList` 语义从「分类
   筛选驱动」放宽为「任意页面 URL / 分类查询串驱动」——插件按 `context.url`（或 category）
   分派到对应的列表解析逻辑（视频列表/新闻列表/小说列表/合集页/短视频/AV/SSR 搜索页）。
   `category` 仍是最小可用路径（旧插件零改动）；`url` 是「开放式入口」：任何站点、任何页面，
   只要插件能解析「一个 URL → ListItem[]」即成立。这是本次「支持各种各样的网站」的核心裂变
   点——以后新增页面形态不再需要新契约，只要插件能把它解析成 ListItem[]。
2. **入口条目（Listing）扩展为导航树**：`Listing` 增加可选 `url`（页面通道入口，与
   `category` 二选一或并存，宿主优先 `url`）、`kind`（`list`/`search`/`series` 等，开放
   字符串、宿主降级渲染为普通目录项）、`children?: Listing[]`（分组/子菜单：承载站点的下拉
   子菜单与「首页聚合之外的深导航」）。`getListings()` 从「扁平页签」升级为「可嵌套导航树」；
   `filters`（ADR-0021）仍是叶子目录页的属性，语义不变。
3. **递归列表（任意深导航/合集）**：`ListItem` 增加可选 `target?: PageJumpTarget`；
   `PageJumpTarget` 的 `{ action: 'list' }` 增加可选 `url`。合集/专题条目带
   `target:{ action:'list', url }`，宿主点击即以该 URL 再调 `fetchList` → 返回仍是
   `ListItem[]`（可再带 target）→ **递归天然支持任意深度**（第 3/4/5… 级合集专题无需模型
   改动）。默认（无 target）仍是进详情页 `fetchDetail`，向后兼容。「list 即页面」与页面通道
   （决策 1）同一抽象：进列表 = 用任意页面 URL 调 fetchList，进详情 = 用 URL 调 fetchDetail。
4. **导航呈现的主/辅分工**：~50 个一级导航不全做页签——`getExplore()` 承接首页聚合分区
   （视频推荐/热门排行/黑料gossip/精选合集等），`getListings()` 只承接「精选合集两级 + 各内容
   域入口」（分类/新闻/小说/短视频/AV），预设搜索类导航不占页签、降级为搜索框直达。导航如何
   拆主/辅由插件声明，宿主只渲染树——不替站点做取舍。
5. **图片加密粒度的放开口子（低优先级，不铺开）**：规则文档承认「`imageEncryption` 可降级
   覆盖（按 ListItem/块/图携带各自解密参数）」的口子。video_site_a 本身全套图共用一套参数（AES-
   128-CBC，与 short_site_a 同 key/iv），现有单套 `metadata.imageEncryption` + 宿主解密直接覆盖、
   零新能力开发；粒度放开口子只为未来「每图参数不同」的站点预留，不进类型、不进契约主条款。

## Considered Options

- **保持 `Listing = { name, category }`、为每类导航外挂新导出（否决）**：新增页面形态就要新
  导出，与「灵活多站」目标背道而驰；页面通道一条契约收拢所有「URL → 列表」是更少的原则。
- **把所有一级导航平铺成 listings 页签（否决）**：50 个页签无法承载；预设搜索类导航价值低，
  应留搜索框而非占页签。
- **新增独立 `series` 内容类型与 `SeriesDetail`（否决）**：合集详情本质是「又一个 URL →
  内容列表」，与分类/翻页同构；造新类型徒增渲染与跳转分支。递归列表足以表达任意层级。
- **`getExplore()` 承担全部一级导航（否决）**：explore 是「发现 feed」语义（一次性聚合分区），
  不是可任意深钻的导航树；多级合集在 explore 里无法呈现。
- **`ListItem.target` 只支持「再进详情」不放开任意 URL（否决）**：深层级合集必须能表达「条
  目点开是又一个列表」，不放开发不了任意深度。

## Consequences

- 数据模型（`runtime/src/types.ts`）：`PluginContext.url`、`Listing.url/kind/children`、
  `ListItem.target`、`PageJumpTarget { action:'list' }` 增 `url`；devconsole 模型桥自动继承
  （渲染缺口见后置）。
- 宿主行为：simulator `list` 动作新增 `--url` 选项（页面通道）；`listings` 命令递归验证
  `children` 导航树、对带 `url` 的目录页用 `fetchList({url})` 验证（`category` 仍按 ADR-0021
  验证）；`PageJumpTarget.list.url` 与 `category` 二选一交给 fetchList。
- 词表：CONTEXT.md 新增**页面通道 (Page Channel)**、**入口条目 (Listing)** 修订为可带
  `url/kind/children` 的导航树结点、**递归列表 (Recursive List)**（ListItem.target）。
- video_site_a 插件：`getExplore()` 首页聚合；`getListings()` 返回「精选合集（moviesets 两级）+
  新闻分类 + 短视频分类 + 小说/AV 入口」的分组树，合集条目带 `target:{action:'list',url}`；
  `fetchList` 按 `context.url`/`category` 分派六类导航的 SSR 解析（含 `?page=N` 与路径 `/N`
  两种分页）。
- 已知后置：~~devconsole 的 ListingsPreview 渲染 `children` 分组树与 `url` 通道（当前仅扁平
  页签 + category）~~（已落地：`ListingsPreview` 递归导航树 + url 优先、`toJumpPatch` url 形态、
  `ListPreview`/`ExplorePreview` 尊重 `ListItem.target`、url 全链路透传，见 `devconsole/AGENTS.md`）；
  iOS `Listing`/`ListItem` 模型桥补字段。两者均不阻塞插件开发（simulator 闭环已验证）。

**Status**: accepted

# 分类筛选类型化（Category Filter Types）

借鉴同类阅读器的 FilterType（`title`/`author`/`select`/`sort`/`check`/`genre`/`group`）与社区源集合的筛选消费方式，把 Lingshu 的分类筛选从「全部按 chip 单选/多选渲染」升级为**按类型声明的通用筛选器**：`CategoryGroup` 增加组级 `type`（核心集 `select`/`check`/`text`/`sort`，开放扩展）与 `canExclude`/`placeholder`/`canAscend`/`defaultValue`；值统一编码进 `category` 组合查询串（`,` 多值、`-` 前缀排除、`,asc|desc` 方向后缀）。旧插件不写 `type` 等价 `select`，`allowMultiple: true` 等价无排除语义的 `check`，双向兼容。宿主（DevConsole）改为「筛选表单 + 应用筛选」一次提交；iOS 本期不动，后续浏览页按该形态重构时接入。

**Status**: accepted

## Considered Options

- **保持现状（全部 chip）**：manga_site_a 30+ 标签只能平铺、manga_site_b 排序无升降序、文本/排除类站点无法表达。否决。
- **全面对齐其命名改名 `Filter`/`FilterGroup`/`getFilters()`**：语义最干净，但 6 个插件 + DevConsole/iOS 双宿主 + 文档全量破坏性迁移，收益仅是命名纯度。否决，保留 `CategoryGroup`/`CategoryNode`/`getCategories()` 名称。
- **type 挂节点级（每个选项一个 widget）**：同类阅读器的 genre 是每标签一个 checkbox；但 Lingshu 的「组=维度」结构天然把一组选项视为一个 widget，节点级会让「一组标签」变成 30 个并列筛选器，宿主编排复杂。否决，采用**组级 type**。
- **照搬其全集（title/author/genre/group 独立类型）**：`title`/`author` 与 `text` 同 widget、`genre` 与 `check` 同 widget（多出 `canExclude`+`id`，Lingshu 的 `items[].id` 已覆盖）、`group` 嵌套可用既有 `CategoryNode.children` 表达。归并为四元核心集，另留 `semantic` 扩展位。采用。
- **值编码**：单键 `key=id`（select）、`key=id1,id2,-id3`（check）、`key=<encodeURIComponent>`（text）、`key=id[,asc|desc]`（sort）。不采用 JSON 编码或独立方向参数键：保持单 key、可往返、可读；插件解析规则简单。
- **排除能力默认关闭**：`canExclude` 默认 `false`，站点实测不支持排除就不声明（manga_site_a 多标签实测返回 500，tagIds 保持 `select`）。不冒充站点能力。

## Consequences

- 插件契约：`runtime/src/types.ts` 的 `CategoryGroup` 新增字段；值编码规则进入 `<项目根目录>/lingshu-skills/lingshu-plugin-dev/references/data-model.md`。
- DevConsole `CategoriesPreview` 按类型渲染四种控件并统一「应用筛选」；未知类型降级按 `select` 渲染，不拒绝新插件。
- iOS 本期不改（Swift Codable 忽略未知字段）；后续 iOS 浏览页按该形态重构时接入类型化筛选与 listings。
- 已落地的顺带项：`manifest.json` 为全部插件补充 `lang`/`nsfw`/`capabilities` 声明（对照社区源 `source.json` 的 lang/nsfw 与能力探测）。
- 后续展望（不本期实现）：listings 浏览页签（可直接表达为「预设筛选态」`{ name, category }`，复用本 ADR 的查询串契约）、源模板体系（mangastream/madara 式多源共享 parser）、`modify_image_request` 全局图片请求头、真实 URL 深链（`handle_url`）。
- 上述「listings 浏览页签」已由 ADR-0015 定案进入实施；措辞修正为「预设目录页」而非「预设筛选态」，category 仍复用本 ADR 的组合查询串契约。

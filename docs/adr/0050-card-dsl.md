# 列表项卡片 DSL：插件自定义列表卡片（通用自由 DSL）

现状：插件只能填 `ListItem { title/summary/coverUrl/url/... }`，iOS 卡片是宿主写死的三种（`ListItemRow` 左图右文、`ItemCard` 竖卡、瀑布流 cell）。不同站点想表达的卡差异极大（横图视频 + 角标/时长/播放量、竖海报 + 集数、动态图文 + 多图宫格、人物圆头像），宿主写死即天花板。Egern 的 Widget DSL（`widget/stack/text/image/spacer/date`）只解决桌面小组件，不解决列表卡。

## 决策（2026-09 grill-with-docs 五轮确认）

1. **通用自由 DSL（Q6=B）**：不做枚举卡片类型。插件按需排版，宿主做安全钳制 + 降级。枚举看似可控，但覆盖不了 7 类目标卡，功能即无意义。
2. **新 DSL 与 Egern 脱钩**：只借思路不借名字，根叫 `card`。元素集 = Egern 六件套 + 新增 `avatar`（圆形）/`grid`（多图宫格）/`pill`（胶囊）/`actionBar`（赞转评一行）/`overlay`（压图徽标，位置枚举非自由坐标）。
3. **每项自带现算 DSL（Q8=B）**：`ListItem.card?: CardDSL`，`fetchList/search` 每项直接带算好的 JSON（文字已填好）。模板预编译留后——动态卡（图数不定、角标有无不定）用模板难表达。
4. **节点可点但限动作（Q9）**：节点可带 `target`，第一版只开 `default`（走整卡行为）/`noop`（纯展示）。关注/赞等写侧禁，只做跳转。
5. **安全钳制 + 整卡回退（Q10/Q20）**：节点数 ≤50、嵌套深 ≤5、图片数 ≤6、文本默认标题 2 行描述 3 行 pill 单行（`maxLines/minScale` 可覆盖，超长截断不撑高）；DSL 根非法才整卡回退老样式，单图坏就地占位不重排；根带 `version: 1`，未知元素跳节点 + 日志。
6. **高度宿主算（Q11）**：插件只给比例（`16:9/3:4/4:3/1:1/2:3/circle`），不写绝对 px；宿主按宽度反推 + 文本行数算高。瀑布流复用（`UICollectionView`）靠此不跳动。
7. **颜色抄 Egern（Q12）**：固定串 + `{light,dark}` + 语义名（`$textPrimary` 等映射宿主 `DSColor`）。深浅切换不翻车。
8. **数字宿主格式化（Q13）**：插件给原始值（秒/次数/时间戳），DSL 用 `{value, format: duration/count/relative/date/datetime}`，宿主统一格式化。多端一致。
9. **图片管线继承（Q14）**：每 `image/avatar` 可选自带 `transport/decrypt`，缺省继承整卡（即现有封面 `metadata` 那套）。
10. **契约只加可选字段（Q15）**：`ListItem.card?`，无入口声明，有即渲染、无即回退，老插件零改动，老宿主忽略即兼容。
11. **预览必同步（Q16）**：DevConsole/simulator 做布局正确性预览，iOS 真机验终效。无预览则 B 不可用。
12. **无障碍自动拼串（Q19）**：宿主自动拼（标题 + 作者 + 时长），插件可用 `accessibilityLabel` 覆盖。

## Considered Options

- **枚举 4 种 cardType（videoLandscape/posterPortrait/feedPost/personCircle）**：可控但封死扩展，7 张目标卡稍变即需发版。否决。
- **模板 + 数据分离（`getCardLayout` 一次 + 每项纯数据）**：省流量好缓存，但条件逻辑（最后一格 +N、多图数量不定）难表达。留后优化，不作 v1。
- **插件自拼字符串（时长/播放量拼好）**：省事但多语言与一致性崩。否决。
- **自由坐标 overlay**：不同屏宽必错位，命中测试与无障碍难做。否决，改位置枚举。

## Consequences

- `runtime/src/types.ts`：`CardDSL` 等类型 + `validateCardDSL` 轻校验（节点数/深度/图片数）+ 单测。
- `lingshu-skills/lingshu-plugin-dev/references/card-dsl.md`：插件侧契约全文；`data-model.md` 的 `ListItem` 加 `card?` 并互引。
- iOS：`LingshuModels.swift` 加 `CardDSL` 解码（未知节点跳过不炸整卡）+ `DesignSystem/Components/CardView.swift` 递归渲染 + `ListItemRow`/瀑布流 cell 接入（有 card 走 DSL、无走老卡）+ `ios/docs/card-dsl.md` 宿主细节。
- DevConsole：`CardPreview.tsx` 递归预览 + `ListPreview` 接入（有 card 走 DSL）+ `devconsole/docs/card-dsl.md`。
- `CONTEXT.md`：`列表项卡片/卡片DSL/覆盖徽标/整卡回退` 四词条。

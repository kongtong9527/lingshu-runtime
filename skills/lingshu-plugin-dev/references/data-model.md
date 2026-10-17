# 数据模型参考

数据模型定义在 `runtime/src/types.ts`。插件返回的数据必须符合以下结构。

## ListItem — 列表项

```typescript
interface ListItem {
  id: string                  // 插件内唯一 ID
  title: string               // 标题
  summary?: string            // 摘要/描述
  coverUrl?: string           // 封面图 URL
  coverWidth?: number         // 封面原始宽（像素）。能拿到就提供：瀑布流首帧按真实比例排版，无需等图加载完 reflow
  coverHeight?: number        // 封面原始高（像素）。同上
  url: string                 // 详情页 URL（传给 fetchDetail）
  publishTime?: number        // 发布时间戳（毫秒）
  metadata?: Record<string, any>  // 自定义扩展（播放数、作者、图片传输参数等）
  target?: PageJumpTarget     // 点击行为（ADR-0025）。缺省 = 进详情页；合集/专题类条目带
                              // { action:'list', url } → 宿主以该 URL 再调 fetchList（递归列表，
                              // 支持任意深度嵌套导航/合集）
  tags?: ListTag[]            // 标题下方标签行（可选，老卡专用）。字符串简写归一 { name }；
                              // 空/缺省隐藏整行，宿主最多取前 6 个，单行横滑。全文见下文「列表标签与封面角标」
  badges?: CoverBadges        // 封面四角信息位（可选，老卡专用，有 card 时忽略）。只压图，
                              // 无封面不渲染，纯展示不可点。全文见下文「列表标签与封面角标」
  card?: CardDSL              // 自定义列表项卡片（可选，ADR-0050）。有即渲染、无即回退老卡；
                              // 每项自带现算 DSL JSON。全文见 `card-dsl.md`
}
```

## 列表标签与封面角标（ListItem 老卡扩展，非卡片 DSL）

标题下方标签行（图：`#阿嬤 #風流 #往事` 胶囊）与封面四角信息位（时长/连载/类型等）
走 `ListItem.tags` / `ListItem.badges`，**不是卡片 DSL**：有 `card` 的项走 DSL 渲染，
新字段忽略；无 `card` 的老卡（瀑布流卡 + 列表行，横滑小卡不显示标签行）才渲染。

```typescript
// 标签：纯字符串展示名；图标复用卡片 DSL 图标表（eye/clock/play/…/none）；
// 颜色复用 PillStyle 语义（出现即完整，缺键 = 无该属性），缺省宿主单色（三端同值），带色覆盖；
// 随机/分组配色由插件显式声明各标签颜色（全传同色即统一外观）
type ListTag = string | {
  name: string
  url?: string                // 有则可跳，无则纯展示
  target?: PageJumpTarget     // 有则优先内部导航（{ action:'list', url } 进列表）
  icon?: string
  backgroundColor?: CardColor
  textColor?: CardColor
  borderColor?: CardColor
}

// 角标文本：直串或格式化值（时长传秒、次数传数、时间传毫秒戳，宿主统一格式化，与卡片 DSL 同语义）
type BadgeText = string | { value: number; format: 'duration' | 'count' | 'relative' | 'date' | 'datetime' }

// 角标单槽：字符串简写归一 { text }；颜色缺省宿主半透明黑底白字；
// opacity 缺省 1（只淡底不淡字）；形状恒小胶囊，不开放圆形；center 不开放
type CoverBadge = string | {
  text: BadgeText
  icon?: string
  backgroundColor?: CardColor
  textColor?: CardColor
  opacity?: number
}

// 四角（一角一槽，单槽单行超长截断，不堆叠）
interface CoverBadges {
  topLeft?: CoverBadge
  topRight?: CoverBadge
  bottomLeft?: CoverBadge
  bottomRight?: CoverBadge
}
```

```javascript
// 示例
{
  id: 'v123', title: '我與阿嬤的風流往事',
  coverUrl: 'https://example.com/covers/1.jpg',
  url: 'https://example.com/v/123',
  tags: [
    '#阿嬤',
    { name: '#風流', target: { action: 'list', url: 'https://example.com/tags/風流' } },
  ],
  badges: {
    bottomRight: { text: { value: 750, format: 'duration' } },  // 12:30
    topLeft: '連載中',
  },
}
```

红线：

- 标签 `text` 只许纯字符串（格式化值是角标的）；标签点击有跳转信息则拦截跳列表
  （与详情页 tags“有 target 优先、url 退回退”同构），无则纯展示**不冒泡整卡**。
- 角标纯展示不可点；无 `coverUrl` 不渲染；右上遇已读标并排、底部避开进度条。
- **时间要「看见」就得进角标**：`ListItem.publishTime` 只是**数据字段**（检索/历史用），
  瀑布流卡不渲染它（只有兼容保留的旧列表行 `ListItemRow` 渲染）——想让用户在列表里看到发布时间，
  必须写角标（右上与已读标自动避让并排，是四角里通常空着的那格）。只写 `publishTime` =
  用户永远看不见（不报错、不是失败，只是没显示）。角标**按站点给的是绝对日期还是相对文案二选一**：
  - 站点给**绝对日期/时间戳** → `badges.topRight = { text: { value: ms, format: 'relative' } }`，
    宿主统一出「…前」（刚刚 / N分钟前 / N小时前 / N天前 / N个月前 / N年前，任何跨度都不回落具体日期）。
  - 站点给的**本来就是相对文案**（KVS 的 `div.added` = `2 days ago`）→ **直接换词成中文串直给**
    （`badges.topRight = '2天前'`；`1 week ago` 写「1周前」、`12 months ago` 就写「12个月前」，
    保持站点原文）。**不要**换算成毫秒戳：① 再交宿主 `relative` 会被**二次分档**磨掉原文；
    ② 同一批数据一旦进 `publishTime`，宿主详情头部/旧列表行按**绝对**时间渲染（`formatTimestamp`），
    相对文案反推出来的戳会变成凭空的「2026年10月9日 00:00」。**宁缺字段也不伪造时间**——
    `ArticleDetail.publishTime` 同理，只填站点真给的绝对日期（详见 pitfalls.md 同名条目）。
- **同族：条目数量/热度等计数也只认角标**（video_site_c 实例，2026-10）：索引卡上的「340 部视频」
  「5661 部视频」写进 `metadata.itemCount` **等于没写**——用户看不到。要显示就走
  `badges.bottomLeft = { text: { value: 340, format: 'count' }, icon: 'play' }`
  （宿主统一格式化：`340`→「340」、`5661`→「5.7K」、`12978`→「1.3万」）。
  **图标要选对语义**：条目**条数**用 `play`，**播放量/浏览数**才用 `eye`（kvs_site_a）——
  两者都是数字、都能进同一槽位，用错图标等于给用户一个错误标签。
  站点原文（「340 部视频」）照旧进 `metadata.countText`：**展示位与数据位分走两条通道**，
  与 `views`/`viewsText` 同规矩。别给不该套的卡硬套：`views` 位放的是**番号**（DVD `MCBD-12`）
  或**张数**（写真集 `222张写真`）时，语义与「视频条数」不同，按实际情况决定图标或干脆不下角标。
- 老插件无两字段零改动（可选字段，缺键宿主按缺省渲染）。

## ArticleDetail — 文章详情

```typescript
interface ArticleDetail {
  title?: string              // 标题（可选；缺省时宿主用列表页传入标题 → sourceName 回退，不强制返回）
  sourceName: string          // 来源名称（如 "B站热门"）
  sourceUrl: string           // 来源链接
  publishTime?: number        // 发布时间（毫秒）
  author?: string             // 作者
  coverUrl?: string           // 封面图（可选；缺省时宿主用列表页传入封面兜底）
  blocks: ContentBlock[]      // 正文内容块（至少 1 个）
  metadata?: Record<string, any>  // 自定义扩展；图片传输参数见下文，图片加密参数见 image-encryption.md
}
```

> 详情头部去重（插件侧责任）：宿主头部展示标题与封面，插件**不得**在正文重复返回
> 首块同文 heading、与封面同 URL 的 image 块（iOS 正文原样渲染、不再过滤）；
> video/episodes 块的 `poster` 保留（播放占位底图，缺省时宿主用解析封面兜底）。
>
> 详情信息补全（插件侧责任，manga_site_d 案例）：`fetchDetail` 应提取页内**全部可用元信息**——
> 分类/作者/日期/页数/热度（阅读量）/留言数/收藏数/标签/简介/封面/相关推荐，
> 有则收录、无则省略、**不伪造**。计数类走双通道：带 `title` 的 `text` 信息区
>（如 `{ type: 'text', title: '信息', content: '分類：…\n日期：…\n熱度：…' }`，`\n` 宿主保留换行）
> 供展示 + `metadata`（`{ category, pageCount, views, comments, favorites }`）供检索/排序。
> 多形态详情页（卡片式/文章式/播放器式）各形态的选择器/正则分别取数，
> 同一字段多形态各写一条 fallback，不要只调通一种形态就收工。

## ContentBlock — 内容块

判别联合，`type` 字段决定结构：

| type | 必填属性 | 可选属性 | 说明 |
|------|----------|----------|------|
| `text` | `content: string` | `title?: string` | 纯文本段落。`title` 可选：区标题——带标题时宿主渲染为标题区样式（与 tags/选集/章节同款分区标题 + 正文），用于**独立语义的文本区**（如简介 `{type:'text', title:'简介', content: desc}`，样式统一）；缺省保持裸段落（旧插件零改动）。`content` 内换行（`\n`）宿主保留换行显示（`pre-wrap` 语义），不得缩为一行 |
| `heading` | `content: string`, `level: 1\|2\|3\|4\|5\|6` | — | 标题 |
| `link` | `content: string`, `url: string` | `target?: PageJumpTarget` | 链接。默认为外链（浏览器打开）；带 `target` 时宿主优先内部导航（与 tags/recommendations 同款「有 target 优先、url 退为外链回退」） |
| `chapter` | `content: Array<{title: string; url: string}>` | `coverUrl?: string`（条目级章节封面，缺省回退纯文字）、`target?: PageJumpTarget` | 章节列表（漫画/小说专用，含标题和阅读页 URL）。有 `coverUrl` 的项宿主渲染横向缩略图行，无图项纯色占位对齐行高；全块无图回退纵向文字列表 |
| `episodes` | `lines: Array<{name: string; episodes: Array<{title; url; target?}>}>` | `poster?: string`（块级播放占位底图）、`coverUrl?: string`（条目级剧集封面，缺省回退纯文字） | 影视「线路 × 剧集」：每条线路含若干剧集，**剧集 url 指向播放页（非媒体 URL）**，宿主点选后经 `fetchPlayUrl` 就地解析播放（ADR-0020）。有 `coverUrl` 的线路宿主渲染横向缩略图行（左 16:9 图右标题），无图项纯色占位对齐；全块无图回退文字宫格 |
| `tags` | `content: Array<{name: string; url: string}>` | `title?: string` | 标签/chip 流（标签名称与标签页链接）。`title` 可选（2026-08）：区标题，缺省宿主渲染「标签」；用于**独立语义的 chip 组**（如 manga_site_c 作者区 `{type:'tags', title:'作者', content:[作者 chips]}`——样式同标签、语义独立，作者项 target 指向作者列表页） |
| `tagGroups` | `groups: Array<{name: string; content: Array<{name: string; url: string}>}>` | `title?: string` | 标签分组块（详情页一行一种类型，类型名动态）。`title` 为块大标题，缺省宿主渲染「标签」；`groups` 每项为一个类型行，`name` 为类型名（动态字符串，如 女性/男性/其他，站点各异），`content` 为该类型下的标签项（与 `tags` 项同形，跳转语义同 `tags`）。空 `groups` 时宿主隐藏整块 |
| `recommendations` | `content: Array<{title: string; url: string; coverUrl?: string}>` | `title?: string`, `viewMore?: PageJumpTarget`, `coverUrl?: string` | 推荐内容列表（详情链接与可选封面）。`title`（2026-10）：块级区标题，缺省宿主渲染「推荐」——站点推荐维度各异（相关推荐 / 同模特 / 同分类），如实命名由插件声明，它同时是「更多」落地页导航栏标题的来源。`viewMore`（2026-10）：块级「更多」跳转，与 `ExploreSection.viewMore` 同型同语义，见下文「块级『更多』入口」 |
| `image` | `url: string` | `caption?: string`, `width?`, `height?` | 图片 |
| `video` | `target: { action:'play', url }`（url 缺失时） | `url?`, `poster?`, `duration?`（秒）, `platform?`, `referer?`, `qualities?` | 视频。ADR-0026：`url` 变可选——缺省时**必须**携带 `target:{ action:'play', url }`（url 为详情页/播放页 URL），宿主渲染为播放占位，点播时懒调 `fetchPlayUrl` 现算出流；`referer` 仅在 CDN 校验 Referer 时设置（详见 `video-playback.md`）。ADR-0029：`qualities` 为多清晰度档位（每个清晰度独立 URL 的站点用），`url` 为默认档；master playlist 多码率的站点**无需声明**（宿主播放器自动解析 levels 渲染清晰度菜单） |
| `gallery` | `images: Array<{url; caption?}>` | — | 图片集（横滑缩略图 + 点开全屏预览，预览复用同一 `url`）。**给原图链**：站点若「缩略图 ≠ 原图」（如 kvs_site_a 视频截图 `img[data-original]` 480×270 vs `a[href]` 1920×1080），而该组图**没有**阅读页通道时，取缩略图 = 点开还是糊的（同样 200 + 合法 JPEG，不报错）；与 ReadingPage.pages 同一条红线。有阅读页通道的（如漫画）预览图可给缩略图、原图留给 `pages` |
| `divider` | — | — | 分割线 |

`link.url`、`chapter.content[].url`、`chapter.content[].coverUrl`、`episodes.lines[].episodes[].url`、`episodes.lines[].episodes[].coverUrl`、`tags.content[].url`、`recommendations.content[].url` 以及
`recommendations.content[].coverUrl` 必须是完整的绝对 URL，供宿主直接跳转或代理加载。

`chapter` / `episodes` / `tags` / `recommendations` / `link`（2026-08 扩展）各项还支持可选的 `target`（结构化跳转，见下文「PageJumpTarget」）。**有 `target` 时宿主优先用它驱动内部导航，`url` 退为外链回退**；无 `target` 时沿用 URL 约定（标签 url 的 query → `fetchList` 的 `category`、推荐 url → `fetchDetail`、剧集 url → 宿主按播放页处理、link → 浏览器外链打开）。

**episodes 与 recommendations 的判定**：条目 URL 可经 `fetchPlayUrl` 出流的同站可播清单进 `episodes`（即使站点侧叫「推荐/同社团/播放清单」，anime_site_a 案例），纯导流进详情、无出流能力的才进 `recommendations`。

### 块级「更多」入口（`recommendations.viewMore`，2026-10）

详情页推荐块的「更多」按钮 = `recommendations.viewMore`（`PageJumpTarget`，与发现页分区的
`ExploreSection.viewMore` **同型同语义**）。宿主在块标题右侧渲染「更多」（`title` 缺省「推荐」），
点击进**该推荐维度的列表页**（宿主列表页，`fetchList` 按 `context.page` 驱动无限翻页），
落地页导航栏标题取块级 `title`。

```javascript
blocks.push({
  type: 'recommendations',
  title: '相关推荐',                        // 如实命名维度（缺省宿主渲染「推荐」）
  content: related,                          // [{ title, url, coverUrl? }]
  viewMore: { action: 'list', url: targetUrl, category: 'related=1' }, // 落地通道
})
```

三条纪律：

1. **没有对应列表页就不写**（不冒充）：站点该维度只有一屏、或翻页只存在于站点自己的
   AJAX 里而插件没复刻通道时，省略 `viewMore`；宿主**无 `viewMore` 不渲染按钮**，
   写了却落不了地 = 点开还是那几条的死「更多」，比没有按钮更糟。
2. **`url` 与 `category` 分工**：`url` 必是**真实页面**（落地页的「网站原页」按钮取它，写合成地址
   会指向不存在的页）；`category` 是内部查询串（组合通道选择器、筛选参数）。
   **站方「更多」是 AJAX 锚、`href` 不是地址时**（KVS 站典型：`div#..._pagination > a[href="#more"]`
   只带 `data-block-id` / `data-parameters`），标准落法是 **`url` = 当前详情页**（它才是该块的上下文来源）
   与 **`category` 带一个通道选择器**（如 `related=1`），由 `fetchList` 在这个标记下走片段接口复刻分页
   （kvs_site_a 案例）：列表页第 1 页与详情页首屏那块同序同内容。**详情页就是这类列表在站点上唯一的
   承载页，所以落地页顶栏「网站原页」指的正是它**——站点没有独立列表页，浏览器打开详情页即可
   看到同一维度第 1 页；判据不是「浏览器那一页与列表页逐条相同」（翻到第 2 页后任何站都做不到），
   故**不要**因此隐藏按钮、也不要改指别处（宿主侧口径见 `ios/docs/session-and-navigation.md`「网站原页」）。
   反过来：**拿不出任何真实网页地址的维度就别做「更多」**（同纪律 1）。
3. **分页元数据照实报**：落地通道同样要在 `ListResult.pagination` 里给 `hasMore`——站点末页通常
   不再渲染分页锚（以锚为准），超界页站方回 404/空片段时 `page>1` 收敛为空列表（无更多），
   首页仍照常抛错。

示例：
```javascript
const blocks = [
  { type: 'heading', content: data.title, level: 1 },
  { type: 'image', url: data.cover, caption: '封面' },
  { type: 'text', content: '正文段落...' },
  { type: 'divider' },
  { type: 'video', url: 'https://...', platform: 'bilibili' },
  { type: 'tags', content: [
    { name: '动作', url: 'https://example.com/tag/action' }
  ]},
  { type: 'recommendations', content: [
    { title: '推荐作品', url: 'https://example.com/comics/1', coverUrl: 'https://example.com/covers/1.jpg' }
  ]},
  { type: 'chapter', content: [
    { title: '第523話 下一層（下）', url: 'https://...' },
    { title: '第522話 噬魂泥（上）', url: 'https://...' }
  ]}
]
```

## PageJumpTarget — 结构化跳转目标

插件用 `PageJumpTarget` 显式声明「点这里去哪」，替代隐式的 URL 约定。挂在 `tags` / `recommendations` / `chapter` 内容项的可选 `target` 字段上。判别联合，按 `action` 区分：

```typescript
type PageJumpTarget =
  | { action: 'list'; url?: string; category?: string; channel?: string }  // 列表：url 为页面通道（任意列表页 URL，
                                                          // 宿主以该 URL 调 fetchList），category 为
                                                          // 组合查询串；channel 为通道标识（ADR-0064），
                                                          // 二者至少其一（ADR-0025）
  | { action: 'search'; query: string }     // 搜索
  | { action: 'detail'; url: string }       // 详情页（url 传给 fetchDetail）
  | { action: 'reading'; url: string }      // 阅读页（url 传给 fetchReadingPage）
  | { action: 'play'; url: string }         // 出流入口（url 为详情页或播放页 URL，宿主调
                                            // fetchPlayUrl 解析出最终流；ADR-0020 + ADR-0026）
  | { action: 'categories' }                // 分类页
```

**何时用**：当 URL 约定表达不了跳转意图时（如标签点击要进搜索而非分类列表、或想显式声明跳转目标而非依赖宿主解析 URL query）。老的 URL 约定仍完全可用——`target` 是渐进增强。

```javascript
{ type: 'tags', content: [
  // 结构化：点这个标签去搜索
  { name: '动作', url: 'https://example.com/tag/action', target: { action: 'search', query: '动作' } },
  // 无 target：沿用 URL 约定（query → category）
  { name: '热血', url: 'https://example.com/list?type=rexue' },
]}
```

## ReadingPage — 阅读页（漫画/图片集）

```typescript
interface ReadingPage {
  title: string          // 章节标题（如 "285 大軍撤退"）
  sourceName: string     // 来源名称
  sourceUrl: string      // 阅读页 URL
  pages?: string[]       // 兼容通道：页面图片 URL 列表（漫画/图集）。content 有则优先，缺则停用回退
  content?: ContentBlock[]  // 章节内容块（ADR-0026）：图文任意混排（text/heading/image/link…）。
                            // 单页全文小说直接把正文放这里，无需章节列表
  prevUrl?: string       // 上一章 URL
  nextUrl?: string       // 下一章 URL
  metadata?: Record<string, any> // 自定义扩展；图片传输参数见下文
}
```

通过可选的 `fetchReadingPage(url)` 方法返回。适用于漫画章节、图片集、小说正文（`content`）、
连环画等章节/逐页浏览内容。**单页全文类**（整篇小说/长篇帖文）不必走它——`fetchDetail`
直接出 `text`/`heading` blocks 即可。

> 详情与阅读职责分离（插件侧责任，manga_site_d 案例）：有 `fetchReadingPage` 的漫画/图集站，
> **详情页不得内联阅读页图片**——详情只出 `chapter` 块作入口，图片只经 `fetchReadingPage`
> 返回（去重原则从"标题/封面"扩展到"阅读图"：详情内联全图 = 详情与阅读页重复下载同一批大图，
> 且阅读页失去章节语义）。单话/单图集无章节结构的站，用**单条目 chapter**指向自身
>（`{ title, url: detailUrl, target: { action: 'reading', url: detailUrl } }`，
> title 可缀页数如 `xxx（共10p）`），形态与多章节站一致，宿主零分支。
>
> `pages` 必须是**原图链**，不是缩略图（kvs_site_a 案例，静默失败类）：图集/漫画阅读页里，
> 展示用的 `<img>` 往往是缩略图（`src`/`data-original` 形如 `albums/main/200x150/…`），
> 而外层 `<a href>` 或查看器属性才是原图地址（常带鉴权 token，如 `/get_image/…?i-acctoken=`）。
> 取错**不会报错**——缩略图同样 200 + 合法 JPEG，宿主照常渲染，只是用户看到糊图。
> 故：原图与缩略图分别收（可各自断言），并以「页数与站点声明张数一致」兜底
> （如 `Images: 32` ↔ `pages.length === 32`）。

## PlayUrlResult — 播放解析结果（fetchPlayUrl，ADR-0020）

```typescript
interface VideoQuality {
  label: string                // 档位展示名（如 "1080P"、"720P"、"高清"）
  url: string                  // 该档位视频流 URL（m3u8 或 MP4 直链），原始 CDN URL
  width?: number               // 可选：分辨率宽（像素）
  height?: number              // 可选：分辨率高（像素）
}

interface PlayUrlResult {
  url: string                // 必填：最终可直接播放的视频流 URL（m3u8 或 MP4 直链），保持原始 CDN URL，不要改写成代理 URL
  poster?: string            // 封面图
  duration?: number          // 时长（秒）
  platform?: string          // 平台标识 / 线路来源（如 'NBY'、'video_site_a'）
  referer?: string           // CDN 校验 Referer 时设置（与 video block 的 referer 语义一致）
  qualities?: VideoQuality[] // 多清晰度档位（ADR-0029）：url 为默认档；缺省 = 单档（兼容旧插件）
}
```

> 入参语义（ADR-0020 + ADR-0026）：`fetchPlayUrl(url)` 的 `url` 是「出流入口 URL」——剧集播放
> 页、视频详情页、或任何能解析出最终流的页面。插件可在入口页内多跳解出播放参数再取流。

## 线路 × 剧集（episodes block + fetchPlayUrl）

影视站（典型 macCMS/mytheme）详情页有「**线路** × **剧集**」两级：每条线路含若干剧集，**剧集 URL 是指向播放页的 URL，不是 m3u8**——需进入播放页解析才能拿到最终视频流。本项目自 ADR-0020 起支持：

- **详情页产出 `episodes` block**（只含可解析线路；网盘分享页类线路按线路名启发式剔除，宿主内无法出流，见 SKILL「线路 × 剧集与播放页解析」）：
  ```javascript
  blocks.push({
    type: 'episodes',
    lines: [{
      name: '超清K',
      episodes: [
        { title: '1', url: 'https://www.movie_site_c.xyz/play/3642-4-1.html', target: { action: 'play', url: 'https://www.movie_site_c.xyz/play/3642-4-1.html' } },
        // ...
      ],
    }],
    poster: coverUrl,
  })
  ```
- **`fetchPlayUrl(playPageUrl)`**：可选导出，把播放页 URL 解析为 `PlayUrlResult`（可多跳：播放页 → 播放器配置如 `player_aaaa` → 自定义播放器 → 签名/加密链路）。宿主在用户点选剧集时**懒调用**，结果按会话缓存（URL 常带时效 `auth_key`，详见 `video-playback.md` 的播放页解析节）。
- **不可解析就明确报错**：网盘线/未知加密在 `fetchPlayUrl` 中带来源信息抛错，宿主就地展示错误与重试，不静默。

## 视频清晰度（ADR-0029，双通路）

`video` block 与 `PlayUrlResult` 均可带可选 `qualities: VideoQuality[]`（多 URL 型站点
显式声明各档；`url` 为默认档）。**master playlist（HLS 多码率）站点无需声明**——宿主
播放器解析 levels 自动渲染清晰度菜单（含「自动」ABR）。明确边界：

- **`qualities` 一定是同一内容的画质分档**：每个档位是独立 URL（或同为 m3u8 不同码率）。
  不要把「线路」（同内容的 CDN 源，如「全球/优化/高清」三源）塞进 `qualities`——线路在
  `fetchPlayUrl` 内择优（避开拦截率高的源），不暴露切换。
- 判定站点属于哪条通路：看列表/播放源是否每个清晰度一个 URL（多 URL 型，声明
  `qualities`）还是单个 m3u8 内含 `#EXT-X-STREAM-INF`（master playlist 型，零声明）。
  凭接口字段名猜会错（movie_site_a 案例见 `_fixtures/movie_site_a/analysis.md` §10）。

```javascript
// 通路一：多 URL 型——显式声明各档
blocks.push({
  type: 'video',
  url: hdUrl,                          // 默认档
  qualities: [
    { label: '1080P', url: hdUrl },
    { label: '720P', url: sdUrl },
    { label: '480P', url: lowUrl, width: 854, height: 480 },
  ],
})

// 通路二：master playlist 型——零声明，宿主 hls.js 自动出清晰度菜单
blocks.push({ type: 'video', url: 'https://cdn.example.com/playlist.m3u8', platform: 'xxx' })
```

## ImageTransport — Base64 文本图片传输

当图片 URL 的上游响应不是图片字节，而是 Base64 文本时，插件应在对应返回对象的
`metadata.imageTransport` 中声明传输方式，其中 `encoding` 必须为 `base64-text`。

`metadata.imageTransport` 可用于：

- `ListItem.metadata`：列表封面需要代理解码时使用。
- `ArticleDetail.metadata`：详情封面、正文图片或推荐封面共享同一传输规则时使用。
- `ReadingPage.metadata`：阅读页逐页图片需要代理解码时使用。

宿主代理会严格校验并解码 Base64，再依据图片文件头返回 JPEG、PNG、GIF 或 WebP
图片字节。该传输方式只描述传输编码，不表示图片加密；不应伪造
`imageEncryption.algorithm`、`imageEncryption.key` 或 `imageEncryption.iv`。

## CategoryGroup — 分类分组（类型化筛选）

分类系统通过 `getCategories()` 返回分组列表，每个分组是一个**筛选器 widget**：按 `type` 声明渲染形态与值编码。设计借鉴同类阅读器的 FilterType（见 ADR-0014）。

```typescript
type CategoryFilterType = 'select' | 'check' | 'text' | 'sort' | (string & {})

// 多选展示形态（仅 check 组消费）：checkbox 复选框列表（默认）/ tags 标签芯片云。
// 纯展示切换——状态与值编码与复选框完全一致；开放联合，未知值宿主按 checkbox 渲染。
type CategoryFilterDisplay = 'checkbox' | 'tags' | (string & {})

interface CategoryNode {
  id: string                // 分类参数值（如 "cn", "rexue"）
  name: string              // 分类名称（如 "國漫", "熱血"）
  children?: CategoryNode[] // 子分类（上下级树形结构）
}

interface CategorySection {
  title: string             // 节标题（如 "影片属性"），纯展示，不参与编码
  items: CategoryNode[]     // 本节选项（叶子；规则与 Group.items 相同）
}

interface CategoryGroup {
  name: string              // 分组名（如 "地区", "状态", "题材"）
  key: string               // URL 查询参数 key（如 "region", "state", "type"）
  type?: CategoryFilterType // 筛选类型；缺省视为 select（旧插件兼容）
  items?: CategoryNode[]    // 选项（select/check/sort 使用；text 无选项）；与 sections 二选一
  sections?: CategorySection[] // 分节（可选，与 items 二选一）：单选择器内部分组显示，见下文
  allowMultiple?: boolean   // 兼容别名：等价 type:'check'（无排除语义）；仅在未声明 type 时生效
  display?: CategoryFilterDisplay // 仅 check：展示形态（checkbox 复选框列表 / tags 标签芯片云），缺省 checkbox
  canExclude?: boolean      // 仅 check：true 时宿主渲染每个选项的「包含/排除」切换
  placeholder?: string      // 仅 text：输入框占位文案
  canAscend?: boolean       // 仅 sort：是否支持升/降序；默认 false（固定顺序）
  defaultValue?: { index: number; ascending: boolean } // 仅 sort：默认方向
  dependsOn?: string        // 联动父组 key（ADR-0063）：缺省 = 独立静态组
  visibleWhen?: { equals: string | string[] } // 需配 dependsOn：父值命中才显，缺省恒显
  optionsWhen?: Record<string, CategoryNode[]> // 需配 dependsOn：父值→子选项集，未命中回落 items
  clearPolicy?: 'always' | 'if-invalid' // 需配 dependsOn：切父清空策略，缺省 always
}
```

**筛选组联动（ADR-0063）**：子组随父组值切换选项集、显隐，切父清空子已选（须三者同配，
不要只配其一）。规则：父按 `key` 寻址（参与联动的 key 同数组内唯一，manga_site_a 式共享 key 组
不得做父/子）；父限 `select`/`sort` 单值组；`items` 放缺省页侧（父空回落它）；
切父清全切片并级联，隐藏组不编码。校验见 `runtime listings`（结构错判失败）。
旧宿主忽略新字段即看默认集——`fetchList` 仍须容错映射旧串错配（如 kvs_site_a
`mapCategoryIndexSort`），不静默错序。

**筛选类型**：
- `select`（默认）：单选 chips，值 `key=id`。
- `check`：多选勾选；`canExclude: true` 时每项可切换包含/排除（排除值带 `-` 前缀）。
  `display: 'tags'` = 多选 tag 样式：选项渲染为芯片云（同 select 的 chips 形态、
  多选语义），点击循环 未选→包含→（`canExclude` 时）排除→未选；状态/编码与复选框
  完全一致（纯展示切换，`sections` 分节照常生效，如 anime_site_a 内容标签单组 7 节·tag）。
  未知 `display` 值宿主按复选框渲染；非 check 组声明本字段宿主忽略。
- `text`：文本输入框，宿主必须 URL 编码、插件必须解码。
- `sort`：排序选项（复用 `items` 的 id+name）+ 可选升降序。
- 类型集开放：宿主遇到未知类型降级按 `select` 渲染，不拒绝新插件；`title`/`author`/`genre` 等语义变体不设独立类型（语义与 text/check 相同），需要时经可选语义标记字段表达。

**值编码**（宿主组合 `category` 查询串的正式契约）：

| 类型 | 编码 | 示例 |
|------|------|------|
| select | `key=id` | `region=cn` |
| check | `key=id1,id2,-id3`（`,` 分隔，`-` 前缀为排除） | `tagIds=11,-85` |
| text | `key=<encodeURIComponent(输入)>` | `q=hello%20world` |
| sort | `key=id` 或 `key=id,asc\|desc`（方向仅在显式选择且 `canAscend` 时输出） | `o=mv,asc` |

**不变式**：
- 未设置的分组不输出对应 key；插件用默认值兜底（如 manga_site_b 缺省 `c=0&o=mr`）。
- `id` 内不允许出现 `,` 与 `-` 前缀（站点有此类 id 时需另行转义方案）。
- 站点不支持的组合不要声明：如 manga_site_a `/api/comic/items` 实测多标签返回 500，tagIds 保持 `select`。

**分组机制**：每个 group 是一个独立筛选维度（地区/状态/题材），`key` 指明 URL 参数名，`items` 内各 item 的 `id` 为参数值。

**同 key 多组（共享同一查询参数的多个分组）**：站点筛选 UI 常把同一参数的选项按语义分组展示
（如 manga_site_a 分类栏 6 组共用 `tagIds`），声明为多个独立组、`key` 全相同（忠于站点分组 UI），
宿主按组渲染多个区。两类语义：
- `select` 多组同 key = **跨组单选互斥**（manga_site_a 实测：选新标签替换 URL 里的旧值）：宿主状态按 key
  存单值，编码同一 key 只输出一次（取最后非空值，后者覆盖）；插件 `parseQueryString` 对重复
  key 须后者覆盖而非抛错。
- `check` 多组同 key = **跨组多选并集**：宿主状态按 key 存包含/排除数组，
  各组读写同一份数组，编码同一 key 只输出一次（`key=id1,id2,-id3`，各组分片相同、去重无害）；
  插件解析必须把逗号并集逐项拆分（如 `tags[]=a,b` 拆成两项再按站点参数形态重发，对 PHP
  `tags[]` 数组参数逐项输出 `tags%5B%5D=`）。`id` 含字面 `,` 时此形态不可用（见上不变式）。

**分节单组（`sections`，与 `items` 二选一）**：站点筛选 UI 是**单个面板内多个分区**
（如 anime_site_a「内容标签」modal 内 7 个 h5 分区）时，声明为**一个组**、
`sections: [{ title, items }]`（节标题纯展示，不参与编码），宿主渲染一个选择器、
节标题分组展示（anime_site_a「内容标签」单组 7 节，240 叶子）。状态/编码/计数与单组
完全一致（各节叶子读写同一 key 的状态）；`select`/`check`/`sort` 均可用分节
（`select` 跨节仍单选互斥——`single[key]` 单值天然保证）。判定：面板级分区（同 modal
同 key）用分节单组；跨面板/跨栏的独立维度（manga_site_a 分类栏 6 组）才用同 key 多组。
有 `sections` 时 `items` 可缺省（旧宿主只读 `items`，声明 sections 即要求宿主已升级）；
叶子 `id` 在组内须唯一（宿主渲染身份按节下标 + 叶子 id）。

**上下级机制**：`CategoryNode.children` 支持树形分类（如题材→子题材），消费方按层级展示。

**前置条件**：分组在数组中的顺序隐含依赖关系（如地区→状态→题材），消费方应依次展示。

**筛选用法**：调用 `fetchList({ category: "region=cn&state=serial&type=rexue" })` 传入组合后的查询字符串。

**分类 ID 陷阱**：`CategoryNode.id` 只填写当前分组对应的参数值，不要包含参数名和等号。比如 `key: "category"` 时应返回 `{ id: "xinwen", name: "新闻" }`，由消费方组合为 `category=xinwen`；如果直接返回 `id: "category=xinwen"`，再组合查询参数时会产生重复键，导致 `fetchList` 解析失败。

## Listing — 预设目录页（源主页 listings 页签）

通过可选的 `getListings()` 方法返回。每个 listing 是**站点的固定目录页**（如
「最新A漫 / 總排行 / 月排行」），**不是搜索页内的筛选状态**——宿主把 `category`
原样传给 `fetchList` 就地渲染，无需进搜索流程。自 ADR-0021 起，listing 可携带
**本目录页专属筛选组**（`filters`，可选）：同一源不同目录页的筛选集通常不同
（影视站每个分类 tid 的地区/类型/年份选项各异），宿主在浏览该目录页时渲染筛选
控件，启用项并入 `category` 后调 `fetchList`；**不持久化**（每次进入重置，
区别于搜索页按源持久化的已启用筛选）。

```typescript
interface Listing {
  name: string        // 页签名（如 "最新A漫"、"月排行"）
  url?: string        // 页面通道（ADR-0025）：目录页直接是页面 URL，宿主以该 URL 调 fetchList({url})。
                      // 与 category 二选一或并存（宿主优先 url）；合集/专题类入口用它；
                      // explore 条目用它作「探索页标识」（透传为 getExplore(context).url）
                      // 兼作宿主「网站原页」按钮的地址（见下「网站原页地址」一段）
  channel?: string    // 列表通道标识（ADR-0064）：宿主透传进 fetchList 的 context.channel，
                      // 插件优先按它分派（建议复用 classifyPath 的 kind 取值）
  origin?: string     // 显式网站原页地址（2026-10，Q13）：只喂宿主那颗 globe，**不进抓取**。
                      // 只在 url 不是网页地址（explore 标识）或压根没有 url 时才需要写；
                      // 宿主取原页时 **origin 恒优先于 url**
  category?: string   // 组合查询串（复用 ADR-0014 编码），直接传给 fetchList；缺省用默认列表
  kind?: string       // 入口类型（开放字符串，缺省 'list'）：list / search（预设搜索直达）/
                      // series（合集/专题）/ explore（探索页条目，listings-first）等；
                      // 宿主对未知类型降级渲染为普通目录项
  children?: Listing[]  // 分组/子菜单（ADR-0025 导航树）：一级导航的下拉子菜单或深导航；
                        // 宿主**按层渲染，形态由宿主定**（iOS 发现页 = 分级页签，ADR-0067；
                        // DevConsole 预览 / runtime listings = 折叠树），只有叶子才是可点击
                        // 目录页；递归、无层数上限
  filters?: CategoryGroup[]  // 本目录页专属筛选组（可选，ADR-0021，**叶子目录页**属性）；与 getCategories 的组同型同编码，仅对该 listing 生效
}
```

**探索页条目（listsings-first，2026）**：`kind: 'explore'` 的 listing 不是列表页，而是
**探索页**——内容形态 = `getExplore(context)` 的聚合 feed（`ExploreSection[]`）。规则：

- **可配置多个**：同一源可声明多个 explore 条目（如「推荐」默认探索页 + 「gossip头条」
  单分区探索页），靠 **`url` 字段区分**（透传为 `getExplore(context).url`，插件按
  context 分支返回不同分区）；无 `url` 的条目 = 默认探索页（等价零参调用）。
- **不消费 `category`/`filters`**：探索页是聚合 feed，无目录页筛选语义；`filters`
  被宿主忽略（但仍是列表页属性，列表条目照常使用）。
- **位置随意**：explore 条目可在顶层平铺页签，也可在 `children` 导航树中作叶子
  （宿主 push 独立探索页）。

```javascript
async function getListings() {
  return [
    {
      name: '电影',
      category: 'tid=1',
      // 目录页专属筛选组：从目录页内嵌筛选块提取的真实选项（ADR-0021）
      filters: [
        { name: '地区', key: 'area', type: 'select', items: [
          { id: '大陆', name: '大陆' }, { id: '日本', name: '日本' },
        ]},
        { name: '年份', key: 'year', type: 'select', items: [
          { id: '2026', name: '2026' }, { id: '2025', name: '2025' },
        ]},
      ],
    },
    { name: '總排行', category: 'c=0&o=mv' },
  ]
}
```

**宿主合并规则**（ADR-0021）：listing 自带 category（如 `tid=1`）为目录页基础参数，
用户在该目录页启用的筛选组编码为 ADR-0014 查询串追加在后——同名 key 后者覆盖。
**筛选状态每次进入重置，不持久化**（区别于搜索页的已启用筛选）。

**网站原页地址（2026-10 起，`url` 的第二个消费方 + 显式 `origin`）**：iOS 宿主顶栏的
「网站原页」按钮（发现页页签 / push 的标签索引与探索页 / 列表页）取该页的展示地址打开
源站真页（应用内 WebView）。取法：**显式 `origin` 恒优先，无 origin 时取非探索页的 `url`**，
两者都没有就不显示按钮。规则：

- **能给出真实页面地址的目录页就写 `url`**（站点的 `/latest`、`/tags/`、`/rank/weekly`
  这类桌面浏览器打得开的地址）——只写 `category` 的目录页在宿主里**没有**原页按钮
  （`category` 是 `fetchList` 的内部查询串，宿主不拼、也不回退首页）。
- **`kind:'explore'` 条目的 `url` 是探索页标识不是地址**（`getExplore(context).url`
  的分支键，宿主不当原页用）——想让它有原页按钮，写**显式 `origin`**
  （video_site_a「gossip头条」：`{ kind:'explore', url:'news', origin: `${BASE_URL}/黑料gossip/推荐` }`）。
- **`origin` 只用于展示、不进抓取**：抓取仍是 `url`/`category`；**留空 = 没写**（回落
  `url`），**写了却拼不出合法 http(s) 则该条目不挂按钮**（非空 `origin` 即权威，不静默
  改指 `url`、也不降级成站点首页）。
- **tags 条目**的 `url` 本就是索引页地址（作「展示/回退」用），宿主会拿它当原页，正常填即可。
- **整份 listings 要逐条给全地址**：缺地址是**静默**的（宿主无错、CLI 一片 `✓`），
  整份都缺 = 发现页颗颗页签都没按钮（video_site_f 21 条叶子曾全缺，2026-10 修）。
  自查用 `runtime listings <id>`（逐条打 `[原页=…]`／`·无原页` + 末尾 `N/M` 小结）；
  完整判据与 video_site_f 补法见 `listings.md` 规则 15。

**指引**：

- **目录型内容进 listings，不进筛选**：站点的固定分类/榜单页（manga_site_b 的「分類」、
  manga_site_f 的 `/classify` 地区/狀態/題材）应经 `getListings()` 承接为目录页，
  不要放进 `getCategories()` 当作 search 筛选。
- **目录页筛选 = 目录页的属性**：各目录页独有的筛选组（题材/地区/年份…）放
  `Listing.filters`，不要塞进全局 `getCategories`。
- **`getCategories` 只保留 search 真正消费的组**：筛选表单每个组必须有实效
  （应用后经 `search(query, {category})` 生效）。若某组只被 `fetchList` 消费、
  search 不读它（如 manga_site_b 的 `c`），把它迁到 `getListings()`。
- **无 search 但有 getCategories → 应提供 getListings**：没有搜索能力的源
  不展示筛选表单，分类内容只能经 listings 目录页触达（如 manga_site_f）。
  站点反爬导致分类接口无法实测时，**只落指引、不冒充能力**（见 SKILL 阶段 1
  分类页分析第 7 条）。
- `category` 与 `getCategories` 的值编码共用 ADR-0014 契约（`key=id`、
  `key=id1,id2,-id3`、sort 方向后缀等），`fetchList` 必须从
  `context.category` 解析。
- **filters 选项必须真实**：从目录页内嵌筛选块逐链接提取（id 取筛选路由原文，
  如 movie_site_c `/show/` 段位值）。筛选路由被站点反爬拦截时（movie_site_c `/show/` 前缀
  全系 CF 403），**声明真实选项、`fetchList` 对筛选键请求如实报错**（带站点
  信息与替代路径），不静默回退未筛选列表——延续「不冒充能力」原则。

## 页面通道、导航树与递归列表（ADR-0025）

混合内容站（导航混合分类/搜索/短视频/新闻/合集、每类落页结构不同、合集两级或更深）的
入口模型三件套：

1. **页面通道（Page Channel）**：`fetchList` 按 `context.url` 分派 → 任意「页面 URL →
   ListItem[]」。判断一个形态（首页/分区/分类/合集/专题/搜索页/翻页）能否走它：只要插件能
   把一个 URL 解析成本页条目，就用 `fetchList({url})`，**不造新类型、不加新导出**。
2. **导航树**：`getListings()` 返回可嵌套的 `Listing[]`（`children` 递归）承载站点的
   下拉子菜单/深导航；叶子目录页用 `url`（页面通道）或 `category` 承接。宿主**按层渲染，
   呈现形态由宿主定**：iOS 发现页 = 分级页签（DFS 展平成**叶子页序列** + 每层一条页签行 +
   单一分页器，ADR-0067），DevConsole 预览 / `runtime listings` = 折叠树（刻意暴露声明的
   完整结构）；只有叶子可点击。
3. **递归列表**：合集/专题条目带 `target:{ action:'list', url }` → 点进又是列表（可再带
   target）→ **嵌套层级任意深**（第 3 / 4 / 5 … 级合集专题无需模型改动）。

**列表分页双形态**（同站可能混用）：query 分页（`?page=N`）与路径分页（`/…/<slug>/<page>`）。
`hasMore` 读 `.pager-label`「第 cur/total 页」（不可得用「列表非空」启发式）；翻页 URL 按
请求页形态构造（query 页追加 `?page=`；路径页去掉尾数再拼 `/page`）。可用「下一页」链接的
href 形态（`?page=` 或 `/N`）做确认。

## 懒播放解析（ADR-0020 + ADR-0026 泛化）

`fetchPlayUrl(url)` 的入参从「剧集播放页 URL」泛化为「**任意出流入口 URL**」（详情页/播放页/
任何能解析出最终流的页面）——详情页即播放入口的站也可直接 `fetchPlayUrl(detailUrl)`，内部
多跳（GET 详情 → 解包参数 → 调解析接口 → 提取 m3u8/直链）。「详情页给播放占位」用
`video` 块的「无 url + `target:{action:'play',url}`」表达（见上文 ContentBlock.video）。

## ExploreFeed — 发现页（多分区聚合 feed）

发现页是站点的聚合 feed（热门 / 最新 / 推荐等），通过可选的 `getExplore()` 方法返回。
**探索页条目（listings-first）**：探索内容经 `getListings()` 里的 `kind:'explore'` 条目
暴露给浏览页（iOS 不再固定显示「首页」），宿主持有该条目的 `url` 并以它为 context 调用
本方法——同一源可配置多个探索页。

```typescript
interface ExploreContext {
  url?: string       // 探索页标识（Listing.kind==='explore' 条目的 url 透传）；缺省 = 默认探索页
}

interface ExploreSection {
  title: string          // 分区标题（如 "热门"）
  items: ListItem[]      // 本分区条目（结构同列表项）
  viewMore?: PageJumpTarget  // 「查看更多」跳转，依赖 PageJumpTarget
}

type ExploreFeed = ExploreSection[]  // 多个分区组成的探索页
```

**用法**：每个分区是一组 `ListItem` + 可选的「查看更多」跳转（`viewMore` 为 `PageJumpTarget`，如 `{ action: 'list', category: 'sort=hot' }`）。`getExplore()` 不消费 `page`/`category`/`target`；`context.url` 只作探索页标识（多个 explore 条目 = 多 url 多页）。详情页推荐块有**同型同语义**的块级 `viewMore`（见上文「块级『更多』入口」，两处共用一个契约与一条纪律：无对应列表页就不写）。

```javascript
async function getExplore(context = {}) {
  const pick = String((context && context.url) || '')
  const all = [
    { keys: ['video'], title: '热门', items: await fetchHot(), viewMore: { action: 'list', category: 'sort=hot' } },
    { keys: ['news'], title: 'gossip', items: await fetchNews() },
  ]
  // 无 url = 默认探索页（全部分区）；有 url 按探索页标识过滤（video_site_a 示范）
  return pick ? all.filter((s) => s.keys.includes(pick)) : all
}
```

## TagIndex — 标签索引页（首字分组云 / 分页云）

`/tags/` 全量标签云走可选的 `getTags(context?)`（`TagContext={page?, category?}`，旧插件无参零改动），
经 `getListings()` 里 `kind:'tags'` 条目暴露（`url` 为索引页 URL，仅展示/回退；
验证走 `getTags` 首页，不调 `fetchList`）。与 `fetchList` 正交：索引页无 slug 时
`fetchList({url:'/tags/'})` 须报错指引到 `getTags`；标签视频列表仍走 `tag=<slug>` /
`/tags/<slug>/`（video_site_b 为 `/tag.php?slug=<slug>`）页面通道。两种形态（ADR-0037/0038）：

- **首字分组云**（kvs_site_b）：单次全量，返回裸 `TagGroup[]`（组序/组内序忠于 DOM，不做拼音排序）。
- **分页云**（video_site_b）：`page` 从 1 开始；返回 `{groups, pagination}` 信封（扁平云每页单组，
  标题为排序页标识如 `HOT 第1页`；`pagination` 复用 `PaginationMeta` 页码式，`hasMore` 驱动加载更多）。

**索引页自己的页级筛选（ADR-0021 + ADR-0062）**：`kind:'tags'` 叶子**同样消费
`Listing.filters`**——宿主在标签索引页渲染筛选栏，选中项与 `Listing.category` 合并成
ADR-0014 组合串，经 **`TagContext.category`** 透传（与 `fetchList` 的 `context.category`
同口径同编码；空筛选不传键）。插件据此换页/换参数，**不要**为它另造 context 字段：

- 内容类型开关（kvs_site_a `/tags/` ↔ `/albums/tags/`，站点是**换页**不是查询参数 →
  `type` 是插件内部键，拦在 URL 构造里、别拼进站点查询串）；
- 服务端排序（video_site_b `views|videos`）也是普通筛选组（`key:'sort'`），插件从
  `context.category` 解析后拼进站点 URL——**`TagContext.sort` 已退役**（ADR-0062：那曾是
  宿主硬编码的单站档位，对无此能力的站是假能力）。

> **分组边界不保证是独立容器**（kvs_site_a 案例，2026-10）：首字分组云的 DOM 有「一分组一容器」
> （kvs_site_b `.tags-groups > li.group`）与「**同容器内混排多分组**」两种形态——kvs_site_a 的
> `.list-tags` 下只有 6 个 `<ul class="item">`，却含 33 个字母分组：同一 `<ul>` 内
> `<li><strong class="title">A</strong></li>` 作分组分隔，其后 `<li><a>` 归入该组。
> 解析必须**按 `<li>` 顺序扫描**（遇 title 开新组、遇 a 归入当前组），把一个容器当一组会
> 只得到 6 组、组标题还取错（站点因此少 27 组）。自查：组数应等于页面分组标题
> （`strong.title`/`div.letter` 之类）的出现次数。

```typescript
interface TagItem {
  name: string             // 标签显示名（站点原文，不归一化）
  url: string              // 标签视频列表页绝对 URL（页面通道）
  count?: number           // 该标签视频数（站点 <em> 计数；缺失不填）
  target?: PageJumpTarget  // 点标签进列表（宿主优先用它，url 退为外链回退）
}

interface TagGroup {
  title: string             // 分组标题 = 首字原文（韩文/简繁/假名混排不归一，保持 DOM 原序）
  tags: TagItem[]
}

type TagIndex = TagGroup[]  // 多个分组组成的索引云（不做拼音排序，沙箱无拼音库）
```

```javascript
async function getTags(context) {
  // 首字分组云（kvs_site_b）：无参单次全量
  // const res = await request(`${BASE_URL}/tags/`)
  // const $ = $lib.cheerio.load(res.body)
  // .tags-groups > li.group：div.letter 首字 + ul.group-list a[href*="/tags/<slug>/"] > span + em
  // 组序/组内序忠于 DOM；url 绝对化；target 显式声明进列表
  // return groups // 裸 TagGroup[]

  // 分页云 + 索引页自己的筛选（video_site_b）：排序档来自 Listing.filters 的选中项（ADR-0062）
  const params = parseCategory(context && context.category)
  const sort = params.sort === 'videos' ? 'videos' : 'views'
  const page = Math.max(parseInt(context && context.page, 10) || 1, 1)
  const res = await request(`${BASE_URL}/tags.php?sort=${sort}${page > 1 ? `&page=${page}` : ''}`)
  // .tag-list a.list-card > strong + span("N videos · M views")；.pagination 取末页
  // return { groups: [{ title: `${sort} 第${page}页`, tags }], pagination: { strategy: 'page', hasMore, page, totalPages } }
}
```

## PluginContext — fetchList 上下文

```typescript
interface PluginContext {
  category?: string    // 分类筛选（传入组合后的查询字符串，如 "region=cn&type=rexue"）
  url?: string         // 页面通道（ADR-0025）：任意列表页 URL（导航入口/合集/专题/分类落页），
                       // 插件按 URL 分派到对应列表解析逻辑。与 category 二选一或并存
  channel?: string     // 列表通道标识（ADR-0064）：Listing.channel / PageJumpTarget.list.channel
                       // 的透传，有则优先按它分派、无则回退按 url 正则判定
  page?: number        // 页码，从 1 开始
  pageSize?: number    // 每页数量
  cursor?: string      // 游标分页令牌：宿主取上一页 pagination.nextCursor 回传（仅 cursor 策略）
}
```

## 列表通道标识（ADR-0064，替代 URL 正则分流）

多形态站（视频/图集双栈、索引/列表同前缀不同形）曾靠 `classifyPath` 等十几个正则按
`url` 反推「进哪个解析分支」——改一处忘一处 = 某一态静默 0 条。新约定把「意图」显式化：

- 插件在 `getListings()` 每个叶子写 `channel`（取值自定，建议复用 `classifyPath` 的
  kind 返回值，如 `'video-list'` / `'album-list'` / `'category-index'`），在
  `target: { action:'list', url, channel }` 同样带上；
- 三端宿主（runtime / DevConsole / iOS）原样透传进 `fetchList` 的 `context.channel`；
- `fetchList` 首行 `resolveChannel(ctx, (url) => classifyByUrl(pathOf(url)))`：
  有 channel 直接 `switch`，无（旧宿主 / 裸 `--url` 调试）才回退单点正则。

`url` 仍是抓取地址与「网站原页」地址，不因有了 channel 而省略。ID/slug 提取同样
不要写一次性正则，走 `splitPath(path)` 切段后按下标取（如 `['videos','123']`）。

## ListResult — 列表结果（fetchList / search 的返回信封）

`fetchList` 与 `search` **必须**返回 `ListResult`（不再是裸 `ListItem[]`）。`pagination` 缺失表示该源无分页概念，宿主不提供「加载更多」。

```typescript
interface ListResult {
  items: ListItem[]           // 本页条目
  pagination?: PaginationMeta // 分页元数据（可选）
  layout?: { columns?: number } // 排布声明（可选，插件赢）：1~4，横竖通吃
  filters?: CategoryGroup[]   // 本列表页自己的筛选组（可选，ADR-0066）
}
```

`layout.columns`（可选）：本页网格列数，**插件声明赢过用户全局列数**。竖海报页声明即覆盖（`1` = 强制单列大卡）；横图页缺省单列，声明 `≥2` 即进网格；`1~4` 之外宿主忽略回退全局。不声明 = 跟用户设置（我的页图片区 2/3/4）。

`filters`（可选，ADR-0066）：**本列表页自己**可切换的筛选维度，与 `Listing.filters`（目录页条目）、
`PageJumpTarget.list.filters`（跳转携带）**同型同编码**——`CategoryGroup[]`、key 是站点自己的参数名、
选中项由宿主合并进 `category` 再回调 `fetchList`（同一 `url`）。

三个来源只差**时机**，宿主优先级：结果自声明 > 跳转携带 > 目录页条目：

| 来源 | 什么时候拿得到 | 典型场景 |
|---|---|---|
| `Listing.filters` | 进页**前**（页签已渲染） | 目录页自己的筛选（ADR-0021） |
| `PageJumpTarget.list.filters` | 跳转时（卡片上就有） | 落地页星期/字母筛选（manga_site_a/video_site_a） |
| `ListResult.filters` | **抓到页面之后** | 选项按页不同、且只在页面里（video_site_c 工作室题材滑块） |

三条红线（都是踩过才定的）：

1. **只在抓到页面才知道的选项就别往卡片塞**：卡片渲染时拿不到工作室的题材列表，
   硬塞一份「站点全部题材」= 用户能选中站上不存在的值（假能力）。
2. **同族页面的筛选组可能不是同一套 key**，一个通道一套、照站点自己的控件写：
   video_site_c 视频目录页排序走 path `/<sort>/all`（`justadded|popular|top`），
   工作室页排序走查询串 `?sorting=`（`newest|popular|rating`）——**复用常量就会串档**。
3. **页面没这个控件就别声明**：video_site_c 多数工作室没有题材滑块（整块不渲染），
   这时只声明排序组；「空组」不要发，宿主会渲染一个点不动的筛选入口。

## PaginationMeta — 分页元数据（判别联合）

按 `strategy` 区分两种分页方式，宿主据此决定下一次请求传 `page+1` 还是回传 `cursor`。

```typescript
// 页码式：宿主按 page 自增翻页
interface PagePagination {
  strategy: 'page'
  hasMore: boolean        // 是否还有下一页
  page: number            // 当前页码（回显）
  pageSize?: number       // 每页数量
  total?: number          // 总条数（可选，用于「共 N 条」）
  totalPages?: number     // 总页数（可选）
}

// 游标式：宿主取 nextCursor 经 PluginContext.cursor 回传
interface CursorPagination {
  strategy: 'cursor'
  hasMore: boolean        // hasMore:true 时 nextCursor 必填
  nextCursor: string      // 下一页的不透明令牌
  total?: number
}

type PaginationMeta = PagePagination | CursorPagination
```

**契约不变式**：
- `cursor` 策略 `hasMore:true` 时 `nextCursor` 必填。
- `items.length === 0` 时 `hasMore` 必为 `false`（避免宿主无限追加）。
- 无可靠分页信号的源（如当日固定列表、单页趋势榜）应省略 `pagination`，只返回 `{ items }`，**不要**伪造 `hasMore`。

**hasMore 启发式**（无服务端 total/no_more 信号时常用）：`hasMore = items.length > 0`——继续翻直到命中空页（空页 ⇒ `hasMore:false`）。如源站提供精确信号（如 B 站 `data.no_more`）应优先使用。

## 插件元数据头

每个 `.plugin.js` 文件顶部必须有：

```javascript
// ==Plugin==
// id: bilibili-hot
// name: B站热门
// version: 1.0.0
// author: lingshu
// description: B站热门视频列表与详情
// sourceUrl: https://www.bilibili.com/v/popular
// tags: video,hot
// ==EndPlugin==
```

`id` / `name` / `version` 为必填，缺失会导致加载失败。

// ===== 内容数据模型 =====

export interface ListItem {
  id: string
  title: string
  summary?: string
  coverUrl?: string
  /** 封面原始宽高（像素）。提供则瀑布流首帧即按真实比例排版，无需等图加载完再 reflow */
  coverWidth?: number
  coverHeight?: number
  url: string
  publishTime?: number
  metadata?: Record<string, any>
  /**
   * 点击行为。缺省 = 进详情页（url 传给 fetchDetail）。
   * 合集/专题类条目带 `target: { action:'list', url }` —— 宿主以该 URL 再调 fetchList，
   * 返回仍为 ListItem[]（可再带 target），从而支持任意深度的合集/导航嵌套（递归列表）。
   */
  target?: PageJumpTarget
  /**
   * 标题下方标签行（可选）。字符串简写归一为 `{ name }`；对象形态可带跳转
   * （有 `target` 优先内部导航、无则看 `url`，均无则纯展示不冒泡整卡）与样式覆写
   * （缺省宿主单色，三端同值，带色则覆盖）。空/缺省隐藏整行，宿主最多取前 6 个。
   */
  tags?: ListTag[]
  /**
   * 封面四角信息位（可选，老卡专用，有 `card` 时忽略）。只压图，无封面不渲染；
   * 纯展示不可点。`center` 不开放（留给播放钮/已读标）。
   */
  badges?: CoverBadges
  /**
   * 自定义列表项卡片（可选）。有即渲染、无即回退老卡。
   * 每项自带现算 DSL JSON，全文见 `lingshu-skills/lingshu-plugin-dev/references/card-dsl.md`。
   */
  card?: CardDSL
}

/**
 * 列表标签（标题下方标签行单个标签）。文本只许纯字符串（`#阿嬤`这类展示名，
 * 格式化值是角标的）；图标复用卡片 DSL 图标表（`eye/clock/play/…/none`，
 * DevConsole 预览忽略图标只显文字，以 iOS 为准）；颜色复用 `PillStyle` 语义
 * （出现即完整，缺键 = 无该属性）。
 */
export type ListTag =
  | string
  | {
      name: string
      url?: string
      target?: PageJumpTarget
      icon?: string
      backgroundColor?: CardColor
      textColor?: CardColor
      borderColor?: CardColor
    }

/** 封面角标文本位：直串或格式化值（时长/次数/时间戳宿主统一格式化，与卡片 DSL 同语义） */
export type BadgeText = string | CardFormattedValue

/**
 * 封面角标单个槽位。字符串简写归一为 `{ text }`；颜色缺省宿主半透明黑底白字；
 * `opacity` 缺省 1（只淡底不淡字，越界宿主钳制 0~1）；形状恒小胶囊，不开放圆形。
 */
export type CoverBadge =
  | string
  | {
      text: BadgeText
      icon?: string
      backgroundColor?: CardColor
      textColor?: CardColor
      opacity?: number
    }

/** 封面四角信息位（一角一槽，单槽单行超长截断，不堆叠） */
export interface CoverBadges {
  topLeft?: CoverBadge
  topRight?: CoverBadge
  bottomLeft?: CoverBadge
  bottomRight?: CoverBadge
}

// ===== 卡片 DSL（Card DSL v1）=====

/** 卡片颜色：固定串（Hex/rgba/语义名 $textPrimary…）或深浅双写 */
export type CardColor = string | { light: string; dark: string }

/** 格式化值：插件给原始值，宿主统一格式化（Q13） */
export type CardFormattedValue =
  | { value: number; format: 'duration' | 'count' | 'relative' | 'date' | 'datetime' }

/** 卡片文本位：直串或格式化值 */
export type CardText = string | CardFormattedValue

/** 双态 pill 单态完整规格（出现即完整：缺键 = 无该属性；宿主无脑切换，零站点知识） */
export type PillStyle = { backgroundColor?: CardColor; textColor?: CardColor; borderColor?: CardColor }

/** 通用调用（卡片写侧唯一通道）：插件声明方法名 + 参数，宿主通用直调，不逐一映射方法。
 * effect 描述成功后宿主如何就地翻转（封闭集合，与站点无关）；终态以服务端返回为准。 */
export interface InvokeCall {
  /** 插件导出的方法名（宿主查到是 function 即调，非 function 即报“插件不支持 <name>”） */
  function: string
  /** 身份参数（如用户 id / 详情 URL / 插件自定义槽位）；期望态由宿主按 stateKey 注入 */
  params?: Record<string, unknown>
  /** 期望态键（缺省 active）：调用前宿主置 params[stateKey] = !当前态 */
  stateKey?: string
}

/** 开/关双态呈现（pill kind 专用；文案样式全由插件自带，宿主无脑切换） */
export interface DualState {
  onText?: string
  offText?: string
  onStyle?: PillStyle
  offStyle?: PillStyle
}

export type InvokeEffect =
  | ({ kind: 'pill'; id: string; active?: boolean; resultKey?: string } & DualState)
  | { kind: 'count'; id: string; active?: boolean; resultKey?: string }
  | { kind: 'none'; id: string }

export type InvokeTarget = { action: 'invoke'; call: InvokeCall; effect?: InvokeEffect }

/** 卡片节点 target：缺省冒泡到整卡；noop 拦截不跳转；跳转覆盖；写侧走通用调用 */
export type CardTarget = { action: 'noop' } | PageJumpTarget | InvokeTarget

/** 字体（text/date 节点）：size 支持语义名或数字 pt；weight 同 Egern；family 预留 */
export interface CardFont {
  size?: string | number
  weight?: string
  family?: string
}

/** 宫格「查看更多」压罩（grid.overflowMore） */
export interface GridOverflow {
  count: number
  label: string
}

/** actionBar 单项：icon + 文本位 + 可选写侧调用（有 invoke target 即渲染为可点按钮） */
export interface ActionBarItem {
  icon: string
  text: CardText
  target?: CardTarget
}

/** 压图徽标（位置枚举，非自由坐标，Q8） */
export interface CardOverlay {
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center'
  icon?: string
  text?: CardText
  backgroundColor?: CardColor
  textColor?: CardColor
  /** 徽标形状：缺省 rounded（小胶囊）；circle = 圆形钮（图标徽用，如视频中央播放钮，颜色全由插件声明） */
  shape?: 'circle' | 'rounded'
  /** 徽标底不透明度乘子（0~1，缺省 1 = backgroundColor 原样；最终 alpha = 颜色自带 alpha × opacity，只淡底不淡图标/文字） */
  opacity?: number
  /** 圆形钮直径 px（仅 shape:circle 有效；缺省 34，图标同比缩放；非法宿主回缺省） */
  size?: number
}

export type CardNode =
  | {
      type: 'stack'
      direction?: 'row' | 'column'
      alignItems?: 'start' | 'center' | 'end'
      gap?: number
      padding?: number | [number, number] | [number, number, number, number]
      backgroundColor?: CardColor
      borderRadius?: number | 'auto'
      /** 主轴对齐（flexbox justify-content 语义）：有值即撑满整行再排布；缺省收缩到内容宽 */
      justifyContent?: 'start' | 'center' | 'end'
      flex?: number
      children: CardNode[]
      target?: CardTarget
    }
  | {
      type: 'text'
      text: CardText
      font?: CardFont
      textColor?: CardColor
      textAlign?: 'left' | 'center' | 'right'
      maxLines?: number
      minScale?: number
      flex?: number
      target?: CardTarget
    }
  | {
      type: 'image'
      src: string
      /** 比例（宿主按宽度反推高度，不写绝对 px，Q11）：16:9/4:3/3:4/2:3/1:1/circle */
      aspect?: string
      resizeMode?: 'contain' | 'cover'
      borderRadius?: number | 'auto'
      flex?: number
      overlays?: CardOverlay[]
      transport?: ImageTransport
      decrypt?: ImageEncryption
      target?: CardTarget
    }
  | {
      type: 'avatar'
      src: string
      size?: number
      flex?: number
      transport?: ImageTransport
      decrypt?: ImageEncryption
      target?: CardTarget
    }
  | {
      type: 'grid'
      columns: number
      gap?: number
      children: CardNode[]
      overflowMore?: GridOverflow
      flex?: number
      target?: CardTarget
    }
  | {
      type: 'pill'
      text: CardText
      icon?: string
      backgroundColor?: CardColor
      textColor?: CardColor
      /** 圆角（缺省 = 胶囊全圆）；边框色（缺省 = 无边框） */
      borderRadius?: number
      borderColor?: CardColor
      /** 徽标形状：缺省胶囊（随内容宽）；circle = 固定圆形（序号/名次徽用，多位数也不拉成胶囊） */
      shape?: 'circle'
      /** 圆形直径 px（仅 shape:circle 有效；缺省 24；非法宿主回缺省） */
      size?: number
      flex?: number
      target?: CardTarget
    }
  | {
      type: 'actionBar'
      /** 通用调用直调：带 invoke target 的单项由宿主渲染为可点按钮（调插件声明的方法，成功即时翻转 + 点亮态）；无 `target` 的项纯展示、跟整卡走 */
      items: ActionBarItem[]
      flex?: number
    }
  | { type: 'spacer'; length?: number }
  | {
      type: 'divider'
      /** 分隔线色（缺省宿主 separator 色，全宽 0.5–1pt 细线，榜单行之间用） */
      color?: CardColor
    }
  | {
      type: 'date'
      date: string
      format?: 'date' | 'time' | 'relative' | 'offset' | 'timer'
      font?: CardFont
      textColor?: CardColor
      textAlign?: 'left' | 'center' | 'right'
      maxLines?: number
      minScale?: number
      flex?: number
      target?: CardTarget
    }

/** 未知元素容差：宿主解码遇到未知 type 跳节点（Q20），TS 侧用开放联合表达 */
export type CardNodeLoose = CardNode | { type: string; [k: string]: any }

export interface CardDSL {
  version: 1
  root: CardNode
  accessibilityLabel?: string
}

export type ContentBlock =
  /**
   * 纯文本段落。`title` 可选（2026-09）：区标题——带标题时宿主渲染为标题区样式
   * （与 tags/选集/章节同款分区标题 + 正文，简介等独立语义的文本区用它统一样式）；
   * 缺省时保持裸段落（旧插件零改动）。`content` 内的换行（`\n`）宿主必须保留换行
   * 显示（`pre-wrap` 语义），不得全缩为一行。
   */
  | { type: 'text'; title?: string; content: string }
  | { type: 'heading'; content: string; level: 1|2|3|4|5|6 }
  | { type: 'link'; content: string; url: string; target?: PageJumpTarget }
  | { type: 'chapter'; content: ChapterItem[] }
  | { type: 'tags'; title?: string; content: Array<{ name: string; url: string; target?: PageJumpTarget }> }
  /**
   * 标签分组块（详情页一行一种类型，类型名动态）。
   * `title` 为块大标题，缺省宿主渲染「标签」；`groups` 每项为一个类型行：
   * `name` 为类型名（动态字符串，如 女性/男性/其他，站点各异），`content` 为该类型下的标签项
   * （与 `tags` 项同形，点击跳转语义同 `tags`）。空 `groups` 时宿主隐藏整块。
   */
  | { type: 'tagGroups'; title?: string; groups: Array<{ name: string; content: Array<{ name: string; url: string; target?: PageJumpTarget }> }> }
  /**
   * 推荐内容列表（详情链接与可选封面）。
   * `title` 为**块级区标题**（2026-10）：缺省宿主渲染「推荐」；站点侧推荐维度各异
   * （相关推荐 / 同模特 / 同分类），要如实命名就得由插件声明——它同时是「更多」落地页
   * 导航栏标题的来源（iOS `navigate(preferredTitle:)`）。
   * `viewMore` 为**块级「更多」跳转**（2026-10）：与 `ExploreSection.viewMore` 同型同语义，
   * 点标题右侧「更多」进该推荐维度的完整列表页（宿主列表页，`fetchList` 驱动分页）。
   * **站点该维度没有对应列表页时禁写**（不冒充）；宿主无 `viewMore` 即不渲染按钮
   * （禁出现点不动的死「更多」，同 DiscoverView 口径）。
   */
  | { type: 'recommendations'; title?: string; content: Array<{ title: string; url: string; coverUrl?: string; target?: PageJumpTarget }>; viewMore?: PageJumpTarget }
  | { type: 'image'; url: string; caption?: string; width?: number; height?: number }
  /**
   * 视频。url 变可选（懒播放占位）——缺省时必须携带
   * `target: { action:'play', url }`（url 为详情页或播放页 URL），宿主渲染为
   * 播放占位（封面 + 解析播放），用户点播时才懒调 fetchPlayUrl(target.url) 现算出流。
   * qualities 为多清晰度档位（每个清晰度独立 URL 的站点用）；
   * url 为默认档（缺省时宿主取 qualities 首档）。master playlist 多码率的站点
   * 无需声明（宿主播放器自动解析 levels 渲染清晰度菜单）。
   */
  | { type: 'video'; url?: string; target?: { action: 'play'; url: string }; poster?: string; duration?: number; platform?: string; referer?: string; qualities?: VideoQuality[] }
  /** 影视「线路 × 剧集」：每条线路含若干剧集，剧集 url 指向播放页（非媒体 URL），宿主点选集后经 fetchPlayUrl 就地解析播放。 */
  | { type: 'episodes'; lines: PlayLine[]; poster?: string }
  | { type: 'gallery'; images: Array<{ url: string; caption?: string }> }
  | { type: 'divider' }

/**
 * 结构化跳转目标：插件声明「点这里去哪」，宿主据此驱动内部导航。
 * 优先于 tags/recommendations/chapter/episodes 各项的 url（url 约定为向后兼容的回退）。
 * - list：带分类筛选或任意页面 URL 的列表。category 为组合查询串；
 *   url 为页面通道（宿主以该 URL 调 fetchList）——二者至少其一。
 * - search：搜索（query 为查询词）
 * - detail / reading / play：url 为对应页 URL（play 为「出流入口 URL」——详情页或播放页，
 *   宿主调 fetchPlayUrl 解析出最终流，语义泛化）
 * - categories：分类页
 */
export type PageJumpTarget =
  | {
      action: 'list'
      url?: string
      category?: string
      /** 落地列表页专属筛选组（型，Q11-a）：页面通道跳转也可携带筛选栏，
       *  宿主在落地列表页渲染筛选行，用户组合后并入 category 再调 fetchList。 */
      filters?: CategoryGroup[]
      /**
       * 列表通道标识（替代 URL 正则分流）：插件声明「点这里进哪个解析分支」
       * （如 kvs_site_a 的 'video-list' / 'album-list' / 'category-index'），宿主原样透传进
       * `PluginContext.channel`。缺省 = 老行为（插件按 `url` 正则回退分派）。
       */
      channel?: string
    }
  | { action: 'search'; query: string }
  | { action: 'detail'; url: string }
  | { action: 'reading'; url: string }
  | { action: 'play'; url: string }
  | { action: 'categories' }

/** 线路内单个剧集：url 为播放页 URL（不是 m3u8/媒体 URL），宿主点击后经 fetchPlayUrl 解析 */
export interface EpisodeItem {
  title: string
  /** 播放页 URL（传给 fetchPlayUrl） */
  url: string
  target?: PageJumpTarget
  /** 剧集封面：横向缩略图绝对 URL（可选，缺省回退纯文字，见 data-model.md） */
  coverUrl?: string
}

/** 章节列表单个章节：url 为阅读页 URL，宿主点击后经 fetchReadingPage 阅读 */
export interface ChapterItem {
  title: string
  /** 阅读页 URL（传给 fetchReadingPage） */
  url: string
  target?: PageJumpTarget
  /** 章节封面：缩略图绝对 URL（可选，缺省回退纯文字，与剧集封面同构） */
  coverUrl?: string
}

/** 一条播放线路（影视站「线路」概念）：如「超清K」「UC网盘」 */
export interface PlayLine {
  /** 线路展示名 */
  name: string
  episodes: EpisodeItem[]
}

/** 视频清晰度档位：单一档位的展示名 + 独立视频流 URL */
export interface VideoQuality {
  /** 档位展示名（如 "1080P"、"720P"、"高清"） */
  label: string
  /** 该档位的视频流 URL（m3u8 或 MP4 直链），原始 CDN URL */
  url: string
  /** 可选：分辨率宽（像素） */
  width?: number
  /** 可选：分辨率高（像素） */
  height?: number
}

export interface ImageEncryption {
  algorithm: string
  padding?: string
  encoding?: string
  key: string
  iv: string
}

export interface ImageTransport {
  encoding: string
  decodedMime?: string
  sourceTemplate?: string
}

export interface ArticleDetail {
  title: string
  sourceName: string
  sourceUrl: string
  publishTime?: number
  author?: string
  coverUrl?: string
  blocks: ContentBlock[]
  metadata?: Record<string, any>
}

// ===== 插件接口 =====

export interface PluginContext {
  category?: string
  /**
   * 页面通道：任意页面 URL（导航入口 / 合集 / 专题 / 分类落页），
   * 插件按 URL 分派到对应列表解析逻辑。「url → ListItem[]」即列表入口的最小心智模型。
   * 与 category 二选一或并存（插件自行决定优先级）；旧插件可完全不理会（最小可用路径保留）。
   */
  url?: string
  /**
   * 列表通道标识（替代 URL 正则分流）：`Listing.channel` / `PageJumpTarget.list.channel`
   * 由宿主原样透传。插件应优先按它分派（`switch (ctx.channel)`），缺省时才回退到按 `url`
   * 正则判定（旧宿主 / 裸 `--url` 调试）。`url` 仍是抓取地址与「网站原页」地址，不因有了
   * channel 而省略。
   */
  channel?: string
  page?: number
  pageSize?: number
  /** 游标分页令牌：宿主取上一页结果的 pagination.nextCursor 回传，形成往返 */
  cursor?: string
  /**
   * 宿主从表单收集、回传给写侧动作的输入值（如 login 的 username/password）。
   * 声明式交互的回传信道：插件声明字段 schema → 宿主渲染表单 → 收集值经此回传。。
   */
  inputs?: Record<string, string>
}

/** 页码式分页：宿主按 page 自增翻页 */
export interface PagePagination {
  strategy: 'page'
  hasMore: boolean
  page: number
  pageSize?: number
  total?: number
  totalPages?: number
}

/** 游标式分页：宿主取 nextCursor 经 PluginContext.cursor 回传；hasMore:true 时 nextCursor 必填 */
export interface CursorPagination {
  strategy: 'cursor'
  hasMore: boolean
  nextCursor: string
  total?: number
}

/** 分页元数据：判别联合，插件产出，宿主分页器消费 */
export type PaginationMeta = PagePagination | CursorPagination

/** fetchList / search 的返回信封；pagination 缺失表示该源无分页概念 */
export interface ListResult {
  items: ListItem[]
  pagination?: PaginationMeta
  /**
   * 列表排布声明（可选，插件赢）：columns 1~4，横竖通吃——竖海报页覆盖用户全局列数，
   * 横图页声明 ≥2 即进网格（缺省单列）；脏值宿主忽略回退全局。缺省 = 跟用户设置。
   */
  layout?: { columns?: number }
  /**
   * 列表页自声明筛选组（`CategoryGroup[]`，可选）：**本列表页自己**可切换的
   * 筛选维度（与 `Listing.filters` / `PageJumpTarget.list.filters` 同型同编码，值是
   * 站点自己的 key=value，宿主合并进 `category` 再调 `fetchList`）。
   * 与既有两处的分工：
   *   - `Listing.filters`：进页**前**（listings 页签）就要渲染的目录页筛选；
   *   - `PageJumpTarget.list.filters`：跳转时就知道的落地页筛选（静态）；
   *   - 本字段：**只有抓到页面才知道的**落地页筛选（工作室页的题材滑块按工作室不同、
   *     站点只把它渲进 SSR HTML）——宿主在列表页收到结果后渲染，用户组合后并入
   *     `category` 重调 `fetchList`（同一 url），插件据此重取。
   * 缺省 = 本页无筛选（零回归）。宿主渲染优先级：本字段非空则用它，否则回退跳转携带的
   * `filters`（同一页两个来源以「页面实际长什么样」为准）。
   */
  filters?: CategoryGroup[]
}

export interface ReadingPage {
  title: string
  sourceName: string
  sourceUrl: string
  /**
   * 兼容通道：漫画/图集页的图片 URL 列表（逐张成图）。旧漫画插件零改动。
   * content 有则宿主优先渲染 content，缺则把 pages 逐张转 image 块回退。
   */
  pages?: string[]
  /**
   * 章节内容块：章节内容阅读的主通道，图文任意混合
   * （text/heading/image/link…）。单页全文小说直接把正文放这里，无需章节列表。
   */
  content?: ContentBlock[]
  prevUrl?: string
  nextUrl?: string
  metadata?: Record<string, any>
}

/**
 * fetchPlayUrl 的返回信封：把播放页 URL 解析出的最终可直接播放的视频流。
 * 字段与 video block 对齐（url + referer + platform + poster + duration）；URL 常带时效鉴权参数
 * （如 auth_key），宿主按会话缓存即可，不建议落盘长期复用。。
 */
export interface PlayUrlResult {
  /** 最终视频流 URL（m3u8 或 MP4 直链），原始 CDN URL，不要改写成代理 URL */
  url: string
  poster?: string
  duration?: number
  platform?: string
  /** 播放该流时要求代理向上游声明的 Referer（CDN 校验时设置） */
  referer?: string
  /** 多清晰度档位：url 为默认档；缺省 = 单档（兼容旧插件） */
  qualities?: VideoQuality[]
}

export interface CategoryNode {
  id: string
  name: string
  children?: CategoryNode[]
}

/**
 * 分节单组的一节（CategoryGroup.sections 的元素）：**纯展示分组**，节标题不参与编码。
 * 同组各节的叶子共享该组的 key 与同一份宿主状态（select 单值 / check 包含数组），
 * 编码与单组完全一致、同一 key 只输出一次。叶子规则与 items 相同（id 禁逗号、
 * `-` 前缀为排除、canExclude 逐项切换）。
 */
export interface CategorySection {
  /** 节标题（如 "影片属性"），纯展示，不参与编码 */
  title: string
  /** 本节选项（叶子；再深的 children 沿用上下级语义，宿主仅提示不渲染子项） */
  items: CategoryNode[]
}

/** 筛选类型：select 单选 / check 多选（可排除）/ text 文本输入 / sort 排序。
 * 开放字符串联合：宿主遇到未知类型时降级按 select 渲染，不拒绝新插件。 */
export type CategoryFilterType = 'select' | 'check' | 'text' | 'sort' | (string & {})

/**
 * 多选展示形态（仅 check 组消费）：checkbox 复选框列表（默认）/ tags 标签芯片云。
 * 纯展示切换——状态（include/exclude）与值编码（key=id1,id2,-id3）与复选框完全一致。
 * 开放字符串联合：宿主遇到未知形态时按 checkbox 渲染。非 check 组声明本字段宿主忽略。
 */
export type CategoryFilterDisplay = 'checkbox' | 'tags' | (string & {})

/** 预设目录页（listing）：站点的固定目录入口；可附带本目录页专属的筛选组。
 * category 复用组合查询串（如 "c=doujin&o=mr"），直接传给 fetchList；
 * filters 为本目录页可组合的额外筛选维度（同一站不同 listing 的筛选集通常不同，
 * 如影视站每个分类 tid 的地区/类型/年份选项各异），宿主在浏览该目录页时渲染筛选
 * 控件，用户组合后把启用项并入 category 再调 fetchList（不持久化，每次进入重置）。 */
export interface Listing {
  name: string
  /**
   * 页面通道入口：目录页直接是一个页面 URL，宿主以该 URL 调 fetchList({url})。
   * 与 category 二选一或并存（宿主优先 url）；合集/专题类入口用它。
   * 兼作 iOS 宿主「网站原页」按钮地址（2026-10）：只给 category 的目录页在宿主里没有该按钮
   * （category 是内部查询串，宿主不拼、也不回退首页），能给出站点真实路由的目录页请写 url。
   * 显式 `origin` 字段优先于本字段（见下），url 已被别的语义占用时才需要它。
   */
  url?: string
  /**
   * 显式「网站原页」地址（2026-10，Q13）：插件明写的展示地址，只给宿主顶栏 globe 按钮用，
   * **不进抓取**（抓取仍走 url/category）。只在 url 不是网页地址或压根没有 url 时才需要写：
   * - `kind:'explore'` 条目的 url 是探索页标识（不是地址）——想给单分区探索页一颗 globe，
   *   就写 `origin`（如 video_site_a「gossip头条」`origin: BASE_URL + '/黑料gossip/推荐'`）；
   * - 只给 category 的目录页（宿主不拼内部查询串、也不回退首页）——站点目录页是真实路由
   *   时**优先直接写 url**，url 已被别的语义占用（或想与页面通道分开）时才用 origin；
   * 宿主取原页时 **origin 恒优先于 url**；留空 = 没写（回落 url），写了却拼不出合法
   * http(s) 则该条目不挂按钮（非空 origin 即权威，不静默改指 url）；两处都没有的条目
   * 一律隐藏按钮（勿回退首页）。
   */
  origin?: string
  category?: string
  /**
   * 入口类型（开放字符串，缺省 'list'）：list（目录/分类列表，默认）、search（预设搜索直达）、
   * series（合集/专题）、explore（探索页条目，listings-first）、tags（标签索引页，见 TagGroup）等。
   * 宿主对未知类型降级渲染为普通目录项，不拒绝插件。
   * explore 条目：内容形态 = `getExplore(context)` 的聚合 feed（ExploreSection[]），
   * `url` 为探索页标识（透传为 getExplore 的 context.url，缺省 = 默认探索页）——
   * **不是网页地址**，宿主不拿它当「网站原页」（video_site_a「gossip头条」`url:'news'` 曾拼出 /news = 404）；
   * 不消费 category/filters（feed 无目录页筛选语义）。
   * tags 条目：内容形态 = `getTags()` 的标签索引（legacy `TagGroup[]` 全量云或 `TagResult` 分页云），`url` 为索引页 URL
   * （如 `/tags/`，仅作展示/回退，验证走 getTags，不调 fetchList）。**`filters` 同样生效**：
   * 宿主在标签索引页渲染筛选栏，选中项与 `Listing.category` 合并成组合串经 `TagContext.category`
   * 透传给 `getTags`（kvs_site_a 案例 = 索引页「类型」开关）。`filters` 留空则与旧行为一致（纯标签云、无筛选栏）。
   */
  kind?: string
  /**
   * 分组/子菜单（导航树）：一级导航的下拉子菜单或深导航。宿主按 children **逐层渲染，
   * 呈现形态由宿主决定**：iOS 发现页 = 分级页签（每层一条 pill 页签行 + 单一分页器，叶子就地
   * 渲染列表/探索页/标签索引页）；DevConsole 预览与 runtime `listings` 校验 = 折叠树
   * （调试台要暴露插件声明的完整结构，刻意不跟随 iOS 形态）。只有叶子结点是可点击目录页
   * （分组结点自身不是内容页），递归结构、无层数上限；宿主不替站点取舍（声明什么就渲染什么）。
   */
  children?: Listing[]
  /**
   * 本目录页专属筛选组（可选，叶子目录页属性）；语义与 getCategories 的 CategoryGroup
   * 完全一致，但仅对该 listing 生效。`kind:'list'`（默认）走 `fetchList` 的 `context.category`；
   * `kind:'tags'` 走 `getTags` 的 `TagContext.category`（同编码同口径）；`kind:'explore'` 不消费
   * （feed 无目录页筛选语义，落地页筛选改挂分区的 `viewMore.filters`）。
   */
  filters?: CategoryGroup[]
  /**
   * 列表通道标识（替代 URL 正则分流）：声明本目录页进 `fetchList` 时走哪个解析分支
   * （如 kvs_site_a 的 'video-list' / 'album-list' / 'category-index'，取值由插件自定、宿主不解释）。
   * 宿主原样透传进 `PluginContext.channel`；插件优先按它分派，缺省时回退按 `url` 正则判定。
   * 取值建议复用插件内部分类函数的返回值（如 `classifyPath` 的 kind），新旧宿主双兼容。
   */
  channel?: string
}

export interface CategoryGroup {
  name: string
  key: string
  /** 筛选类型；缺省视为 select（与旧插件兼容） */
  type?: CategoryFilterType
  /** 选项（select/check/sort 使用；text 无选项可缺省）。与 sections 二选一：
   * 有 sections 时宿主渲染分节单组并忽略本字段（可缺省，iOS 侧可选）。 */
  items?: CategoryNode[]
  /**
   * 分节（可选，与 items 二选一）：单选择器内部分组显示（如 anime_site_a「内容标签」
   * 单组 7 节，忠于站内标签面板一个 modal 内 7 个 h5 分区的结构）。有 sections
   * 时宿主渲染**一个 widget**、节标题分组展示；状态/编码/计数与单组完全一致
   * （各节叶子读写同一 key 的状态）。旧宿主忽略本字段（只读 items），故新插件
   * 声明 sections 即要求宿主已升级（本仓库三端同版本升级，见 data-model.md）。
   */
  sections?: CategorySection[]
  /** 兼容别名：等价 type:'check'（无排除语义）；仅在未声明 type 时生效 */
  allowMultiple?: boolean
  /**
   * 仅 check：展示形态（checkbox 复选框列表 / tags 标签芯片云），缺省 checkbox。
   * tags = 多选 tag 样式：选项渲染为可多选的芯片云（同 select 的 chips 形态、
   * 多选语义），点击循环 未选→包含→（canExclude 时）排除→未选；编码与
   * checkbox 完全一致。未知值宿主按 checkbox 渲染；非 check 组忽略本字段。
   */
  display?: CategoryFilterDisplay
  /** 仅 check：true 时宿主渲染每个选项的「包含/排除」切换；排除值编码用 `-` 前缀 */
  canExclude?: boolean
  /** 仅 text：输入框占位文案 */
  placeholder?: string
  /** 仅 sort：是否支持升/降序切换；默认 false（固定顺序） */
  canAscend?: boolean
  /** 仅 sort：默认方向（未显式选择时；ascending 仅在 canAscend 时生效） */
  defaultValue?: SortDefaultValue
  /**
   * 联动父组 key（筛选组联动）：声明本组依赖的父组（按 key 寻址）。
   * 缺省 = 独立静态组（今天行为零变）；有值时宿主按父值求显隐/选项、切父清子。
   * 参与联动的 key 在同一 filters 数组内必须唯一（含父子不得同 key），违者校验报错。
   */
  dependsOn?: string
  /**
   * 可见条件（需配 dependsOn，缺 dependsOn 时校验报错、运行期忽略）。
   * 缺省 = 父取何值都显；有值时父值命中 equals 才显（父空值不等于任何非空值，
   * 想强制先选父就给子加本条件）。隐藏组不编码、不计角标。
   */
  visibleWhen?: CategoryVisibleCondition
  /**
   * 父值→子选项集（需配 dependsOn，缺 dependsOn 时校验报错、运行期忽略）。
   * 命中父值用映射表当てはまる、无命中/父空时回落默认 items/sections（老宿主恒看默认集）。
   * 映射值是扁平叶子数组：命中时宿主按单节扁平渲染（分节组的节标题此时不展示）。
   */
  optionsWhen?: Record<string, CategoryNode[]>
  /**
   * 切父清空策略（需配 dependsOn；独立组声明本字段宿主忽略）。
   * always（缺省/未知值回落）：父变即清子全切片；if-invalid：只清非法值
   * （select/sort 单值不在新选项集才清，check 过滤非法项，text 恒保留）。
   */
  clearPolicy?: CategoryLinkageClearPolicy
}

/** sort 组默认方向（CategoryGroup.defaultValue） */
export interface SortDefaultValue {
  index: number
  ascending: boolean
}

/**
 * 联动可见条件：父单值命中 equals 才显（字符串判相等、数组判包含）。
 * 父限 select/sort 单值组（check/text 做父校验报错）。
 */
export interface CategoryVisibleCondition {
  equals: string | string[]
}

/**
 * 联动清空策略：always 无条件清空（缺省）/ if-invalid 仅清非法值。
 * 开放字符串联合：未知值宿主按 always 处理。
 */
export type CategoryLinkageClearPolicy = 'always' | 'if-invalid' | (string & {})

/** 发现页分区：一组条目 + 可选「查看更多」跳转 */
export interface ExploreSection {
  title: string
  items: ListItem[]
  /** 「查看更多」跳转（依赖 PageJumpTarget） */
  viewMore?: PageJumpTarget
}

/** 发现页：多个分区组成的首页 feed（热门 / 最新 / 推荐等） */
export type ExploreFeed = ExploreSection[]

/**
 * getExplore 的可选上下文（探索页条目，listings-first）：
 * `url` 为探索页标识——对应 `Listing`（`kind: 'explore'`）条目的 `url` 字段，
 * 宿主逐条透传。缺省（undefined / 无 url）= 默认探索页，等价零参调用；
 * 旧插件忽略多参零改动。
 */
export interface ExploreContext {
  url?: string
}

/** 标签索引项：标签云中的单个标签（指向该标签的视频列表页） */
export interface TagItem {
  /** 标签显示名（站点原文，不归一化） */
  name: string
  /** 标签视频列表页绝对 URL（传给 fetchList 的页面通道） */
  url: string
  /** 该标签下的视频数（站点 `<em>` 计数；缺失不填） */
  count?: number
  /** 结构化跳转：点标签进列表（宿主优先用它，url 退为外链回退） */
  target?: PageJumpTarget
}

/** 标签索引分组：首字分组云按首字（`div.letter` 原文）聚合；分页排序云每页为单组（标题为排序页标识，如 `HOT 第1页`），组序/组内序忠于 DOM。 */
export interface TagGroup {
  /** 分组标题：首字分组云 = 首字原文（韩文/简繁/假名混排不归一，保持 DOM 原序）；分页排序云 = 排序页标识 */
  title: string
  tags: TagItem[]
}

/** 标签索引：多个分组组成的 `/tags/` 全量云（顺序保持 DOM 原序，不做拼音排序）；
 * 首字分组云（kvs_site_b）单次全量；分页排序云（video_site_b）按 `TagContext` 分页拉取，见 `TagResult`。 */
export type TagIndex = TagGroup[]

/**
 * 标签索引请求上下文：
 * - `page` 从 1 开始（缺省 1，分页标签索引 video_site_b 案例）；
 * - `category` 是**该索引页自己的筛选组合串**（编码，与 `fetchList` 的
 *   `context.category` 同口径）：`kind:'tags'` 叶子的 `Listing.filters` 由宿主渲染，
 *   选中项与 `Listing.category` 合并后透传（空筛选不传键）。kvs_site_a 案例 = 索引页右上的
 *   「类型」开关（`type=album` → 换抓图集侧索引页）。
 *
 * 旧插件忽略多参零改动（无参单次全量）。**`sort` 已退役**：服务端排序曾是
 * video_site_b 单站档位的宿主硬编码（`TagServerSort`），对无该能力的站是假能力；统一改由
 * 插件在 `Listing.filters` 里声明、宿主渲染、组合串走 `category`。
 */
export interface TagContext {
  page?: number
  category?: string
}

/**
 * 分页标签索引返回信封（video_site_b 案例）；`groups` 为本页分组（扁平云每页单组），
 * `pagination` 缺失表示该源无分页概念（等价 legacy 全量）。
 * 宿主判别：Array = legacy 全量（`TagIndex`）；Object（含 groups）= 分页。
 */
export interface TagResult {
  groups: TagGroup[]
  pagination?: PaginationMeta
}

// ===== 插件设置（Plugin Settings）=====

/** select 字段的下拉选项 */
export interface SettingOption {
  value: string
  label: string
}

/**
 * 设置字段：判别联合。
 * - 值类型 `select`（带 options）/ `switch` / `text`，由宿主按 run 注入为 `$lib.settings`，可选 `default`（插件代码自持，与 schema 共用同一常量）。
 * - action 类型（按钮），点击经 `'setting-action'` 动作调插件 `runSettingAction(key)`。
 */
export type SettingField =
  | { key: string; label: string; type: 'select'; default?: string; options: SettingOption[] }
  | { key: string; label: string; type: 'switch'; default?: boolean }
  | { key: string; label: string; type: 'text'; default?: string }
  | { key: string; label: string; type: 'action'; buttonText: string }

/** setting-action 处理函数的返回信封；message 缺失表示无反馈 */
export interface SettingActionResult {
  message?: string
}

// ===== 账号 / 声明式交互=====

/** 登录表单字段（声明式：插件声明，宿主渲染收集，值经 PluginContext.inputs 回传） */
export interface AccountField {
  name: string
  label: string
  /** text 明文 / password 掩码 / cookie 整段 cookie 文本 */
  type: 'text' | 'password' | 'cookie'
  placeholder?: string
  required?: boolean
}

/**
 * 账号 schema：插件声明「宿主可渲染的登录表单」。
 * - loginFields：密码登录字段（如 username/password）；缺失表示该源不支持密码登录。
 * - cookieFields：cookie 登录字段（通常单个 cookie 文本框）；缺失表示不支持 cookie 登录。
 * 两者都缺失表示该源无认证读侧。
 */
export interface AccountSchema {
  loginFields?: AccountField[]
  cookieFields?: AccountField[]
}

/** login 动作的返回信封；message 缺失表示无额外反馈 */
export interface AccountLoginResult {
  message?: string
  /** 登录成功后供宿主展示的用户标识 */
  uid?: string
  username?: string
}

/** me 动作的返回信封：登录态 + 写侧状态水合 */
export interface AccountMe {
  user?: { id?: string; nickname?: string; username?: string }
  /** 写侧开态表（effect id → 是否开态；缺席 = 关态，供宿主翻转/重水合） */
  states?: Record<string, boolean>
}

export interface LingshuPlugin {
  id: string
  name: string
  version: string
  fetchList(context?: PluginContext): Promise<ListResult>
  fetchDetail(url: string): Promise<ArticleDetail>
  fetchReadingPage?(url: string): Promise<ReadingPage>
  /**
   * 播放页解析：把「剧集对应的播放页 URL」解析成最终可播放的视频流。
   * 播放页含播放器配置（如 maccms 的 player_aaaa + 自定义播放器），剧集 URL 不是媒体 URL；
   * 宿主在用户点选剧集时懒调用，按会话缓存结果。
   */
  fetchPlayUrl?(url: string): Promise<PlayUrlResult>
  search?(query: string, context?: PluginContext): Promise<ListResult>
  getCategories?(): Promise<CategoryGroup[]>
  /** 预设目录页（listings）：站点固定目录入口（如「最新A漫/月排行」），
   * 宿主据此渲染源主页页签。可选；category 直接传给 fetchList。 */
  getListings?(): Promise<Listing[]>
  /** 发现页 feed（首页多分区聚合）；可选。
   * context 可选（探索页条目，listings-first）：url 为探索页标识（Listing.kind==='explore'
   * 条目的 url 字段透传），缺省 = 默认探索页。旧插件忽略多参零改动。 */
  getExplore?(context?: ExploreContext): Promise<ExploreFeed>
  /** 标签索引（`/tags/` 全量云，首字分组；分页云见 `TagResult`）；可选。
   * 内容形态 = TagGroup[]（legacy 全量，分组标题为首字原文，组内为标签项，跳转目标为标签视频列表页）
   * 或 TagResult（分页：本页 groups + pagination；筛选组合串见 `TagContext.category`）。
   * 与 fetchList 正交：索引页本身不是视频列表，`fetchList({url:'/tags/'})` 应明确报错指引到 getTags。 */
  getTags?(context?: TagContext): Promise<TagIndex | TagResult>
  /** 声明设置字段（值类型 + action）；可选。宿主据此渲染表单并按 run 注入 $lib.settings */
  getSettingsSchema?(): SettingField[]
  /** 处理 action 型设置按钮；经 `'setting-action'` 动作派发，key 为字段 key */
  runSettingAction?(key: string): Promise<SettingActionResult | void>
  /**
   * 声明账号登录表单（声明式交互）。可选；缺失表示该源无认证读侧。
   * 宿主据此渲染登录表单，收集的值经 `PluginContext.inputs` 回传给 `login`。
   */
  getAccountSchema?(): AccountSchema | Promise<AccountSchema>
  /**
   * 密码登录：经 `'login'` 动作派发，inputs 为宿主从 loginFields 收集的值。
   * 返回的 uid/username 供宿主展示登录态；登录产生的 session cookie 由共享
   * cookie jar 自动续到后续读取 run。
   */
  login?(inputs: Record<string, string>): Promise<AccountLoginResult>
  /**
   * 退出登录（经 `'logout'` 动作派发，无参）：清 token + 本站 cookie。
   * 未登录时静默成功（幂等）。
   */
  logout?(): Promise<{ message?: string }>
  /**
   * 当前登录态 + 写侧状态水合（经 `'me'` 动作派发，无参）。
   * 未登录时抛错（消息含 `loginRequired`，宿主据此引导登录）。
   * states 供宿主翻转/重水合（effect id → 是否开态）。
   */
  getMe?(): Promise<AccountMe>
  /**
   * 通用写侧调用（经 `'invoke'` 动作派发，target 为方法名，params 为参数）。
   * 宿主按卡片声明直调插件同名导出 `plugin[function](params)`，此处不逐一声明；
   * 插件按需导出任意 `(params: Record<string, unknown>) => Promise<unknown>` 方法，
   * 结果须为 JSON（终态键缺省 `active`，插件可在声明中改 `resultKey`）。
   */
}

// ===== 运行时类型 =====

// ===== $lib.ui：插件直问用户=====

/** confirm 的按钮 */
export interface UiButton {
  /** 按钮文案 */
  text: string
  /** 按钮返回值；缺省时用 text 作为返回值 */
  value?: string
}

/**
 * $lib.ui 发给宿主的交互请求（判别联合）。宿主据此渲染对应 UI 并回传结果。
 * - input：文本输入（如验证码）；image 为 base64（可带 data: 前缀）。
 * - confirm：多按钮确认；返回所点按钮的 value（缺省 text）。
 * - message：toast / 提示，fire-and-forget（无返回值）。
 * - launchUrl：打开外链，fire-and-forget（无返回值）。
 */
export type UiPrompt =
  | { kind: 'input'; title: string; message?: string; image?: string; placeholder?: string }
  | { kind: 'confirm'; title: string; message: string; buttons: UiButton[] }
  | { kind: 'message'; text: string }
  | { kind: 'launchUrl'; url: string }

/** input 返回用户输入的文本；confirm 返回所点按钮的 value/text；message/launchUrl 无返回 */
export type UiResponse = string | void

/**
 * 宿主处理一次 $lib.ui 请求。
 * - input/confirm：必须 resolve 用户的结果（插件正在 await）。
 * - message/launchUrl：resolve 即可（插件不等返回值）。
 * 未提供（undefined）时：input/confirm 清晰报错（headed 原语要求人类，不静默降级），
 * message/launchUrl 静默 no-op（非关键副作用，不藏 bug）。
 */
export type UiRequestHandler = (prompt: UiPrompt) => Promise<UiResponse>

export interface SandboxApis {
  $lib: {
    http: {
      get(url: string, options?: Record<string, any>): Promise<{ status: number; headers: Record<string,string>; body: string }>
      post(url: string, data?: any, options?: Record<string, any>): Promise<{ status: number; headers: Record<string,string>; body: string }>
      /** DELETE（写侧取消语义：取关/取消点赞/取消收藏） */
      del(url: string, options?: Record<string, any>): Promise<{ status: number; headers: Record<string,string>; body: string }>
      setCookies(url: string, cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): void
      getCookies(url: string): Array<{ name: string; value: string; domain?: string; path?: string }>
      deleteCookies(url: string): void
    }
    storage: {
      set(key: string, value: string): void
      get(key: string): string | undefined
      remove(key: string): void
      clear(): void
    }
    /** 用户偏好（宿主按 run 注入，只读、不持久）；get 返回用户值或 undefined，默认值由插件代码自持 */
    settings: {
      get(key: string): string | boolean | undefined
    }
    util: {
      randomUUID(): string
      randomInt(min: number, max: number): number
      randomDouble(min: number, max: number): number
    }
    /**
     * 插件直问用户（mid-run、插件直发）。Promise 式 await，非 Venera 的 callback。
     * 窄口径：只收「插件直问」类（验证码/确认/toast/开链接），不含结构化选择器（那是多 run 流）。
     */
    ui: {
      /** 文本输入（验证码等）；image 为 base64 验证码图。await 返回用户输入串 */
      showInputDialog(title: string, options?: { message?: string; image?: string; placeholder?: string }): Promise<string>
      /** 多按钮确认；await 返回所点按钮的 value（缺省 text）；buttons 缺省为 [取消, 确定] */
      confirm(title: string, message: string, buttons?: UiButton[]): Promise<string>
      /** toast / 提示，fire-and-forget（不等宿主、无返回值） */
      showMessage(text: string): void
      /** 打开外链，fire-and-forget（不等宿主、无返回值） */
      launchUrl(url: string): void
    }
  }
}

// ===== Plugin 元数据头解析 =====

export interface PluginMeta {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  sourceUrl?: string
  tags?: string[]
}

export function parsePluginMeta(code: string): PluginMeta | null {
  const match = code.match(/\/\/ ==Plugin==\n([\s\S]*?)\/\/ ==EndPlugin==/)
  if (!match) return null
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/\/\/\s*(\w+):\s*(.+)/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return {
    id: meta['id'] || '',
    name: meta['name'] || '',
    version: meta['version'] || '',
    author: meta['author'],
    description: meta['description'],
    sourceUrl: meta['sourceUrl'],
    tags: meta['tags']?.split(',').map(t => t.trim())
  }
}

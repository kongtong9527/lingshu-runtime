// ==Plugin==
// id: your-plugin-id
// name: 插件显示名称
// version: 1.0.0
// author: your-name
// description: 一句话描述插件做什么
// sourceUrl: https://example.com
// tags: tag1,tag2
// ==EndPlugin==

/**
 * 灵枢插件模板（单文件自包含，不能 require/import 外部模块）。
 *
 * 用法（第三方任意目录，默认）：`lingshu init <plugin-id>` 生成骨架后，填好顶部元数据头
 * （id/name/version 必填；自建分发仓时 description 必须与 `manifest.json` 对应条目完全一致，
 * 格式与三处一致校验见 `references/manifest.md`）。
 * 按阶段 1 的 fixture 与接口/选择器记录实现下面各方法，不需要的可选方法直接删掉
 * （不要留着抛错的空壳）。
 * 验证（插件所在目录，先 `lingshu --version` 确认全局 CLI 就绪）：
 *    `lingshu run <plugin-id> list --dir .`
 *    离线：加 `--fixture _fixtures/<plugin-id>/list.html`（不发真实网络）；
 *    详情/搜索/阅读/播放/分类/探索/标签：`run <id> detail "<url>"` / `search "词"` /
 *    `reading "<url>"` / `play "<url>"` / `categories` / `explore [--url <标识>]` /
 *    `tags [--page N]`；目录页逐条验证：`listings <id> --dir .`。
 * （母仓等价：仓根先 `npm run -w runtime build`，`lingshu` 换 `node runtime/dist/index.js`，
 * `--dir .` 换 `--dir lingshu-plugins`，`_fixtures/` 前加 `lingshu-plugins/`。）
 *
 * 契约速查（npm 包内路径 `skills/lingshu-plugin-dev/references/`，母仓内为
 * `lingshu-skills/lingshu-plugin-dev/references/`）：`data-model.md`（全部返回结构）、
 * `references/api-reference.md`（`$lib` 完整能力）、`references/video-playback.md`（video/episodes）、
 * `references/listings.md`（目录页 17 条准则）、`references/pitfalls.md`（踩坑全文）。
 *
 * 沙箱红线：没有 `require` / `import` / `fetch` / `XMLHttpRequest` / `fs` / `process` /
 * `setTimeout` / `setInterval` / 原生 `Buffer` / `URL` 全局——网络统一走 `$lib.http`，
 * 解析走 `$lib.cheerio`，二进制走 `$lib.Buffer`。
 * 地址解析优先用下方的无正则 helper（`splitPath` / `isHttpUrl`），类型分流优先用
 * `context.channel`（ADR-0064），正则只留在「文本清洗 / 站点原文匹配」两类。
 */

// ===== 站点常量（TODO：按目标源填写）=====

const BASE_URL = 'https://example.com'
const SOURCE_NAME = '示例来源'
const PAGE_SIZE = 20
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ===== 基础工具 =====

/** 单行文本：压空白。简介等多行字段不要用它（会吃掉换行），用 cleanMultiline。 */
function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
}

/** 多行文本：先把 `<br>` 转成分行，再逐行清洗后拼回（宿主按 pre-wrap 保留换行）。 */
function cleanMultiline($el) {
  $el.find('br').replaceWith('\n')
  return String($el.text() || '')
    .split('\n')
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0)
    .join('\n')
}

/** 绝对地址：沙箱无 `URL` 全局，一律字符串拼接。 */
function absoluteUrl(href) {
  const value = cleanText(href)
  if (!value) return ''
  if (isHttpUrl(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `${BASE_URL}${value}`
  return `${BASE_URL}/${value}`
}

/** 是否绝对 http(s) 地址（替代 `/^https?:\/\//i`，无正则）。 */
function isHttpUrl(value) {
  const s = String(value || '').toLowerCase()
  return s.startsWith('http://') || s.startsWith('https://')
}

/**
 * 路径切段：`/albums/categories/jav/` → `['albums','categories','jav']`。
 * ID/slug 提取一律走它，不要为取某一段写一次性正则——**尤其别用 `\d+` 取 id**：
 * 站点 id 常是 16/24 位 hex（Mongo ObjectId），`\d+` 只吃到数字前缀、静默截断
 * （`5887fcd476654036` → `5887`），请求照发、详情恒报「不存在/已下架」，
 * 看着像内容下架或接口改版（详见 references/pitfalls.md 同名条目）。
 */
function splitPath(path) {
  return String(path || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter((seg) => seg.length > 0)
}

/**
 * 通道决议（ADR-0064）：有 `context.channel` 即用它（新宿主经 `Listing.channel` /
 * `PageJumpTarget.list.channel` 透传，插件声明即分派、零正则）；缺省才回退到按 `url`
 * 判定的旧函数（旧宿主 / 裸 `--url` 调试的单点正则，勿在各分支重复写）。
 */
function resolveChannel(ctx, fallbackFromUrl) {
  const declared = cleanText(ctx && ctx.channel)
  if (declared) return declared
  return fallbackFromUrl(String((ctx && ctx.url) || ''))
}

/**
 * 取路径：剥掉协议+域名与 query/hash。**页面通道（ADR-0025）按 URL 分派形态时必须用它**——
 * `context.url` 是完整绝对地址（`https://host/path/`），直接拿 `/^\/tags\/?$/` 这类正则判
 * 一律不命中，会整体落进兜底分支（该报错指路的页静默走错分支、索引页当列表解析成 0 条）。
 */
function pathOf(url) {
  let s = String(url || '')
  const m = s.match(/^https?:\/\/[^/]+(\/.*)?$/i)
  if (m) s = m[1] || '/'
  const q = s.indexOf('?')
  if (q >= 0) s = s.slice(0, q)
  const h = s.indexOf('#')
  if (h >= 0) s = s.slice(0, h)
  return s || '/'
}

/**
 * 取图片真址（lazy-load 站必备）。**同一页面两态真值所在字段相反**：
 * SSR 原文里 `src` 是 1px gif 占位、真值在 `data-original`/`data-webp`；
 * 浏览器渲染后 `data-original` 被 lazy-load 库删掉、`src` 才成真值。故三段兜底 + 跳占位，
 * 只读 `data-original` 在线必空、只读 `src` 离线 fixture 必空（详见 references/pitfalls.md）。
 */
function pickImage($img) {
  if (!$img || !$img.length) return ''
  const candidates = [
    $img.attr('data-original'),
    $img.attr('data-webp'),
    $img.attr('data-src'),
    $img.attr('src'),
  ]
  for (let i = 0; i < candidates.length; i += 1) {
    const value = cleanText(candidates[i])
    if (value && !/^data:/i.test(value)) return absoluteUrl(value)
  }
  return ''
}

function pageNumber(context) {
  const page = Number(context && context.page)
  return page > 0 ? Math.floor(page) : 1
}

function pageSize(context) {
  const size = Number(context && context.pageSize)
  return size > 0 ? Math.floor(size) : PAGE_SIZE
}

/**
 * 解析组合查询串（如 `region=cn&state=serial&type=rexue`）。
 * 契约：重复 key 后者覆盖（与宿主同 key 多组语义一致，禁止抛错）；
 * value 保持原文不解码（标签 id 常含 `%3D` 这类编码，需原样拼回路径，
 * text 类型输入框的值用时再自行 `decodeURIComponent`）。
 */
function parseCategory(category) {
  const raw = String(category || '').trim()
  if (!raw) return {}
  if (raw.indexOf('=') < 0) return { category: raw }
  const params = {}
  raw.split('&').forEach((pair) => {
    if (!pair) return
    const idx = pair.indexOf('=')
    if (idx <= 0) return
    let key = pair.slice(0, idx)
    try {
      key = decodeURIComponent(key)
    } catch (e) { /* 保留原文 */ }
    params[key] = pair.slice(idx + 1)
  })
  return params
}

/**
 * 从一段文本里取**第一个完整平衡的 JSON 对象**（内嵌 JSON 兜底解析）。
 * 用途：页面 `<script type="application/ld+json">` / 内联 `:images="[…]"` 这类内嵌 JSON
 * **常是畸形的**（尾部多一个 `}`、后面还跟着别的片段），直接 `JSON.parse` 报
 * 「Unexpected non-whitespace character after JSON」——按大括号配平截取再 parse 即可
 * （字符串内的括号与转义要跳过，否则遇到 `{"a":"}"}` 会提前截断）。
 * 注意与 flight/RSC payload 的配平规则**不同**：那类 payload 引号带反斜杠，判据是反斜杠奇偶
 * （见 references/website-analysis.md）；本 helper 只处理标准 JSON 的括号配平。
 */
function extractBalancedJson(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i += 1) {
    const c = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 统一抓取：桌面 UA + 超时；SSL 证书验不过的站加 `rejectUnauthorized: false`；
 * 命中宿主挑战判定（`code === 'CHALLENGE'`）直接抛，由宿主验证入口接管——
 * 到万不得已禁止用 `$lib.browser.getHtml`（判据见 api-reference「Cloudflare 挑战」节）；
 * 普通 4xx/5xx 且解析不出内容才抛错（见 assertParsed）。
 */
async function request(url, headers) {
  const opts = {
    headers: Object.assign({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }, headers),
    timeout: 20000,
    // rejectUnauthorized: false, // 证书验不过（UNABLE_TO_VERIFY_LEAF_CERTIFICATE）时取消注释
  }
  return await $lib.http.get(url, opts)
}

/** 通用失败判定：HTTP 出错但解析出了条目即算成功（半信任 403 + 真内容照常放行）。 */
function assertParsed(url, res, got) {
  if (res.status >= 400 && !got) throw new Error(`GET ${url} 失败: HTTP ${res.status}`)
}

// 详情 URL 归一化示例（manga_site_e 教训）：详情语义依赖尾斜杠的站（`/novel123/` 有内容、
// `/novel123` 回首页），入口处把无斜杠形态补齐后再请求，并以补齐地址回传 sourceUrl。
// 不需要时不要调用，章节页（`*.html` 等）一律原样透传。
// function normalizeDetailUrl(url) {
//   const raw = String(url || '')
//   let end = raw.length
//   const queryIdx = raw.indexOf('?')
//   if (queryIdx !== -1) end = Math.min(end, queryIdx)
//   const hashIdx = raw.indexOf('#')
//   if (hashIdx !== -1) end = Math.min(end, hashIdx)
//   const head = raw.slice(0, end)
//   const tail = raw.slice(end)
//   if (/\/novel\d+\/?$/i.test(head) && !head.endsWith('/')) return `${head}/${tail}`
//   return raw
// }

module.exports = {
  id: 'your-plugin-id',
  name: '插件显示名称',
  version: '1.0.0',

  /**
   * 获取内容列表。必须返回 `ListResult`（`{ items, pagination?, layout? }`），
   * 不要返回裸数组。`pagination` 缺省 = 该源无分页概念，不要伪造 `hasMore`。
   *
   * 列表页**自己带筛选控件**时随结果声明 `filters`（ADR-0066，与 `Listing.filters` 同型同编码：
   * `[{ name, key, type:'select', items:[{id,name}] }]`）——宿主在落地列表页渲染筛选行，
   * 选中项并入 `category` 再回调本方法的同一个 `url`。用于「**只有抓到页面才知道**」的选项
   * （按页不同、且只活在 HTML 里的控件）；选项来自卡片就知道的静态筛选走
   * `PageJumpTarget.list.filters`，进页前就要渲染的目录页筛选走 `Listing.filters`。
   * 页面**没有**该控件就别声明（空组 = 点不动的假入口）；同站不同通道的排序可能是两套 key，
   * 各写各的常量表，勿复用兄弟通道那一份。
   * @param {Object} [context]
   * @param {string} [context.category] - 组合查询串（与 getCategories 的 key 对齐）
   * @param {string} [context.url] - 页面通道：任意列表页 URL（合集/专题/分类落页），按 URL 分派
   * @param {string} [context.channel] - 列表通道标识（ADR-0064）：`Listing.channel` /
   *   `PageJumpTarget.list.channel` 的透传，有则优先按它分派、无则回退按 url 判定
   * @param {number} [context.page] - 页码（从 1 开始；通道页必须消费它，不能只从 URL 反解析页码）
   * @param {number} [context.pageSize] - 每页数量
   * @param {string} [context.cursor] - 游标（仅 cursor 策略回传上一页的 nextCursor）
   * @returns {Promise<import('lingshu-runtime').ListResult>}
   */
  async fetchList(context) {
    const ctx = context || {}
    const params = parseCategory(ctx.category)
    // 通道优先（ADR-0064）：新宿主恒带 channel，零正则；旧宿主/裸 --url 才走回退函数。
    // const channel = resolveChannel(ctx, (url) => classifyByUrl(pathOf(url)))
    // switch (channel) { case 'video-list': ...; case 'album-list': ...; }
    const channelUrl = String(ctx.url || '')
    const page = pageNumber(ctx)
    // const size = pageSize(ctx)

    // 示例 A：JSON API
    // const url = `${BASE_URL}/api/list?${ctx.category || ''}&page=${page}`
    // const res = await request(url)
    // const json = JSON.parse(res.body)
    // const items = (json.data || []).map((item) => ({
    //   id: String(item.id),
    //   title: cleanText(item.title),
    //   summary: item.desc ? cleanText(item.desc) : undefined,
    //   coverUrl: item.cover ? absoluteUrl(item.cover) : undefined,
    //   url: absoluteUrl(item.url || `/detail/${item.id}`),
    //   publishTime: item.time ? Number(item.time) : undefined,
    //   // 想让列表「看见」发布时间：publishTime 只是数据字段（宿主瀑布流卡不渲染它），
    //   // 必须同时给角标 —— 缺这条不报错、只是用户永远看不到时间（右上与已读标并排避让）
    //   badges: item.time ? { topRight: { text: { value: Number(item.time), format: 'relative' } } } : undefined,
    //   // 但站点原文本来就是相对文案（`2 days ago`）时**别换算时间戳**：宿主 publishTime 走
    //   // **绝对**时间格式化，会渲染成凭空的「2026年10月9日 00:00」；直接换词给中文串即可，
    //   // 且保持原文档位（`1 week ago` → '1周前'，`12 months ago` → '12个月前'）
    //   // badges: addedText ? { topRight: '2天前' } : undefined,  // 由站点原文换词而来
    // }))
    // assertParsed(url, res, items.length > 0)
    // // 空页必须 hasMore:false；无可靠分页信号就省略 pagination，只返回 { items }
    // if (!items.length) return { items, pagination: { strategy: 'page', hasMore: false, page } }
    // return { items, pagination: { strategy: 'page', hasMore: true, page, totalPages: json.totalPages } }

    // 示例 B：HTML 页面（选择器按阶段 1 实测填写；推广卡按 href 形态白名单过滤，
    // 不要按标题黑名单；含多子字段的父容器不要整体 .text()，分别提取再拼接）
    // const url = channelUrl || `${BASE_URL}/list?page=${page}`
    // const res = await request(url)
    // const $ = $lib.cheerio.load(res.body)
    // const items = []
    // const seen = new Set()
    // $('.item').each((i, el) => {
    //   const $el = $(el)
    //   const href = $el.find('a').attr('href') || ''
    //   if (!/\/\d+\/?$/i.test(href) && !href.startsWith('/detail/')) return // 非内容链跳过（站外推广卡）
    //   const abs = absoluteUrl(href)
    //   if (!abs || seen.has(abs)) return
    //   seen.add(abs)
    //   items.push({ id: abs, title: cleanText($el.find('a').text()), url: abs })
    // })
    // assertParsed(url, res, items.length > 0)
    // if (!items.length) console.warn(`${SOURCE_NAME}: 未解析到内容列表，页面结构可能已变化`)
    // return { items, pagination: { strategy: 'page', hasMore: items.length > 0, page } }

    // 示例 C：游标分页（hasMore:true 时 nextCursor 必填；items 为空时 hasMore 必为 false）
    // return { items, pagination: { strategy: 'cursor', hasMore: true, nextCursor: json.next } }

    void params
    void channelUrl
    void page
    throw new Error('fetchList 未实现')
  },

  /**
   * 获取内容详情。头部去重：宿主已展示标题与封面，正文不要重复返回首块同文 heading、
   * 与封面同 URL 的 image；有阅读页的站详情只出 `chapter` 入口，不要内联阅读图；
   * 信息能收尽收（分类/作者/日期/计数/标签/简介/封面/推荐，有则收录、无则省略、不伪造）。
   * @param {string} url - 详情页 URL（来自 ListItem.url）
   * @returns {Promise<import('lingshu-runtime').ArticleDetail>}
   */
  async fetchDetail(url) {
    const targetUrl = String(url || '')
    // const res = await request(targetUrl)
    // const $ = $lib.cheerio.load(res.body)
    // const blocks = []
    // blocks.push({ type: 'text', title: '简介', content: cleanMultiline($('.description')) })
    // blocks.push({ type: 'image', url: absoluteUrl($('.cover img').attr('src')), caption: '封面' })
    // // 图片组（截图/图集预览等**没有阅读页通道**的组）：必须给原图链 `a[href]`，
    // // 不是 `img` 的缩略图 —— 宿主全屏预览复用同一 URL，给缩略图 = 点开还是糊的（不报错）
    // const shots = []
    // $('.block-screenshots a.item').each((i, el) => { const h = absoluteUrl($(el).attr('href')); if (h) shots.push({ url: h }) })
    // if (shots.length) blocks.push({ type: 'gallery', images: shots })
    // // 章节入口（阅读页 URL；单话/单图集无章节结构时用单条目指向自身，并带上阅读 target）
    // const chapters = []
    // $('.chapter-list a').each((i, el) => {
    //   const href = absoluteUrl($(el).attr('href'))
    //   if (href) chapters.push({ title: cleanText($(el).text()), url: href, target: { action: 'reading', url: href } })
    // })
    // if (chapters.length) {
    //   blocks.push({ type: 'divider' })
    //   blocks.push({ type: 'chapter', content: chapters })
    // }
    // // 标签（url 必须能还原跳转：query 形态直接可用，path 形态补 query；需要内部导航时加 target）
    // blocks.push({ type: 'tags', content: [{ name: '示例', url: `${BASE_URL}/list?type=xxx` }] })
    // // 详情页的实体字段（分类/主演/标签/作者）是可点列表入口，不是一行死字——站点支持按它筛列表
    // // 就接上（tagGroups 一行一种类型、tags 扁平；两者芯片跳转语义相同，皆吃 target）：
    // // ① 参数先按「无参 total / 有效值 / 无效值必须回 0」三点对照验生效性（total 有封顶噪声时看首几条 id）；
    // // ② 站点的排序档经 **target.filters** 带上（**别写进 base category**：宿主应用筛选是
    // //    `mergeListingCategory` 纯拼接，base 里再带一个 order 就拼出重复键；缺省档让 fetchList 自己兜）；
    // // ③ 落地地址用**自造稳定标识**（带参内部路由通常不可深链——SPA 的 push 路由参数不进 URL），
    // //    标识让 classifyUrl 认得出、fetchList 在 category 缺参时拿它兜底。案例见 listings.md 规则 18。
    // // blocks.push({ type: 'tagGroups', title: '信息', groups: [
    // //   { name: '分类', content: [{ name: catName, url: `${BASE_URL}/cat/${catId}`,
    // //     target: { action: 'list', url: `${BASE_URL}/cat/${catId}`, category: `cat_id=${catId}`,
    // //       channel: 'video-list', filters: [{ name: '排序', key: 'order', type: 'select',
    // //         items: [{ id: 'new', name: '最近更新' }, { id: 'hot', name: '热度最高' }] }] } }] },
    // // ] })
    // // 推荐块：块级 title 如实命名维度（缺省宿主渲染「推荐」）；**站点有该维度的完整列表页**
    // // 才写块级 viewMore（与发现页分区 viewMore 同型），无对应列表页就不写——宿主无 viewMore
    // // 不渲染按钮，写了却没有 = 死「更多」。落地页分页由 fetchList 按 context.page 驱动，
    // // 站方「更多」是 AJAX 锚（href 不是地址）时，按锚上的块参数把通道复刻进 fetchList：
    // // if (related.length) blocks.push({ type: 'recommendations', title: '相关推荐',
    // //   content: related, viewMore: { action: 'list', url: targetUrl, category: 'related=1' } })
    // // 影视站用 episodes（剧集 url 是播放页，经 fetchPlayUrl 懒解析；网盘线路按名剔除）：
    // // blocks.push({ type: 'episodes', lines: [{ name: '线路1', episodes: [
    // //   { title: '1', url: playPageUrl, target: { action: 'play', url: playPageUrl } },
    // // ] }], poster: coverUrl })
    // // 视频直链站用 video（CDN 验 Referer 时带上 referer；多 URL 清晰度声明 qualities，
    // // master playlist 零声明；懒解析占位则不带 url、只带 target.play + poster）：
    // // blocks.push({ type: 'video', url: playUrl, poster: coverUrl, platform: 'xxx', referer: targetUrl })
    // assertParsed(targetUrl, res, blocks.length > 0)
    // return { title: cleanText($('h1').first().text()), sourceName: SOURCE_NAME, sourceUrl: targetUrl, blocks }
    void targetUrl
    throw new Error('fetchDetail 未实现')
  },

  /**
   * 获取阅读页内容（漫画/图片集/单页全文小说的章节页）。不需要的站删除本方法；
   * 单页全文类（整篇小说/长帖）不要走它，`fetchDetail` 直接出 text blocks。
   * **图集/漫画站（易静默失败）：`pages` 必须取原图链**——展示用的 `img` 常是缩略图
   * （如 `albums/main/200x150/…`），真正的大图在外层 `<a href>` 或查看器属性里（常带鉴权 token，
   * 如 `/get_image/…?i-acctoken=`）。取错**不报错**、宿主照常渲染，只是用户看到糊图；
   * 务必另收缩略图并断言「页数 == 站点声明张数」（见 data-model.md ReadingPage 节）。
   * @param {string} url - 阅读页 URL（章节/漫画阅读页面）
   * @returns {Promise<import('lingshu-runtime').ReadingPage>}
   */
  async fetchReadingPage(url) {
    // const res = await request(url)
    // const $ = $lib.cheerio.load(res.body)
    // const pages = []
    // $('.comic-page img').each((i, el) => {
    //   const src = $(el).attr('data-src') || $(el).attr('src') // SSR 只有 data-src 时不要依赖运行时属性
    //   if (src && !/^data:image\//i.test(src)) pages.push(absoluteUrl(src))
    // })
    // // 图集站改取**原图链**（img 多为缩略图，取错只是投糊图、不报错）：
    // // $('.images a.item').each((i, el) => { const href = absoluteUrl($(el).attr('href')); if (href) pages.push(href) })
    // assertParsed(url, res, pages.length > 0)
    // return {
    //   title: cleanText($('title').text()),
    //   sourceName: SOURCE_NAME,
    //   sourceUrl: String(url),
    //   pages,
    //   prevUrl: absoluteUrl($('#prev-chapter').attr('href')) || undefined, // 站点导航，没有就省略
    //   nextUrl: absoluteUrl($('#next-chapter').attr('href')) || undefined,
    // }
    void url
    throw new Error('fetchReadingPage 未实现，不需要时请删除该方法')
  },

  /**
   * 播放页解析：把出流入口 URL（剧集播放页/视频详情页）解析为最终可播流。
   * 可多跳（播放页 → 播放器配置 → 解析接口 → 解密）；网盘线路/未知加密明确报错，
   * 不冒充能力；时效流（auth_key）现算现用。影视站之外的源删除本方法。
   *
   * 两条红线（详见 references/pitfalls.md）：
   * - **不消费门槛字段**：站点的会员限制常只做在前端（改响应 JSON 字段 / 改 localStorage /
   *   覆写 DOM），插件不经前端故天然成立。**门槛也可能只体现为「前端自己少传了一个参数」**
   *   （如访客请求带 `&is_trailer=1` 只拿预告 + 播放器挂 `:max-duration="30"`）——
   *   此处一律**不读 role/max-duration/join 按钮**，出流以接口是否给了地址为准；
   *   但要在列表 `tags` / 详情状态块**如实标注**这是会员内容（ADR-0061）。
   * - **时效签名地址必须现算**：CDN 路径带 `,<过期unix秒>` 时（实测 TTL 可能只有 20 分钟），
   *   详情页只出懒播放占位（`video` 无 `url` + `target.play`），绝不内联快照里的地址。
   *
   * @param {string} url - 出流入口 URL
   * @returns {Promise<import('lingshu-runtime').PlayUrlResult>}
   */
  async fetchPlayUrl(url) {
    // const html = (await request(url)).body
    // const m = String(html).match(/player_aaaa\s*=\s*(\{[^}]+\})/)
    // if (!m) throw new Error(`播放页配置无法识别: ${url}`)
    // const config = JSON.parse(m[1])
    // if (/网盘|quark|uc|baidu|ali|115|xunlei/i.test(`${config.from || ''}${config.url || ''}`)) {
    //   throw new Error(`线路「${config.from}」是网盘资源，暂不支持应用内解析`)
    // }
    // if (/^https?:\/\//.test(config.url)) return { url: config.url, platform: config.from }
    // throw new Error(`播放页配置无法识别: from=${config.from}`)
    void url
    throw new Error('fetchPlayUrl 未实现，不需要时请删除该方法')
  },

  /**
   * 搜索。签名与返回与 `fetchList` 一致（`ListResult` + `pagination`），
   * 复用同一套卡片解析与分页判定。无搜索能力的源删除本方法。
   * @param {string} query - 查询词
   * @param {Object} [context] - 同 fetchList 上下文（page/category/url）
   * @returns {Promise<import('lingshu-runtime').ListResult>}
   */
  async search(query, context) {
    // const page = pageNumber(context)
    // const url = `${BASE_URL}/search?q=${encodeURIComponent(String(query || ''))}&page=${page}`
    // const res = await request(url)
    // const $ = $lib.cheerio.load(res.body)
    // const items = [] // 复用 fetchList 的卡片解析
    // assertParsed(url, res, items.length > 0)
    // return { items, pagination: { strategy: 'page', hasMore: items.length > 0, page } }
    void query
    void context
    throw new Error('search 未实现，不需要时请删除该方法')
  },

  /**
   * 分类筛选分组（可选）。只有 search 真正消费的组才留在这里；
   * 目录型内容进 `getListings`，目录页专属筛选进 `Listing.filters`。
   * 注意：`id` 只填参数值（如 `cn`），不要带 `key=` 前缀；应用时宿主按类型编码
   *（select: `key=id`；check: `key=id1,id2,-id3`；text: 编码后输入；sort: `key=id[,asc|desc]`），
   * 站点不支持多选/排除就不要声明 `check`/`canExclude`。
   * @returns {Promise<import('lingshu-runtime').CategoryGroup[]>}
   */
  async getCategories() {
    // return [
    //   { name: '地区', key: 'region', items: [{ id: 'cn', name: '国内' }, { id: 'jp', name: '日本' }] },
    //   { name: '题材', key: 'type', items: [
    //     { id: 'rexue', name: '热血' },
    //     { id: 'xuanhuan', name: '玄幻', children: [
    //       { id: 'dongfang', name: '东方玄幻' },
    //       { id: 'xifang', name: '西方玄幻' },
    //     ] },
    //   ] },
    // ]
    throw new Error('getCategories 未实现，不需要时请删除该方法')
  },

  /**
   * 预设目录页（源主页页签，可选）。每个条目是固定目录页（不是筛选状态），
   * 宿主把 `category` 原样传给 `fetchList` 就地渲染，或按 `url` 走页面通道。
   * 规则：每个条目必经 `fetchList` 跑通（`runtime listings`）；能给出真实页面
   * 地址就写 `url`（只写 `category` 的页签没有「网站原页」按钮）；`kind: 'explore'`
   * 条目的 `url` 是探索页标识（不是地址，想挂按钮另写 `origin`）；`origin` 只喂展示、
   * 不进抓取且恒优先于 `url`；筛选是目录页的属性（`filters`），选项必须真实存在，
   * 反爬拦住的路由如实报错、不静默回退。**写进 `url`/`origin` 的地址必须实测**：SPA 的
   * 内部路由枚举名不等于 hash 路由（枚举 `community` 的页可能是 `#/post`，写出 `#/community`
   * 会是零请求的死页面、且不报错），**分组该装哪组页签也要按页面实测、别按名字猜**——验法是
   * 看该地址实际发什么请求（详见 references/pitfalls.md 与 listings.md 规则 15）。**索引页自带的页级控件也要声明**（右上角「类型开关」
   * `Videos | Albums`、A-Z 字母条、榜单/图集列表排序档）：类型开关在站点上多是**换页**不是
   * 查询参数 → 用插件内部 key（如 `type`）声明，并在 URL 构造处**拦下不转发**（漏拦 = 静默
   * 返回未筛选结果）；A-Z 走服务端参数（别做客户端过滤）；`kind:'tags'` 叶子**同样消费
   * `filters`**（组合串经 `TagContext.category` 回 `getTags`）。**日期/关键词这类文本档**
   * 用 `type:'text'`（`placeholder` 给格式），`fetchList` 里给缺省值——它常是端点的必需参数、
   * 缺参还可能报与原因无关的「网络异常」（详见 references/pitfalls.md）。
   * 通道标识（ADR-0064）：多形态站给每个叶子写 `channel`（取值自定，如 'video-list' /
   * 'album-list'），宿主透传进 `fetchList` 的 `context.channel`；`target: { action:'list' }`
   * 同样带 `channel`。插件优先按 channel 分派、无则回退 URL 正则——新链路零正则。
   * @returns {Promise<import('lingshu-runtime').Listing[]>}
   */
  async getListings() {
    // return [
    //   { name: '推荐', kind: 'explore' }, // 默认探索页（getExplore 无参）
    //   { name: 'gossip头条', kind: 'explore', url: 'news', origin: `${BASE_URL}/path/to/news` },
    //   { name: '标签', url: `${BASE_URL}/tags/`, kind: 'tags', // 标签索引页（走 getTags）
    //     filters: [{ name: '类型', key: 'type', items: [{ id: 'video', name: '视频' }, { id: 'album', name: '图集' }] }] },
    //   { name: '最新', url: `${BASE_URL}/latest`, category: 'order=latest', channel: 'video-list' },
    // ]
    throw new Error('getListings 未实现，不需要时请删除该方法')
  },

  /**
   * 发现页聚合（可选）。必须返回裸数组（不要包 `{ sections }` 信封）；
   * `viewMore` 必须是 `PageJumpTarget` 对象（不要传裸字符串）；
   * 多探索页按 `context.url`（对应 explore 条目的 `url`）分支，无 url = 默认探索页；
   * 首页只有一个分区时不设 explore，做普通列表即可。
   * @param {Object} [context]
   * @param {string} [context.url] - 探索页标识
   * @returns {Promise<import('lingshu-runtime').ExploreFeed>}
   */
  async getExplore(context) {
    // const pick = String((context && context.url) || '')
    // const sections = []
    // const hot = [] // 拉取某频道前 N 条，结构同 ListItem
    // if (hot.length) sections.push({ title: '热门', items: hot, viewMore: { action: 'list', category: 'sort=hot' } })
    // return pick ? sections.filter((s) => s.keys && s.keys.includes(pick)) : sections
    void context
    throw new Error('getExplore 未实现，不需要时请删除该方法')
  },

  /**
   * 标签索引（可选）。两种形态：首字分组全量云返回裸 `TagGroup[]`；
   * 分页排序云返回 `{ groups, pagination }` 信封（`context.sort` 为站点排序标识原文，
   * `context.page` 从 1 开始）。索引页本身不是视频列表：`fetchList({ url: '/tags/' })`
   * 应明确报错指引到本方法，标签视频列表走标签页 URL 的页面通道。
   * `context.category` 是**索引页自己的筛选组合串**（`Listing.filters` 的选中项，与 `fetchList`
   * 的 `context.category` 同口径；空筛选不传键）——服务端排序也是普通筛选组（`TagContext.sort` 已退役）。
   * @param {Object} [context]
   * @param {number} [context.page]
   * @param {string} [context.category] 索引页筛选组合串（如 `type=album`、`sort=views`）
   * @returns {Promise<import('lingshu-runtime').TagIndex | import('lingshu-runtime').TagResult>}
   */
  async getTags(context) {
    // const page = pageNumber(context)
    // const sort = parseCategory(context && context.category).sort === 'videos' ? 'videos' : 'views'
    // const url = `${BASE_URL}/tags/?sort=${sort}${page > 1 ? `&page=${page}` : ''}`
    // const res = await request(url)
    // const $ = $lib.cheerio.load(res.body)
    // const tags = [] // 解析为 { name, url: absoluteUrl(href), count?, target: { action: 'list', url } }
    // return { groups: [{ title: `${sort} 第${page}页`, tags }], pagination: { strategy: 'page', hasMore: tags.length > 0, page } }
    void context
    throw new Error('getTags 未实现，不需要时请删除该方法')
  },

  // ===== 以下为设置与账号（需要时取消注释并实现）=====
  //
  // // 用户偏好：宿主按 run 注入为只读 `$lib.settings`，默认值由插件代码自持。
  // getSettingsSchema() {
  //   return [{ key: 'quality', label: '清晰度', type: 'select', default: 'hd', options: [{ value: 'hd', label: '高清' }] }]
  // },
  // async runSettingAction(key) {
  //   if (key === 'checkin') return { message: '签到成功' }
  //   throw new Error(`未知设置动作: ${key}`)
  // },
  //
  // // 声明式登录：pre-run 已知的账号密码走 schema + inputs；run 中途才发现要问的
  // //（验证码/二次确认/toast）走 `await $lib.ui.showInputDialog/confirm/showMessage`（见 ccc 示例）。
  // // 登录响应的 Set-Cookie 由宿主 jar 自动续到后续读取 run；退出时清 token + deleteCookies。
  // getAccountSchema() {
  //   return { loginFields: [{ name: 'username', label: '账号', type: 'text', required: true }, { name: 'password', label: '密码', type: 'password', required: true }] }
  // },
  // async login(inputs) {
  //   const body = `username=${encodeURIComponent(inputs.username)}&password=${encodeURIComponent(inputs.password)}`
  //   const res = await $lib.http.post(`${BASE_URL}/login`, body, { contentType: 'application/x-www-form-urlencoded', headers: { 'User-Agent': USER_AGENT } })
  //   const data = JSON.parse(res.body)
  //   if (data.code !== 200) throw new Error(data.msg || '登录失败')
  //   return { uid: String(data.uid), message: '登录成功' }
  // },
  // async logout() {
  //   $lib.http.deleteCookies(BASE_URL)
  //   return { message: '已退出登录' }
  // },
  // async getMe() {
  //   // 未登录直接抛含 loginRequired 的错（宿主据此引导登录），不要发请求
  //   throw new Error('loginRequired: 请先到设置页登录')
  // },
  //
  // // 通用写侧调用：卡片声明 `target: { action: 'invoke', call: { function: 'setLike', params } }`
  // // 时宿主通用直调同名导出，无需逐一声明；终态以服务端返回为准。
  // // async setLike(params) {
  // //   const res = await $lib.http.post(`${BASE_URL}/like`, { id: params.id }, { headers: { 'User-Agent': USER_AGENT } })
  // //   const data = JSON.parse(res.body)
  // //   if (data.code !== 200) throw new Error(data.msg || '操作失败')
  // //   return { active: true }
  // // },
}

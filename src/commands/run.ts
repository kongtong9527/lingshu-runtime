import path from 'node:path'
import fs from 'node:fs'
import { loadPlugin } from '../plugin-loader.js'
import { createSandbox, type Sandbox } from '../sandbox.js'
import type { PluginContext, UiRequestHandler } from '../types.js'
import type { SettingValue } from '../runtime/settings.js'
import type { RequestRecorder, CookieJar, HttpResponse } from '../runtime/http.js'
import { isChallengeResponse, challengeError } from '../runtime/challenge.js'

export interface RunOptions {
  page?: string
  /** 筛选组合串（ADR-0014 编码）：list/search 走 `PluginContext.category`，
   *  tags 走 `TagContext.category`（标签索引页自己的筛选，如 kvs_site_a `type=album`）——
   *  两者同口径（目录页筛选组 key=id），只是落到的 context 字段不同。 */
  category?: string
  /** 页面通道（ADR-0025）：list 用的任意页面 URL，透传进 PluginContext.url */
  url?: string
  /** 列表通道标识（ADR-0064）：list/search 用，原样透传进 PluginContext.channel */
  channel?: string
  fixture?: string
  dir?: string
  /** 游标分页令牌（list/search 用，透传进 PluginContext.cursor） */
  cursor?: string
  /** 收集插件内 $lib.http.get/post 的请求记录（供 DevConsole 展示） */
  onRequest?: RequestRecorder
  /** 用户偏好值（按 run 注入为 $lib.settings，只读、不持久） */
  settings?: Record<string, SettingValue>
  /** 共享 cookie jar：跨 run 复用登录态（见 ADR-0005） */
  cookieStore?: CookieJar
  /** 宿主从表单收集、回传给写侧动作（如 login）的输入值 */
  inputs?: Record<string, string>
  /** 通用调用参数（invoke 用：透传给插件同名导出） */
  params?: Record<string, unknown>
  /** $lib.ui 的宿主处理器（ADR-0006）：插件中途直问用户时经此要结果。DevConsole 注入桥接 */
  onUiRequest?: UiRequestHandler
  /**
   * `$lib.browser.getHtml` 的宿主注入（ADR-0045）。
   * 缺省不注入 = 存根恒抛 CHALLENGE（runtime/CLI 纯 Node，无浏览器可依）；
   * DevConsole 注入 headed sidecar 抓取。`--fixture` 优先于本注入（离线短路）。
   * opts.mode（ADR-0046）：'persistent'（默认，落盘复用）| 'ephemeral'（调用级即焚）；
   * runtime CLI 永不传本项（保持纯 Node），仅 DevConsole 按 run 级决定后透传。
   */
  onBrowserFetch?: (url: string, opts?: { headers?: Record<string, string>; timeout?: number; userAgent?: string; mode?: 'persistent' | 'ephemeral' }) => Promise<HttpResponse>
}

/**
 * 查找插件文件：优先精确匹配 <id>.plugin.js。
 * 目录不存在或无匹配时返回 null。
 */
export function findPluginFile(dir: string, pluginId: string): string | null {
  try {
    const files = fs.readdirSync(dir)
    const match = files.find((f) => f === `${pluginId}.plugin.js`)
    return match ? path.join(dir, match) : null
  } catch {
    return null
  }
}

/**
 * 解析插件目录：按优先级返回第一个存在的候选目录。
 *   1. 显式传入（--dir）
 *   2. 当前工作目录的 ../lingshu-plugins（monorepo 兄弟目录）
 *   3. 当前工作目录下的 ./lingshu-plugins
 *   4. 当前工作目录本身
 */
export function resolvePluginDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit)
  const candidates = [
    path.resolve(process.cwd(), '../lingshu-plugins'),
    path.resolve(process.cwd(), 'lingshu-plugins'),
    process.cwd(),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return process.cwd()
}

/**
 * fixture 取数器：把「插件发起的 URL」映射到本地快照正文。
 *
 * 两种形态（都由 `--fixture` 一个参数承载，按路径是文件还是目录自动判）：
 *   - **文件**：整份快照覆盖**所有**请求（存量行为，单跳插件够用）。
 *   - **目录**：读 `<dir>/index.json` 的 `routes` 声明，按 URL 逐条匹配。
 *     多跳插件（详情页 + 解析接口、探索页多分区、listings 多目录页）此前离线跑不了——
 *     单文件模式会把详情页 HTML 喂给 JSON 接口，症状是「JSON 解析失败」这类假故障；
 *     目录模式未命中的请求**显式报错**，不静默串味。
 *
 * `<dir>/index.json` 形态（第一条命中的规则生效）：
 *   { "routes": [
 *       { "match": "player_api", "file": "player.json" },   // URL 子串
 *       { "regex": "^https://x/(\\d+)", "file": "detail.html" },
 *       { "match": "*", "file": "list.json" }               // 兜底；省略则未命中即报错
 *   ] }
 */
function loadFixtureResolver(
  fixturePath: string,
): (url: string, headers?: Record<string, string>) => { body: string; source: string } {
  const abs = path.resolve(fixturePath)
  if (!fs.existsSync(abs)) throw new Error(`fixture 路径不存在：${abs}`)
  if (fs.statSync(abs).isFile()) {
    const body = fs.readFileSync(abs, 'utf-8')
    return () => ({ body, source: abs })
  }

  const manifestPath = path.join(abs, 'index.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`fixture 目录缺少 index.json（目录模式需它声明 URL → 文件）：${abs}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
    routes?: Array<{ match?: string; regex?: string; headers?: Record<string, string>; file?: string }>
  }
  /**
   * 请求头条件（可选）：站点「同一 URL 两副面孔、判别开关是请求头」时，只按 URL 匹配
   * 无法把两副面孔拆开（video_site_c：同一个列表页带 `X-Requested-With` 回 JSON、不带回 SSR HTML）。
   * 名字大小写不敏感，值 trim 后大小写不敏感全等。
   */
  const headerHit = (cond: Record<string, string> | undefined, headers: Record<string, string> | undefined) => {
    if (!cond) return true
    const lower: Record<string, string> = {}
    Object.keys(headers || {}).forEach((k) => {
      lower[k.toLowerCase()] = String((headers || {})[k]).trim().toLowerCase()
    })
    return Object.keys(cond).every((k) => lower[k.toLowerCase()] === String(cond[k]).trim().toLowerCase())
  }
  const routes = (Array.isArray(manifest.routes) ? manifest.routes : [])
    .filter((r) => r && r.file && (r.match !== undefined || r.regex !== undefined))
    .map((r) => {
      const test =
        r.regex !== undefined
          ? (url: string) => new RegExp(r.regex as string).test(url)
          : r.match === '*'
            ? () => true
            : (url: string) => url.includes(r.match as string)
      const label =
        (r.regex !== undefined ? `regex:${r.regex}` : `match:${r.match}`) +
        (r.headers ? ` +headers:${Object.keys(r.headers).join(',')}` : '')
      return {
        test: (url: string, headers?: Record<string, string>) => test(url) && headerHit(r.headers, headers),
        file: r.file as string,
        label,
      }
    })
  if (!routes.length) throw new Error(`fixture 目录的 index.json 未声明任何 route：${manifestPath}`)

  return (url: string, headers?: Record<string, string>) => {
    const hit = routes.find((r) => r.test(url, headers))
    if (!hit) {
      throw new Error(
        `fixture 未覆盖该请求：${url}\n` +
          `  → 在 ${manifestPath} 的 routes 里补一条匹配（现有：${routes.map((r) => r.label).join(', ')}）`,
      )
    }
    const file = path.resolve(abs, hit.file)
    return { body: fs.readFileSync(file, 'utf-8'), source: file }
  }
}

/**
 * 创建本次执行使用的沙箱：
 *   - 始终透传 onRequest，使 $lib.http.get/post 的每次调用都被记录
 *   - 指定 fixture 时覆盖 $lib.http.get/post 返回本地快照（见 loadFixtureResolver），
 *     同时通过 onRequest 记录"插件试图发起的请求"（fixture: true），
 *     便于在 DevConsole 中核对插件构造的 URL / 请求头是否正确。
 */
function buildSandbox(options: RunOptions): Sandbox {
  const sandbox = createSandbox({ onRequest: options.onRequest, settings: options.settings, cookieStore: options.cookieStore, onUiRequest: options.onUiRequest })

  if (options.fixture) {
    const resolveFixture = loadFixtureResolver(options.fixture)
    const recordFixture = (
      method: 'GET' | 'POST' | 'BROWSER',
      url: string,
      headers?: Record<string, string>,
    ) => {
      const { body, source } = resolveFixture(url, headers)
      options.onRequest?.({
        method,
        url,
        requestHeaders: headers ?? {},
        status: 200,
        responseHeaders: { 'x-lingshu-fixture': path.basename(source) },
        responseBody: body,
        durationMs: 0,
        fixture: true,
      })
      return body
    }
    sandbox.$lib.http.get = async (url: string, opts?: { headers?: Record<string, string> }) => {
      const body = recordFixture('GET', url, opts?.headers)
      return { status: 200, headers: {}, body }
    }
    sandbox.$lib.http.post = async (
      url: string,
      _data?: any,
      opts?: { headers?: Record<string, string> },
    ) => {
      const body = recordFixture('POST', url, opts?.headers)
      return { status: 200, headers: {}, body }
    }
    // 浏览器通道离线覆盖：fixture 同样短路 $lib.browser.getHtml（与 http 同口径，
    // 供 L3 插件显式通道的离线验证；在线时 runtime 无浏览器，getHtml 如实抛 CHALLENGE）。
    sandbox.$lib.browser.getHtml = async (url: string, opts?: { headers?: Record<string, string> }) => {
      const body = recordFixture('BROWSER', url, opts?.headers)
      return { status: 200, headers: { 'x-lingshu-browser': 'fixture' }, body }
    }
  } else if (options.onBrowserFetch) {
    // 宿主浏览器通道注入（ADR-0045）：DevConsole headed sidecar 经此进入；
    // runtime CLI 永不传本项（保持纯 Node，Q7）。记录 method=BROWSER 以区直连。
    // $lib 边界统一判挑战：通道实现只管原文透出（含 403 挑战页），挑战识别与抛错
    // 在此一处（与 $lib.http.get 同表），插件不再写判定。
    const fetchViaBrowser = options.onBrowserFetch
    sandbox.$lib.browser.getHtml = async (
      url: string,
      opts?: { headers?: Record<string, string>; timeout?: number; userAgent?: string; mode?: 'persistent' | 'ephemeral' },
    ) => {
      const start = Date.now()
      // 通道实现只负责"拿到原文"：抛出的只有通道异常（不可用/超时/网络），
      // 挑战判定在拿到结果后另行抛出（不得进下面的 catch，否则会多记一条 status 0）。
      let res: HttpResponse
      try {
        res = await fetchViaBrowser(url, opts)
      } catch (e: any) {
        options.onRequest?.({
          method: 'BROWSER',
          url,
          requestHeaders: opts?.headers ?? {},
          status: 0,
          responseHeaders: {},
          durationMs: Date.now() - start,
          error: String(e?.message ?? e),
        })
        throw e
      }
      options.onRequest?.({
        method: 'BROWSER',
        url,
        requestHeaders: opts?.headers ?? {},
        status: res.status,
        responseHeaders: res.headers,
        responseBody: res.body,
        durationMs: Date.now() - start,
      })
      if (isChallengeResponse({ status: res.status, headers: res.headers ?? {}, body: res.body ?? '' })) {
        throw challengeError(url, res.status)
      }
      return res
    }
  }

  return sandbox
}

const VALID_ACTIONS = new Set(['list', 'detail', 'search', 'reading', 'play', 'categories', 'listings', 'explore', 'tags', 'setting-action', 'login', 'logout', 'me', 'invoke'])

/**
 * 执行插件动作的纯逻辑（不碰 console / process.exit），便于测试。
 * 抛错表示失败；返回值为插件产出（ListItem[] / ArticleDetail 等）。
 */
export async function executeRun(
  pluginFile: string,
  action: string,
  target: string | undefined,
  options: RunOptions,
): Promise<any> {
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`不支持的动作 "${action}"（支持: list/detail/search/reading/play/categories/listings/explore/tags/setting-action/login/logout/me/invoke）`)
  }

  // 统一构建沙箱：透传 onRequest + 可选 fixture 覆盖
  const sandbox = buildSandbox(options)
  const { plugin } = loadPlugin(pluginFile, sandbox)

  if (action === 'list') {
    const page = parseInt(options.page || '1', 10)
    const ctx: PluginContext = { page }
    if (options.category) ctx.category = options.category
    if (options.url) ctx.url = options.url
    if (options.channel) ctx.channel = options.channel
    if (options.cursor) ctx.cursor = options.cursor
    return plugin.fetchList(ctx)
  }

  if (action === 'detail') {
    if (!target) {
      throw new Error('detail 需要 URL 参数（用法: lingshu run <id> detail <url>）')
    }
    return plugin.fetchDetail(target)
  }

  if (action === 'search') {
    if (!target) {
      throw new Error('search 需要查询词（用法: lingshu run <id> search <query>）')
    }
    if (typeof plugin.search !== 'function') {
      throw new Error('插件不支持 search')
    }
    const page = parseInt(options.page || '1', 10)
    const ctx: PluginContext = { page }
    if (options.category) ctx.category = options.category
    if (options.channel) ctx.channel = options.channel
    if (options.cursor) ctx.cursor = options.cursor
    return plugin.search(target, ctx)
  }

  if (action === 'reading') {
    if (!target) {
      throw new Error('reading 需要 URL 参数（用法: lingshu run <id> reading <url>）')
    }
    if (typeof plugin.fetchReadingPage !== 'function') {
      throw new Error('插件不支持 fetchReadingPage')
    }
    return plugin.fetchReadingPage(target)
  }

  if (action === 'play') {
    if (!target) {
      throw new Error('play 需要 URL 参数（用法: lingshu run <id> play <出流入口URL>）')
    }
    if (typeof plugin.fetchPlayUrl !== 'function') {
      throw new Error('插件不支持 fetchPlayUrl')
    }
    // 语义泛化（ADR-0026）：target 为「出流入口 URL」——详情页或播放页，fetchPlayUrl 解析出最终流
    return plugin.fetchPlayUrl(target)
  }

  if (action === 'explore') {
    if (typeof plugin.getExplore !== 'function') {
      throw new Error('插件不支持 getExplore')
    }
    // 探索页条目（listings-first）：--url 为探索页标识，透传为 getExplore 的
    // context.url（缺省 = 默认探索页）；旧插件忽略多参零改动。
    return plugin.getExplore(options.url ? { url: options.url } : undefined)
  }

  if (action === 'listings') {
    if (typeof plugin.getListings !== 'function') {
      throw new Error('插件不支持 getListings')
    }
    return plugin.getListings()
  }

  if (action === 'tags') {
    if (typeof plugin.getTags !== 'function') {
      throw new Error('插件不支持 getTags')
    }
    // 标签索引页：page 与「该索引页自己的筛选组合串」透传为 TagContext；旧插件忽略多参零改动。
    // 无任何参数时零参调用（legacy 行为），否则传 context。
    const ctx: { page?: number; category?: string } = {}
    if (options.page) {
      const p = parseInt(options.page, 10)
      if (!isNaN(p) && p > 0) ctx.page = p
    }
    if (options.category) ctx.category = options.category
    return Object.keys(ctx).length ? plugin.getTags(ctx) : plugin.getTags()
  }

  if (action === 'setting-action') {
    if (!target) {
      throw new Error('setting-action 需要字段 key（用法: lingshu run <id> setting-action <key>）')
    }
    if (typeof plugin.runSettingAction !== 'function') {
      throw new Error('插件不支持 runSettingAction')
    }
    return plugin.runSettingAction(target)
  }

  if (action === 'login') {
    if (typeof plugin.login !== 'function') {
      throw new Error('插件不支持 login')
    }
    // 宿主从 loginFields 收集的值经 inputs 回传；声明式交互的回传信道（ADR-0005）
    return plugin.login(options.inputs ?? {})
  }

  if (action === 'me') {
    if (typeof plugin.getMe !== 'function') {
      throw new Error('插件不支持 getMe')
    }
    return plugin.getMe()
  }

  if (action === 'logout') {
    if (typeof plugin.logout !== 'function') {
      throw new Error('插件不支持 logout')
    }
    return plugin.logout()
  }

  if (action === 'invoke') {
    if (!target) {
      throw new Error('invoke 需要方法名参数（用法: lingshu run <id> invoke <function> [--params \'{...}\']）')
    }
    const fn = (plugin as unknown as Record<string, unknown>)[target]
    if (typeof fn !== 'function') {
      throw new Error(`插件不支持 ${target}`)
    }
    // 通用直调：方法名与参数全由调用方（卡片声明）给出，宿主不映射方法
    return (fn as (params: unknown) => Promise<unknown>)(options.params ?? {})
  }

  // action === 'categories'
  if (typeof plugin.getCategories !== 'function') {
    throw new Error('插件不支持 getCategories')
  }
  return plugin.getCategories()
}

/** run 命令入口：解析目录 → 查找插件 → 执行 → 打印结果 */
export async function runCommand(
  pluginId: string,
  action: string,
  target: string | undefined,
  options: RunOptions,
): Promise<void> {
  const pluginDir = resolvePluginDir(options.dir)
  const pluginFile = findPluginFile(pluginDir, pluginId)
  if (!pluginFile) {
    console.error(`错误: 找不到插件 "${pluginId}"（查找目录: ${pluginDir}）`)
    process.exit(1)
  }
  try {
    const result = await executeRun(pluginFile, action, target, options)
    console.log(JSON.stringify(result, null, 2))
  } catch (err: any) {
    console.error('错误:', err.message)
    process.exit(1)
  }
}

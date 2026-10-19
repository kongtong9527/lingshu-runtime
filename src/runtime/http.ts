import { fetch, Agent, type RequestInit } from 'undici'
import { isChallengeResponse, challengeError } from './challenge.js'

export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface HttpOptions {
  headers?: Record<string, string>
  timeout?: number
  rejectUnauthorized?: boolean
  /**
   * 响应体编码：缺省 'text'（res.text()，存量行为）。
   * 'base64' 时返回 `res.arrayBuffer()` 的 base64 字符串，用于二进制
   * 接口（如 Flutter video_site_h 的 application/octet-stream 加密响应）。
   * base64 模式下跳过文本挑战判定（二进制恒不命中文本特征表）。
   */
  responseType?: 'text' | 'base64'
}

/**
 * 单次 HTTP 请求的完整记录，供 DevConsole 等宿主展示插件发起的请求细节。
 * - 成功：status 为 HTTP 状态码，responseBody 为上游返回体
 * - 失败：status 为 0，error 描述异常（如超时 / DNS 失败）
 */
export interface HttpRecord {
  /** BROWSER = 经宿主浏览器通道抓取（headed sidecar / fixture 短路），非 Node 直连 */
  method: 'GET' | 'POST' | 'DELETE' | 'BROWSER'
  url: string
  requestHeaders: Record<string, string>
  requestBody?: string
  status: number
  responseHeaders: Record<string, string>
  responseBody?: string
  durationMs: number
  /** fixture 模式命中本地快照时为 true，便于在面板上与真实请求区分 */
  fixture?: boolean
  error?: string
}

export type RequestRecorder = (record: HttpRecord) => void

/** 简化 cookie：插件/宿主预置登录态用。domain 缺省取 setCookies 传入 url 的 hostname */
export interface SimpleCookie {
  name: string
  value: string
  domain?: string
  path?: string
}

/**
 * cookie jar：domain -> (name -> cookie)。
 * 默认随 http 实例创建（per-run 短命）；宿主可传入共享实例让 cookie 跨 run 复用
 * （登录 run 写入的 session cookie，下一个读取 run 才能带上）。
 */
export type CookieJar = Map<string, Map<string, SimpleCookie>>

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/** host 是否匹配 cookie 的 domain（精确或子域） */
function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain)
}

/** 解析单个 Set-Cookie 头为 cookie 对象 */
function parseSetCookie(header: string): {
  name: string
  value: string
  domain?: string
  path?: string
} | null {
  const parts = header.split(';').map((p) => p.trim())
  const first = parts[0]
  if (!first) return null
  const eq = first.indexOf('=')
  if (eq < 0) return null
  const name = first.slice(0, eq).trim()
  const value = first.slice(eq + 1).trim()
  if (!name) return null
  let domain: string | undefined
  let path: string | undefined
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf('=')
    if (idx < 0) continue
    const attr = parts[i].slice(0, idx).trim().toLowerCase()
    const val = parts[i].slice(idx + 1).trim()
    if (attr === 'domain') domain = val.replace(/^\./, '').toLowerCase()
    else if (attr === 'path') path = val
  }
  return { name, value, domain, path }
}

/**
 * 创建 $lib.http 运行时。可选传入 onRequest 回调，每次 get/post 都会产出
 * 一条 HttpRecord（无论成功 / 失败），供调用方收集后回传给 DevConsole。
 *
 * 内置内存 cookie jar：setCookies 预置的 cookie 与响应 Set-Cookie 都会按域
 * 匹配，后续同域请求自动附加为 Cookie 头（调用方显式 Cookie 头优先）。
 * 传入 sharedStore 时，jar 跨 http 实例（即跨 sandbox/run）共享——登录 run
 * 写入的 cookie，后续读取 run 可复用（见 声明式交互）。
 */
export function createHttpAPI(onRequest?: RequestRecorder, sharedStore?: CookieJar) {
  // domain -> (name -> cookie)；外部传入则跨 run 共享，否则 per-run 短命
  const cookieStore = sharedStore ?? new Map<string, Map<string, SimpleCookie>>()

  function collectCookies(url: string): SimpleCookie[] {
    const host = hostnameOf(url)
    if (!host) return []
    const result: SimpleCookie[] = []
    for (const [domain, jar] of cookieStore) {
      if (domainMatches(host, domain)) {
        for (const c of jar.values()) result.push(c)
      }
    }
    return result
  }

  function setCookies(url: string, cookies: SimpleCookie[]): void {
    const baseHost = hostnameOf(url)
    for (const c of cookies) {
      const domain = (c.domain || baseHost || '').toLowerCase().replace(/^\./, '')
      if (!domain) continue
      let jar = cookieStore.get(domain)
      if (!jar) {
        jar = new Map()
        cookieStore.set(domain, jar)
      }
      jar.set(c.name, { name: c.name, value: c.value, domain, path: c.path })
    }
  }

  function getCookies(url: string): SimpleCookie[] {
    return collectCookies(url)
  }

  function deleteCookies(url: string): void {
    const host = hostnameOf(url)
    if (!host) return
    for (const domain of [...cookieStore.keys()]) {
      if (domainMatches(host, domain)) cookieStore.delete(domain)
    }
  }

  async function execute(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    init: RequestInit,
    requestBody?: string,
    options?: HttpOptions,
  ): Promise<HttpResponse> {
    const start = Date.now()

    // 自动附加 cookie jar 中匹配域的 cookie（调用方显式 Cookie 头优先）
    const headers = (init.headers as Record<string, string> | undefined) ?? {}
    const hasExplicitCookie = Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')
    if (!hasExplicitCookie) {
      const jarCookies = collectCookies(url)
      if (jarCookies.length > 0) {
        headers['Cookie'] = jarCookies.map((c) => `${c.name}=${c.value}`).join('; ')
        init.headers = headers
      }
    }
    const requestHeaders = (init.headers as Record<string, string>) ?? {}

    // 网络层往返只负责"拿到响应"：抛出的只有网络异常（超时/DNS/连接重置），
    // 挑战判定在拿到完整响应后另行抛出（不得进下面的 catch，否则会多记一条 status 0）。
    let status: number
    let responseHeaders: Record<string, string>
    let text: string
    // base64 模式：响应体走 arrayBuffer → base64（供二进制加密接口），
    // 跳过文本挑战判定（二进制恒不命中文本特征表）。
    const wantBase64 = options?.responseType === 'base64'
    try {
      if (options?.rejectUnauthorized === false) {
        init.dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
      }
      const res = await fetch(url, init)

      // 解析响应 Set-Cookie，存入 cookie jar
      const setCookieHeaders =
        typeof (res.headers as any).getSetCookie === 'function'
          ? ((res.headers as any).getSetCookie() as string[])
          : []
      for (const sc of setCookieHeaders) {
        const parsed = parseSetCookie(sc)
        if (!parsed) continue
        const domain = parsed.domain || hostnameOf(url)
        if (!domain) continue
        let jar = cookieStore.get(domain)
        if (!jar) {
          jar = new Map()
          cookieStore.set(domain, jar)
        }
        jar.set(parsed.name, { name: parsed.name, value: parsed.value, domain, path: parsed.path })
      }

      text = wantBase64
        ? Buffer.from(await res.arrayBuffer()).toString('base64')
        : await res.text()
      status = res.status
      responseHeaders = Object.fromEntries(res.headers.entries())
    } catch (e: any) {      onRequest?.({
        method,
        url,
        requestHeaders,
        requestBody,
        status: 0,
        responseHeaders: {},
        durationMs: Date.now() - start,
        error: String(e?.message ?? e),
      })
      throw e
    }
    onRequest?.({
      method,
      url,
      requestHeaders,
      requestBody,
      status,
      responseHeaders,
      responseBody: text,
      durationMs: Date.now() - start,
    })
    // 挑战识别下沉宿主（插件不再写判定）：命中共享表即抛统一 CHALLENGE 错，
    // 不 resolve 挑战页给插件。半信任 403 + 真内容（无强信号）照常 resolve，
    // 插件按"解析出条目即成功"兜底。base64（二进制）模式恒跳过文本判定。
    if (!wantBase64 && isChallengeResponse({ status, headers: responseHeaders, body: text })) {
      throw challengeError(url, status)
    }
    return { status, headers: responseHeaders, body: text }
  }

  return {
    async get(url: string, options?: HttpOptions): Promise<HttpResponse> {
      const init: RequestInit = {
        method: 'GET',
        headers: options?.headers,
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      }
      return execute('GET', url, init, undefined, options)
    },

    async post(
      url: string,
      data?: any,
      options?: HttpOptions & { contentType?: string },
    ): Promise<HttpResponse> {
      // string 透传（form-urlencoded 等已编码体）；二进制（跨 vm realm 的
      // $lib.Buffer 亦命中，ArrayBuffer.isView 跨 realm 有效）原样发送字节；
      // 对象仍 JSON.stringify。写侧动作（如登录）常用
      // application/x-www-form-urlencoded。
      // 二进制请求体（如 Flutter video_site_h 的 IV + AES 密文）传 $lib.Buffer /
      // Uint8Array，宿主经 Buffer.from 拷贝字节后发出。
      let body: string | Buffer | undefined
      let recordBody: string | undefined
      if (data === undefined) {
        body = undefined
        recordBody = undefined
      } else if (typeof data === 'string') {
        body = data
        recordBody = data
      } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data)) {
        body = Buffer.from(data as Uint8Array)
        recordBody = `<binary ${(data as Uint8Array).byteLength} bytes>`
      } else {
        body = JSON.stringify(data)
        recordBody = body
      }
      const init: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': options?.contentType || 'application/json',
          ...options?.headers,
        },
        body,
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      }
      return execute('POST', url, init, recordBody ?? undefined, options)
    },

    /** DELETE（写侧取消语义：取关/取消点赞/取消收藏，body 恒空） */
    async del(url: string, options?: HttpOptions): Promise<HttpResponse> {
      const init: RequestInit = {
        method: 'DELETE',
        headers: options?.headers,
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      }
      return execute('DELETE', url, init, undefined, options)
    },

    setCookies,
    getCookies,
    deleteCookies,
  }
}

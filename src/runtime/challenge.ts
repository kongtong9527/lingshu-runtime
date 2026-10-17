/**
 * Cloudflare 挑战判定共享表 + 宿主统一挑战错（ADR-0042 分级 / ADR-0043 Q8C 三端拉齐 / ADR-0045 Q10）。
 *
 * - 判定对象：Managed Challenge（`Just a moment...`，`cf-mitigated: challenge`）
 *   与 WAF block 页（`Attention Required!`）。
 * - 形态：HTTP 403/503 + 头信号或正文强特征串（正文只看前 4KB，小写匹配）。
 * - 强特征（本表）：`challenge-platform` 与 `<!doctype html` 已剔除——前者正常页也
 *   被注入（无区分度，anime_site_a 半信任 403 + 真内容实证），后者任何 HTML 页都有
 *   （等于"403 即挑战"，误杀普通 403）；真挑战页恒有强信号（标题恒为
 *   Just a moment / Attention Required）。`challenges.cloudflare.com` 为 movie_site_c
 *   `/show/` 路由的实证信号，一并收录。
 * - 使用方：runtime `$lib.http.get` 边界判定 + 抛错（`runtime/http.ts`）、
 *   `$lib.browser` 边界判定（`commands/run.ts` 包 `onBrowserFetch` 结果）、
 *   无浏览器桩（`runtime/browser.ts`）、DevConsole `proxy.ts isChallengeResponse`
 *   （只标记不抛，播放链路防缓存挑战页当媒体）。
 *   iOS `ChallengeDetector.swift responseMarkers` 为同表对照（不跨端搬代码，
 *   沿 ADR-0043 惯例；改一处必须同步另一处）。
 * - 插件侧不再写判定：挑战识别 + 报错是宿主职责（见技能 pitfalls L3 节），插件只做
 *   直连优先 + 最多 1 次浏览器重抓，`code == 'CHALLENGE'` 即走验证链路。
 */

/**
 * 正文强特征串（小写）：命中任一即为挑战页。
 * `cf-mitigated` 同时是头名，正文含该串（如注释/错误页自述）同样命中。
 */
export const CHALLENGE_SIGNATURES = [
  'just a moment',
  'attention required',
  'cf-chl',
  'cf-error',
  'cf-mitigated',
  'challenges.cloudflare.com',
] as const

/** 挑战响应的 HTTP 状态集合：403 常规，503 为部分 WAF/Under Attack 形态 */
export const CHALLENGE_STATUSES = new Set([403, 503])

/** 正文前多少字节参与匹配（与代理侧 Buffer 行为一致，避免大 body 全量扫描） */
export const CHALLENGE_HEAD_BYTES = 4096

/** 头名是否命中 `cf-mitigated`（大小写不敏感；纯对象头需归一化） */
export function hasMitigatedHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === 'cf-mitigated')
}

function headOf(body: string): string {
  return body.slice(0, CHALLENGE_HEAD_BYTES).toLowerCase()
}

export interface ChallengeProbe {
  status: number
  /** 响应头（纯对象；键大小写不限） */
  headers?: Record<string, string>
  /** 响应正文（只需前 4KB，传全文亦可，内部截断） */
  body?: string
}

/**
 * 共享判定入口：状态非 403/503 直接 false；否则头信号或正文强特征串任一命中即 true。
 * 普通 403（热链保护/鉴权过期）无特征串 → false，不误伤；
 * 半信任 403 + 真内容（含弱信标 `challenge-platform` 但无强信号）→ false，照常解析。
 */
export function isChallengeResponse(probe: ChallengeProbe): boolean {
  if (!CHALLENGE_STATUSES.has(probe.status)) return false
  if (probe.headers && hasMitigatedHeader(probe.headers)) return true
  const head = headOf(probe.body ?? '')
  return CHALLENGE_SIGNATURES.some((sig) => head.includes(sig))
}

/**
 * 宿主统一挑战错文案（去站名前缀；含 `CHALLENGE` token + URL 全串，供展示层
 * 字符串二次识别与"在浏览器打开"提取 URL）。
 */
export function challengeMessage(url: string, status: number | string): string {
  return (
    `Lingshu: 目标站被 Cloudflare 拦截（${url}，HTTP ${status} 挑战页，CHALLENGE）。` +
    `Node 直连无法通过，请经宿主浏览器通道访问，或用 --fixture 离线验证解析逻辑`
  )
}

/**
 * 宿主统一挑战错（`code == 'CHALLENGE'` + `url`，供三端展示层切验证态）。
 * 新增宿主抛错点必须走本构造器，禁站名前缀（曾用 `anime_site_a:` 硬编码误导他站，见教训）。
 */
export function challengeError(url: string, status: number | string): Error {
  const err: any = new Error(challengeMessage(url, status))
  err.code = 'CHALLENGE'
  err.url = url
  return err
}

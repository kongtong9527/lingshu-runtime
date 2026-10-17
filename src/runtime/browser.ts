import type { HttpResponse } from './http.js'
import { challengeError } from './challenge.js'

/**
 * `$lib.browser` 运行时（ADR-0043，列表详情浏览器抓取）。
 *
 * - iOS：WKWebView（WebKit 网络栈）真实抓取，可过 Cloudflare Managed Challenge / WAF；
 * - runtime/DevConsole `/api/run`：纯 Node，无浏览器可依，`getHtml` 恒抛统一
 *   CHALLENGE 错（`challenge.ts challengeError` 构造，`Lingshu:` 前缀，不带站名；
 *   L3 站点在 CLI 下只能 `--fixture` 离线验证，见 ADR-0042；如实报错即正确行为）。
 * - 挑战体判定不在本桩：在线时浏览器结果由 `$lib` 边界（`commands/run.ts` 包
 *   `onBrowserFetch` 处）统一判挑战抛错，与 `$lib.http.get` 同表。
 *
 * 与 `$lib.http.get` 同构：`getHtml(url, options?) → Promise<{status, headers, body}>`。
 * fixture 模式由 `commands/run.ts` 覆盖为快照返回（与 http 同口径）。
 */
export function createBrowserAPI() {
  return {
    async getHtml(url: string, _options?: { headers?: Record<string, string>; timeout?: number; userAgent?: string; mode?: 'persistent' | 'ephemeral' }): Promise<HttpResponse> {
      throw challengeError(url, 403)
    },
  }
}

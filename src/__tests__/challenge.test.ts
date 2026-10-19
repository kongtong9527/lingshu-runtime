// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 用假 fetch 替换 undici：直连首跳恒回配置响应，隔离真实网络
vi.mock('undici', () => ({
  fetch: vi.fn(),
  Agent: class {},
}))

import { fetch as mockedFetch } from 'undici'
import {
  isChallengeResponse as isChallengeProbe,
  hasMitigatedHeader,
  CHALLENGE_SIGNATURES,
} from '../runtime/challenge.js'
import { executeRun, type RunOptions } from '../commands/run.js'
import type { HttpRecord } from '../runtime/http.js'

const fetchMock = vi.mocked(mockedFetch)

const CHALLENGE_HTML =
  '<html><head><title>Just a moment...</title></head><body>challenge-platform cf-chl</body></html>'
const BLOCK_HTML =
  '<html><head><title>Attention Required! | Cloudflare</title></head></html>'
/** 半信任回包：403 状态 + 完整真内容，仅含弱信标（正常页也被注入，无区分度） */
const SEMI_TRUSTED_HTML =
  '<html><head><title>Some Site - Videos</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></head><body>list</body></html>'
/** movie_site_c /show/ 路由信号 */
const movie_site_c_HTML =
  '<html><head><title>Just a moment...</title></head><body><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>'

/** 构造 execute() 依赖的最小 Response 形状 */
function fakeResponse(opts: { status?: number; body?: string; headers?: Record<string, string> }) {
  const headers = new Map(Object.entries(opts.headers ?? { 'content-type': 'text/html' }))
  return {
    status: opts.status ?? 200,
    headers: {
      entries: () => [...headers.entries()],
      getSetCookie: () => [] as string[],
    },
    text: async () => opts.body ?? '',
  }
}

describe('challenge 共享判定表（三端拉齐）', () => {
  it('403 + cf-mitigated 头即挑战（最精确信号，不看正文）', () => {
    expect(isChallengeProbe({ status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '<html>ok</html>' })).toBe(true)
  })

  it('403 + 正文强特征串即挑战（Managed Challenge / WAF block）', () => {
    expect(isChallengeProbe({ status: 403, headers: {}, body: CHALLENGE_HTML })).toBe(true)
    expect(isChallengeProbe({ status: 403, body: BLOCK_HTML })).toBe(true)
  })

  it('503 + 特征串同样认作挑战（Under Attack 形态）', () => {
    expect(isChallengeProbe({ status: 503, headers: {}, body: CHALLENGE_HTML })).toBe(true)
  })

  it('非 403/503 即使含挑战字样也不误判', () => {
    expect(isChallengeProbe({ status: 200, headers: {}, body: CHALLENGE_HTML })).toBe(false)
  })

  it('普通 403（无头无特征串）不误判为挑战', () => {
    expect(isChallengeProbe({ status: 403, headers: {}, body: '<html>Forbidden: hotlinking denied</html>' })).toBe(false)
  })

  it('半信任 403（仅弱信标 challenge-platform，无强信号）：放行照常解析', () => {
    expect(isChallengeProbe({ status: 403, headers: {}, body: SEMI_TRUSTED_HTML })).toBe(false)
  })

  it('纯 doctype 的 403 页不误判（任何 HTML 页都有该串）', () => {
    expect(isChallengeProbe({ status: 403, headers: {}, body: '<!DOCTYPE html><html><body>denied</body></html>' })).toBe(false)
  })

  it('challenges.cloudflare.com 即挑战（movie_site_c /show/ 路由信号）', () => {
    expect(isChallengeProbe({ status: 403, headers: {}, body: 'error <script src="https://challenges.cloudflare.com/x.js">' })).toBe(true)
  })

  it('只看前 4KB：特征串在 4KB 之后不命中', () => {
    const pad = 'x'.repeat(5000)
    expect(isChallengeProbe({ status: 403, headers: {}, body: pad + 'just a moment' })).toBe(false)
  })

  it('头名大小写不敏感', () => {
    expect(hasMitigatedHeader({ 'CF-Mitigated': 'challenge' })).toBe(true)
    expect(hasMitigatedHeader({ 'content-type': 'text/html' })).toBe(false)
  })

  it('签名表为强特征集（与 iOS ChallengeDetector.responseMarkers 同表；弱信标/doctype 已剔除）', () => {
    for (const sig of ['just a moment', 'attention required', 'cf-chl', 'cf-error', 'cf-mitigated', 'challenges.cloudflare.com']) {
      expect(CHALLENGE_SIGNATURES).toContain(sig)
    }
    expect(CHALLENGE_SIGNATURES).not.toContain('challenge-platform')
    expect(CHALLENGE_SIGNATURES).not.toContain('<!doctype html')
  })
})

/**
 * 合成插件：自带头部做「直连优先 + 1 次浏览器重抓」，专门用来**验证宿主侧浏览器通道**
 * （`onBrowserFetch` 薄注入 / 记 `BROWSER` 日志 / `$lib` 边界判挑战）。
 * 注意：这是探针形态，**不是插件标准形态**——2026-10 起插件侧已弃用
 * `$lib.browser.getHtml`（CHALLENGE 直抛、由宿主验证入口接管，见 pitfalls「插件侧弃用浏览器重抓」）。
 */
function writePlugin(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingshu-challenge-'))
  const file = path.join(dir, 't.plugin.js')
  fs.writeFileSync(
    file,
    `// ==Plugin==
// id: challenge-probe
// name: challenge-probe
// version: 0.0.1
// ==EndPlugin==
async function fetchList() {
  const opts = { headers: {} }
  try {
    const first = await $lib.http.get('https://x.example/list', opts)
    return { items: [], _status: first.status, _body: first.body }
  } catch (e) {
    if (!e || e.code !== 'CHALLENGE') throw e
    try {
      const via = await $lib.browser.getHtml('https://x.example/list', opts)
      return { items: [{ title: via.body }], _via: via.headers }
    } catch (e2) {
      if (!e2 || e2.code !== 'CHALLENGE') throw e
      throw e2
    }
  }
}
module.exports = { fetchList, fetchDetail: async (url) => ({ title: url, content: [] }) }
`,
  )
  return file
}

describe('$lib.http.get 边界抛错（挑战识别下沉宿主）', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('直连 403 挑战页：http.get 直接抛统一 CHALLENGE（Lingshu 前缀 + code/url）', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 403, body: CHALLENGE_HTML }) as never)
    const file = writePlugin()
    const err = await executeRun(file, 'list', undefined, {} satisfies RunOptions).catch((e) => e)
    expect(err.code).toBe('CHALLENGE')
    expect(err.url).toBe('https://x.example/list')
    expect(err.message).toContain('Lingshu:')
    expect(err.message).not.toContain('anime_site_a:')
  })

  it('半信任 403（仅弱信标）：宿主放行，插件原样拿到响应（不抛）', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 403, body: SEMI_TRUSTED_HTML }) as never)
    const file = writePlugin()
    const data = await executeRun(file, 'list', undefined, {} satisfies RunOptions)
    expect(data._status).toBe(403)
    expect(data._body).toContain('Some Site')
  })

  it('普通 403（无头无特征串）：宿主不抛（插件按通用 HTTP 失败自处）', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ status: 403, body: '<html>Forbidden: hotlinking denied</html>' }) as never,
    )
    const file = writePlugin()
    const data = await executeRun(file, 'list', undefined, {} satisfies RunOptions)
    expect(data._status).toBe(403)
  })

  it('503 + Just a moment：宿主抛 CHALLENGE', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 503, body: CHALLENGE_HTML }) as never)
    const file = writePlugin()
    await expect(executeRun(file, 'list', undefined, {} satisfies RunOptions)).rejects.toMatchObject({
      code: 'CHALLENGE',
    })
  })

  it('movie_site_c 信号串：宿主抛 CHALLENGE', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 403, body: movie_site_c_HTML }) as never)
    const file = writePlugin()
    await expect(executeRun(file, 'list', undefined, {} satisfies RunOptions)).rejects.toMatchObject({
      code: 'CHALLENGE',
    })
  })
})

describe('onBrowserFetch 宿主注入（薄注入 + $lib 边界判挑战）', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    // 直连首跳恒回 403 挑战页（宿主 http 层即抛 CHALLENGE，插件走浏览器重抓）
    fetchMock.mockResolvedValue(fakeResponse({ status: 403, body: CHALLENGE_HTML }) as never)
  })

  it('缺省不注入：存根恒抛统一 CHALLENGE（CLI 纯 Node 语义不变，去站名前缀）', async () => {
    const file = writePlugin()
    const err = await executeRun(file, 'list', undefined, {} satisfies RunOptions).catch((e) => e)
    expect(err.code).toBe('CHALLENGE')
    expect(err.message).toContain('Lingshu:')
  })

  it('注入后：browser.getHtml 走宿主实现并记 BROWSER 日志', async () => {
    const file = writePlugin()
    const records: HttpRecord[] = []
    const data = await executeRun(file, 'list', undefined, {
      onRequest: (r) => records.push(r),
      onBrowserFetch: async (url) => ({
        status: 200,
        headers: { 'x-lingshu-browser': 'headed' },
        body: `<html>real list for ${url}</html>`,
      }),
    } satisfies RunOptions)
    expect((data.items as { title: string }[])[0].title).toContain('real list')
    expect(data._via).toMatchObject({ 'x-lingshu-browser': 'headed' })
    const methods = records.map((r) => r.method)
    // 首跳 Node 直连 GET 403（记日志后抛 CHALLENGE）+ 一次宿主浏览器 BROWSER 200
    expect(methods).toEqual(['GET', 'BROWSER'])
    expect(records[0].status).toBe(403)
    expect(records[1].status).toBe(200)
  })

  it('浏览器通道回挑战体（一次性 keep-window 形态）：$lib 边界抛 CHALLENGE', async () => {
    const file = writePlugin()
    const records: HttpRecord[] = []
    const err = await executeRun(file, 'list', undefined, {
      onRequest: (r) => records.push(r),
      onBrowserFetch: async () => ({ status: 403, headers: {}, body: CHALLENGE_HTML }),
    } satisfies RunOptions).catch((e) => e)
    expect(err.code).toBe('CHALLENGE')
    expect(records.map((r) => r.method)).toEqual(['GET', 'BROWSER'])
  })

  it('浏览器通道回半信任真内容：边界放行，插件照常解析', async () => {
    const file = writePlugin()
    const data = await executeRun(file, 'list', undefined, {
      onBrowserFetch: async () => ({ status: 403, headers: {}, body: SEMI_TRUSTED_HTML }),
    } satisfies RunOptions)
    expect((data.items as { title: string }[])[0].title).toContain('Some Site')
  })

  it('宿主抓取非挑战失败：插件回抛直连 CHALLENGE（归一化，验证入口不断）', async () => {
    const file = writePlugin()
    const records: HttpRecord[] = []
    const err = await executeRun(file, 'list', undefined, {
      onRequest: (r) => records.push(r),
      onBrowserFetch: async () => {
        throw new Error('no chrome')
      },
    } satisfies RunOptions).catch((e) => e)
    expect(err.code).toBe('CHALLENGE')
    expect(records.map((r) => r.method)).toEqual(['GET', 'BROWSER'])
    expect(records[1].status).toBe(0)
    expect(records[1].error).toContain('no chrome')
  })
})

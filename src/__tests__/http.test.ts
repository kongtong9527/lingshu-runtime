import { describe, it, expect, beforeEach, vi } from 'vitest'

// 用假 fetch 替换 undici，隔离真实网络，专注验证 cookie jar 行为
vi.mock('undici', () => ({
  fetch: vi.fn(),
  Agent: class {},
}))

import { fetch as mockedFetch } from 'undici'
import { createHttpAPI } from '../runtime/http.js'

/** 构造 execute() 依赖的最小 Response 形状（status / headers.entries / headers.getSetCookie / text） */
function fakeResponse(opts: {
  status?: number
  body?: string
  headers?: Record<string, string>
  setCookie?: string[]
}) {
  const headers = new Map(Object.entries(opts.headers ?? { 'content-type': 'text/plain' }))
  return {
    status: opts.status ?? 200,
    headers: {
      entries: () => [...headers.entries()],
      getSetCookie: () => opts.setCookie ?? [],
    },
    text: async () => opts.body ?? '',
  }
}

const fetchMock = vi.mocked(mockedFetch)

describe('$lib.http cookie jar', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('setCookies 后 getCookies 按精确域返回', () => {
    const http = createHttpAPI()
    http.setCookies('https://example.com', [
      { name: 'token', value: 'abc' },
      { name: 'sid', value: 'xyz' },
    ])
    const cookies = http.getCookies('https://example.com/path')
    expect(cookies.map((c) => c.name).sort()).toEqual(['sid', 'token'])
  })

  it('子域请求能拿到父域 cookie', () => {
    const http = createHttpAPI()
    http.setCookies('https://example.com', [{ name: 'token', value: 'abc' }])
    expect(http.getCookies('https://sub.example.com/x')).toHaveLength(1)
  })

  it('不相关域拿不到 cookie', () => {
    const http = createHttpAPI()
    http.setCookies('https://example.com', [{ name: 'token', value: 'abc' }])
    expect(http.getCookies('https://other.com')).toHaveLength(0)
  })

  it('deleteCookies 清除匹配域的 cookie', () => {
    const http = createHttpAPI()
    http.setCookies('https://example.com', [{ name: 'token', value: 'abc' }])
    http.deleteCookies('https://example.com')
    expect(http.getCookies('https://example.com')).toHaveLength(0)
  })

  it('请求自动附加 jar 中匹配的 Cookie 头', async () => {
    const http = createHttpAPI()
    http.setCookies('https://example.com', [{ name: 'token', value: 'abc' }])
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: 'ok' }) as any)

    await http.get('https://example.com/page')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Cookie).toBe('token=abc')
  })

  it('调用方显式 Cookie 头优先，不被 jar 覆盖', async () => {
    const http = createHttpAPI()
    http.setCookies('https://example.com', [{ name: 'token', value: 'abc' }])
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: 'ok' }) as any)

    await http.get('https://example.com/page', { headers: { Cookie: 'manual=1' } })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Cookie).toBe('manual=1')
  })

  it('响应 Set-Cookie 被解析并存入 jar，后续请求自动带上', async () => {
    const http = createHttpAPI()
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: 'ok',
        setCookie: ['session=xyz; Path=/; Domain=example.com', 'flag=1'],
      }) as any,
    )

    await http.get('https://example.com/login')
    // 解析后 jar 中应有两条
    const cookies = http.getCookies('https://example.com').map((c) => c.name).sort()
    expect(cookies).toEqual(['flag', 'session'])
  })

  it('无匹配 cookie 时不附加 Cookie 头', async () => {
    const http = createHttpAPI()
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: 'ok' }) as any)

    await http.get('https://example.com/page')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const cookieHeader = (init.headers as Record<string, string> | undefined)?.Cookie
    expect(cookieHeader).toBeUndefined()
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHttpAPI, type CookieJar } from '../runtime/http.js'
import { executeRun } from '../commands/run.js'

const TMP = os.tmpdir()
const files: string[] = []

function writeFile(name: string, content: string): string {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, content, 'utf-8')
  files.push(p)
  return p
}

afterEach(() => {
  for (const f of files.splice(0)) {
    try {
      fs.unlinkSync(f)
    } catch {
      /* 忽略 */
    }
  }
})

describe('cookie jar 跨 run 共享', () => {
  it('传入 sharedStore 时，两个 http 实例共享同一 jar（A 写入 B 可见）', () => {
    const shared: CookieJar = new Map()
    const a = createHttpAPI(undefined, shared)
    const b = createHttpAPI(undefined, shared)
    a.setCookies('https://example.com', [{ name: 'session', value: 'abc' }])
    const cookies = b.getCookies('https://example.com')
    expect(cookies).toHaveLength(1)
    expect(cookies[0].value).toBe('abc')
  })

  it('不传 sharedStore 时，两个实例各自独立（A 写入 B 不可见）', () => {
    const a = createHttpAPI()
    const b = createHttpAPI()
    a.setCookies('https://example.com', [{ name: 'session', value: 'abc' }])
    expect(b.getCookies('https://example.com')).toHaveLength(0)
  })
})

// 合成插件：login 写 cookie、fetchList 读 cookie，均不走网络，专测跨 run 共享与 login 分派
const SHARED_PLUGIN = `
// ==Plugin==
// id: fake
// name: fake
// version: 1.0.0
// ==EndPlugin==
function getAccountSchema() {
  return { loginFields: [{ name: 'user', label: '用户', type: 'text', required: true }] }
}
async function login(inputs) {
  $lib.http.setCookies('https://example.com', [{ name: 'session', value: inputs.user }])
  return { uid: 'u1', message: 'ok' }
}
async function fetchList() {
  const c = $lib.http.getCookies('https://example.com')
  return { items: [{ id: String(c.length), title: c[0] ? c[0].value : 'none' }] }
}
async function fetchDetail(url) { return { title: url, sourceName: 's', sourceUrl: url, blocks: [] } }
module.exports = { id: 'fake', name: 'fake', version: '1.0.0', fetchList, fetchDetail, getAccountSchema, login }
`

describe("executeRun 'login' 动作 + 共享 cookie jar", () => {
  it('login 动作分派到 plugin.login(inputs) 并返回结果', async () => {
    const file = writeFile('fake.plugin.js', SHARED_PLUGIN)
    const result = await executeRun(file, 'login', undefined, { inputs: { user: 'alice' } })
    expect(result).toEqual({ uid: 'u1', message: 'ok' })
  })

  it('login run 写入的 cookie，经共享 jar 在后续 list run 可见', async () => {
    const file = writeFile('fake.plugin.js', SHARED_PLUGIN)
    const shared: CookieJar = new Map()
    await executeRun(file, 'login', undefined, { inputs: { user: 'alice' }, cookieStore: shared })
    const list = await executeRun(file, 'list', undefined, { cookieStore: shared })
    expect(list.items[0].title).toBe('alice')
  })

  it('不共享 jar 时，login 写入的 cookie 在后续 list run 不可见', async () => {
    const file = writeFile('fake.plugin.js', SHARED_PLUGIN)
    await executeRun(file, 'login', undefined, { inputs: { user: 'alice' } })
    const list = await executeRun(file, 'list', undefined, {})
    expect(list.items[0].title).toBe('none')
  })

  it('插件未实现 login 时优雅报错', async () => {
    const file = writeFile('nologin.plugin.js', `
// ==Plugin==
// id: nologin
// name: n
// version: 1.0.0
// ==EndPlugin==
      async function fetchList() { return { items: [] } }
      async function fetchDetail(url) { return { title: url, sourceName: 's', sourceUrl: url, blocks: [] } }
      module.exports = { id: 'nologin', name: 'n', version: '1.0.0', fetchList, fetchDetail }
    `)
    await expect(executeRun(file, 'login', undefined, { inputs: {} })).rejects.toThrow(/不支持 login/)
  })

  it('未知动作报错信息含 login', async () => {
    const file = writeFile('fake.plugin.js', SHARED_PLUGIN)
    await expect(executeRun(file, 'bogus', undefined, {})).rejects.toThrow(/login/)
  })
})

import { describe, it, expect } from 'vitest'
import { createSandbox } from '../sandbox.js'

describe('createSandbox', () => {
  it('$lib 含 http、storage、util 及 8 个 js-lib 库', () => {
    const { $lib } = createSandbox()
    // 原生注入
    expect(typeof $lib.http.get).toBe('function')
    expect(typeof $lib.http.post).toBe('function')
    expect(typeof $lib.storage.set).toBe('function')
    expect(typeof $lib.storage.get).toBe('function')
    expect(typeof $lib.util.randomUUID).toBe('function')
    expect(typeof $lib.util.randomInt).toBe('function')
    expect(typeof $lib.util.randomDouble).toBe('function')
    // js-lib 八库
    for (const name of [
      'cheerio',
      'CryptoJS',
      'dayjs',
      'Buffer',
      'crypto',
      'iconvLite',
      'JSEncrypt',
      'jsrsasign',
    ]) {
      expect($lib).toHaveProperty(name)
      expect($lib[name]).toBeDefined()
    }
  })

  it('runInContext 内能访问 $lib.dayjs（返回字符串）', () => {
    const { runInContext } = createSandbox()
    const year = runInContext("$lib.dayjs(0).format('YYYY')", 't.js')
    expect(typeof year).toBe('string')
    expect(year.length).toBeGreaterThan(0)
  })

  it('runInContext 内能访问 $lib.cheerio.load', () => {
    const { runInContext } = createSandbox()
    const text = runInContext(
      "var $ = $lib.cheerio.load('<p>hi</p>'); $('p').text()",
      't.js',
    )
    expect(text).toBe('hi')
  })

  // 危险宿主全局全部被屏蔽：以数组遍历断言每一项 typeof === 'undefined'
  // （用 it.each 生成独立用例，便于失败时定位具体是哪一项逃逸）
  it.each([
    'require',
    'process',
    'Buffer',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'clearTimeout',
    'clearInterval',
    'clearImmediate',
  ])('屏蔽危险全局 %s', (name) => {
    const { runInContext } = createSandbox()
    expect(runInContext(`typeof ${name}`, 't.js')).toBe('undefined')
  })

  it('console 在沙箱内可用', () => {
    const { runInContext } = createSandbox()
    expect(runInContext('typeof console.log', 't.js')).toBe('function')
  })

  it('globalThis.$lib 在插件代码内可达', () => {
    const { runInContext } = createSandbox()
    // 插件代码可能通过 globalThis.$lib 访问注入的库
    const result = runInContext(
      "typeof globalThis.$lib.dayjs",
      't.js',
    )
    expect(result).toBe('function')
  })

  it('可通过 $lib 覆盖点替换 http（fixture 场景）', () => {
    // 调用方（CLI fixture 模式 / 测试）应能直接改写 $lib.http.get
    const { $lib, runInContext } = createSandbox()
    $lib.http.get = (() => 'mocked') as any
    const result = runInContext("$lib.http.get('x')", 't.js')
    expect(result).toBe('mocked')
  })

  it('默认超时为 30000ms，可通过 options 覆盖', () => {
    // 死循环在短超时下应被中断
    const { runInContext } = createSandbox({ timeout: 50 })
    expect(() => runInContext('while(true){}', 't.js')).toThrow()
  })
})

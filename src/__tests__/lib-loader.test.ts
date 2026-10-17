import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import { loadJsLib, listJsLibModules } from '../lib-loader.js'

describe('lib-loader', () => {
  it('listJsLibModules 返回全部 8 个库名', () => {
    expect(listJsLibModules()).toEqual([
      'cheerio',
      'CryptoJS',
      'dayjs',
      'Buffer',
      'crypto',
      'iconvLite',
      'JSEncrypt',
      'jsrsasign',
    ])
  })

  it('loadJsLib 返回对象包含全部 8 个 key 且值不为 undefined', () => {
    const $lib = loadJsLib()
    const expected = [
      'cheerio',
      'CryptoJS',
      'dayjs',
      'Buffer',
      'crypto',
      'iconvLite',
      'JSEncrypt',
      'jsrsasign',
    ]
    for (const name of expected) {
      expect($lib).toHaveProperty(name)
      expect($lib[name]).toBeDefined()
    }
  })

  it('cheerio.load 能解析 HTML 并取文本', () => {
    const $lib = loadJsLib()
    const $ = $lib.cheerio.load('<p>hi</p>')
    expect($('p').text()).toBe('hi')
  })

  it('dayjs 是函数，dayjs(0).format 返回字符串', () => {
    const $lib = loadJsLib()
    expect(typeof $lib.dayjs).toBe('function')
    const formatted = $lib.dayjs(0).format('YYYY-MM-DD')
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('CryptoJS.MD5 计算正确', () => {
    const $lib = loadJsLib()
    const hash = $lib.CryptoJS.MD5('a').toString()
    expect(hash).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(hash.length).toBe(32)
  })

  it('JSEncrypt 暴露 JSEncrypt 构造器', () => {
    const $lib = loadJsLib()
    // loadJSEncrypt 返回的 RSA 对象上有 JSEncrypt 构造器
    expect(typeof $lib.JSEncrypt.JSEncrypt).toBe('function')
  })

  it('jsrsasign 的 KJUR 命名空间真实可用（crypto.Util.md5 计算正确）', () => {
    const $lib = loadJsLib()
    // KJUR 真实结构：{ asn1, lang, crypto, jws }
    expect($lib.jsrsasign.crypto).toBeDefined()
    expect(typeof $lib.jsrsasign.crypto.Util.md5).toBe('function')
    // 真实计算：md5('a') 应与 CryptoJS 结果一致
    expect($lib.jsrsasign.crypto.Util.md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    // jws 子命名空间也加载到位
    expect(typeof $lib.jsrsasign.jws.JWS).toBe('function')
  })

  it('Buffer 可用（from / isBuffer）', () => {
    const $lib = loadJsLib()
    const buf = $lib.Buffer.from('hello')
    expect($lib.Buffer.isBuffer(buf)).toBe(true)
    expect(buf.toString()).toBe('hello')
  })

  it('crypto.createHash 可用', () => {
    const $lib = loadJsLib()
    const hash = $lib.crypto.createHash('md5').update('a').digest('hex')
    expect(hash).toBe('0cc175b9c0f1b6a831c399e269772661')
  })

  it('iconvLite 可用（encode/decode）', () => {
    const $lib = loadJsLib()
    const buf = $lib.iconvLite.encode('中文', 'utf-8')
    expect($lib.iconvLite.decode(buf, 'utf-8')).toBe('中文')
  })

  it('依赖未加载时 fail-fast 抛错（CryptoJS 缺失 → JSEncrypt 加载即抛错）', () => {
    // 让 CryptoJS.min.js 报告文件缺失，触发被依赖者缺载；其余文件照常
    const spy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const s = typeof p === 'string' ? p : (p as URL).toString()
      return !s.endsWith('CryptoJS.min.js')
    })
    expect(() => loadJsLib()).toThrow(/依赖的 CryptoJS 未加载/)
    spy.mockRestore()
  })

  it('非依赖库文件缺失时优雅降级（dayjs 缺失不抛错，其余正常）', () => {
    const spy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const s = typeof p === 'string' ? p : (p as URL).toString()
      return !s.endsWith('dayjs.js')
    })
    const $lib = loadJsLib()
    expect($lib).not.toHaveProperty('dayjs')
    // CryptoJS / crypto 等其余库不受影响
    expect($lib.CryptoJS.MD5('a').toString()).toBe('0cc175b9c0f1b6a831c399e269772661')
    spy.mockRestore()
  })
})

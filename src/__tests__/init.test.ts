import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffoldPlugin, PLUGIN_ID_RE, resolveTargetDir } from '../commands/init.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }
})

function freshDir(): string {
  const d = path.join(os.tmpdir(), `lingshu-init-${process.pid}-${Date.now()}-${dirs.length}`)
  fs.mkdirSync(d, { recursive: true })
  dirs.push(d)
  return d
}

describe('插件 id 口径', () => {
  it('小写连字符通过，大写/下划线/首尾连字符拒绝', () => {
    expect(PLUGIN_ID_RE.test('github-trending')).toBe(true)
    expect(PLUGIN_ID_RE.test('my-site-2')).toBe(true)
    expect(PLUGIN_ID_RE.test('My-Site')).toBe(false)
    expect(PLUGIN_ID_RE.test('my_site')).toBe(false)
    expect(PLUGIN_ID_RE.test('-lead')).toBe(false)
    expect(PLUGIN_ID_RE.test('trail-')).toBe(false)
  })
})

describe('scaffoldPlugin（任意目录脚手架）', () => {
  it('在目标目录生成 <id>.plugin.js + _fixtures/<id>/，元数据头 id 已填', () => {
    const dir = freshDir()
    const { pluginFile, fixtureDir } = scaffoldPlugin('demo-site', { dir })
    expect(pluginFile).toBe(path.join(dir, 'demo-site.plugin.js'))
    expect(fs.existsSync(pluginFile)).toBe(true)
    const code = fs.readFileSync(pluginFile, 'utf-8')
    expect(code).toContain('// id: demo-site')
    expect(code).toContain('fetchList')
    expect(code).toContain('fetchDetail')
    expect(fs.existsSync(fixtureDir)).toBe(true)
  })

  it('缺省 dir 即当前工作目录（第三方任意空目录可直接 init）', () => {
    // vitest worker 禁 chdir：直接断言目录解析规则（显式 resolve、缺省即 cwd）
    expect(resolveTargetDir(undefined, '/tmp/any-empty')).toBe('/tmp/any-empty')
    expect(resolveTargetDir('sub', '/tmp/any-empty')).toBe(path.resolve('sub'))
    const dir = freshDir()
    const { pluginFile } = scaffoldPlugin('cwd-demo', { dir })
    expect(pluginFile).toBe(path.join(dir, 'cwd-demo.plugin.js'))
    expect(fs.existsSync(pluginFile)).toBe(true)
  })

  it('同名文件存在时拒绝，加 --force 才覆盖', () => {
    const dir = freshDir()
    scaffoldPlugin('dup-site', { dir })
    expect(() => scaffoldPlugin('dup-site', { dir })).toThrow(/已存在/)
    expect(() => scaffoldPlugin('dup-site', { dir, force: true })).not.toThrow()
  })

  it('非法 id 直接抛错', () => {
    const dir = freshDir()
    expect(() => scaffoldPlugin('Bad_Id', { dir })).toThrow(/id 非法/)
  })
})

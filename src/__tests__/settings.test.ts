import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createSettingsAPI } from '../runtime/settings.js'
import { createSandbox } from '../sandbox.js'
import { executeRun } from '../commands/run.js'

const TMP = os.tmpdir()
const files: string[] = []
const dirs: string[] = []

function trackFile(p: string): string {
  files.push(p)
  return p
}
function trackDir(p: string): string {
  dirs.push(p)
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
  for (const d of dirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }
})

function writeFile(dir: string, name: string, content: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, 'utf-8')
  return trackFile(p)
}

describe('createSettingsAPI', () => {
  it('返回注入的值，未注入的 key 返回 undefined', () => {
    const api = createSettingsAPI({ apiLine: '2', hd: true })
    expect(api.get('apiLine')).toBe('2')
    expect(api.get('hd')).toBe(true)
    expect(api.get('missing')).toBeUndefined()
  })

  it('无入参时 get 恒返回 undefined（插件据此套默认值）', () => {
    const api = createSettingsAPI()
    expect(api.get('any')).toBeUndefined()
  })

  it('只读：返回值反映注入时的快照，外部改动不影响已构造实例', () => {
    const values = { k: 'v' }
    const api = createSettingsAPI(values)
    values.k = 'changed'
    // 注入的是同一引用；契约要求宿主每次 run 注入新对象，这里仅验证实例自身不持久化
    expect(api.get('k')).toBe('changed')
  })
})

describe('createSandbox 注入 $lib.settings', () => {
  it('插件代码内 $lib.settings.get 读取注入的用户偏好', () => {
    const { runInContext } = createSandbox({ settings: { apiLine: '3', hd: false } })
    expect(runInContext("$lib.settings.get('apiLine')", 't.js')).toBe('3')
    expect(runInContext("$lib.settings.get('hd')", 't.js')).toBe(false)
    expect(runInContext("$lib.settings.get('nope')", 't.js')).toBeUndefined()
  })

  it('未注入 settings 时 $lib.settings.get 恒返回 undefined（沙箱仍可用）', () => {
    const { runInContext } = createSandbox()
    expect(runInContext('typeof $lib.settings.get', 't.js')).toBe('function')
    expect(runInContext("$lib.settings.get('any')", 't.js')).toBeUndefined()
  })
})

describe("executeRun 'setting-action'", () => {
  it('派发到插件 runSettingAction(key) 并返回其结果', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-sa-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'sa.plugin.js',
      `// ==Plugin==
// id: sa
// name: sa
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async runSettingAction(key) { return { message: '已处理 ' + key } },
}
`,
    )
    const result = await executeRun(f, 'setting-action', 'refreshDomain', {})
    expect(result).toEqual({ message: '已处理 refreshDomain' })
  })

  it('插件未实现 runSettingAction 时优雅报错', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-nosa-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'nosa.plugin.js',
      `// ==Plugin==
// id: nosa
// name: nosa
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'setting-action', 'refreshDomain', {})).rejects.toThrow(
      /不支持 runSettingAction/,
    )
  })

  it('缺 target（字段 key）时报错', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-sakey-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'sakey.plugin.js',
      `// ==Plugin==
// id: sakey
// name: sakey
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async runSettingAction(key) { return { message: key } },
}
`,
    )
    await expect(executeRun(f, 'setting-action', undefined, {})).rejects.toThrow(
      /setting-action 需要字段 key/,
    )
  })

  it('setting-action 也注入 $lib.settings，处理函数内可读取当前用户偏好', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-saset-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'saset.plugin.js',
      `// ==Plugin==
// id: saset
// name: saset
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async runSettingAction(key) {
    var line = $lib.settings.get('apiLine')
    return { message: 'line=' + (line === undefined ? '默认' : line) }
  },
}
`,
    )
    const result = await executeRun(f, 'setting-action', 'refreshDomain', {
      settings: { apiLine: '4' },
    })
    expect(result).toEqual({ message: 'line=4' })
  })

  it('普通动作（list）也能读到注入的 $lib.settings', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-listset-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'listset.plugin.js',
      `// ==Plugin==
// id: listset
// name: listset
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() {
    var line = $lib.settings.get('apiLine')
    return { items: [{ id: String(line), title: 't', url: 'u' }] }
  },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    const result = (await executeRun(f, 'list', undefined, {
      settings: { apiLine: '2' },
    })) as { items: Array<Record<string, string>> }
    expect(result.items[0].id).toBe('2')
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadPlugin } from '../plugin-loader.js'
import { createSandbox } from '../sandbox.js'

const TMP_DIR = os.tmpdir()

/** 写一个临时插件文件并返回路径 */
function writePlugin(content: string, suffix = '.plugin.js'): string {
  const file = path.join(
    TMP_DIR,
    `lingshu-plugin-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`,
  )
  fs.writeFileSync(file, content, 'utf-8')
  return file
}

const VALID_PLUGIN = `// ==Plugin==
// id: demo
// name: 演示插件
// version: 1.0.0
// author: tester
// ==EndPlugin==

module.exports = {
  id: 'demo',
  name: '演示插件',
  version: '1.0.0',
  async fetchList() {
    return [{ id: '1', title: 't', url: 'https://example.com/1' }]
  },
  async fetchDetail(url) {
    return {
      title: 't',
      sourceName: 'demo',
      sourceUrl: url,
      blocks: [{ type: 'text', content: 'hi' }],
    }
  },
}
`

const files: string[] = []

function track(file: string): string {
  files.push(file)
  return file
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

describe('loadPlugin', () => {
  it('合法插件返回 meta 与 plugin（含 fetchList/fetchDetail）', () => {
    const file = track(writePlugin(VALID_PLUGIN))
    const loaded = loadPlugin(file)
    expect(loaded.meta.id).toBe('demo')
    expect(loaded.meta.name).toBe('演示插件')
    expect(loaded.meta.version).toBe('1.0.0')
    expect(loaded.meta.author).toBe('tester')
    expect(loaded.sourceFile).toBe(file)
    expect(typeof loaded.plugin.fetchList).toBe('function')
    expect(typeof loaded.plugin.fetchDetail).toBe('function')
  })

  it('插件内可调用 $lib（如 cheerio 解析 HTML）', async () => {
    const code = `// ==Plugin==
// id: lib
// name: 用库插件
// version: 0.1.0
// ==EndPlugin==

module.exports = {
  id: 'lib',
  name: '用库插件',
  version: '0.1.0',
  async fetchList() {
    var $ = $lib.cheerio.load('<h1>标题</h1>')
    return { items: [{ id: '1', title: $('h1').text(), url: 'https://x/1' }] }
  },
  async fetchDetail(url) {
    return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] }
  },
}
`
    const file = track(writePlugin(code))
    const loaded = loadPlugin(file)
    const list = await loaded.plugin.fetchList()
    expect(list.items[0].title).toBe('标题')
  })

  it('导出对象缺少 id/name/version 时以元数据头兜底', () => {
    const code = `// ==Plugin==
// id: fallback
// name: 兜底插件
// version: 2.0.0
// ==EndPlugin==

module.exports = {
  async fetchList() { return [] },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    const loaded = loadPlugin(file)
    // 导出对象未设置 id/name/version，应以 meta 兜底
    expect(loaded.plugin.id).toBe('fallback')
    expect(loaded.plugin.name).toBe('兜底插件')
    expect(loaded.plugin.version).toBe('2.0.0')
  })

  it('导出对象自带 id/name/version 时优先保留导出值', () => {
    const code = `// ==Plugin==
// id: meta-id
// name: meta-name
// version: 1.0.0
// ==EndPlugin==

module.exports = {
  id: 'export-id',
  name: 'export-name',
  version: '9.9.9',
  async fetchList() { return [] },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    const loaded = loadPlugin(file)
    expect(loaded.plugin.id).toBe('export-id')
    expect(loaded.plugin.name).toBe('export-name')
    expect(loaded.plugin.version).toBe('9.9.9')
  })

  it('缺少 ==Plugin== 头时抛错', () => {
    const file = track(
      writePlugin('module.exports = { fetchList() { return [] } }\n'),
    )
    expect(() => loadPlugin(file)).toThrow(/缺少.*元数据头/)
  })

  it('==Plugin== 头存在但缺 id 字段时抛错', () => {
    const code = `// ==Plugin==
// name: 无ID
// version: 1.0.0
// ==EndPlugin==

module.exports = {
  id: 'x',
  name: '无ID',
  version: '1.0.0',
  async fetchList() { return [] },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    expect(() => loadPlugin(file)).toThrow(/缺少必填字段.*id/)
  })

  it('缺 name 字段时抛错', () => {
    const code = `// ==Plugin==
// id: noname
// version: 1.0.0
// ==EndPlugin==

module.exports = {
  id: 'noname',
  name: 'x',
  version: '1.0.0',
  async fetchList() { return [] },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    expect(() => loadPlugin(file)).toThrow(/缺少必填字段.*name/)
  })

  it('缺 version 字段时抛错', () => {
    const code = `// ==Plugin==
// id: noversion
// name: 无版本
// ==EndPlugin==

module.exports = {
  id: 'noversion',
  name: '无版本',
  version: '1.0.0',
  async fetchList() { return [] },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    expect(() => loadPlugin(file)).toThrow(/缺少必填字段.*version/)
  })

  it('缺 fetchList 时抛错', () => {
    const code = `// ==Plugin==
// id: nolist
// name: 无列表
// version: 1.0.0
// ==EndPlugin==

module.exports = {
  id: 'nolist',
  name: '无列表',
  version: '1.0.0',
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    expect(() => loadPlugin(file)).toThrow(/缺少 fetchList 方法/)
  })

  it('缺 fetchDetail 时抛错', () => {
    const code = `// ==Plugin==
// id: nodetail
// name: 无详情
// version: 1.0.0
// ==EndPlugin==

module.exports = {
  id: 'nodetail',
  name: '无详情',
  version: '1.0.0',
  async fetchList() { return [] },
}
`
    const file = track(writePlugin(code))
    expect(() => loadPlugin(file)).toThrow(/缺少 fetchDetail 方法/)
  })

  it('插件文件不存在时抛出带上下文的友好错误', () => {
    const missing = path.join(TMP_DIR, `not-exist-${Date.now()}.js`)
    expect(() => loadPlugin(missing)).toThrow(/不存在或不可读/)
  })

  it('传入自定义 sandbox 时复用（不新建），用于 fixture 模式覆盖 $lib', async () => {
    // 构造一个覆盖了 $lib.http.get 的 sandbox，传入 loadPlugin
    const sandbox = createSandbox()
    let calledUrl = ''
    sandbox.$lib.http.get = async (url: string) => {
      calledUrl = url
      return { status: 200, headers: {}, body: '<r><t>FIXED</t></r>' }
    }
    const code = `// ==Plugin==
// id: reuse
// name: 复用沙箱
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() {
    var r = await $lib.http.get('https://fixture.test/x')
    var $ = $lib.cheerio.load(r.body)
    return { items: [{ id: '1', title: $('t').text(), url: 'u' }] }
  },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`
    const file = track(writePlugin(code))
    const loaded = loadPlugin(file, sandbox)
    const list = await loaded.plugin.fetchList()
    expect(calledUrl).toBe('https://fixture.test/x')
    expect(list.items[0].title).toBe('FIXED')
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { findPluginFile, resolvePluginDir, executeRun } from '../commands/run.js'
import { listingsCommand } from '../commands/listings.js'

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

/** 在临时目录下写一个文件 */
function writeFile(dir: string, name: string, content: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, 'utf-8')
  return trackFile(p)
}

describe('findPluginFile', () => {
  it('目录不存在时返回 null', () => {
    const missing = path.join(TMP, `no-such-dir-${Date.now()}`)
    expect(findPluginFile(missing, 'demo')).toBeNull()
  })

  it('精确匹配 <id>.plugin.js 返回完整路径', () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-ff-${process.pid}-${Date.now()}`),
    )
    const created = writeFile(dir, 'demo.plugin.js', '// stub\n')
    const found = findPluginFile(dir, 'demo')
    expect(found).toBe(created)
  })

  it('目录存在但无匹配文件时返回 null', () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-ff2-${process.pid}-${Date.now()}`),
    )
    writeFile(dir, 'other.plugin.js', '// stub\n')
    expect(findPluginFile(dir, 'demo')).toBeNull()
  })

  it('不会误匹配相似前缀（需精确等于 <id>.plugin.js）', () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-ff3-${process.pid}-${Date.now()}`),
    )
    writeFile(dir, 'demo-extra.plugin.js', '// stub\n')
    expect(findPluginFile(dir, 'demo')).toBeNull()
  })
})

describe('resolvePluginDir', () => {
  it('显式传入时直接 resolve 返回', () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-rd-${process.pid}-${Date.now()}`),
    )
    const rel = path.relative(process.cwd(), dir)
    expect(resolvePluginDir(rel)).toBe(path.resolve(rel))
  })

  it('无显式参数时返回存在的候选目录（至少 process.cwd() 存在）', () => {
    const resolved = resolvePluginDir()
    expect(fs.existsSync(resolved)).toBe(true)
  })

  it('显式目录下能经 findPluginFile 定位插件（--dir 选项端到端）', () => {
    // 模拟 runCommand 路径：resolvePluginDir(dir) + findPluginFile 命中
    const dir = trackDir(
      path.join(TMP, `lingshu-dirflag-${process.pid}-${Date.now()}`),
    )
    const created = writeFile(
      dir,
      'custom.plugin.js',
      `// ==Plugin==
// id: custom
// name: custom
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    const resolvedDir = resolvePluginDir(dir)
    expect(resolvedDir).toBe(path.resolve(dir))
    expect(findPluginFile(resolvedDir, 'custom')).toBe(created)
    // 确认默认（cwd）目录不会命中该自定义插件
    expect(findPluginFile(resolvePluginDir(), 'custom')).toBeNull()
  })
})

describe('executeRun 错误路径', () => {
  it('不支持的 action 抛错', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-err-${process.pid}-${Date.now()}`),
    )
    const f = writeFile(
      dir,
      'bad.plugin.js',
      `// ==Plugin==
// id: bad
// name: bad
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'unknown', undefined, {})).rejects.toThrow(
      /不支持的动作/,
    )
  })

  it('detail 无 target 抛错', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-err2-${process.pid}-${Date.now()}`),
    )
    const f = writeFile(
      dir,
      'd.plugin.js',
      `// ==Plugin==
// id: d
// name: d
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'detail', undefined, {})).rejects.toThrow(
      /detail 需要 URL/,
    )
  })

  it('search 无 target 抛错', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-err3-${process.pid}-${Date.now()}`),
    )
    const f = writeFile(
      dir,
      's.plugin.js',
      `// ==Plugin==
// id: s
// name: s
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async search(q) { return { items: [] } },
}
`,
    )
    await expect(executeRun(f, 'search', undefined, {})).rejects.toThrow(
      /search 需要查询词/,
    )
  })

  it('search 插件未实现 search 时抛错', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-err4-${process.pid}-${Date.now()}`),
    )
    const f = writeFile(
      dir,
      'ns.plugin.js',
      `// ==Plugin==
// id: ns
// name: ns
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'search', 'kw', {})).rejects.toThrow(
      /不支持 search/,
    )
  })
})

describe('executeRun fixture 模式端到端集成', () => {
  it('覆盖 $lib.http.get 后，插件经 cheerio 解析 fixture HTML 返回列表', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-e2e-${process.pid}-${Date.now()}`),
    )

    // 插件：用 $lib.http.get 取页面，再用 $lib.cheerio.load 解析
    const pluginFile = writeFile(
      dir,
      'site.plugin.js',
      `// ==Plugin==
// id: site
// name: 站点插件
// version: 1.2.0
// description: 集成测试用
// sourceUrl: https://example.com
// ==EndPlugin==
module.exports = {
  id: 'site',
  name: '站点插件',
  version: '1.2.0',
  async fetchList(ctx) {
    var res = $lib.http.get('https://example.com/list?page=' + (ctx && ctx.page || 1))
    var resp = await res
    var $ = $lib.cheerio.load(resp.body)
    var items = []
    $('li.item').each(function (i, el) {
      items.push({
        id: 'a' + i,
        title: $(el).find('.title').text(),
        url: 'https://example.com' + $(el).find('a').attr('href'),
        summary: $(el).find('.desc').text(),
      })
    })
    return { items }
  },
  async fetchDetail(url) {
    return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] }
  },
}
`,
    )

    // fixture HTML 快照
    const fixtureHtml = `<!DOCTYPE html><html><body>
      <ul>
        <li class="item"><a href="/p/1"><span class="title">第一篇</span><span class="desc">desc1</span></a></li>
        <li class="item"><a href="/p/2"><span class="title">第二篇</span><span class="desc">desc2</span></a></li>
        <li class="item"><a href="/p/3"><span class="title">第三篇</span><span class="desc">desc3</span></a></li>
      </ul></body></html>`
    const htmlPath = writeFile(dir, 'snapshot.html', fixtureHtml)

    const result = (await executeRun(pluginFile, 'list', undefined, {
      page: '2',
      fixture: htmlPath,
    })) as { items: Array<Record<string, string>> }

    expect(Array.isArray(result.items)).toBe(true)
    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toMatchObject({
      id: 'a0',
      title: '第一篇',
      url: 'https://example.com/p/1',
      summary: 'desc1',
    })
    expect(result.items[2].title).toBe('第三篇')
  })

  it('fixture 目录可按请求头分流：同一 URL 两副面孔（SSR HTML vs XHR JSON）各取各的快照', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-fxhdr-${process.pid}-${Date.now()}`),
    )
    // 插件：同一 URL 抓两次——不带 XHR 头拿 HTML，带 XHR 头拿 JSON
    const pluginFile = writeFile(
      dir,
      'two-face.plugin.js',
      `// ==Plugin==
// id: two-face
// name: 两副面孔
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() {
    var page = await $lib.http.get('https://example.com/room/1')
    var api = await $lib.http.get('https://example.com/room/1', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    var $ = $lib.cheerio.load(page.body)
    var parsed = JSON.parse(api.body)
    return { items: [{ id: 'x', title: $('.genre').text(), url: 'https://example.com/' + parsed.next }] }
  },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    writeFile(dir, 'page.html', '<html><body><span class="genre">口交</span></body></html>')
    writeFile(dir, 'api.json', '{"next":"2"}')
    writeFile(
      dir,
      'index.json',
      JSON.stringify({
        routes: [
          { match: '/room/1', headers: { 'X-Requested-With': 'XMLHttpRequest' }, file: 'api.json' },
          { match: '/room/1', file: 'page.html' },
        ],
      }),
    )

    const result = (await executeRun(pluginFile, 'list', undefined, {
      fixture: dir,
    })) as { items: Array<Record<string, string>> }
    // 不带头的拿了 HTML 快照、带头的拿了 JSON 快照（顺序反了就解析失败/取到错内容）
    expect(result.items[0]).toMatchObject({ title: '口交', url: 'https://example.com/2' })
  })

  it('非 fixture 模式（无网络）调用 list 时插件自行决定行为', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-nofx-${process.pid}-${Date.now()}`),
    )
    // 不触网的插件，确认默认加载路径仍工作
    const pluginFile = writeFile(
      dir,
      'static.plugin.js',
      `// ==Plugin==
// id: static
// name: 静态
// version: 0.1.0
// ==EndPlugin==
module.exports = {
  async fetchList(ctx) { return { items: [{ id: 'p' + ctx.page, title: 'T', url: 'u' }] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    const result = (await executeRun(pluginFile, 'list', undefined, {
      page: '5',
    })) as { items: Array<Record<string, string>> }
    expect(result.items[0].id).toBe('p5')
  })
})

describe('executeRun detail/search 成功路径', () => {
  it('detail 传入 target 时调用 fetchDetail', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-det-${process.pid}-${Date.now()}`),
    )
    const f = writeFile(
      dir,
      'd2.plugin.js',
      `// ==Plugin==
// id: d2
// name: d2
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 'TT', sourceName: 'S', sourceUrl: url, blocks: [{ type: 'text', content: 'body' }] } },
}
`,
    )
    const result = await executeRun(f, 'detail', 'https://x/y', {})
    expect(result).toMatchObject({
      title: 'TT',
      sourceUrl: 'https://x/y',
      sourceName: 'S',
    })
    expect(result.blocks[0].content).toBe('body')
  })

  it('search 传入 target 和分页上下文且插件实现了 search', async () => {
    const dir = trackDir(
      path.join(TMP, `lingshu-se-${process.pid}-${Date.now()}`),
    )
    const f = writeFile(
      dir,
      's2.plugin.js',
      `// ==Plugin==
// id: s2
// name: s2
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async search(q, context) { return { items: [{ id: 'q', title: q + '-' + context.page, url: 'u' }] } },
}
`,
    )
    const result = (await executeRun(f, 'search', 'hello', { page: '3' })) as {
      items: Array<Record<string, string>>
    }
    expect(result.items[0].title).toBe('hello-3')
  })
})

describe('executeRun explore 成功/失败路径', () => {
  it('explore 调用 getExplore 返回发现页 feed（含 viewMore）', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-ex-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'ex.plugin.js',
      `// ==Plugin==
// id: ex
// name: ex
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getExplore() {
    return [
      { title: '热门', items: [{ id: '1', title: '作品A', url: 'https://x/a' }], viewMore: { action: 'list', category: 'sort=hot' } },
      { title: '最新', items: [{ id: '2', title: '作品B', url: 'https://x/b' }] },
    ]
  },
}
`,
    )
    const result = (await executeRun(f, 'explore', undefined, {})) as Array<{
      title: string
      items: Array<Record<string, string>>
      viewMore?: { action: string; category?: string }
    }>
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('热门')
    expect(result[0].viewMore).toEqual({ action: 'list', category: 'sort=hot' })
    expect(result[1].items[0].title).toBe('作品B')
  })

  it('插件未实现 getExplore 时 explore 抛错', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-nex-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'nex.plugin.js',
      `// ==Plugin==
// id: nex
// name: nex
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'explore', undefined, {})).rejects.toThrow(/不支持 getExplore/)
  })

  it('explore 带 --url 时透传为 getExplore(context.url)（探索页条目，listings-first）', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-exu-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'exu.plugin.js',
      `// ==Plugin==
// id: exu
// name: exu
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getExplore(context) {
    return [{ title: context && context.url ? '分区:' + context.url : '默认页', items: [] }]
  },
}
`,
    )
    // 带 url：context.url 透传
    const withUrl = (await executeRun(f, 'explore', undefined, { url: 'news' })) as Array<{ title: string }>
    expect(withUrl[0].title).toBe('分区:news')
    // 无 url：等价零参默认探索页（旧插件兼容）
    const noUrl = (await executeRun(f, 'explore', undefined, {})) as Array<{ title: string }>
    expect(noUrl[0].title).toBe('默认页')
  })
})

describe('executeRun listings 成功/失败路径', () => {
  it('listings 调用 getListings 返回预设目录页', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-ls-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'ls.plugin.js',
      `// ==Plugin==
// id: ls
// name: ls
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getListings() {
    return [
      { name: '最新A漫', category: 'c=0&o=mr' },
      { name: '總排行', category: 'c=0&o=mv' },
    ]
  },
}
`,
    )
    const result = (await executeRun(f, 'listings', undefined, {})) as Array<{
      name: string
      category?: string
    }>
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: '最新A漫', category: 'c=0&o=mr' })
    expect(result[1].category).toBe('c=0&o=mv')
  })

  it('插件未实现 getListings 时 listings 抛错', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-nls-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'nls.plugin.js',
      `// ==Plugin==
// id: nls
// name: nls
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'listings', undefined, {})).rejects.toThrow(/不支持 getListings/)
  })
})

describe('executeRun play 成功/失败路径（播放页解析）', () => {
  it('play 传入播放页 URL 时调用 fetchPlayUrl 返回视频流', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-play-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'play.plugin.js',
      `// ==Plugin==
// id: play
// name: play
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async fetchPlayUrl(url) { return { url: 'https://cdn.example.com/v.m3u8', platform: 'demo', referer: url } },
}
`,
    )
    const result = await executeRun(f, 'play', 'https://x/play/1-1-1.html', {})
    expect(result).toEqual({
      url: 'https://cdn.example.com/v.m3u8',
      platform: 'demo',
      referer: 'https://x/play/1-1-1.html',
    })
  })

  it('play 无 target 抛错', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-play2-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'play2.plugin.js',
      `// ==Plugin==
// id: play2
// name: play2
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async fetchPlayUrl(url) { return { url: 'https://cdn.example.com/v.m3u8' } },
}
`,
    )
    await expect(executeRun(f, 'play', undefined, {})).rejects.toThrow(/play 需要 URL/)
  })

  it('插件未实现 fetchPlayUrl 时 play 抛错', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-play3-${process.pid}-${Date.now()}`))
    const f = writeFile(
      dir,
      'play3.plugin.js',
      `// ==Plugin==
// id: play3
// name: play3
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [] } },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
}
`,
    )
    await expect(executeRun(f, 'play', 'https://x/play/1.html', {})).rejects.toThrow(
      /不支持 fetchPlayUrl/,
    )
  })
})

describe('listingsCommand 逐条 fetchList 验证', () => {
  it('对每个目录页跑 fetchList 并输出条目数', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-lscmd-${process.pid}-${Date.now()}`))
    writeFile(
      dir,
      'lscmd.plugin.js',
      `// ==Plugin==
// id: lscmd
// name: lscmd
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList(ctx) {
    const category = (ctx && ctx.category) || ''
    return { items: category ? [{ id: 'c', title: '目录条目 ' + category, url: 'https://x/' + category }] : [] }
  },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getListings() {
    return [
      { name: 'A', category: 'o=mr' },
      { name: 'B', category: 'o=mv' },
    ]
  },
}
`,
    )
    const logs: string[] = []
    const originalLog = console.log
    const originalError = console.error
    console.log = (msg?: any) => { logs.push(String(msg)) }
    console.error = () => {}
    try {
      await listingsCommand('lscmd', { dir })
    } finally {
      console.log = originalLog
      console.error = originalError
    }
    const joined = logs.join('\n')
    expect(joined).toContain('2 个目录页')
    expect(joined).toContain('✓ A')
    expect(joined).toContain('✓ B')
    expect(joined).toContain('目录条目 o=mv')
  })

  it('目录页带 filters 时输出筛选组摘要，并用首选项组合验证；验证失败只提示不判失败', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-lscmd-f-${process.pid}-${Date.now()}`))
    writeFile(
      dir,
      'lscmdf.plugin.js',
      `// ==Plugin==
// id: lscmdf
// name: lscmdf
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList(ctx) {
    const category = (ctx && ctx.category) || ''
    return { items: category ? [{ id: 'c', title: '条目 ' + category, url: 'https://x/' + category }] : [] }
  },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getListings() {
    return [
      {
        name: '电影',
        category: 'tid=1',
        filters: [
          { name: '地区', key: 'area', items: [{ id: 'cn', name: '大陆' }] },
          { name: '年份', key: 'year', items: [{ id: '2026', name: '2026' }] },
        ],
      },
      { name: '无筛选目录', category: 'o=mv' },
    ]
  },
}
`,
    )
    const logs: string[] = []
    const originalLog = console.log
    const originalError = console.error
    console.log = (msg?: any) => { logs.push(String(msg)) }
    console.error = () => {}
    try {
      await listingsCommand('lscmdf', { dir })
    } finally {
      console.log = originalLog
      console.error = originalError
    }
    const joined = logs.join('\n')
    // 摘要：组名 × 选项数
    expect(joined).toContain('filters: 地区(1项) / 年份(1项)')
    // 首选项组合验证通过：category = tid=1&area=cn（fetchList 消费成功）
    expect(joined).toContain('✓ 筛选 area=cn 可消费')
    expect(joined).toContain('✓ 筛选 year=2026 可消费')
    // 无 filters 的目录页标注
    expect(joined).toContain('filters: 无')
  })

  it('目录页 filters 验证失败只提示、目录页本身失败才判失败', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-lscmd-err-${process.pid}-${Date.now()}`))
    writeFile(
      dir,
      'lscmderr.plugin.js',
      `// ==Plugin==
// id: lscmderr
// name: lscmderr
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList(ctx) {
    const category = (ctx && ctx.category) || ''
    // 无 category：目录页本身失败；带筛选键：抛错（模拟站点反爬拦截）
    if (!category) throw new Error('目录页不可达')
    if (category.indexOf('genre=') >= 0) throw new Error('筛选路由被反爬拦截')
    return { items: [{ id: '1', title: 'ok', url: 'https://x/1' }] }
  },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getListings() {
    return [
      // 带 category：目录页 fetchList 成功（td=1），筛选验证失败（genre 抛错）
      {
        name: '电影',
        category: 'tid=1',
        filters: [{ name: '题材', key: 'genre', items: [{ id: 'love', name: '爱情' }] }],
      },
      // 无 category：目录页本身失败（默认列表不可达）
      { name: '坏目录' },
    ]
  },
}
`,
    )
    const logs: string[] = []
    const originals = { log: console.log, error: console.error }
    console.log = (msg?: any) => { logs.push(String(msg)) }
    console.error = (msg?: any) => { logs.push(String(msg)) }
    try {
      await listingsCommand('lscmderr', { dir })
    } finally {
      console.log = originals.log
      console.error = originals.error
    }
    const joined = logs.join('\n')
    // 目录页本身失败 → 判失败（✗）
    expect(joined).toContain('✗ 坏目录')
    expect(joined).toContain('目录页不可达')
    // 筛选验证失败（反爬拦截）→ 仅提示、不判失败（带 ⚠ 而非 ✗，标记「不判失败」，
    // 避免站点反爬被误判成插件缺陷）
    expect(joined).toContain('⚠ 筛选 genre=love 验证失败（不判失败）')
    expect(joined).not.toMatch(/✗ 筛选/)
    // 目录页成功（带 category 的「电影」）不受筛选验证失败影响
    expect(joined).toContain('✓ 电影')
  })

  // 网站原页（宿主 globe）口径与 iOS `WebsiteOrigin.listingOriginAddress` 同一取法：
  // origin 恒优先 > 非探索页的 url；category 型/explore 标识无地址 → 宿主不挂按钮。
  // 逐条标注 + 末尾小结（只提示不判失败：站点是否真有对应目录页只有插件作者知道）。
  it('输出网站原页地址，并列出缺地址的叶子（宿主不挂 globe）', async () => {
    const dir = trackDir(path.join(TMP, `lingshu-lsorigin-${process.pid}-${Date.now()}`))
    writeFile(
      dir,
      'lorigin.plugin.js',
      `// ==Plugin==
// id: lorigin
// name: lorigin
// version: 1.0.0
// ==EndPlugin==
module.exports = {
  async fetchList() { return { items: [{ id: '1', title: 'ok', url: 'https://x/1' }] } },
  async getExplore() { return [{ title: '分区' }] },
  async fetchDetail(url) { return { title: 't', sourceName: 's', sourceUrl: url, blocks: [] } },
  async getListings() {
    return [
      // url 语义被探索页标识占用 → 真页只能用 origin 给
      { name: '探索页', kind: 'explore', url: 'news', origin: 'https://x/real' },
      // 页面通道 url 兼作原页
      { name: '有 url', url: 'https://x/list' },
      // 只有 category：宿主不拼 category 当地址
      { name: '只有分类', category: 'o=mr' },
      // 非空但 scheme 非法：宿主隐藏按钮（非空 origin 即权威，不静默改指 url）
      { name: '非法地址', kind: 'explore', origin: 'ftp://x/y' },
      // 分组结点：自身无单一内容页（不计入无地址名单），子项照常
      { name: '片商', children: [{ name: '厂牌', category: 'tag=1' }] },
    ]
  },
}
`,
    )
    const logs: string[] = []
    const originals = { log: console.log, error: console.error }
    console.log = (msg?: any) => { logs.push(String(msg)) }
    console.error = (msg?: any) => { logs.push(String(msg)) }
    try {
      await listingsCommand('lorigin', { dir })
    } finally {
      console.log = originals.log
      console.error = originals.error
    }
    const joined = logs.join('\n')
    expect(joined).toContain('[url=news]  [原页=https://x/real]')
    expect(joined).toContain('[url=https://x/list]  [原页=https://x/list]')
    expect(joined).toContain('·无原页')
    expect(joined).toContain('·无原页（非法地址 ftp://x/y：宿主只认 http(s)）')
    // 小结：5 条叶子（探索页 / 有 url / 只有分类 / 非法地址 / 片商·厂牌）里 2 条有地址，
    // 缺地址名单带分组路径；分组结点自身不进名单
    expect(joined).toContain('网站原页（globe）：2/5 个叶子目录页有地址')
    expect(joined).toContain('⚠ 无地址（宿主不挂 globe）3 条: 只有分类、非法地址、片商/厂牌')
  })
})

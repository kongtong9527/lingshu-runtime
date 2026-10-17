import { executeRun, findPluginFile, resolvePluginDir, type RunOptions } from './run.js'
import { linkedItemsFor, validateListingFilters } from '../filters-linkage.js'

export interface ListingsOptions {
  dir?: string
  fixture?: string
}

/**
 * listings 命令：跑 getListings()，递归验证**导航树**（ADR-0025）：
 * - 分组结点（带 children）先打印，然后递归各子项；
 * - 叶子目录页用其 url（页面通道）优先、否则 category，调 fetchList 验证能出条目；
 *   （两者都缺省用默认列表验证）
 * - ADR-0021：叶子可携带 filters（本目录页专属筛选组）。命令打印筛选组摘要，
 *   并对「category 型」叶子额外用「category + 每个筛选组首个选项」组合验证 fetchList
 *   能消费；url 型叶子只打印摘要不强验（url 通道与筛选组合的边界语义未定，筛选验证
 *   本就是增强信息而非硬门槛，站点反爬导致失败仅提示、不置 exitCode）。
 */
export async function listingsCommand(pluginId: string, options: ListingsOptions): Promise<void> {
  const pluginDir = resolvePluginDir(options.dir)
  const pluginFile = findPluginFile(pluginDir, pluginId)
  if (!pluginFile) {
    console.error(`错误: 找不到插件 "${pluginId}"（查找目录: ${pluginDir}）`)
    process.exit(1)
  }

  try {
    const listings = await executeRun(pluginFile, 'listings', undefined, {
      dir: options.dir,
      fixture: options.fixture,
    })
    if (!Array.isArray(listings)) {
      throw new Error('getListings 应返回数组')
    }
    console.log(`getListings() -> ${listings.length} 个目录页\n`)
    if (listings.length === 0) {
      return
    }

    let leafCount = 0
    // 网站原页（宿主那颗 globe）逐叶子收集：宿主取法与 WebsiteOrigin.listingOriginAddress 同一口径——
    // 显式 `origin` 恒优先，无 origin 时只有**非探索页**的 `url` 可兼作地址（explore 的 url 是探索页标识），
    // `category` 永不当地址、分组结点无单一内容页。缺地址 = 宿主不挂按钮（这是插件侧要修的，故逐条列出）。
    const leafOrigins: { name: string; address: string }[] = []

    /**
     * ADR-0021 筛选组摘要 + 组合验证。
     * - 摘要：分节单组（sections，与 items 二选一）按节计数、首选项取首节首叶子；
     *   多选 tag 样式（display:'tags'）后缀 ·tag 标注展示形态（状态/编码与复选框一致）。
     * - 验证：用「category + 每组首选项」调**消费该筛选的动作**——`list` 叶子走 `fetchList`
     *   （`context.category`），`tags` 叶子走 `getTags`（`TagContext.category`，ADR-0062）；
     *   带 `url` 时一并传（宿主也是 url + category 一起给，筛选栏挂在页面通道上）。
     *   **只提示不置 exitCode**：站点反爬拦截/离线 fixture 单页喂多 URL 都可能失败，
     *   与「不冒充能力」原则一致——目录页本身出内容才是通过标准。
     */
    const reportFilters = async (node: any, action: 'list' | 'tags', indent: string): Promise<void> => {
      const filters = Array.isArray(node?.filters) ? node.filters : []
      const filterLeaves = (g: any): any[] =>
        Array.isArray(g?.sections) && g.sections.length
          ? g.sections.flatMap((s: any) => (Array.isArray(s?.items) ? s.items : []))
          : (Array.isArray(g?.items) ? g.items : [])
      if (!filters.length) {
        console.log(`      ${indent}filters: 无`)
        return
      }
      const summary = filters
        .map((g: any) => {
          const leaves = filterLeaves(g)
          const sec = Array.isArray(g?.sections) && g.sections.length ? `${g.sections.length}节/` : ''
          const tag = g?.display === 'tags' ? '·tag' : ''
          const link = typeof g?.dependsOn === 'string' && g.dependsOn.trim() ? `→${g.dependsOn.trim()}` : ''
          return `${g.name}(${sec}${leaves.length}项${tag}${link})`
        })
        .join(' / ')
      console.log(`      ${indent}filters: ${summary}`)
      // 联动静态校验（ADR-0063，Q12）：结构性 error 判失败（契约违反），warn 与动态探针只提示。
      // 运行期（DevConsole/iOS）对 error 永不白屏——容差渲染 + console 告警，见 filters-linkage.ts。
      const linkage = validateListingFilters(filters)
      for (const w of linkage.warnings) {
        console.error(`      ${indent}⚠ 联动告警（不判失败）: ${w}`)
      }
      for (const e of linkage.errors) {
        console.error(`      ${indent}✗ 联动校验失败: ${e}`)
        process.exitCode = 1
      }
      for (const group of filters) {
        // 每组只验前 2 个**非空 id** 选项：空 id 是站点默认档（不输出参数 = 目录页自己那页，
        // 验了也是原地打转）；全量验会为 A-Z（27 项）这类组打出几十个请求。
        // 「前 2 个」而非「只验第一个」是有意的：类型开关的第一项往往就是 listing 自己那页，
        // 只验它会漏掉**真正换页的那一支**（kvs_site_a `type=album` 换到图集侧索引页）。
        const probes = filterLeaves(group)
          .filter((leaf: any) => leaf && leaf.id !== undefined && leaf.id !== null && leaf.id !== '')
          .slice(0, 2)
        if (!group.key || !probes.length) continue
        for (const probe of probes) {
          const filterCategory = `${node?.category ? node.category + '&' : ''}${group.key}=${probe.id}`
          const runOpts: RunOptions = {
            dir: options.dir,
            fixture: options.fixture,
            category: filterCategory,
          }
          if (node?.url) runOpts.url = node.url
          if (node?.channel) runOpts.channel = node.channel
          try {
            await executeRun(pluginFile, action, undefined, runOpts)
            console.log(`      ${indent}✓ 筛选 ${group.key}=${probe.id} 可消费（${action}）`)
          } catch (err: any) {
            console.error(
              `      ${indent}⚠ 筛选 ${group.key}=${probe.id} 验证失败（不判失败）: ${err.message}`,
            )
          }
        }
      }
      // 联动组合探针（ADR-0063，Q15-d）：逐父值 × 子在该父值下的首个非空选项，
      // 验证各分支都可消费（如 kvs_site_a `type=video/album` 两支排序档）。
      // 父取值过多时只探前 4 个、总组合上限 8 个；失败只提示不判失败（站点反爬/离线 fixture）。
      const linkedChildren = filters.filter(
        (g: any) => typeof g?.dependsOn === 'string' && g.dependsOn.trim() && typeof g?.key === 'string' && g.key,
      )
      if (linkedChildren.length) {
        const byKey = new Map(filters.map((g: any) => [g?.key, g]))
        let comboCount = 0
        for (const child of linkedChildren) {
          const parentKey = child.dependsOn.trim()
          const parent = byKey.get(parentKey)
          if (!parent) continue
          const parentVals = filterLeaves(parent)
            .filter((leaf: any) => leaf && leaf.id !== undefined && leaf.id !== null && leaf.id !== '')
            .slice(0, 4)
          for (const pv of parentVals) {
            if (comboCount >= 8) break
            const childLeaves = linkedItemsFor(child, pv.id) ?? filterLeaves(child)
            const cv = (childLeaves as any[]).find(
              (leaf: any) => leaf && leaf.id !== undefined && leaf.id !== null && leaf.id !== '',
            )
            if (!cv) continue
            comboCount += 1
            const filterCategory = `${node?.category ? node.category + '&' : ''}${parentKey}=${pv.id}&${child.key}=${cv.id}`
            const runOpts: RunOptions = {
              dir: options.dir,
              fixture: options.fixture,
              category: filterCategory,
            }
            if (node?.url) runOpts.url = node.url
            if (node?.channel) runOpts.channel = node.channel
            try {
              await executeRun(pluginFile, action, undefined, runOpts)
              console.log(`      ${indent}✓ 联动 ${parentKey}=${pv.id} + ${child.key}=${cv.id} 可消费（${action}）`)
            } catch (err: any) {
              console.error(
                `      ${indent}⚠ 联动 ${parentKey}=${pv.id} + ${child.key}=${cv.id} 验证失败（不判失败）: ${err.message}`,
              )
            }
          }
          if (comboCount >= 8) break
        }
      }
    }

    const walk = async (node: any, depth: number, trail: string = ''): Promise<void> => {
      const indent = '  '.repeat(depth)
      const name = node?.name ?? '(未命名)'
      const path = trail ? `${trail}/${name}` : name
      const kind = node?.kind
      const channelTag = typeof node?.channel === 'string' && node.channel ? ` [channel=${node.channel}]` : ''
      const target = node?.url ? `url=${node.url}` : node?.category ? `category=${node.category}` : ''
      const kindTag = kind && kind !== 'list' ? ` [kind=${kind}]` : ''

      const children = Array.isArray(node?.children) && node.children.length ? node.children : null
      if (children) {
        console.log(`${indent}▸ ${name}${kindTag}${target ? `  (${target})` : ' · 分组，非目录'}`)
        console.log(`${indent}  └─ 子项 ${children.length} 个:`)
        for (const child of children) {
          await walk(child, depth + 1, path)
        }
        return
      }

      const explicitOrigin = typeof node?.origin === 'string' && node.origin.trim() ? node.origin.trim() : ''
      const urlAsOrigin =
        kind !== 'explore' && typeof node?.url === 'string' && node.url.trim() ? node.url.trim() : ''
      const candidate = explicitOrigin || urlAsOrigin
      // 宿主只认能拼成 http(s) 的地址（非空白但 scheme 不是 http(s) 时同样隐藏按钮，
      // 非空 origin 即权威、不静默改指 url）——此处按无地址计，否则 CLI 给假绿。
      const scheme = (candidate.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/) ?? [])[1]
      const illegal = Boolean(scheme && !/^https?$/i.test(scheme))
      const pageAddress = illegal ? '' : candidate
      leafOrigins.push({ name: path, address: pageAddress })
      // 与 target 分开标注：两者都存在时（origin 覆盖 url 语义）能一眼看出差异。
      const originTag = illegal
        ? `  ·无原页（非法地址 ${candidate}：宿主只认 http(s)）`
        : pageAddress
          ? `  [原页=${pageAddress}]`
          : '  ·无原页'

      // 探索页条目（listings-first）：kind==='explore' 的叶子内容形态 = getExplore(context)
      // 聚合 feed（ExploreSection[]），url 为探索页标识（缺省 = 默认探索页）。
      // 不消费 category/filters——走 getExplore 验证，不调 fetchList。
      if (kind === 'explore') {
        leafCount += 1
        const runOpts: RunOptions = { dir: options.dir, fixture: options.fixture }
        if (node?.url) runOpts.url = node.url
        try {
          const result = await executeRun(pluginFile, 'explore', undefined, runOpts)
          const sections = Array.isArray(result) ? result : []
          const titles = sections
            .map((s: any) => s?.title)
            .filter(Boolean)
            .join(' / ')
          console.log(
            `  ${indent}✓ ${name} [kind=explore]${target ? `  [${target}]` : ''}${originTag} -> ${sections.length} 个分区${titles ? `: ${titles}` : ''}`,
          )
        } catch (err: any) {
          console.error(`  ${indent}✗ ${name} [kind=explore]${target ? `  [${target}]` : ''}${originTag} -> ${err.message}`)
          process.exitCode = 1
        }
        console.log(`      ${indent}filters: 探索页不消费筛选（列表页属性，listings-first）`)
        return
      }

      // 标签索引条目：kind==='tags' 的叶子内容形态 = getTags()（legacy TagGroup[] 全量云，
      // 首字分组；或 TagResult 分页云，本页 groups + pagination，见 TagContext）。
      // url 为索引页 URL（仅展示/回退），验证走 getTags，不调 fetchList。
      // ADR-0062：tags 叶子的 filters **同样消费**——选中项与 listing.category 合并成组合串，
      // 经 `TagContext.category` 透传（与 fetchList 的 context.category 同口径），
      // 故筛选验证也走 getTags（不是 fetchList）。
      if (kind === 'tags') {
        leafCount += 1
        try {
          const result = await executeRun(pluginFile, 'tags', undefined, { dir: options.dir, fixture: options.fixture })
          // 归一化：Array = legacy 全量；Object（含 groups）= 分页信封首页。
          const groups = Array.isArray(result) ? result : Array.isArray((result as any)?.groups) ? (result as any).groups : []
          const pagination = !Array.isArray(result) ? (result as any)?.pagination : undefined
          const tagCount = groups.reduce((n: number, g: any) => n + (Array.isArray(g?.tags) ? g.tags.length : 0), 0)
          const titles = groups
            .map((g: any) => g?.title)
            .filter(Boolean)
            .slice(0, 8)
            .join(' / ')
          const pageInfo = pagination && typeof pagination === 'object' && 'hasMore' in (pagination as any)
            ? ` [page=${(pagination as any).page ?? 1} hasMore=${(pagination as any).hasMore}]`
            : ''
          console.log(
            `  ${indent}✓ ${name} [kind=tags]${target ? `  [${target}]` : ''}${originTag} -> ${groups.length} 组 ${tagCount} 个标签${pageInfo}${titles ? `: ${titles}${groups.length > 8 ? ' …' : ''}` : ''}`,
          )
          if (groups.length === 0 || tagCount === 0) {
            console.error(`  ${indent}✗ ${name} [kind=tags] -> 标签索引为空（应至少 1 组 1 标签）`)
            process.exitCode = 1
          }
        } catch (err: any) {
          console.error(`  ${indent}✗ ${name} [kind=tags]${target ? `  [${target}]` : ''}${originTag} -> ${err.message}`)
          process.exitCode = 1
        }
        await reportFilters(node, 'tags', indent)
        return
      }

      // 叶子目录页：url 优先，否则 category，否则默认列表
      leafCount += 1
      const runOpts: RunOptions = { dir: options.dir, fixture: options.fixture }
      if (node?.url) runOpts.url = node.url
      else if (node?.category) runOpts.category = node.category
      if (node?.channel) runOpts.channel = node.channel
      try {
        const result = await executeRun(pluginFile, 'list', undefined, runOpts)
        const items = Array.isArray(result?.items) ? result.items : []
        const columns = (result as any)?.layout?.columns
        const layoutTag = typeof columns === 'number' ? ` [columns=${columns}]` : ''
        console.log(`  ${indent}✓ ${name}${kindTag}${channelTag}${target ? `  [${target}]` : ''}${originTag} -> ${items.length} 条${layoutTag}`)
        if (items[0]) {
          console.log(`      ${indent}e.g. ${items[0].title}  ${items[0].url}`)
        }
        // ADR-0066：列表页自声明筛选组（`ListResult.filters`，抓到页面才知道的选项）
        // ——与目录页内嵌 filters（ADR-0021，下面 reportFilters）是**两个来源**，分开打印。
        const declared = (result as { filters?: Array<{ name?: string; key?: string; items?: unknown[] }> })?.filters
        if (Array.isArray(declared) && declared.length) {
          const parts = declared.map((g) => `${g.name ?? g.key ?? '?'}(${Array.isArray(g.items) ? g.items.length : 0}项)`)
          console.log(`      ${indent}落页自声明筛选（ListResult.filters）: ${parts.join(' / ')}`)
        }
      } catch (err: any) {
        console.error(`  ${indent}✗ ${name}${kindTag}${channelTag}${target ? `  [${target}]` : ''}${originTag} -> ${err.message}`)
        process.exitCode = 1
      }

      // ADR-0021：目录页内嵌筛选组（叶子属性）——打印摘要 + 组合验证（见 reportFilters）。
      await reportFilters(node, 'list', indent)
    }

    for (const listing of listings) {
      await walk(listing, 0)
    }
    console.log(`\n共 ${leafCount} 个可点击目录页`)

    // 网站原页小结：只提示、不置 exitCode——站点是否真有对应目录页只有插件作者知道
    // （manga_site_b 这类纯接口源本就无网页），但「没地址就没 globe」这件事必须显式说出来，
    // 否则条目全缺地址时发现页 14 个页签一颗按钮都没有，而 CLI 输出一片 ✓ 看不出问题。
    const withOrigin = leafOrigins.filter((leaf) => leaf.address)
    console.log(`网站原页（globe）：${withOrigin.length}/${leafOrigins.length} 个叶子目录页有地址`)
    if (withOrigin.length !== leafOrigins.length) {
      const missing = leafOrigins.filter((leaf) => !leaf.address).map((leaf) => leaf.name)
      console.error(`  ⚠ 无地址（宿主不挂 globe）${missing.length} 条: ${missing.join('、')}`)
      console.error(
        '    站点目录页是真实路由时写 url（页面通道兼作原页，fetchList 按 URL 分派）；' +
          "url 语义被探索页标识占用时写 origin（同 https://... 绝对地址，或可被插件 sourceUrl 解析的相对路径）",
      )
    }
  } catch (err: any) {
    console.error('错误:', err.message)
    process.exit(1)
  }
}

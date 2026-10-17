import type { CategoryGroup } from './types.js'

/**
 * 筛选组联动静态校验（ADR-0063，Q12 矩阵）：
 * 纯函数、无副作用，供 runtime `listings` 命令与单测消费。
 * 运行期（DevConsole/iOS）对 1–5 永不白屏——未知父当恒显、环截断、缺边忽略（容差）；
 * 硬失败只发生在 CLI 发布门（exitCode）。
 */

export interface LinkageValidation {
  errors: string[]
  warnings: string[]
}

/** 生效筛选类型（镜像 devconsole groupType / iOS effectiveType）：显式声明优先，否则 allowMultiple 视为 check */
export function effectiveFilterType(group: CategoryGroup): string {
  if (group.type) return group.type
  return group.allowMultiple ? 'check' : 'select'
}

/** 非空父 key（trim 后空串视为无边） */
function parentKeyOf(group: CategoryGroup): string | null {
  const raw = typeof group.dependsOn === 'string' ? group.dependsOn.trim() : ''
  return raw ? raw : null
}

/** 组声明的全部叶子 id（items + sections 扁平，含空 id） */
export function declaredLeafIds(group: CategoryGroup): string[] {
  const fromItems = Array.isArray(group.items) ? group.items.map((n) => n?.id ?? '') : []
  const fromSections = Array.isArray(group.sections)
    ? group.sections.flatMap((s) => (Array.isArray(s?.items) ? s.items.map((n) => n?.id ?? '') : []))
    : []
  return [...fromItems, ...fromSections]
}

/**
 * 联动子在给定父值下的映射选项（纯函数）：
 * 无边/无映射表/父值未命中/父空回落 → null（调用方用默认 items/sections）。
 * 命中时返回扁平叶子数组（分节组的节标题此时不展示，见 types 注释）。
 */
export function linkedItemsFor(group: CategoryGroup, parentValue: string): import('./types.js').CategoryNode[] | null {
  const parent = parentKeyOf(group)
  if (!parent) return null
  if (!group.optionsWhen || typeof group.optionsWhen !== 'object') return null
  const hit = (group.optionsWhen as Record<string, unknown>)[parentValue]
  return Array.isArray(hit) ? (hit as import('./types.js').CategoryNode[]) : null
}

export function validateListingFilters(filters: CategoryGroup[] | undefined | null): LinkageValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const groups = Array.isArray(filters) ? filters : []
  if (!groups.length) return { errors, warnings }
  const tag = (g: CategoryGroup) => `「${g?.name ?? '?'}」(${g?.key ?? '?'})`

  const keyCount = new Map<string, number>()
  for (const g of groups) {
    if (typeof g?.key === 'string') keyCount.set(g.key, (keyCount.get(g.key) ?? 0) + 1)
  }
  const byKey = new Map<string, CategoryGroup>()
  for (const g of groups) {
    if (typeof g?.key === 'string' && !byKey.has(g.key)) byKey.set(g.key, g)
  }

  // 环检测在 key 图上做（边：子 key → 父 key，自环即环）
  const edges = new Map<string, string>()
  for (const g of groups) {
    const parent = parentKeyOf(g)
    if (parent && typeof g?.key === 'string') {
      if (!edges.has(g.key)) edges.set(g.key, parent)
    }
  }
  const cyclic = new Set<string>()
  for (const start of edges.keys()) {
    const seen = new Set<string>()
    let cur: string | undefined = start
    while (cur && edges.has(cur)) {
      if (seen.has(cur)) {
        for (const k of seen) cyclic.add(k)
        break
      }
      seen.add(cur)
      cur = edges.get(cur)
    }
  }

  for (const g of groups) {
    const parent = parentKeyOf(g)
    const hasVisible = (g as CategoryGroup).visibleWhen !== undefined && (g as CategoryGroup).visibleWhen !== null
    const hasOptions = (g as CategoryGroup).optionsWhen !== undefined && (g as CategoryGroup).optionsWhen !== null

    // 2：有条件/映射无边
    if (!parent && (hasVisible || hasOptions)) {
      errors.push(`${tag(g)}写了 visibleWhen/optionsWhen 却无 dependsOn：边必须显式声明`)
      continue
    }
    if (!parent) continue

    // 1：父不存在
    const parentGroup = byKey.get(parent)
    if (!parentGroup) {
      errors.push(`${tag(g)}的 dependsOn「${parent}」在同数组内无此 key`)
      continue
    }

    // 5：联动 key 重复（含父子同 key）
    if (g.key === parent) {
      errors.push(`${tag(g)}的父子同 key「${parent}」：同一状态格无法共存`)
    } else {
      if ((keyCount.get(g.key) ?? 0) > 1) {
        errors.push(`${tag(g)}参与联动但 key 在同数组内重复（共享 key 组不得做父/子）`)
      }
      if ((keyCount.get(parent) ?? 0) > 1) {
        errors.push(`${tag(g)}的父 key「${parent}」在同数组内命中多组：按 key 寻址无法定位具体 widget`)
      }
    }

    // 3：check/text 做父
    const parentType = effectiveFilterType(parentGroup)
    if (parentType === 'check' || parentType === 'text') {
      errors.push(`${tag(g)}的父${tag(parentGroup)}是 ${parentType}：v1 父限 select/sort 单值组`)
    }

    // visibleWhen 缺 equals（JS 侧可能传空对象，容差判错）
    if (hasVisible) {
      const eq = (g.visibleWhen as { equals?: unknown } | undefined)?.equals
      if (eq === undefined || eq === null) {
        errors.push(`${tag(g)}的 visibleWhen 缺 equals`)
      }
    }

    // 6：映射覆盖不全 → warn；映射了父没有的值 → warn；equals 指未知父值 → warn
    if (hasOptions && parentGroup && parentType !== 'check' && parentType !== 'text') {
      const parentIds = declaredLeafIds(parentGroup).filter((id) => id !== '')
      const mapKeys = Object.keys(g.optionsWhen as Record<string, unknown>)
      for (const id of parentIds) {
        if (!mapKeys.includes(id)) {
          warnings.push(`${tag(g)}的 optionsWhen 缺父值「${id}」：回落默认 items`)
        }
      }
      for (const k of mapKeys) {
        if (k !== '' && !parentIds.includes(k)) {
          warnings.push(`${tag(g)}的 optionsWhen 含父没有的值「${k}」：该分支永不命中`)
        }
      }
    }
    if (hasVisible && parentGroup) {
      const eq = (g.visibleWhen as { equals?: unknown } | undefined)?.equals
      const wanted = Array.isArray(eq) ? eq.map(String) : eq !== undefined && eq !== null ? [String(eq)] : []
      const parentIds = declaredLeafIds(parentGroup)
      for (const v of wanted) {
        if (v !== '' && !parentIds.includes(v)) {
          warnings.push(`${tag(g)}的 visibleWhen.equals 含父没有的值「${v}」：该条件永不成立`)
        }
      }
    }
  }

  if (cyclic.size) {
    errors.push(`依赖环：${[...cyclic].join(' → ')}（含自环）：拓扑求值无法收敛`)
  }

  return { errors, warnings }
}

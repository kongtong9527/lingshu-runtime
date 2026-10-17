import { describe, expect, it } from 'vitest'
import type { CategoryGroup } from '../types.js'
import { linkedItemsFor, validateListingFilters } from '../filters-linkage.js'

// 联动静态校验回归锁（ADR-0063，Q12 矩阵）：5 类 error + 覆盖不全 warn。
function group(patch: Partial<CategoryGroup> & { name: string; key: string }): CategoryGroup {
  return { ...patch } as CategoryGroup
}

const parent = () =>
  group({ name: '类型', key: 'type', type: 'select', items: [{ id: 'video', name: '视频' }, { id: 'album', name: '图集' }] })

describe('validateListingFilters', () => {
  it('空数组/缺省零错零告警', () => {
    expect(validateListingFilters([])).toEqual({ errors: [], warnings: [] })
    expect(validateListingFilters(undefined)).toEqual({ errors: [], warnings: [] })
  })

  it('合法双组（kvs_site_a 式）零错', () => {
    const filters: CategoryGroup[] = [
      parent(),
      group({
        name: '排序', key: 'sort_by', type: 'sort', items: [{ id: 'title', name: '按字母' }],
        dependsOn: 'type', optionsWhen: { video: [{ id: 'total_videos', name: '最多收录' }], album: [{ id: 'total_albums', name: '最多收录' }] },
      }),
    ]
    const r = validateListingFilters(filters)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('1：父不存在即 error', () => {
    const r = validateListingFilters([
      group({ name: '子', key: 'child', dependsOn: 'ghost' }),
    ])
    expect(r.errors.length).toBe(1)
    expect(r.errors[0]).toContain('ghost')
  })

  it('2：有条件无边即 error', () => {
    const r = validateListingFilters([
      group({ name: '排序', key: 'sort_by', type: 'sort', items: [], visibleWhen: { equals: 'album' } }),
    ])
    expect(r.errors.length).toBe(1)
    expect(r.errors[0]).toContain('dependsOn')
  })

  it('3：check/text 做父即 error', () => {
    const r = validateListingFilters([
      group({ name: '标签', key: 'tags', type: 'check', items: [{ id: 'a', name: 'A' }] }),
      group({ name: '子', key: 'child', dependsOn: 'tags' }),
    ])
    expect(r.errors.some((e) => e.includes('check'))).toBe(true)
  })

  it('4：自环即 error', () => {
    const r = validateListingFilters([
      group({ name: '自', key: 'loop', dependsOn: 'loop' }),
    ])
    expect(r.errors.some((e) => e.includes('环') || e.includes('同 key'))).toBe(true)
  })

  it('4：双向环即 error', () => {
    const r = validateListingFilters([
      group({ name: '甲', key: 'a', dependsOn: 'b' }),
      group({ name: '乙', key: 'b', dependsOn: 'a' }),
    ])
    expect(r.errors.some((e) => e.includes('环'))).toBe(true)
  })

  it('5：联动 key 重复即 error，纯静态重复放行', () => {
    const dupChild = validateListingFilters([
      parent(),
      group({ name: '子一', key: 'dup', dependsOn: 'type' }),
      group({ name: '子二', key: 'dup' }),
    ])
    expect(dupChild.errors.some((e) => e.includes('重复'))).toBe(true)
    const staticDup = validateListingFilters([
      group({ name: '组一', key: 'tagIds', items: [{ id: '1', name: '一' }] }),
      group({ name: '组二', key: 'tagIds', items: [{ id: '2', name: '二' }] }),
    ])
    expect(staticDup.errors).toEqual([])
  })

  it('5：父子同 key 即 error', () => {
    const r = validateListingFilters([
      group({ name: '父', key: 'same', items: [{ id: 'x', name: 'X' }] }),
      group({ name: '子', key: 'same', dependsOn: 'same' }),
    ])
    expect(r.errors.some((e) => e.includes('同 key'))).toBe(true)
  })

  it('6：映射缺父值只 warn（回落 items）', () => {
    const r = validateListingFilters([
      parent(),
      group({ name: '排序', key: 'sort_by', dependsOn: 'type', optionsWhen: { video: [] } }),
    ])
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes('album'))).toBe(true)
  })
})

describe('linkedItemsFor', () => {
  it('无边/未命中回落 null，命中回映射表', () => {
    const child = group({
      name: '排序', key: 'sort_by', dependsOn: 'type',
      items: [{ id: 'v', name: '视频默认' }],
      optionsWhen: { album: [{ id: 'a', name: '图集档' }] },
    })
    expect(linkedItemsFor(group({ name: '独立', key: 'x' }), 'album')).toBeNull()
    expect(linkedItemsFor(child, 'video')).toBeNull()
    expect(linkedItemsFor(child, '')).toBeNull()
    expect(linkedItemsFor(child, 'album')).toEqual([{ id: 'a', name: '图集档' }])
  })
})

import { describe, it, expect } from 'vitest'
import { validateCardDSL, shouldFallbackCard } from '../card-dsl.js'
import type { CardDSL } from '../types.js'

const videoCard: CardDSL = {
  version: 1,
  root: {
    type: 'stack',
    direction: 'column',
    gap: 8,
    children: [
      {
        type: 'image',
        src: 'https://example.com/c/1.jpg',
        aspect: '16:9',
        borderRadius: 12,
        overlays: [
          { position: 'topLeft', text: '分类' },
          { position: 'bottomLeft', icon: 'eye', text: { value: 12000, format: 'count' } },
          { position: 'bottomRight', icon: 'clock', text: { value: 750, format: 'duration' } },
        ],
      },
      { type: 'text', text: '示例标题', font: { size: 'headline', weight: 'semibold' }, maxLines: 2 },
    ],
  },
}

/** 最小单图卡：image 字段按未知值注入，便于测缺省/非法值（缺省 aspect 由宿主回退 16:9） */
function imageCard(image: Record<string, unknown>): CardDSL {
  return {
    version: 1,
    root: { type: 'image', src: 'https://example.com/c/1.jpg', ...image },
  } as unknown as CardDSL
}

describe('card-dsl 校验', () => {
  it('合法横图卡通过', () => {
    const r = validateCardDSL(videoCard)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(shouldFallbackCard(videoCard)).toBe(false)
  })

  it('根非法整卡回退', () => {
    expect(shouldFallbackCard(null)).toBe(true)
    expect(shouldFallbackCard({} as CardDSL).valueOf()).toBe(true)
    const bad = { version: 2, root: { type: 'stack', children: [] } } as unknown as CardDSL
    expect(validateCardDSL(bad).ok).toBe(false)
  })

  it('超限只告警不回退（宿主截断）', () => {
    const many: CardDSL = {
      version: 1,
      root: {
        type: 'stack',
        direction: 'column',
        children: Array.from({ length: 60 }, (_, i) => ({ type: 'text', text: `行${i}` })),
      },
    }
    const r = validateCardDSL(many)
    expect(r.ok).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(shouldFallbackCard(many)).toBe(false)
  })

  it('divider 计节点不计图、不回退', () => {
    const card: CardDSL = {
      version: 1,
      root: {
        type: 'stack',
        direction: 'column',
        children: [
          { type: 'text', text: '行1' },
          { type: 'divider', color: '$separator' },
          { type: 'text', text: '行2' },
        ],
      },
    }
    const r = validateCardDSL(card)
    expect(r.ok).toBe(true)
    expect(r.nodeCount).toBe(4)
    expect(r.imageCount).toBe(0)
    expect(shouldFallbackCard(card)).toBe(false)
  })

  it('节点级标签跳转 + 通用调用不回退', () => {
    const card: CardDSL = {
      version: 1,
      root: {
        type: 'stack',
        direction: 'row',
        children: [
          { type: 'pill', text: '+订阅', target: { action: 'invoke', call: { function: 'setUserState', params: { userId: '990225' } }, effect: { kind: 'pill', id: 'user:990225', active: false } } },
          { type: 'text', text: '#miuzxc', target: { action: 'list', url: '/tag/miuzxc/' } },
          { type: 'text', text: '纯展示', target: { action: 'noop' } },
        ],
      },
    }
    const r = validateCardDSL(card)
    expect(r.ok).toBe(true)
    expect(shouldFallbackCard(card)).toBe(false)
  })

  it('overlay.opacity 非法只告警不回退（宿主钳制）', () => {
    const bad: CardDSL = {
      version: 1,
      root: {
        type: 'image',
        src: 'https://example.com/c/1.jpg',
        aspect: '16:9',
        overlays: [
          { position: 'center', icon: 'play', text: '', shape: 'circle', opacity: 2 },
        ],
      },
    }
    const r = validateCardDSL(bad)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => w.includes('opacity'))).toBe(true)
    const good: CardDSL = {
      version: 1,
      root: {
        type: 'image',
        src: 'https://example.com/c/1.jpg',
        aspect: '16:9',
        overlays: [
          { position: 'center', icon: 'play', text: '', shape: 'circle', opacity: 0.5 },
        ],
      },
    }
    expect(validateCardDSL(good).warnings).toEqual([])
  })

  it('overlay.size 非法只告警不回退（宿主回缺省）', () => {
    const bad: CardDSL = {
      version: 1,
      root: {
        type: 'image',
        src: 'https://example.com/c/1.jpg',
        aspect: '16:9',
        overlays: [
          { position: 'center', icon: 'play', text: '', shape: 'circle', size: -5 },
        ],
      },
    }
    const r = validateCardDSL(bad)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => w.includes('size'))).toBe(true)
    const good: CardDSL = {
      version: 1,
      root: {
        type: 'image',
        src: 'https://example.com/c/1.jpg',
        aspect: '16:9',
        overlays: [
          { position: 'center', icon: 'play', text: '', shape: 'circle', size: 44 },
        ],
      },
    }
    expect(validateCardDSL(good).warnings).toEqual([])
  })

  it('pill.size 非法只告警不回退（宿主回缺省 24）', () => {
    const bad: CardDSL = {
      version: 1,
      root: { type: 'pill', text: '10', shape: 'circle', size: -5 },
    }
    const r = validateCardDSL(bad)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => w.includes('pill.size'))).toBe(true)
    const good: CardDSL = {
      version: 1,
      root: { type: 'pill', text: '10', shape: 'circle' },
    }
    expect(validateCardDSL(good).warnings).toEqual([])
  })

  it('image.resizeMode 合法/缺省不告警（存量零噪音）', () => {
    // 缺省即 cover：不写 resizeMode 与显式 cover/contain 都不报
    expect(validateCardDSL(imageCard({ aspect: '16:9' })).warnings).toEqual([])
    expect(validateCardDSL(imageCard({ aspect: '16:9', resizeMode: 'cover' })).warnings).toEqual([])
    expect(validateCardDSL(imageCard({ aspect: '16:9', resizeMode: 'contain' })).warnings).toEqual([])
    expect(validateCardDSL(videoCard).warnings).toEqual([])
  })

  it('image.resizeMode 非法只告警不回退（宿主回缺省 cover）', () => {
    for (const bad of ['stretch', 42, '']) {
      const r = validateCardDSL(imageCard({ aspect: '16:9', resizeMode: bad }))
      expect(r.ok).toBe(true)
      expect(r.errors).toEqual([])
      expect(r.warnings.some((w) => w.includes('image.resizeMode') && w.includes('cover'))).toBe(true)
    }
  })

  it('image.aspect 缺省/非法只告警不回退（宿主回退 16:9）', () => {
    const missing = validateCardDSL(imageCard({}))
    expect(missing.ok).toBe(true)
    expect(missing.errors).toEqual([])
    expect(missing.warnings.some((w) => w.includes('image.aspect') && w.includes('16:9'))).toBe(true)
    for (const bad of ['0:1', 'abc']) {
      const r = validateCardDSL(imageCard({ aspect: bad }))
      expect(r.ok).toBe(true)
      expect(r.errors).toEqual([])
      expect(r.warnings.some((w) => w.includes('image.aspect') && w.includes('16:9'))).toBe(true)
    }
  })

  it('image.aspect 合法不告警（枚举 + 通用 W:H）', () => {
    for (const okAspect of ['16:9', '4:3', '3:4', '2:3', '1:1', 'circle', '1.86:1', '9:16']) {
      expect(validateCardDSL(imageCard({ aspect: okAspect })).warnings).toEqual([])
    }
  })
})

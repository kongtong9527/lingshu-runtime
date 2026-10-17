import { describe, it, expect } from 'vitest'
import { createUtilAPI } from '../runtime/util.js'

describe('createUtilAPI', () => {
  const util = createUtilAPI()

  describe('randomUUID', () => {
    it('返回 RFC 4122 v4 格式字符串', () => {
      const id = util.randomUUID()
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    })

    it('每次调用产生不同值', () => {
      const seen = new Set<string>()
      for (let i = 0; i < 1000; i++) seen.add(util.randomUUID())
      expect(seen.size).toBe(1000)
    })
  })

  describe('randomInt', () => {
    it('结果落在闭区间 [min, max] 内', () => {
      for (let i = 0; i < 5000; i++) {
        const v = util.randomInt(-3, 7)
        expect(v).toBeGreaterThanOrEqual(-3)
        expect(v).toBeLessThanOrEqual(7)
        expect(Number.isInteger(v)).toBe(true)
      }
    })

    it('大量采样能命中两端', () => {
      let hitMin = false
      let hitMax = false
      for (let i = 0; i < 5000; i++) {
        const v = util.randomInt(0, 3)
        if (v === 0) hitMin = true
        if (v === 3) hitMax = true
      }
      expect(hitMin).toBe(true)
      expect(hitMax).toBe(true)
    })

    it('min === max 时返回该值', () => {
      expect(util.randomInt(5, 5)).toBe(5)
    })

    it('min > max 抛 RangeError', () => {
      expect(() => util.randomInt(5, 1)).toThrow(RangeError)
    })

    it('非有限数抛 TypeError', () => {
      expect(() => util.randomInt(NaN, 1)).toThrow(TypeError)
      expect(() => util.randomInt(0, Infinity)).toThrow(TypeError)
    })
  })

  describe('randomDouble', () => {
    it('结果落在半开区间 [min, max) 内', () => {
      for (let i = 0; i < 5000; i++) {
        const v = util.randomDouble(0, 1)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    })

    it('支持负数区间', () => {
      for (let i = 0; i < 1000; i++) {
        const v = util.randomDouble(-5, -2)
        expect(v).toBeGreaterThanOrEqual(-5)
        expect(v).toBeLessThan(-2)
      }
    })

    it('min > max 抛 RangeError', () => {
      expect(() => util.randomDouble(3, 1)).toThrow(RangeError)
    })
  })
})

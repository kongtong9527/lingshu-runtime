import { randomUUID as nodeRandomUUID } from 'node:crypto'

/**
 * 创建 $lib.util 运行时：提供 uuid 与随机数工具。
 *
 * 同步、无状态。供插件生成签名 nonce、缓存破除 query、伪随机 UA 等。
 * 对应 Venera 的 createUuid / randomInt / randomDouble。
 */
export function createUtilAPI() {
  return {
    /** 生成 RFC 4122 v4 UUID 字符串（每次调用产生新值） */
    randomUUID(): string {
      return nodeRandomUUID()
    },

    /**
     * 生成 [min, max] 闭区间内的随机整数（含两端）。
     * 随机选取数组元素时用 randomInt(0, arr.length - 1)。
     */
    randomInt(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError(
          `randomInt 参数必须为有限数，收到 min=${min}, max=${max}`,
        )
      }
      if (min > max) {
        throw new RangeError(`randomInt 的 min(${min}) 不能大于 max(${max})`)
      }
      return Math.floor(Math.random() * (max - min + 1)) + min
    },

    /** 生成 [min, max) 半开区间内的随机浮点数 */
    randomDouble(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError(
          `randomDouble 参数必须为有限数，收到 min=${min}, max=${max}`,
        )
      }
      if (min > max) {
        throw new RangeError(`randomDouble 的 min(${min}) 不能大于 max(${max})`)
      }
      return Math.random() * (max - min) + min
    },
  }
}

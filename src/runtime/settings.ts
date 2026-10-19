/**
 * 用户偏好的值类型：select/text 产出 string，switch 产出 boolean。
 * 仅约定 `$lib.settings.get` 的返回范围；默认值不在本层处理（由插件代码自持）。
 */
export type SettingValue = string | boolean

/**
 * 创建一个**只读、按 run 注入、不持久**的用户偏好读取视图。
 *
 * 与 `$lib.storage` 严格分家：
 * - settings = 宿主管的用户偏好，每次 run 由宿主把当前值注入沙箱，插件只能 `get`，无 `set`；
 * - storage   = 插件自管的文件持久 KV，有 `set/remove/clear`。
 *
 * 未注入的 key（或宿主未提供 values）`get` 返回 `undefined`，插件据此套自己的默认值。
 */
export function createSettingsAPI(values: Record<string, SettingValue> = {}) {
  return {
    get(key: string): SettingValue | undefined {
      return values[key]
    },
  }
}

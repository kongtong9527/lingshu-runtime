import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_STORAGE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.lingshu-storage.json',
)

type StorageData = Record<string, string>

/**
 * 创建一个基于 JSON 文件的键值存储实例。
 * 不指定 filePath 时使用默认路径（runtime/.lingshu-storage.json）；
 * 测试可传入临时文件路径以隔离副作用。
 */
export function createStorageAPI(filePath: string = DEFAULT_STORAGE_FILE) {
  let cache: StorageData | null = null

  function load(): StorageData {
    if (cache) return cache
    try {
      cache = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      cache = {}
    }
    return cache!
  }

  function save(): void {
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2))
  }

  // 初始化：读一次确保 cache 就绪
  load()

  return {
    set(key: string, value: string): void {
      load()
      cache![key] = value
      save()
    },
    get(key: string): string | undefined {
      return load()[key]
    },
    remove(key: string): void {
      load()
      delete cache![key]
      save()
    },
    clear(): void {
      cache = {}
      save()
    },
  }
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createStorageAPI } from '../runtime/storage.js'

const TMP_FILE = path.join(
  os.tmpdir(),
  `.lingshu-storage-test-${process.pid}-${Date.now()}.json`,
)

describe('createStorageAPI', () => {
  let storage: ReturnType<typeof createStorageAPI>

  beforeEach(() => {
    storage = createStorageAPI(TMP_FILE)
  })

  afterEach(() => {
    try {
      fs.unlinkSync(TMP_FILE)
    } catch {
      /* 文件可能不存在 */
    }
  })

  it('set/get 读写基本值', () => {
    storage.set('name', 'lingshu')
    expect(storage.get('name')).toBe('lingshu')
  })

  it('get 未设置的 key 返回 undefined', () => {
    expect(storage.get('not-exist')).toBeUndefined()
  })

  it('remove 删除指定 key', () => {
    storage.set('a', '1')
    storage.set('b', '2')
    storage.remove('a')
    expect(storage.get('a')).toBeUndefined()
    expect(storage.get('b')).toBe('2')
  })

  it('clear 清空所有键', () => {
    storage.set('a', '1')
    storage.set('b', '2')
    storage.clear()
    expect(storage.get('a')).toBeUndefined()
    expect(storage.get('b')).toBeUndefined()
  })

  it('持久化到磁盘（新建实例能读到）', () => {
    storage.set('persist', 'yes')
    const another = createStorageAPI(TMP_FILE)
    expect(another.get('persist')).toBe('yes')
  })

  it('覆盖已存在的 key', () => {
    storage.set('k', 'v1')
    storage.set('k', 'v2')
    expect(storage.get('k')).toBe('v2')
  })
})

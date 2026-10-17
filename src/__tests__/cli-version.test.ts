import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { packageVersion } from '../pkg-version.js'

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string
}

/**
 * `lingshu --version` 的回归锁。
 *
 * 2026-10-17 实测漂移：包已经发到 `1.0.1`，而 CLI 仍报 `1.0.0`——`--version` 是用户确认
 * 「我装的到底是哪一版」的唯一入口，报错版本号比不报还糟（用户会据此判断自己有没有拿到修复）。
 * 根因是 `.version('1.0.0')` 写死；现在从 `package.json` 取，这两条锁住它别再退回去。
 */
describe('CLI 版本号', () => {
  it('packageVersion() 就是 package.json 的 version（= 运行时契约版本）', () => {
    expect(packageVersion()).toBe(pkg.version)
  })

  it('index.ts 把版本接进 commander，而不是写死字面量', () => {
    const src = fs.readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/\.version\(packageVersion\(\)\)/)
    // 写死形态：`.version('1.0.0')` / `.version("1.0.0")`
    expect(src).not.toMatch(/\.version\(\s*['"]/)
  })
})

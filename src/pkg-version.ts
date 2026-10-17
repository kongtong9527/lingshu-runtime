import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 包版本 = **运行时契约版本**（门 2 的 L4 腿锁着「`contracts/lib-api.json` ↔ 本包 ↔ iOS 常量」三处）。
 *
 * **为什么必须从这里取，不许在 `index.ts` 里写死**：写死会静默漂移。2026-10-17 实测——包已经发到
 * `1.0.1`，而 `lingshu --version` 仍报 `1.0.0`。`--version` 是用户确认「我装的到底是哪一版」的
 * **唯一入口**，报一个错的版本号比不报还糟（用户会据此判断自己有没有拿到修复）。
 *
 * 相对本文件（`src/pkg-version.ts`）与编译产物（`dist/pkg-version.js`），`../package.json` 都是
 * **包根那一份**，两种运行方式（`tsx src/index.ts` / `node dist/index.js`）都对。
 */
export function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string }
  if (!pkg.version) throw new Error('package.json 缺 version')
  return pkg.version
}

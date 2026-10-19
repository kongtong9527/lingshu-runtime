# 注入 API 参考

插件运行在沙箱中，通过全局 `$lib` 命名空间访问全部能力。下方为完整参考。

> 真实加载的第三方库见包内 `assets/js-lib/`（母仓内为 `runtime/assets/js-lib/`），由启动时加载到 `$lib`（母仓加载器：`runtime/src/lib-loader.ts`）。

## $lib.http — 网络请求

```typescript
$lib.http.get(url: string, options?: {
  headers?: Record<string, string>
  timeout?: number  // 毫秒，不传则不设置单次请求超时（沙箱整体执行超时 30s）
  rejectUnauthorized?: boolean  // 跳过 SSL 证书验证，默认 true
  responseType?: 'text' | 'base64'  // 二进制响应时传 'base64'（见下）
}): Promise<{ status: number; headers: Record<string,string>; body: string }>

$lib.http.post(url: string, data?: any, options?: {
  headers?: Record<string, string>
  contentType?: string   // 默认 'application/json'
  timeout?: number
  rejectUnauthorized?: boolean  // 跳过 SSL 证书验证，默认 true
  responseType?: 'text' | 'base64'  // 二进制响应时传 'base64'（见下）
}): Promise<{ status: number; headers: Record<string,string>; body: string }>

// DELETE（写侧取消语义：取关/取消点赞/取消收藏，body 恒空）
$lib.http.del(url: string, options?: {
  headers?: Record<string, string>
  timeout?: number
  rejectUnauthorized?: boolean
  responseType?: 'text' | 'base64'  // 二进制响应时传 'base64'（与 get/post 同）
}): Promise<{ status: number; headers: Record<string,string>; body: string }>
```

示例：
```javascript
const res = await $lib.http.get('https://api.example.com/list', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://example.com' }
})
const json = JSON.parse(res.body)
```

### 二进制请求/响应 + gzip（Flutter video_site_h 类加密接口）

请求体为二进制（`IV + AES 密文` 等任意字节）时传 `$lib.Buffer`/`Uint8Array`
（宿主按字节发出，勿转字符串——UTF-8 编码必坏）；响应为 `octet-stream` 二进制
时加 `responseType: 'base64'`（`body` 为 base64 字符串，`$lib.Buffer.from(body, 'base64')`
还原字节；该模式跳过文本挑战判定）。gzip 经 `$lib.zlib` 字符串通道
（`gzipBase64(utf8)->b64` / `gunzipBase64(b64)->utf8`，避开 vm 跨 realm 二进制问题）。
样例见 `video_site_h-vlog.plugin.js`（gzip → AES-256-CBC → IV 前置）。

```javascript
const gzBytes = $lib.Buffer.from($lib.zlib.gzipBase64(JSON.stringify(payload)), 'base64')
const res = await $lib.http.post(url, $lib.Buffer.concat([iv, ciphertext]), {
  contentType: 'application/x-www-form-urlencoded',
  headers: signHeaders,
  responseType: 'base64',
  timeout: 20000,
})
const raw = $lib.Buffer.from(res.body, 'base64')
```

注意：`$lib.crypto.randomBytes` 在沙箱内不可用（无安全 RNG），随机 IV/字节用
`$lib.util.randomInt(0, 255)` 拼 `$lib.Buffer`。

### Cloudflare 挑战（宿主统一抛错）

`get/post/del` 命中共享判定表（403/503 + `cf-mitigated` 头或正文强特征串，
见 runtime `runtime/challenge.ts`）即抛统一错（`code == 'CHALLENGE'` + `url` +
`Lingshu:` 前缀人话），不 resolve 挑战页——**插件禁止自写挑战判定**
（`isBlockedResponse`/`challengeError` 为历史包袱）。半信任 403 + 真内容
（无强信号）照常 resolve，插件按"解析出条目即成功"兜底：

```javascript
// 主形态（默认）：纯直连，CHALLENGE 直接抛由宿主验证入口接管（旧
// 「直连优先 + 单次浏览器重抓」形态已退役）。到万不得已禁止用 `$lib.browser.getHtml`
// ——例外仅当同时满足：
// ① clearance 绑 TLS 指纹（同机同 UA 全套头 curl 复核仍 403，复用无解）；
// ② 验证后回填 + UA 对齐仍救不了（即宿主补丁无效，真机实测为准）。
// anime_site_a 为现存唯一的待定项（真机待验，不行回退）；video_site_f（UA 绑定）与 video_site_i
// （无绑定实证）已切纯直连。例外形态（直连优先 + 最多 1 次重抓）见 git 历史，
// 启用前必须先过真机验证。
async function request(url) {
  const opts = { headers: baseHeaders(), timeout: 20000 }
  return await $lib.http.get(url, opts)
}
```
// 通用 HTTP 失败判定（无 CF 专用逻辑）：4xx/5xx 且解析不出内容才抛错
function assertParsed(url, res, got) {
  if (res.status >= 400 && !got) throw new Error(`GET ${url} 失败: HTTP ${res.status}`)
}

路由级指引（如筛选路由被拦需告诉用户改走搜索）只以前缀改写 `e.message`，
保留原错的 `code`/`url`（验证链路不断），见 movie_site_c `fetchFilteredList`。

### SSL 证书问题

部分网站使用了 Node.js CA 信任库无法验证的 SSL 证书，请求时会抛出 `UNABLE_TO_VERIFY_LEAF_CERTIFICATE` 错误。此时需要在请求选项中设置 `rejectUnauthorized: false` 跳过证书验证：

```javascript
function request(url) {
  return $lib.http.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
    rejectUnauthorized: false  // 跳过 SSL 证书验证
  })
}
```

### $lib.http Cookie 管理（认证读侧）

`$lib.http` 内置内存 cookie jar，支持「带上预置 cookie 读取」登录墙内容（年龄门、地区限、登录可见章节）。jar 随 sandbox 存在，不做磁盘持久化；如需持久化请配合 `$lib.storage`。

```typescript
// 预置 cookie（domain 缺省时取 url 的 hostname）
$lib.http.setCookies(url: string, cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): void

// 取出匹配域的 cookie（含子域）
$lib.http.getCookies(url: string): Array<{ name: string; value: string; domain?: string; path?: string }>

// 清除匹配域的 cookie
$lib.http.deleteCookies(url: string): void
```

行为约定：
- **自动附加**：每次 `get`/`post`/`del` 会把 jar 中匹配请求域的 cookie 拼成 `Cookie` 头发出；调用方在 `options.headers` 里显式给的 `Cookie` 头**优先**，不被 jar 覆盖。
- **自动存储**：响应的 `Set-Cookie` 会被解析并存入 jar，后续同域请求自动带上。
- **域匹配**：cookie 按域匹配（精确或子域）。为 `example.com` 设的 cookie 也会发给 `sub.example.com`。
- **不做登录 UI**：密码/webview 登录流程属写侧（留后）；本能力只负责「带上已有 cookie 去读」。

```javascript
// 预置登录态后读取需要登录的内容
$lib.http.setCookies('https://example.com', [
  { name: 'session', value: 'user-session-token' },
])
const res = await $lib.http.get('https://example.com/favorites')  // 自动带 session cookie
```

## $lib.storage — KV 存储

```typescript
$lib.storage.set(key: string, value: string): void
$lib.storage.get(key: string): string | undefined
$lib.storage.remove(key: string): void
$lib.storage.clear(): void
```

用途：缓存、分页游标、配置。值必须是字符串（对象请 `JSON.stringify`）。

## $lib.util — uuid 与随机数

```typescript
$lib.util.randomUUID(): string  // RFC 4122 v4 UUID
$lib.util.randomInt(min: number, max: number): number    // [min, max] 闭区间整数（含两端）
$lib.util.randomDouble(min: number, max: number): number // [min, max) 半开区间浮点
```

同步、无状态。用于签名 nonce、缓存破除 query、伪随机 UA 等。

```javascript
const nonce = $lib.util.randomUUID()
const cacheBust = `${url}?_t=${$lib.util.randomInt(1000, 9999)}`
const serverIndex = $lib.util.randomInt(0, servers.length - 1) // 随机选一个线路
```

> `randomInt` 是**闭区间**（含 max）。随机选取数组元素传 `randomInt(0, arr.length - 1)`。

## $lib.ui — 插件直问用户

插件在 run 中途、无法预先声明、直接面向用户发起的交互。Promise 式 `await`（非 callback）——与 `$lib.http` 同构：http 暂停等网络，ui 暂停等人类，都经宿主拿结果、可录放。

```typescript
$lib.ui.showInputDialog(title: string, options?: {
  message?: string
  image?: string   // base64（可带 data: 前缀），如验证码图
  placeholder?: string
}): Promise<string>              // 用户输入的文本

$lib.ui.confirm(
  title: string, message: string,
  buttons?: { text: string; value?: string }[]
): Promise<string>               // 所点按钮的 value（缺省 text）；buttons 缺省为 [取消, 确定]

$lib.ui.showMessage(text: string): void   // toast，fire-and-forget
$lib.ui.launchUrl(url: string): void      // 打开外链，fire-and-forget
```

**与登录表单（字段 schema）的边界**：pre-run 就知道的输入（账号/密码）走声明式 `getAccountSchema` + `inputs`；**run 中途才发现要问的**（验证码、二次确认、进度 toast）走 `$lib.ui`。

**典型场景：验证码登录**（见 `lingshu-plugins/ccc.plugin.js`）：
```javascript
async function doLogin(account, pwd) {
  // 1. 取验证码图
  const capRes = await $lib.http.get(`${API}/recaptcha#${$lib.util.randomInt(0, 999)}`, { headers: { device, uuid: 'null' } })
  const captcha = JSON.parse(capRes.body)
  // 2. 直问用户验证码（image 为 base64，宿主自动补 data: 前缀）
  const code = await $lib.ui.showInputDialog('驗證碼', { image: captcha.result.img, message: '请输入图中验证码' })
  // 3. 提交（code 被接线进请求体）
  await $lib.http.post(`${API}/token`, { grant_type: 'password', username: account, password: pwd, key: captcha.result.key, captcha: code })
}
```

> **窄口径**：`$lib.ui` 只收「插件直问用户」类（验证码/确认/toast/开链接）。结构化选择器（如收藏夹子选择）仍是宿主编排的多 run 流，**不**塞进 `$lib.ui`。
> **headless**：CLI/无 UI 环境下 `showInputDialog`/`confirm` 清晰报错（要求交互式宿主）；`showMessage`/`launchUrl` 静默 no-op。测试经宿主 handler 返回 canned 响应（等价 HTTP fixture 回放）。

## $lib.cheerio — HTML 解析（cheerio）

```typescript
const $ = $lib.cheerio.load(html: string): CheerioAPI
$(selector)                          // 选择元素
$(el).find(selector)                 // 后代查找
$(el).attr(name)                     // 取属性
$(el).text()                         // 取文本
$(selector).each((i, el) => { ... }) // 遍历，el 需 $(el) 包装
$(selector).first() / .last()
```

示例：
```javascript
const $ = $lib.cheerio.load(res.body)
const items = []
$('article.item').each((i, el) => {
  const $el = $(el)
  items.push({
    id: $el.attr('data-id'),
    title: $el.find('h2 a').text().trim(),
    url: $el.find('h2 a').attr('href')
  })
})
```

## $lib.dayjs — 时间（dayjs）

```typescript
$lib.dayjs(timestamp?: number | string | Date): dayjs.Dayjs
// 链式：
$lib.dayjs(ts).format('YYYY-MM-DD HH:mm:ss')
$lib.dayjs(str).valueOf()   // → 毫秒时间戳
$lib.dayjs().unix()         // → 秒时间戳
```

注意：核心 dayjs 不含 customParseFormat 插件，只能按内置正则解析（`YYYY[-/]?MM[-/]?DD...`，分隔符可选，因此 `"20260724"` 与 `"2026-07-24"` 均可）。但顺序非 YMD 或含中文等非标准格式（如 `"24-07-2026"`、`"2026年7月24日"`）无法解析，需自行预处理（如用 `Date.parse` 或字符串替换后再传入）。

## $lib.CryptoJS — 加解密（CryptoJS）

```typescript
$lib.CryptoJS.MD5(str).toString()
$lib.CryptoJS.SHA1(str).toString()
$lib.CryptoJS.SHA256(str).toString()
$lib.CryptoJS.enc.Base64.stringify($lib.CryptoJS.enc.Utf8.parse(str))
$lib.CryptoJS.AES.encrypt(str, key).toString()
// HMAC、PBKDF2 等同 CryptoJS 标准 API
```

## 其它库

| 成员 | 说明 |
|---|---|
| `$lib.Buffer` | Node.js Buffer 兼容（处理二进制） |
| `$lib.crypto` | Node.js crypto 兼容层（browserify）：`createHash`（md5/sha1/sha256…）、`createHmac`、`createDecipheriv`/`createCipheriv`（AES-128/192/256-ECB/CBC/CFB/OFB 等对称加解密）。**解密 NoPadding 密文**（如manga_site_b ECB 响应）时尾部含 PKCS7 填充字节，结果应用 `$lib.Buffer.toString('utf8')` 取字符串，而非 CryptoJS 的 `enc.Utf8.stringify`——后者遇非法字节会抛 `Malformed UTF-8 data`。示例：`const d = $lib.crypto.createDecipheriv('aes-256-ecb', keyBuf, $lib.Buffer.alloc(0)); d.setAutoPadding(false); const plain = $lib.Buffer.concat([d.update(cipherBuf), d.final()]).toString('utf8')`。**`randomBytes` 不可用**（沙箱无安全 RNG，抛错），随机字节用 `$lib.util.randomInt(0, 255)` 拼。 |
| `$lib.zlib` | gzip 字符串通道：`gzipBase64(utf8)->b64` / `gunzipBase64(b64)->utf8`（宿主 Node zlib 实现，专供加密接口的压缩层，见上文二进制节） |
| `$lib.iconvLite` | iconv-lite，字符编码转换（GBK 等） |
| `$lib.JSEncrypt` | RSA 加密 |
| `$lib.jsrsasign` | KJUR 命名空间：`$lib.jsrsasign.crypto.Util.md5()`、`$lib.jsrsasign.jws.JWS` 等 |

## console — 日志

```typescript
console.log(...args: any[]): void
console.warn(...args: any[]): void
console.error(...args: any[]): void
```

沙箱已注入 console，直接使用即可。

## 沙箱限制（不可用）

以下在插件中**不可用**，尝试使用会报错或得到 undefined：

- `require` / `import` — 不能加载模块
- `fetch` / `XMLHttpRequest` — 统一用 `$lib.http`
- `fs` / `process` — 不能访问宿主文件系统/进程
- `setTimeout` / `setInterval` / `setImmediate`
- 原生 `Buffer`（用 `$lib.Buffer`）
- `localStorage`、`performance` 等 Web API

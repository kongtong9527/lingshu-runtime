# 图片加密参考

## 适用场景

如果目标站点的图片响应不是可直接展示的图片，而是二进制密文或需要前端脚本解密，必须先通过真实网络请求和页面源码确认加密行为，再实现插件。

## 分析要求

至少确认以下信息，并记录到 `_fixtures/<plugin-id>/analysis.md`：

- 图片原始 URL 字段，例如 `data-original`、`data-xkrkllgl` 或 `z-image-loader-url`
- 加密算法、填充方式、密文编码、Key、IV，以及 Key/IV 的字符编码（UTF-8、Hex 等）
- 列表/搜索封面和详情正文图片是否使用同一套参数
- 图片响应的真实 `Content-Type` 和二进制格式，不能只根据文件扩展名判断

如果页面执行脚本后把原始 URL 替换成 `data:image/...`，fixture 应保存 SSR 页面中的原始图片字段，不要把运行后的 Data URL 当作插件源数据。

## 插件数据契约

统一在 `metadata.imageEncryption` 中记录解密参数，示例：

```javascript
const IMAGE_ENCRYPTION = {
  algorithm: 'AES-128-CBC',
  padding: 'Pkcs7',
  encoding: 'Base64 ciphertext',
  key: 'f5d965df75336270',
  iv: '97b60394abc2fbe1'
}
```

使用规则：

- `ArticleDetail.metadata.imageEncryption` 用于详情封面、正文 `image` 块、`gallery` 图片和视频 `poster`
- `ListItem.metadata.imageEncryption` 用于列表和搜索结果的 `coverUrl`
- 插件返回的图片 URL 必须保持为原始密文资源 URL；不要在插件中伪造明文 URL，也不要把密钥拼入图片 URL
- 列表/搜索封面和详情图片使用同一套参数时，应在两个返回模型中都携带元数据，不能只放在详情结果中

## 插件与宿主边界

当前 `$lib.http.get` 的响应体是文本，不提供通用二进制响应接口。对于二进制图片：

1. 插件负责提取原始 URL 和解密参数，返回 `metadata.imageEncryption`
2. DevConsole/BFF 或其他具备二进制 HTTP 能力的宿主负责下载密文
3. 宿主按元数据解密，并返回正确的图片 MIME 类型和二进制内容

如果目标运行时没有二进制资源代理或解密能力，必须在分析记录中明确限制，不得声称图片已经解密。

## 参数兼容性

不能仅凭算法名称猜测参数含义，必须按页面脚本的实际实现还原。若站点使用 CryptoJS `WordArray`，要注意它和 Node/Web Crypto 对 Key/IV 长度校验的差异。

short_site_a 当前页面脚本使用 16 字符 IV `97b60394abc2fbe1`。历史 fixture 曾记录过 15 字符旧值，但不能继续沿用旧值；应以当前页面脚本中的参数为准。若其他站点确实使用不足 16 字节的 IV，CryptoJS 会将不足一个完整 IV 的 `WordArray` 按零字节补齐到 CBC 所需的 16 字节，宿主解密实现必须兼容这一行为；不能直接用严格要求 16 字节 IV 的实现而不做适配。

### `iv` 字段必填（含 ECB 模式）

即使站点使用不需要 IV 的算法（如 `AES-128-ECB`），`IMAGE_ENCRYPTION` 对象中**也必须包含 `iv` 字段**。宿主的 `getImageEncryption()` 会校验 `iv` 是否为字符串，缺失则返回 `undefined`，导致 `proxyUrl()` 不追加 `&decrypt=` 参数，图片解密不生效。

```javascript
// 正确：ECB 模式也需填写 iv
const IMAGE_ENCRYPTION = {
  algorithm: 'AES-128-ECB',
  padding: 'NoPadding',
  encoding: 'Base64 ciphertext',
  key: 'Jui7X#cdleN^3eZb',
  iv: ''  // ECB 无需 IV，但字段不可缺失
}
```

### 算法与宿主支持范围

宿主 `decryptImage` 当前支持的算法有限，新增算法需同步更新。记录在案的有：

| 算法 | 支持状态 | 要点 |
|------|---------|------|
| `AES-128-CBC` / `AES-192-CBC` / `AES-256-CBC` | ✅ 已支持 | PKCS7 填充；key 长度需匹配位数（16/24/32 字节）；IV 不足 16 字节时以零字节补齐 |
| `AES-128-ECB` / `AES-192-ECB` / `AES-256-ECB` | ✅ 已支持 | 无 IV；NoPadding 时手动剥离 PKCS7 填充；`iv` 传空字符串（字段不可缺失） |
| `AES-128-CFB` / `AES-192-CFB` / `AES-256-CFB` | ✅ 已支持 | 流模式，无填充；IV 不足 16 字节时以零字节补齐 |
| `AES-128-OFB` / `AES-192-OFB` / `AES-256-OFB` | ✅ 已支持 | 流模式，无填充；IV 不足 16 字节时以零字节补齐 |

> RSA / HMAC / MD5 / SHA 不属于宿主图片解密范畴：签名类运算由插件内 `$lib.CryptoJS` / `$lib.crypto` / `$lib.JSEncrypt` 完成；RSA 不适用于整图解密（仅能解小载荷）。

若插件使用的算法宿主尚不支持，按 AGENTS.md「工具自迭代优化」原则同步更新宿主解密逻辑。

## 验证清单

- 列表/搜索 fixture 的封面结果带有 `metadata.imageEncryption`
- 详情 fixture 的封面、正文图片和 gallery（如有）使用同一套配置
- 图片数量没有混入广告、下载按钮或播放器推广资源
- 在支持资源代理的 DevConsole 中，解密响应的 MIME 类型正确，文件头能识别为 JPEG/PNG/GIF/WebP 等真实格式
- 真实网络验证至少覆盖一张列表封面和一张详情正文图片；只检查 URL 存在不足以证明解密成功

## 参数粒度（低优先级预留口子，ADR-0025）

`metadata.imageEncryption` 的常规形态是「一个返回对象携带一套全局参数」（key/iv/算法，
列表封面、详情正文、gallery 共用）。当前**只承诺单套**——绝大多数站点（含 short_site_a、
video_site_a，AES-128-CBC 同 key/iv）足够。

预留口子：假设未来站点出现「**每图/每页参数不同**」（如按图携带 key、非 AES 变换、解密参数
打在图片自身 query 上）时，允许把解密参数**降级覆盖**——外层 `metadata.imageEncryption`
仍是默认值，逐 `ListItem` / block / 图可带自己的解密上下文。该口子当前**未进类型、未进宿主
实现**（YAGNI，等真实站点触发再铺开）；新增插件时如遇此情形，先按本文档要求记录分析，再
评估是否把口子落地为契约。

# 二进制 HTTP 与 gzip 压缩（$lib.http / $lib.zlib）

> 宿主侧实现文档（runtime + DevConsole Node 侧共享）。插件用法见 skill
> `references/api-reference.md` 的 `$lib.http` / `$lib.zlib` 节。

## 背景

存量 `$lib.http` 是纯文本通道（请求体 string/JSON、响应 `res.text()`）。
Flutter video_site_h 类站点（video_site_h Vlog，2026-10）需要：

- 请求体为二进制（`IV + AES 密文`，任意字节，UTF-8 透传必坏）；
- 响应为 `application/octet-stream` 二进制（`text()` 解码必坏）；
- 沙箱内 gzip 压缩（请求 JSON 先 gzip 再加密；沙箱无 require/zlib）。

## 契约

### 请求二进制

`post(url, data, options)`：`data` 为 `Uint8Array`/`$lib.Buffer` 时（`ArrayBuffer.isView`
跨 vm realm 有效）经 `Buffer.from` 拷贝字节后原样发出；`HttpRecord.requestBody`
记为 `<binary N bytes>`。string/对象分支保持原行为。

### 响应二进制

`options.responseType: 'text' | 'base64'`（缺省 `'text'`，零改动存量插件）：

- `'base64'` 时响应走 `arrayBuffer() → base64` 字符串（`body` 仍为 string 类型，
  插件侧 `$lib.Buffer.from(body, 'base64')` 还原字节）；
- base64 模式跳过文本挑战判定（二进制恒不命中特征表）；
- `get` 同样支持（`HttpOptions` 共用，透传进 `execute`）。

### `$lib.zlib`（字符串通道）

```typescript
$lib.zlib.gzipBase64(utf8String: string): string    // utf8 → gzip → base64
$lib.zlib.gunzipBase64(base64: string): string      // base64 → gunzip → utf8
```

刻意只走 string：vm 跨 realm 的 `instanceof` 判定不可靠，string 通道无此问题；
插件侧字节操作全留在沙箱 realm（`$lib.Buffer` + `$lib.crypto`），与宿主只换 string。

## 验证

`runtime/src/runtime/{http,zlib}.ts`，合成插件自测（二进制 POST 经 httpbin
原字节回显 + base64 响应长度 + zlib 回环）通过。iOS 侧同等能力已实现
（`ios/Lingshu/Runtime/{HttpBridge,ZlibBridge}.swift`，libz 直调 + 单测 node
向量互通，详见 `ios/docs/http-bridge.md`）——video_site_h-vlog 类插件在 iOS 端可用。

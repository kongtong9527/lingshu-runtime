import { gzipSync, gunzipSync } from 'node:zlib'

/**
 * 创建 $lib.zlib 运行时：gzip 压缩/解压的字符串通道。
 *
 * 背景：部分站点（如 Flutter + video_site_h 的video_site_h Vlog）的请求体是 gzip 压缩后再
 * AES 加密，插件在沙箱内需要 gzip 能力。沙箱无 require/zlib，$lib.crypto
 * 只有密码学原语，因此由宿主（Node）提供压缩实现。
 *
 * 设计为纯字符串通道以避开 vm 跨 realm 二进制原型问题：
 * - 插件侧所有字节操作仍在沙箱 realm 内（$lib.Buffer + $lib.crypto），
 *   与宿主之间只传 string（utf8 文本 / base64），不存在跨 realm 的
 *   instanceof 判定。
 * - gzipBase64：utf8 字符串 → gzip → base64 字符串。
 * - gunzipBase64：base64 字符串 → gunzip → utf8 字符串。
 */
export function createZlibAPI() {
  return {
    /** utf8 字符串 → gzip → base64 字符串 */
    gzipBase64(input: string): string {
      const buf = Buffer.from(input, 'utf8')
      return gzipSync(buf).toString('base64')
    },

    /** base64 字符串（gzip 密文）→ gunzip → utf8 字符串 */
    gunzipBase64(base64: string): string {
      const buf = Buffer.from(base64, 'base64')
      return gunzipSync(buf).toString('utf8')
    },
  }
}

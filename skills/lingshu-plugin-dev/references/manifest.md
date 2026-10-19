# 分发清单 `manifest.json`（仓库索引格式）

插件文件本身在哪都能跑（`lingshu run --dir .`）；要让**宿主来拉取**（App 内“添加仓库”一次装多个），才需要 `manifest.json`。它是仓库根目录下的**索引文件**，宿主读它的 raw URL 发现插件——自建分发仓时按本节写，投稿官方示例仓时看该仓 `CONTRIBUTING.md`（内容政策以 `CONTENT-POLICY.md` 为准，官方仓只收 `nsfw:0`）。

## 文件形态

单个对象 + `plugins` 数组，每条目描述一个插件。最小完整示例（单插件仓库，`file` 与插件文件同处仓根）：

```json
{
  "plugins": [
    {
      "id": "my-site",
      "name": "示例站点",
      "version": "1.0.0",
      "author": "your-name",
      "description": "一句话描述插件做什么",
      "file": "my-site.plugin.js",
      "sourceUrl": "https://example.com",
      "categories": ["video"],
      "lang": "zh",
      "nsfw": 0,
      "capabilities": ["list", "detail"],
      "minRuntimeVersion": "1.0.0"
    }
  ]
}
```

## 字段表

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定插件标识。必须等于插件头 `// id:`，且文件名必须为 `<id>.plugin.js` |
| `name` | 是 | 宿主 UI 显示名 |
| `version` | 是 | 类 semver 版本串。宿主靠它判断“有更新可装” |
| `author` | 是 | 作者或维护者名 |
| `description` | 是 | 一句话描述。**必须与插件头 `// description:` 逐字一致**（见下「三处一致」） |
| `file` | 是 | 插件路径，**相对仓库根**。必须存在——公开仓 CI 会逐条校验 |
| `sourceUrl` | 是 | 插件读取的站点（公开 URL） |
| `categories` | 否 | 宿主内分组标签，自由填写 |
| `lang` | 否 | 内容语言，如 `zh` / `en` |
| `nsfw` | 是 | 内容分级。自建仓按自己语义定（`0` = 全年龄）；官方示例仓恒为 `0`，字段必须存在 |
| `capabilities` | 否 | 插件实现的能力：`list` / `detail` / `reading` / `categories` / `listings` / `explore` / `tags` / `search` / `play` / `settings` / `account`（照实际实现写，别多报） |
| `minRuntimeVersion` | 否 | 能跑本插件的最低**运行时契约版本**（不是 App 版本，也不是 npm 包版本；查 `lingshu-runtime` 包的 `contracts/lib-api.json` 的 `contractVersion`）。缺省 = 不限。宿主比较口径：宿主实现的契约版本 ≥ 声明值才允许安装 |

## 三处一致（发之前必查）

1. `id`：`manifest` 条目 == 插件头 `// id:` == 文件名 `<id>.plugin.js`，且 `module.exports` 同样导出 `id`
2. `description`：插件头与 `manifest` 对应条目**逐字一致**——改任一侧必当次同步另一侧；先判哪边是事实真相：行为变了以插件头为准改 manifest，只是措辞优化以 manifest 为准改插件头
3. `name` / `version`：插件头、`module.exports`、`manifest` 三处同值（`version` 涨了宿主才会提示更新）

`lingshu test <id>` 只校验插件头与方法签名，**不校验 manifest**——上面三条靠发之前手工对照。

## 宿主消费（一句话）

App 内：插件页 → 右上角「仓库」→「添加仓库」，粘贴你的 `manifest.json` 的 raw 地址（如 `https://raw.githubusercontent.com/<你>/<仓>/main/manifest.json`）。`file` 是相对仓根的，fork 或镜像换个地址即用，不用改文件。

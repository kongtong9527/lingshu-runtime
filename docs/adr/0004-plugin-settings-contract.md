# 插件设置契约(Plugin Settings)

## Status

accepted

## Context

Lingshu 插件此前没有"设置"面——插件是读侧数据适配器(ADR-0002),配置要么硬编码、要么塞进 `$lib.storage`。但部分源的配置是**运维刚需且用户可调**:典型如manga_site_b的 API 线路(域名频繁被墙,需手动切换)、图片分流、启动刷新。这些不能硬编码,也不该靠插件自管的 storage 暴露给用户(storage 是文件持久 KV,但没有宿主渲染的表单 UI)。

两个现状加剧了设计约束:
- `$lib.storage` 虽**文件持久**(`simulator/.lingshu-storage.json`,跨 run 保持),但它是**插件自管**的缓存命名空间,不是宿主渲染的用户偏好面。
- 插件方法签名不统一:只有 `fetchList(context)` / `search(query, context)` 收 PluginContext;`fetchDetail` / `fetchReadingPage` / `getCategories` / `getExplore` 都没收。若把设置线程式地塞进每个方法签名,要动 5 个签名且不一致。

## Decision

1. **插件可选导出 `getSettingsSchema()` → `SettingField[]`**,声明字段:
   - 值类型:`select`(带 options)/ `switch` / `text`,各带 key/label/default。
   - action 类型:按钮,带 key/label/buttonText,点击触发插件处理函数。

2. **新增沙箱能力 `$lib.settings.get(key)` → 用户值或 undefined**(插件自行套默认值)。由宿主**按 run 注入**(RunOptions.settings → CLI `--settings '<json>'`;DevConsole 表单)。与 `$lib.storage` 严格分家:settings = 宿主管的注入式用户偏好;storage = 插件自管的文件持久缓存。

3. **action 设置走 run 管线**:`executeRun` 新增动作 `'setting-action'`(target = 字段 key),插件可选导出 `runSettingAction(key) → { message?: string }`。复用现有 onRequest / httpLog / 错误处理。DevConsole 按钮 → `apiRun({ action:'setting-action', target:key })`;CLI:`run <id> setting-action <key>`。处理函数内可自由用 `$lib.storage`(持久)与 `$lib.settings`,如"刷新域名"把新线路写进 storage,下次 `fetchList` 直接读。

## Considered Options

- **插件内自治域名,不做设置 UI**:被用户否决——想要显式设置面与手动控制权。
- **把设置线程式塞进每个插件方法签名**:否决。5 个签名变动、前后不一致;`$lib.settings` 作为注入式沙箱能力对所有方法统一可见。
- **用 `$lib.storage` 存用户设置**:否决。把"宿主渲染的用户偏好"与"插件自管缓存"混进同一 KV,会导致用户改的值与插件缓存的值互相覆盖,职责不清。
- **设置只做值类型(无 action 按钮)**:被用户否决——需要 action(如刷新域名按钮)。

## Consequences

- 新增 SDK 面,触及:simulator(`types.ts` 加 SettingField/`$lib.settings`、`run.ts` 加 `'setting-action'` 动作与 settings 注入、`sandbox.ts` 注入 `$lib.settings`)、devconsole server(`plugin-service.ts` 能力探测 + RunRequest 透传 settings + PluginInfo 携带 schema)、devconsole 前端(设置表单渲染 + localStorage 持久化 + apiRun 透传)。
- 设置仅值类型 + action;不向写侧滑动(签到、收藏等仍按 ADR-0002 留后)。JM 的"手动签到"属写侧,不在本契约范围。
- JM 的"刷新域名"按钮把结果写 `$lib.storage`;`apiDomain` 下拉选项保持静态(线路 1–4 索引),插件用 storage 缓存的真实线路表把索引解析为实际域名——故 select 无需动态 options。
- `$lib.settings.get` 只返回用户值或 undefined,默认值由插件代码持有(与 schema 共用同一份常量),保持沙箱" dumb"。

# 卡片 DSL（Card DSL v1，插件侧契约）

`ListItem.card?: CardDSL`——列表项的自定义卡片描述。每项自带现算 JSON（文字已填好），宿主原生渲染。有即渲染、无即回退老卡。根非法（含**未知 root 类型**）才整卡回退，未知**子**节点就地跳过，单图坏就地占位。详见 ADR-0050。

> **字段级规范以 `contracts/card-dsl.schema.json` 为准**（JSON Schema 2020-12；母仓与公开 `lingshu-runtime` 仓同名路径，npm 包用户改用包内运行时校验 `validateCardDSL` / `CARD_LIMITS`，见 `lingshu-runtime/card-dsl` 子路径出口）；本文件是用法与取舍说明。
> 字段集由 `npm run contract:check` 的字段集合门三端互锁（schema ↔ `runtime/src/types.ts` ↔ iOS `CardModels.swift`），**新增字段必须同时改三处并补 `contracts/conformance/` 语料**，否则 CI 红（母仓维护用，第三方走公开仓 issue 提需求）。

思路借 Egern Widget DSL，实现脱钩：根叫 `card`，元素集在其六件套上扩展。Egern 原文见 `https://egernapp.com/zh-CN/docs/configuration/widgets/`。

## 根

```javascript
{
  version: 1,                 // 必填，当前只认 1
  root: { type: 'stack', ... }, // 必填，卡片根节点（通常为 stack column）
  accessibilityLabel: '...'   // 可选，无障碍覆盖；缺省宿主自动拼标题+作者+时长
}
```

## 通用属性

`target` 所有节点可选（缺省冒泡到整卡）。`flex?: number` 只在 `stack/text/image/avatar/grid/pill/actionBar/date` 上有效（父容器剩余空间按值配比；`spacer` 天然弹性故不声明；`divider`/`spacer` 无此字段）。

```typescript
type PillStyle = { backgroundColor?: CardColor; textColor?: CardColor; borderColor?: CardColor } // 单态完整规格：出现即完整，缺键 = 无该属性
// 通用调用（卡片写侧唯一通道）：插件声明方法名 + 参数，宿主通用直调，不逐一映射方法
type InvokeCall = { function: string; params?: Record<string, unknown>; stateKey?: string } // 期望态键缺省 active：调用前宿主置 params[stateKey] = !当前态
type DualState = { onText?: string; offText?: string; onStyle?: PillStyle; offStyle?: PillStyle } // 开/关双态呈现：文案样式全自带
type InvokeEffect =
  | ({ kind: 'pill'; id: string; active?: boolean; resultKey?: string } & DualState) // 双态 pill 翻转（终态读 result[resultKey ?? active]，缺省取反）
  | { kind: 'count'; id: string; active?: boolean; resultKey?: string }              // 点亮翻转 + 计数 ±1（actionBar 项用）
  | { kind: 'none'; id: string }                                                    // 只调服务端，不改本地
type CardTarget =
  | { action: 'noop' }        // 纯展示，拦截冒泡、不可点
  | PageJumpTarget            // 覆盖跳转（标签等导航事件走 {action:'list',url}；作者头像/名字走 {action:'list',url:authorUrl} 进作者列表）
  | { action: 'invoke'; call: InvokeCall; effect?: InvokeEffect } // 写侧：id 为不透明状态键（getMe.states 同源，缺席 = 关态）
```

缺省（无 `target`）= 冒泡继承整卡点击（`item.target ?? 进详情`）；有显式 `target`（含 `noop`）= 拦截，不冒泡。

## 颜色

```typescript
type CardColor = string | { light: string; dark: string }
```

字符串为 `6/8 位 Hex`（`#RRGGBB[#AA]`）、`rgba()`，或语义名（`$textPrimary/$textSecondary/$textTertiary/$accent/$surface/$separator`，宿主映射深浅）。推荐语义名 + `{light,dark}` 双写固定品牌色（如分类角标金、时间 pill 粉）。

## 格式化值（数字宿主格式化）

插件给原始值，宿主统一格式化，保证 iOS/DevConsole 一致：

```typescript
type CardFormattedValue =
  | { value: number; format: 'duration' }  // 秒 → 12:50
  | { value: number; format: 'count' }     // 次数 → 1.2万/4.3w（中文环境万进制）
  | { value: number; format: 'relative' }  // 毫秒时间戳 → 2小时前
  | { value: number; format: 'date' }      // 毫秒时间戳 → 2026-09-18
  | { value: number; format: 'datetime' }  // 毫秒时间戳 → 2026-09-18 16:26
```

`text/pill/overlay/actionBar` 的文本位均接受 `string | CardFormattedValue`。

## 节点

### stack（弹性容器）

```javascript
{ type: 'stack', direction: 'row'|'column', alignItems: 'start'|'center'|'end',
  gap: 8, padding: 12, backgroundColor: '$surface', borderRadius: 12,
  children: [ ... ] }
```

`direction` 缺省 `row`；`alignItems` 缺省 `center`（两端宿主一致——列容器要左对齐必须显式写 `start`，否则整卡居中）；`padding` 支持单数/双元 `[v,h]`/四元 `[t,r,b,l]`。**v1 无渐变**：`backgroundGradient` 三端都未实现，已从契约删除（写了会被宿主字段集校验判非法），渐变色请用 `backgroundColor` 近似或自绘。`alignItems` 只管**交叉轴**（row 管垂直、column 管水平）；**主轴**对齐用 `justifyContent: 'start'/'center'/'end'`（flexbox 语义，有值即撑满整行再排布，缺省收缩到内容宽——父级 center 时收缩行会被居中）。横向行想左右对齐别用 `alignItems`：要么写父级纵向 stack 的 `alignItems: 'start'`（整卡左对齐），要么本行加 `justifyContent`（仅本行对齐、标题不动时用它）。卡片根建议自带 `backgroundColor: '$surface'` + `padding: 12` + `borderRadius: 12`（宿主 cell 本身无底）。

### text（文本）

```javascript
{ type: 'text', text: '标题', font: { size: 'headline', weight: 'bold' },
  textColor: '$textPrimary', textAlign: 'left', maxLines: 2, minScale: 0.8 }
```

`font.size` 支持语义名（`largeTitle/title/title2/title3/headline/body/callout/subheadline/footnote/caption1/caption2`）或数字；`weight` 同 Egern；默认标题 2 行、描述 3 行，超长截断不撑高。

### image（图片，比例宿主算高）

```javascript
{ type: 'image', src: 'https://...', aspect: '16:9', resizeMode: 'cover',
  borderRadius: 12, overlays: [
    { position: 'topLeft', text: '分类' },
    { position: 'bottomLeft', icon: 'eye', text: { value: 12000, format: 'count' } },
    { position: 'bottomRight', icon: 'clock', text: { value: 750, format: 'duration' } }
  ] }
```

`aspect`：`16:9/4:3/3:4/2:3/1:1/circle`（`circle` = 圆形裁切，人物卡用），另支持通用 `W:H`（整数或小数，如 `1.86:1`，两端直接解析比值）；不写绝对宽高，宿主按宽度反推。**缺省/非法（含 `0:1`/`abc`）一律回退 `16:9`**（三端同口径）——`aspect` 直接决定「盒子多高」，写错就会看到裁切，别依赖回退。

**`resizeMode`（填充方式，缺省 `cover`）**：声明「声明比与真图比不符时怎么放」，与 `aspect`（盒比）正交：

| 值 | 行为 | 用在哪 |
| --- | --- | --- |
| `cover`（缺省） | 填满盒子、溢出裁掉（居中裁） | 海报墙/宫格等**要统一比**的卡 |
| `contain` | 整图可见、盒内留白（letterbox） | **绝不裁**的卡（长图/横竖混排且不想裁） |
| 其它/非法 | 回 `cover`（不报错、不炸卡；runtime 报 warning，DevConsole 与 iOS 同判） | — |

两条写侧纪律：① **要「整图完整且无留白」就自己把 `aspect` 算准**（用站点给的宽高现算，如 `aspectForCover` 输出 `${w}:${h}`）——宿主**不会**替你去学真实图片比（卡片列表是自适应高，学比例会让行高跳）；② `resizeMode: 'contain'` 的盒高仍由 `aspect` 定，所以横竖混排想零留白只能走 ①。三端（iOS `CardCoverImageView` / DevConsole 预览 / runtime 校验）必须同构，签名与回退口径见根仓库 `docs/adr/0058-card-image-fill-contract.md`。

`src` 支持 `https` 与 `data:`（Base64/SVG，≤512KB，超限占位）。`transport/decrypt` 可选自带，缺省继承整卡（现有封面 `metadata` 管线）。`overlay.position`：`topLeft/topRight/bottomLeft/bottomRight/center`；`overlay.shape` 缺省 `rounded`（小胶囊），`circle` = 圆形钮（图标徽用，如视频中央播放钮；底色/字色全由插件声明，宿主只做形状；iOS 定径 34pt、图标 14pt）：

```javascript
{ position: 'center', icon: 'play', text: '', shape: 'circle', opacity: 0.5,
  backgroundColor: { light: '#FFFFFF', dark: '#FFFFFF' }, textColor: '#1A1A1A' }
```

`overlay.opacity`（徽标底透明度数值，0~1，缺省 1）：插件侧直接调透明度的唯一数值旋钮（底色写纯色、透明全走它，别再往 hex 里藏 alpha 两处叠乘）。最终底 alpha = 颜色自带 alpha × opacity，只淡底不淡图标/文字；越界/NaN 各宿主钳制 0~1（runtime 报 warning，不炸卡）。

`overlay.size`（圆形钮直径数值，仅 `shape:circle` 有效，缺省 34）：调背景圆圈大小只改这个数（iOS 为 pt、图标按 14/34 同比缩放；预览为 px 同比）。非法值（NaN/≤0）宿主回缺省 34（runtime 报 warning，不炸卡）。

### avatar（圆形头像）

`{ type: 'avatar', src: 'https://...', size: 40 }`——`size` 为直径 pt（小尺寸固定值允许）。等价 `image + aspect:circle` 的快捷写法，动态卡头部用。

### grid（多图宫格）

```javascript
{ type: 'grid', columns: 2, gap: 8, children: [
  { type: 'image', src: '...', aspect: '1:1' }, ...
], overflowMore: { count: 9, label: '查看全部' } }
```

`columns` 2–3；`children` 为 `image`（超 4 张建议只给前 4 + `overflowMore`，宿主在最后一格压罩展示）。

### pill（胶囊）

```javascript
{ type: 'pill', text: { value: 60624, format: 'count' }, icon: 'play',
  backgroundColor: { light: '#FFF0F0', dark: '#2A1A1A' }, textColor: '#C00' }
// 圆角矩形 + 边框（站内 tags 形态）：borderRadius 缺省 = 胶囊全圆，borderColor 缺省 = 无边框
{ type: 'pill', text: '5.2万 次浏览', borderRadius: 8,
  backgroundColor: { light: '#F5F5F5', dark: '#262626' },
  textColor: { light: '#262626', dark: '#FFFFFF' },
  borderColor: { light: '#E0E0E0', dark: '#525252' } }
// 固定圆形徽（序号/名次用）：shape 缺省 = 胶囊随内容宽；circle = 固定直径圆，多位数也不拉成胶囊
{ type: 'pill', text: '10', shape: 'circle',
  backgroundColor: { light: '#00000000', dark: '#00000000' },
  textColor: '$textSecondary', borderColor: '$separator' }
// size 为直径（iOS pt / 预览 px，缺省 24，非法宿主回缺省；多位数宿主缩字适配，字号沿用 pill 配套）
// 状态按钮：有 id 才绑通用调用，无则纯展示；宿主直调 call.function（终态以服务端返回为准，成功即时翻转）。
// 双态必须自带：on/off 文案 + 样式全声明（宿主无脑切换；新站自定词也只需插件自带，无需改宿主）
{ type: 'pill', text: '+关注',
  backgroundColor: { light: '#2E7CF6', dark: '#2E7CF6' }, textColor: '#FFFFFF',
  target: { action: 'invoke',
    call: { function: 'setUserState', params: { userId: '990228' } },
    effect: { kind: 'pill', id: 'user:990228', active: false,
      onText: '已关注', offText: '+关注',
      onStyle: { backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' },
        textColor: { light: '#2E7CF6', dark: '#2E7CF6' },
        borderColor: { light: '#2E7CF6', dark: '#2E7CF6' } },
      offStyle: { backgroundColor: { light: '#2E7CF6', dark: '#2E7CF6' }, textColor: '#FFFFFF' } } } }
```

标签跳转一律用独立 text 节点（slug 小写去空格，`sort` 仅显式透传，不继承来源筛选）：

```javascript
{ type: 'text', text: '#miuzxc', font: { size: 'caption1' },
  textColor: '#5B8DEF', maxLines: 1,
  target: { action: 'list', url: '/tag/miuzxc/' } }
```

单行，超长截断。`icon`：`eye/clock/play/comment/repost/heart/star/thumbsup/check/flame/trend/none`（只用列表内的名——未知图标各宿主行为不一，iOS 会显示占位圆点；`text` 里 emoji 字面量可用，26.2 模拟器/真机正常——26.3 模拟器会退成“?”，调试切 26.2）。裸图标（无底无边、只当行内小徽章，如认证 seal/趋势箭头/火焰）用透明 pill 包一个纯图标：`{ type: 'pill', icon: 'check', text: '', backgroundColor: { light: '#00000000', dark: '#00000000' }, textColor: '#FF9500' }`（`text` 给空串，字号沿用 pill 配套；DevConsole 预览本就忽略一切 icon、只显文字，属宿主 gap，iOS 为准）。

### actionBar（赞转评一行）

```javascript
{ type: 'actionBar', items: [
  { icon: 'comment', text: '7' }, { icon: 'repost', text: '307' },
  { icon: 'heart', text: { value: 2000, format: 'count' } },
  { icon: 'eye', text: { value: 594600, format: 'count' } }
] }
```

带 `invoke` `target` 的单项由宿主渲染为可点按钮（调 `call.function`，成功即时翻转 + 点亮态；`kind:'count'` 计数 ±1）；无 `target` 的项纯展示、跟整卡走（`comment` 等计数项保持无 target）。

### spacer / date

同 Egern：`{type:'spacer', length?: number}`（缺省弹性）；`{type:'date', date: ISO8601, format: 'date/time/relative/offset/timer'}`。

### divider（细分隔线）

```javascript
{ type: 'divider', color: '$separator' }
```

全宽 0.5–1pt 横线（iOS `DSColor.separator` / 预览主题边框色），`color` 缺省即宿主分隔色。榜单/排行行之间压一条还原站内细线；纵列里天然撑满全宽，横行里吸满剩余空间。占节点数、不占图片数。

## 安全红线（宿主硬截）

节点总数 ≤50、嵌套深 ≤5、图片（含 avatar/grid 内 image）≤6、卡高 ≤600pt。超限截断（图多只显前 N、文本截断），根非法（无 `version/root`、根类型非容器）才整卡回退。未知 `type` 跳节点 + 日志，不炸整卡。

## 示例：横图视频卡

```javascript
{
  id: 'v1', title: '示例视频', url: 'https://example.com/v/1',
  coverUrl: 'https://example.com/c/1.jpg',
  card: {
    version: 1,
    root: {
      type: 'stack', direction: 'column', gap: 8,
      children: [
        { type: 'image', src: 'https://example.com/c/1.jpg', aspect: '16:9',
          borderRadius: 12,
          overlays: [
            { position: 'topLeft', text: '分类' },
            { position: 'bottomLeft', icon: 'eye', text: { value: 12000, format: 'count' } },
            { position: 'bottomRight', icon: 'clock', text: { value: 750, format: 'duration' } }
          ] },
        { type: 'text', text: '示例标题', font: { size: 'headline', weight: 'semibold' }, maxLines: 2 },
        { type: 'stack', direction: 'row', gap: 6, children: [
          { type: 'pill', text: '题材A' }, { type: 'pill', text: '题材B' }
        ] }
      ]
    }
  }
}
```

## 示例：竖海报卡 / 动态卡 / 人物卡

见 `__tests__/card-dsl.test.ts`（runtime）与 iOS `CardView` 预览——竖海报（`aspect:2:3` + 右下集数 overlay + 图外 pills）、动态卡（`avatar` 头部 + 正文 + `grid` 四宫格 + `actionBar`）、人物卡（`aspect:circle` + 名字 + 计数）。

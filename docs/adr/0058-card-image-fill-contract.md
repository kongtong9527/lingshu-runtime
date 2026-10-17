# ADR-0058：卡片图片的尺寸契约与填充方式（声明比 / 真图比 / 裁剪归属）

## 背景

用户报告（iOS 端）：

> 修复：DSL 卡片中的图片显示不完整，只显示中间部分

grill-with-docs 会话（2026-10-11）查实：**这不是「裁剪语义该听谁」的取舍，而是 UIKit 承载视图的尺寸契约缺失**——缺陷不崩不报错，编译警告、性能口径、既有单测全都看不见它。

### 缺陷机制（模拟器实测 + 像素证据）

渲染链只有一处（`CardView` 的 `.image` 分支）：盒 = `Color.clear.frame(maxWidth:.infinity).aspectRatio(声明比,.fit)`，图片作为**无 frame 的 `.background`** 入盒，溢出由 `clipShape` 裁。

`CardCoverImageView` 是 `UIViewRepresentable`（包 `UIImageView`，`scaleAspectFill` + `clipsToBounds`），**没有实现 `sizeThatFits`**，于是 SwiftUI 按 `UIImageView.intrinsicContentSize`（= **图片的 pt 尺寸**）排版：

```
盒（clip 容器）frame = (0, 0, 354.00, 629.33)
  UIKitPlatformViewHost frame = (-423.00, -751.67, 1200.00, 2133.00)   ← 精确居中溢出
      UIImageView frame = (0, 0, 1200.00, 2133.00) | intrinsic = (1200, 2133)
```

原点 `(-423.00, -751.67)` 正好是 `(354-1200)/2`、`(629.33-2133)/2`。外层 `clipShape` 一裁，盒里只剩原图**中段**：该例 **29.5%×29.5%**；真实网格档（600px 封面、盒 164×291.67）**27.3%×27.3%**；单列档（1200px）只剩 **13.7%×13.7%**。首帧无图时它吃提议尺寸（354×629.33），**图片一赋值、下一次布局就跳成原图尺寸**——用户看到的就是「出图即被放大、只留中间」。

| 缺陷（纯蓝 + 仅中央红条） | 修复后（四边红框可见 = 整图按盒铺满） |
| --- | --- |
| `sizeThatFits` 缺失，UIImageView = 1200×2133 | `sizeThatFits` 回报提议尺寸 |

### 边界事实（都已实测/核查，勿再凭推断重开）

- **与插件声明比无关**：video_site_d 15/15 条 `aspect` 与真实封面比一致，照样坏。
- **来源**：该路径由 `6f2bae9`（卡片封面改 UIKit 直设图，ADR-0053 §3.6 的能耗优化）引入；此前 `RemoteImageView`（SwiftUI `Image.resizable()`）吃提议尺寸，不显此缺陷。
- **补救写法实测无效**：调用侧 `.frame(maxWidth:.infinity, maxHeight:.infinity)`、`.aspectRatio(contentMode:.fill)` 都改变不了 `UIImageView` 的 1200×2133 与负原点（flexible frame 只让自身填满，不改子视图尺寸）。
- **爆炸半径**：全仓 11 个 UIKit 承载视图里只有这个 `UIImageView` 有内禀尺寸，其余是 `UICollectionView`/`WKWebView`/`AVPlayerLayer` 这类无内禀尺寸的（靠提议兜底）。
- **三端契约漂移**：`resizeMode`（`types.ts:172` + skill 文档示例）**三端无人消费**；`aspect` 缺省/非法时 DevConsole 回 16:9、iOS 回 `nil`（`.aspectRatio(nil)` 是空操作，盒高不受约束）。

## 决策（2026-10-11 grill-with-docs，用户「全按推荐」）

1. **尺寸契约（不可协商）**：凡「包着**有内禀尺寸**的 UIKit 视图、又要铺满 SwiftUI 给定盒」的承载视图，**必须实现 `sizeThatFits` 并只回报提议尺寸**——`CardHostedViewSizing.fitted`：提议轴优先，只有提议未指定的轴才回落内禀尺寸，内禀非法（无内容 = `noIntrinsicMetric` 即 -1）/NaN/∞ 一律回落 0（绝不把负/NaN 喂回布局协商）。新增承载视图时先问一句「它有内禀尺寸吗」。
2. **裁剪归属**：盒比由插件 `aspect` 声明（缺省/非法 → **16:9**，三端统一）；内容怎么放进盒由 `resizeMode` 声明——`cover`（**缺省**，填满裁溢出；海报墙/宫格要的统一比）或 `contain`（整图可见、盒内留白）。**宿主永不按原图内禀尺寸排版**，也永不自作主张改插件声明比。
3. **本版不做真图比收敛**：卡片列表是 SwiftUI 自适应高，收敛会让行高随图片到达变化、首屏位移；瀑布流那条收敛链（ADR-0003/0016/0023、`lingshu-aspects.sqlite`）不搬进卡片栈。要「绝不裁」用 `contain`；要「绝不裁且无留白」就由插件把 `aspect` 算准（video_site_d `aspectForCover` 现算即此范式）。
4. **写侧必须同构**：DevConsole 预览与 iOS 逐像素同构（`.pv-card__img` = 100%×100% + `object-fit` 跟 `resizeMode` + 居中）。写侧看不见裁剪，这类缺陷就会反复漏到 iOS——同构是防复发的一半。
5. **三处同步**（根 `AGENTS.md` 第 8 条）：iOS 模型 `CardImageResizeMode` ↔ `runtime/src/types.ts` ↔ skill `references/card-dsl.md`；simulator 校验对非法 `resizeMode`/`aspect` 报 warning（不报 error、不触发整卡回退）。

## Considered Options

- **缺省 letterbox（一律 `scaleAspectFit`）**：横竖混排全是留白条，封面墙/宫格语义直接崩。否决——留作 `contain` 的显式声明。
- **缺省收敛到真图比（无裁无留白）**：回流与首屏位移风险（SwiftUI 自适应高），且与「声明即权威、不学习不收敛」（`527d045` 瀑布流先例）冲突。留作未来可选项。
- **调用侧打补丁**（`.frame(maxHeight:.infinity)` / `.aspectRatio(.fill)`）：实测无效。否决。
- **宿主改成无内禀尺寸容器 + 内部 `UIImageView` 约束贴边**：同样有效，但每个 cell 多一层容器与约束，卡片栈对 per-cell 成本敏感（ADR-0053）。否决，选 `sizeThatFits`。
- **删掉 `resizeMode` 字段**：写侧文档已发布，且「统一比裁剪」是真实需求（video_site_g/manga_site_a 的固定比卡）。否决。

## Consequences

- **iOS**：`CardCoverImageView` 补 `sizeThatFits` + `CardHostedViewSizing` + `CardImageResizeMode`；`CardView` 的 image 分支透传 `resizeMode`；`cardAspect` 缺省/非法回 16:9（由 `private` 改 internal 以便单测）。`avatar` 同组件、由 `.frame(40×40)` 兜住（实测提议 40×40 → 40×40），一并受契约保护。
- **回归锁**：`ios/LingshuTests/CardCoverSizingTests.swift`——① 纯函数（提议优先/未指定轴回落/无内容不产生非法尺寸）；② 布局正负对照（实现契约 = 盒尺寸；不实现 = 内禀尺寸居中溢出，锁住缺陷机制本身）；③ 真组件端到端（磁盘缓存预热 → 内存缓存同步命中出图后仍 = 盒尺寸，并锁 cover/contain 映射）。
- **DevConsole**：`.pv-card__img` 补 `object-fit`（原先该类**完全没有样式**）；`objectFitStyle` 跟随 `resizeMode`；`aspectStyle` 收紧为 W/H 均正有限数。
- **simulator**：`card-dsl.ts` 对非法 `resizeMode`、缺省/非法 `aspect` 报 warning。
- **文档**：`ios/docs/card-dsl.md`（渲染红线）、`devconsole/docs/card-dsl.md`、skill `references/card-dsl.md`（正文契约）、`CONTEXT.md` 词条（`图片填充方式`、`尺寸契约`）。
- **版本**：`ios/project.yml` `MARKETING_VERSION` 0.1.21 → 0.1.22。
- **未做**：真机复核（`ios list` 为空，本次以模拟器像素证据 + 生产 App 截图验收；机制与机型无关，真机接入后补一轮）；真图比收敛（见决策 3）。

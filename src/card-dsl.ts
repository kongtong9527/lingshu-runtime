// 卡片 DSL 轻校验（ADR-0050）：结构合法性 + 安全红线（节点数/深度/图片数）。
// 根非法 → 整卡回退；超限 → 宿主截断（此处报 warning）。宿主解码未知 type 跳节点。

import type { CardDSL, CardNode } from './types.js'

export const CARD_LIMITS = {
  maxNodes: 50,
  maxDepth: 5,
  maxImages: 6,
  maxCardHeight: 600,
} as const

export interface CardValidation {
  ok: boolean
  /** 根非法（整卡回退） */
  errors: string[]
  /** 超限可截断（宿主截断显示） */
  warnings: string[]
  nodeCount: number
  depth: number
  imageCount: number
}

/** image.aspect 合法枚举（缺省/非法一律回退 16:9，与 iOS/DevConsole 同口径） */
const ASPECT_ENUM = new Set(['16:9', '4:3', '3:4', '2:3', '1:1', 'circle'])

/**
 * 已知节点类型（Card DSL v1）。
 * **未知的子节点**跳节点不回退（前向兼容，Q20）；但**未知的 root** 一律整卡回退——
 * 与 iOS `CardDSL.shouldFallback` 同口径：root 都认不出来时渲染出来是空卡，
 * 回退老卡才是对的（这条曾被 runtime 与 iOS 判得不一样，2026-10 由 conformance 语料抓出）。
 */
const KNOWN_NODE_TYPES = new Set(['stack', 'text', 'image', 'avatar', 'grid', 'pill', 'actionBar', 'spacer', 'divider', 'date'])

/** aspect 能否解析出比值：枚举命中，或通用 W:H 且 W/H 均为正有限数；缺省/非法为 false */
function isLegalAspect(aspect: unknown): boolean {
  if (typeof aspect === 'string' && ASPECT_ENUM.has(aspect)) return true
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(typeof aspect === 'string' ? aspect : '')
  if (!m) return false
  const w = Number(m[1])
  const h = Number(m[2])
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
}

function childrenOf(node: CardNode): CardNode[] {
  if (node.type === 'stack' || node.type === 'grid') return node.children ?? []
  if (node.type === 'actionBar') return []
  return []
}

export function validateCardDSL(card: CardDSL | null | undefined): CardValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!card || typeof card !== 'object') return { ok: false, errors: ['card 缺失'], warnings, nodeCount: 0, depth: 0, imageCount: 0 }
  if ((card as { version?: unknown }).version !== 1) errors.push('version 必须为 1')
  if (!card.root || typeof card.root !== 'object') {
    errors.push('root 缺失')
  } else {
    const rootType = (card.root as { type?: unknown }).type
    if (typeof rootType !== 'string' || !KNOWN_NODE_TYPES.has(rootType)) {
      errors.push(`root.type 未知（${String(rootType)}）`)
    }
  }
  let nodeCount = 0
  let imageCount = 0
  let maxDepth = 0
  const walk = (node: CardNode | undefined, depth: number) => {
    if (!node || typeof node !== 'object') return
    nodeCount += 1
    maxDepth = Math.max(maxDepth, depth)
    if (node.type === 'image' || node.type === 'avatar') imageCount += 1
    if (node.type === 'grid') {
      for (const c of node.children ?? []) {
        if (c && (c as CardNode).type === 'image') imageCount += 0 // 已在递归中计数，避免双计
      }
    }
    for (const c of childrenOf(node)) walk(c, depth + 1)
    // grid children 同走 childrenOf，已覆盖
    if (node.type === 'image' && node.overlays && node.overlays.length > 5) {
      warnings.push('image.overlays 超过 5 个将被截断')
    }
    if (node.type === 'image') {
      // resizeMode 缺省即 cover（合法），只有「存在但非法」才提示；aspect 缺省/非法一律回退 16:9
      const rm = (node as { resizeMode?: unknown }).resizeMode
      if (rm !== undefined && rm !== 'cover' && rm !== 'contain') {
        warnings.push(`image.resizeMode 非法（${String(rm)}），宿主回缺省 cover`)
      }
      const aspect = (node as { aspect?: unknown }).aspect
      if (!isLegalAspect(aspect)) {
        warnings.push(`image.aspect 缺省/非法（${String(aspect)}），宿主回退 16:9`)
      }
      for (const ov of node.overlays ?? []) {
        const o = (ov as { opacity?: unknown }).opacity
        if (o !== undefined && (typeof o !== 'number' || !Number.isFinite(o) || o < 0 || o > 1)) {
          warnings.push(`overlay.opacity 非法（${String(o)}），宿主钳制 0~1`)
        }
        const s = (ov as { size?: unknown }).size
        if (s !== undefined && (typeof s !== 'number' || !Number.isFinite(s) || (s as number) <= 0)) {
          warnings.push(`overlay.size 非法（${String(s)}），宿主回缺省 34`)
        }
      }
    }
    if (node.type === 'pill') {
      const s = (node as { size?: unknown }).size
      if (s !== undefined && (typeof s !== 'number' || !Number.isFinite(s) || (s as number) <= 0)) {
        warnings.push(`pill.size 非法（${String(s)}），宿主回缺省 24`)
      }
    }
  }
  if (card.root) walk(card.root, 1)
  if (nodeCount > CARD_LIMITS.maxNodes) warnings.push(`节点数 ${nodeCount} 超过 ${CARD_LIMITS.maxNodes} 将被截断`)
  if (maxDepth > CARD_LIMITS.maxDepth) warnings.push(`嵌套深 ${maxDepth} 超过 ${CARD_LIMITS.maxDepth} 将被截断`)
  if (imageCount > CARD_LIMITS.maxImages) warnings.push(`图片数 ${imageCount} 超过 ${CARD_LIMITS.maxImages} 只显前 N`)
  return { ok: errors.length === 0, errors, warnings, nodeCount, depth: maxDepth, imageCount }
}

/** 是否整卡回退：根非法即回退（未知子节点只跳节点，不回退） */
export function shouldFallbackCard(card: CardDSL | null | undefined): boolean {
  return !validateCardDSL(card).ok
}

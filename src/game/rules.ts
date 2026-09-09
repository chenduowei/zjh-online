/**
 * 炸金花 - 牌型判定与比较规则
 *
 * 牌型从大到小：
 * 1. 豹子 (Three of a Kind)  – 三张同点
 * 2. 同花顺 (Straight Flush) – 同花 + 顺子
 * 3. 金花 (Flush)            – 三张同花
 * 4. 顺子 (Straight)         – 连续点数（含 A23）
 * 5. 对子 (Pair)             – 两张同点
 * 6. 高牌 (High Card)        – 散牌
 *
 * 特殊说明：
 * - A 可作最大（QKA）也可作最小（A23）
 * - 同牌型时按点数从大到小逐一比较
 * - 对子先比对子点数，再比单牌
 * - 花色不参与比大小（仅用于判断同花）
 */

import type { Card, Rank } from './cards';
import { RANK_VALUE, sortByRankDesc } from './cards';

/** 牌型（数值越大越强） */
export const HandType = {
  HighCard: 1,
  Pair: 2,
  Straight: 3,
  Flush: 4,
  StraightFlush: 5,
  ThreeOfAKind: 6,
} as const;

export type HandType = (typeof HandType)[keyof typeof HandType];

export const HAND_TYPE_CN: Record<HandType, string> = {
  [HandType.HighCard]: '高牌',
  [HandType.Pair]: '对子',
  [HandType.Straight]: '顺子',
  [HandType.Flush]: '金花',
  [HandType.StraightFlush]: '同花顺',
  [HandType.ThreeOfAKind]: '豹子',
};

export interface HandResult {
  type: HandType;
  /** 用于比较的关键点数序列（已从大到小） */
  ranks: number[];
  /** 原始三张牌（按点数降序） */
  cards: Card[];
  /** 中文描述，例如 "豹子 A" / "同花顺 QKA" */
  label: string;
}

/** 判断三张牌是否同花 */
function isFlush(cards: Card[]): boolean {
  return cards[0]!.suit === cards[1]!.suit && cards[1]!.suit === cards[2]!.suit;
}

/**
 * 判断是否顺子，并返回排序后的点数（高到低）
 * 支持普通顺子和 A-2-3
 */
function getStraightRanks(sortedValues: number[]): number[] | null {
  const [a, b, c] = sortedValues; // a >= b >= c

  // 普通顺子：差值都为 1
  if (a! - b! === 1 && b! - c! === 1) {
    return [a!, b!, c!];
  }

  // A-2-3 特例：A=14, 3, 2 → 视为 3-2-A（A 最小）
  if (a === 14 && b === 3 && c === 2) {
    // 比较时 A23 视为最小顺子，用 [3, 2, 1] 表示
    return [3, 2, 1];
  }

  return null;
}

/** 是否三张同点 */
function isThreeOfAKind(sortedValues: number[]): boolean {
  return sortedValues[0] === sortedValues[1] && sortedValues[1] === sortedValues[2];
}

/** 是否对子，返回 [对子点数, 单牌点数] */
function getPairRanks(sortedValues: number[]): [number, number] | null {
  const [a, b, c] = sortedValues;
  if (a === b && b !== c) return [a!, c!];
  if (b === c && a !== b) return [b!, a!];
  // 豹子已经在前面处理，这里不会出现 a===b===c
  return null;
}

/**
 * 评估一手三张牌
 * @param cards 必须恰好 3 张
 */
export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length !== 3) {
    throw new Error(`炸金花每手必须 3 张牌，收到 ${cards.length} 张`);
  }

  const sorted = sortByRankDesc(cards);
  const values = sorted.map((c) => RANK_VALUE[c.rank]);
  const flush = isFlush(sorted);
  const straightRanks = getStraightRanks(values);

  // 1. 豹子
  if (isThreeOfAKind(values)) {
    return {
      type: HandType.ThreeOfAKind,
      ranks: values,
      cards: sorted,
      label: `豹子 ${sorted[0]!.rank}`,
    };
  }

  // 2. 同花顺
  if (flush && straightRanks) {
    const labelRanks =
      straightRanks[2] === 1
        ? 'A23'
        : sorted.map((c) => c.rank).join('');
    return {
      type: HandType.StraightFlush,
      ranks: straightRanks,
      cards: sorted,
      label: `同花顺 ${labelRanks}`,
    };
  }

  // 3. 金花
  if (flush) {
    return {
      type: HandType.Flush,
      ranks: values,
      cards: sorted,
      label: `金花 ${sorted.map((c) => c.rank).join('')}`,
    };
  }

  // 4. 顺子
  if (straightRanks) {
    const labelRanks =
      straightRanks[2] === 1
        ? 'A23'
        : sorted.map((c) => c.rank).join('');
    return {
      type: HandType.Straight,
      ranks: straightRanks,
      cards: sorted,
      label: `顺子 ${labelRanks}`,
    };
  }

  // 5. 对子
  const pair = getPairRanks(values);
  if (pair) {
    const [pairRank, kicker] = pair;
    const pairRankName = Object.entries(RANK_VALUE).find(
      ([, v]) => v === pairRank,
    )?.[0] as Rank;
    return {
      type: HandType.Pair,
      ranks: [pairRank, kicker],
      cards: sorted,
      label: `对子 ${pairRankName}`,
    };
  }

  // 6. 高牌
  return {
    type: HandType.HighCard,
    ranks: values,
    cards: sorted,
    label: `高牌 ${sorted[0]!.rank}`,
  };
}

/**
 * 比较两手牌
 * @returns >0 表示 a 赢，<0 表示 b 赢，0 表示完全相同（平局）
 */
export function compareHands(a: HandResult, b: HandResult): number {
  // 先比牌型
  if (a.type !== b.type) {
    return a.type - b.type;
  }

  // 同牌型比 ranks 序列
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    const va = a.ranks[i] ?? 0;
    const vb = b.ranks[i] ?? 0;
    if (va !== vb) return va - vb;
  }

  return 0;
}

/**
 * 在多手牌中找出最大的一手（可有多个平局）
 * 返回所有并列最大的下标
 */
export function findWinners(hands: HandResult[]): number[] {
  if (hands.length === 0) return [];

  let best = hands[0]!;
  let winners = [0];

  for (let i = 1; i < hands.length; i++) {
    const cmp = compareHands(hands[i]!, best);
    if (cmp > 0) {
      best = hands[i]!;
      winners = [i];
    } else if (cmp === 0) {
      winners.push(i);
    }
  }

  return winners;
}

/** 便捷：直接比较两手原始牌 */
export function compareCards(a: Card[], b: Card[]): number {
  return compareHands(evaluateHand(a), evaluateHand(b));
}

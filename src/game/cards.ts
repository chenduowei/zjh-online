/**
 * 炸金花 - 牌面基础定义
 * 一副牌 52 张（不含大小王）
 */

export type Suit = 'spade' | 'heart' | 'club' | 'diamond';
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  /** 唯一标识，例如 "spade-A" */
  id: string;
}

/** 花色显示顺序（黑红梅方） */
export const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond'];

/** 点数从低到高 */
export const RANKS: Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];

/** 点数对应数值，A 最大 = 14 */
export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** 花色中文名 */
export const SUIT_CN: Record<Suit, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
};

/** 花色符号 */
export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

/** 是否红色花色 */
export function isRed(suit: Suit): boolean {
  return suit === 'heart' || suit === 'diamond';
}

/** 创建一张牌 */
export function createCard(suit: Suit, rank: Rank): Card {
  return {
    suit,
    rank,
    id: `${suit}-${rank}`,
  };
}

/** 从 id 解析牌 */
export function parseCardId(id: string): Card | null {
  const [suit, rank] = id.split('-') as [Suit, Rank];
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null;
  return createCard(suit, rank);
}

/** 牌面显示文本，例如 "A♠" */
export function cardToString(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

/** 比较两张牌点数（不考虑花色），返回 a - b 的符号 */
export function compareRank(a: Card, b: Card): number {
  return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
}

/** 按点数从大到小排序 */
export function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => compareRank(b, a));
}

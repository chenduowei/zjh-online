/**
 * 炸金花 - 牌堆管理
 */

import type { Card } from './cards';
import {
  createCard,
  SUITS,
  RANKS,
  cardToString,
} from './cards';

/** 创建一副完整 52 张牌 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(suit, rank));
    }
  }
  return deck;
}

/**
 * Fisher-Yates 洗牌（原地打乱）
 * 使用 crypto.getRandomValues 保证随机性（浏览器 & Node 均可用）
 */
export function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  // 优先用 Web Crypto / Node crypto
  const randomBytes = (n: number): Uint32Array => {
    const buf = new Uint32Array(n);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(buf);
    } else {
      // 兜底（测试环境）
      for (let i = 0; i < n; i++) {
        buf[i] = Math.floor(Math.random() * 0xffffffff);
      }
    }
    return buf;
  };

  const rand = randomBytes(arr.length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand[i]! % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** 发牌：从牌堆顶部连续取 n 张，返回 [手牌, 剩余牌堆] */
export function deal(deck: Card[], n: number): [Card[], Card[]] {
  if (n > deck.length) {
    throw new Error(`牌不够：需要 ${n} 张，只剩 ${deck.length} 张`);
  }
  const hand = deck.slice(0, n);
  const remaining = deck.slice(n);
  return [hand, remaining];
}

/**
 * 为多名玩家发 3 张牌
 * 返回 { hands: Card[][], remaining: Card[] }
 */
export function dealToPlayers(
  deck: Card[],
  playerCount: number,
  cardsPerPlayer = 3,
): { hands: Card[][]; remaining: Card[] } {
  const totalNeeded = playerCount * cardsPerPlayer;
  if (totalNeeded > deck.length) {
    throw new Error(
      `牌不够：${playerCount} 人各 ${cardsPerPlayer} 张需要 ${totalNeeded}，只剩 ${deck.length}`,
    );
  }

  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let remaining = [...deck];

  // 按“每人一张轮流发”的传统方式发牌
  for (let c = 0; c < cardsPerPlayer; c++) {
    for (let p = 0; p < playerCount; p++) {
      const [card, rest] = deal(remaining, 1);
      hands[p]!.push(card[0]!);
      remaining = rest;
    }
  }

  return { hands, remaining };
}

/** 调试：打印牌堆 */
export function debugDeck(deck: Card[]): string {
  return deck.map(cardToString).join(' ');
}

/** 快捷：创建并洗好一副牌 */
export function freshShuffledDeck(): Card[] {
  return shuffle(createDeck());
}

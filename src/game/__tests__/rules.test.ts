import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../cards';
import {
  evaluateHand,
  compareHands,
  findWinners,
  HandType,
} from '../rules';

const c = createCard;

describe('evaluateHand', () => {
  it('识别豹子', () => {
    const h = evaluateHand([c('spade', 'A'), c('heart', 'A'), c('club', 'A')]);
    assert.equal(h.type, HandType.ThreeOfAKind);
    assert.match(h.label, /豹子/);
  });

  it('识别同花顺 QKA', () => {
    const h = evaluateHand([c('heart', 'Q'), c('heart', 'K'), c('heart', 'A')]);
    assert.equal(h.type, HandType.StraightFlush);
  });

  it('识别同花顺 A23', () => {
    const h = evaluateHand([c('diamond', 'A'), c('diamond', '2'), c('diamond', '3')]);
    assert.equal(h.type, HandType.StraightFlush);
    assert.deepEqual(h.ranks, [3, 2, 1]);
  });

  it('识别金花', () => {
    const h = evaluateHand([c('club', 'A'), c('club', 'K'), c('club', '9')]);
    assert.equal(h.type, HandType.Flush);
  });

  it('识别顺子与 A23 顺子', () => {
    const s = evaluateHand([c('spade', '5'), c('heart', '6'), c('club', '7')]);
    assert.equal(s.type, HandType.Straight);
    const a23 = evaluateHand([c('spade', 'A'), c('heart', '2'), c('club', '3')]);
    assert.equal(a23.type, HandType.Straight);
  });

  it('识别对子', () => {
    const h = evaluateHand([c('spade', 'K'), c('heart', 'K'), c('club', '9')]);
    assert.equal(h.type, HandType.Pair);
    assert.equal(h.ranks[0], 13);
  });

  it('识别高牌', () => {
    const h = evaluateHand([c('spade', 'A'), c('heart', 'K'), c('club', '9')]);
    assert.equal(h.type, HandType.HighCard);
  });
});

describe('compareHands', () => {
  it('牌型大小顺序正确', () => {
    const baozi = evaluateHand([c('spade', '2'), c('heart', '2'), c('club', '2')]);
    const sf = evaluateHand([c('heart', 'Q'), c('heart', 'K'), c('heart', 'A')]);
    const flush = evaluateHand([c('club', 'A'), c('club', 'K'), c('club', '9')]);
    const straight = evaluateHand([c('spade', '5'), c('heart', '6'), c('club', '7')]);
    const pair = evaluateHand([c('spade', 'K'), c('heart', 'K'), c('club', '9')]);
    const high = evaluateHand([c('spade', 'A'), c('heart', 'K'), c('club', '9')]);

    assert.ok(compareHands(baozi, sf) > 0);
    assert.ok(compareHands(sf, flush) > 0);
    assert.ok(compareHands(flush, straight) > 0);
    assert.ok(compareHands(straight, pair) > 0);
    assert.ok(compareHands(pair, high) > 0);
  });

  it('QKA 同花顺 > A23 同花顺', () => {
    const qka = evaluateHand([c('heart', 'Q'), c('heart', 'K'), c('heart', 'A')]);
    const a23 = evaluateHand([c('diamond', 'A'), c('diamond', '2'), c('diamond', '3')]);
    assert.ok(compareHands(qka, a23) > 0);
  });

  it('对 A > 对 K（即使 K 带 A）', () => {
    const pairA = evaluateHand([c('spade', 'A'), c('heart', 'A'), c('club', '2')]);
    const pairK = evaluateHand([c('spade', 'K'), c('heart', 'K'), c('club', 'A')]);
    assert.ok(compareHands(pairA, pairK) > 0);
  });

  it('同对子比 kicker', () => {
    const k9 = evaluateHand([c('spade', 'K'), c('heart', 'K'), c('club', '9')]);
    const k8 = evaluateHand([c('diamond', 'K'), c('club', 'K'), c('heart', '8')]);
    assert.ok(compareHands(k9, k8) > 0);
  });

  it('完全相同则平局', () => {
    const a = evaluateHand([c('spade', 'A'), c('heart', 'K'), c('club', '9')]);
    const b = evaluateHand([c('diamond', 'A'), c('club', 'K'), c('heart', '9')]);
    assert.equal(compareHands(a, b), 0);
  });
});

describe('findWinners', () => {
  it('找出唯一最大', () => {
    const hands = [
      evaluateHand([c('spade', '2'), c('heart', '3'), c('club', '4')]),
      evaluateHand([c('spade', 'A'), c('heart', 'A'), c('club', 'A')]),
      evaluateHand([c('spade', 'K'), c('heart', 'K'), c('club', '2')]),
    ];
    assert.deepEqual(findWinners(hands), [1]);
  });

  it('支持平局多人', () => {
    const hands = [
      evaluateHand([c('spade', 'A'), c('heart', 'K'), c('club', '9')]),
      evaluateHand([c('diamond', 'A'), c('club', 'K'), c('heart', '9')]),
      evaluateHand([c('spade', '2'), c('heart', '3'), c('club', '5')]),
    ];
    assert.deepEqual(findWinners(hands), [0, 1]);
  });
});

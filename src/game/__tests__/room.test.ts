import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room';
import { publicCompareFor, type CompareResult } from '../engine';
import { createCard } from '../cards';
import { evaluateHand } from '../rules';

const c = createCard;

function sampleCompare(): CompareResult {
  return {
    challengerId: 'p1',
    targetId: 'p2',
    winnerId: 'p1',
    loserId: 'p2',
    challengerHand: evaluateHand([c('spade', 'A'), c('heart', 'A'), c('club', 'A')]),
    targetHand: evaluateHand([c('spade', '2'), c('heart', '5'), c('diamond', '9')]),
  };
}

describe('publicCompareFor 视角裁剪', () => {
  it('当事人可见双方手牌', () => {
    const cmp = sampleCompare();
    for (const viewer of ['p1', 'p2']) {
      const pub = publicCompareFor(viewer, cmp);
      assert.ok(pub.challengerHand, '挑战者应看到手牌');
      assert.ok(pub.targetHand, '被挑战者应看到手牌');
      assert.equal(pub.winnerId, 'p1');
    }
  });

  it('旁观者只收结果，看不到手牌', () => {
    const pub = publicCompareFor('p3', sampleCompare());
    assert.equal(pub.challengerHand, undefined);
    assert.equal(pub.targetHand, undefined);
    assert.equal(pub.challengerId, 'p1');
    assert.equal(pub.targetId, 'p2');
    assert.equal(pub.winnerId, 'p1');
    assert.equal(pub.loserId, 'p2');
  });

  it('未知视角默认裁剪', () => {
    const pub = publicCompareFor(undefined, sampleCompare());
    assert.equal(pub.challengerHand, undefined);
    assert.equal(pub.targetHand, undefined);
  });
});

describe('GameRoom token 重连', () => {
  it('创建与加入都发放 token', () => {
    const room = new GameRoom('ABC123', 'host1', '房主');
    assert.ok(room.playerToken('host1'));
    const r = room.addPlayer('p2', '玩家2');
    assert.equal(r.ok, true);
    assert.ok(r.token);
  });

  it('断线后凭 token 回座，座位与身份不变', () => {
    const room = new GameRoom('ABC123', 'host1', '房主');
    const r = room.addPlayer('p2', '玩家2');
    const token = r.token!;
    assert.equal(room.startGame('host1').ok, true);

    room.removePlayer('p2'); // 对局中断线：只标记，不断座
    const ghost = room.findByToken(token)!;
    assert.equal(ghost.connected, false);
    assert.equal(ghost.seat, 1);

    const back = room.reconnect(token)!;
    assert.equal(back.id, 'p2');
    assert.equal(back.seat, 1);
    assert.equal(back.connected, true);
  });

  it('错误 token 找不到人', () => {
    const room = new GameRoom('ABC123', 'host1', '房主');
    assert.equal(room.findByToken('no-such-token'), undefined);
    assert.equal(room.reconnect('no-such-token'), null);
  });

  it('getPublicState 不泄露 token', () => {
    const room = new GameRoom('ABC123', 'host1', '房主');
    room.addPlayer('p2', '玩家2');
    const s = room.getPublicState('p2');
    for (const p of s.players) {
      assert.ok(!('token' in p), 'token 不应出现在广播状态里');
    }
  });

  it('getActingPlayerId 返回当前行动者', () => {
    const room = new GameRoom('ABC123', 'host1', '房主');
    room.addPlayer('p2', '玩家2');
    assert.equal(room.getActingPlayerId(), null);
    assert.equal(room.startGame('host1').ok, true);
    const acting = room.getActingPlayerId();
    assert.ok(acting === 'host1' || acting === 'p2');
  });
});

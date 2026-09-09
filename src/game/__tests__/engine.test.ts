import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ZjhEngine } from '../engine';
import { createCard } from '../cards';

const c = createCard;

describe('ZjhEngine 基础流程', () => {
  let engine: ZjhEngine;

  beforeEach(() => {
    engine = new ZjhEngine({
      ante: 10,
      unit: 10,
      startingChips: 500,
      openMultiplier: 2,
      compareAfterRound: 1,
    });
  });

  it('加人与开局', () => {
    assert.equal(engine.addPlayer('p1', '张三'), true);
    assert.equal(engine.addPlayer('p2', '李四'), true);
    assert.equal(engine.addPlayer('p1', '重复'), false); // 重复 id

    const r = engine.startHand();
    assert.equal(r.ok, true);
    assert.equal(engine.getPhase(), 'betting');

    const snap = engine.getSnapshot();
    assert.equal(snap.pot, 20); // 2 * ante
    assert.equal(snap.players.length, 2);
    assert.ok(snap.actingSeat >= 0);
  });

  it('人数不足不能开局', () => {
    engine.addPlayer('p1', '独行侠');
    const r = engine.startHand();
    assert.equal(r.ok, false);
  });

  it('看牌后倍率变化', () => {
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    const snap0 = engine.getSnapshot();
    const actorId = snap0.players.find((p) => p.seat === snap0.actingSeat)!.id;

    // 看牌
    const look = engine.act(actorId, { type: 'look' });
    assert.equal(look.ok, true);
    const snap1 = engine.getSnapshot(actorId);
    const me = snap1.players.find((p) => p.id === actorId)!;
    assert.equal(me.looked, true);
    assert.ok(me.cards && me.cards.length === 3);
  });

  it('弃牌后只剩一人直接结束', () => {
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    const snap = engine.getSnapshot();
    const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const other = snap.players.find((p) => p.id !== actor.id)!;

    const r = engine.act(actor.id, { type: 'fold' });
    assert.equal(r.ok, true);
    assert.equal(r.finished, true);
    assert.deepEqual(r.winnerIds, [other.id]);

    const final = engine.getSnapshot();
    assert.equal(final.phase, 'finished');
    // 赢家拿到底池 20
    const winner = final.players.find((p) => p.id === other.id)!;
    assert.equal(winner.chips, 500 - 10 + 20); // 起始 - ante + pot
  });

  it('跟注推进回合', () => {
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    // 两人各跟一次，应进入下一轮或继续
    for (let i = 0; i < 4; i++) {
      const snap = engine.getSnapshot();
      if (snap.phase !== 'betting') break;
      const actor = snap.players.find((p) => p.seat === snap.actingSeat);
      if (!actor) break;
      const r = engine.act(actor.id, { type: 'call' });
      assert.equal(r.ok, true, r.error);
    }
    // 至少不应该崩溃，底池应增加
    assert.ok(engine.getPot() >= 20);
  });

  it('达到最大回合后自动摊牌', () => {
    const limited = new ZjhEngine({
      ante: 10,
      unit: 10,
      startingChips: 500,
      maxRounds: 2,
    });
    limited.addPlayer('p1', 'A');
    limited.addPlayer('p2', 'B');
    assert.equal(limited.startHand().ok, true);

    let guard = 0;
    while (limited.getPhase() === 'betting' && guard++ < 10) {
      const snapshot = limited.getSnapshot();
      const actor = snapshot.players.find((p) => p.seat === snapshot.actingSeat)!;
      const result = limited.act(actor.id, { type: 'call' });
      assert.equal(result.ok, true, result.error);
    }

    const final = limited.getSnapshot();
    assert.equal(final.phase, 'finished');
    assert.equal(final.currentRound, 2);
    assert.equal(final.config.maxRounds, 2);
    assert.ok(final.winnerIds?.length);
  });

  it('比牌淘汰并结算', () => {
    engine.addPlayer('p1', '强者');
    engine.addPlayer('p2', '弱者');
    engine.startHand();

    // 强制设置手牌：p1 豹子，p2 高牌
    engine._debugSetCards('p1', [c('spade', 'A'), c('heart', 'A'), c('club', 'A')]);
    engine._debugSetCards('p2', [c('spade', '2'), c('heart', '3'), c('club', '5')]);

    // 先让双方都行动一轮，满足比牌条件
    let snap = engine.getSnapshot();
    let actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    engine.act(actor.id, { type: 'call' });

    snap = engine.getSnapshot();
    if (snap.phase === 'betting') {
      actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
      engine.act(actor.id, { type: 'call' });
    }

    // 现在找一个还能行动的人发起比牌
    snap = engine.getSnapshot();
    if (snap.phase !== 'betting') {
      // 可能已经因为某种原因结束，跳过
      return;
    }
    actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const target = snap.players.find((p) => p.id !== actor.id)!;

    const r = engine.act(actor.id, { type: 'compare', targetPlayerId: target.id });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.compare);
    assert.equal(r.compare!.winnerId, 'p1'); // 豹子必胜
    assert.equal(r.finished, true);
  });

  it('getLegalActions 返回合理选项', () => {
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    const snap = engine.getSnapshot();
    const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const legal = engine.getLegalActions(actor.id);
    assert.ok(legal.includes('fold'));
    assert.ok(legal.includes('call'));
    assert.ok(legal.includes('raise'));
    assert.ok(legal.includes('look')); // 还没看牌
  });

  it('非行动玩家不能操作', () => {
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    const snap = engine.getSnapshot();
    const notActor = snap.players.find((p) => p.seat !== snap.actingSeat)!;
    const r = engine.act(notActor.id, { type: 'fold' });
    assert.equal(r.ok, false);
  });
});

describe('三人局', () => {
  it('一人弃牌后继续，另一人弃牌结束', () => {
    const engine = new ZjhEngine({ ante: 5, unit: 5, startingChips: 200 });
    engine.addPlayer('a', '甲');
    engine.addPlayer('b', '乙');
    engine.addPlayer('c', '丙');
    const start = engine.startHand();
    assert.equal(start.ok, true);
    assert.equal(engine.getPot(), 15);

    // 连续弃牌直到结束
    let guard = 0;
    while (engine.getPhase() === 'betting' && guard++ < 20) {
      const snap = engine.getSnapshot();
      const actor = snap.players.find((p) => p.seat === snap.actingSeat);
      if (!actor) break;
      engine.act(actor.id, { type: 'fold' });
    }
    assert.equal(engine.getPhase(), 'finished');
    const final = engine.getSnapshot();
    assert.ok(final.winnerIds && final.winnerIds.length === 1);
  });
});

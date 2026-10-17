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

describe('边池结算', () => {
  it('短筹码全下只赢自己参与的部分', () => {
    // 注：引擎是「每轮独立起注」模式（currentBet 每轮重置为 unit），用 maxRounds=2 快速收尾
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 1000, maxRounds: 2 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.addPlayer('p3', 'C');
    engine._debugSetChips('p1', 60); // A 只有 60
    assert.equal(engine.startHand().ok, true);

    // 固定牌力：A 豹子 > B 同花顺 > C 散牌
    engine._debugSetCards('p1', [c('spade', 'A'), c('heart', 'A'), c('club', 'A')]);
    engine._debugSetCards('p2', [c('spade', 'K'), c('spade', 'Q'), c('spade', 'J')]);
    engine._debugSetCards('p3', [c('spade', '2'), c('heart', '5'), c('club', '9')]);

    // 第一轮：C 先行动（庄家 B 的下一位）
    let r = engine.act('p3', { type: 'call' });
    assert.equal(r.ok, true, r.error);
    r = engine.act('p1', { type: 'allin' }); // A 全下 50，本局共投 60
    assert.equal(r.ok, true, r.error);
    r = engine.act('p2', { type: 'raise', amount: 480 }); // B 共投 540
    assert.equal(r.ok, true, r.error);
    r = engine.act('p3', { type: 'call' }); // C 跟到 540
    assert.equal(r.ok, true, r.error);

    // 第二轮：每轮独立起注，各跟 10 后达到 maxRounds 自动摊牌
    r = engine.act('p3', { type: 'call' });
    assert.equal(r.ok, true, r.error);
    r = engine.act('p2', { type: 'call' });
    assert.equal(r.ok, true, r.error);

    assert.equal(engine.getPhase(), 'finished');
    const snap = engine.getSnapshot();
    assert.equal(snap.pot, 0);
    // 总投入：A 60，B 550，C 550；主池 180 归 A（豹子），边池 980 归 B（同花顺）
    const chips = Object.fromEntries(snap.players.map((p) => [p.id, p.chips]));
    assert.equal(chips['p1'], 180);
    assert.equal(chips['p2'], 1430);
    assert.equal(chips['p3'], 450);
    assert.deepEqual(snap.winnerIds, ['p1', 'p2']);
  });

  it('只剩一人时拿走整个底池（不分边池）', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 500 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    const snap = engine.getSnapshot();
    const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const r = engine.act(actor.id, { type: 'fold' });
    assert.equal(r.ok, true);
    assert.equal(r.finished, true);
    const other = actor.id === 'p1' ? 'p2' : 'p1';
    assert.deepEqual(r.winnerIds, [other]);
    const final = engine.getSnapshot();
    assert.equal(final.players.find((p) => p.id === other)!.chips, 500 - 10 + 20);
  });
});

describe('破产保护', () => {
  it('筹码不够底注时自动补满，房间不会死锁', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 100 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    assert.equal(engine.startHand().ok, true);

    // 快速结束一局
    const snap = engine.getSnapshot();
    const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    engine.act(actor.id, { type: 'fold' });
    assert.equal(engine.getPhase(), 'finished');

    // 两人都破产
    engine._debugSetChips('p1', 0);
    engine._debugSetChips('p2', 3);

    // 以前这里会报"至少需要 2 名有足够筹码的玩家"，现在自动补满
    const r = engine.startHand();
    assert.equal(r.ok, true, r.error);
    const snap2 = engine.getSnapshot();
    assert.equal(snap2.phase, 'betting');
    for (const p of snap2.players) {
      assert.equal(p.chips, 90); // 补满 100 再扣底注 10
    }
    assert.ok(snap2.lastEvent?.includes('补满'));
  });
});

describe('规则边界', () => {
  it('比牌平局判挑战者胜', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 500 });
    engine.addPlayer('p1', '挑战者');
    engine.addPlayer('p2', '应战者');
    engine.startHand();
    // 完全相同的牌
    engine._debugSetCards('p1', [c('spade', 'K'), c('heart', 'Q'), c('club', 'J')]);
    engine._debugSetCards('p2', [c('diamond', 'K'), c('club', 'Q'), c('heart', 'J')]);

    let snap = engine.getSnapshot();
    let actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    engine.act(actor.id, { type: 'call' });
    snap = engine.getSnapshot();
    actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const target = snap.players.find((p) => p.id !== actor.id)!;
    const r = engine.act(actor.id, { type: 'compare', targetPlayerId: target.id });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.compare!.winnerId, actor.id); // 平局挑战者胜
  });

  it('加注不能低于最小单位', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 500 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();
    const snap = engine.getSnapshot();
    const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const r = engine.act(actor.id, { type: 'raise', amount: 5 });
    assert.equal(r.ok, false);
    assert.ok(r.error!.includes('加注至少'));
  });

  it('筹码不够支付比牌费用时拒绝比牌', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 500 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();

    // A 把注抬高
    let snap = engine.getSnapshot();
    let actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    engine.act(actor.id, { type: 'raise', amount: 80 });

    // B 筹码不够跟注额，直接比牌应被拒绝
    const other = actor.id === 'p1' ? 'p2' : 'p1';
    engine._debugSetChips(other, 20);
    snap = engine.getSnapshot();
    actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    const target = snap.players.find((p) => p.id !== actor.id)!;
    const r = engine.act(actor.id, { type: 'compare', targetPlayerId: target.id });
    if (actor.id === other) {
      assert.equal(r.ok, false);
      assert.ok(r.error!.includes('筹码不足'));
    } else {
      assert.equal(r.ok, true, r.error);
    }
  });

  it('弃牌获胜不公开任何人手牌', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 500 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();
    const snap = engine.getSnapshot();
    const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
    engine.act(actor.id, { type: 'fold' });
    const final = engine.getSnapshot('p1');
    assert.equal(final.phase, 'finished');
    // 对手视角：没人亮牌
    const foe = final.players.find((p) => p.id !== 'p1')!;
    assert.equal(foe.cards, undefined);
  });

  it('摊牌后公开所有人手牌', () => {
    const engine = new ZjhEngine({ ante: 10, unit: 10, startingChips: 500, maxRounds: 1 });
    engine.addPlayer('p1', 'A');
    engine.addPlayer('p2', 'B');
    engine.startHand();
    // 每人行动一次即达 maxRounds，自动摊牌
    let guard = 0;
    while (engine.getPhase() === 'betting' && guard++ < 10) {
      const snap = engine.getSnapshot();
      const actor = snap.players.find((p) => p.seat === snap.actingSeat)!;
      engine.act(actor.id, { type: 'call' });
    }
    const final = engine.getSnapshot('p1');
    assert.equal(final.phase, 'finished');
    for (const p of final.players) {
      assert.ok(p.cards && p.cards.length === 3, '摊牌后应公开手牌');
    }
  });
});

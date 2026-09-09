/**
 * 命令行演示：3 人自动打一局（随机行动）
 * 运行：npm run demo
 */

import { ZjhEngine } from './engine';
import { cardToString } from './cards';

const engine = new ZjhEngine({
  ante: 10,
  unit: 10,
  startingChips: 300,
  openMultiplier: 2,
});

engine.addPlayer('p1', '玩家甲');
engine.addPlayer('p2', '玩家乙');
engine.addPlayer('p3', '玩家丙');

const start = engine.startHand();
if (!start.ok) {
  console.error('开局失败', start.error);
  process.exit(1);
}

console.log('========== 炸金花 演示局 ==========');
printSnap();

let steps = 0;
while (engine.getPhase() === 'betting' && steps < 40) {
  steps++;
  const snap = engine.getSnapshot();
  const actor = snap.players.find((p) => p.seat === snap.actingSeat);
  if (!actor) break;

  const legal = engine.getLegalActions(actor.id);
  // 简单策略：有 30% 看牌，20% 弃牌，10% 加注，其余跟注；可比牌时 15% 比牌
  let action: { type: any; amount?: number; targetPlayerId?: string };

  if (!actor.looked && legal.includes('look') && Math.random() < 0.35) {
    action = { type: 'look' };
  } else if (legal.includes('compare') && Math.random() < 0.15) {
    const target = snap.players.find(
      (p) => p.id !== actor.id && (p.status === 'active' || p.status === 'allin'),
    );
    if (target) {
      action = { type: 'compare', targetPlayerId: target.id };
    } else {
      action = { type: 'call' };
    }
  } else if (legal.includes('fold') && Math.random() < 0.18) {
    action = { type: 'fold' };
  } else if (legal.includes('raise') && Math.random() < 0.12) {
    action = { type: 'raise', amount: 10 };
  } else {
    action = { type: 'call' };
  }

  const r = engine.act(actor.id, action);
  console.log(
    `\n→ ${actor.name} 执行 [${action.type}]${r.ok ? '' : ' 失败: ' + r.error}`,
  );
  if (r.compare) {
    console.log(
      `  比牌结果: ${r.compare.winnerId} 胜 (${r.compare.challengerHand.label} vs ${r.compare.targetHand.label})`,
    );
  }
  printSnap(actor.id);

  if (r.finished) {
    console.log('\n***** 本局结束 *****');
    console.log('胜者:', r.winnerIds);
    break;
  }
}

function printSnap(viewerId?: string) {
  const s = engine.getSnapshot(viewerId);
  console.log(
    `\n[阶段=${s.phase}] 轮次=${s.currentRound} 底池=${s.pot} 当前注=${s.currentBet} 行动座位=${s.actingSeat}`,
  );
  console.log(`事件: ${s.lastEvent}`);
  for (const p of s.players) {
    const cards =
      p.cards && p.cards.length
        ? p.cards.map(cardToString).join(' ') + ` (${p.handLabel})`
        : '(暗牌)';
    console.log(
      `  座位${p.seat} ${p.name.padEnd(6)} 筹码=${String(p.chips).padStart(4)} 本轮注=${p.betThisRound} 状态=${p.status} 看牌=${p.looked} ${cards}`,
    );
  }
}

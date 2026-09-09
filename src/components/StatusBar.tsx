'use client';

import type { GameSnapshot } from '@/game/engine';

interface Props {
  snapshot: GameSnapshot | null;
  actingName: string | null;
  humanId: string;
  online?: boolean;
  roomCode?: string;
  tip?: string;
}

export function StatusBar({
  snapshot,
  actingName,
  humanId,
  online,
  roomCode,
  tip,
}: Props) {
  const me = snapshot?.players.find((p) => p.id === humanId);
  const phaseLabel =
    snapshot?.phase === 'betting'
      ? '下注中'
      : snapshot?.phase === 'finished' || snapshot?.phase === 'showdown'
        ? '本局结束'
        : snapshot
          ? '进行中'
          : '未开局';

  return (
    <div className="status-bar">
      <div className="status-row">
        <span className="status-pill">{phaseLabel}</span>
        {snapshot && (
          <span className="status-pill muted">
            第 {snapshot.currentRound}/{snapshot.config.maxRounds} 轮 · 池 {snapshot.pot}
          </span>
        )}
        {snapshot && snapshot.currentBet > 0 && (
          <span className="status-pill muted">注 {snapshot.currentBet}</span>
        )}
        {roomCode && <span className="status-pill code">{roomCode}</span>}
      </div>
      <div className="status-row secondary">
        {snapshot?.phase === 'betting' && actingName && (
          <span>
            行动：<strong>{actingName}</strong>
            {me && snapshot.actingSeat === me.seat ? '（请出牌）' : ''}
          </span>
        )}
        {me && snapshot?.phase === 'betting' && (
          <span className="ml-2">
            你：{me.looked ? '已看牌' : '闷牌中'}
            {me.betThisRound > 0 ? ` · 本轮 ${me.betThisRound}` : ''}
          </span>
        )}
        {online && <span className="ml-2 online-dot">联网</span>}
      </div>
      {tip && <p className="status-tip">{tip}</p>}
    </div>
  );
}

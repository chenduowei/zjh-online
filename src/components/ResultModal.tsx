'use client';

import { sound } from '@/lib/sound';

export interface RankRow {
  id: string;
  name: string;
  chips: number;
  delta: number;
  handLabel?: string;
  isWinner: boolean;
}

export interface SessionStats {
  hands: number;
  wins: number;
  losses: number;
  net: number;
}

interface Props {
  open: boolean;
  isWin: boolean;
  humanDelta: number;
  pot: number;
  rankings: RankRow[];
  session: SessionStats;
  onNext: () => void;
  onExit: () => void;
}

export function ResultModal({
  open,
  isWin,
  humanDelta,
  pot,
  rankings,
  session,
  onNext,
  onExit,
}: Props) {
  if (!open) return null;

  const deltaText =
    humanDelta > 0 ? `+${humanDelta}` : humanDelta < 0 ? `${humanDelta}` : '0';

  return (
    <div className="result-mask" role="dialog" aria-modal="true">
      <div className={`result-card ${isWin ? 'win' : 'lose'}`}>
        <div className="result-badge">{isWin ? '胜利' : '惜败'}</div>
        <p className="result-title">
          {isWin ? '本局获胜' : '本局未胜'}
        </p>
        <p className={`result-delta ${humanDelta >= 0 ? 'up' : 'down'}`}>
          {deltaText}
          <span className="result-delta-unit">筹码</span>
        </p>
        <p className="result-pot">本局底池 {pot}</p>

        <div className="result-table">
          <div className="result-thead">
            <span>名次</span>
            <span>玩家</span>
            <span>牌型</span>
            <span>盈亏</span>
          </div>
          {rankings.map((r, i) => (
            <div
              key={r.id}
              className={`result-row ${r.isWinner ? 'winner' : ''} ${r.delta < 0 ? 'neg' : ''}`}
            >
              <span className="rank-no">{i + 1}</span>
              <span className="rank-name">{r.name}</span>
              <span className="rank-hand">{r.handLabel || '—'}</span>
              <span className={`rank-delta ${r.delta >= 0 ? 'up' : 'down'}`}>
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </span>
            </div>
          ))}
        </div>

        <div className="session-stats">
          <div>
            <em>{session.hands}</em>
            <span>已玩</span>
          </div>
          <div>
            <em>{session.wins}</em>
            <span>胜</span>
          </div>
          <div>
            <em>{session.losses}</em>
            <span>负</span>
          </div>
          <div>
            <em className={session.net >= 0 ? 'up' : 'down'}>
              {session.net > 0 ? `+${session.net}` : session.net}
            </em>
            <span>累计</span>
          </div>
        </div>

        <div className="result-actions">
          <button
            className="btn btn-gold flex-1"
            onClick={() => {
              sound.click();
              onNext();
            }}
          >
            再来一局
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              sound.click();
              onExit();
            }}
          >
            离开
          </button>
        </div>
      </div>
    </div>
  );
}

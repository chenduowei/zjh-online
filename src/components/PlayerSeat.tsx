'use client';

import type { PublicPlayerView } from '@/game/engine';
import { PokerCard } from './PokerCard';

interface Props {
  player: PublicPlayerView;
  isActing: boolean;
  isDealer: boolean;
  isSelf: boolean;
}

const STATUS: Record<string, string> = {
  waiting: '等待',
  active: '在局',
  folded: '弃牌',
  allin: '全下',
  out: '出局',
};

export function PlayerSeat({ player, isActing, isDealer, isSelf }: Props) {
  const showFace = Boolean(player.cards?.length);
  const dim = player.status === 'folded' || player.status === 'out';

  return (
    <div
      className={`seat ${isActing ? 'acting' : ''} ${dim ? 'dim' : ''} ${isSelf ? 'seat-self' : ''}`}
    >
      {isActing && <span className="seat-badge">行动</span>}

      {/* 手牌在上，信息在下，避免挡桌心 */}
      <div className="flex gap-1.5">
        {showFace
          ? player.cards!.map((c, i) => (
              <PokerCard
                key={c.id}
                card={c}
                small={!isSelf}
                dealDelay={i * 70}
                reveal
              />
            ))
          : [0, 1, 2].map((i) => (
              <PokerCard
                key={i}
                faceDown
                small={!isSelf}
                dealDelay={i * 70}
              />
            ))}
      </div>

      {player.handLabel && showFace && (
        <div className="hand-label">{player.handLabel}</div>
      )}

      <div className="seat-meta">
        <div className="seat-name">
          {isDealer && <span className="dealer-dot">庄</span>}
          <span className="name-text">
            {isSelf ? '你' : player.name}
          </span>
          {!player.looked && player.status === 'active' && (
            <span className="tag-muted">闷</span>
          )}
          {player.looked && player.status === 'active' && (
            <span className="tag-look">看</span>
          )}
        </div>
        <div className="seat-stats">
          <span className="chip">{player.chips.toLocaleString()}</span>
          {player.betThisRound > 0 && (
            <span className="bet-pill">+{player.betThisRound}</span>
          )}
          {(player.status === 'folded' ||
            player.status === 'out' ||
            player.status === 'allin') && (
            <span className="tag-status">{STATUS[player.status]}</span>
          )}
        </div>
      </div>
    </div>
  );
}

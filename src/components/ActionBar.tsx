'use client';

import type { Action, ActionType, PublicPlayerView } from '@/game/engine';
import { sound } from '@/lib/sound';

interface Props {
  legal: ActionType[];
  disabled: boolean;
  phase: string;
  players: PublicPlayerView[];
  humanId: string;
  isHost?: boolean;
  onAct: (action: Action) => void;
  onNextHand: () => void;
  onStart: () => void;
}

export function ActionBar({
  legal,
  disabled,
  phase,
  players,
  humanId,
  isHost = true,
  onAct,
  onNextHand,
  onStart,
}: Props) {
  const raiseSteps = [10, 20, 50];

  const fire = (a: Action, sfx?: () => void) => {
    sfx?.();
    sound.click();
    onAct(a);
  };

  if (phase === 'idle' || !phase) {
    return (
      <div className="flex justify-center">
        <button
          className="btn btn-gold px-10"
          onClick={() => {
            sound.click();
            onStart();
          }}
        >
          开始游戏
        </button>
      </div>
    );
  }

  if (phase === 'finished' || phase === 'showdown') {
    return (
      <div className="flex justify-center gap-3">
        {isHost ? (
          <button
            className="btn btn-gold px-10"
            onClick={() => {
              sound.click();
              onNextHand();
            }}
          >
            再来一局
          </button>
        ) : (
          <span className="text-sm text-white/50">等待房主开下一局…</span>
        )}
      </div>
    );
  }

  const targets = players.filter(
    (p) => p.id !== humanId && (p.status === 'active' || p.status === 'allin'),
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {legal.includes('look') && (
        <button className="btn btn-look" disabled={disabled} onClick={() => fire({ type: 'look' }, () => sound.look())}>
          看牌
        </button>
      )}
      {legal.includes('fold') && (
        <button className="btn btn-fold" disabled={disabled} onClick={() => fire({ type: 'fold' }, () => sound.fold())}>
          弃牌
        </button>
      )}
      {legal.includes('call') && (
        <button className="btn btn-call" disabled={disabled} onClick={() => fire({ type: 'call' }, () => sound.chip())}>
          跟注
        </button>
      )}
      {legal.includes('raise') && (
        <div className="raise-group" aria-label="加注金额">
          {raiseSteps.map((amount) => (
            <button
              key={amount}
              className="btn btn-raise"
              disabled={disabled}
              onClick={() => fire({ type: 'raise', amount }, () => sound.raise())}
            >
              加 +{amount}
            </button>
          ))}
        </div>
      )}
      {legal.includes('allin') && (
        <button className="btn btn-allin" disabled={disabled} onClick={() => fire({ type: 'allin' }, () => sound.raise())}>
          全下
        </button>
      )}
      {legal.includes('compare') &&
        targets.map((t) => (
          <button
            key={t.id}
            className="btn btn-compare"
            disabled={disabled}
            onClick={() => fire({ type: 'compare', targetPlayerId: t.id }, () => sound.compare())}
          >
            比·{t.name}
          </button>
        ))}
      {legal.length === 0 && <span className="text-sm text-white/40">等待其他玩家…</span>}
    </div>
  );
}

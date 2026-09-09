'use client';

import type { CompareResult, PublicPlayerView } from '@/game/engine';
import { PokerCard } from './PokerCard';
import { sound } from '@/lib/sound';

interface Props {
  result: CompareResult | null;
  players: PublicPlayerView[];
  humanId: string;
  onClose: () => void;
}

function displayName(id: string, players: PublicPlayerView[], humanId: string) {
  const player = players.find((item) => item.id === id);
  return id === humanId ? '你' : player?.name ?? '对手';
}

export function CompareModal({ result, players, humanId, onClose }: Props) {
  if (!result) return null;

  const challengerName = displayName(result.challengerId, players, humanId);
  const targetName = displayName(result.targetId, players, humanId);
  const winnerName = displayName(result.winnerId, players, humanId);
  const wonByHuman = result.winnerId === humanId;

  return (
    <div className="compare-mask" role="dialog" aria-modal="true" aria-label="比牌结果">
      <div className={`compare-card ${wonByHuman ? 'human-win' : 'human-lose'}`}>
        <p className="compare-kicker">亮牌比牌</p>
        <h2>比牌</h2>

        <div className="compare-hands">
          <div className={`compare-side ${result.winnerId === result.challengerId ? 'winner' : ''}`}>
            <p className="compare-name">{challengerName}</p>
            <div className="compare-cards">
              {result.challengerHand.cards.map((card, index) => (
                <PokerCard key={card.id} card={card} dealDelay={index * 90} reveal />
              ))}
            </div>
            <p className="compare-label">{result.challengerHand.label}</p>
          </div>

          <div className="compare-versus" aria-hidden="true">VS</div>

          <div className={`compare-side ${result.winnerId === result.targetId ? 'winner' : ''}`}>
            <p className="compare-name">{targetName}</p>
            <div className="compare-cards">
              {result.targetHand.cards.map((card, index) => (
                <PokerCard key={card.id} card={card} dealDelay={index * 90 + 120} reveal />
              ))}
            </div>
            <p className="compare-label">{result.targetHand.label}</p>
          </div>
        </div>

        <p className="compare-result">{winnerName} 胜</p>
        <button
          className="btn btn-gold w-full"
          onClick={() => {
            sound.click();
            onClose();
          }}
        >
          继续
        </button>
      </div>
    </div>
  );
}

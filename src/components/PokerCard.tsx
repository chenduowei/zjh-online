'use client';

import type { Card } from '@/game/cards';
import { SUIT_SYMBOL, isRed } from '@/game/cards';

interface Props {
  card?: Card;
  faceDown?: boolean;
  small?: boolean;
  dealDelay?: number;
  reveal?: boolean;
}

export function PokerCard({ card, faceDown, small, dealDelay = 0, reveal = false }: Props) {
  if (faceDown || !card) {
    return (
      <div
        className={`poker-card back ${small ? 'sm' : ''} deal-in`}
        style={{ animationDelay: `${dealDelay}ms` }}
        aria-label="暗牌"
      />
    );
  }

  const red = isRed(card.suit);
  return (
    <div
      className={`poker-card ${red ? 'red' : ''} ${small ? 'sm' : ''} ${reveal ? 'card-reveal' : 'deal-in'}`}
      style={{ animationDelay: `${dealDelay}ms` }}
      aria-label={`${card.rank}${SUIT_SYMBOL[card.suit]}`}
    >
      <div className="card-corner">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="card-center">{SUIT_SYMBOL[card.suit]}</div>
      <div className="card-corner card-corner-br">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </div>
  );
}

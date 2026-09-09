'use client';

import { useEffect } from 'react';

interface Props {
  text: string | null;
  tone?: 'info' | 'win' | 'lose';
  onDone?: () => void;
  ms?: number;
}

export function Toast({ text, tone = 'info', onDone, ms = 2200 }: Props) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => onDone?.(), ms);
    return () => clearTimeout(t);
  }, [text, ms, onDone]);

  if (!text) return null;

  return (
    <div className={`game-toast ${tone}`} role="status">
      {text}
    </div>
  );
}

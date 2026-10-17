'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ZjhEngine,
  publicCompareFor,
  type Action,
  type ActionType,
  type CompareResult,
  type GameSnapshot,
  type PublicCompareResult,
  type PublicPlayerView,
} from '@/game/engine';
import { evaluateHand, HandType } from '@/game/rules';
import { sound } from '@/lib/sound';
import type { RankRow, SessionStats } from '@/components/ResultModal';

const HUMAN_ID = 'human';
const AI_IDS = ['ai1', 'ai2'] as const;

function createEngine() {
  return new ZjhEngine({
    ante: 10,
    unit: 10,
    startingChips: 1000,
    openMultiplier: 2,
    compareAfterRound: 1,
    minPlayers: 2,
    maxPlayers: 6,
  });
}

function handStrength(cards: NonNullable<PublicPlayerView['cards']>): number {
  const h = evaluateHand(cards);
  const typeScore = (h.type as number) / HandType.ThreeOfAKind;
  const top = h.ranks[0] ?? 7;
  const rankScore = (top - 2) / 12;
  return Math.min(1, typeScore * 0.75 + rankScore * 0.25);
}

function pickAiAction(
  eng: ZjhEngine,
  actorId: string,
  legal: ActionType[],
  others: PublicPlayerView[],
): Action {
  const priv = eng.getSnapshot(actorId);
  const me = priv.players.find((p) => p.id === actorId);
  if (!me) return { type: 'fold' };

  if (!me.looked && legal.includes('look') && Math.random() < 0.75) {
    return { type: 'look' };
  }

  let strength = 0.32;
  if (me.looked && me.cards && me.cards.length === 3) {
    strength = handStrength(me.cards);
  }

  const targets = others.filter(
    (p) => p.status === 'active' || p.status === 'allin',
  );

  if (strength < 0.28 && legal.includes('fold') && Math.random() < 0.65) {
    return { type: 'fold' };
  }
  if (strength < 0.4 && legal.includes('fold') && Math.random() < 0.35) {
    return { type: 'fold' };
  }
  if (strength >= 0.72 && legal.includes('raise') && Math.random() < 0.55) {
    return { type: 'raise', amount: 10 };
  }
  if (strength >= 0.88 && legal.includes('allin') && Math.random() < 0.12) {
    return { type: 'allin' };
  }
  if (strength >= 0.58 && legal.includes('compare') && targets.length && Math.random() < 0.28) {
    const t = targets[Math.floor(Math.random() * targets.length)]!;
    return { type: 'compare', targetPlayerId: t.id };
  }
  if (legal.includes('call')) return { type: 'call' };
  if (legal.includes('raise')) return { type: 'raise', amount: 10 };
  if (legal.includes('allin')) return { type: 'allin' };
  if (legal.includes('fold')) return { type: 'fold' };
  return { type: 'call' };
}

export interface HandResultState {
  open: boolean;
  isWin: boolean;
  humanDelta: number;
  pot: number;
  rankings: RankRow[];
}

const emptySession = (): SessionStats => ({
  hands: 0,
  wins: 0,
  losses: 0,
  net: 0,
});

export function useGame() {
  const engineRef = useRef<ZjhEngine | null>(null);
  const chipsAtHandStart = useRef<Record<string, number>>({});
  const potAtEnd = useRef(0);

  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [message, setMessage] = useState('选择模式开始');
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'win' | 'lose' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [handResult, setHandResult] = useState<HandResultState | null>(null);
  const [compareReveal, setCompareReveal] = useState<PublicCompareResult | null>(null);
  const [session, setSession] = useState<SessionStats>(emptySession);

  const prevActing = useRef<number>(-1);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inHand = useRef(false);
  const resultShownForHand = useRef(false);

  useEffect(() => {
    sound.setEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!inHand.current) return;
      e.preventDefault();
      e.returnValue = '对局进行中，刷新或关闭将丢失当前进度。';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const clearAi = () => {
    if (aiTimer.current) {
      clearTimeout(aiTimer.current);
      aiTimer.current = null;
    }
  };

  const showToast = useCallback((text: string, tone: 'info' | 'win' | 'lose' = 'info') => {
    setToast({ text, tone });
  }, []);

  const buildResult = useCallback((eng: ZjhEngine, snap: GameSnapshot) => {
    if (resultShownForHand.current) return;
    resultShownForHand.current = true;

    const rankings: RankRow[] = snap.players
      .map((p) => {
        const before = chipsAtHandStart.current[p.id] ?? p.chips;
        const delta = p.chips - before;
        return {
          id: p.id,
          name: p.id === HUMAN_ID ? '你' : p.name,
          chips: p.chips,
          delta,
          handLabel: p.handLabel,
          isWinner: Boolean(snap.winnerIds?.includes(p.id)),
        };
      })
      .sort((a, b) => b.delta - a.delta || b.chips - a.chips);

    const human = rankings.find((r) => r.id === HUMAN_ID);
    const humanDelta = human?.delta ?? 0;
    const isWin = Boolean(snap.winnerIds?.includes(HUMAN_ID));
    // 结算后底池会归零，使用本局每人的累计投入得到准确展示值。
    const pot = snap.players.reduce((total, player) => total + player.totalBet, 0) || potAtEnd.current;

    setHandResult({
      open: true,
      isWin,
      humanDelta,
      pot: pot || snap.pot,
      rankings,
    });

    setSession((prev) => ({
      hands: prev.hands + 1,
      wins: prev.wins + (isWin ? 1 : 0),
      losses: prev.losses + (!isWin ? 1 : 0),
      net: prev.net + humanDelta,
    }));

    if (isWin) {
      showToast(`胜利 · 本局 ${humanDelta >= 0 ? '+' : ''}${humanDelta}`, 'win');
    } else {
      showToast(`未胜 · 本局 ${humanDelta}`, 'lose');
    }
  }, [showToast]);

  const refresh = useCallback((eng: ZjhEngine) => {
    const snap = eng.getSnapshot(HUMAN_ID);
    setSnapshot(snap);
    inHand.current =
      snap.phase === 'betting' ||
      snap.phase === 'dealing' ||
      snap.phase === 'ante';

    if (
      snap.phase === 'betting' &&
      snap.actingSeat !== prevActing.current &&
      snap.players.find((p) => p.seat === snap.actingSeat)?.id === HUMAN_ID
    ) {
      sound.yourTurn();
      showToast('轮到你了', 'info');
    }
    prevActing.current = snap.actingSeat;

    if (snap.phase === 'finished' || snap.phase === 'showdown') {
      inHand.current = false;
      if (snap.winnerIds?.includes(HUMAN_ID)) sound.win();
      else if (snap.winnerIds?.length) sound.lose();
      buildResult(eng, snap);
    }
  }, [buildResult, showToast]);

  const captureChips = (eng: ZjhEngine) => {
    const snap = eng.getSnapshot();
    const map: Record<string, number> = {};
    // 开局后筹码已扣底注，用「当前筹码 + 已投入」近似手开始权益
    for (const p of snap.players) {
      map[p.id] = p.chips + p.totalBet;
    }
    chipsAtHandStart.current = map;
    potAtEnd.current = snap.pot;
    resultShownForHand.current = false;
  };

  const scheduleAi = useCallback(
    (eng: ZjhEngine) => {
      clearAi();
      const snap = eng.getSnapshot(HUMAN_ID);
      if (snap.phase !== 'betting') return;
      const actor = snap.players.find((p) => p.seat === snap.actingSeat);
      if (!actor || actor.id === HUMAN_ID) return;

      setBusy(true);
      aiTimer.current = setTimeout(() => {
        const legal = eng.getLegalActions(actor.id);
        if (!legal.length) {
          setBusy(false);
          return;
        }
        const others = snap.players.filter((p) => p.id !== actor.id);
        const action = pickAiAction(eng, actor.id, legal, others);

        if (action.type === 'look') sound.look();
        else if (action.type === 'fold') sound.fold();
        else if (action.type === 'raise' || action.type === 'allin') sound.raise();
        else if (action.type === 'compare') sound.compare();
        else if (action.type === 'call') sound.chip();

        const result = eng.act(actor.id, action);
        if (result.ok) {
          setMessage(eng.getSnapshot().lastEvent ?? '');
          if (result.compare) {
            // AI 之间比牌不对人类亮牌，只展示结果
            const pub = publicCompareFor(HUMAN_ID, result.compare);
            const w = snap.players.find((p) => p.id === pub.winnerId)?.name;
            const line =
              pub.challengerHand && pub.targetHand
                ? `比牌 ${pub.challengerHand.label} vs ${pub.targetHand.label} → ${w} 胜`
                : `比牌 → ${w} 胜`;
            setMessage(line);
            showToast(line, 'info');
            setCompareReveal(pub);
          } else if (action.type === 'fold') {
            showToast(`${actor.name} 弃牌`, 'info');
          }
        }
        refresh(eng);
        setBusy(false);
        scheduleAi(eng);
      }, 550 + Math.random() * 500);
    },
    [refresh, showToast],
  );

  const startGame = useCallback(() => {
    clearAi();
    setHandResult(null);
    const eng = createEngine();
    eng.addPlayer(HUMAN_ID, '你');
    eng.addPlayer(AI_IDS[0], '龙');
    eng.addPlayer(AI_IDS[1], '虎');
    const r = eng.startHand();
    if (!r.ok) {
      setMessage(r.error ?? '开局失败');
      return;
    }
    engineRef.current = eng;
    captureChips(eng);
    sound.start();
    setMessage(eng.getSnapshot().lastEvent ?? '游戏开始');
    showToast('新局开始 · 底注已扣除', 'info');
    refresh(eng);
    scheduleAi(eng);
  }, [refresh, scheduleAi, showToast]);

  const nextHand = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) {
      startGame();
      return;
    }
    clearAi();
    setHandResult(null);
    const r = eng.startHand();
    if (!r.ok) {
      setMessage(r.error ?? '无法开局');
      showToast(r.error ?? '无法开局', 'lose');
      return;
    }
    captureChips(eng);
    sound.start();
    setMessage(eng.getSnapshot().lastEvent ?? '新一局');
    showToast('新局开始', 'info');
    refresh(eng);
    scheduleAi(eng);
  }, [refresh, scheduleAi, startGame, showToast]);

  const act = useCallback(
    (action: Action) => {
      const eng = engineRef.current;
      if (!eng || busy) return;
      const r = eng.act(HUMAN_ID, action);
      if (!r.ok) {
        setMessage(r.error ?? '操作失败');
        showToast(r.error ?? '操作失败', 'lose');
        return;
      }
      if (r.compare) {
        const snap = eng.getSnapshot();
        const pub = publicCompareFor(HUMAN_ID, r.compare);
        const w = snap.players.find((p) => p.id === pub.winnerId)?.name;
        const line = `比牌：${pub.challengerHand!.label} vs ${pub.targetHand!.label} → ${w} 胜`;
        setMessage(line);
        showToast(line, pub.winnerId === HUMAN_ID ? 'win' : 'lose');
        setCompareReveal(pub);
      } else {
        setMessage(eng.getSnapshot().lastEvent ?? '');
        if (action.type === 'look') showToast('已看牌 · 后续按 2 倍注', 'info');
        if (action.type === 'fold') showToast('你弃牌了', 'lose');
        if (action.type === 'raise') showToast('加注', 'info');
        if (action.type === 'allin') showToast('全下！', 'info');
      }
      refresh(eng);
      scheduleAi(eng);
    },
    [busy, refresh, scheduleAi, showToast],
  );

  const legalActions: ActionType[] =
    snapshot && engineRef.current ? engineRef.current.getLegalActions(HUMAN_ID) : [];

  const toggleSound = () => setSoundOn((v) => !v);

  const actingName =
    snapshot?.players.find((p) => p.seat === snapshot.actingSeat)?.name ?? null;

  const clearToast = useCallback(() => setToast(null), []);

  const dismissResult = useCallback(() => {
    setHandResult((h) => (h ? { ...h, open: false } : null));
  }, []);

  const dismissCompareReveal = useCallback(() => setCompareReveal(null), []);

  const resetSession = useCallback(() => {
    setSession(emptySession());
    setHandResult(null);
    engineRef.current = null;
    setSnapshot(null);
  }, []);

  return {
    snapshot,
    message,
    toast,
    clearToast,
    busy,
    legalActions,
    startGame,
    nextHand,
    act,
    humanId: HUMAN_ID,
    soundOn,
    toggleSound,
    actingName,
    handResult,
    compareReveal,
    dismissCompareReveal,
    session,
    dismissResult,
    resetSession,
  };
}

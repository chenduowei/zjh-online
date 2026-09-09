'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Action, ActionType, CompareResult } from '@/game/engine';
import type { RoomState } from '@/game/room';
import { sound } from '@/lib/sound';

export function useOnline() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [legal, setLegal] = useState<ActionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareReveal, setCompareReveal] = useState<CompareResult | null>(null);
  const lastCompareKey = useRef<string | null>(null);

  const ensureSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;
    const s = io({ path: '/socket.io', autoConnect: true });
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('room:state', (payload: { state: RoomState; legal: ActionType[] }) => {
      setState(payload.state);
      setLegal(payload.legal ?? []);
      const compare = payload.state.lastCompare;
      if (compare) {
        const key = [
          compare.challengerId,
          compare.targetId,
          compare.winnerId,
          ...compare.challengerHand.cards.map((card) => card.id),
          ...compare.targetHand.cards.map((card) => card.id),
        ].join(':');
        if (lastCompareKey.current !== key) {
          lastCompareKey.current = key;
          setCompareReveal(compare);
        }
      } else {
        lastCompareKey.current = null;
      }
    });
    return s;
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!playerId || !state) return;
      if (state.phase === 'lobby' && state.players.length <= 1) return;
      e.preventDefault();
      e.returnValue = '离开或刷新将断开房间连接。';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state, playerId]);

  const createRoom = useCallback(
    (name: string) => {
      setBusy(true);
      setError(null);
      const s = ensureSocket();
      s.emit('room:create', { name, maxPlayers: 6 }, (res: { ok: boolean; error?: string; playerId?: string; state?: RoomState }) => {
        setBusy(false);
        if (!res?.ok) {
          setError(res?.error ?? '无法连接服务器：请用 npm start 启动本服务（勿只用 next dev）');
          return;
        }
        setPlayerId(res.playerId!);
        setState(res.state!);
        setLegal([]);
        setCompareReveal(null);
        lastCompareKey.current = null;
        sound.click();
      });
      // 超时提示
      setTimeout(() => {
        setBusy((b) => {
          if (b) setError('连接超时：请确认已用 npm start 启动，且对方与你使用同一公网地址');
          return false;
        });
      }, 4000);
    },
    [ensureSocket],
  );

  const joinRoom = useCallback(
    (code: string, name: string) => {
      setBusy(true);
      setError(null);
      const s = ensureSocket();
      s.emit(
        'room:join',
        { code, name },
        (res: { ok: boolean; error?: string; playerId?: string; state?: RoomState }) => {
          setBusy(false);
          if (!res?.ok) {
            setError(res?.error ?? '加入失败');
            return;
          }
        setPlayerId(res.playerId!);
        setState(res.state!);
        setCompareReveal(null);
        lastCompareKey.current = null;
          sound.click();
        },
      );
      setTimeout(() => {
        setBusy((b) => {
          if (b) setError('连接超时：请确认已用 npm start 启动，且对方与你使用同一公网地址');
          return false;
        });
      }, 4000);
    },
    [ensureSocket],
  );

  const startGame = useCallback(() => {
    socketRef.current?.emit('room:start', {}, (r: { ok: boolean; error?: string }) => {
      if (!r?.ok) setError(r?.error ?? '开始失败');
      else sound.start();
    });
  }, []);

  const nextHand = useCallback(() => {
    socketRef.current?.emit('room:next', {}, (r: { ok: boolean; error?: string }) => {
      if (!r?.ok) setError(r?.error ?? '开局失败');
      else sound.start();
    });
  }, []);

  const act = useCallback((action: Action) => {
    socketRef.current?.emit('game:act', action, (r: { ok: boolean; error?: string }) => {
      if (!r?.ok) setError(r?.error ?? '操作失败');
    });
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState(null);
    setPlayerId(null);
    setLegal([]);
    setConnected(false);
    setCompareReveal(null);
    lastCompareKey.current = null;
  }, []);

  return {
    connected,
    playerId,
    state,
    legal,
    error,
    busy,
    compareReveal,
    createRoom,
    joinRoom,
    startGame,
    nextHand,
    act,
    leave,
    dismissCompareReveal: () => setCompareReveal(null),
    setError,
  };
}

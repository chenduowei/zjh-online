'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Action, ActionType, PublicCompareResult } from '@/game/engine';
import type { RoomState } from '@/game/room';
import { sound } from '@/lib/sound';

/** 断线重连凭证，存本地 */
const SESSION_KEY = 'zjh-online:session';
interface Session {
  roomCode: string;
  playerId: string;
  token: string;
  name: string;
}
function loadSession(): Session | null {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? (JSON.parse(s) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* 忽略 */
  }
}
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 忽略 */
  }
}

export function useOnline() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [legal, setLegal] = useState<ActionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareReveal, setCompareReveal] = useState<PublicCompareResult | null>(null);
  const lastCompareKey = useRef<string | null>(null);
  /** 是否已在房间里（用于区分“首次连接”和“断线重连”） */
  const joinedRef = useRef(false);
  /** 连接超时提示定时器：ack 回来或卸载时清理 */
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBusyTimer = useCallback(() => {
    if (busyTimer.current) {
      clearTimeout(busyTimer.current);
      busyTimer.current = null;
    }
  }, []);

  const ensureSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;
    const s = io({ path: '/socket.io', autoConnect: true });
    socketRef.current = s;
    s.on('connect', () => {
      setConnected(true);
      // 断线重连：凭 token 自动回座
      const session = loadSession();
      if (session && !joinedRef.current) {
        joinedRef.current = true; // 先占位，失败再放开
        s.emit(
          'room:join',
          { code: session.roomCode, name: session.name, token: session.token },
          (res: { ok: boolean; error?: string; playerId?: string; state?: RoomState }) => {
            if (res?.ok) {
              setPlayerId(res.playerId!);
              setState(res.state!);
              setLegal([]);
              setCompareReveal(null);
              lastCompareKey.current = null;
              sound.click();
            } else {
              joinedRef.current = false;
              // 房间已不在，重连凭证作废
              if (res?.error === '房间不存在') clearSession();
            }
          },
        );
      }
    });
    s.on('disconnect', () => setConnected(false));
    s.on('room:state', (payload: { state: RoomState; legal: ActionType[] }) => {
      setState(payload.state);
      setLegal(payload.legal ?? []);
      const compare = payload.state.lastCompare;
      if (compare) {
        // 旁观者收不到手牌，key 兼容缺失情况
        const key = [
          compare.challengerId,
          compare.targetId,
          compare.winnerId,
          compare.challengerHand ? compare.challengerHand.cards.map((card) => card.id).join(',') : 'x',
          compare.targetHand ? compare.targetHand.cards.map((card) => card.id).join(',') : 'x',
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
      if (busyTimer.current) clearTimeout(busyTimer.current);
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
      s.emit('room:create', { name, maxPlayers: 6 }, (res: { ok: boolean; error?: string; playerId?: string; token?: string; state?: RoomState }) => {
        setBusy(false);
        clearBusyTimer();
        if (!res?.ok) {
          setError(res?.error ?? '无法连接服务器：请用 npm start 启动本服务（勿只用 next dev）');
          return;
        }
        setPlayerId(res.playerId!);
        setState(res.state!);
        setLegal([]);
        setCompareReveal(null);
        lastCompareKey.current = null;
        joinedRef.current = true;
        if (res.token) {
          saveSession({ roomCode: res.state!.code, playerId: res.playerId!, token: res.token, name });
        }
        sound.click();
      });
      // 超时提示
      clearBusyTimer();
      busyTimer.current = setTimeout(() => {
        busyTimer.current = null;
        setBusy((b) => {
          if (b) setError('连接超时：请确认已用 npm start 启动，且对方与你使用同一公网地址');
          return false;
        });
      }, 4000);
    },
    [clearBusyTimer, ensureSocket],
  );

  const joinRoom = useCallback(
    (code: string, name: string) => {
      setBusy(true);
      setError(null);
      const s = ensureSocket();
      // 同一房间有重连凭证则带上，服务端会直接回座
      const session = loadSession();
      const token =
        session && session.roomCode === code.toUpperCase() ? session.token : undefined;
      s.emit(
        'room:join',
        { code, name, token },
        (res: { ok: boolean; error?: string; playerId?: string; token?: string; state?: RoomState }) => {
          setBusy(false);
          clearBusyTimer();
          if (!res?.ok) {
            setError(res?.error ?? '加入失败');
            return;
          }
        setPlayerId(res.playerId!);
        setState(res.state!);
        setCompareReveal(null);
        lastCompareKey.current = null;
        joinedRef.current = true;
        if (res.token) {
          saveSession({ roomCode: code.toUpperCase(), playerId: res.playerId!, token: res.token, name });
        }
          sound.click();
        },
      );
      clearBusyTimer();
      busyTimer.current = setTimeout(() => {
        busyTimer.current = null;
        setBusy((b) => {
          if (b) setError('连接超时：请确认已用 npm start 启动，且对方与你使用同一公网地址');
          return false;
        });
      }, 4000);
    },
    [clearBusyTimer, ensureSocket],
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
    joinedRef.current = false;
    clearSession();
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

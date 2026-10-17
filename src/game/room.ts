/**
 * 房间与多人同步逻辑（服务端 / 共享）
 * 每个房间持有一个 ZjhEngine 实例
 */

import {
  ZjhEngine,
  publicCompareFor,
  type Action,
  type CompareResult,
  type PublicCompareResult,
  type GameSnapshot,
  type GameConfig,
} from './engine';

/** 生成重连凭证；非安全上下文下 crypto.randomUUID 不可用时降级 */
function newToken(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost: boolean;
  /** 重连凭证：只发给本人，绝不广播 */
  token: string;
}

/** 广播给客户端的玩家视图（不含 token） */
export interface PublicRoomPlayer {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: PublicRoomPlayer[];
  maxPlayers: number;
  hostId: string;
  snapshot: GameSnapshot | null;
  lastEvent: string;
  /** 最新一次比牌：当事人可见双方手牌做亮牌演出，旁观者只收结果 */
  lastCompare?: PublicCompareResult;
  config: Partial<GameConfig>;
}

export class GameRoom {
  readonly code: string;
  private hostId: string;
  private players = new Map<string, RoomPlayer>();
  private engine: ZjhEngine | null = null;
  private maxPlayers: number;
  private config: Partial<GameConfig>;
  private lastEvent = '等待玩家加入';
  private lastCompare: CompareResult | undefined;

  constructor(code: string, hostId: string, hostName: string, maxPlayers = 6) {
    this.code = code;
    this.hostId = hostId;
    this.maxPlayers = Math.min(6, Math.max(2, maxPlayers));
    this.config = {
      ante: 10,
      unit: 10,
      startingChips: 1000,
      openMultiplier: 2,
    };
    this.addPlayer(hostId, hostName, true);
  }

  addPlayer(
    id: string,
    name: string,
    isHost = false,
  ): { ok: boolean; error?: string; token?: string } {
    if (this.players.has(id)) {
      const p = this.players.get(id)!;
      p.connected = true;
      p.name = name;
      return { ok: true, token: p.token };
    }
    if (this.players.size >= this.maxPlayers) {
      return { ok: false, error: '房间已满' };
    }
    if (this.engine && this.engine.getPhase() === 'betting') {
      return { ok: false, error: '对局进行中，无法加入' };
    }
    const seat = this.players.size;
    const token = newToken();
    this.players.set(id, {
      id,
      name,
      seat,
      connected: true,
      isHost: isHost || id === this.hostId,
      token,
    });
    this.lastEvent = `${name} 加入了房间`;
    return { ok: true, token };
  }

  /** 取某玩家的重连凭证（仅服务端用，发给本人） */
  playerToken(id: string): string | undefined {
    return this.players.get(id)?.token;
  }

  /** 用凭证找回玩家（重连用），找不到返回 undefined */
  findByToken(token: string): RoomPlayer | undefined {
    if (!token) return undefined;
    for (const p of this.players.values()) {
      if (p.token === token) return p;
    }
    return undefined;
  }

  /** 凭 token 重连回座：不断座位、不丢筹码 */
  reconnect(token: string, name?: string): RoomPlayer | null {
    const p = this.findByToken(token);
    if (!p) return null;
    p.connected = true;
    if (name) p.name = name;
    this.lastEvent = `${p.name} 重新连接`;
    return p;
  }

  /** 当前轮到行动的玩家 id；不在下注阶段时返回 null */
  getActingPlayerId(): string | null {
    if (!this.engine || this.engine.getPhase() !== 'betting') return null;
    const snap = this.engine.getSnapshot();
    if (snap.actingSeat < 0) return null;
    return snap.players.find((p) => p.seat === snap.actingSeat)?.id ?? null;
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    this.lastEvent = `${p.name} 离开了`;
    // 若在大厅且非对局，直接移除
    if (!this.engine || this.engine.getPhase() === 'idle' || this.engine.getPhase() === 'finished') {
      this.players.delete(id);
      // 重排座位
      let i = 0;
      for (const pl of this.players.values()) {
        pl.seat = i++;
      }
    }
    // 房主离开则转让
    if (id === this.hostId) {
      const next = [...this.players.values()].find((x) => x.connected);
      if (next) {
        this.hostId = next.id;
        next.isHost = true;
      }
    }
  }

  startGame(byId: string): { ok: boolean; error?: string } {
    if (byId !== this.hostId) return { ok: false, error: '只有房主可以开始' };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < 2) return { ok: false, error: '至少需要 2 名玩家' };

    this.engine = new ZjhEngine(this.config);
    this.lastCompare = undefined;
    // 按座位排序加入
    const ordered = connected.sort((a, b) => a.seat - b.seat);
    for (const p of ordered) {
      this.engine.addPlayer(p.id, p.name);
    }
    const r = this.engine.startHand();
    if (!r.ok) return r;
    this.lastEvent = this.engine.getSnapshot().lastEvent ?? '游戏开始';
    return { ok: true };
  }

  nextHand(byId: string): { ok: boolean; error?: string } {
    if (byId !== this.hostId) return { ok: false, error: '只有房主可以开下一局' };
    if (!this.engine) return { ok: false, error: '尚未开始' };
    const r = this.engine.startHand();
    if (!r.ok) return r;
    this.lastCompare = undefined;
    this.lastEvent = this.engine.getSnapshot().lastEvent ?? '新一局';
    return { ok: true };
  }

  act(playerId: string, action: Action): { ok: boolean; error?: string; finished?: boolean } {
    if (!this.engine) return { ok: false, error: '对局未开始' };
    const r = this.engine.act(playerId, action);
    if (r.ok) {
      this.lastEvent = this.engine.getSnapshot().lastEvent ?? '';
      if (r.compare) {
        this.lastCompare = r.compare;
        this.lastEvent = `比牌结果已出`;
      }
    }
    return r;
  }

  getPublicState(viewerId?: string): RoomState {
    const players = [...this.players.values()].sort((a, b) => a.seat - b.seat);
    let phase: RoomPhase = 'lobby';
    let snapshot: GameSnapshot | null = null;
    if (this.engine) {
      const gp = this.engine.getPhase();
      if (gp === 'finished' || gp === 'showdown') phase = 'finished';
      else if (gp !== 'idle') phase = 'playing';
      snapshot = this.engine.getSnapshot(viewerId);
    }
    return {
      code: this.code,
      phase,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        connected: p.connected,
        isHost: p.id === this.hostId,
      })),
      maxPlayers: this.maxPlayers,
      hostId: this.hostId,
      snapshot,
      lastEvent: this.lastEvent,
      lastCompare: this.lastCompare
        ? publicCompareFor(viewerId, this.lastCompare)
        : undefined,
      config: this.config,
    };
  }

  getLegalActions(playerId: string) {
    if (!this.engine) return [];
    return this.engine.getLegalActions(playerId);
  }

  isEmpty(): boolean {
    return [...this.players.values()].every((p) => !p.connected) || this.players.size === 0;
  }
}

/** 生成 6 位房间码 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

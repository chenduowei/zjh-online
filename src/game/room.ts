/**
 * 房间与多人同步逻辑（服务端 / 共享）
 * 每个房间持有一个 ZjhEngine 实例
 */

import {
  ZjhEngine,
  type Action,
  type CompareResult,
  type GameSnapshot,
  type GameConfig,
} from './engine';

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: RoomPlayer[];
  maxPlayers: number;
  hostId: string;
  snapshot: GameSnapshot | null;
  lastEvent: string;
  /** 最新一次公开的比牌，用于双方同步亮牌演出 */
  lastCompare?: CompareResult;
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

  addPlayer(id: string, name: string, isHost = false): { ok: boolean; error?: string } {
    if (this.players.has(id)) {
      const p = this.players.get(id)!;
      p.connected = true;
      p.name = name;
      return { ok: true };
    }
    if (this.players.size >= this.maxPlayers) {
      return { ok: false, error: '房间已满' };
    }
    if (this.engine && this.engine.getPhase() === 'betting') {
      return { ok: false, error: '对局进行中，无法加入' };
    }
    const seat = this.players.size;
    this.players.set(id, {
      id,
      name,
      seat,
      connected: true,
      isHost: isHost || id === this.hostId,
    });
    this.lastEvent = `${name} 加入了房间`;
    return { ok: true };
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
        ...p,
        isHost: p.id === this.hostId,
      })),
      maxPlayers: this.maxPlayers,
      hostId: this.hostId,
      snapshot,
      lastEvent: this.lastEvent,
      lastCompare: this.lastCompare,
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

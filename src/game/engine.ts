/**
 * 炸金花 - 单局状态机
 *
 * 支持：
 * - 2~6 人
 * - 底注 → 发牌 → 轮流行动（看牌/闷牌下注/跟注/加注/比牌/弃牌）
 * - 闷注与看注倍率（默认闷 1x，看 2x）
 * - 比牌淘汰，最后一人或摊牌结算
 */

import type { Card } from './cards';
import { freshShuffledDeck, dealToPlayers } from './deck';
import type { HandResult } from './rules';
import { evaluateHand, compareHands } from './rules';

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export type PlayerStatus = 'waiting' | 'active' | 'folded' | 'allin' | 'out';
export type GamePhase =
  | 'idle'       // 未开始
  | 'ante'       // 收底注
  | 'dealing'    // 发牌中
  | 'betting'    // 下注轮
  | 'showdown'   // 摊牌比大小
  | 'finished';   // 本局结束

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  chips: number;
  /** 本局手牌（仅自己或摊牌后可见） */
  cards: Card[];
  /** 本轮已下注额 */
  betThisRound: number;
  /** 本局累计下注 */
  totalBet: number;
  status: PlayerStatus;
  /** 是否已看牌（看牌后下注按看注倍率） */
  looked: boolean;
  /** 是否已全下 */
  isAllIn: boolean;
}

export interface GameConfig {
  /** 底注 */
  ante: number;
  /** 最小加注单位（闷注基数） */
  unit: number;
  /** 看牌后下注倍率，默认 2 */
  openMultiplier: number;
  /** 起始筹码 */
  startingChips: number;
  /** 最少/最多人数 */
  minPlayers: number;
  maxPlayers: number;
  /** 第几轮后才允许比牌，默认 1（第一轮下注完成后） */
  compareAfterRound: number;
  /** 最大下注轮数；达到上限后自动摊牌，避免牌局无限持续 */
  maxRounds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  ante: 10,
  unit: 10,
  openMultiplier: 2,
  startingChips: 1000,
  minPlayers: 2,
  maxPlayers: 6,
  compareAfterRound: 1,
  maxRounds: 12,
};

export type ActionType =
  | 'look'      // 看牌
  | 'fold'      // 弃牌
  | 'call'      // 跟注
  | 'raise'     // 加注（amount = 额外加的部分，不含跟注）
  | 'compare'   // 比牌（targetPlayerId）
  | 'allin';     // 全下

export interface Action {
  type: ActionType;
  /** raise 时的加注额（在跟注基础上额外加的金额，按当前身份的倍率单位） */
  amount?: number;
  /** compare 时的目标玩家 id */
  targetPlayerId?: string;
}

export interface CompareResult {
  challengerId: string;
  targetId: string;
  winnerId: string;
  loserId: string;
  /** 比牌双方的牌在此时已公开，可用于前端亮牌演出 */
  challengerHand: HandResult;
  targetHand: HandResult;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** 若发生比牌，记录结果 */
  compare?: CompareResult;
  /** 本局是否刚结束 */
  finished?: boolean;
  winnerIds?: string[];
}

export interface PublicPlayerView {
  id: string;
  name: string;
  seat: number;
  chips: number;
  betThisRound: number;
  totalBet: number;
  status: PlayerStatus;
  looked: boolean;
  isAllIn: boolean;
  /** 仅在 finished / showdown 或自己视角时有牌 */
  cards?: Card[];
  handLabel?: string;
}

export interface GameSnapshot {
  phase: GamePhase;
  pot: number;
  currentBet: number;       // 当前轮最高注（按闷注口径）
  currentRound: number;     // 从 1 开始
  dealerSeat: number;
  actingSeat: number;       // 当前行动座位，-1 表示无人
  players: PublicPlayerView[];
  config: GameConfig;
  /** 最近一次事件描述（便于 UI 展示） */
  lastEvent?: string;
  winnerIds?: string[];
}

// ─────────────────────────────────────────────
// 引擎主体
// ─────────────────────────────────────────────

export class ZjhEngine {
  private config: GameConfig;
  private phase: GamePhase = 'idle';
  private players: PlayerState[] = [];
  private pot = 0;
  /** 当前轮需要跟到的“闷注口径”金额 */
  private currentBet = 0;
  private currentRound = 0;
  private dealerSeat = 0;
  private actingSeat = -1;
  /** 本轮已经行动过的座位（用于判断一轮是否结束） */
  private actedThisRound = new Set<number>();
  private lastEvent = '';
  private winnerIds: string[] = [];
  private deck: Card[] = [];

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── 房间管理 ────────────────────────────────

  addPlayer(id: string, name: string): boolean {
    if (this.phase !== 'idle') return false;
    if (this.players.length >= this.config.maxPlayers) return false;
    if (this.players.some((p) => p.id === id)) return false;

    const seat = this.players.length;
    this.players.push({
      id,
      name,
      seat,
      chips: this.config.startingChips,
      cards: [],
      betThisRound: 0,
      totalBet: 0,
      status: 'waiting',
      looked: false,
      isAllIn: false,
    });
    this.lastEvent = `${name} 加入游戏`;
    return true;
  }

  removePlayer(id: string): boolean {
    if (this.phase !== 'idle') return false;
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    this.players.splice(idx, 1);
    // 重排座位
    this.players.forEach((p, i) => (p.seat = i));
    return true;
  }

  // ── 开局 ────────────────────────────────────

  startHand(): ActionResult {
    if (this.phase !== 'idle' && this.phase !== 'finished') {
      return { ok: false, error: '当前阶段不能开局' };
    }
    const alive = this.players.filter((p) => p.chips >= this.config.ante);
    if (alive.length < this.config.minPlayers) {
      return { ok: false, error: `至少需要 ${this.config.minPlayers} 名有足够筹码的玩家` };
    }

    // 重置本局状态
    this.pot = 0;
    this.currentBet = 0;
    this.currentRound = 0;
    this.actedThisRound.clear();
    this.winnerIds = [];
    this.phase = 'ante';

    // 只让有筹码的玩家入局
    for (const p of this.players) {
      p.cards = [];
      p.betThisRound = 0;
      p.totalBet = 0;
      p.looked = false;
      p.isAllIn = false;
      if (p.chips >= this.config.ante) {
        p.status = 'active';
      } else {
        p.status = 'out';
      }
    }

    // 收底注
    for (const p of this.activePlayers()) {
      p.chips -= this.config.ante;
      p.totalBet += this.config.ante;
      this.pot += this.config.ante;
    }

    this.phase = 'dealing';
    this.deck = freshShuffledDeck();
    const active = this.activePlayers();
    const { hands } = dealToPlayers(this.deck, active.length, 3);
    active.forEach((p, i) => {
      p.cards = hands[i]!;
    });

    // 庄家下一位开始行动
    this.dealerSeat = this.nextOccupiedSeat(this.dealerSeat);
    this.currentRound = 1;
    this.currentBet = this.config.unit; // 第一轮默认至少跟到 1 个闷注单位
    this.phase = 'betting';
    this.actingSeat = this.nextActiveSeat(this.dealerSeat);
    this.actedThisRound.clear();
    this.lastEvent = `第 ${this.currentRound} 轮开始，底池 ${this.pot}`;

    return { ok: true };
  }

  // ── 行动 ────────────────────────────────────

  act(playerId: string, action: Action): ActionResult {
    if (this.phase !== 'betting') {
      return { ok: false, error: '当前不是下注阶段' };
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: '玩家不存在' };
    if (player.seat !== this.actingSeat) {
      return { ok: false, error: '还没轮到你' };
    }
    if (player.status !== 'active') {
      return { ok: false, error: '你已无法行动' };
    }

    switch (action.type) {
      case 'look':
        return this.doLook(player);
      case 'fold':
        return this.doFold(player);
      case 'call':
        return this.doCall(player);
      case 'raise':
        return this.doRaise(player, action.amount ?? this.config.unit);
      case 'compare':
        return this.doCompare(player, action.targetPlayerId);
      case 'allin':
        return this.doAllIn(player);
      default:
        return { ok: false, error: '未知行动' };
    }
  }

  /** 查询某玩家合法行动 */
  getLegalActions(playerId: string): ActionType[] {
    if (this.phase !== 'betting') return [];
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.seat !== this.actingSeat || player.status !== 'active') {
      return [];
    }

    const actions: ActionType[] = ['fold', 'call', 'raise', 'allin'];
    if (!player.looked) actions.unshift('look');
    if (this.currentRound > this.config.compareAfterRound || this.actedThisRound.size > 0) {
      // 至少有人行动过或过了第一轮后允许比牌
      const targets = this.activePlayers().filter((p) => p.id !== playerId);
      if (targets.length >= 1) actions.push('compare');
    }
    return actions;
  }

  // ── 内部行动实现 ────────────────────────────

  private doLook(player: PlayerState): ActionResult {
    if (player.looked) return { ok: false, error: '已经看过牌了' };
    player.looked = true;
    this.lastEvent = `${player.name} 看牌`;
    // 看牌不消耗行动权，可以继续操作
    return { ok: true };
  }

  private doFold(player: PlayerState): ActionResult {
    player.status = 'folded';
    this.lastEvent = `${player.name} 弃牌`;
    this.actedThisRound.add(player.seat);
    return this.afterAction();
  }

  private doCall(player: PlayerState): ActionResult {
    const need = this.amountToCall(player);
    if (need > player.chips) {
      // 筹码不够则全下
      return this.doAllIn(player);
    }
    player.chips -= need;
    player.betThisRound += need;
    player.totalBet += need;
    this.pot += need;
    this.lastEvent = `${player.name} 跟注 ${need}`;
    this.actedThisRound.add(player.seat);
    return this.afterAction();
  }

  private doRaise(player: PlayerState, extraUnits: number): ActionResult {
    if (extraUnits < this.config.unit) {
      return { ok: false, error: `加注至少 ${this.config.unit}` };
    }
    const callNeed = this.amountToCall(player);
    const raiseAmount = this.toRealAmount(player, extraUnits);
    const totalNeed = callNeed + raiseAmount;
    if (totalNeed > player.chips) {
      return { ok: false, error: '筹码不足，请选择全下' };
    }

    player.chips -= totalNeed;
    player.betThisRound += totalNeed;
    player.totalBet += totalNeed;
    this.pot += totalNeed;

    // 更新当前注（闷注口径）
    const playerUnitBet = this.toUnitAmount(player, player.betThisRound);
    this.currentBet = playerUnitBet;

    this.lastEvent = `${player.name} 加注，当前注 ${this.currentBet}`;
    // 加注后其他人需要重新行动
    this.actedThisRound.clear();
    this.actedThisRound.add(player.seat);
    return this.afterAction();
  }

  private doAllIn(player: PlayerState): ActionResult {
    const all = player.chips;
    if (all <= 0) return { ok: false, error: '没有筹码' };
    player.chips = 0;
    player.betThisRound += all;
    player.totalBet += all;
    this.pot += all;
    player.isAllIn = true;
    player.status = 'allin';

    const unitBet = this.toUnitAmount(player, player.betThisRound);
    if (unitBet > this.currentBet) {
      this.currentBet = unitBet;
      this.actedThisRound.clear();
    }
    this.actedThisRound.add(player.seat);
    this.lastEvent = `${player.name} 全下 ${all}`;
    return this.afterAction();
  }

  private doCompare(player: PlayerState, targetId?: string): ActionResult {
    if (!targetId) return { ok: false, error: '请指定比牌对象' };
    if (this.currentRound < this.config.compareAfterRound && this.actedThisRound.size === 0) {
      return { ok: false, error: '第一轮至少要有人行动后才能比牌' };
    }

    const target = this.players.find((p) => p.id === targetId);
    if (!target || (target.status !== 'active' && target.status !== 'allin')) {
      return { ok: false, error: '目标玩家无法比牌' };
    }
    if (target.id === player.id) return { ok: false, error: '不能和自己比' };

    // 比牌需要先支付当前注（看牌身份）
    const cost = this.amountToCall(player);
    if (cost > player.chips) {
      return { ok: false, error: '筹码不足支付比牌费用' };
    }
    player.chips -= cost;
    player.betThisRound += cost;
    player.totalBet += cost;
    this.pot += cost;

    // 强制双方亮牌比较
    const handA = evaluateHand(player.cards);
    const handB = evaluateHand(target.cards);
    const cmp = compareHands(handA, handB);

    let winnerId: string;
    let loserId: string;
    if (cmp >= 0) {
      // 挑战者赢或平（平则挑战者胜，常见规则）
      winnerId = player.id;
      loserId = target.id;
      target.status = 'out';
    } else {
      winnerId = target.id;
      loserId = player.id;
      player.status = 'out';
    }

    this.lastEvent = `${player.name} 与 ${target.name} 比牌，${this.players.find((p) => p.id === winnerId)!.name} 胜`;
    this.actedThisRound.add(player.seat);

    const result: ActionResult = {
      ok: true,
      compare: {
        challengerId: player.id,
        targetId: target.id,
        winnerId,
        loserId,
        challengerHand: handA,
        targetHand: handB,
      },
    };

    // 检查是否只剩一人
    const stillIn = this.playersInHand();
    if (stillIn.length <= 1) {
      return { ...result, ...this.finishHand(stillIn.map((p) => p.id)) };
    }

    return { ...result, ...this.afterAction() };
  }

  // ── 回合推进 ────────────────────────────────

  private afterAction(): ActionResult {
    const stillIn = this.playersInHand();
    if (stillIn.length <= 1) {
      return this.finishHand(stillIn.map((p) => p.id));
    }

    // 找下一位可行动玩家
    const next = this.nextActiveSeat(this.actingSeat);
    if (next === -1) {
      // 没有人能行动了（全是 allin / out），直接摊牌
      return this.doShowdown();
    }

    // 判断本轮是否所有还在局中的人都已行动且注额对齐
    if (this.isRoundComplete()) {
      if (this.currentRound >= this.config.maxRounds) {
        this.lastEvent = `已到第 ${this.config.maxRounds} 轮，自动摊牌`;
        return this.doShowdown();
      }
      this.currentRound += 1;
      this.currentBet = this.config.unit; // 新一轮重新起注，可简化为继续累积，这里选重新起注更清晰
      // 更常见的玩法是注额跨轮累积，这里采用「每轮独立起注」简化，也可改
      // 为更贴近现实：保持 currentBet，只清空 acted
      // 我们选择：注额跨轮保留，只清空 acted 并重置 betThisRound
      for (const p of this.players) {
        p.betThisRound = 0;
      }
      // currentBet 保持，下一轮要跟到的仍然是这个口径
      // 实际上很多地方每轮重新从 unit 开始，这里用「保留最高注」模式
      this.actedThisRound.clear();
      this.actingSeat = this.nextActiveSeat(this.dealerSeat);
      this.lastEvent = `第 ${this.currentRound} 轮开始，底池 ${this.pot}`;
    } else {
      this.actingSeat = next;
    }

    return { ok: true };
  }

  private isRoundComplete(): boolean {
    const contenders = this.players.filter(
      (p) => p.status === 'active' || p.status === 'allin',
    );
    // 所有 active 玩家都已行动，且他们的 unit 注额 >= currentBet（或已 allin）
    for (const p of contenders) {
      if (p.status === 'allin') continue;
      if (!this.actedThisRound.has(p.seat)) return false;
      const unitBet = this.toUnitAmount(p, p.betThisRound);
      if (unitBet < this.currentBet) return false;
    }
    return true;
  }

  private doShowdown(): ActionResult {
    this.phase = 'showdown';
    const contenders = this.playersInHand();
    if (contenders.length === 0) {
      return this.finishHand([]);
    }
    if (contenders.length === 1) {
      return this.finishHand([contenders[0]!.id]);
    }

    // 多人数摊牌，找最大牌
    const results = contenders.map((p) => ({
      player: p,
      hand: evaluateHand(p.cards),
    }));
    let best = results[0]!;
    const winners: string[] = [best.player.id];
    for (let i = 1; i < results.length; i++) {
      const cmp = compareHands(results[i]!.hand, best.hand);
      if (cmp > 0) {
        best = results[i]!;
        winners.length = 0;
        winners.push(best.player.id);
      } else if (cmp === 0) {
        winners.push(results[i]!.player.id);
      }
    }
    this.lastEvent = `摊牌，获胜者：${winners.map((id) => this.players.find((p) => p.id === id)!.name).join('、')}`;
    return this.finishHand(winners);
  }

  private finishHand(winnerIds: string[]): ActionResult {
    this.phase = 'finished';
    this.winnerIds = winnerIds;
    this.actingSeat = -1;

    if (winnerIds.length === 0) {
      // 极端情况，筹码退回（不应发生）
      this.lastEvent = '流局';
      return { ok: true, finished: true, winnerIds: [] };
    }

    const share = Math.floor(this.pot / winnerIds.length);
    const remainder = this.pot % winnerIds.length;
    winnerIds.forEach((id, i) => {
      const p = this.players.find((pl) => pl.id === id)!;
      p.chips += share + (i === 0 ? remainder : 0);
    });
    this.pot = 0;
    this.lastEvent = `${winnerIds.map((id) => this.players.find((p) => p.id === id)!.name).join('、')} 赢得底池`;

    return { ok: true, finished: true, winnerIds };
  }

  // ── 金额换算（闷/看） ───────────────────────

  /** 玩家当前身份下，跟注还需要支付的真实筹码 */
  private amountToCall(player: PlayerState): number {
    const targetReal = this.toRealAmount(player, this.currentBet);
    const already = player.betThisRound;
    return Math.max(0, targetReal - already);
  }

  /** 把「闷注单位数」转成该玩家实际要付的筹码 */
  private toRealAmount(player: PlayerState, unitAmount: number): number {
    const mult = player.looked ? this.config.openMultiplier : 1;
    return unitAmount * mult;
  }

  /** 把玩家已下的真实筹码转回闷注单位口径 */
  private toUnitAmount(player: PlayerState, realAmount: number): number {
    const mult = player.looked ? this.config.openMultiplier : 1;
    return Math.floor(realAmount / mult);
  }

  // ── 座位工具 ────────────────────────────────

  private activePlayers(): PlayerState[] {
    return this.players.filter((p) => p.status === 'active');
  }

  private playersInHand(): PlayerState[] {
    return this.players.filter(
      (p) => p.status === 'active' || p.status === 'allin',
    );
  }

  private nextOccupiedSeat(from: number): number {
    if (this.players.length === 0) return 0;
    return (from + 1) % this.players.length;
  }

  private nextActiveSeat(from: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const seat = (from + i) % n;
      const p = this.players[seat];
      if (p && p.status === 'active') return seat;
    }
    return -1;
  }

  // ── 快照（给 UI） ───────────────────────────

  getSnapshot(viewerId?: string): GameSnapshot {
    return {
      phase: this.phase,
      pot: this.pot,
      currentBet: this.currentBet,
      currentRound: this.currentRound,
      dealerSeat: this.dealerSeat,
      actingSeat: this.actingSeat,
      config: { ...this.config },
      lastEvent: this.lastEvent,
      winnerIds: this.winnerIds.length ? [...this.winnerIds] : undefined,
      players: this.players.map((p) => {
        // 闷牌：未看牌时即使是自己也只显示暗牌；结束/摊牌才全亮
        const isViewer = p.id === viewerId;
        const gameOver =
          this.phase === 'finished' || this.phase === 'showdown';
        const showCards =
          gameOver || (isViewer && p.looked);
        const view: PublicPlayerView = {
          id: p.id,
          name: p.name,
          seat: p.seat,
          chips: p.chips,
          betThisRound: p.betThisRound,
          totalBet: p.totalBet,
          status: p.status,
          looked: p.looked,
          isAllIn: p.isAllIn,
        };
        if (showCards && p.cards.length === 3) {
          view.cards = [...p.cards];
          view.handLabel = evaluateHand(p.cards).label;
        }
        return view;
      }),
    };
  }

  /** 仅测试用：直接设置玩家手牌 */
  _debugSetCards(playerId: string, cards: Card[]): void {
    const p = this.players.find((pl) => pl.id === playerId);
    if (p) p.cards = cards;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getPot(): number {
    return this.pot;
  }
}

/**
 * Next.js + Socket.IO 多人服务器
 * 启动: npm run dev:online
 * 需要 Node 22+（--experimental-strip-types）
 */

import { createServer } from 'http';
import { parse } from 'url';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';
import next from 'next';
import { Server } from 'socket.io';

/** 行动超时：30 秒无人操作则自动弃牌，防止挂机卡死整局 */
const ACTION_TIMEOUT_MS = 30_000;
/** 房间空置多久后销毁（给断线重连留窗口） */
const ROOM_TTL_MS = 5 * 60_000;
/** 房间无任何活动多久后销毁（防僵尸房间内存泄漏） */
const ROOM_IDLE_MS = 2 * 60 * 60_000;
/** 昵称最大长度 */
const MAX_NAME_LEN = 20;
/** 单 socket 动作限流：每秒最多 5 次 */
const ACTS_PER_SECOND = 5;

/** 清洗昵称：去首尾空格、限长 */
function cleanName(name, fallback) {
  const s = String(name ?? fallback).trim().slice(0, MAX_NAME_LEN);
  return s || fallback;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

const rooms = new Map();

async function loadRoomClass() {
  // tsx 运行时可直接加载 TypeScript
  const roomPath = pathToFileURL(path.join(__dirname, 'src/game/room.ts')).href;
  const mod = await import(roomPath);
  return mod;
}

app.prepare().then(async () => {
  const { GameRoom, generateRoomCode } = await loadRoomClass();

  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // CORS：默认全开方便局域网联机；公网部署时用 CORS_ORIGIN 收紧（逗号分隔多个域名）
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : '*';
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin },
    path: '/socket.io',
  });

  /** 房间最后活动时间（建房/加入/开始/行动都会刷新） */
  const roomActiveAt = new Map(); // roomCode -> timestamp
  function touchRoom(roomCode) {
    roomActiveAt.set(roomCode, Date.now());
  }

  function broadcastRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    touchRoom(roomCode);
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.roomCode === roomCode && socket.data.playerId) {
        socket.emit('room:state', {
          state: room.getPublicState(socket.data.playerId),
          legal: room.getLegalActions(socket.data.playerId),
        });
      }
    }
    armActionTimer(roomCode);
  }

  // ── 行动超时：每次广播后重置倒计时 ──
  const actionTimers = new Map(); // roomCode -> timeout
  function clearActionTimer(roomCode) {
    const t = actionTimers.get(roomCode);
    if (t) {
      clearTimeout(t);
      actionTimers.delete(roomCode);
    }
  }
  function armActionTimer(roomCode) {
    clearActionTimer(roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;
    const actingId = room.getActingPlayerId();
    if (!actingId) return; // 不在下注阶段，无需倒计时
    actionTimers.set(
      roomCode,
      setTimeout(() => {
        actionTimers.delete(roomCode);
        const r = rooms.get(roomCode);
        if (!r) return;
        // 超时后仍轮到同一人且仍在下注阶段 → 自动弃牌
        if (r.getActingPlayerId() === actingId) {
          console.log(`[超时] 房间 ${roomCode} 玩家 ${actingId} 30s 未行动，自动弃牌`);
          r.act(actingId, { type: 'fold' });
          broadcastRoom(roomCode);
        }
      }, ACTION_TIMEOUT_MS),
    );
  }

  // ── 房间 TTL ──
  // 1) 全员断线 5 分钟后销毁，给 token 重连留窗口
  // 2) 2 小时无任何活动直接销毁，防僵尸房间内存泄漏
  const roomEmptySince = new Map(); // roomCode -> timestamp
  function destroyRoom(roomCode, reason) {
    rooms.delete(roomCode);
    roomEmptySince.delete(roomCode);
    roomActiveAt.delete(roomCode);
    clearActionTimer(roomCode);
    console.log(`[清理] 房间 ${roomCode} 已销毁（${reason}）`);
  }
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.isEmpty()) {
        const since = roomEmptySince.get(code) ?? now;
        roomEmptySince.set(code, since);
        if (now - since > ROOM_TTL_MS) destroyRoom(code, '全员断线超时');
      } else {
        roomEmptySince.delete(code);
        const activeAt = roomActiveAt.get(code) ?? now;
        if (now - activeAt > ROOM_IDLE_MS) destroyRoom(code, '2 小时无活动');
      }
    }
  }, 60_000).unref();

  // ── 动作限流：每 socket 滑动窗口计数 ──
  function checkRateLimit(socket) {
    const now = Date.now();
    const times = (socket.data.actTimes ??= []);
    while (times.length > 0 && now - times[0] > 1000) times.shift();
    if (times.length >= ACTS_PER_SECOND) return false;
    times.push(now);
    return true;
  }

  io.on('connection', (socket) => {
    socket.data.playerId = null;
    socket.data.roomCode = null;

    socket.on('room:create', ({ name, maxPlayers }, ack) => {
      try {
        // 玩家身份与 socket 解耦：断线重连不再丢失座位
        const playerId = randomUUID();
        let roomCode = generateRoomCode();
        for (let i = 0; i < 10 && rooms.has(roomCode); i++) {
          roomCode = generateRoomCode(); // 极低概率碰撞，重抽
        }
        const room = new GameRoom(roomCode, playerId, cleanName(name, '房主'), maxPlayers || 6);
        rooms.set(roomCode, room);
        touchRoom(roomCode);
        socket.data.playerId = playerId;
        socket.data.roomCode = roomCode;
        socket.join(roomCode);
        const state = room.getPublicState(playerId);
        if (typeof ack === 'function')
          ack({ ok: true, playerId, token: room.playerToken(playerId), state });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: String(e) });
      }
    });

    socket.on('room:join', ({ code: roomCode, name, token }, ack) => {
      const room = rooms.get(String(roomCode || '').toUpperCase());
      if (!room) {
        if (typeof ack === 'function') ack({ ok: false, error: '房间不存在' });
        return;
      }
      const safeName = cleanName(name, '玩家');
      // 凭 token 重连回座
      let playerId;
      let playerToken;
      let reconnected = false;
      if (token) {
        const p = room.reconnect(String(token), safeName);
        if (p) {
          playerId = p.id;
          playerToken = p.token;
          reconnected = true;
        }
      }
      if (!playerId) {
        playerId = randomUUID();
        const r = room.addPlayer(playerId, safeName);
        if (!r.ok) {
          if (typeof ack === 'function') ack({ ok: false, error: r.error });
          return;
        }
        playerToken = r.token;
      }
      socket.data.playerId = playerId;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      if (typeof ack === 'function')
        ack({
          ok: true,
          playerId,
          token: playerToken,
          reconnected,
          state: room.getPublicState(playerId),
        });
      broadcastRoom(room.code);
    });

    socket.on('room:start', (_, ack) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return;
      const r = room.startGame(socket.data.playerId);
      if (typeof ack === 'function') ack(r);
      broadcastRoom(room.code);
    });

    socket.on('room:next', (_, ack) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return;
      const r = room.nextHand(socket.data.playerId);
      if (typeof ack === 'function') ack(r);
      broadcastRoom(room.code);
    });

    socket.on('game:act', (action, ack) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return;
      if (!checkRateLimit(socket)) {
        if (typeof ack === 'function') ack({ ok: false, error: '操作太频繁，慢一点' });
        return;
      }
      const r = room.act(socket.data.playerId, action);
      if (typeof ack === 'function') ack(r);
      broadcastRoom(room.code);
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      room.removePlayer(socket.data.playerId);
      // 不再立即删房：TTL 扫荡会处理，给 token 重连留 5 分钟窗口
      broadcastRoom(roomCode);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> 炸金花 Online  http://localhost:${port}`);
    console.log(`> 模式: ${dev ? '开发(联网)' : '生产'}`);
  });
});

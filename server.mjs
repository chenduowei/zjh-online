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
import next from 'next';
import { Server } from 'socket.io';

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

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  function broadcastRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.roomCode === roomCode && socket.data.playerId) {
        socket.emit('room:state', {
          state: room.getPublicState(socket.data.playerId),
          legal: room.getLegalActions(socket.data.playerId),
        });
      }
    }
  }

  io.on('connection', (socket) => {
    socket.data.playerId = null;
    socket.data.roomCode = null;

    socket.on('room:create', ({ name, maxPlayers }, ack) => {
      try {
        const playerId = socket.id;
        const roomCode = generateRoomCode();
        const room = new GameRoom(roomCode, playerId, name || '房主', maxPlayers || 6);
        rooms.set(roomCode, room);
        socket.data.playerId = playerId;
        socket.data.roomCode = roomCode;
        socket.join(roomCode);
        const state = room.getPublicState(playerId);
        if (typeof ack === 'function') ack({ ok: true, playerId, state });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: String(e) });
      }
    });

    socket.on('room:join', ({ code: roomCode, name }, ack) => {
      const room = rooms.get(String(roomCode || '').toUpperCase());
      if (!room) {
        if (typeof ack === 'function') ack({ ok: false, error: '房间不存在' });
        return;
      }
      const playerId = socket.id;
      const r = room.addPlayer(playerId, name || '玩家');
      if (!r.ok) {
        if (typeof ack === 'function') ack({ ok: false, error: r.error });
        return;
      }
      socket.data.playerId = playerId;
      socket.data.roomCode = room.code;
      socket.join(room.code);
      if (typeof ack === 'function') ack({ ok: true, playerId, state: room.getPublicState(playerId) });
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
      if (room.isEmpty()) rooms.delete(roomCode);
      else broadcastRoom(roomCode);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> 炸金花 Online  http://localhost:${port}`);
    console.log(`> 模式: ${dev ? '开发(联网)' : '生产'}`);
  });
});

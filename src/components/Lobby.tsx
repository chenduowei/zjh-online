'use client';

import { useState } from 'react';
import { sound } from '@/lib/sound';

interface Props {
  onLocal: () => void;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string, name: string) => void;
  onlineError?: string;
  onlineBusy?: boolean;
}

export function Lobby({ onLocal, onCreateRoom, onJoinRoom, onlineError, onlineBusy }: Props) {
  const [name, setName] = useState('玩家');
  const [code, setCode] = useState('');
  const [tab, setTab] = useState<'home' | 'join'>('home');

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="mb-10 text-center">
        <p className="mb-2 text-[11px] tracking-[0.35em] text-amber-200/40 uppercase">Zha Jin Hua</p>
        <h1 className="text-[2.75rem] font-bold tracking-tight text-amber-300" style={{ textShadow: '0 0 40px rgba(232,197,71,0.25)' }}>
          炸金花
        </h1>
        <p className="mt-2 text-sm text-white/35">经典玩法 · 闷看自由</p>
      </div>

      <div className="panel w-full max-w-md space-y-5">
        <div>
          <label className="mb-1.5 block text-xs text-white/40">昵称</label>
          <input
            className="input"
            value={name}
            maxLength={12}
            onChange={(e) => setName(e.target.value)}
            placeholder="你的昵称"
          />
        </div>

        {tab === 'home' ? (
          <div className="flex flex-col gap-3">
            <button
              className="btn btn-gold w-full py-3.5"
              onClick={() => {
                sound.click();
                onLocal();
              }}
            >
              单机对战 · AI
            </button>
            <button
              className="btn btn-ghost w-full py-3.5"
              disabled={onlineBusy || !name.trim()}
              onClick={() => {
                sound.click();
                onCreateRoom(name.trim() || '玩家');
              }}
            >
              创建房间 · 联网
            </button>
            <button
              className="btn btn-ghost w-full py-3.5"
              onClick={() => {
                sound.click();
                setTab('join');
              }}
            >
              加入房间
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              className="input text-center tracking-[0.3em] uppercase"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="房间码"
            />
            <button
              className="btn btn-gold w-full py-3.5"
              disabled={onlineBusy || code.length < 4}
              onClick={() => {
                sound.click();
                onJoinRoom(code, name.trim() || '玩家');
              }}
            >
              进入房间
            </button>
            <button
              className="btn btn-ghost w-full"
              onClick={() => {
                sound.click();
                setTab('home');
              }}
            >
              返回
            </button>
          </div>
        )}

        {onlineError && (
          <p className="text-center text-sm text-red-400">{onlineError}</p>
        )}
      </div>

      <p className="mt-8 max-w-sm text-center text-[11px] leading-relaxed text-white/30">
        闷注 1× · 看牌后 2× · 比牌淘汰
        <br />
        单机可直接玩 · 联网请用 npm start + 穿透（见 OPEN_SERVER.md）
        <br />
        对局中请尽量不要刷新页面
      </p>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useGame } from '@/hooks/useGame';
import { useOnline } from '@/hooks/useOnline';
import { PlayerSeat } from './PlayerSeat';
import { ActionBar } from './ActionBar';
import { Lobby } from './Lobby';
import { StatusBar } from './StatusBar';
import { ResultModal } from './ResultModal';
import { CompareModal } from './CompareModal';
import { Toast } from './Toast';
import { sound } from '@/lib/sound';

type Mode = 'menu' | 'local' | 'online';

type SeatPosition = { top: string; left: string };

/** 自己的座位已移出牌桌。剩余 1～5 位对手完整环绕桌面。 */
function seatLayoutDesktop(count: number): SeatPosition[] {
  const layouts: Record<number, SeatPosition[]> = {
    1: [{ top: '11%', left: '50%' }],
    2: [
      { top: '11%', left: '22%' },
      { top: '11%', left: '78%' },
    ],
    3: [
      { top: '50%', left: '5%' },
      { top: '10%', left: '50%' },
      { top: '50%', left: '95%' },
    ],
    4: [
      { top: '50%', left: '5%' },
      { top: '10%', left: '27%' },
      { top: '10%', left: '73%' },
      { top: '50%', left: '95%' },
    ],
    5: [
      { top: '50%', left: '5%' },
      { top: '10%', left: '18%' },
      { top: '7%', left: '50%' },
      { top: '10%', left: '82%' },
      { top: '50%', left: '95%' },
    ],
  };
  return layouts[Math.min(5, Math.max(1, count))]!;
}

function seatLayoutMobile(count: number): SeatPosition[] {
  const layouts: Record<number, SeatPosition[]> = {
    1: [{ top: '12%', left: '50%' }],
    2: [
      { top: '11%', left: '20%' },
      { top: '11%', left: '80%' },
    ],
    3: [
      { top: '52%', left: '7%' },
      { top: '10%', left: '50%' },
      { top: '52%', left: '93%' },
    ],
    4: [
      { top: '52%', left: '7%' },
      { top: '12%', left: '25%' },
      { top: '12%', left: '75%' },
      { top: '52%', left: '93%' },
    ],
    5: [
      { top: '51%', left: '6%' },
      { top: '13%', left: '17%' },
      { top: '7%', left: '50%' },
      { top: '13%', left: '83%' },
      { top: '51%', left: '94%' },
    ],
  };
  return layouts[Math.min(5, Math.max(1, count))]!;
}

function useMediaMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return mobile;
}

export function PokerTable() {
  const [mode, setMode] = useState<Mode>('menu');
  const local = useGame();
  const online = useOnline();
  const mobile = useMediaMobile();

  const isOnline = mode === 'online';
  const humanId = isOnline ? online.playerId ?? '' : local.humanId;
  const snapshot = isOnline ? online.state?.snapshot ?? null : local.snapshot;
  const message = isOnline
    ? online.error || online.state?.lastEvent || ''
    : local.message;
  const busy = isOnline ? false : local.busy;
  const legal = isOnline ? online.legal : local.legalActions;
  const phase = isOnline
    ? online.state?.phase === 'lobby'
      ? 'idle'
      : online.state?.phase === 'finished'
        ? 'finished'
        : online.state?.snapshot?.phase ?? 'idle'
    : snapshot?.phase ?? 'idle';

  const players = snapshot?.players ?? [];
  const ordered = humanId
    ? [...players].sort((a, b) => {
        if (a.id === humanId) return -1;
        if (b.id === humanId) return 1;
        return a.seat - b.seat;
      })
    : players;
  const selfPlayer = ordered.find((player) => player.id === humanId);
  const rivals = ordered.filter((player) => player.id !== humanId);
  const layout = (mobile ? seatLayoutMobile : seatLayoutDesktop)(rivals.length);
  const isHost = isOnline ? online.state?.hostId === online.playerId : true;
  const compareReveal = isOnline ? online.compareReveal : local.compareReveal;
  const dismissCompareReveal = isOnline
    ? online.dismissCompareReveal
    : local.dismissCompareReveal;

  const actingName =
    snapshot?.players.find((p) => p.seat === snapshot.actingSeat)?.name ??
    local.actingName;

  const tip =
    isOnline
      ? '联网请勿刷新，否则可能断开房间'
      : snapshot?.phase === 'betting'
        ? '闷牌未看 · 看牌后 2× 注'
        : undefined;

  if (mode === 'menu') {
    return (
      <div className="app-bg">
        <Lobby
          onLocal={() => {
            setMode('local');
            local.startGame();
          }}
          onCreateRoom={(name) => {
            setMode('online');
            online.createRoom(name);
          }}
          onJoinRoom={(code, name) => {
            setMode('online');
            online.joinRoom(code, name);
          }}
          onlineError={online.error ?? undefined}
          onlineBusy={online.busy}
        />
      </div>
    );
  }

  if (isOnline && online.state && online.state.phase === 'lobby') {
    return (
      <div className="app-bg flex min-h-screen flex-col items-center justify-center px-4">
        <div className="panel w-full max-w-md space-y-5">
          <div className="text-center">
            <p className="text-xs text-white/40">房间码（发给同伴）</p>
            <p className="mt-1 text-3xl font-bold tracking-[0.25em] text-amber-300">
              {online.state.code}
            </p>
            <p className="mt-2 text-[11px] text-amber-200/50">请勿刷新本页</p>
          </div>
          <ul className="space-y-2">
            {online.state.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-2.5 text-sm"
              >
                <span>
                  {p.name}
                  {p.id === online.playerId ? '（你）' : ''}
                </span>
                <span className="text-xs text-white/40">
                  {p.isHost ? '房主' : p.connected ? '已连接' : '离线'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {isHost ? (
              <button
                className="btn btn-gold flex-1"
                disabled={online.state.players.filter((p) => p.connected).length < 2}
                onClick={() => {
                  sound.click();
                  online.startGame();
                }}
              >
                开始游戏
              </button>
            ) : (
              <p className="flex-1 text-center text-sm text-white/50">等待房主开始…</p>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                online.leave();
                setMode('menu');
              }}
            >
              离开
            </button>
          </div>
          {online.error && (
            <p className="text-center text-sm text-red-400">{online.error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg table-screen">
      <Toast
        text={local.toast?.text ?? null}
        tone={local.toast?.tone}
        onDone={local.clearToast}
      />

      {!isOnline && local.handResult && (
        <ResultModal
          open={local.handResult.open && !local.compareReveal}
          isWin={local.handResult.isWin}
          humanDelta={local.handResult.humanDelta}
          pot={local.handResult.pot}
          rankings={local.handResult.rankings}
          session={local.session}
          onNext={() => {
            local.dismissResult();
            local.nextHand();
          }}
          onExit={() => {
            local.resetSession();
            setMode('menu');
          }}
        />
      )}

      <CompareModal
        result={compareReveal}
        players={players}
        humanId={humanId}
        onClose={dismissCompareReveal}
      />

      <header className="table-header">
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
            onClick={() => {
              sound.click();
              if (isOnline) online.leave();
              else local.resetSession();
              setMode('menu');
            }}
          >
            退出
          </button>
          <h1 className="text-base font-bold tracking-wide text-amber-300/90">炸金花</h1>
          {!isOnline && local.session.hands > 0 && (
            <span className="session-chip">
              {local.session.wins}胜{local.session.losses}负
              <span className={local.session.net >= 0 ? 'up' : 'down'}>
                {local.session.net >= 0 ? ` +${local.session.net}` : ` ${local.session.net}`}
              </span>
            </span>
          )}
        </div>
        <button
          className={`icon-btn ${local.soundOn ? 'on' : ''}`}
          onClick={() => local.toggleSound()}
        >
          {local.soundOn ? '♪' : '✕'}
        </button>
      </header>

      <StatusBar
        snapshot={snapshot}
        actingName={actingName}
        humanId={humanId}
        online={isOnline}
        roomCode={isOnline ? online.state?.code : undefined}
        tip={tip}
      />

      <div className={`table-wrap ${mobile ? 'mobile' : ''}`}>
        <div className="table-felt" />
        <div className="deck-stack" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="pot-zone pot-center">
          <div className="pot-label">底池</div>
          <div className="pot-amount" key={snapshot?.pot ?? 0}>
            <span className="pot-chip-stack" aria-hidden="true"><i /><i /><i /></span>
            {snapshot?.pot ?? 0}
          </div>
          {snapshot && snapshot.currentBet > 0 && (
            <div className="pot-bet">当前注 {snapshot.currentBet}</div>
          )}
        </div>

        {rivals.map((p, i) => {
          const pos = layout[i] ?? { top: '50%', left: '50%' };
          return (
            <div
              key={p.id}
              className="seat-anchor rival"
              style={{ top: pos.top, left: pos.left }}
            >
              <PlayerSeat
                player={p}
                isActing={snapshot?.actingSeat === p.seat}
                isDealer={snapshot?.dealerSeat === p.seat}
                isSelf={false}
              />
            </div>
          );
        })}
      </div>

      {selfPlayer && (
        <section className="player-zone" aria-label="你的手牌">
          <span className="player-zone-title">你的手牌</span>
          <PlayerSeat
            player={selfPlayer}
            isActing={snapshot?.actingSeat === selfPlayer.seat}
            isDealer={snapshot?.dealerSeat === selfPlayer.seat}
            isSelf
          />
        </section>
      )}

      {message ? (
        <div className="event-strip" title={message}>
          {message}
        </div>
      ) : (
        <div className="event-strip event-strip-empty" />
      )}

      <footer className="table-footer">
        <ActionBar
          legal={legal}
          disabled={
            busy ||
            snapshot?.phase !== 'betting' ||
            Boolean(local.handResult?.open)
          }
          phase={
            snapshot?.phase === 'finished' || snapshot?.phase === 'showdown'
              ? 'finished'
              : snapshot?.phase ?? (phase === 'finished' ? 'finished' : 'idle')
          }
          players={players}
          humanId={humanId}
          isHost={isHost}
          onAct={isOnline ? online.act : local.act}
          onNextHand={isOnline ? online.nextHand : local.nextHand}
          onStart={isOnline ? online.startGame : local.startGame}
        />
      </footer>
    </div>
  );
}

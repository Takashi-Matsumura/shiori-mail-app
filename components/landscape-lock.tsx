"use client";

import { useEffect, useState } from "react";
import { ShioriLogo } from "@/components/shiori-logo";
import { currentPath, lockAndGoToLogin } from "@/lib/client/lock";

// components/portrait-only.tsx の案内と同じ条件。あちらは CSS で出し分けるので、ここでは JS で同じ向きを見る
const LANDSCAPE_PHONE = "(orientation: landscape) and (max-height: 500px) and (pointer: coarse)";
const LOCK_AFTER_SEC = 10;

// 残り時間の輪。半径 44 の円周
const RING = 2 * Math.PI * 44;

/**
 * ログイン後の画面で、スマホを横向きにしたときに出す栞の CM。そのまま 10 秒たつとロックする。
 * ロックボタンを探さなくても、スマホを横に倒しておけばロックできる。縦向きに戻せば取りやめて、そのまま続けられる。
 * ログイン画面などでは、これまでどおり PortraitOnly の案内だけが出る(こちらはその上に重ねる)。
 */
export function LandscapeLock() {
  // 横向きでないときは null。横向きの間は、残りの秒数
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(LANDSCAPE_PHONE);
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      setRemaining(null);
    };
    const start = () => {
      // 画面が消えている間はタイマーが止まることがあるので、経過は時刻で測る
      const deadline = Date.now() + LOCK_AFTER_SEC * 1000;
      const tick = () => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setRemaining(left);
        if (left === 0) {
          clearInterval(timer);
          void lockAndGoToLogin(currentPath());
        }
      };
      tick();
      timer = setInterval(tick, 250);
    };
    const onChange = () => (mq.matches ? start() : stop());
    if (mq.matches) start();
    mq.addEventListener("change", onChange);
    return () => {
      clearInterval(timer);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  if (remaining === null) return null;
  const locking = remaining === 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shiori Mail"
      className="fixed inset-0 z-[101] flex items-center justify-center gap-10 bg-background px-[max(1.5rem,env(safe-area-inset-left))] py-6"
    >
      {/* 栞の図案と、残り時間の輪 */}
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent-soft)" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING}
            // 輪が満ちていく。1 秒ごとの値の間は、なめらかにつなぐ
            strokeDashoffset={RING * (remaining / LOCK_AFTER_SEC)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <ShioriLogo size={64} />
        </div>
      </div>

      <div className="flex min-w-0 max-w-md flex-col gap-3">
        <p className="text-2xl font-semibold tracking-tight">Shiori Mail</p>
        <p className="text-base leading-relaxed">
          メールは、<span className="text-accent">栞</span>が先に読んでおきます。
        </p>
        <p className="text-xs leading-relaxed text-muted">要約・仕分け・予定の抜き出しを、AI の相棒「栞」が手伝う、自分専用のメーラー。</p>
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          {locking ? (
            "ロックしています…"
          ) : (
            <>
              <span className="font-mono text-sm tabular-nums text-foreground">{remaining}</span> 秒後にロックします。縦向きに戻すと、そのまま続けられます。
            </>
          )}
        </p>
      </div>
    </div>
  );
}

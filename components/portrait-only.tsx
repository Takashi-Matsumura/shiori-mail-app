/**
 * スマホを横向きにしたときに画面を覆う案内。Web ページからは画面の向きを固定できない
 * (iPhone の Safari には手段がなく、Android もフルスクリーンかホーム画面のアプリでしか効かない)ので、縦向きに戻してもらう。
 * 出すのは、横向き・高さ 500px 以下・指で操作する端末のときだけ。PC のウィンドウを低くしても出ない。
 */
export function PortraitOnly() {
  return (
    <div className="fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-3 bg-background p-6 text-center text-muted [@media(orientation:landscape)_and_(max-height:500px)_and_(pointer:coarse)]:flex">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </svg>
      <p className="font-medium text-foreground">縦向きでお使いください</p>
      <p className="text-xs">Shiori Mail のスマホ表示は、縦向きの画面に合わせて作っています。</p>
    </div>
  );
}

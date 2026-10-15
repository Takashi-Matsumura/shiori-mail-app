/**
 * 設定の欄を開いたり畳んだりするボタン。文字の代わりに山形の矢印を出し、開いているときは上向きにする。
 * 読み上げとマウスを乗せたときには、何を開くのかを言葉で伝える。
 */
export function DisclosureButton({
  open,
  onToggle,
  controls,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  /** 開閉する中身の id */
  controls: string;
  /** 欄の名前(「メールアカウント」など) */
  label: string;
}) {
  const text = `${label}を${open ? "畳む" : "開く"}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={text}
      title={text}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

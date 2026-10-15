// app/icon.svg と同じ栞の図案。画面の中ではテーマカラーに合わせたいので、色を固定した SVG ファイルではなく文字色(text-accent)で描く。

export function ShioriLogo({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      <path strokeWidth="28" d="M150 92 A28 28 0 0 1 178 64 H334 A28 28 0 0 1 362 92 V444 L256 364 L150 444 Z" />
      <path
        strokeWidth="22"
        d="M256 136 C261 176 274 189 314 194 C274 199 261 212 256 252 C251 212 238 199 198 194 C238 189 251 176 256 136 Z"
      />
    </svg>
  );
}

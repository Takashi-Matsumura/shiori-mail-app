import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 記号だけのボタンなので、読み上げとマウスを乗せたときの説明に使う */
  label: string;
  /** solid: テーマの色のガラス玉 / glass: 透明 / jelly: テーマの色の半透明 */
  tone?: "solid" | "glass" | "jelly";
  size?: "lg" | "md" | "sm";
};

const SIZES = {
  lg: "size-16 [&_svg]:size-7",
  md: "size-13 [&_svg]:size-6",
  sm: "size-11 [&_svg]:size-5",
};

/** アクア風の正円ボタン。見た目は globals.css の .aqua に置いてある。 */
export function AquaButton({ label, tone = "solid", size = "md", className = "", children, ...rest }: Props) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`aqua ${tone === "solid" ? "" : `aqua-${tone}`} ${SIZES[size]} ${className}`}
      {...rest}
    >
      <span className="flex items-center justify-center">{children}</span>
    </button>
  );
}

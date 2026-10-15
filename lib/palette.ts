// テーマカラー(配色)の一覧。色そのものは app/globals.css の [data-palette] ごとに定義してある。
// 選んだ配色はこのブラウザの localStorage に保存し、<html data-palette> で切り替える。

export const PALETTES = [
  { id: "wakatake", name: "若竹と蔵書印", yomi: "わかたけとぞうしょいん", swatch: ["#f5f6f2", "#4f6e58", "#e5ede6"] },
  { id: "enji", name: "臙脂の栞", yomi: "えんじのしおり", swatch: ["#f8f3f1", "#8c3346", "#f4e3e6"] },
  { id: "fuji", name: "藤の閲覧室", yomi: "ふじのえつらんしつ", swatch: ["#f6f4f8", "#66548f", "#ebe6f4"] },
  { id: "sakuranezu", name: "桜鼠と貸出票", yomi: "さくらねずとかしだしひょう", swatch: ["#faf5f5", "#a84d65", "#f8e6ea"] },
  // id は以前の呼び名(深緑)のまま。変えると、この配色を選んでいたブラウザの設定が既定に戻ってしまう
  { id: "fukamidori", name: "納戸色と書庫", yomi: "なんどいろとしょこ", swatch: ["#f6f5f1", "#0f5f6e", "#e1eff1"] },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export const DEFAULT_PALETTE: PaletteId = "wakatake";
export const PALETTE_STORAGE_KEY = "palette";

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}

/**
 * 最初の描画の前に、保存してある配色を <html> に付ける。
 * React の読み込みを待つと、既定の配色が一瞬見えてから切り替わってしまうため、<head> の中で同期的に実行する。
 */
export const PALETTE_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});if(${JSON.stringify(
  PALETTES.map((p) => p.id),
)}.indexOf(p)>=0)document.documentElement.setAttribute("data-palette",p)}catch(e){}})()`;

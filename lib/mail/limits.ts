// 添付の上限。画面(先に止める)とサーバ(本当に止める)の両方で使う。
// Gmail などは 1 通 25MB まで。添付は送るときに base64 で約 4/3 倍に膨らむので、元のファイルの合計はそれより小さく抑える。
export const ATTACH_MAX_TOTAL = 18 * 1024 * 1024;
export const ATTACH_MAX_FILES = 20;

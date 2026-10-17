"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { DownloadIcon, PaperclipIcon } from "@/components/icons";
import { isPreviewable } from "@/lib/mail/attachment-types";

type Props = {
  messageId: number;
  text: string;
  html: string | null;
  size: string;
  attachments: { filename: string; contentType: string; size: string }[];
};

/** メールの本文。HTML のあるメールは HTML(無害化したもの)を先に見せ、テキストに切り替えられる。 */
export function MessageBody({ size, ...props }: Props) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 pt-3">
      <p className="mb-2 text-right text-[11px] tabular-nums text-muted">{size}</p>
      <Body {...props} />
    </section>
  );
}

/**
 * HTML メールを表示用に無害化する。DOMParser は解析するだけで、スクリプトの実行も画像の取得もしない。
 * - 動作や通信の起点になる要素(script / meta / link / form など)と on* 属性を取り除く
 * - リンクは飛び先を title に残して href を外す(クリックで iframe ごと外部サイトへ移動させない)
 */
function sanitizeHtml(html: string): { body: string; remoteImages: number } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, meta, link, base, form, iframe, frame, object, embed, svg, math, noscript, template").forEach((el) => el.remove());
  let remoteImages = 0;
  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "formaction" || name === "ping") el.removeAttribute(attr.name);
    }
    const href = el.getAttribute("href");
    if (href !== null) {
      el.removeAttribute("href");
      el.setAttribute("title", href);
    }
    el.removeAttribute("target");
    if (el.tagName === "IMG" && !/^\s*(data|cid):/i.test(el.getAttribute("src") ?? "")) remoteImages++;
  }
  const styles = [...doc.querySelectorAll("style")].map((s) => s.outerHTML).join("");
  return { body: styles + doc.body.innerHTML, remoteImages };
}

const noop = () => () => {};

function Body({ messageId, text, html, attachments }: Omit<Props, "size">) {
  const [mode, setMode] = useState<"text" | "html">(html ? "html" : "text");
  const [allowImages, setAllowImages] = useState(false);
  // 無害化に使う DOMParser はブラウザにしか無い。サーバでの描画(と、それに合わせる最初の描画)では解析せず、
  // 本文の枠だけ出しておき、ブラウザで描き直すときに解析する
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const clean = useMemo(() => (inBrowser && mode === "html" && html ? sanitizeHtml(html) : null), [inBrowser, mode, html]);
  const remoteImages = clean?.remoteImages ?? 0;
  // 無害化に加えて、sandbox 付きの iframe と CSP で二重に閉じ込める。スクリプトは動かず、
  // 外部への通信(開封確認用の画像や CSS からの読み込み)も、許可するまで起きない。
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:${allowImages ? " https: http:" : ""}; form-action 'none'; base-uri 'none'`;
  const srcDoc = clean
    ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"></head><body>${clean.body}</body></html>`
    : "";
  return (
    <div className="flex flex-col gap-3">
      {html ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex rounded-full border border-line bg-background p-0.5">
            {(["html", "text"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-0.5 transition-colors ${mode === m ? "bg-panel font-medium text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {m === "text" ? "テキスト" : "HTML"}
              </button>
            ))}
          </div>
          {mode === "html" && remoteImages > 0 ? (
            <label className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
              外部画像 {remoteImages} 件を読み込む(読み込むと、開封したことが送信元に伝わります)
            </label>
          ) : null}
          {mode === "html" ? <span className="text-muted">リンクとスクリプトは無効化しています(リンク先はマウスを重ねると表示)</span> : null}
        </div>
      ) : null}
      {mode === "html" && !clean ? (
        <div aria-hidden="true" className="h-[28rem] w-full rounded-lg border border-line bg-white" />
      ) : mode === "html" && clean ? (
        <iframe
          key={String(allowImages)}
          title="HTML 本文"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="h-[28rem] w-full rounded-lg border border-line bg-white"
        />
      ) : (
        <div className="whitespace-pre-wrap break-words leading-relaxed">{text || "(本文なし)"}</div>
      )}
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2 border-t border-line pt-3">
          {attachments.map((a, i) => {
            const url = `/api/attachments/${messageId}/${i}`;
            // 画像・PDF・テキストは新しいタブで開ける。それ以外(Office の文書など)は保存してから開く
            const preview = isPreviewable(a.contentType);
            return (
              <li key={i} className="flex items-center overflow-hidden rounded-lg border border-line bg-background text-xs [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted">
                <a
                  href={preview ? url : `${url}?download=1`}
                  {...(preview ? { target: "_blank", rel: "noopener noreferrer" } : { download: a.filename })}
                  title={preview ? `${a.filename} を新しいタブで開く` : `${a.filename} を保存`}
                  className="flex min-w-0 items-center gap-1.5 px-2.5 py-1.5 hover:bg-panel"
                >
                  {preview ? <PaperclipIcon /> : <DownloadIcon />}
                  <span className="truncate font-medium text-accent underline-offset-2 hover:underline">{a.filename}</span>
                  <span className="shrink-0 text-muted">{a.size}</span>
                </a>
                {preview ? (
                  <a
                    href={`${url}?download=1`}
                    download={a.filename}
                    aria-label={`${a.filename} を保存`}
                    title="保存"
                    className="border-l border-line px-2 py-1.5 hover:bg-panel"
                  >
                    <DownloadIcon />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

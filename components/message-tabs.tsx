"use client";

import { useMemo, useState } from "react";

type Part = {
  part?: string;
  type: string;
  parameters?: Record<string, string>;
  encoding?: string;
  size?: number;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  childNodes?: Part[];
};

type Props = {
  text: string;
  html: string | null;
  headers: { name: string; value: string; note: string | null }[];
  structure: Part | null;
  raw: string;
  rawTruncated: boolean;
  size: string;
  attachments: { filename: string; contentType: string; size: string }[];
};

const TABS = ["本文", "ヘッダ", "MIME 構造", "生データ"] as const;

export function MessageTabs(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("本文");
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div role="tablist" className="flex gap-1 border-b border-line px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-md border px-3 py-1.5 ${
              tab === t ? "border-line border-b-panel bg-panel font-medium" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto self-center pr-2 text-xs text-muted">{props.size}</span>
      </div>
      <div className="p-4">
        {tab === "本文" ? <Body {...props} /> : null}
        {tab === "ヘッダ" ? <Headers headers={props.headers} /> : null}
        {tab === "MIME 構造" ? <Structure structure={props.structure} /> : null}
        {tab === "生データ" ? (
          <>
            <p className="mb-2 text-xs text-muted">
              サーバから IMAP の FETCH BODY.PEEK[] で受け取ったそのままのデータ(RFC 5322 形式)。空行より上がヘッダ、下が本文。
              {props.rawTruncated ? " 長いため先頭だけを表示しています。" : ""}
            </p>
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all rounded bg-background p-3 font-mono text-xs">{props.raw}</pre>
          </>
        ) : null}
      </div>
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

function Body({ text, html, attachments }: Props) {
  const [mode, setMode] = useState<"text" | "html">("text");
  const [allowImages, setAllowImages] = useState(false);
  // HTML 表示に切り替えたとき(ブラウザ上)にだけ解析する
  const clean = useMemo(() => (mode === "html" && html ? sanitizeHtml(html) : null), [mode, html]);
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
          <div className="flex overflow-hidden rounded-md border border-line">
            {(["text", "html"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 ${mode === m ? "bg-accent-soft text-accent" : "hover:bg-background"}`}
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
      {mode === "html" && clean ? (
        <iframe
          key={String(allowImages)}
          title="HTML 本文"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="h-[28rem] w-full rounded border border-line bg-white"
        />
      ) : (
        <div className="whitespace-pre-wrap break-words leading-relaxed">{text || "(本文なし)"}</div>
      )}
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2 border-t border-line pt-3">
          {attachments.map((a, i) => (
            <li key={i} className="rounded-md border border-line px-2 py-1 text-xs">
              {a.filename} <span className="text-muted">{a.contentType} ・ {a.size}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Headers({ headers }: { headers: Props["headers"] }) {
  return (
    <>
      <p className="mb-2 text-xs text-muted">届いた順のまま表示しています。説明は代表的なヘッダにだけ付けています。</p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {headers.map((h, i) => (
            <tr key={i} className="border-t border-line align-top">
              <th className="w-44 py-1.5 pr-3 text-left font-mono font-medium">{h.name}</th>
              <td className="py-1.5">
                <p className="break-all font-mono">{h.value}</p>
                {h.note ? <p className="mt-0.5 text-muted">{h.note}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Structure({ structure }: { structure: Part | null }) {
  if (!structure) return <p className="text-muted">構造の情報がありません。</p>;
  return (
    <>
      <p className="mb-2 text-xs text-muted">
        IMAP の BODYSTRUCTURE 応答から得たパートの入れ子。multipart/alternative は「同じ内容の別表現(テキストと HTML)」、
        multipart/mixed は「本文と添付」を束ねます。番号は、パート単位で取得するときの指定(例: BODY[1.2])です。
      </p>
      <PartNode part={structure} depth={0} />
    </>
  );
}

function PartNode({ part, depth }: { part: Part; depth: number }) {
  const filename = part.dispositionParameters?.filename ?? part.parameters?.name;
  const details = [
    part.parameters?.charset ? `charset=${part.parameters.charset}` : null,
    part.encoding ? `encoding=${part.encoding}` : null,
    part.size != null ? `${part.size} bytes` : null,
    part.disposition ? `${part.disposition}${filename ? `: ${filename}` : ""}` : null,
    part.parameters?.boundary ? `boundary=${part.parameters.boundary}` : null,
  ].filter(Boolean);
  return (
    <div style={{ marginLeft: depth * 20 }} className="border-l border-line pl-3">
      <p className="py-1 font-mono text-xs">
        <span className="mr-2 inline-block w-8 text-muted">{part.part ?? (part.childNodes ? "—" : "1")}</span>
        <span className="font-medium">{part.type}</span>
        <span className="ml-2 break-all text-muted">{details.join(" ・ ")}</span>
      </p>
      {part.childNodes?.map((c, i) => <PartNode key={i} part={c} depth={depth + 1} />)}
    </div>
  );
}

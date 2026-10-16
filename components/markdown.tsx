import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * ダイアログの説明文(マークダウン)を描く。表(GFM)も使える。
 * HTML は書いても描かない(react-markdown の既定)。`コード` はキーの表示(<kbd> 風)にも使う。
 */
const COMPONENTS: Components = {
  h3: ({ children }) => <h3 className="mt-2 text-[13px] font-semibold text-accent first:mt-0">{children}</h3>,
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-accent">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-accent">{children}</ol>,
  code: ({ children }) => (
    <code className="rounded border border-line bg-background px-1.5 py-px font-mono text-[12px] whitespace-nowrap">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-1 rounded-md border-l-4 border-accent bg-accent-soft px-3 py-2 text-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background text-muted">{children}</thead>,
  th: ({ children }) => <th className="border-b border-line px-2.5 py-1.5 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-t border-line px-2.5 py-1.5 align-top first:whitespace-nowrap">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** 外から来た文字列(仕分けの名前など)をマークダウンに埋め込むとき、記号として解釈されないようにする */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, "\\$&");
}

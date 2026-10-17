"use client";

import { useId, useState } from "react";

export type ContactOption = { address: string; name: string; sent: number; received: number };

const MAX_OPTIONS = 8;

/** カンマ区切りの最後の 1 件(いま打っている宛先) */
function lastToken(value: string): string {
  return value.slice(value.lastIndexOf(",") + 1).trimStart();
}

/**
 * 宛先の入力欄。打ち始めると、やり取りしたことのある相手を候補に出す(候補は lib/queries.ts の listContacts)。
 * ↑↓ で選び、Enter か Tab で入れる。Esc で候補を閉じる。入るのはアドレスだけ(名前は候補の見分けに使う)。
 */
export function AddressInput({
  id,
  name,
  value,
  onChange,
  contacts,
  className,
  placeholder,
  autoFocus,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  contacts: ContactOption[];
  className: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);

  const query = lastToken(value).toLowerCase();
  const chosen = new Set(
    value
      .split(",")
      .slice(0, -1)
      .map((s) => s.trim().toLowerCase()),
  );
  const options =
    focused && !dismissed && query
      ? contacts
          .filter((c) => !chosen.has(c.address.toLowerCase()))
          .filter((c) => c.address.toLowerCase().includes(query) || c.name.toLowerCase().includes(query))
          // 打ったとおりのアドレスしか残っていなければ、出す意味がない
          .filter((c, _, all) => !(all.length === 1 && c.address.toLowerCase() === query))
          .slice(0, MAX_OPTIONS)
      : [];
  const open = options.length > 0;
  const current = Math.min(active, options.length - 1);

  const pick = (c: ContactOption) => {
    const head = value.slice(0, value.lastIndexOf(",") + 1);
    onChange(`${head ? `${head} ` : ""}${c.address}, `);
    setActive(0);
  };

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((current + step + options.length) % options.length);
          } else if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
            e.preventDefault();
            pick(options[current]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 flex flex-col overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg"
        >
          {options.map((c, i) => (
            <li
              key={c.address}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              // 押した瞬間に入力欄のフォーカスが外れて候補が消えないよう、mousedown で選ぶ
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 ${i === current ? "bg-accent-soft" : ""}`}
            >
              <span className="min-w-0 truncate">
                {c.name ? <span className="font-medium">{c.name} </span> : null}
                <span className="text-muted">{c.address}</span>
              </span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">
                {[c.sent > 0 ? `送信 ${c.sent}` : null, c.received > 0 ? `受信 ${c.received}` : null].filter(Boolean).join(" ・ ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

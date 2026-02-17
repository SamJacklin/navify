import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { onMessage, post, type ResultItem } from "./api";

export function App() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ResultItem[]>([]);
  const [emptyText, setEmptyText] = useState("Type to search your workspace.");
  const inputRef = useRef<HTMLInputElement>(null);

  const logoSrc = (typeof window !== "undefined" && window.__NAVIFY_LOGO__)
    ? window.__NAVIFY_LOGO__
    : "";

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Receive results
  useEffect(() => {
    onMessage((msg) => {
      if (msg?.type === "RESULTS") {
        const next = Array.isArray(msg.items) ? msg.items : [];
        setItems(next);
        if (!q.trim()) {
          setEmptyText("Type to search your workspace.");
        } else {
          setEmptyText(next.length ? "" : "No matches.");
        }
      }
    });
  }, [q]);

  // Debounced search
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const query = q.trim();
      if (!query) {
        setItems([]);
        setEmptyText("Type to search your workspace.");
        return;
      }
      post({ type: "SEARCH", q: query });
    }, 120);

    return () => window.clearTimeout(handle);
  }, [q]);

  const list = useMemo(() => items, [items]);

  return (
    <div class="root">
      <div class="header">
        <img class="logo" src={logoSrc} alt="Navify" />
        <div class="search">
          <input
            ref={inputRef}
            id="q"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            placeholder="Search files… (like Find)"
            aria-label="Search files"
            autocomplete="off"
            spellcheck={false}
          />
        </div>
      </div>

      <div class="results">
        {emptyText ? (
          <div class="empty">
            <div>{emptyText}</div>
            {!q.trim() ? (
              <div class="smallHint">Try typing part of a path or filename.</div>
            ) : null}
          </div>
        ) : null}

        {list.map((i) => (
          <div
            class="item"
            key={i.uri}
            role="button"
            tabIndex={0}
            onClick={() => post({ type: "OPEN", uri: i.uri })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                post({ type: "OPEN", uri: i.uri });
              }
            }}
          >
            <div class="label">{i.label}</div>
            <div class="path">{i.path}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

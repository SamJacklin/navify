import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { onMessage, post, type ResultItem } from "./api";

type Tab = "search" | "explorer";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const logoSrc = (typeof window !== "undefined" && window.__NAVIFY_LOGO__)
    ? window.__NAVIFY_LOGO__
    : "";

  // Focus input on mount and when switching to search tab
  useEffect(() => {
    if (activeTab === "search") {
      inputRef.current?.focus();
    }
  }, [activeTab]);

  // Receive results
  useEffect(() => {
    onMessage((msg) => {
      if (msg?.type === "RESULTS") {
        const next = Array.isArray(msg.items) ? msg.items : [];
        setItems(next);
        setSelectedIndex(0);
        setIsSearching(false);
      }
    });
  }, []);

  // Debounced search
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setItems([]);
      setSelectedIndex(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const handle = window.setTimeout(() => {
      post({ type: "SEARCH", q: query });
    }, 120);

    return () => window.clearTimeout(handle);
  }, [q]);

  const list = useMemo(() => items, [items]);

  // Keyboard navigation for results
  const handleKeyDown = (e: KeyboardEvent) => {
    if (activeTab !== "search" || list.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && list[selectedIndex]) {
      e.preventDefault();
      post({ type: "OPEN", uri: list[selectedIndex].uri });
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && list.length > 0) {
      const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, list]);

  const emptyMessage = () => {
    if (!q.trim()) {
      return (
        <div class="empty">
          <div class="empty-title">Search files in your workspace</div>
          <div class="empty-hint">Start typing to find files by name or path</div>
        </div>
      );
    }
    if (isSearching) {
      return (
        <div class="empty">
          <div class="empty-title">Searching...</div>
        </div>
      );
    }
    return (
      <div class="empty">
        <div class="empty-title">No files found</div>
        <div class="empty-hint">Try a different search term</div>
      </div>
    );
  };

  return (
    <div class="root" onKeyDown={handleKeyDown}>
      {/* Header with logo and workspace name */}
      <div class="header">
        <div class="header-content">
          <img class="logo" src={logoSrc} alt="Navify" />
          <h1 class="title">Navify</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div class="tabs" role="tablist">
        <button
          class={`tab ${activeTab === "search" ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === "search"}
          onClick={() => setActiveTab("search")}
        >
          <span class="tab-icon">🔍</span>
          <span>Search</span>
        </button>
        <button
          class={`tab ${activeTab === "explorer" ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === "explorer"}
          onClick={() => setActiveTab("explorer")}
        >
          <span class="tab-icon">📂</span>
          <span>Explorer Plus</span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "search" ? (
        <div class="tab-content" role="tabpanel">
          {/* Search input */}
          <div class="search-container">
            <div class="search-input-wrapper">
              <span class="search-icon" aria-hidden="true">🔍</span>
              <input
                ref={inputRef}
                class="search-input"
                type="text"
                value={q}
                onInput={(e) => setQ((e.target as HTMLInputElement).value)}
                placeholder="Search files..."
                aria-label="Search files"
                autocomplete="off"
                spellcheck={false}
              />
              {q && (
                <button
                  class="search-clear"
                  onClick={() => {
                    setQ("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            {list.length > 0 && (
              <div class="search-hint">
                {list.length} {list.length === 1 ? "file" : "files"} · ↑↓ to navigate · Enter to open
              </div>
            )}
          </div>

          {/* Results list */}
          <div class="results" ref={resultsRef} role="listbox">
            {list.length === 0 ? (
              emptyMessage()
            ) : (
              list.map((item, index) => (
                <div
                  key={item.uri}
                  data-index={index}
                  class={`result-item ${index === selectedIndex ? "selected" : ""}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => post({ type: "OPEN", uri: item.uri })}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div class="result-label">{item.label}</div>
                  <div class="result-path">{item.path}</div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div class="tab-content" role="tabpanel">
          <div class="empty">
            <div class="empty-title">Explorer Plus</div>
            <div class="empty-hint">Focused folder views coming soon</div>
          </div>
        </div>
      )}
    </div>
  );
}

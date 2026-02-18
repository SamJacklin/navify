import { useEffect, useRef, useState } from "preact/hooks";
import { onMessage, post, type ResultItem } from "./api";
import { FileList } from "./components/FileList";
import { ExplorerPlus } from "./components/ExplorerPlus";
import { useKeyboardNav } from "./hooks/useKeyboardNav";

type Tab = "search" | "explorer";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<ResultItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const logoSrc =
    typeof window !== "undefined" && window.__NAVIFY_LOGO__
      ? window.__NAVIFY_LOGO__
      : "";

  const hasQuery = q.trim().length > 0;
  const displayItems = hasQuery ? searchResults : recentFiles;

  // Focus the search input when switching to the search tab.
  useEffect(() => {
    if (activeTab === "search") {
      inputRef.current?.focus();
    }
  }, [activeTab]);

  // Receive RESULTS and RECENT_FILES messages from the extension host.
  // Returns a cleanup so the listener is removed if the effect re-runs.
  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === "RESULTS") {
        setSearchResults(Array.isArray(msg.items) ? msg.items : []);
        setSelectedIndex(0);
        setIsSearching(false);
      } else if (msg.type === "RECENT_FILES") {
        setRecentFiles(Array.isArray(msg.items) ? msg.items : []);
        if (!hasQuery) {
          setSelectedIndex(0);
        }
      }
    });
  }, [hasQuery]);

  // Debounced search.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSearchResults([]);
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

  // Keyboard navigation for the search tab.
  useKeyboardNav({
    enabled: activeTab === "search",
    itemCount: displayItems.length,
    selectedIndex,
    onSelectedIndexChange: setSelectedIndex,
    onEnter: () => {
      const item = displayItems[selectedIndex];
      if (item) {
        post({ type: "OPEN", uri: item.uri });
      }
    },
  });

  const getEmptyState = () => {
    if (hasQuery) {
      return isSearching
        ? { title: "Searching..." }
        : { title: "No files found", hint: "Try a different search term" };
    }
    return { title: "No recent files", hint: "Files you open will appear here" };
  };

  const getHintText = () => {
    if (hasQuery && searchResults.length > 0) {
      return `${searchResults.length} ${searchResults.length === 1 ? "file" : "files"} · ↑↓ to navigate · Enter to open`;
    }
    if (!hasQuery && recentFiles.length > 0) {
      return "↑↓ to navigate · Enter to open";
    }
    return null;
  };

  const hintText = getHintText();

  return (
    <div class="root">
      {/* Header */}
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

      {/* Search tab — hidden via CSS when explorer is active to preserve state */}
      <div
        class="tab-content"
        role="tabpanel"
        style={{ display: activeTab !== "search" ? "none" : undefined }}
      >
        {/* Search input */}
        <div class="search-container">
          <div class="search-input-wrapper">
            <span class="search-icon" aria-hidden="true">
              🔍
            </span>
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
          {hintText && <div class="search-hint">{hintText}</div>}
        </div>

        {/* Section header for recent files */}
        {!hasQuery && recentFiles.length > 0 && (
          <div class="section-header">
            <h2 class="section-title">Recently Opened</h2>
          </div>
        )}

        {/* File list (search results or recent files) */}
        <FileList
          items={displayItems}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          emptyState={getEmptyState()}
        />
      </div>

      {/* Explorer Plus tab — always mounted to preserve folder/tree state */}
      <ExplorerPlus visible={activeTab === "explorer"} />
    </div>
  );
}

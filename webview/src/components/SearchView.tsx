import { useEffect, useRef, useState } from "preact/hooks";
import { onMessage, post, type ResultItem } from "../api";
import { FileList } from "./FileList";
import { useKeyboardNav } from "../hooks/useKeyboardNav";

/** The "Search" view: file search, with recently opened files when idle. */
export function SearchView() {
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<ResultItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<ResultItem[]>([]);
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasQuery = q.trim().length > 0;
  const displayItems = hasQuery ? searchResults : recentFiles;

  // Focus the input on load and whenever the view itself gains focus
  // (e.g. via the "Navify: Focus File Search" command).
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, []);

  // Receive results, recent files and the active editor from the extension host.
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
      } else if (msg.type === "ACTIVE_FILE") {
        setActiveUri(msg.uri);
      }
    });
  }, [hasQuery]);

  // Ask for initial state only now that the listener above is attached;
  // effects run in declaration order, so the reply can't arrive unheard.
  useEffect(() => post({ type: "READY" }), []);

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

  useKeyboardNav({
    enabled: true,
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

  const emptyState = hasQuery
    ? isSearching
      ? { title: "Searching…" }
      : { title: "No matching files", hint: "Try part of a file name or folder" }
    : { title: "No recent files", hint: "Files you open will appear here" };

  let sectionLabel: string | null = null;
  if (hasQuery && !isSearching && searchResults.length > 0) {
    sectionLabel = `${searchResults.length}${searchResults.length >= 300 ? "+" : ""} ${
      searchResults.length === 1 ? "file" : "files"
    }`;
  } else if (!hasQuery && recentFiles.length > 0) {
    sectionLabel = "Recent";
  }

  return (
    <div class="view">
      <div class="search-bar">
        <div class="search-field">
          <input
            ref={inputRef}
            class="search-input"
            type="text"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.preventDefault();
                setQ("");
              }
            }}
            placeholder="Search files"
            aria-label="Search files"
            autocomplete="off"
            spellcheck={false}
          />
          {q && (
            <button
              class="icon-button codicon codicon-close"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              title="Clear (Esc)"
            />
          )}
        </div>
      </div>

      {sectionLabel && <div class="section-label">{sectionLabel}</div>}

      <FileList
        items={displayItems}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        activeUri={activeUri}
        emptyState={emptyState}
      />
    </div>
  );
}

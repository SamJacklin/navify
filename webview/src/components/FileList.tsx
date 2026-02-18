import { useEffect, useRef } from "preact/hooks";
import { post, type ResultItem } from "../api";

interface FileListProps {
  items: ResultItem[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  emptyState?: {
    title: string;
    hint?: string;
  };
}

export function FileList({ items, selectedIndex, onSelectedIndexChange, emptyState }: FileListProps) {
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && items.length > 0) {
      const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, items]);

  if (items.length === 0 && emptyState) {
    return (
      <div class="empty">
        <div class="empty-title">{emptyState.title}</div>
        {emptyState.hint && <div class="empty-hint">{emptyState.hint}</div>}
      </div>
    );
  }

  return (
    <div class="results" ref={resultsRef} role="listbox">
      {items.map((item, index) => (
        <div
          key={item.uri}
          data-index={index}
          class={`result-item ${index === selectedIndex ? "selected" : ""}`}
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => post({ type: "OPEN", uri: item.uri })}
          onMouseEnter={() => onSelectedIndexChange(index)}
        >
          <div class="result-label">{item.label}</div>
          <div class="result-path">{item.path}</div>
        </div>
      ))}
    </div>
  );
}

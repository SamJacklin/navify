import { useEffect, useRef } from "preact/hooks";
import { post, type ResultItem } from "../api";
import { Row } from "./Row";

interface FileListProps {
  items: ResultItem[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  activeUri?: string | null;
  emptyState?: {
    title: string;
    hint?: string;
  };
}

/** Folder part of a workspace-relative path, shown muted beside the file name. */
function parentDir(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i > 0 ? relPath.slice(0, i) : "";
}

export function FileList({
  items,
  selectedIndex,
  onSelectedIndexChange,
  activeUri,
  emptyState,
}: FileListProps) {
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = resultsRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: "nearest" });
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
    <div class="list" ref={resultsRef} role="listbox">
      {items.map((item, index) => (
        <Row
          key={item.uri}
          data-index={index}
          label={item.label}
          meta={parentDir(item.path)}
          title={item.path}
          selected={index === selectedIndex}
          active={item.uri === activeUri}
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => post({ type: "OPEN", uri: item.uri })}
          onMouseEnter={() => onSelectedIndexChange(index)}
        />
      ))}
    </div>
  );
}

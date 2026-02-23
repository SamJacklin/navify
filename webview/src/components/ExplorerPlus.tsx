import { useEffect, useState } from "preact/hooks";
import { onMessage, post, type DirNode, type TreeNode } from "../api";

// ── Main component ────────────────────────────────────────────────────────────

interface ExplorerPlusProps {
  visible: boolean;
}

export function ExplorerPlus({ visible }: ExplorerPlusProps) {
  const [dirRoots, setDirRoots] = useState<DirNode[]>([]);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [treeRoots, setTreeRoots] = useState<TreeNode[] | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const [justOpenedUri, setJustOpenedUri] = useState<string | null>(null);

  // Request the directory tree the first time this tab becomes visible.
  useEffect(() => {
    if (visible && dirRoots.length === 0 && treeRoots === null && !loading) {
      setLoading(true);
      post({ type: "EXPLORER_GET_DIR_TREE" });
    }
  }, [visible]);

  // Clear the flash class once the animation has played out.
  useEffect(() => {
    if (!justOpenedUri) return;
    const id = setTimeout(() => setJustOpenedUri(null), 1200);
    return () => clearTimeout(id);
  }, [justOpenedUri]);

  // Listen for messages from the extension host.
  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === "EXPLORER_DIR_TREE") {
        setDirRoots(msg.roots);
        setLoading(false);
      } else if (msg.type === "EXPLORER_TREE") {
        setTreeRoots(msg.roots);
        setTreeExpanded(new Set());
        setLoading(false);
      } else if (msg.type === "ACTIVE_FILE") {
        setActiveUri(msg.uri);
      }
    });
  }, []);

  const openFile = (uri: string) => {
    post({ type: "OPEN", uri });
    setJustOpenedUri(uri);
  };

  const toggleSelection = (uri: string) => {
    setSelectedUris((prev) => {
      if (prev.includes(uri)) {
        return prev.filter((u) => u !== uri);
      }
      // Max 2 folders — drop the oldest when at capacity.
      return prev.length >= 2 ? [prev[1], uri] : [...prev, uri];
    });
  };

  const focusFolders = () => {
    if (selectedUris.length === 0) {
      return;
    }
    setLoading(true);
    post({ type: "EXPLORER_GET_TREE", folderUris: selectedUris });
  };

  const changeFolders = () => {
    setTreeRoots(null);
    setSelectedUris([]);
    setTreeExpanded(new Set());
    if (dirRoots.length === 0) {
      setLoading(true);
      post({ type: "EXPLORER_GET_DIR_TREE" });
    }
  };

  const toggleTreeExpand = (uri: string) => {
    setTreeExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  };

  return (
    <div
      class="tab-content"
      role="tabpanel"
      style={{ display: visible ? undefined : "none" }}
    >
      {loading ? (
        <div class="empty">
          <div class="empty-title">Loading...</div>
        </div>
      ) : treeRoots !== null ? (
        <TreeView
          roots={treeRoots}
          expanded={treeExpanded}
          activeUri={activeUri}
          justOpenedUri={justOpenedUri}
          onToggle={toggleTreeExpand}
          onOpen={openFile}
          onChangeFolders={changeFolders}
        />
      ) : (
        <DirBrowser
          roots={dirRoots}
          selectedUris={selectedUris}
          onSelect={toggleSelection}
          onFocus={focusFolders}
        />
      )}
    </div>
  );
}

// ── Folder browser (picker phase) ─────────────────────────────────────────────

interface DirBrowserProps {
  roots: DirNode[];
  selectedUris: string[];
  onSelect: (uri: string) => void;
  onFocus: () => void;
}

function DirBrowser({ roots, selectedUris, onSelect, onFocus }: DirBrowserProps) {
  // Workspace roots are expanded by default; user controls the rest.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(roots.map((r) => r.uri))
  );

  // Keep workspace roots expanded if the root list refreshes.
  useEffect(() => {
    if (roots.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        roots.forEach((r) => next.add(r.uri));
        return next;
      });
    }
  }, [roots]);

  const toggleExpand = (uri: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  };

  if (roots.length === 0) {
    return (
      <>
        <div class="explorer-toolbar">
          <span class="explorer-toolbar-label">Explorer Plus</span>
        </div>
        <div class="empty">
          <div class="empty-title">No workspace open</div>
          <div class="empty-hint">Open a folder to use Explorer Plus</div>
        </div>
      </>
    );
  }

  const selectionCount = selectedUris.length;

  return (
    <>
      <div class="explorer-toolbar">
        <span class="explorer-toolbar-label">Select folders to focus</span>
        {selectionCount > 0 && (
          <span class="explorer-selection-count">{selectionCount}/2</span>
        )}
      </div>

      <div class="results">
        {roots.map((root) => (
          <DirNodeView
            key={root.uri}
            node={root}
            depth={0}
            expanded={expanded}
            selectedUris={selectedUris}
            onSelect={onSelect}
            onToggleExpand={toggleExpand}
          />
        ))}
      </div>

      {selectionCount > 0 && (
        <div class="explorer-footer">
          <button class="explorer-apply-btn" onClick={onFocus}>
            Focus {selectionCount === 1 ? "folder" : "both folders"}
          </button>
        </div>
      )}
    </>
  );
}

// ── Directory node (picker) ───────────────────────────────────────────────────

interface DirNodeViewProps {
  node: DirNode;
  depth: number;
  expanded: Set<string>;
  selectedUris: string[];
  onSelect: (uri: string) => void;
  onToggleExpand: (uri: string) => void;
}

function DirNodeView({
  node,
  depth,
  expanded,
  selectedUris,
  onSelect,
  onToggleExpand,
}: DirNodeViewProps) {
  const isExpanded = expanded.has(node.uri);
  const isSelected = selectedUris.includes(node.uri);
  const hasChildren = node.children.length > 0;
  const indent = depth * 14;

  return (
    <>
      <div
        class={`explorer-dir-pick-item${isSelected ? " selected" : ""}`}
        style={{ paddingLeft: `${16 + indent}px` }}
        onClick={() => {
          onSelect(node.uri);
          if (!isExpanded) onToggleExpand(node.uri);
      }}
        role="checkbox"
        aria-checked={isSelected}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSelect(node.uri);
          } else if (e.key === " " && hasChildren) {
            e.preventDefault();
            onToggleExpand(node.uri);
          }
        }}
      >
        <span
          class="explorer-expand-arrow"
          style={{ visibility: hasChildren ? undefined : "hidden" }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.uri);
          }}
          aria-hidden="true"
        >
          {isExpanded ? "▾" : "▸"}
        </span>
        <span class="explorer-check" aria-hidden="true">
          {isSelected ? "✓" : ""}
        </span>
        <span class="explorer-item-icon" aria-hidden="true">
          📁
        </span>
        <span class="explorer-item-name">{node.name}</span>
      </div>

      {isExpanded &&
        node.children.map((child) => (
          <DirNodeView
            key={child.uri}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selectedUris={selectedUris}
            onSelect={onSelect}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
}

// ── Tree view (focused phase) ─────────────────────────────────────────────────

interface TreeViewProps {
  roots: TreeNode[];
  expanded: Set<string>;
  activeUri: string | null;
  justOpenedUri: string | null;
  onToggle: (uri: string) => void;
  onOpen: (uri: string) => void;
  onChangeFolders: () => void;
}

function TreeView({
  roots,
  expanded,
  activeUri,
  justOpenedUri,
  onToggle,
  onOpen,
  onChangeFolders,
}: TreeViewProps) {
  const multiRoot = roots.length > 1;
  const singleRootName = !multiRoot ? roots[0]?.name : null;

  const hasAnyFiles = roots.some((r) => (r.children?.length ?? 0) > 0);

  return (
    <>
      <div class="explorer-toolbar">
        <button
          class="explorer-back-btn"
          onClick={onChangeFolders}
          aria-label="Change focused folders"
        >
          ← Change
        </button>
        {singleRootName && (
          <span class="explorer-toolbar-label" title={singleRootName}>
            {singleRootName}
          </span>
        )}
      </div>

      {!hasAnyFiles ? (
        <div class="empty">
          <div class="empty-title">No files found</div>
          <div class="empty-hint">The selected folder appears to be empty</div>
        </div>
      ) : (
        <div class="results">
          {roots.map((root, i) => (
            <div key={root.uri}>
              {/* Section header separates folders visually when two are focused */}
              {multiRoot && (
                <div
                  class={`explorer-section${i > 0 ? " explorer-section--divided" : ""}`}
                >
                  <span class="explorer-item-icon" aria-hidden="true">
                    📁
                  </span>
                  <span class="explorer-section-label">{root.name}</span>
                </div>
              )}
              {(root.children ?? []).map((child) => (
                <TreeNodeView
                  key={child.uri}
                  node={child}
                  depth={0}
                  expanded={expanded}
                  activeUri={activeUri}
                  justOpenedUri={justOpenedUri}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Tree node (focused phase) ─────────────────────────────────────────────────

interface TreeNodeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  activeUri: string | null;
  justOpenedUri: string | null;
  onToggle: (uri: string) => void;
  onOpen: (uri: string) => void;
}

function TreeNodeView({
  node,
  depth,
  expanded,
  activeUri,
  justOpenedUri,
  onToggle,
  onOpen,
}: TreeNodeViewProps) {
  const indent = depth * 14;

  if (node.type === "file") {
    const isActive = activeUri === node.uri;
    const isJustOpened = justOpenedUri === node.uri;

    const itemClass = [
      "explorer-item",
      isActive ? "explorer-item--active" : "",
      isJustOpened ? "explorer-item--flash" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        class={itemClass}
        style={{ paddingLeft: `${16 + indent}px` }}
        onClick={() => onOpen(node.uri)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onOpen(node.uri);
          }
        }}
      >
        <span class="explorer-spacer" aria-hidden="true" />
        <span class="explorer-item-icon" aria-hidden="true">
          📄
        </span>
        <span class="explorer-item-name">{node.name}</span>
      </div>
    );
  }

  // Directory node
  const isExpanded = expanded.has(node.uri);

  return (
    <>
      <div
        class={`explorer-item explorer-dir-item${isExpanded ? " expanded" : ""}`}
        style={{ paddingLeft: `${16 + indent}px` }}
        onClick={() => onToggle(node.uri)}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(node.uri);
          }
        }}
      >
        <span class="explorer-arrow" aria-hidden="true">
          {isExpanded ? "▾" : "▸"}
        </span>
        <span class="explorer-item-icon" aria-hidden="true">
          📁
        </span>
        <span class="explorer-item-name">{node.name}</span>
      </div>

      {isExpanded &&
        node.children?.map((child) => (
          <TreeNodeView
            key={child.uri}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            activeUri={activeUri}
            justOpenedUri={justOpenedUri}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
    </>
  );
}

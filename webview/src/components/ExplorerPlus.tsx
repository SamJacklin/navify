import { useEffect, useState } from "preact/hooks";
import { onMessage, post, type DirNode, type TreeNode } from "../api";
import { Row } from "./Row";

const MAX_FOCUSED_FOLDERS = 2;

// ── Main component ────────────────────────────────────────────────────────────

/**
 * The "Explorer Plus" view: pick up to two folders, then browse just those
 * folders as a compact tree.
 */
export function ExplorerPlus() {
  const [dirRoots, setDirRoots] = useState<DirNode[]>([]);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [treeRoots, setTreeRoots] = useState<TreeNode[] | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const [justOpenedUri, setJustOpenedUri] = useState<string | null>(null);

  const requestDirTree = () => {
    setLoading(true);
    post({ type: "EXPLORER_GET_DIR_TREE" });
  };

  const changeFolders = () => {
    setTreeRoots(null);
    setSelectedUris([]);
    setTreeExpanded(new Set());
    // Refetch so folders created since the last pick show up.
    requestDirTree();
  };

  // Load the folder picker as soon as the view opens.
  useEffect(requestDirTree, []);

  // Tell the extension which phase we're in so it can show the title-bar action.
  useEffect(() => {
    post({ type: "EXPLORER_MODE", mode: treeRoots === null ? "pick" : "tree" });
  }, [treeRoots === null]);

  // Clear the flash class once the animation has played out.
  useEffect(() => {
    if (!justOpenedUri) {
      return;
    }
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
      } else if (msg.type === "EXPLORER_CHANGE_FOLDERS") {
        changeFolders();
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
      // Drop the oldest pick when at capacity.
      return prev.length >= MAX_FOCUSED_FOLDERS ? [...prev.slice(1), uri] : [...prev, uri];
    });
  };

  const focusFolders = () => {
    if (selectedUris.length === 0) {
      return;
    }
    setLoading(true);
    post({ type: "EXPLORER_GET_TREE", folderUris: selectedUris });
  };

  const toggleTreeExpand = (uri: string) => {
    setTreeExpanded((prev) => toggled(prev, uri));
  };

  return (
    <div class="view">
      {loading ? (
        <div class="empty">
          <div class="empty-title">Loading…</div>
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

function toggled(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
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
    setExpanded((prev) => toggled(prev, uri));
  };

  if (roots.length === 0) {
    return (
      <div class="empty">
        <div class="empty-title">No workspace open</div>
        <div class="empty-hint">Open a folder to use Explorer Plus</div>
      </div>
    );
  }

  const selectionCount = selectedUris.length;

  return (
    <>
      <div class="section-label">
        <span>Choose up to {MAX_FOCUSED_FOLDERS} folders</span>
        {selectionCount > 0 && (
          <span class="section-label-meta">
            {selectionCount}/{MAX_FOCUSED_FOLDERS}
          </span>
        )}
      </div>

      <div class="list" role="tree" aria-multiselectable="true">
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
        <div class="footer">
          <button class="primary-button" onClick={onFocus}>
            {selectionCount === 1 ? "Focus folder" : `Focus ${selectionCount} folders`}
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

  return (
    <>
      <Row
        label={node.name}
        depth={depth}
        twistie={!hasChildren ? "leaf" : isExpanded ? "open" : "closed"}
        selected={isSelected}
        meta={
          isSelected ? (
            <span class="codicon codicon-check row-check" aria-hidden="true" />
          ) : undefined
        }
        title={node.path}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={0}
        onClick={(e) => {
          // Clicking the chevron only expands; clicking the row selects too.
          const onTwistie = (e.target as HTMLElement).classList.contains("row-twistie");
          if (!onTwistie) {
            onSelect(node.uri);
          }
          if (hasChildren && (onTwistie || !isExpanded)) {
            onToggleExpand(node.uri);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSelect(node.uri);
          } else if (e.key === " " && hasChildren) {
            e.preventDefault();
            onToggleExpand(node.uri);
          }
        }}
      />

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
  const hasAnyFiles = roots.some((r) => (r.children?.length ?? 0) > 0);

  if (!hasAnyFiles) {
    return (
      <div class="empty">
        <div class="empty-title">No files found</div>
        <div class="empty-hint">The selected folder appears to be empty</div>
        <button class="link-button" onClick={onChangeFolders}>
          Choose other folders
        </button>
      </div>
    );
  }

  return (
    <div class="list" role="tree">
      {roots.map((root, i) => (
        <div key={root.uri} role="group" aria-label={root.name}>
          <div class={`section-label${i > 0 ? " section-label--divided" : ""}`}>
            <span title={root.path}>{root.name}</span>
            {i === 0 && (
              <button
                class="link-button section-label-meta"
                onClick={onChangeFolders}
                title="Change focused folders"
              >
                Change
              </button>
            )}
          </div>
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
  if (node.type === "file") {
    return (
      <Row
        label={node.name}
        depth={depth}
        twistie="leaf"
        title={node.path}
        active={activeUri === node.uri}
        flash={justOpenedUri === node.uri}
        role="treeitem"
        tabIndex={0}
        onClick={() => onOpen(node.uri)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onOpen(node.uri);
          }
        }}
      />
    );
  }

  const isExpanded = expanded.has(node.uri);

  return (
    <>
      <Row
        label={node.name}
        depth={depth}
        twistie={isExpanded ? "open" : "closed"}
        title={node.path}
        role="treeitem"
        aria-expanded={isExpanded}
        tabIndex={0}
        onClick={() => onToggle(node.uri)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(node.uri);
          }
        }}
      />

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

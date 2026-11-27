import { useEffect, useState } from "preact/hooks";
import { onMessage, post, type StructureNode } from "../api";
import { Row } from "./Row";

type KeyFile = StructureNode["keyFiles"][number];

const AREA_ICONS: Record<StructureNode["kind"], string> = {
  root: "root-folder",
  package: "package",
  tests: "beaker",
  docs: "book",
  folder: "folder",
};

const KEY_FILE_ICONS: Record<KeyFile["role"], string> = {
  readme: "info",
  manifest: "gear",
  entry: "play",
};

/**
 * The "Structure" view: a map of the project's areas (top-level folders and
 * packages) with their size, main file types and key files.
 */
export function StructureView() {
  const [roots, setRoots] = useState<StructureNode[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeUri, setActiveUri] = useState<string | null>(null);

  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === "STRUCTURE") {
        setRoots(msg.roots);
        // Workspace roots start expanded; everything else is left as the user set it.
        setExpanded((prev) => new Set([...prev, ...msg.roots.map((r) => r.uri)]));
      } else if (msg.type === "ACTIVE_FILE") {
        setActiveUri(msg.uri);
      }
    });
  }, []);

  // Request state only once the listener above is attached.
  useEffect(() => {
    post({ type: "READY" });
    post({ type: "STRUCTURE_GET" });
  }, []);

  const toggle = (uri: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(uri)) {
        next.add(uri);
      }
      return next;
    });
  };

  if (roots === null) {
    return (
      <div class="view">
        <div class="empty">
          <div class="empty-title">Mapping project…</div>
        </div>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div class="view">
        <div class="empty">
          <div class="empty-title">No workspace open</div>
          <div class="empty-hint">Open a folder to see its structure</div>
        </div>
      </div>
    );
  }

  return (
    <div class="view">
      <div class="list" role="tree">
        {roots.map((root) => (
          <AreaView
            key={root.uri}
            area={root}
            depth={0}
            expanded={expanded}
            activeUri={activeUri}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

interface AreaViewProps {
  area: StructureNode;
  depth: number;
  expanded: Set<string>;
  activeUri: string | null;
  onToggle: (uri: string) => void;
}

function AreaView({ area, depth, expanded, activeUri, onToggle }: AreaViewProps) {
  const hasContent = area.children.length > 0 || area.keyFiles.length > 0;
  const isExpanded = hasContent && expanded.has(area.uri);
  // Mark where the open file lives: the deepest row on screen that contains it.
  const containsActive = activeUri !== null && isInside(activeUri, area.uri);
  const shownBelow =
    isExpanded &&
    (area.children.some((c) => activeUri !== null && isInside(activeUri, c.uri)) ||
      area.keyFiles.some((f) => f.uri === activeUri));

  const focusInExplorer = (e: Event) => {
    e.stopPropagation();
    post({ type: "FOCUS_IN_EXPLORER", uri: area.uri });
  };

  return (
    <>
      <Row
        label={area.name}
        meta={describe(area)}
        depth={depth}
        twistie={!hasContent ? "leaf" : isExpanded ? "open" : "closed"}
        icon={AREA_ICONS[area.kind]}
        active={containsActive && !shownBelow}
        title={area.path}
        role="treeitem"
        aria-expanded={hasContent ? isExpanded : undefined}
        tabIndex={0}
        onClick={() => hasContent && onToggle(area.uri)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && hasContent) {
            e.preventDefault();
            onToggle(area.uri);
          }
        }}
        actions={
          <button
            class="icon-button"
            title="Focus in Explorer Plus"
            aria-label={`Focus ${area.name} in Explorer Plus`}
            onClick={focusInExplorer}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span class="codicon codicon-target" aria-hidden="true" />
          </button>
        }
      />

      {isExpanded && (
        <>
          {area.children.map((child) => (
            <AreaView
              key={child.uri}
              area={child}
              depth={depth + 1}
              expanded={expanded}
              activeUri={activeUri}
              onToggle={onToggle}
            />
          ))}
          {area.keyFiles.map((file) => (
            <Row
              key={file.uri}
              label={file.name}
              meta={keyFileMeta(file, area)}
              depth={depth + 1}
              twistie="leaf"
              icon={KEY_FILE_ICONS[file.role]}
              active={activeUri === file.uri}
              title={file.path}
              role="treeitem"
              tabIndex={0}
              onClick={() => post({ type: "OPEN", uri: file.uri })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  post({ type: "OPEN", uri: file.uri });
                }
              }}
            />
          ))}
        </>
      )}
    </>
  );
}

/** "1,204 · ts tsx css" */
function describe(area: StructureNode): string {
  const count = area.fileCount.toLocaleString();
  return area.languages.length > 0 ? `${count} · ${area.languages.join(" ")}` : count;
}

/** Shows which folder a key file sits in when it isn't the area's own, e.g. `src`. */
function keyFileMeta(file: KeyFile, area: StructureNode): string {
  const relative = file.uri.slice(area.uri.length + 1);
  const slash = relative.lastIndexOf("/");
  return slash < 0 ? "" : decodeURIComponent(relative.slice(0, slash));
}

function isInside(uri: string, folder: string): boolean {
  return uri.startsWith(folder.endsWith("/") ? folder : folder + "/");
}

import type { ComponentChildren, JSX } from "preact";

type Twistie = "open" | "closed" | "leaf";

interface RowProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "label" | "icon"> {
  label: string;
  /** Muted text pinned to the right edge (a path, a count, a line number). */
  meta?: ComponentChildren;
  /** Nesting level; each level indents by one step. */
  depth?: number;
  /**
   * Tree rows reserve a chevron column so files and folders line up.
   * "leaf" keeps the column empty. Omit for flat lists.
   */
  twistie?: Twistie;
  /** Optional codicon name (without the `codicon-` prefix) before the label. */
  icon?: string;
  /** Keyboard or pointer selection. */
  selected?: boolean;
  /** A picked item in a multi-select list. */
  checked?: boolean;
  /** The file currently open in the editor. */
  active?: boolean;
  /** Brief highlight after opening. */
  flash?: boolean;
}

/**
 * One line in any Navify list or tree: indent, optional chevron and icon,
 * label, and right-aligned muted metadata.
 */
export function Row({
  label,
  meta,
  depth = 0,
  twistie,
  icon,
  selected,
  checked,
  active,
  flash,
  class: extraClass,
  style,
  ...rest
}: RowProps) {
  const classes = [
    "row",
    selected && "row--selected",
    checked && "row--checked",
    active && "row--active",
    flash && "row--flash",
    extraClass,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      {...rest}
      class={classes}
      style={{ "--depth": depth, ...(style as object) }}
      title={rest.title ?? label}
    >
      {twistie && (
        <span
          class={`row-twistie codicon ${
            twistie === "open"
              ? "codicon-chevron-down"
              : twistie === "closed"
                ? "codicon-chevron-right"
                : ""
          }`}
          aria-hidden="true"
        />
      )}
      {icon && <span class={`row-icon codicon codicon-${icon}`} aria-hidden="true" />}
      <span class="row-label">{label}</span>
      {meta !== undefined && meta !== "" && <span class="row-meta">{meta}</span>}
    </div>
  );
}

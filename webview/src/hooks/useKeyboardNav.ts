import { useEffect } from "preact/hooks";

interface UseKeyboardNavOptions {
  enabled: boolean;
  itemCount: number;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onEnter: () => void;
}

export function useKeyboardNav({
  enabled,
  itemCount,
  selectedIndex,
  onSelectedIndexChange,
  onEnter
}: UseKeyboardNavOptions) {
  useEffect(() => {
    if (!enabled || itemCount === 0) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onSelectedIndexChange(Math.min(selectedIndex + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        onEnter();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, itemCount, selectedIndex, onSelectedIndexChange, onEnter]);
}

import type { KeyboardEvent } from "react";

export function tabListKeyDown(
  event: KeyboardEvent<HTMLElement>,
  options: {
    ids: string[];
    selectedId: string;
    onSelect: (id: string) => void;
  },
) {
  const { ids, selectedId, onSelect } = options;
  if (!ids.length) return;
  const index = Math.max(0, ids.indexOf(selectedId));
  let next = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    next = (index + 1) % ids.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    next = (index - 1 + ids.length) % ids.length;
  } else if (event.key === "Home") {
    next = 0;
  } else if (event.key === "End") {
    next = ids.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  const id = ids[next];
  if (id) onSelect(id);
}

import { useEffect, useRef } from 'react';

// What the Android back button closes first: open bubbles and dialogs register here
// while they are open, and the newest one goes first (see src/native/native.ts).

const stack: (() => void)[] = [];

/** Register `close` for the back button; call the result when it is closed some other way. */
export function pushBack(close: () => void): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Close the newest open thing; false when nothing was open. */
export function closeTopmost(): boolean {
  const close = stack.pop();
  if (!close) return false;
  close();
  return true;
}

/** While `open`, the back button runs `close` (before going back a screen). */
export function useBackClose(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => (open ? pushBack(() => latest.current()) : undefined), [open]);
}

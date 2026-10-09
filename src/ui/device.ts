/**
 * A computer with a keyboard and a mouse, not a phone or a tablet: the key hints (space to pause,
 * 1-2-3 for the speed) are shown only then.
 */
export function hasKeyboard(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return true;
  }
}

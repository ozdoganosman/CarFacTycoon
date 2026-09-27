import { useEffect, useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';
import { useThemeColors, type ThemeColors } from '../theme';

/**
 * Per-frame draw callback.
 * - `t`  elapsed animation time in seconds (only advances while visible; 0.25x under reduced motion)
 * - `w`,`h` canvas size in CSS pixels (the context is already scaled for devicePixelRatio)
 * - `dt` time step since the previous frame in the same (scaled) seconds, 0 on static redraws
 */
export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  h: number,
  colors: ThemeColors,
  dt: number,
) => void;

export interface CanvasAnimationOptions {
  /** width / height. A function of the CSS width lets layouts switch shape on narrow screens. Default 16/9. */
  aspect?: number | ((cssWidth: number) => number);
  /** Clamp for the computed CSS height. */
  minHeight?: number;
  maxHeight?: number;
  /** Extra time multiplier (e.g. a "Hız" slider). 0 freezes time but keeps drawing. Default 1. */
  speed?: number;
}

const REDUCED_MOTION_SPEED = 0.25;
const MAX_DT = 0.1; // clamp long frames (tab switches, jank) so simulations don't jump

function heightFor(width: number, o: CanvasAnimationOptions): number {
  const a = typeof o.aspect === 'function' ? o.aspect(width) : (o.aspect ?? 16 / 9);
  let h = width / (a > 0 ? a : 16 / 9);
  if (o.minHeight !== undefined) h = Math.max(o.minHeight, h);
  if (o.maxHeight !== undefined) h = Math.min(o.maxHeight, h);
  return Math.round(h);
}

/**
 * Owns a `<canvas>`: sizes it to its CSS width (height from `aspect`), keeps the backing store
 * crisp for devicePixelRatio, and runs `draw` every animation frame while the canvas is on screen
 * and the tab is visible. Honours `prefers-reduced-motion` by slowing time to 0.25x.
 *
 * `draw` may change every render (it is read through a ref); `deps` only force an immediate
 * redraw, which matters when the loop is paused (offscreen) or `speed` is 0.
 */
export function useCanvasAnimation(
  draw: DrawFn,
  deps: DependencyList = [],
  opts: CanvasAnimationOptions = {},
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colors = useThemeColors();

  const drawRef = useRef(draw);
  const colorsRef = useRef(colors);
  const optsRef = useRef(opts);
  const redrawRef = useRef<() => void>(() => {});
  const relayoutRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    drawRef.current = draw;
    colorsRef.current = colors;
    optsRef.current = opts;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = -1;
    let t = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let onScreen = true;
    let tabVisible = document.visibilityState !== 'hidden';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let slow = reduced.matches;
    let pendingHeight = 0;

    const render = (dt: number) => {
      if (w <= 0 || h <= 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      drawRef.current(ctx, t, w, h, colorsRef.current, dt);
      ctx.restore();
    };

    /** Match the backing store to the CSS box × devicePixelRatio. */
    const syncBackingStore = (cssW: number, cssH: number) => {
      dpr = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      w = cssW;
      h = cssH;
    };

    /** Width comes from CSS; height is derived. Applying it is deferred to the next frame so a
     *  ResizeObserver callback never resizes its own target (avoids "ResizeObserver loop" errors). */
    const measure = (immediate: boolean) => {
      const cssW = canvas.clientWidth;
      if (cssW <= 0) return;
      const cssH = heightFor(cssW, optsRef.current);
      const apply = () => {
        pendingHeight = 0;
        canvas.style.height = `${cssH}px`;
        syncBackingStore(cssW, cssH);
        render(0);
      };
      if (immediate) {
        apply();
      } else {
        if (pendingHeight) cancelAnimationFrame(pendingHeight);
        pendingHeight = requestAnimationFrame(apply);
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const real = last < 0 ? 0 : Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      if ((window.devicePixelRatio || 1) !== dpr) syncBackingStore(w, h);
      const dt = real * (slow ? REDUCED_MOTION_SPEED : 1) * Math.max(0, optsRef.current.speed ?? 1);
      t += dt;
      render(dt);
      schedule();
    };

    const schedule = () => {
      if (!raf && onScreen && tabVisible) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = -1;
    };
    const update = () => (onScreen && tabVisible ? schedule() : stop());

    const ro = new ResizeObserver(() => measure(false));
    ro.observe(canvas);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) onScreen = e.isIntersecting;
        update();
      },
      { rootMargin: '64px' },
    );
    io.observe(canvas);

    const onVisibility = () => {
      tabVisible = document.visibilityState !== 'hidden';
      update();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onReduced = () => {
      slow = reduced.matches;
    };
    reduced.addEventListener('change', onReduced);

    redrawRef.current = () => render(0);
    relayoutRef.current = () => measure(true);

    measure(true);
    schedule();

    return () => {
      stop();
      if (pendingHeight) cancelAnimationFrame(pendingHeight);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
      redrawRef.current = () => {};
      relayoutRef.current = () => {};
    };
  }, []);

  // Aspect / height clamps may change between renders: re-measure when they do.
  const aspectKey = typeof opts.aspect === 'function' ? 'fn' : String(opts.aspect);
  useEffect(() => {
    relayoutRef.current();
  }, [aspectKey, opts.minHeight, opts.maxHeight]);

  // Redraw once when inputs or the theme change (the loop may be paused).
  useEffect(() => {
    redrawRef.current();
  }, [colors, ...deps]); // deps must keep a fixed length per call site

  return canvasRef;
}

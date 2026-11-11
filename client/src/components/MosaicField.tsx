import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { SHAPES } from '@/assets/shapes';

export interface MosaicRect {
  x: number;
  y: number;
  size: number;
}

export interface MosaicHandle {
  assemble: (rect: MosaicRect) => Promise<void>;
  disperse: () => void;
}

interface MosaicFieldProps {
  paused: boolean;
}

interface Swimmer {
  shape: string[];
  width: number;
  img: HTMLImageElement;
  cell: number;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  wobble: number;
}

interface Flyer {
  swimmer: number;
  ix: number;
  iy: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}

interface Assembly {
  start: number;
  items: Flyer[];
  rect: MosaicRect;
  mode: 'in' | 'out';
  resolve: () => void;
}

const FRAME_MS = 33;
const GRID = 16;
const IN_MS = 600;
const OUT_MS = 700;
const MAX_DELAY_MS = 300;
const FLICKER_MS = 400;
const FLICKER_CHANCE = 30;
const DOTS_PER_SWIMMER = 14;
const BODY_ALPHA = 0.5;
const TILE_URLS = Object.values(
  import.meta.glob('../assets/tiles/*.png', { eager: true, query: '?url', import: 'default' }),
) as string[];

const ease = (p: number) => 1 - Math.pow(1 - p, 3);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = url;
  });
}

function isFilled(shape: string[], ix: number, iy: number): boolean {
  return shape[iy]?.[ix] === '#';
}

function isEdge(shape: string[], ix: number, iy: number): boolean {
  return (
    !isFilled(shape, ix - 1, iy) ||
    !isFilled(shape, ix + 1, iy) ||
    !isFilled(shape, ix, iy - 1) ||
    !isFilled(shape, ix, iy + 1)
  );
}

function hash(a: number, b: number, c: number, d: number): number {
  return ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 2654435761)) >>> 0;
}

function cellPos(s: Swimmer, ix: number, iy: number) {
  const col = s.dir > 0 ? ix : s.width - 1 - ix;
  return { x: s.x + col * s.cell, y: s.y + iy * s.cell };
}

function spawn(images: HTMLImageElement[], count: number, w: number, h: number): Swimmer[] {
  return Array.from({ length: count }, (_, i) => {
    const shape = SHAPES[i % SHAPES.length];
    const cell = 6 + Math.floor(Math.random() * 4);
    return {
      shape,
      width: Math.max(...shape.map((row) => row.length)),
      img: images[(i * 5 + Math.floor(Math.random() * images.length)) % images.length],
      cell,
      x: Math.random() * w,
      y: ((i + 0.5) / count) * h * 0.9 + h * 0.05,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 12 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      wobble: 6 + Math.random() * 10,
    };
  });
}

export const MosaicField = forwardRef<MosaicHandle, MosaicFieldProps>(function MosaicField(
  { paused },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swimmersRef = useRef<Swimmer[]>([]);
  const assemblyRef = useRef<Assembly | null>(null);
  const hiddenRef = useRef<Set<string>>(new Set());
  const reducedRef = useRef(false);
  const redrawRef = useRef<() => void>(() => undefined);

  useImperativeHandle(ref, () => ({
    assemble: (rect) =>
      new Promise<void>((resolve) => {
        const swimmers = swimmersRef.current;
        if (reducedRef.current || swimmers.length === 0) {
          resolve();
          return;
        }
        const cx = rect.x + rect.size / 2;
        const cy = rect.y + rect.size / 2;
        const candidates: Array<{ swimmer: number; ix: number; iy: number; x: number; y: number; d: number }> = [];
        swimmers.forEach((s, si) => {
          s.shape.forEach((row, iy) => {
            for (let ix = 0; ix < row.length; ix += 1) {
              if (row[ix] !== '#') continue;
              const p = cellPos(s, ix, iy);
              candidates.push({ swimmer: si, ix, iy, x: p.x, y: p.y, d: Math.hypot(p.x - cx, p.y - cy) });
            }
          });
        });
        candidates.sort((a, b) => a.d - b.d);
        const total = GRID * GRID;
        const maxD = candidates[Math.min(total, candidates.length) - 1]?.d || 1;
        const slot = rect.size / GRID;
        const items: Flyer[] = Array.from({ length: total }, (_, i) => {
          const c = candidates[i % candidates.length];
          return {
            swimmer: c.swimmer,
            ix: c.ix,
            iy: c.iy,
            fromX: c.x,
            fromY: c.y,
            toX: rect.x + (i % GRID) * slot,
            toY: rect.y + Math.floor(i / GRID) * slot,
            delay: (c.d / maxD) * MAX_DELAY_MS,
          };
        });
        items.forEach((f) => hiddenRef.current.add(`${f.swimmer}:${f.ix}:${f.iy}`));
        assemblyRef.current = { start: performance.now(), items, rect, mode: 'in', resolve };
        redrawRef.current();
      }),
    disperse: () => {
      const a = assemblyRef.current;
      if (!a) return;
      if (reducedRef.current) {
        hiddenRef.current.clear();
        assemblyRef.current = null;
        redrawRef.current();
        return;
      }
      assemblyRef.current = { ...a, start: performance.now(), mode: 'out', resolve: () => undefined };
      redrawRef.current();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = media.matches;
    let raf = 0;
    let last = 0;
    let disposed = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawCell = (s: Swimmer, ix: number, iy: number, x: number, y: number, size: number) => {
      const sw = 64 / s.width;
      const sh = 64 / s.shape.length;
      ctx.drawImage(s.img, Math.floor(ix * sw), Math.floor(iy * sh), Math.ceil(sw), Math.ceil(sh), x, y, size, size);
    };

    const drawAssembly = (a: Assembly, now: number) => {
      ctx.globalAlpha = 1;
      const slot = a.rect.size / GRID;
      const elapsed = now - a.start;
      const dur = a.mode === 'in' ? IN_MS : OUT_MS;
      let done = true;
      a.items.forEach((f) => {
        const s = swimmersRef.current[f.swimmer];
        const p = clamp01((elapsed - (a.mode === 'in' ? f.delay : f.delay * 0.5)) / dur);
        if (p < 1) done = false;
        const e = ease(p);
        const origin = cellPos(s, f.ix, f.iy);
        const fromX = a.mode === 'in' ? f.fromX : f.toX;
        const fromY = a.mode === 'in' ? f.fromY : f.toY;
        const toX = a.mode === 'in' ? f.toX : origin.x;
        const toY = a.mode === 'in' ? f.toY : origin.y;
        const size = a.mode === 'in' ? s.cell + (slot - s.cell) * e : slot + (s.cell - slot) * e;
        drawCell(s, f.ix, f.iy, fromX + (toX - fromX) * e, fromY + (toY - fromY) * e, size);
      });
      if (done && a.mode === 'in') {
        a.resolve();
        a.resolve = () => undefined;
      }
      if (done && a.mode === 'out') {
        hiddenRef.current.clear();
        assemblyRef.current = null;
      }
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const bucket = Math.floor(now / FLICKER_MS);
      ctx.globalAlpha = BODY_ALPHA;
      swimmersRef.current.forEach((s, si) => {
        s.shape.forEach((row, iy) => {
          for (let ix = 0; ix < row.length; ix += 1) {
            if (row[ix] !== '#' || hiddenRef.current.has(`${si}:${ix}:${iy}`)) continue;
            if (isEdge(s.shape, ix, iy) && hash(ix, iy, si, bucket) % 100 < FLICKER_CHANCE) continue;
            const p = cellPos(s, ix, iy);
            drawCell(s, ix, iy, p.x, p.y, s.cell);
          }
        });
        for (let d = 0; d < DOTS_PER_SWIMMER; d += 1) {
          const back = (hash(d, si, 7, bucket) % 100) / 100;
          const jitter = ((hash(d, si, 11, bucket) % 100) / 100 - 0.5) * s.cell * s.shape.length;
          const dx = s.x + (s.dir > 0 ? -back * s.cell * 6 : s.width * s.cell + back * s.cell * 6);
          const dy = s.y + (s.shape.length * s.cell) / 2 + jitter;
          ctx.drawImage(s.img, (d * 7) % 62, (d * 11) % 62, 2, 2, dx, dy, 2, 2);
        }
      });
      if (assemblyRef.current) drawAssembly(assemblyRef.current, now);
      ctx.globalAlpha = 1;
    };

    const update = (dt: number) => {
      const w = window.innerWidth;
      const t = performance.now() / 1000;
      swimmersRef.current.forEach((s) => {
        s.x += s.dir * s.speed * dt;
        s.y += Math.sin(t * 0.3 + s.phase) * s.wobble * dt;
        const span = s.width * s.cell;
        if (s.dir > 0 && s.x > w + 40) s.x = -span - 40;
        if (s.dir < 0 && s.x < -span - 40) s.x = w + 40;
        s.y = Math.min(window.innerHeight - s.shape.length * s.cell, Math.max(0, s.y));
      });
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < FRAME_MS) return;
      const dt = (now - last) / 1000;
      last = now;
      update(Math.min(dt, 0.1));
      draw(now);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const start = () => {
      stop();
      resize();
      if (reducedRef.current || paused) {
        draw(performance.now());
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    redrawRef.current = () => {
      if (raf !== 0 || disposed) return;
      const once = (now: number) => {
        raf = 0;
        if (disposed) return;
        draw(now);
        if (assemblyRef.current) raf = requestAnimationFrame(once);
      };
      raf = requestAnimationFrame(once);
    };

    const onMedia = () => {
      reducedRef.current = media.matches;
      start();
    };

    Promise.all(TILE_URLS.map(loadImage)).then((images) => {
      if (disposed) return;
      const usable = images.filter((img) => img.naturalWidth > 0);
      if (usable.length === 0) return;
      const count = window.innerWidth >= 768 ? 6 : 3;
      swimmersRef.current = spawn(usable, count, window.innerWidth, window.innerHeight);
      start();
    });

    window.addEventListener('resize', start);
    media.addEventListener('change', onMedia);
    return () => {
      disposed = true;
      stop();
      window.removeEventListener('resize', start);
      media.removeEventListener('change', onMedia);
    };
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
});

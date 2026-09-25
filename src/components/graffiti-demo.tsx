import { useEffect, useRef } from "react";

type P = { x: number; y: number };

type Ink = {
  kind: "digit" | "shit";
  digit: number;
  pts: { x: number; y: number; on: boolean }[];
  lump: { x: number; y: number; r: number } | null;
};

const DIGITS = 3;
const FADE = 2.5;
const GRACE = 0.45;
const WRITE_SLOP = 22;
const SIZE = 250;
const RESAMPLE_N = 64;

const RAW: { d: number; pts: P[] }[] = [
  {
    d: 0,
    pts: [
      [50, 8], [72, 14], [88, 36], [90, 58], [74, 82], [50, 94], [26, 82], [10, 58], [12, 36], [28, 14], [50, 8],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 2,
    pts: [
      [18, 28], [36, 12], [64, 10], [84, 28], [78, 48], [52, 62], [28, 78], [18, 92], [48, 94], [82, 90],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 3,
    pts: [
      [22, 22], [48, 10], [76, 22], [84, 40], [62, 50], [40, 50], [68, 58], [86, 74], [64, 92], [32, 90], [18, 74],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 4,
    pts: [
      [72, 8], [28, 58], [86, 58], [70, 42], [68, 8], [68, 96],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 5,
    pts: [
      [78, 14], [28, 16], [24, 46], [48, 40], [76, 50], [84, 72], [62, 92], [28, 88], [16, 70],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 6,
    pts: [
      [72, 18], [46, 10], [22, 32], [18, 58], [28, 82], [52, 94], [76, 78], [72, 56], [48, 48], [26, 62],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 7,
    pts: [
      [16, 16], [84, 12], [62, 42], [46, 68], [34, 96],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 8,
    pts: [
      [50, 50], [28, 36], [22, 18], [42, 8], [68, 14], [78, 32], [62, 48], [50, 50], [32, 64], [28, 82], [48, 96], [74, 86], [80, 66], [62, 52],
    ].map(([x, y]) => ({ x, y })),
  },
  {
    d: 9,
    pts: [
      [58, 58], [32, 52], [18, 34], [28, 14], [54, 8], [78, 22], [80, 44], [62, 58], [58, 58], [64, 78], [60, 96],
    ].map(([x, y]) => ({ x, y })),
  },
];

function hypot(a: P, b: P) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(pts: P[]): P {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = pts.length || 1;
  return { x: x / n, y: y / n };
}

function pathLen(pts: P[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += hypot(pts[i - 1]!, pts[i]!);
  return l;
}

function resample(src: P[], n: number): P[] {
  if (src.length === 0) return [];
  const pts = src.map((p) => ({ ...p }));
  const I = Math.max(0.01, pathLen(pts) / (n - 1));
  const out: P[] = [{ ...pts[0]! }];
  let D = 0;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const d = hypot(prev, cur);
    if (D + d >= I) {
      const t = (I - D) / (d || 1);
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out.slice(0, n);
}

function rotateAround(pts: P[], rad: number): P[] {
  const c = centroid(pts);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: dx * cos - dy * sin + c.x, y: dx * sin + dy * cos + c.y };
  });
}

function indicative(pts: P[]) {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0]!.y, c.x - pts[0]!.x);
}

function scaleSquare(pts: P[], size: number): P[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  return pts.map((p) => ({ x: ((p.x - minX) / w) * size, y: ((p.y - minY) / h) * size }));
}

function translateOrigin(pts: P[]): P[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function pathDist(a: P[], b: P[]) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += hypot(a[i]!, b[i]!);
  return d / a.length;
}

function prep(pts: P[]): P[] {
  let p = resample(pts, RESAMPLE_N);
  p = rotateAround(p, -indicative(p));
  p = scaleSquare(p, SIZE);
  return translateOrigin(p);
}

const TEMPLATES = RAW.flatMap((t) => {
  const rev = [...t.pts].reverse();
  return [
    { d: t.d, pts: prep(t.pts) },
    { d: t.d, pts: prep(rev) },
  ];
});

function distAtBestAngle(pts: P[], tmpl: P[]) {
  let a = -Math.PI / 4;
  let b = Math.PI / 4;
  const thr = Math.PI / 90;
  const phi = 0.5 * (-1 + Math.sqrt(5));
  let x1 = phi * a + (1 - phi) * b;
  let f1 = pathDist(rotateAround(pts, x1), tmpl);
  let x2 = (1 - phi) * a + phi * b;
  let f2 = pathDist(rotateAround(pts, x2), tmpl);
  while (Math.abs(b - a) > thr) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = phi * a + (1 - phi) * b;
      f1 = pathDist(rotateAround(pts, x1), tmpl);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - phi) * a + phi * b;
      f2 = pathDist(rotateAround(pts, x2), tmpl);
    }
  }
  return Math.min(f1, f2);
}

function recognize(stroke: P[]): number | null {
  if (stroke.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const len = pathLen(stroke);
  if (h > 28 && w < h * 0.34 && len < h * 1.7) return 1;
  const cand = prep(stroke);
  let best = Infinity;
  let digit = -1;
  for (const t of TEMPLATES) {
    const d = distAtBestAngle(cand, t.pts);
    if (d < best) {
      best = d;
      digit = t.d;
    }
  }
  if (digit < 0 || best > 115) return null;
  return digit;
}

function sampleAlong(pts: P[], step: number): P[] {
  if (pts.length === 0) return [];
  const out: P[] = [{ ...pts[0]! }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]!;
    const b = pts[i]!;
    let d = hypot(a, b);
    if (d < 0.001) continue;
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(q);
      d = hypot(q, b);
      a = q;
      acc = 0;
    }
    acc += d;
  }
  const last = pts[pts.length - 1]!;
  if (hypot(out[out.length - 1]!, last) > 1) out.push({ ...last });
  return out;
}

function bounds(pts: P[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function scaleMinHeight(pts: P[], minH: number): P[] {
  const b = bounds(pts);
  if (b.h >= minH || b.h < 1) return pts.map((p) => ({ ...p }));
  const s = minH / b.h;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return pts.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
}

function fitInside(pts: P[], w: number, h: number, floor: number): P[] {
  const b = bounds(pts);
  const m = 18;
  let dx = 0;
  let dy = 0;
  if (b.minX < m) dx = m - b.minX;
  else if (b.maxX > w - m) dx = w - m - b.maxX;
  if (b.minY < m + 52) dy = m + 52 - b.minY;
  else if (b.maxY > floor - 10) dy = floor - 10 - b.maxY;
  if (dx === 0 && dy === 0) return pts;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function GraffitiDemo({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sim = {
      w: 360,
      h: 640,
      dpr: 1,
      ball: { x: 80, y: 400, vx: 0, vy: 0, r: 18 },
      hoopSide: 1,
      paint: DIGITS,
      score: 0,
      makes: 0,
      inks: [] as Ink[],
      life: null as number | null,
      grace: 0,
      stroke: null as { pts: P[]; writing: boolean; x: number; y: number } | null,
      flash: "",
      flashT: 0,
      scoreLock: 0,
      running: true,
      placed: false,
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sim.w = Math.max(1, rect.width);
      sim.h = Math.max(1, rect.height);
      sim.dpr = dpr;
      canvas.width = Math.round(sim.w * dpr);
      canvas.height = Math.round(sim.h * dpr);
      sim.ball.r = Math.min(sim.w, sim.h) * 0.042;
      if (!sim.placed) {
        sim.ball.x = sim.w * 0.22;
        sim.ball.y = floorY() - sim.ball.r;
        sim.placed = true;
      } else if (sim.ball.y > floorY() - sim.ball.r) {
        sim.ball.y = floorY() - sim.ball.r;
      }
    };

    const floorY = () => sim.h * 0.86;
    const hoop = () => {
      const y = floorY() - sim.h * 0.36;
      const inner = Math.max(sim.ball.r * 4.4, sim.w * 0.18);
      const x = sim.hoopSide > 0 ? sim.w * 0.74 : sim.w * 0.26;
      return { x, y, inner, tube: Math.max(4, sim.ball.r * 0.28) };
    };

    const say = (text: string) => {
      sim.flash = text;
      sim.flashT = 1.4;
    };

    const digitCount = () => sim.inks.filter((k) => k.kind === "digit").length;

    const commit = () => {
      if (sim.inks.length === 0) return;
      sim.life = FADE;
      sim.grace = 0;
    };

    const clearInks = () => {
      sim.inks = [];
      sim.life = null;
      sim.grace = 0;
    };

    const numberValue = () => {
      const s = sim.inks
        .filter((k) => k.kind === "digit")
        .map((k) => String(k.digit))
        .join("");
      return s ? Number(s) : 0;
    };

    const digitsDone = () =>
      sim.inks.filter((k) => k.kind === "digit").every((k) => k.pts.every((p) => !p.on));

    const jump = () => {
      const g = sim.h * 2.55;
      const rise = sim.h * 0.42;
      sim.ball.vy = -Math.sqrt(2 * g * rise);
      sim.ball.vx = sim.hoopSide * sim.w * 0.92;
    };

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      jump();
      sim.stroke = { pts: [p], writing: false, x: p.x, y: p.y };
    };

    const onMove = (e: PointerEvent) => {
      const s = sim.stroke;
      if (!s) return;
      const p = local(e);
      const moved = Math.hypot(p.x - s.x, p.y - s.y);
      if (!s.writing) {
        if (moved < WRITE_SLOP) return;
        if (sim.life !== null) {
          say("等这一笔消失");
          s.writing = true;
          s.pts = [];
          return;
        }
        if (sim.paint < 1) {
          say("颜料不够");
          s.writing = true;
          s.pts = [];
          return;
        }
        if (digitCount() >= DIGITS) {
          say("最多三个数字");
          s.writing = true;
          s.pts = [];
          return;
        }
        sim.paint -= 1;
        sim.grace = 0;
        s.writing = true;
        s.pts = [
          { x: s.x, y: s.y },
          p,
        ];
        return;
      }
      if (s.pts.length === 0) return;
      const last = s.pts[s.pts.length - 1]!;
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2.5) return;
      s.pts.push(p);
    };

    const onUp = (e: PointerEvent) => {
      const s = sim.stroke;
      sim.stroke = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (!s || !s.writing || s.pts.length < 2) return;
      const digit = recognize(s.pts);
      const minH = sim.ball.r * 2 * 3;
      if (digit === null) {
        const c = centroid(s.pts);
        sim.inks.push({
          kind: "shit",
          digit: -1,
          pts: [],
          lump: { x: c.x, y: c.y, r: sim.ball.r * 1.55 },
        });
        say("你画了一坨屎");
      } else {
        let pts = scaleMinHeight(s.pts, minH);
        pts = fitInside(pts, sim.w, sim.h, floorY());
        const sampled = sampleAlong(pts, 8).map((p) => ({ ...p, on: true }));
        sim.inks.push({ kind: "digit", digit, pts: sampled, lump: null });
      }
      if (digitCount() >= DIGITS) commit();
      else sim.grace = GRACE;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    let raf = 0;

    const step = (dt: number) => {
      const b = sim.ball;
      const g = sim.h * 2.55;
      b.vy += g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const floor = floorY();
      if (b.y + b.r > floor) {
        b.y = floor - b.r;
        if (b.vy > 0) b.vy *= -0.42;
        b.vx *= 0.84;
      }
      if (b.x < b.r) {
        b.x = b.r;
        b.vx = Math.abs(b.vx) * 0.55;
      } else if (b.x > sim.w - b.r) {
        b.x = sim.w - b.r;
        b.vx = -Math.abs(b.vx) * 0.55;
      }
      if (b.y < b.r) {
        b.y = b.r;
        if (b.vy < 0) b.vy *= -0.3;
      }

      const h = hoop();
      const rims = [
        { x: h.x - h.inner / 2, y: h.y },
        { x: h.x + h.inner / 2, y: h.y },
      ];
      for (const rim of rims) {
        const dx = b.x - rim.x;
        const dy = b.y - rim.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const min = b.r + h.tube;
        if (d >= min) continue;
        const nx = dx / d;
        const ny = dy / d;
        b.x = rim.x + nx * min;
        b.y = rim.y + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.35 * vn * nx;
          b.vy -= 1.35 * vn * ny;
        }
      }

      sim.scoreLock = Math.max(0, sim.scoreLock - dt);
      const through =
        b.vy > 40 &&
        b.y > h.y &&
        b.y < h.y + b.r * 1.4 &&
        Math.abs(b.x - h.x) < h.inner / 2 - b.r * 0.15;
      if (through && sim.scoreLock <= 0) {
        sim.scoreLock = 0.7;
        sim.makes += 1;
        sim.paint = Math.min(DIGITS, sim.paint + 1);
        sim.hoopSide *= -1;
        say("进球  +1格颜料");
      }

      const eatR = b.r * 0.5;
      for (const ink of sim.inks) {
        if (ink.kind === "shit" && ink.lump) {
          const d = Math.hypot(b.x - ink.lump.x, b.y - ink.lump.y);
          if (d < ink.lump.r + b.r * 0.15) {
            ink.lump = null;
            sim.paint = Math.min(DIGITS, sim.paint + 0.8);
            say("收回八成");
          }
        } else {
          for (const p of ink.pts) {
            if (!p.on) continue;
            if (Math.hypot(b.x - p.x, b.y - p.y) <= eatR) p.on = false;
          }
        }
      }
      sim.inks = sim.inks.filter((ink) => (ink.kind === "shit" ? ink.lump !== null : true));

      const hasDigits = sim.inks.some((k) => k.kind === "digit");
      if (hasDigits && digitsDone()) {
        const n = numberValue();
        sim.score += n;
        say(`+${n}`);
        sim.inks = sim.inks.filter((k) => k.kind !== "digit");
        if (sim.inks.length === 0) {
          sim.life = null;
          sim.grace = 0;
        }
      }

      if (sim.life === null && sim.grace > 0) {
        sim.grace -= dt;
        if (sim.grace <= 0) commit();
      }
      if (sim.life !== null) {
        sim.life -= dt;
        if (sim.life <= 0) {
          const leftover = sim.inks.some(
            (k) => k.kind === "digit" && k.pts.some((p) => p.on),
          );
          if (leftover) say("没吃干净");
          clearInks();
        }
      }
      if (sim.flashT > 0) sim.flashT -= dt;
    };

    const draw = () => {
      const dpr = sim.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = sim.w;
      const h = sim.h;
      ctx.clearRect(0, 0, w, h);
      const gdt = ctx.createLinearGradient(0, 0, 0, h);
      gdt.addColorStop(0, "#1c2430");
      gdt.addColorStop(1, "#12171e");
      ctx.fillStyle = gdt;
      ctx.fillRect(0, 0, w, h);

      const floor = floorY();
      ctx.fillStyle = "#2a3340";
      ctx.fillRect(0, floor, w, h - floor);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(0, floor);
      ctx.lineTo(w, floor);
      ctx.stroke();

      const hp = hoop();
      ctx.strokeStyle = "#d7dde6";
      ctx.lineWidth = hp.tube;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hp.x - hp.inner / 2, hp.y);
      ctx.lineTo(hp.x + hp.inner / 2, hp.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      const netTop = hp.y;
      for (let i = 0; i <= 4; i++) {
        const x = hp.x - hp.inner / 2 + (hp.inner * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x, netTop);
        ctx.lineTo(hp.x - hp.inner / 4 + (hp.inner * i) / 8, netTop + sim.ball.r * 2.2);
        ctx.stroke();
      }

      const fade = sim.life === null ? 1 : Math.max(0, sim.life / FADE);
      const brush = Math.max(6, sim.ball.r * 0.55);
      for (const ink of sim.inks) {
        if (ink.kind === "shit" && ink.lump) {
          ctx.fillStyle = `rgba(90,62,42,${0.9 * fade})`;
          ctx.beginPath();
          ctx.arc(ink.lump.x, ink.lump.y, ink.lump.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#f2efe6";
          ctx.font = "700 18px 'Noto Sans SC', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("你画了一坨屎", ink.lump.x, ink.lump.y - ink.lump.r - 10);
          continue;
        }
        ctx.lineWidth = brush;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = `rgba(236, 230, 210, ${0.95 * fade})`;
        ctx.beginPath();
        let started = false;
        for (const p of ink.pts) {
          if (!p.on) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      const live = sim.stroke;
      if (live && live.writing && live.pts.length > 1) {
        ctx.strokeStyle = "rgba(236,230,210,0.7)";
        ctx.lineWidth = brush;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(live.pts[0]!.x, live.pts[0]!.y);
        for (const p of live.pts) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      const b = sim.ball;
      const grd = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.2, b.x, b.y, b.r);
      grd.addColorStop(0, "#f7f1dc");
      grd.addColorStop(0.55, "#e2b15a");
      grd.addColorStop(1, "#8a5a28");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f4f0e6";
      ctx.font = "700 22px 'Noto Sans SC', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`分数 ${sim.score}`, 16, 32);
      ctx.font = "500 13px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = "rgba(244,240,230,0.8)";
      ctx.fillText(`进球 ${sim.makes}`, 16, 52);

      const barX = 16;
      const barY = 64;
      const barW = Math.min(180, w * 0.46);
      const barH = 14;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#e2b15a";
      ctx.fillRect(barX, barY, barW * (sim.paint / DIGITS), barH);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      for (let i = 1; i < DIGITS; i++) {
        const x = barX + (barW * i) / DIGITS;
        ctx.beginPath();
        ctx.moveTo(x, barY);
        ctx.lineTo(x, barY + barH);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(244,240,230,0.75)";
      ctx.font = "500 12px 'Noto Sans SC', sans-serif";
      ctx.fillText("颜料", barX + barW + 8, barY + 12);

      if (sim.life !== null) {
        ctx.fillStyle = "rgba(244,240,230,0.85)";
        ctx.textAlign = "right";
        ctx.fillText(`${sim.life.toFixed(1)}s`, w - 16, 32);
      }

      if (sim.flashT > 0) {
        ctx.globalAlpha = Math.min(1, sim.flashT);
        ctx.fillStyle = "#fff";
        ctx.font = "700 20px 'Noto Sans SC', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(sim.flash, w / 2, h * 0.22);
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = "rgba(244,240,230,0.55)";
      ctx.font = "500 12px 'Noto Sans SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("点按起跳。滑动写数字，一笔一个，最多三个。", w / 2, h - 18);
    };

    const frame = (now: number) => {
      if (!sim.running) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      sim.running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#12171e] text-[#f4f0e6]">
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-end p-3">
        <button
          type="button"
          onClick={() => closeRef.current()}
          className="pointer-events-auto rounded-md border border-white/20 px-3 py-1.5 text-sm"
        >
          返回
        </button>
      </div>
      <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ touchAction: "none" }} />
    </div>
  );
}

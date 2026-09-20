import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  beamLocalOffset,
  coneGeometry,
  defaultSearchlightLayout,
  drawEmitEllipse,
  drawSearchlightBeam,
  emitMajorEnds,
  expandedLights,
  FLOOR_Y_FRAC,
  loadSearchlightLayout,
  placementEmit,
  placementPivot,
  saveSearchlightLayout,
  spriteSize,
  wallQuad,
  worldBeamAngle,
  type SearchlightLayout,
  type SearchlightPlacement,
} from "@/game/searchlight-layout";
import { cn } from "@/lib/utils";

type Tool = "move" | "pivot" | "emit" | "rotate" | "scale";
type EmitSub = "center" | "rx" | "ry" | "ellipse" | "cone";

const WALL_SRC = "/game/scenes/prison/wall.png?v=6";
const COURT_SRC = "/game/scenes/prison/court.jpg?v=2";

type Drag =
  | { kind: "move"; ox: number; oy: number; lx: number; ly: number }
  | { kind: "pivot" }
  | { kind: "emit-center" }
  | { kind: "emit-rx" }
  | { kind: "emit-ry" }
  | { kind: "emit-ellipse" }
  | { kind: "emit-cone" }
  | { kind: "rotate"; startBody: number; startBeamOff: number; startPointer: number }
  | { kind: "scale"; startDist: number; startScale: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** Map pointer depth behind the aperture → authored half-angle. */
function coneFromPointer(
  world: { w: number; floorY: number },
  light: SearchlightPlacement,
  p: { x: number; y: number },
  quad: ReturnType<typeof wallQuad>,
) {
  const { emit, major } = emitMajorEnds(world, light, light.angle, quad);
  const beamAng = worldBeamAngle(light, light.angle, world, quad);
  const bx = Math.cos(beamAng);
  const by = Math.sin(beamAng);
  // Positive depth behind the mouth (opposite outward beam) — construction only.
  const back = Math.max(major * 1.05, -((p.x - emit.x) * bx + (p.y - emit.y) * by));
  return clamp(Math.atan(major / back), 0.035, 0.55);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawLamp(
  ctx: CanvasRenderingContext2D,
  world: { w: number; floorY: number },
  light: SearchlightPlacement,
  sprite: HTMLImageElement | null,
  quad: ReturnType<typeof wallQuad>,
  selected: boolean,
) {
  const piv = placementPivot(world, light, quad);
  const { dw, dh } = spriteSize(light, world.w, quad.dw);
  ctx.save();
  ctx.translate(piv.x, piv.y);
  ctx.rotate(light.angle);
  if (light.flipX) ctx.scale(-1, 1);
  ctx.translate(-light.pivotU * dw, -light.pivotV * dh);
  if (sprite) ctx.drawImage(sprite, 0, 0, dw, dh);
  else {
    ctx.fillStyle = "#d4b45a";
    ctx.fillRect(0, 0, dw, dh);
  }
  if (selected) {
    ctx.strokeStyle = "rgba(80, 200, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, dw - 1, dh - 1);
  }
  ctx.restore();
}

export function SearchlightEditor({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<SearchlightLayout>(() => loadSearchlightLayout());
  const [tool, setTool] = useState<Tool>("move");
  const [emitSub, setEmitSub] = useState<EmitSub>("center");
  const [preview, setPreview] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const arts = useRef<{ wall: HTMLImageElement | null; court: HTMLImageElement | null; sprite: HTMLImageElement | null }>({
    wall: null,
    court: null,
    sprite: null,
  });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const previewRef = useRef(preview);
  previewRef.current = preview;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const patchLeft = useCallback((patch: Partial<SearchlightPlacement>) => {
    setLayout((prev) => ({
      ...prev,
      light: { ...prev.light, ...patch, id: "left", side: "left", flipX: false },
    }));
    setDirty(true);
  }, []);

  const metrics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Full canvas (same as tall phones). Lamp UV is on the wall quad, not the screen.
    const w = canvas.width;
    const h = canvas.height;
    const floorY = h * FLOOR_Y_FRAC;
    const wall = arts.current.wall;
    const quad = wallQuad(
      { w, floorY },
      wall?.naturalWidth || undefined,
      wall?.naturalHeight || undefined,
    );
    return { w, h, floorY, quad };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const m = metrics();
    if (!canvas || !m) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, floorY, quad } = m;
    const { wall, court, sprite } = arts.current;
    const left = layoutRef.current.light;
    const lights = expandedLights(layoutRef.current);
    const showPreview = previewRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1b2430";
    ctx.fillRect(0, 0, w, h);

    const skyH = Math.max(1, quad.oy);
    const g = ctx.createLinearGradient(0, 0, 0, skyH);
    g.addColorStop(0, "#3f81d1");
    g.addColorStop(1, "#b7ddfb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, floorY);

    if (wall) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(wall, 0, 0, wall.naturalWidth, wall.naturalHeight * 0.962, quad.ox, quad.oy, quad.dw, quad.dh);
    }

    if (court) ctx.drawImage(court, 0, floorY, w, h - floorY);
    else {
      ctx.fillStyle = "#7d8b94";
      ctx.fillRect(0, floorY, w, h - floorY);
    }
    ctx.fillStyle = "rgba(28, 32, 38, 0.42)";
    ctx.fillRect(0, floorY, w, 2);

    // Optional dim once under everything interactive.
    if (showPreview) {
      ctx.save();
      ctx.fillStyle = "rgba(4, 8, 14, 0.42)";
      ctx.fillRect(0, 0, w, floorY + (h - floorY) * 0.35);
      ctx.restore();
    }

    for (const light of lights) {
      const isLeft = light.side === "left";
      drawLamp(ctx, { w, floorY }, light, sprite, quad, isLeft);

      const piv = placementPivot({ w, floorY }, light, quad);
      const r = Math.max(6, w * 0.012);

      ctx.save();
      ctx.strokeStyle = isLeft ? "#ff4d6a" : "rgba(255,77,106,0.35)";
      ctx.fillStyle = isLeft ? "#ff4d6a" : "rgba(255,77,106,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(piv.x - r, piv.y);
      ctx.lineTo(piv.x + r, piv.y);
      ctx.moveTo(piv.x, piv.y - r);
      ctx.lineTo(piv.x, piv.y + r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(piv.x, piv.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawEmitEllipse(ctx, { w, floorY }, light, light.angle, quad, {
        fill: !showPreview,
        stroke: isLeft ? "rgba(255,224,102,0.95)" : "rgba(255,224,102,0.35)",
      });

      if (isLeft) {
        const geo = coneGeometry({ w, floorY }, light, light.angle, quad);
        ctx.save();
        // Major lip (beam starts here)
        ctx.strokeStyle = "rgba(255,176,32,0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(geo.p1.x, geo.p1.y);
        ctx.lineTo(geo.p2.x, geo.p2.y);
        ctx.stroke();
        ctx.fillStyle = "#ffb020";
        for (const pt of [geo.p1, geo.p2]) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Outward tangent edges (virtual apex is not drawn as light)
        ctx.strokeStyle = "rgba(120, 220, 255, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(geo.p1.x, geo.p1.y);
        ctx.lineTo(geo.f1.x, geo.f1.y);
        ctx.moveTo(geo.p2.x, geo.p2.y);
        ctx.lineTo(geo.f2.x, geo.f2.y);
        ctx.stroke();
        // Beam axis toward court center
        const axis = Math.max(48, geo.reach * 0.35);
        ctx.strokeStyle = "rgba(120, 220, 255, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(geo.emit.x, geo.emit.y);
        ctx.lineTo(
          geo.emit.x + Math.cos(geo.beamAng) * axis,
          geo.emit.y + Math.sin(geo.beamAng) * axis,
        );
        ctx.stroke();
        if (emitSub === "cone") {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = "rgba(120, 220, 255, 0.45)";
          ctx.beginPath();
          ctx.moveTo(geo.apex.x, geo.apex.y);
          ctx.lineTo(geo.p1.x, geo.p1.y);
          ctx.moveTo(geo.apex.x, geo.apex.y);
          ctx.lineTo(geo.p2.x, geo.p2.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(120, 220, 255, 0.55)";
          ctx.beginPath();
          ctx.arc(geo.apex.x, geo.apex.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Cones above lamp art (editor has no ball; still topmost).
    if (showPreview) {
      for (const light of lights) {
        drawSearchlightBeam(ctx, { w, floorY, h }, light, {
          bodyAngle: light.angle,
          quad,
        });
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `600 ${Math.round(w * 0.028)}px system-ui,sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("监狱 · 探照灯布置（只编左灯，右灯自动镜像）", w * 0.04, h * 0.045);
  }, [metrics, emitSub]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const [wall, court, sprite] = await Promise.all([
        loadImage(WALL_SRC),
        loadImage(COURT_SRC),
        loadImage(layout.spriteSrc),
      ]);
      if (dead) return;
      arts.current = { wall, court, sprite };
      draw();
    })();
    return () => {
      dead = true;
    };
  }, [layout.spriteSrc, draw]);

  useEffect(() => {
    draw();
  }, [layout, tool, emitSub, preview, draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.max(1, rect.width)}px`;
      canvas.style.height = `${Math.max(1, rect.height)}px`;
      canvas.width = Math.round(Math.max(1, rect.width) * dpr);
      canvas.height = Math.round(Math.max(1, rect.height) * dpr);
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  const clientToWorld = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    const m = metrics();
    if (!canvas || !m) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * m.w,
      y: ((e.clientY - rect.top) / rect.height) * m.h,
    };
  };

  const worldToSpriteUv = (light: SearchlightPlacement, wx: number, wy: number, m: NonNullable<ReturnType<typeof metrics>>) => {
    const { w, floorY, quad } = m;
    const { dw, dh } = spriteSize(light, w, m.quad.dw);
    const piv = placementPivot({ w, floorY }, light, quad);
    const lx = wx - piv.x;
    const ly = wy - piv.y;
    const c = Math.cos(-light.angle);
    const s = Math.sin(-light.angle);
    let localX = lx * c - ly * s;
    let localY = lx * s + ly * c;
    if (light.flipX) localX = -localX;
    return { u: (localX + light.pivotU * dw) / dw, v: (localY + light.pivotV * dh) / dh, dw };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    const m = metrics();
    if (!canvas || !m) return;
    canvas.setPointerCapture(e.pointerId);
    const p = clientToWorld(e);
    const light = layoutRef.current.light;
    const { w, floorY, quad } = m;
    const piv = placementPivot({ w, floorY }, light, quad);
    const emit = placementEmit({ w, floorY }, light, light.angle, quad);

    if (tool === "move") {
      dragRef.current = { kind: "move", ox: p.x, oy: p.y, lx: light.x, ly: light.y };
    } else if (tool === "pivot") {
      dragRef.current = { kind: "pivot" };
      const uv = worldToSpriteUv(light, p.x, p.y, m);
      patchLeft({
        pivotU: clamp(uv.u, 0, 1),
        pivotV: clamp(uv.v, 0, 1),
        x: clamp((p.x - quad.ox) / quad.dw, 0, 1),
        y: clamp((p.y - quad.oy) / quad.dh, 0, 1),
      });
    } else if (tool === "emit") {
      if (emitSub === "center") {
        dragRef.current = { kind: "emit-center" };
        const uv = worldToSpriteUv(light, p.x, p.y, m);
        patchLeft({ emitU: clamp(uv.u, 0, 1), emitV: clamp(uv.v, 0, 1) });
      } else if (emitSub === "rx") {
        dragRef.current = { kind: "emit-rx" };
        const dist = Math.hypot(p.x - emit.x, p.y - emit.y);
        patchLeft({ emitRX: clamp(dist / spriteSize(light, w, quad.dw).dw, 0.03, 0.7) });
      } else if (emitSub === "ry") {
        dragRef.current = { kind: "emit-ry" };
        const dist = Math.hypot(p.x - emit.x, p.y - emit.y);
        patchLeft({ emitRY: clamp(dist / spriteSize(light, w, quad.dw).dw, 0.03, 0.7) });
      } else if (emitSub === "ellipse") {
        dragRef.current = { kind: "emit-ellipse" };
        patchLeft({ emitRot: Math.atan2(p.y - emit.y, p.x - emit.x) - light.angle });
      } else {
        dragRef.current = { kind: "emit-cone" };
        patchLeft({ cone: coneFromPointer({ w, floorY }, light, p, quad) });
      }
    } else if (tool === "rotate") {
      // Rotate lamp; beam stays ⊥ ellipse major via beamLocalOffset.
      const startPointer = Math.atan2(p.y - piv.y, p.x - piv.x);
      dragRef.current = {
        kind: "rotate",
        startBody: light.angle,
        startBeamOff: beamLocalOffset(light, { w, floorY }, light.angle, quad),
        startPointer,
      };
    } else if (tool === "scale") {
      dragRef.current = {
        kind: "scale",
        startDist: Math.hypot(p.x - piv.x, p.y - piv.y) || 1,
        startScale: light.scale,
      };
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const m = metrics();
    if (!drag || !m) return;
    const p = clientToWorld(e);
    const light = layoutRef.current.light;
    const { w, floorY, quad } = m;
    const piv = placementPivot({ w, floorY }, light, quad);
    const emit = placementEmit({ w, floorY }, light, light.angle, quad);
    const { dw } = spriteSize(light, w, quad.dw);

    if (drag.kind === "move") {
      patchLeft({
        x: clamp(drag.lx + (p.x - drag.ox) / quad.dw, 0, 1),
        y: clamp(drag.ly + (p.y - drag.oy) / quad.dh, 0, 1),
      });
    } else if (drag.kind === "pivot") {
      const uv = worldToSpriteUv(light, p.x, p.y, m);
      patchLeft({
        pivotU: clamp(uv.u, 0, 1),
        pivotV: clamp(uv.v, 0, 1),
        x: clamp((p.x - quad.ox) / quad.dw, 0, 1),
        y: clamp((p.y - quad.oy) / quad.dh, 0, 1),
      });
    } else if (drag.kind === "emit-center") {
      const uv = worldToSpriteUv(light, p.x, p.y, m);
      patchLeft({ emitU: clamp(uv.u, 0, 1), emitV: clamp(uv.v, 0, 1) });
    } else if (drag.kind === "emit-rx") {
      patchLeft({ emitRX: clamp(Math.hypot(p.x - emit.x, p.y - emit.y) / dw, 0.03, 0.7) });
    } else if (drag.kind === "emit-ry") {
      patchLeft({ emitRY: clamp(Math.hypot(p.x - emit.x, p.y - emit.y) / dw, 0.03, 0.7) });
    } else if (drag.kind === "emit-ellipse") {
      patchLeft({ emitRot: Math.atan2(p.y - emit.y, p.x - emit.x) - light.angle });
    } else if (drag.kind === "emit-cone") {
      patchLeft({ cone: coneFromPointer({ w, floorY }, light, p, quad) });
    } else if (drag.kind === "rotate") {
      const pointer = Math.atan2(p.y - piv.y, p.x - piv.x);
      const delta = pointer - drag.startPointer;
      // Keep preferred beam side; actual beam stays ⊥ major via beamLocalOffset.
      patchLeft({ angle: drag.startBody + delta, beamOffset: drag.startBeamOff });
    } else if (drag.kind === "scale") {
      const dist = Math.hypot(p.x - piv.x, p.y - piv.y) || 1;
      patchLeft({ scale: clamp(drag.startScale * (dist / drag.startDist), 0.04, 0.45) });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onSave = () => {
    saveSearchlightLayout(layout);
    setDirty(false);
    flash("已保存（右灯自动镜像左灯）");
  };

  const onReset = () => {
    setLayout(defaultSearchlightLayout());
    setDirty(true);
    flash("已恢复默认（未保存）");
  };

  const onExport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(layout, null, 2));
      flash("JSON 已复制");
    } catch {
      flash("复制失败");
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex justify-center bg-black/80">
      <div className="relative flex h-full w-full max-w-[min(100%,calc(100dvh*9/16))] flex-col">
        <div ref={wrapRef} className="relative min-h-0 flex-1">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {toast ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span className="rounded-full bg-black/70 px-3 py-1.5 text-sm text-white">{toast}</span>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#12161c] px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs tracking-widest text-white/50">探照灯布置{dirty ? " · 未保存" : ""}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm",
                  preview ? "bg-amber-400 text-black" : "border border-white/15 text-white/80",
                )}
              >
                {preview ? "预览开" : "预览关"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md border border-white/15 px-3 text-sm text-white/80"
              >
                关闭
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-5 gap-1">
            {(
              [
                ["move", "移动"],
                ["pivot", "锚点"],
                ["emit", "发光源"],
                ["rotate", "旋转"],
                ["scale", "缩放"],
              ] as [Tool, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTool(id)}
                className={cn(
                  "h-9 rounded-md text-sm font-medium",
                  tool === id ? "bg-sky-500 text-white" : "border border-white/15 text-white/80",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tool === "emit" ? (
            <div className="mb-2 grid grid-cols-5 gap-1">
              {(
                [
                  ["center", "圆心"],
                  ["rx", "横轴"],
                  ["ry", "纵轴"],
                  ["ellipse", "椭圆角"],
                  ["cone", "张角"],
                ] as [EmitSub, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEmitSub(id)}
                  className={cn(
                    "h-8 rounded-md text-xs font-medium",
                    emitSub === id ? "bg-yellow-400 text-black" : "border border-white/15 text-white/75",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <p className="mb-2 text-xs leading-relaxed text-white/45">
            {tool === "move" && "拖动左灯。右灯始终水平翻转复制左灯全部设置。"}
            {tool === "pivot" && "设置旋转锚点（红十字）。"}
            {tool === "emit" && emitSub === "center" && "拖动椭圆圆心（灯罩口）。"}
            {tool === "emit" && emitSub === "rx" && "拖动设定椭圆横半轴（长边 = 灯罩口宽度）。"}
            {tool === "emit" && emitSub === "ry" && "拖动设定椭圆纵半轴。"}
            {tool === "emit" && emitSub === "ellipse" && "旋转椭圆；光束中线始终垂直于长轴。"}
            {tool === "emit" &&
              emitSub === "cone" &&
              "沿光束反方向拖调张角：越小边缘越平行。看不见灯内发光；椭圆口发光，光束从椭圆向外射、两边贴长轴两端。"}
            {tool === "rotate" && "旋转灯体；光束朝向地图中心一侧，并保持垂直于椭圆长轴。"}
            {tool === "scale" && "缩放左灯贴图。"}
          </p>

          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={onSave} className="h-10 rounded-md bg-emerald-500 text-sm font-semibold text-black">
              保存
            </button>
            <button type="button" onClick={onExport} className="h-10 rounded-md border border-white/15 text-sm text-white/85">
              复制 JSON
            </button>
            <button type="button" onClick={onReset} className="h-10 rounded-md border border-white/15 text-sm text-white/85">
              默认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, type CSSProperties } from "react";

type Point = { x: number; y: number };
type Mesh = { points: Point[]; edges: [number, number][]; outline: Point[] };

export type ParticleHorseProps = {
  opacity?: number;
  speed?: number;
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
};

const W = 1200;
const H = 680;

/*
 * These outlines are authored as an equine side profile, not assembled from
 * generic geometric blocks. The canvas mesh is sampled inside each silhouette.
 * The horse faces right.
 */
const BODY: Point[] = [
  { x: 292, y: 275 }, { x: 305, y: 239 }, { x: 332, y: 217 },
  { x: 376, y: 203 }, { x: 431, y: 201 }, { x: 489, y: 207 },
  { x: 545, y: 213 }, { x: 594, y: 215 }, { x: 634, y: 225 },
  { x: 673, y: 246 }, { x: 697, y: 277 }, { x: 704, y: 312 },
  { x: 696, y: 349 }, { x: 675, y: 380 }, { x: 638, y: 397 },
  { x: 589, y: 405 }, { x: 531, y: 403 }, { x: 474, y: 390 },
  { x: 420, y: 372 }, { x: 373, y: 350 }, { x: 333, y: 322 },
  { x: 306, y: 298 },
];

const NECK: Point[] = [
  { x: 625, y: 256 }, { x: 654, y: 226 }, { x: 680, y: 193 },
  { x: 700, y: 158 }, { x: 724, y: 125 }, { x: 748, y: 98 },
  { x: 773, y: 80 }, { x: 799, y: 77 }, { x: 818, y: 91 },
  { x: 818, y: 111 }, { x: 800, y: 139 }, { x: 785, y: 173 },
  { x: 770, y: 210 }, { x: 753, y: 246 }, { x: 730, y: 278 },
  { x: 700, y: 303 }, { x: 672, y: 309 }, { x: 647, y: 291 },
];

const HEAD: Point[] = [
  { x: 794, y: 101 }, { x: 808, y: 81 }, { x: 829, y: 72 },
  { x: 851, y: 77 }, { x: 873, y: 91 }, { x: 895, y: 106 },
  { x: 913, y: 127 }, { x: 925, y: 149 }, { x: 925, y: 165 },
  { x: 915, y: 180 }, { x: 895, y: 185 }, { x: 875, y: 178 },
  { x: 854, y: 167 }, { x: 836, y: 153 }, { x: 819, y: 137 },
  { x: 805, y: 119 },
];

const EAR_NEAR: Point[] = [
  { x: 812, y: 88 }, { x: 802, y: 40 }, { x: 832, y: 79 },
];
const EAR_FAR: Point[] = [
  { x: 830, y: 79 }, { x: 850, y: 45 }, { x: 849, y: 91 },
];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function noise(x: number, y: number, seed: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function inside(p: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 0.00001) + a.x) {
      result = !result;
    }
  }
  return result;
}

function makeMesh(outline: Point[], spacing: number, seed: number): Mesh {
  const minX = Math.min(...outline.map(p => p.x));
  const maxX = Math.max(...outline.map(p => p.x));
  const minY = Math.min(...outline.map(p => p.y));
  const maxY = Math.max(...outline.map(p => p.y));
  const points: Point[] = [];

  let row = 0;
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing * 0.86, row++) {
    const offset = row % 2 ? spacing * 0.5 : 0;
    for (let x = minX + spacing * 0.5 + offset; x < maxX; x += spacing) {
      const p = {
        x: x + (noise(x, y, seed) - 0.5) * spacing * 0.18,
        y: y + (noise(y, x, seed + 3) - 0.5) * spacing * 0.18,
      };
      if (inside(p, outline)) points.push(p);
    }
  }

  // Reinforce the silhouette with evenly spaced perimeter particles.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (spacing * 0.55)));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  const buckets = new Map<string, number[]>();
  const cellSize = spacing * 1.55;
  const keyFor = (p: Point) => `${Math.floor(p.x / cellSize)}:${Math.floor(p.y / cellSize)}`;
  points.forEach((p, index) => {
    const key = keyFor(p);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });

  const edges: [number, number][] = [];
  const maxD = spacing * 1.66;
  const maxD2 = maxD * maxD;
  points.forEach((p, index) => {
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const bucket = buckets.get(`${cx + ox}:${cy + oy}`) ?? [];
        for (const other of bucket) {
          if (other <= index) continue;
          const q = points[other];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          if (dx * dx + dy * dy < maxD2) edges.push([index, other]);
        }
      }
    }
  });

  return { points, edges, outline };
}

function rotated(p: Point, pivot: Point, angle: number, offsetY = 0): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = p.x - pivot.x;
  const y = p.y - pivot.y;
  return {
    x: pivot.x + x * c - y * s,
    y: pivot.y + x * s + y * c + offsetY,
  };
}

function drawMesh(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  pivot: Point,
  angle: number,
  offsetY: number,
  opacity: number,
  time: number,
) {
  const pts = mesh.points.map(p => rotated(p, pivot, angle, offsetY));
  ctx.save();

  // Fine triangulated connections, similar to the supplied abstract network.
  ctx.beginPath();
  for (const [a, b] of mesh.edges) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.lineWidth = 0.76;
  ctx.strokeStyle = `rgba(215, 229, 250, ${0.48 * opacity})`;
  ctx.stroke();

  // A clearer outer contour keeps the horse readable at normal screen sizes.
  ctx.beginPath();
  mesh.outline.forEach((p, index) => {
    const q = rotated(p, pivot, angle, offsetY);
    if (index === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = `rgba(246, 249, 255, ${0.78 * opacity})`;
  ctx.stroke();

  pts.forEach((p, i) => {
    const pulse = 0.72 + 0.28 * Math.sin(time * 1.5 + i * 0.73);
    const perimeter = i >= pts.length - mesh.outline.length * 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, perimeter ? 1.05 : 0.72, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(248, 251, 255, ${(perimeter ? 0.88 : 0.54 * pulse) * opacity})`;
    ctx.fill();
  });
  ctx.restore();
}

function drawLimbSegment(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  widthA: number,
  widthB: number,
  opacity: number,
  seed: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const rails = [-1, -0.45, 0, 0.45, 1];
  const rows = rails.map((rail, r) => {
    const arr: Point[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const width = widthA + (widthB - widthA) * t;
      const wobble = (noise(i, r, seed) - 0.5) * 1.6;
      arr.push({
        x: a.x + dx * t + nx * (rail * width + wobble),
        y: a.y + dy * t + ny * (rail * width + wobble),
      });
    }
    return arr;
  });

  ctx.save();
  ctx.beginPath();
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      ctx.moveTo(row[i].x, row[i].y);
      ctx.lineTo(row[i + 1].x, row[i + 1].y);
    }
  }
  for (let i = 0; i <= 6; i += 2) {
    for (let r = 0; r < rows.length - 1; r++) {
      ctx.moveTo(rows[r][i].x, rows[r][i].y);
      ctx.lineTo(rows[r + 1][i].x, rows[r + 1][i].y);
    }
  }
  ctx.strokeStyle = `rgba(224, 235, 253, ${0.6 * opacity})`;
  ctx.lineWidth = 0.78;
  ctx.stroke();

  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i <= 6; i += 2) {
      const p = rows[r][i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.85, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(249, 252, 255, ${0.82 * opacity})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHoof(ctx: CanvasRenderingContext2D, ankle: Point, angle: number, opacity: number) {
  // Hooves are short, broad, and angled forward rather than pointed like claws.
  const forward = { x: Math.sin(angle + 0.45), y: Math.cos(angle + 0.45) };
  const side = { x: Math.cos(angle + 0.45), y: -Math.sin(angle + 0.45) };
  const heel = { x: ankle.x - forward.x * 3, y: ankle.y - forward.y * 3 };
  const toe = { x: ankle.x + forward.x * 19, y: ankle.y + forward.y * 19 };
  const p1 = { x: heel.x - side.x * 6, y: heel.y - side.y * 6 };
  const p2 = { x: toe.x - side.x * 4.5, y: toe.y - side.y * 4.5 };
  const p3 = { x: toe.x + side.x * 4.5, y: toe.y + side.y * 4.5 };
  const p4 = { x: heel.x + side.x * 6, y: heel.y + side.y * 6 };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.strokeStyle = `rgba(248, 251, 255, ${0.88 * opacity})`;
  ctx.lineWidth = 1.05;
  ctx.stroke();
  ctx.restore();
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  root: Point,
  phase: number,
  kind: "fore" | "hind",
  opacity: number,
  seed: number,
) {
  const wave = Math.sin(phase);
  const fold = Math.max(0, Math.sin(phase + (kind === "fore" ? 1.0 : 1.7)));
  const upperLength = kind === "fore" ? 91 : 88;
  const lowerLength = kind === "fore" ? 105 : 112;
  const upperAngle = kind === "fore"
    ? 0.08 + wave * 0.62
    : -0.2 + Math.sin(phase + Math.PI) * 0.72;

  const knee = {
    x: root.x + Math.sin(upperAngle) * upperLength,
    y: root.y + Math.cos(upperAngle) * upperLength,
  };

  // Fore knees flex back under the chest; hind legs fold forward at the hock.
  const lowerAngle = kind === "fore"
    ? upperAngle - 0.44 - fold * 0.82
    : upperAngle + 0.55 + fold * 0.68;

  const ankle = {
    x: knee.x + Math.sin(lowerAngle) * lowerLength,
    y: knee.y + Math.cos(lowerAngle) * lowerLength,
  };

  drawLimbSegment(ctx, root, knee, kind === "fore" ? 12 : 18, 7, opacity, seed);
  drawLimbSegment(ctx, knee, ankle, 5.2, 2.8, opacity, seed + 11);

  ctx.save();
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(250,252,255,${0.9 * opacity})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ankle.x, ankle.y, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawHoof(ctx, ankle, lowerAngle, opacity);
}

function drawMane(ctx: CanvasRenderingContext2D, phase: number, opacity: number) {
  // Short, separated filaments follow the crest and flow backwards with motion.
  ctx.save();
  ctx.lineWidth = 0.72;
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const flutter = Math.sin(phase * 0.92 + i * 0.55);
    const start = { x: 806 - t * 145, y: 82 + t * 116 };
    const c1 = { x: 784 - t * 150 + flutter * 4, y: 49 + t * 92 };
    const c2 = { x: 725 - t * 130 + flutter * 9, y: 31 + t * 64 };
    const end = { x: 674 - t * 92 + flutter * 15, y: 87 + t * 65 };
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    ctx.strokeStyle = `rgba(231, 239, 255, ${(0.23 + (i % 4) * 0.045) * opacity})`;
    ctx.stroke();

    for (let n = 1; n <= 4; n++) {
      const u = n / 5;
      const inv = 1 - u;
      const x = inv ** 3 * start.x + 3 * inv ** 2 * u * c1.x + 3 * inv * u ** 2 * c2.x + u ** 3 * end.x;
      const y = inv ** 3 * start.y + 3 * inv ** 2 * u * c1.y + 3 * inv * u ** 2 * c2.y + u ** 3 * end.y;
      if (n % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,249,255,${0.55 * opacity})`;
        ctx.fill();
      }
    }
  }

  // Small cross-links make the mane part of the particle network, not a white brush stroke.
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const x = 795 - 135 * t;
    const y = 90 + 98 * t + Math.sin(phase * 0.9 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 12, y - 11 + Math.sin(phase + i) * 3);
    ctx.strokeStyle = `rgba(220,232,252,${0.2 * opacity})`;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTail(ctx: CanvasRenderingContext2D, phase: number, opacity: number) {
  const sway = Math.sin(phase * 0.78);
  ctx.save();
  ctx.lineWidth = 0.76;
  for (let i = 0; i < 15; i++) {
    const spread = (i - 7) / 7;
    const start = { x: 300, y: 270 + spread * 5 };
    const c1 = { x: 261 - Math.abs(sway) * 9, y: 278 + spread * 15 + sway * 5 };
    const c2 = { x: 226 + sway * 15, y: 302 + spread * 22 + sway * 10 };
    const end = { x: 168 + sway * 23, y: 294 + spread * 30 + sway * 18 };
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    ctx.strokeStyle = `rgba(228,238,255,${(0.24 + (i % 3) * 0.045) * opacity})`;
    ctx.stroke();

    const nodes = 5;
    for (let n = 1; n < nodes; n += 2) {
      const t = n / nodes;
      const inv = 1 - t;
      const x = inv ** 3 * start.x + 3 * inv ** 2 * t * c1.x + 3 * inv * t ** 2 * c2.x + t ** 3 * end.x;
      const y = inv ** 3 * start.y + 3 * inv ** 2 * t * c1.y + 3 * inv * t ** 2 * c2.y + t ** 3 * end.y;
      ctx.beginPath();
      ctx.arc(x, y, 0.85, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245,249,255,${0.65 * opacity})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFaceDetails(ctx: CanvasRenderingContext2D, time: number, opacity: number, bob: number) {
  ctx.save();
  // Eye, cheekbone, jaw and nostril give the profile recognizable equine landmarks.
  ctx.strokeStyle = `rgba(241,247,255,${0.48 * opacity})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(846, 109 + bob * 0.65);
  ctx.quadraticCurveTo(857, 104 + bob * 0.65, 866, 112 + bob * 0.65);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(858, 111 + bob * 0.65, 1.7, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${(0.75 + 0.15 * Math.sin(time * 2)) * opacity})`;
  ctx.shadowColor = "rgba(230,240,255,.8)";
  ctx.shadowBlur = 4;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(914, 157 + bob * 0.65, 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(837, 143 + bob * 0.65);
  ctx.quadraticCurveTo(864, 171 + bob * 0.65, 900, 177 + bob * 0.65);
  ctx.stroke();
  ctx.restore();
}

function drawAtmosphere(ctx: CanvasRenderingContext2D, time: number, opacity: number) {
  const haze = ctx.createRadialGradient(560, 375, 10, 560, 375, 430);
  haze.addColorStop(0, `rgba(145,170,220,${0.045 * opacity})`);
  haze.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(80, 35, 1050, 590);

  for (let i = 0; i < 58; i++) {
    const x = noise(i, 4, 17) * W;
    const baseY = noise(i, 8, 29) * H;
    const y = (baseY + time * (3 + (i % 4) * 1.6)) % H;
    const pulse = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.3 + i));
    ctx.beginPath();
    ctx.arc(x, y, i % 13 === 0 ? 1 : 0.55, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(215,228,250,${pulse * opacity * 0.34})`;
    ctx.fill();
  }
}

const styles = `
.particle-horse {
  position: fixed;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
  background: transparent;
}
.particle-horse canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.particle-horse-content {
  position: relative;
  z-index: 1;
}
.particle-horse-content .page-shell {
  position: relative;
  z-index: 1;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
@media (prefers-reduced-motion: reduce) {
  .particle-horse { animation: none; }
}
`;

export default function ParticleHorse({
  opacity = 0.9,
  speed = 1,
  animated = true,
  className = "",
  style,
}: ParticleHorseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const bodyMesh = makeMesh(BODY, 20, 1);
    const neckMesh = makeMesh(NECK, 15, 2);
    const headMesh = makeMesh(HEAD, 12, 3);
    const nearEar = makeMesh(EAR_NEAR, 6, 4);
    const farEar = makeMesh(EAR_FAR, 6, 5);

    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let disposed = false;
    let shouldAnimate = animated;

    const draw = (now: number) => {
      if (disposed) return;
      const dt = last ? Math.min((now - last) / 1000, 0.04) : 0;
      last = now;
      if (shouldAnimate) elapsed += dt * speed;

      const time = elapsed;
      const phase = time * Math.PI * 2 * 0.76;
      const bob = Math.sin(phase * 2) * 4.8;
      const bodyPitch = Math.sin(phase + 0.4) * 0.012;
      const neckPitch = Math.sin(phase + 0.9) * 0.018;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const scale = Math.min(width / W, height / H);
      const offsetX = (width - W * scale) / 2;
      const offsetY = (height - H * scale) / 2;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      drawAtmosphere(ctx, time, opacity * 0.7);

      // Far legs sit behind the barrel to make the four-limbed stance clear.
      drawLeg(ctx, { x: 380, y: 345 + bob }, phase + 2.35, "hind", opacity * 0.48, 17);
      drawLeg(ctx, { x: 660, y: 340 + bob }, phase + 2.05, "fore", opacity * 0.48, 23);

      drawTail(ctx, phase, opacity);

      // Main barrel and croup, with a restrained rise/fall through the gallop.
      drawMesh(ctx, bodyMesh, { x: 500, y: 300 }, bodyPitch, bob, opacity, time);

      // Neck joins at the withers and lifts into the poll rather than floating apart.
      drawMesh(ctx, neckMesh, { x: 682, y: 263 }, neckPitch, bob * 0.88, opacity, time);
      drawMesh(ctx, headMesh, { x: 851, y: 132 }, neckPitch * 0.7 + Math.sin(phase + 1.2) * 0.012, bob * 0.78, opacity, time);
      drawMesh(ctx, farEar, { x: 832, y: 80 }, neckPitch, bob * 0.78, opacity * 0.8, time);
      drawMesh(ctx, nearEar, { x: 817, y: 80 }, neckPitch, bob * 0.78, opacity, time);

      drawMane(ctx, phase, opacity);
      drawFaceDetails(ctx, time, opacity, bob);

      // Near legs have a slight phase offset: this reads as a gallop, not a treadmill.
      drawLeg(ctx, { x: 370, y: 352 + bob }, phase + 0.12, "hind", opacity, 31);
      drawLeg(ctx, { x: 675, y: 346 + bob }, phase + 0.58, "fore", opacity, 37);

      // Clean topline, shoulder and haunch contours add visual cues without filling the mesh.
      ctx.save();
      ctx.strokeStyle = `rgba(247,250,255,${0.34 * opacity})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(314, 250 + bob);
      ctx.quadraticCurveTo(382, 190 + bob, 473, 207 + bob);
      ctx.quadraticCurveTo(574, 211 + bob, 639, 233 + bob);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(638, 250 + bob);
      ctx.quadraticCurveTo(675, 279 + bob, 682, 334 + bob);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
      if (shouldAnimate) frame = window.requestAnimationFrame(draw);
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width || window.innerWidth);
      height = Math.max(1, rect.height || window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!shouldAnimate) draw(performance.now());
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    shouldAnimate = animated && !reduceMotion.matches;
    if (shouldAnimate) frame = window.requestAnimationFrame(draw);
    else draw(0);

    const onMotionChange = (event: MediaQueryListEvent) => {
      window.cancelAnimationFrame(frame);
      last = 0;
      shouldAnimate = animated && !event.matches;
      if (shouldAnimate) frame = window.requestAnimationFrame(draw);
      else {
        elapsed = 0;
        draw(0);
      }
    };
    reduceMotion.addEventListener?.("change", onMotionChange);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      reduceMotion.removeEventListener?.("change", onMotionChange);
    };
  }, [animated, opacity, speed]);

  return (
    <>
      <style>{styles}</style>
      <div
        className={`particle-horse${className ? ` ${className}` : ""}`}
        style={style}
        aria-hidden="true"
      >
        <canvas ref={canvasRef} />
      </div>
    </>
  );
}

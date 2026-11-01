
import { useEffect, useRef, type CSSProperties } from "react";

export type ParticleNetworkProps = {
  /** Overall line and point visibility. */
  opacity?: number;
  /** Particle drift speed. 1 is slow and subtle; higher values move faster. */
  speed?: number;
  /** Particle density multiplier. */
  density?: number;
  /** Maximum distance at which particles can connect, in CSS pixels. */
  connectionDistance?: number;
  /** Optional CSS class and inline positioning overrides. */
  className?: string;
  style?: CSSProperties;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  pulse: number;
};

type Edge = {
  a: number;
  b: number;
  distance: number;
};

const random = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function createParticles(width: number, height: number, density: number): Particle[] {
  const area = width * height;

  // Approximately 20% more particles than the original configuration.
  const count = Math.round(clamp((area / 10500) * density * 1.2, 77, 264));

  // A mixture of broad clusters and free points creates irregular, organic meshes
  // instead of a regular grid or a uniform constellation.
  const clusters = Array.from({ length: 6 }, () => ({
    x: random(0.08, 0.92) * width,
    y: random(0.06, 0.94) * height,
    spreadX: random(0.11, 0.24) * width,
    spreadY: random(0.12, 0.28) * height,
  }));

  return Array.from({ length: count }, (_, index) => {
    let x: number;
    let y: number;

    if (Math.random() < 0.72) {
      const cluster = clusters[index % clusters.length];

      // Approximate a soft gaussian with the sum of random values.
      const gx = (Math.random() + Math.random() + Math.random() + Math.random() - 2);
      const gy = (Math.random() + Math.random() + Math.random() + Math.random() - 2);

      x = cluster.x + gx * cluster.spreadX;
      y = cluster.y + gy * cluster.spreadY;
    } else {
      x = Math.random() * width;
      y = Math.random() * height;
    }

    const angle = random(0, Math.PI * 2);
    const velocity = random(5.5, 13.5);

    return {
      x: clamp(x, 0, width),
      y: clamp(y, 0, height),
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      radius: random(0.75, 1.55),
      phase: random(0, Math.PI * 2),
      pulse: random(0.45, 1),
    };
  });
}

function buildEdges(particles: Particle[], maxDistance: number): Edge[] {
  const maxDistanceSquared = maxDistance * maxDistance;
  const edges = new Map<string, Edge>();

  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    const nearby: { index: number; distance: number }[] = [];

    for (let j = 0; j < particles.length; j++) {
      if (i === j) continue;

      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared < maxDistanceSquared) {
        nearby.push({ index: j, distance: Math.sqrt(distanceSquared) });
      }
    }

    nearby.sort((left, right) => left.distance - right.distance);

    // Approximately 20% more connections than the original average.
    // Four links are used most of the time, with occasional three-link joints.
    const linkCount = Math.random() < 0.9 ? 4 : 3;

    for (const neighbour of nearby.slice(0, linkCount)) {
      const low = Math.min(i, neighbour.index);
      const high = Math.max(i, neighbour.index);
      const key = `${low}:${high}`;

      if (!edges.has(key)) {
        edges.set(key, { a: low, b: high, distance: neighbour.distance });
      }
    }
  }

  return Array.from(edges.values());
}

const componentStyles = `
.particle-network {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  display: block;
  overflow: hidden;
  pointer-events: none;
  background: #000;
  contain: strict;
}
.particle-network canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.particle-network-content {
  position: relative;
  z-index: 1;
}
.particle-network-content .page-shell {
  position: relative;
  z-index: 1;
  background: rgba(0, 0, 0, 0.56);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
`;

export default function ParticleNetwork({
  opacity = 0.9,
  speed = 0.65,
  density = 1,
  connectionDistance,
  className = "",
  style,
}: ParticleNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let particles: Particle[] = [];
    let frameId = 0;
    let previousTime = 0;
    let elapsed = 0;
    let disposed = false;
    let isAnimating = true;
    let lastEdgeBuild = 0;
    let cachedEdges: Edge[] = [];

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width || window.innerWidth);
      const nextHeight = Math.max(1, bounds.height || window.innerHeight);
      const oldWidth = width;
      const oldHeight = height;

      width = nextWidth;
      height = nextHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (particles.length && oldWidth > 1 && oldHeight > 1) {
        const sx = width / oldWidth;
        const sy = height / oldHeight;

        particles.forEach(particle => {
          particle.x *= sx;
          particle.y *= sy;
        });
      } else {
        particles = createParticles(width, height, density);
      }

      cachedEdges = [];
      lastEdgeBuild = 0;

      if (!isAnimating) drawFrame(performance.now(), true);
    };

    const getConnectionDistance = () =>
      connectionDistance ?? clamp(Math.min(width, height) * 0.285, 112, 190);

    const drawFrame = (time: number, staticFrame = false) => {
      if (disposed) return;

      const delta = previousTime
        ? Math.min((time - previousTime) / 1000, 0.04)
        : 0;

      previousTime = time;

      if (!staticFrame && isAnimating) {
        elapsed += delta * speed;

        for (const particle of particles) {
          particle.x += particle.vx * delta * speed;
          particle.y += particle.vy * delta * speed;

          // Softly wrap points across the edges so the network never visibly resets.
          const margin = 24;

          if (particle.x < -margin) particle.x = width + margin;
          if (particle.x > width + margin) particle.x = -margin;
          if (particle.y < -margin) particle.y = height + margin;
          if (particle.y > height + margin) particle.y = -margin;

          // A tiny curved drift makes the network feel alive without looking busy.
          const drift = Math.sin(elapsed * 0.38 + particle.phase) * 2.2;

          particle.x += drift * delta;
          particle.y += Math.cos(elapsed * 0.31 + particle.phase) * 1.5 * delta;
        }
      }

      const now = time;

      if (cachedEdges.length === 0 || now - lastEdgeBuild > 100) {
        cachedEdges = buildEdges(particles, getConnectionDistance());
        lastEdgeBuild = now;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);

      // Very faint atmospheric points give depth without introducing a gradient wash.
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        const pulse = 0.76 + Math.sin(elapsed * 0.75 + particle.phase) * 0.12;
        const alpha = opacity * pulse * particle.pulse;

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(245, 248, 255, ${alpha})`;
        context.fill();
      }

      // Draw hairline connections in three distance bands.
      // The denser mesh creates more geometric intersections and triangles.
      context.lineWidth = 0.72;
      context.lineCap = "round";

      const linkRange = getConnectionDistance();

      const bands = [
        { limit: 0.44, alpha: 0.48 },
        { limit: 0.74, alpha: 0.31 },
        { limit: 1.0, alpha: 0.18 },
      ];

      let previousLimit = 0;

      for (const band of bands) {
        context.beginPath();

        for (const edge of cachedEdges) {
          const normalized = edge.distance / linkRange;

          if (normalized <= previousLimit || normalized > band.limit) continue;

          const a = particles[edge.a];
          const b = particles[edge.b];

          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
        }

        context.strokeStyle = `rgba(222, 233, 250, ${opacity * band.alpha})`;
        context.stroke();

        previousLimit = band.limit;
      }

      // A sparse set of brighter joints gives the network crisp white pinpoints.
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];

        if (i % 3 !== 0) continue;

        const shimmer = 0.68 + 0.32 * Math.sin(elapsed * 1.1 + particle.phase);

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * 1.12, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${opacity * shimmer})`;
        context.fill();
      }

      if (isAnimating && !staticFrame) {
        frameId = window.requestAnimationFrame(next => drawFrame(next));
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    isAnimating = !reducedMotion.matches;

    if (isAnimating) {
      frameId = window.requestAnimationFrame(next => drawFrame(next));
    } else {
      drawFrame(performance.now(), true);
    }

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      window.cancelAnimationFrame(frameId);
      previousTime = 0;
      isAnimating = !event.matches;

      if (isAnimating) {
        frameId = window.requestAnimationFrame(next => drawFrame(next));
      } else {
        drawFrame(performance.now(), true);
      }
    };

    reducedMotion.addEventListener?.("change", onMotionPreferenceChange);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      reducedMotion.removeEventListener?.("change", onMotionPreferenceChange);
    };
  }, [opacity, speed, density, connectionDistance]);

  return (
    <>
      <style>{componentStyles}</style>

      <div
        className={`particle-network${className ? ` ${className}` : ""}`}
        style={style}
        aria-hidden="true"
      >
        <canvas ref={canvasRef} />
      </div>
    </>
  );
}

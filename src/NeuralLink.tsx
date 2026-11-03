import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

type NeuralLinkProps = {
  href: string;
  label: string;
  index: string;
  image: string;
  side: "left" | "right";
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
};

const RED = "#ff2028";

export function NeuralLink({ href, label, index, image, side }: NeuralLinkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !host || !context) return;

    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let particles: Particle[] = [];
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    let disposed = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const random = (min: number, max: number) => min + Math.random() * (max - min);

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const count = Math.max(64, Math.min(160, Math.round((width * height) / 700)));
      const radius = Math.min(width, height) * 0.465;
      const centerX = width / 2;
      const centerY = height / 2;
      const vertices = Array.from({ length: 12 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 12;
        return {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      });

      const isInside = (x: number, y: number) =>
        vertices.every((a, i) => {
          const b = vertices[(i + 1) % vertices.length];
          return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
        });

      const randomPoint = () => {
        let x = centerX;
        let y = centerY;
        do {
          x = random(centerX - radius, centerX + radius);
          y = random(centerY - radius, centerY + radius);
        } while (!isInside(x, y));
        return { x, y };
      };

      particles = Array.from({ length: count }, () => {
        const angle = random(0, Math.PI * 2);
        const speed = random(2, 5.5);
        const point = randomPoint();
        return {
          ...point,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: random(0.55, 1.15),
          phase: random(0, Math.PI * 2),
        };
      });
    };

    const draw = (time: number) => {
      if (disposed) return;
      const delta = previous ? Math.min((time - previous) / 1000, 0.035) : 0;
      previous = time;
      elapsed += delta;

      if (!reducedMotion.matches) {
        const radius = Math.min(width, height) * 0.465;
        const centerX = width / 2;
        const centerY = height / 2;
        const vertices = Array.from({ length: 12 }, (_, i) => {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / 12;
          return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          };
        });

        for (const p of particles) {
          const previousX = p.x;
          const previousY = p.y;
          p.x += p.vx * delta;
          p.y += p.vy * delta;

          // Keep every particle inside the twelve equal sides without drawing
          // a polygon, border, mask, or decorative layer over the network.
          for (let i = 0; i < vertices.length; i++) {
            const a = vertices[i];
            const b = vertices[(i + 1) % vertices.length];
            const edgeX = b.x - a.x;
            const edgeY = b.y - a.y;
            const side = edgeX * (p.y - a.y) - edgeY * (p.x - a.x);

            if (side < p.radius * Math.hypot(edgeX, edgeY)) {
              p.x = previousX;
              p.y = previousY;
              const normalLength = Math.hypot(edgeX, edgeY) || 1;
              const nx = -edgeY / normalLength;
              const ny = edgeX / normalLength;
              const velocityAlongNormal = p.vx * nx + p.vy * ny;
              p.vx -= 2 * velocityAlongNormal * nx;
              p.vy -= 2 * velocityAlongNormal * ny;
              break;
            }
          }
        }
      }

      context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context!.clearRect(0, 0, width, height);

      const maxDistance = Math.min(width, height) * 0.24;
      context!.lineWidth = 0.82;
      context!.lineCap = "round";
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        let links = 0;
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance < maxDistance && links < 9) {
            const alpha = (1 - distance / maxDistance) * 0.58;
            context!.strokeStyle = `rgba(255, 32, 40, ${alpha})`;
            context!.beginPath();
            context!.moveTo(a.x, a.y);
            context!.lineTo(b.x, b.y);
            context!.stroke();
            links++;
          }
        }
      }

      for (const p of particles) {
        const pulse = 0.72 + Math.sin(elapsed * 1.4 + p.phase) * 0.2;
        context!.beginPath();
        context!.arc(p.x, p.y, p.radius * (0.9 + pulse * 0.22), 0, Math.PI * 2);
        context!.fillStyle = `rgba(255, 48, 55, ${0.55 + pulse * 0.4})`;
        context!.shadowBlur = 0;
        context!.fill();
      }
      context!.shadowBlur = 0;

      if (!reducedMotion.matches) frame = window.requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    if (reducedMotion.matches) draw(0);
    else frame = window.requestAnimationFrame(draw);

    const onMotionChange = () => {
      window.cancelAnimationFrame(frame);
      previous = 0;
      if (reducedMotion.matches) draw(performance.now());
      else frame = window.requestAnimationFrame(draw);
    };
    reducedMotion.addEventListener?.("change", onMotionChange);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      reducedMotion.removeEventListener?.("change", onMotionChange);
    };
  }, []);

  return (
    <motion.a
      className={`neural-link neural-link--${side}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${label}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.45 }}
    >
      <span className="neural-link__visual">
        <canvas ref={canvasRef} aria-hidden="true" />
        <img className="neural-link__image" src={image} alt="" draggable={false} />
      </span>
      <span className="neural-link__caption">
        <span className="neural-link__number">{index}</span>
        <span className="neural-link__label">{label}</span>
        <span className="neural-link__arrow" aria-hidden="true">↗</span>
      </span>
    </motion.a>
  );
}

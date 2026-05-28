import { useEffect, useRef } from "react";
import type { GraphVisualMode } from "../types";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
};

// Fewer, slower, monochrome — dust motes in still air, not stars.
const PARTICLE_COUNT: Record<GraphVisualMode, number> = {
  minimal: 18,
  cinematic: 32,
};

type Props = {
  mode: GraphVisualMode;
};

export function BackgroundParticles({ mode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      const count = PARTICLE_COUNT[mode];
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.022,
        vy: (Math.random() - 0.5) * 0.022,
        r: 0.4 + Math.random() * 0.7,
        alpha: 0.06 + Math.random() * 0.1,
        twinkleSpeed: 0.0003 + Math.random() * 0.0006,
        twinklePhase: Math.random() * Math.PI * 2,
      }));
    };

    resize();
    seed();

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);

    const tick = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const particles = particlesRef.current;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -2) p.x = width + 2;
        if (p.x > width + 2) p.x = -2;
        if (p.y < -2) p.y = height + 2;
        if (p.y > height + 2) p.y = -2;

        const tw =
          0.55 + 0.45 * Math.sin(t * p.twinkleSpeed + p.twinklePhase);
        const a = p.alpha * tw;
        ctx.beginPath();
        // Warm bone, never cool/neon
        ctx.fillStyle = `rgba(236, 230, 215, ${a.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [mode]);

  return (
    <div className="absolute inset-0 pointer-events-none nt-radial">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

type Stat = {
  value: number;
  suffix: string;
  label: string;
};

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1200;
          const startTime = performance.now();
          const isInteger = Number.isInteger(value);

          const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = eased * value;
            setDisplay(isInteger ? Math.round(current) : parseFloat(current.toFixed(1)));
            if (progress < 1) requestAnimationFrame(tick);
          };

          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="animate-count-up">
      <span className="text-3xl font-bold tracking-tight text-ink md:text-4xl">
        {display}
        {suffix}
      </span>
    </div>
  );
}

export function AnimatedStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col items-center gap-2 text-center">
          <Counter value={stat.value} suffix={stat.suffix} />
          <p className="text-sm text-slate">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

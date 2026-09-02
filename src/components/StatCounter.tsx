import { useEffect, useRef, useState } from 'react';

export default function StatCounter({
  value,
  label,
  suffix = '',
  icon,
  duration = 1600,
}: {
  value: number;
  label: string;
  suffix?: string;
  icon?: React.ReactNode;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Animate from 0 → value when the card first enters the viewport.
  // If `value` changes afterwards (e.g. admin edits the stat via the pencil),
  // re-animate from the current shown value to the new value so it updates on the spot.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const animate = (from: number, to: number) => {
      cancelAnimationFrame(raf);
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const next = Math.round(from + (to - from) * eased);
        setDisplay(next);
        displayRef.current = next;
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    if (started.current) {
      animate(displayRef.current, value);
      return () => cancelAnimationFrame(raf);
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            animate(0, value);
          }
        });
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <div
      ref={ref}
      className="card group flex flex-col items-center gap-2 p-6 text-center transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      {icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 text-navy-700 transition-colors group-hover:bg-navy-800 group-hover:text-white">
          {icon}
        </div>
      )}
      <div className="text-3xl font-extrabold text-navy-900 lg:text-4xl">
        {display.toLocaleString('ar-EG')}
        {suffix}
      </div>
      <div className="text-sm font-medium text-gray-500">{label}</div>
    </div>
  );
}

import { useMemo } from 'react';

export default function BarChart({
  data,
  height = 200,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}) {
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full flex-1 items-end">
              <div
                className="group relative w-full rounded-t-lg transition-all duration-700"
                style={{
                  height: `${pct}%`,
                  backgroundColor: d.color || '#1e3454',
                  minHeight: '4px',
                }}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-navy-900 opacity-0 transition-opacity group-hover:opacity-100">
                  {d.value}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-medium text-gray-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  data,
  size = 180,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={18} />
        {data.map((d, i) => {
          const len = (d.value / total) * circumference;
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={18}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-all duration-700"
            />
          );
          offset += len;
          return seg;
        })}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-navy-900 text-xl font-extrabold">
          {total}
        </text>
      </svg>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="font-medium text-gray-600">{d.label}</span>
            <span className="font-bold text-navy-900">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({
  data,
  height = 200,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const w = 100;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = 100 - ((d.value - min) / range) * 90 - 5;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3454" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1e3454" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`0,100 ${points} 100,100`}
          fill="url(#lineGrad)"
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#1e3454"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-gray-400">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

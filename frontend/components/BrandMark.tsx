type BrandMarkProps = {
  className?: string;
};

const CIRCLES: Array<[number, number, number]> = [
  [32, 6, 3.2],
  [24, 10, 3.4],
  [32, 10, 4.2],
  [40, 10, 3.4],
  [16, 16, 3.2],
  [24, 16, 4.2],
  [32, 16, 3.2],
  [40, 16, 4.2],
  [48, 16, 3.2],
  [16, 24, 3.5],
  [24, 24, 3.2],
  [32, 24, 4.6],
  [40, 24, 3.2],
  [48, 24, 3.5],
  [16, 32, 3.2],
  [24, 32, 4.2],
  [32, 32, 3.2],
  [40, 32, 4.2],
  [48, 32, 3.2],
  [24, 40, 3.4],
  [32, 40, 4.2],
  [40, 40, 3.4],
  [32, 48, 3.2]
];

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 54"
      fill="none"
      aria-hidden="true"
      className={className}
      role="img"
    >
      <defs>
        <linearGradient id="orthogenesis-mark" x1="8" y1="6" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E3A8A" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
      </defs>
      {CIRCLES.map(([cx, cy, r], index) => (
        <circle
          key={`${cx}-${cy}-${index}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="url(#orthogenesis-mark)"
          stroke="#0B1220"
          strokeOpacity="0.2"
          strokeWidth="0.8"
        />
      ))}
    </svg>
  );
}

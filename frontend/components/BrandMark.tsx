type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="OrthoGenesisAI logo"
    >
      <rect width="40" height="40" rx="10" fill="#0B1220" />
      <path
        d="M12 28V12h2.4l5.6 9.6L25.6 12H28v16h-2.4V17.2L20 25.6l-5.6-8.4V28H12z"
        fill="url(#brand-gradient)"
      />
      <defs>
        <linearGradient id="brand-gradient" x1="12" y1="12" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2E7DF6" />
          <stop offset="1" stopColor="#2AC7B0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

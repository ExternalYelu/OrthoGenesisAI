type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/OrthoGenesisLogo.png"
      alt="OrthoGenesisAI logo"
      className={className}
    />
  );
}

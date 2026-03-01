import Image from "next/image";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <Image
      src="/orthogenesis-logo.svg"
      alt="OrthoGenesisAI logo"
      width={64}
      height={64}
      className={className}
      priority
    />
  );
}

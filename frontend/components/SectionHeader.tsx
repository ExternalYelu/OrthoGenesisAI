type SectionHeaderProps = {
  title: string;
  subtitle: string;
};

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate/60">
        {title}
      </p>
      <h2 className="text-3xl font-semibold text-ink md:text-4xl">{subtitle}</h2>
    </div>
  );
}

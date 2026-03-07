type SectionHeaderProps = {
  title: string;
  subtitle: string;
  badge?: string;
  align?: "left" | "center";
};

export function SectionHeader({ title, subtitle, badge, align = "left" }: SectionHeaderProps) {
  return (
    <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="h-px w-8 bg-gradient-to-r from-accent to-transparent" />
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          {title}
        </p>
        {badge && <span className="badge-green">{badge}</span>}
      </div>
      <h2 className="max-w-2xl text-3xl font-semibold leading-snug text-ink md:text-4xl">
        {subtitle}
      </h2>
    </div>
  );
}

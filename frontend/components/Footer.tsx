export function Footer() {
  return (
    <footer className="border-t border-slate/10 bg-white/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate md:flex-row md:items-center md:justify-between">
        <p>© 2026 OrthoGenesisAI. Built for clinical-grade precision.</p>
        <div className="flex gap-6">
          <span>HIPAA-aware workflows</span>
          <span>Encrypted storage</span>
          <span>Audit-ready</span>
        </div>
      </div>
    </footer>
  );
}

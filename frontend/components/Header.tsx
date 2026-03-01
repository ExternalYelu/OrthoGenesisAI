import Link from "next/link";
import { Button } from "./Button";
import { BrandMark } from "./BrandMark";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-lg">
      <div className="bg-slate-900 px-6 py-1 text-center text-[11px] font-medium tracking-wide text-slate-100">
        Research-use software. Not for standalone diagnosis.
      </div>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          <span className="inline-flex items-center gap-2">
            <BrandMark className="h-8 w-8 rounded-full" />
            <span>OrthoGenesisAI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate md:flex">
          <Link className="link-underline" href="/upload">
            Upload
          </Link>
          <Link className="link-underline" href="/processing">
            Processing
          </Link>
          <Link className="link-underline" href="/viewer">
            Viewer
          </Link>
          <Link className="link-underline" href="/export">
            Export
          </Link>
          <Link className="link-underline" href="/patient">
            Patient Mode
          </Link>
          <Link className="link-underline" href="/auth">
            Auth
          </Link>
        </nav>
        <div className="hidden md:block">
          <Button href="/upload" label="Upload X-rays" />
        </div>
      </div>
    </header>
  );
}

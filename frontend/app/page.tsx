import { BonePreview } from "@/components/BonePreview";
import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--color-frost)" }}>
      <Header />
      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 py-24 lg:flex-row lg:items-center lg:gap-16 lg:py-32">
            <div className="flex-1 space-y-8">
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-ink md:text-[3.5rem] lg:text-[3.8rem]">
                From X-rays to 3D bone models
                <br />
                in minutes.
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-slate">
                OrthoGenesisAI reconstructs precise, 3D-printable anatomy from
                multi-view X-rays for surgical planning, patient education,
                and personalized orthopedic care.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button href="/upload" label="Upload X-rays" size="lg" icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                } />
                <Button href="/viewer" label="Explore Demo" variant="outline" size="lg" />
              </div>
            </div>
            <div className="flex-1">
              <BonePreview />
            </div>
          </div>
        </section>

        {/* ── Why I built this ── */}
        <section className="bg-[#020617] text-white">
          <div className="mx-auto w-full max-w-3xl px-6 py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
              Why I built this
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight md:text-4xl">
              This started with a question I couldn't let go of.
            </h2>
            <div className="mt-8 space-y-6 text-[15px] leading-[1.8] text-white/70">
              <p>
                When I was 8 years old, I had to get surgery. Before any of it
                happened, they did a round of X-rays, and I remember sitting in
                the doctor&apos;s office while he pointed at these flat gray
                pictures and explained what was going to happen to me. I had no
                idea what he was talking about. None. He was using words I
                didn&apos;t know and pointing at shapes I couldn&apos;t make
                sense of, and I just nodded because what else do you do when
                you&apos;re 8.
              </p>
              <p>
                I think about that a lot. Not because the doctor did anything
                wrong, but because there&apos;s this huge gap between what a
                trained eye sees in an X-ray and what a patient sees. A flat
                gray image isn&apos;t a body. It doesn&apos;t feel like
                anything. And when someone is about to operate on you, you
                deserve to actually understand what they&apos;re doing.
              </p>
              <p>
                That&apos;s what OrthoGenesisAI is for. If we can turn those
                same X-rays into a real 3D model that a patient can rotate,
                look at, and hold onto with their eyes, then the conversation
                changes. The kid sitting in the chair gets to see their own
                bone. The parent gets to see what the surgeon is going to fix.
                The fear gets a little smaller because the unknown gets a
                little smaller.
              </p>
              <p>
                That&apos;s the whole point. Surgery is scary enough.
                Understanding it shouldn&apos;t be.
              </p>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="relative">
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold text-ink md:text-4xl">
              Ready to transform your imaging workflow?
            </h2>
            <p className="max-w-lg text-sm text-slate">
              Start with a free reconstruction. No credit card required. HIPAA-aware
              from day one.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button href="/upload" label="Get Started Free" size="lg" />
              <Button href="/auth" label="Sign In" variant="outline" size="lg" />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

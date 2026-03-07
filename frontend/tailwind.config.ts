import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        slate: "var(--color-slate)",
        mist: "var(--color-mist)",
        frost: "var(--color-frost)",
        canvas: "var(--color-canvas)",
        teal: { DEFAULT: "#14B8A6", light: "#5EEAD4" },
        cyan: { DEFAULT: "#06B6D4", light: "#67E8F9" },
        accent: { DEFAULT: "#3B82F6", dark: "#2563EB", light: "#60A5FA" },
        bio: { DEFAULT: "#10B981", light: "#34D399", dark: "#059669" },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          muted: "var(--color-surface-muted)"
        },
        border: "var(--color-border)",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        clinical: { blue: "#3B82F6", amber: "#F59E0B", magenta: "#D946EF" }
      },
      boxShadow: {
        glow: "0 0 40px var(--shadow-glow-color, rgba(59,130,246,0.20))",
        "glow-lg": "0 0 80px var(--shadow-glow-color, rgba(59,130,246,0.15))",
        "glow-bio": "0 0 60px rgba(16,185,129,0.20)",
        soft: "0 12px 40px var(--shadow-base, rgba(0,0,0,0.06))",
        "soft-lg": "0 24px 64px var(--shadow-base, rgba(0,0,0,0.10))",
        card: "0 1px 3px var(--shadow-base, rgba(0,0,0,0.04)), 0 8px 24px var(--shadow-base, rgba(0,0,0,0.06))",
        "card-hover": "0 4px 12px var(--shadow-base, rgba(0,0,0,0.06)), 0 20px 48px var(--shadow-base, rgba(0,0,0,0.12))",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.06)"
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      backgroundImage: {
        "grid-fade": "radial-gradient(circle at 50% 0%, var(--grid-dot-color, rgba(59,130,246,0.08)) 0%, transparent 60%)",
        "hero-mesh": "radial-gradient(ellipse 80% 60% at 50% 40%, var(--hero-glow, rgba(59,130,246,0.06)) 0%, transparent 100%)",
        shimmer: "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.15) 50%, transparent 75%)"
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "fade-down": {
          from: { opacity: "0", transform: "translateY(-12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" }
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" }
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 24px var(--shadow-glow-color, rgba(59,130,246,0.15))" },
          "50%": { boxShadow: "0 0 48px var(--shadow-glow-color, rgba(59,130,246,0.30))" }
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" }
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "dna-spin": {
          from: { transform: "rotateY(0deg)" },
          to: { transform: "rotateY(360deg)" }
        },
        "morph": {
          "0%, 100%": { borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%" },
          "50%": { borderRadius: "30% 60% 70% 40% / 50% 60% 30% 60%" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "fade-down": "fade-down 0.4s ease-out both",
        "slide-in-right": "slide-in-right 0.5s ease-out both",
        "scale-in": "scale-in 0.4s ease-out both",
        shimmer: "shimmer 2.4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "spin-slow": "spin-slow 16s linear infinite",
        float: "float 5s ease-in-out infinite",
        "count-up": "count-up 0.4s ease-out both",
        "dna-spin": "dna-spin 20s linear infinite",
        morph: "morph 8s ease-in-out infinite"
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)"
      }
    }
  },
  plugins: []
};

export default config;

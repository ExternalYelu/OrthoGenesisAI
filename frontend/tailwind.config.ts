import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        slate: "#0F172A",
        mist: "#E6EEF7",
        frost: "#F7FAFD",
        teal: { DEFAULT: "#2AC7B0", light: "#6EEADB" },
        cyan: { DEFAULT: "#67D2FF", light: "#A8E5FF" },
        accent: { DEFAULT: "#2E7DF6", dark: "#1B5FCC", light: "#6BA3FA" },
        surface: { DEFAULT: "#FFFFFF", raised: "#F8FAFD", muted: "#EDF1F7" },
        success: "#16A34A",
        warning: "#F59E0B",
        danger: "#DC2626",
        clinical: { blue: "#2F7AE5", amber: "#F5A623", magenta: "#C026D3" }
      },
      boxShadow: {
        glow: "0 0 40px rgba(46,125,246,0.25)",
        "glow-lg": "0 0 80px rgba(46,125,246,0.18)",
        soft: "0 12px 40px rgba(2,6,23,0.08)",
        "soft-lg": "0 24px 64px rgba(2,6,23,0.12)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.12)",
        card: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(2,6,23,0.06)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.06), 0 20px 48px rgba(2,6,23,0.10)"
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      backgroundImage: {
        "grid-fade": "radial-gradient(circle at 50% 0%, rgba(46,125,246,0.10) 0%, transparent 60%)",
        ocean: "linear-gradient(135deg, #F7FAFD 0%, #EEF4FF 40%, #E6F7F5 100%)",
        "hero-mesh": "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(46,125,246,0.06) 0%, transparent 100%)",
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "shimmer": "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.3) 50%, transparent 75%)"
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
          from: { opacity: "0", transform: "translateY(16px)" },
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
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" }
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" }
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(46,125,246,0.15)" },
          "50%": { boxShadow: "0 0 40px rgba(46,125,246,0.30)" }
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
        }
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
        "fade-up": "fade-up 0.6s ease-out both",
        "fade-down": "fade-down 0.4s ease-out both",
        "slide-in-right": "slide-in-right 0.5s ease-out both",
        "scale-in": "scale-in 0.4s ease-out both",
        shimmer: "shimmer 2.4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "spin-slow": "spin-slow 12s linear infinite",
        float: "float 4s ease-in-out infinite",
        "count-up": "count-up 0.4s ease-out both"
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)"
      }
    }
  },
  plugins: []
};

export default config;

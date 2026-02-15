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
        teal: "#2AC7B0",
        cyan: "#67D2FF",
        accent: "#2E7DF6"
      },
      boxShadow: {
        glow: "0 0 40px rgba(46, 125, 246, 0.25)",
        soft: "0 12px 40px rgba(2, 6, 23, 0.18)"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      },
      backgroundImage: {
        "grid-fade": "radial-gradient(circle at top, rgba(46, 125, 246, 0.12), transparent 58%)",
        "ocean": "linear-gradient(135deg, #F7FAFD 0%, #EEF4FF 40%, #E6F7F5 100%)"
      }
    }
  },
  plugins: []
};

export default config;

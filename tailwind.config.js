/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nt: {
          // Ink palette — warm-tilted near-black, no neon
          bg: "#070706",
          deep: "#0B0A08",
          surface: "#16161a",
          panel: "rgba(255,255,255,0.025)",
          border: "rgba(232,228,217,0.1)",

          // Text — warm bone whites
          bright: "#F4EFE4", // primary text
          mid: "#C7BFB1", // secondary text
          dim: "#9B9284", // tertiary / hints
          faint: "#81786C",

          // Restricted accent palette — pale, organic, never neon
          ice: "#8E9AA0", // evidence — muted blue-gray
          sand: "#F4EFE4", // decision warmth, close to ivory
          sage: "#ECE6D7", // passed / settled, no green glow
          clay: "#B9786D", // error — muted soft red
          mist: "#8A867E", // search — graphite mist
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          "Inter",
          "system-ui",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Inter Tight"',
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.025)", opacity: "1" },
        },
        synapsePulse: {
          "0%": { strokeDashoffset: "240" },
          "100%": { strokeDashoffset: "0" },
        },
        shockwave: {
          "0%": { transform: "scale(0.2)", opacity: "0.65" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
        spinSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        flicker: {
          "0%, 100%": { opacity: "0.78" },
          "50%": { opacity: "0.42" },
        },
        finalFlash: {
          "0%": { opacity: "0" },
          "30%": { opacity: "0.08" },
          "100%": { opacity: "0" },
        },
        driftIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slowBlink: {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        breathe: "breathe 6s ease-in-out infinite",
        "synapse-pulse": "synapsePulse 1.8s linear infinite",
        shockwave: "shockwave 1.2s ease-out forwards",
        "spin-slow": "spinSlow 18s linear infinite",
        flicker: "flicker 3s ease-in-out infinite",
        "final-flash": "finalFlash 1.6s ease-out forwards",
        "drift-in": "driftIn 0.7s ease-out forwards",
        "slow-blink": "slowBlink 3.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

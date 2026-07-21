/**
 * Owó Reach — Tailwind theme.
 * Typography confirmed from the Stitch exports:
 *   Outfit → display, headings, labels
 *   Inter  → body / UI copy
 *   IBM Plex Mono → money, codes, references, timestamps (tabular-nums)
 * Brand base: white canvas + deep teal #011617 ink. Hairlines over shadows.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FFFFFF",
        ink: "#011617",
        "ink-container": "#081f20",
        "ink-soft": "#45514E",
        "surface-sunk": "#F2F6F5",
        "surface-container": "#EFF2F1",
        hairline: "#E2E8E6",
        reach: "#0C7D5C",
        "reach-live": "#12C28C",
        brass: "#B5883C",
        // Load-bearing beneficiary state palette
        "state-queued": "#5C6B68",
        "state-issued": "#B5883C",
        "state-complete": "#0C7D5C",
        "state-expiring": "#C4701C",
        "state-failed": "#9C3B2E",
        "state-cancelled": "#8A8F8B",
      },
      fontFamily: {
        display: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "display-sm": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" }],
        heading: ["24px", { lineHeight: "32px", fontWeight: "500" }],
        subheading: ["18px", { lineHeight: "26px", fontWeight: "600" }],
        body: ["15px", { lineHeight: "24px", fontWeight: "400" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        data: ["14px", { lineHeight: "20px", fontWeight: "500" }],
        "data-lg": ["18px", { lineHeight: "24px", fontWeight: "500" }],
        label: ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "3px",
        md: "4px",
        lg: "6px",
        full: "9999px",
      },
      boxShadow: {
        instrument: "0 24px 60px -28px rgba(1,22,23,0.5)",
      },
      keyframes: {
        settle: {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        flip: {
          "0%": { transform: "scale(1.06)" },
          "60%": { transform: "scale(0.98)" },
          "100%": { transform: "scale(1)" },
        },
        // Loading placeholders: a slow sweep across the bar, not a pulse —
        // reads as "arriving" rather than "broken".
        shimmer: {
          "0%": { backgroundPosition: "-180% 0" },
          "100%": { backgroundPosition: "180% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // A figure that just changed holds a wash for a beat, then lets go.
        flash: {
          "0%": { backgroundColor: "rgba(18,194,140,0.18)" },
          "100%": { backgroundColor: "transparent" },
        },
        "seal-in": {
          "0%": { transform: "scale(0.82) rotate(-14deg)", opacity: "0" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
      },
      animation: {
        settle: "settle 0.32s cubic-bezier(0.2,0.7,0.2,1) both",
        flip: "flip 0.28s cubic-bezier(0.2,0.7,0.2,1) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        flash: "flash 1.2s ease-out both",
        "seal-in": "seal-in 0.42s cubic-bezier(0.2,0.7,0.2,1) both",
      },
    },
  },
  plugins: [],
};

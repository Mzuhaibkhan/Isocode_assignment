/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        chaos: {
          100: "#e3e3db", // Warm paper / canvas
          200: "#ccccc4", // Subtle border
          300: "#8c7e77", // Secondary taupe
          400: "#1a1614", // Ink black
          500: "#ff6e14", // Signature vibrant orange
          orange: "#ff6e14",
          charcoal: "#141211",
          cream: "#f4f4ee",
          darkCard: "#1f1c1a",
          // Semantic aliases used across components (map onto the palette above)
          canvas: "#e3e3db", // page background (== 100)
          paper: "#f4f4ee", // raised card surface (== cream)
          black: "#1a1614", // primary ink (== 400)
          muted: "#665d57", // secondary text
        },
        bg: {
          main: "#e8e8e1",
          card: "#f4f4ee",
          sunlight: "#ffffff",
          dark: "#141211",
        },
        text: {
          main: "#1a1614",
          muted: "#665d57",
          disabled: "#9c9690",
        },
        brand: {
          DEFAULT: "#1a1614",
          accent: "#ff6e14",
          emerald: "#0d5c3a",
          amber: "#d97706",
          dark: "#0a0908",
          light: "#efece6",
        },
        warn: {
          DEFAULT: "#b45309",
          light: "#fef3c7",
        },
        danger: {
          DEFAULT: "#b91c1c",
          light: "#fee2e2",
        },
      },
      fontFamily: {
        display: ["'Big Shoulders Display'", "'PP Pangram Sans'", "sans-serif"],
        sans: ["'PP Neue Montreal'", "'Noto Sans Devanagari'", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "monospace"],
        pangram: ["'PP Pangram Sans'", "sans-serif"],
      },
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      },
      boxShadow: {
        tactile: "0 2px 0 0 #1a1614",
        "tactile-md": "0 4px 0 0 #1a1614",
        "tactile-lg": "0 6px 0 0 #1a1614",
        "tactile-orange": "0 4px 0 0 #ff6e14",
        soft: "0 10px 30px -10px rgba(26,22,20,0.08)",
      },
      letterSpacing: {
        tighter: "-0.05em",
        tightest: "-0.08em",
      },
      animation: {
        "fade-in": "fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-up": "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-subtle": "pulseSubtle 2s infinite ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};

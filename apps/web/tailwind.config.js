/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          main: "#FAFAF9", // near-white (stone-50)
          card: "#FFFFFF",
          sunlight: "#F5F5F4",
        },
        text: {
          main: "#111827", // near-black for 7:1 contrast
          muted: "#4B5563",
          disabled: "#9CA3AF",
        },
        brand: {
          DEFAULT: "#047857", // deep emerald green
          dark: "#065F46",
          light: "#D1FAE5",
        },
        warn: {
          DEFAULT: "#B45309",
          light: "#FEF3C7",
        },
        danger: {
          DEFAULT: "#B91C1C",
          light: "#FEE2E2",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Noto Sans Devanagari'",
          "sans-serif",
        ],
      },
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};


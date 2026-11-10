import type { Config } from "tailwindcss";
import { BRAND_ACCENT } from "./src/lib/brand";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0b1220",
          900: "#0f1a2e",
          800: "#152238",
          700: "#1d2d47",
          600: "#2a3b58",
          500: "#3d5170",
          400: "#61738d",
          300: "#94a6bc",
          200: "#cbd5e1",
          100: "#e9eef4",
          50: "#f5f7fa",
        },
        accent: BRAND_ACCENT,
        surface: {
          DEFAULT: "#ffffff",
          muted: "#e7f3f5",
          border: "#d8e5e9",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 26, 46, 0.04), 0 4px 16px rgba(15, 26, 46, 0.06)",
      },
      backgroundImage: {
        "ai-glow":
          "radial-gradient(600px circle at 85% -10%, rgba(0, 150, 190, 0.30), transparent 60%), radial-gradient(500px circle at -5% 110%, rgba(59, 179, 208, 0.18), transparent 55%)",
        "ai-border": "linear-gradient(135deg, #79cde3 0%, #007eac 65%, #152238 100%)",
      },
      keyframes: {
        "ai-glow": {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "ai-glow": "ai-glow 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

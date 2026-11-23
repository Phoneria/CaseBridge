import type { Config } from "tailwindcss";
import { BRAND_ACCENT } from "./src/lib/brand";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#08131f",
          900: "#0d1d2e",
          800: "#14283d",
          700: "#1d3550",
          600: "#2c4763",
          500: "#45607c",
          400: "#6b8199",
          300: "#9aabbd",
          200: "#c9d3dd",
          100: "#e6ebf0",
          50: "#f4f6f8",
        },
        accent: BRAND_ACCENT,
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f3f1ec",
          border: "#e1ddd3",
        },
      },
      fontFamily: {
        sans: [
          "Manrope",
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
        card: "0 1px 2px rgba(8, 19, 31, 0.04), 0 4px 16px rgba(8, 19, 31, 0.06)",
      },
      backgroundImage: {
        "ai-glow":
          "radial-gradient(600px circle at 85% -10%, rgba(104, 223, 207, 0.28), transparent 60%), radial-gradient(500px circle at -5% 110%, rgba(91, 141, 239, 0.14), transparent 55%)",
        "ai-border": "linear-gradient(135deg, #68dfcf 0%, #0c7468 65%, #14283d 100%)",
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

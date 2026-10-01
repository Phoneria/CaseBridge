import type { Config } from "tailwindcss";

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
        },
        accent: {
          50: "#f3f1ff",
          100: "#e7e3ff",
          200: "#cfc4ff",
          300: "#ac96ff",
          400: "#8b6bff",
          500: "#6d43f5",
          600: "#5a2fdb",
          700: "#4a25b3",
          800: "#3b1f8c",
          900: "#2f1a6e",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f7f8fb",
          border: "#e6e8ef",
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
          "radial-gradient(600px circle at 85% -10%, rgba(109, 67, 245, 0.45), transparent 60%), radial-gradient(500px circle at -5% 110%, rgba(90, 47, 219, 0.35), transparent 55%)",
        "ai-border": "linear-gradient(135deg, #8b6bff 0%, #5a2fdb 45%, #152238 100%)",
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

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      spacing: {
        18: "4.5rem", // 72px icon rail width
        68: "17rem",
      },
      colors: {
        midnight: {
          950: "#0B0F19",
          900: "#101522", // Primary dark application shell and navigation
          850: "#131A2B",
          800: "#171F31", // Elevated Navy: active nav, elevated dark panels
          750: "#1B243B",
          700: "#24304A",
          600: "#364566",
        },
        flowforge: {
          50: "#EEF0FD",
          100: "#DEE2FB",
          200: "#C2C9F8",
          300: "#9FAAF4",
          400: "#7F8DF0",
          500: "#6558E8", // FlowForge Indigo: primary brand action
          600: "#5345D8",
          700: "#4336BE",
          800: "#362B9C",
          900: "#2A217B",
        },
        signal: {
          cyan: "#22B8CF", // Signal Cyan: workflow connections & telemetry
          green: "#16A36A", // Success Green
          amber: "#D97706", // Warning Amber
          rose: "#DC4C64", // Error Rose
        },
        canvas: {
          cloud: "#F5F7FB", // Cloud Canvas background
          subtle: "#F0F3F9",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6558E8",
          600: "#5345d8",
          700: "#4336be",
          800: "#362b9c",
          900: "#2a217b",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        "subtle": "0 1px 2px 0 rgba(16, 21, 34, 0.04)",
        "card": "0 1px 3px 0 rgba(16, 21, 34, 0.05), 0 1px 2px -1px rgba(16, 21, 34, 0.05)",
        "card-hover": "0 10px 25px -5px rgba(16, 21, 34, 0.08), 0 8px 10px -6px rgba(16, 21, 34, 0.04)",
        "dropdown": "0 12px 36px -4px rgba(16, 21, 34, 0.14), 0 4px 12px -2px rgba(16, 21, 34, 0.06)",
        "glow-indigo": "0 0 20px -3px rgba(101, 88, 232, 0.35)",
        "glow-cyan": "0 0 20px -3px rgba(34, 184, 207, 0.35)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      animation: {
        "fade-in": "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-up": "scaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
        "shimmer": "shimmer 2s infinite linear",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleUp: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172a35",
        paper: "#f6f4ed",
        coral: "#e47457",
        tide: "#668d89",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        sans: ["Arial", "Helvetica", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        civic: {
          navy: "#25364a",
          green: "#2f6f63",
          gold: "#b8842d",
          red: "#a5524c",
          blue: "#3f6b9d"
        }
      },
      boxShadow: {
        panel: "0 20px 55px rgba(23, 33, 43, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;

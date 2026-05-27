import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        navy: "#06152b",
        ink: "#08111f",
        electric: "#1783ff",
        field: "#2e7d50",
        mist: "#eef4fb"
      },
      boxShadow: {
        soft: "0 24px 70px rgba(6, 21, 43, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;

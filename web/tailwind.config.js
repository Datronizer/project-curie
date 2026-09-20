/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        curie: {
          50: "#f5f7fa",
          100: "#eaeef4",
          200: "#cfd9e8",
          300: "#a5b9d5",
          400: "#7494bf",
          500: "#4f72a6",
          600: "#3b5889",
          700: "#30466f",
          800: "#2a3c5d",
          900: "#1e293b",
          950: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};

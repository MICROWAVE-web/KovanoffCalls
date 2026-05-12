/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2481cc",
          dark: "#1a6aa6",
        },
      },
    },
  },
  plugins: [],
};

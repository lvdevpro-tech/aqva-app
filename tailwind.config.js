/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aqva: {
          cyan: "#00d3f2",
          green: "#00d492",
          dark: "#0f172b",
          card: "rgba(29,41,61,0.5)",
        },
      },
    },
  },
  plugins: [],
};

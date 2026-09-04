/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'command-dark': '#0f172a',
        'command-panel': '#1e293b',
        'command-accent': '#38bdf8'
      }
    },
  },
  plugins: [],
}

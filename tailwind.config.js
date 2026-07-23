/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f4ff', 100: '#ece8ff', 200: '#dbd4ff', 300: '#c0b2ff',
          400: '#a086fb', 500: '#845ef7', 600: '#6f3fe8', 700: '#5b2fc4',
          800: '#4a289f', 900: '#3d2480', 950: '#26134f',
        },
        ink: { DEFAULT: '#1c1b22', muted: '#5b5966', soft: '#8b8898' },
        canvas: { DEFAULT: '#f7f6fb', card: '#ffffff', line: '#e8e6f0' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgba(28,27,34,0.04), 0 8px 24px -12px rgba(70,40,150,0.14)',
        pop: '0 12px 40px -12px rgba(70,40,150,0.28)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fade-up .22s ease-out both' },
    },
  },
  plugins: [],
}

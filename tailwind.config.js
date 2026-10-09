/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Noto Sans Devanagari', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f4f0ff', 100: '#e9e1ff', 200: '#d4c4ff', 300: '#b69cff',
          500: '#6e42e5', 600: '#5c33cf', 700: '#4b28aa', 800: '#3b2085', 900: '#2a175f',
        },
      },
      screens: { xs: '400px', '3xl': '1680px' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(.97) translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease both',
        'sheet-up': 'sheet-up .3s cubic-bezier(.2,.8,.2,1)',
        'pop-in': 'pop-in .25s ease',
      },
    },
  },
  plugins: [],
};

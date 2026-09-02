/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'sans-serif'],
        display: ['Tajawal', 'Cairo', 'sans-serif'],
      },
      colors: {
        navy: {
          50: '#f0f4fa',
          100: '#dbe6f4',
          200: '#bdd0ea',
          300: '#8fb0d8',
          400: '#5a87c0',
          500: '#3a68a3',
          600: '#2d5288',
          700: '#26426d',
          800: '#1e3454',
          900: '#16263f',
          950: '#0d1828',
        },
        gold: {
          50: '#fdf9ef',
          100: '#faf0d4',
          200: '#f4df9c',
          300: '#edc85f',
          400: '#e7b23c',
          500: '#d49a24',
          600: '#b8791c',
          700: '#93591b',
          800: '#79461d',
          900: '#673b1d',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'count-up': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.6s ease-out forwards',
        'fade-in-fast': 'fade-in-fast 0.3s ease-out forwards',
        'scale-in': 'scale-in 0.25s ease-out forwards',
        'slide-up': 'slide-up 0.7s ease-out forwards',
      },
    },
  },
  plugins: [],
};

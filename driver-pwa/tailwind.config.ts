import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        ink: '#0a0a0a',
        paper: '#fafaf9',
        line: '#e5e5e5',
        // brand
        gold: {
          DEFAULT: '#facc15', // yellow-400 — primary brand
          dark: '#ca8a04', // yellow-600
          deep: '#854d0e', // yellow-800 — text on gold
        },
      },
      borderRadius: {
        md: '8px',
        lg: '10px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;

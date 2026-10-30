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
          DEFAULT: '#3b9bff', // Moviy blue (logo) — primary brand
          dark: '#1d6fe0', // deeper blue
          deep: '#0b3d91', // navy — text on light blue tints
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

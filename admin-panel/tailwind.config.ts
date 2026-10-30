import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0a',
        line: '#e5e5e5',
        gold: {
          DEFAULT: '#3b9bff', // Moviy blue (logo)
          dark: '#1d6fe0',
          deep: '#0b3d91',
        },
      },
    },
  },
  plugins: [],
};
export default config;

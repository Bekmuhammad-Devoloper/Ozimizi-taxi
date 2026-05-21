import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0a',
        line: '#e5e5e5',
        gold: {
          DEFAULT: '#facc15',
          dark: '#ca8a04',
          deep: '#854d0e',
        },
      },
    },
  },
  plugins: [],
};
export default config;

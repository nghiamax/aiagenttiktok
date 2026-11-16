/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F8FA',
        line: '#ECEEF2',
        ink: '#111827',
        muted: '#6B7280',
        primary: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: '#EFF4FF' },
        'accent-violet': '#7C3AED',
        'accent-green': '#16A34A',
        danger: '#E11D48',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

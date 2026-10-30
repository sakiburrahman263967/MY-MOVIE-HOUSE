/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        bg: '#0c1017',
        card: 'rgba(255, 255, 255, 0.06)',
        accent: '#2563eb',
        'accent-hover': '#3b82f6',
        aqua: '#06b6d4',
        'aqua-glow': '#22d3ee',
        rose: {
          DEFAULT: '#f43f5e',
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
          950: '#4c0519'
        },
        amber: {
          DEFAULT: '#f59e0b',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03'
        },
        spatial: {
          dark: '#0a0d14',
          surface: 'rgba(18, 24, 38, 0.72)',
          card: 'rgba(255, 255, 255, 0.06)',
          border: 'rgba(255, 255, 255, 0.15)',
          blue: '#2563eb',
          cyan: '#06b6d4'
        }
      },
      boxShadow: {
        glass: '0 12px 40px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        'glass-hover': '0 20px 50px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        'glass-strong': '0 30px 90px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        'spatial-window': '0 40px 100px -20px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.35)',
        'neon-accent': '0 0 25px rgba(37, 99, 235, 0.55)'
      }
    }
  },
  plugins: []
};

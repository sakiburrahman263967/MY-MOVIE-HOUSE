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
        rose: '#f43f5e',
        amber: '#f59e0b',
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

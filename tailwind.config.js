/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d12',
          elevated: '#12151c',
          subtle: '#1a1e27',
        },
        border: {
          DEFAULT: '#222733',
          subtle: '#1a1e27',
        },
        fg: {
          DEFAULT: '#e6e8ee',
          muted: '#8b94a7',
          subtle: '#5b6478',
        },
        accent: {
          DEFAULT: '#3b82f6',
          up: '#22c55e',
          down: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

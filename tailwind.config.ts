import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:   { DEFAULT: '#052E4B', dark: '#054991' },
        cyan:   { DEFAULT: '#31C0FF' },
        orange: { DEFAULT: '#FF8A30' },
        teal:   { DEFAULT: '#007EA8' },
        cloud:  { DEFAULT: '#D5EEF7' },
        mist:   { DEFAULT: '#F4FAFD' },
      },
      fontFamily: {
        heading: ['Montserrat', 'Arial', 'sans-serif'],
        body:    ['Inter', 'Roboto', 'Arial', 'sans-serif'],
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'fade-in':    'fadeIn 0.25s ease forwards',
        'slide-up':   'slideUp 0.3s ease forwards',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                  to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
export default config

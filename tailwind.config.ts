import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#052E4B', dark: '#054991' },
        cyan:    { DEFAULT: '#31C0FF' },
        orange:  { DEFAULT: '#FF8A30' },
        teal:    { DEFAULT: '#007EA8' },
        cloud:   { DEFAULT: '#D5EEF7' },
        mist:    { DEFAULT: '#F4FAFD' },
      },
      fontFamily: {
        heading: ['Montserrat', 'Arial', 'sans-serif'],
        body:    ['Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config

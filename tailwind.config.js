/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        hexa: {
          pink:   '#E8177A',
          rose:   '#C219A0',
          purple: '#8B18E8',
          indigo: '#4838E8',
          blue:   '#1B1BE8',
        },
      },
      backgroundImage: {
        'hexa-gradient': 'linear-gradient(135deg, #E8177A 0%, #8B18E8 50%, #1B1BE8 100%)',
        'hexa-gradient-r': 'linear-gradient(to right, #E8177A 0%, #8B18E8 50%, #1B1BE8 100%)',
      },
    },
  },
  plugins: [],
}

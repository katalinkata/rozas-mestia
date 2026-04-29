module.exports = {
  content: ['./index.html', './book.html'],
  theme: {
    extend: {
      colors: {
        forest: '#2D3A2F',
        cream: '#FDF8F2',
        slate: '#5F6C72',
        pine: '#445348',
        sun: '#BC7A4C',
        stone: '#E9E0D4',
        ember: '#9E6948',
        mist: '#F5EFE6'
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Manrope', 'Segoe UI', 'sans-serif']
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem'
      }
    }
  }
};

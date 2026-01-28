/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cafe: {
          accent: '#D4C4A8', // Cream accent
          dark: '#0F0F0F', // Off-black
          cream: '#F5F0E6',
          beige: '#E8E0D0',
          latte: '#D4C4A8',
          espresso: '#B8A88A',
          light: '#FAF7F2',
          // Cream & off-black theme
          primary: '#D4C4A8', // Cream primary
          secondary: '#E8DCC4', // Lighter cream
          darkBg: '#0F0F0F', // Off-black background
          darkCard: '#1A1A1A', // Card background
          glass: 'rgba(255, 255, 255, 0.06)', // Glass effect
          text: '#FAF7F2', // Cream text
          textMuted: '#A39E93' // Muted cream/gray
        }
      },
      fontFamily: {
        'sans': ['Poppins', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        'anton': ['Anton', 'sans-serif'],
        'montserrat': ['Montserrat', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'bounce-gentle': 'bounceGentle 0.6s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        bounceGentle: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-4px)' },
          '60%': { transform: 'translateY(-2px)' }
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
      }
    },
  },
  plugins: [],
};
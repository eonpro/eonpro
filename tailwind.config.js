module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { 
    extend: {
      fontFamily: {
        'sofia': ['var(--font-sofia-pro)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'shimmer': 'shimmer 3s infinite',
        'truck': 'truck 1s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        truck: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(2px)' },
          '75%': { transform: 'translateX(-2px)' },
        },
      },
    } 
  },
  plugins: [],
};

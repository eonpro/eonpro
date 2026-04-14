import Logo from '../icons/Logo';

const Header = () => {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
      <a href="/" className="h-[24px] w-[160px] sm:h-[28px] sm:w-[200px]">
        <Logo className="h-full w-full" aria-label="Wellmedr Logo" />
      </a>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden text-right sm:block">
          <p className="text-xs text-gray-500">Questions? Call us</p>
          <p className="text-sm font-bold" style={{ color: '#101010' }}>
            1-888-397-6905
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-green-600">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wide">Secure Payment</span>
        </div>
      </div>
    </header>
  );
};

export default Header;

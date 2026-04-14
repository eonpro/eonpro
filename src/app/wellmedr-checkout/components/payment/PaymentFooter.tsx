import Link from 'next/link';
import ShieldTick from '@/app/wellmedr-checkout/components/icons/ShieldTick';

export default function PaymentFooter() {
  return (
    <div className="flex flex-col gap-2">
      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2">
        <ShieldTick width={20} height={20} className="text-[#351C0C]" />
        <span className="description-text text-sm opacity-100 sm:text-base">
          Secured by 256-bit encryption
        </span>
      </div>

      {/* Terms and Privacy */}
      <div className="text-center">
        <p className="description-text text-xs font-normal leading-[20px] opacity-100">
          By placing an order, you agree to your{' '}
          <Link
            href="https://www.joinWellmedr.com/terms-of-service"
            className="text-primary underline"
          >
            Terms of Service.
          </Link>
          <br />
          Please also read our{' '}
          <Link
            href="https://www.joinWellmedr.com/privacy-policy"
            className="text-primary underline"
          >
            Privacy Policy.
          </Link>
        </p>
      </div>
    </div>
  );
}

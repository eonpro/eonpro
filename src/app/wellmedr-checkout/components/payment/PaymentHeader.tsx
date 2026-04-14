import Visa from '@/app/wellmedr-checkout/components/icons/Visa';
import Mastercard from '@/app/wellmedr-checkout/components/icons/Mastercard';
import Amex from '@/app/wellmedr-checkout/components/icons/Amex';
import Discover from '@/app/wellmedr-checkout/components/icons/Discover';

export default function PaymentHeader() {
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:gap-4">
      <h3 className="mb-0 text-base sm:text-xl">Pay with a Credit/Debit Card</h3>
      {/* Card logos */}
      <div className="flex items-center justify-center gap-1.5">
        <div className="flex h-[32px] w-[64px] items-center justify-center rounded-[5.33px] bg-[#F7F7F9]">
          <Visa width={40} height={24} />
        </div>
        <div className="flex h-[32px] w-[64px] items-center justify-center rounded-[5.33px] bg-[#F7F7F9]">
          <Mastercard width={40} height={24} />
        </div>
        <div className="flex h-[32px] w-[64px] items-center justify-center rounded-[5.33px] bg-[#F7F7F9]">
          <Amex width={40} height={24} />
        </div>
        <div className="flex h-[32px] w-[64px] items-center justify-center rounded-[5.33px] bg-[#F7F7F9]">
          <Discover width={40} height={24} />
        </div>
      </div>
    </div>
  );
}

import Image from 'next/image';
import {
  MedicationType,
  ProductNameType,
  ProductType,
  SelectedProductType,
} from '../types/checkout';

interface ProductCardProps {
  productName: ProductNameType;
  productInfo: ProductType;
  onSelect: (medicationType: MedicationType) => void;
  selectedProduct: SelectedProductType | null;
}

const ProductCard = ({ productName, productInfo, onSelect, selectedProduct }: ProductCardProps) => {
  const { pricing, additionalFeatures } = productInfo;
  const isSelected = selectedProduct?.name === productName;
  const imageSrc = isSelected
    ? pricing[selectedProduct.medicationType].noBgImage
    : pricing.injections.noBgImage;

  const monthlyPrice = pricing.injections.monthlyPrice;

  const displayName =
    productName === 'tirzepatide'
      ? 'Tirzepatide – Most Powerful Option'
      : 'Semaglutide – Proven & Steady';

  const description =
    productName === 'tirzepatide'
      ? 'Stronger appetite control. Preferred for faster weight loss.'
      : 'Effective appetite control with slower, consistent results.';

  return (
    <div
      className={`relative w-full min-w-0 flex-1 overflow-hidden rounded-2xl border-2 bg-white transition-all ${isSelected ? 'border-green-500 shadow-lg shadow-green-50' : 'border-gray-200 hover:border-gray-300'}`}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 shadow-md">
          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {/* Product image */}
        <div
          className="mb-2 flex items-center justify-center rounded-xl py-3"
          style={{ backgroundColor: '#f8f9fa' }}
        >
          <Image
            src={imageSrc}
            alt={`${productName} product`}
            width={160}
            height={160}
            className="object-contain"
          />
        </div>

        {/* Forbes / USA Today badges */}
        <div className="mb-4 flex items-center justify-center gap-5 text-xs font-medium tracking-wider text-gray-400">
          <span className="italic">Forbes</span>
          <span className="font-bold" style={{ letterSpacing: '0.05em' }}>
            USA TODAY
          </span>
        </div>

        {/* Title + rating */}
        <h3
          className="mb-1.5 text-base font-bold leading-snug sm:text-lg"
          style={{ color: '#101010' }}
        >
          {displayName}
        </h3>
        <div className="mb-3 flex items-center gap-1.5">
          <div className="flex">
            {'★★★★'.split('').map((_, i) => (
              <svg
                key={i}
                className="h-4 w-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <svg className="h-4 w-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <span className="text-sm text-gray-500">4.7</span>
        </div>

        {/* Description pill */}
        <div
          className="mb-4 rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ backgroundColor: '#e8f5e9', color: '#2e7d32' }}
        >
          {description}
        </div>

        {/* Recommended badge */}
        <div className="mb-5 flex w-fit items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <span className="text-sm">⭐</span>
          <span className="text-sm font-semibold text-green-700">
            Recommended for most patients
          </span>
        </div>

        {/* Features */}
        <div className="mb-6 space-y-2">
          {additionalFeatures?.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-sm text-gray-400">•</span>
              <span className="text-sm text-gray-700">{f}</span>
            </div>
          ))}
        </div>

        {/* Pricing section divider */}
        <div className="mb-5 border-t border-gray-100" />

        {/* Monthly Plan Pricing */}
        <div className="mb-1">
          <p className="text-sm font-bold tracking-wide" style={{ color: '#101010' }}>
            MONTHLY PLAN
          </p>
          <p className="text-xs font-medium italic text-green-600">Lowest industry pricing</p>
        </div>

        <div className="mb-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold" style={{ color: '#22c55e' }}>
            ${monthlyPrice}
          </span>
          <span className="text-sm text-gray-500">/month</span>
        </div>

        <p className="mb-4 text-xs italic text-gray-500">
          $150 monthly savings locked in for life — reflected automatically at checkout
        </p>

        {/* Plan features with green checks */}
        <div className="mb-5 space-y-2.5">
          {[
            'Same price every month — no increases ever',
            'Same price regardless of dose',
            'Physician-guided dosing, adjusted as needed',
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium text-gray-700">{f}</span>
            </div>
          ))}
        </div>

        <p className="mb-5 text-xs italic text-gray-400">
          No surprises. No step-ups. No dosage-based pricing.
        </p>

        {/* Select button */}
        <button
          onClick={() => onSelect('injections')}
          className={`w-full rounded-full py-3.5 text-base font-semibold transition-all ${isSelected ? 'bg-green-500 text-white shadow-md' : 'border-2 border-green-500 bg-white text-green-600 hover:bg-green-50'}`}
        >
          {isSelected ? 'Selected ✓' : 'Select →'}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;

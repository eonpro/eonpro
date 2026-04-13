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
  const { pricing, badgeText, additionalFeatures } = productInfo;
  const isSelected = selectedProduct?.name === productName;
  const imageSrc = isSelected
    ? pricing[selectedProduct.medicationType].noBgImage
    : pricing.injections.noBgImage;

  const displayName = productName === 'tirzepatide'
    ? 'Tirzepatide – Most Powerful Option'
    : 'Semaglutide – Proven & Steady';

  const description = productName === 'tirzepatide'
    ? 'Stronger appetite control. Preferred for faster weight loss.'
    : 'Effective appetite control with slower, consistent results.';

  return (
    <div className={`rounded-2xl border-2 p-5 sm:p-6 bg-white flex-1 min-w-[280px] transition-all ${isSelected ? 'border-green-500 shadow-lg' : 'border-gray-200'}`}>
      {/* Product image */}
      <div className="flex items-center justify-center py-4 mb-2">
        <Image
          src={imageSrc}
          alt={`${productName} product`}
          width={180}
          height={180}
          className="object-contain"
        />
      </div>

      {/* Forbes / USA Today badges */}
      <div className="flex items-center justify-center gap-4 mb-4 text-xs text-gray-400 italic">
        <span>Forbes</span>
        <span>USA TODAY</span>
      </div>

      {/* Title + rating */}
      <h3 className="font-bold text-lg mb-1" style={{ color: '#101010' }}>{displayName}</h3>
      <div className="flex items-center gap-1 mb-3">
        <div className="flex text-green-500">
          {'★★★★'.split('').map((_, i) => (
            <svg key={i} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
          ))}
          <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        </div>
        <span className="text-sm text-gray-500">4.7</span>
      </div>

      {/* Description */}
      <div className="rounded-full px-4 py-2 mb-4 text-sm" style={{ backgroundColor: productName === 'tirzepatide' ? '#e8f5e9' : '#e3f2fd', color: productName === 'tirzepatide' ? '#2e7d32' : '#1565c0' }}>
        {description}
      </div>

      {/* Recommended badge */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-green-200 bg-green-50 w-fit">
        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        <span className="text-sm font-medium text-green-700">Recommended for most patients</span>
      </div>

      {/* Features */}
      <div className="space-y-2 mb-6">
        {additionalFeatures?.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-sm text-gray-500">•</span>
            <span className="text-sm text-gray-700">{f}</span>
          </div>
        ))}
      </div>

      {/* Select button - always injections for now */}
      <button
        onClick={() => onSelect('injections')}
        className={`w-full py-3.5 rounded-full font-medium text-base transition-all ${isSelected ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'}`}
      >
        {isSelected ? 'Selected ✓' : 'Select →'}
      </button>
    </div>
  );
};

export default ProductCard;

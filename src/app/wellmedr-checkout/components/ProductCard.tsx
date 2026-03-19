import Button from '@/app/wellmedr-checkout/components/ui/button/Button';
import CheckboxWithText from '@/app/wellmedr-checkout/components/ui/CheckboxWithText';
import Image from 'next/image';
import { Fragment } from 'react';
import {
  MedicationType,
  ProductNameType,
  ProductType,
  SelectedProductType,
} from '../types';

const getPriceDifferenceText = (diff: number) => {
  if (diff === 0) {
    return '';
  } else if (diff > 0) {
    return `(+$${diff})`;
  } else {
    return `(-$${Math.abs(diff)})`;
  }
};

interface ProductCardProps {
  productName: ProductNameType;
  productInfo: ProductType;
  onSelect: (medicationType: MedicationType) => void;
  selectedProduct: SelectedProductType | null;
}

const ProductCard = ({
  productName,
  productInfo,
  onSelect,
  selectedProduct,
}: ProductCardProps) => {
  const { pricing, badgeText, additionalFeatures } = productInfo;

  const priceDifference =
    pricing.tablets.monthlyPrice - pricing.injections.monthlyPrice;

  const handleProductSelectWithSmoothScroll = (
    medicationType: MedicationType,
  ) => {
    onSelect(medicationType);

    setTimeout(() => {
      const selectedProductCard = document.getElementById(
        'selected-product-card',
      );
      if (selectedProductCard) {
        selectedProductCard.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 50);
  };

  const monthlyPrice =
    selectedProduct && productName === selectedProduct.name
      ? pricing[selectedProduct.medicationType].monthlyPrice
      : pricing.injections.monthlyPrice;

  const basePrice = monthlyPrice + 100;

  const imageSrc =
    selectedProduct && productName === selectedProduct.name
      ? pricing[selectedProduct.medicationType].noBgImage
      : pricing.injections.noBgImage;

  return (
    <div className="card sm:flex-1">
      <div className="bg-secondary px-4 py-2 rounded-full w-fit">
        <span className="font-medium text-sm tracking-[1%] text-white">
          {badgeText}
        </span>
      </div>
      <div className="flex items-center justify-center w-full relative">
        <Image
          src={imageSrc}
          alt={`${productName} product`}
          width={300}
          height={300}
          className="object-cover object-center"
          placeholder="blur"
        />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2.5 mb-6">
        <p className="card-title sm:text-[1.75rem] text-center block title capitalize">
          {productName}
        </p>
        <p className="sm:text-lg text-center">
          Prescribed for only{' '}
          <span className="text-lg sm:text-2xl text-primary">
            ${monthlyPrice}
          </span>{' '}
          <span className="tracking-[0%] line-through opacity-50">
            ${basePrice}
          </span>
        </p>
      </div>

      {/* Features */}
      <div className="flex flex-col gap-3 mb-8">
        <CheckboxWithText>
          Available in both oral and easy injectable forms
        </CheckboxWithText>
        <CheckboxWithText>
          Save over <span className="font-semibold">$100</span> instantly on
          your monthly plan
        </CheckboxWithText>
        <CheckboxWithText>
          PRICE INCLUDES: doctor consult, unlimited 1:1 medical support, written
          prescription + 4 weeks of medicine and{' '}
          <span className="font-semibold">free shipping</span>
        </CheckboxWithText>
      </div>

      <p className="text-center title mb-4 text-lg sm:text-[1.5rem]">
        Which do you prefer?
      </p>

      <div className="flex flex-col w-full gap-3 mb-6">
        <Button
          onClick={() => handleProductSelectWithSmoothScroll('injections')}
          text="Injections"
          variant="default"
          type="button"
        />
        <Button
          onClick={() => handleProductSelectWithSmoothScroll('tablets')}
          text={['Tablets', getPriceDifferenceText(priceDifference)]
            .filter(Boolean)
            .join(' ')}
          variant="outline"
          type="button"
        />
      </div>

      <div className="flex flex-col gap-3">
        {additionalFeatures &&
          additionalFeatures.map((feature, idx) => (
            <Fragment key={`pf_${idx}`}>
              <CheckboxWithText>{feature}</CheckboxWithText>
            </Fragment>
          ))}
        <CheckboxWithText>
          Prescribed and shipped free within 2 days
        </CheckboxWithText>
        <CheckboxWithText>
          Prescribed by world-class, US-based, board-certified clinicians
        </CheckboxWithText>
        <CheckboxWithText>Send a message to your doctor 24/7</CheckboxWithText>
      </div>
    </div>
  );
};

export default ProductCard;

'use client';

import { Fragment } from 'react';
import { ProductNameType } from '@/app/wellmedr-checkout/types/checkout';
import ProductCard from '../ProductCard';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';

export default function Products() {
  const { products, selectedProduct, handleProductSelect } = useCheckout();

  return (
    <section className="w-full flex flex-col sm:flex-row gap-4" id="products">
      {Object.entries(products).map(([name, product]) => {
        return (
          <Fragment key={`product-${name}`}>
            <ProductCard
              productName={name as ProductNameType}
              productInfo={product}
              selectedProduct={selectedProduct}
              onSelect={(medicationType) =>
                handleProductSelect(name as ProductNameType, medicationType)
              }
            />
          </Fragment>
        );
      })}
    </section>
  );
}

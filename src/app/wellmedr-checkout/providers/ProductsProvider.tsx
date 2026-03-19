'use client';

import { createContext, useContext, ReactNode } from 'react';
import { ProductNameType, MedicationType, ProductType } from '@/app/wellmedr-checkout/types/checkout';
import { products as fallbackProducts } from '@/app/wellmedr-checkout/data/products';

type PriceIdsMap = Record<
  ProductNameType,
  Record<MedicationType, Record<string, string>>
>;

interface ProductsContextValue {
  products: Record<ProductNameType, ProductType>;
  priceIds: PriceIdsMap | null;
  isFromStripe: boolean;
  getStripePriceId: (
    productName: ProductNameType,
    medicationType: MedicationType,
    planType: 'monthly' | 'quarterly' | 'sixMonth',
  ) => string;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

interface ProductsProviderProps {
  children: ReactNode;
  products?: Record<ProductNameType, ProductType>;
  priceIds?: PriceIdsMap | null;
  isFromStripe?: boolean;
}

export function ProductsProvider({
  children,
  products = fallbackProducts,
  priceIds = null,
  isFromStripe = false,
}: ProductsProviderProps) {
  const getStripePriceId = (
    productName: ProductNameType,
    medicationType: MedicationType,
    planType: 'monthly' | 'quarterly' | 'sixMonth',
  ): string => {
    if (priceIds) {
      const priceId = priceIds[productName]?.[medicationType]?.[planType];
      if (priceId) return priceId;
    }

    return `price_${productName}_${medicationType}_${planType}`;
  };

  return (
    <ProductsContext.Provider
      value={{ products, priceIds, isFromStripe, getStripePriceId }}
    >
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts(): ProductsContextValue {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductsProvider');
  }
  return context;
}

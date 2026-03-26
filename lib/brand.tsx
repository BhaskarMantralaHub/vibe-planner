'use client';

import { createContext, useContext, type ReactNode } from 'react';

type Brand = 'toolkit' | 'cricket';

interface BrandConfig {
  brand: Brand;
  name: string;
  gradient: string;
  focusRing: string;
  accentVar: string;
}

const BRANDS: Record<Brand, BrandConfig> = {
  toolkit: {
    brand: 'toolkit',
    name: "Viber's Toolkit",
    gradient: 'from-[var(--toolkit)] to-[var(--toolkit-accent)]',
    focusRing: 'focus-visible:ring-[var(--toolkit)]/40',
    accentVar: '--toolkit',
  },
  cricket: {
    brand: 'cricket',
    name: 'Sunrisers Manteca',
    gradient: 'from-[var(--cricket)] to-[var(--cricket-accent)]',
    focusRing: 'focus-visible:ring-[var(--cricket)]/40',
    accentVar: '--cricket',
  },
};

const BrandContext = createContext<BrandConfig>(BRANDS.toolkit);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={BRANDS[brand]}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}

export { BRANDS };
export type { Brand, BrandConfig };

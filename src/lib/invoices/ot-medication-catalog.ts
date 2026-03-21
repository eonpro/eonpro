/**
 * OT (ot.eonpro.io) medication / package pricing — re-exports retail calculator catalog.
 * Use `OT_RETAIL_PACKAGES` and `getOtRetailPackagePriceCents` when building invoices or charges.
 */

export {
  OT_RETAIL_PACKAGES,
  type OtRetailPackage,
  type OtRetailPackageCategory,
  type OtRetailPackageKind,
  type OtRetailDurationMonths,
  getOtRetailPackageById,
  getOtRetailPackagePriceCents,
  filterOtRetailPackages,
  exportOtRetailPackagesCsv,
  OT_RETAIL_CATEGORY_LABELS,
  formatOtRetailUsd,
} from './ot-retail-packages';

import { formatOtRetailUsd } from './ot-retail-packages';

/** @alias formatOtRetailUsd — existing call sites */
export function formatOtCatalogUsd(priceCents: number | null): string {
  return formatOtRetailUsd(priceCents);
}

/** @deprecated Use OT_RETAIL_PACKAGES (same array; name kept for older imports). */
export { OT_RETAIL_PACKAGES as OT_MEDICATION_PRICING_CATALOG } from './ot-retail-packages';

/** @deprecated Use filterOtRetailPackages */
export { filterOtRetailPackages as filterOtMedicationCatalog } from './ot-retail-packages';

/** @deprecated Use exportOtRetailPackagesCsv */
export { exportOtRetailPackagesCsv as exportOtMedicationCatalogCsv } from './ot-retail-packages';

export type FedExServiceType = {
  code: string;
  label: string;
  category: 'ground' | 'express' | 'overnight';
  estimatedDays: string;
};

export const FEDEX_SERVICE_TYPES: FedExServiceType[] = [
  { code: 'FEDEX_GROUND', label: 'FedEx Ground', category: 'ground', estimatedDays: '1-5 business days' },
  { code: 'GROUND_HOME_DELIVERY', label: 'FedEx Home Delivery', category: 'ground', estimatedDays: '1-7 business days' },
  { code: 'FEDEX_EXPRESS_SAVER', label: 'FedEx Express Saver', category: 'express', estimatedDays: '3 business days' },
  { code: 'FEDEX_2_DAY', label: 'FedEx 2Day', category: 'express', estimatedDays: '2 business days' },
  { code: 'FEDEX_2_DAY_AM', label: 'FedEx 2Day A.M.', category: 'express', estimatedDays: '2 business days (AM)' },
  { code: 'STANDARD_OVERNIGHT', label: 'FedEx Standard Overnight', category: 'overnight', estimatedDays: 'Next business day' },
  { code: 'PRIORITY_OVERNIGHT', label: 'FedEx Priority Overnight', category: 'overnight', estimatedDays: 'Next business day (by 10:30 AM)' },
  { code: 'FIRST_OVERNIGHT', label: 'FedEx First Overnight', category: 'overnight', estimatedDays: 'Next business day (by 8 AM)' },
];

export const FEDEX_PACKAGING_TYPES = [
  { code: 'YOUR_PACKAGING', label: 'Your Packaging' },
  { code: 'FEDEX_ENVELOPE', label: 'FedEx Envelope' },
  { code: 'FEDEX_PAK', label: 'FedEx Pak' },
  { code: 'FEDEX_SMALL_BOX', label: 'FedEx Small Box' },
  { code: 'FEDEX_MEDIUM_BOX', label: 'FedEx Medium Box' },
  { code: 'FEDEX_LARGE_BOX', label: 'FedEx Large Box' },
  { code: 'FEDEX_TUBE', label: 'FedEx Tube' },
] as const;

export type FedExPackagingCode = (typeof FEDEX_PACKAGING_TYPES)[number]['code'];

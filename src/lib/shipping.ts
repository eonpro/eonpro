export type ShippingMethod = {
  id: number;
  label: string;
};

export const SHIPPING_METHODS: ShippingMethod[] = [
  { id: 9, label: "PATIENT PICKUP" },
  { id: 8065, label: "PROVIDER PICK UP" },
  { id: 8086, label: "PROVIDER DELIVERY" },
  { id: 8097, label: "UPS - NEXT DAY - FLORIDA" },
  { id: 8113, label: "UPS SATURDAY DELIVERY" },
  { id: 8115, label: "UPS - OVERNIGHT" },
  { id: 8116, label: "UPS - OVERNIGHT EARLY AM" },
  { id: 8117, label: "UPS - OVERNIGHT SAVER" },
  { id: 8152, label: "UPS - NEXT DAY - OUTSIDE FLORIDA" },
  { id: 8200, label: "UPS - 2nd Day Air" },
];


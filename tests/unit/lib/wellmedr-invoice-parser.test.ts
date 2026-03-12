import { describe, it, expect } from 'vitest';
import { parseWellmedrInvoiceText } from '@/lib/invoices/wellmedr-parser';

const SAMPLE_TEXT = `Logos Pharmacy
7543 W Waters Ave
Tampa, FL 33615
RETURN SERVICE REQUESTED
Payment by:
Check 	Mastercard 	Visa 	Discover 	American E.
Credit Card 	Expiration Date
Signature 	CVV/CVC
WELLMEDR LLC
EMIL BOTVINNIK
144 PALOMA DR
CORAL GABLES, FL 33143
Please Remit To:
Logos Pharmacy
7543 W Waters Ave
Tampa, FL 33615
Amount
Due $ 8,511.00
Payor
ID 208447805
Billing
Profile
ID
2513788
PLEASE RETURN TOP PORTION WITH YOUR PAYMENT AND KEEP BOTTOM PORTION FOR YOUR RECORDS
Logos Pharmacy
7543 W Waters Ave
Tampa, FL 33615
Invoice
#68174773
TX Status:
TOTAL DUE
$ 8,511.00
Date 	Order 	Rx 	Patient 	Description 	Doctor Qty Unit
Price
Discount/
Item Amount
03/05/2026 101076487 911031547 Baliatico, Lisa
RX 911031547 (Order
#101076487)
SEMAGLUTIDE/GLYCINE
2.5/20MG/ML (2ML VIAL)
SOLUTION Injectable
2.5MG/20MG/ML (Qty: 1
each) (Fill ID: 951031802)
Sigle,
Gavin 1 	$ 40.00 	$ 40.00
03/05/2026 101076487 911031549 Baliatico, Lisa
RX 911031549 (Order
#101076487)
SYRINGES/ALCOHOL
PADS (KIT OF #10)
Device 31G 5/16" 1cc
(Qty: 3 each) (Fill ID:
951031804)
Sigle,
Gavin 3 	$ 0.00 	$ 0.00
03/05/2026 101076487
Order #101076487 -
FEDEX-STANDARD
OVERNIGHT
1 	$ 0.00 	$ 0.00
Subtotal $ 40.00
03/05/2026 101066467 911031441 Benavides,
Terri
RX 911031441 (Order
#101066467)
SEMAGLUTIDE/GLYCINE
2.5/20MG/ML (1ML VIAL)
SOLUTION Injectable
2.5MG/20MG/ML (Qty: 1
each) (Fill ID: 951031696)
Sigle,
Gavin 1 	$ 35.00 	$ 35.00
03/05/2026 101066467 911031442 Benavides,
Terri
RX 911031442 (Order
#101066467)
SYRINGES/ALCOHOL
PADS (KIT OF #10)
Device 31G 5/16" 1cc
(Qty: 1 each) (Fill ID:
951031697)
Sigle,
Gavin 1 	$ 0.00 	$ 0.00
03/05/2026 101066467
Order #101066467 -
FEDEX-STANDARD
OVERNIGHT
1 	$ 0.00 	$ 0.00
03/05/2026 101066467 WELLMEDR SHIPPING-
1 VIAL 1 	$ 15.00 	$ 15.00
Subtotal 	$ 50.00
TOTAL $ 90.00
Please Note: Compounded prescriptions are made specially for you and cannot be returned.`;

describe('WellMedR Invoice Parser', () => {
  it('parses invoice header fields', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);

    expect(result.header.pharmacyName).toBe('Logos Pharmacy');
    expect(result.header.invoiceNumber).toBe('68174773');
    expect(result.header.amountDueCents).toBe(851100);
    expect(result.header.payorId).toBe('208447805');
    expect(result.header.billingProfileId).toBe('2513788');
  });

  it('parses grand total', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    expect(result.totalCents).toBe(9000);
  });

  it('extracts the correct number of line items', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    // 2 medications + 1 supply + 1 carrier (order 1)
    // + 1 medication + 1 supply + 1 carrier + 1 shipping fee (order 2)
    expect(result.lineItems.length).toBeGreaterThanOrEqual(6);
  });

  it('correctly identifies medication lines', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    const meds = result.lineItems.filter((li) => li.lineType === 'MEDICATION');
    expect(meds.length).toBeGreaterThanOrEqual(2);

    const firstMed = meds[0];
    expect(firstMed.lifefileOrderId).toBe('101076487');
    expect(firstMed.rxNumber).toBe('911031547');
    expect(firstMed.fillId).toBe('951031802');
    expect(firstMed.amountCents).toBe(4000);
    expect(firstMed.unitPriceCents).toBe(4000);
    expect(firstMed.medicationName).toBe('SEMAGLUTIDE');
  });

  it('correctly identifies supply lines', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    const supplies = result.lineItems.filter((li) => li.lineType === 'SUPPLY');
    expect(supplies.length).toBeGreaterThanOrEqual(1);

    const firstSupply = supplies[0];
    expect(firstSupply.rxNumber).toBe('911031549');
    expect(firstSupply.amountCents).toBe(0);
    expect(firstSupply.quantity).toBe(3);
  });

  it('correctly identifies shipping carrier lines', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    const carriers = result.lineItems.filter((li) => li.lineType === 'SHIPPING_CARRIER');
    expect(carriers.length).toBeGreaterThanOrEqual(1);

    const firstCarrier = carriers[0];
    expect(firstCarrier.lifefileOrderId).toBe('101076487');
    expect(firstCarrier.shippingMethod).toContain('FEDEX');
    expect(firstCarrier.amountCents).toBe(0);
  });

  it('correctly identifies WellMedR shipping fee lines', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    const fees = result.lineItems.filter((li) => li.lineType === 'SHIPPING_FEE');
    expect(fees.length).toBeGreaterThanOrEqual(1);

    const fee = fees[0];
    expect(fee.lifefileOrderId).toBe('101066467');
    expect(fee.amountCents).toBe(1500);
  });

  it('sets subtotal on the last line item per order', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    const withSubtotal = result.lineItems.filter((li) => li.orderSubtotalCents !== null);
    expect(withSubtotal.length).toBe(2);
    expect(withSubtotal[0].orderSubtotalCents).toBe(4000);
    expect(withSubtotal[1].orderSubtotalCents).toBe(5000);
  });

  it('counts unique orders', () => {
    const result = parseWellmedrInvoiceText(SAMPLE_TEXT);
    expect(result.orderCount).toBe(2);
  });

  it('handles page break noise', () => {
    const textWithPageBreak = SAMPLE_TEXT.replace(
      'Subtotal $ 40.00',
      `3/5/26, 12:59 PM 	Invoice for Order #101077321
https://host4.lifefile.net/application_main_zfw/newinvoice/renderreceipt/bool_has_email/1/transaction_id/68174773/order_id/101077321/show_receipt 2/35

-- 2 of 35 --

Subtotal $ 40.00`
    );

    const result = parseWellmedrInvoiceText(textWithPageBreak);
    expect(result.lineItems.length).toBeGreaterThanOrEqual(6);
    expect(result.header.invoiceNumber).toBe('68174773');
  });
});

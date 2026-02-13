# Airtable Address Field Configuration for Prescription Shipping

## Problem

Prescriptions require a shipping address, but the WellMedR Airtable automation may not be sending
address fields to the webhook.

## Solution: Configure Airtable Automation

In your Airtable automation that calls `/api/webhooks/wellmedr-invoice`, ensure you include the
address fields in the POST body.

### Required Fields in Webhook Payload

Add these fields to your Airtable automation's "Run a script" or webhook action:

```json
{
  "customer_email": "{Email}",
  "customer_name": "{Name}",
  "method_payment_id": "{Stripe Payment Method ID}",
  "product": "{Product}",
  "price": "{Price}",
  "plan": "{Plan}",
  "medication_type": "{Medication Type}",

  // ADDRESS FIELDS - Add these!
  "address": "{Street Address}",
  "address_line2": "{Apt/Suite/Unit}",
  "city": "{City}",
  "state": "{State}",
  "zip": "{Zip Code}",
  "phone": "{Phone Number}"
}
```

### Supported Field Name Variations

The webhook accepts many field name formats. Use whichever matches your Airtable column names:

**Street Address:**

- `address`, `address_line1`, `address_line_1`, `addressLine1`
- `street_address`, `streetAddress`
- `shipping_address`, `shippingAddress`

**Apartment/Suite:**

- `address_line2`, `address_line_2`, `addressLine2`
- `apartment`, `apt`, `suite`, `unit`

**City:**

- `city`, `shipping_city`, `shippingCity`

**State:**

- `state`, `shipping_state`, `shippingState`, `province`
- (Accepts full name "Florida" or code "FL")

**ZIP Code:**

- `zip`, `zip_code`, `zipCode`
- `postal_code`, `postalCode`
- `shipping_zip`, `shippingZip`

**Phone:**

- `phone`, `phone_number`, `phoneNumber`

## Airtable Automation Script Example

If using "Run a script" action in Airtable:

```javascript
// Get the record that triggered the automation
let record = input.config();

// Build the webhook payload
let payload = {
  customer_email: record.email,
  customer_name: record.name,
  method_payment_id: record.payment_method_id,
  product: record.product,
  price: record.price,
  plan: record.plan,
  medication_type: record.medication_type,

  // Include address fields
  address: record.street_address || record.address,
  address_line2: record.apartment || record.address_line_2,
  city: record.city,
  state: record.state,
  zip: record.zip_code || record.zip,
  phone: record.phone,
};

// Send to webhook
let response = await fetch('https://app.eonpro.io/api/webhooks/wellmedr-invoice', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': 'YOUR_SECRET_HERE',
  },
  body: JSON.stringify(payload),
});

console.log(await response.json());
```

## Debugging

Check the Vercel logs for messages like:

```
[WELLMEDR-INVOICE] Address fields in payload: {
  address1Value: "123 Main St" or "NOT FOUND",
  cityValue: "Miami" or "NOT FOUND",
  ...
}
```

If you see "NOT FOUND" for address fields, the Airtable automation isn't sending them.

## Alternative: Manual Patient Address Update

If you can't modify the Airtable automation, you can manually update patient addresses in the admin
panel:

1. Go to Patients
2. Find the patient
3. Edit their profile
4. Add the shipping address

The prescription queue will then have the address available for Lifefile submission.

# Lifefile Integration - Shipping Services Update

## Updated Shipping Services (as of November 24, 2025)

The following shipping services are now available in the Lifefile integration:

### Complete List of Shipping Services

| Service ID | Service Name                    | Description                            |
| ---------- | ------------------------------- | -------------------------------------- |
| 9          | PATIENT PICKUP                  | Patient picks up from pharmacy         |
| 8065       | PROVIDER PICK UP                | Provider picks up from pharmacy        |
| 8086       | PROVIDER DELIVERY               | Delivered to provider location         |
| 8113       | UPS SATURDAY DELIVERY           | UPS Saturday delivery service          |
| 8115       | UPS - OVERNIGHT                 | UPS standard overnight delivery        |
| 8116       | UPS - OVERNIGHT EARLY AM        | UPS early morning overnight delivery   |
| 8117       | UPS - OVERNIGHT SAVER           | UPS overnight saver service            |
| **8200**   | **UPS - SECOND DAY AIR** ✨     | **UPS 2-day air delivery (NEW)**       |
| **8097**   | **UPS - NEXT DAY - FLORIDA** ✨ | **UPS next day Florida service (NEW)** |

## Location Configuration

The Lifefile integration uses the following location:

| Header        | Value  | Location Name |
| ------------- | ------ | ------------- |
| X-Location-ID | 110396 | logospharmacy |

## Environment Variables

Ensure the following environment variables are set in your `.env` file:

```bash
# Lifefile API Configuration
LIFEFILE_API_URL=<your-api-url>
LIFEFILE_VENDOR_ID=<your-vendor-id>
LIFEFILE_PRACTICE_ID=<your-practice-id>
LIFEFILE_LOCATION_ID=110396  # logospharmacy
LIFEFILE_NETWORK_ID=<your-network-id>
LIFEFILE_PRACTICE_NAME="APOLLO BASED HEALTH LLC"
```

## Implementation Details

### File Updates

1. **`src/lib/shipping.ts`** - Updated with new shipping methods
   - Added UPS - SECOND DAY AIR (ID: 8200)
   - Added UPS - NEXT DAY - FLORIDA (ID: 8097)

### Usage in Prescriptions

When creating a prescription order, the shipping method ID is passed in the `shippingMethod` field:

```typescript
// Example usage in prescription creation
const prescription = {
  patient: {...},
  medications: [...],
  shippingMethod: 8200, // UPS - Second Day Air
  // ... other fields
};
```

### API Integration

The shipping method ID is sent to Lifefile's API in the order payload:

```typescript
// In src/app/api/prescriptions/route.ts
shipping: {
  recipientType: "patient",
  // ... recipient details
  service: p.shippingMethod, // Shipping method ID (e.g., 8200)
}
```

## Testing

To test the new shipping methods:

1. Create a new prescription
2. Select one of the new shipping options:
   - "UPS - SECOND DAY AIR"
   - "UPS - NEXT DAY - FLORIDA"
3. Submit the prescription
4. Verify the order is created successfully with the correct shipping method

## Notes

- The shipping method IDs are specific to Lifefile's system
- Florida-specific shipping (8097) should only be used for Florida addresses
- Always verify address validity before selecting shipping methods
- Provider pickup/delivery options (8065, 8086) require provider coordination

## Changelog

- **November 24, 2025**: Added two new UPS shipping methods (8200, 8097)
- **Previous**: Initial 7 shipping methods configured

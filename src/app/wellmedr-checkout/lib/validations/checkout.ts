import { z } from 'zod';
import { STATE_ABBREVIATIONS } from '@/app/wellmedr-checkout/lib/states';

// Type for state plus empty (for initial/unselected state)
const stateWithEmptyValues = [...STATE_ABBREVIATIONS, ''] as const;

// Shipping Address Schema
export const shippingAddressSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .min(2, 'First name must be at least 2 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .min(2, 'Last name must be at least 2 characters'),
  address: z.string().min(1, 'Address is required').min(5, 'Please enter a valid address'),
  apt: z.string().optional(),
  city: z.string().min(1, 'City is required').min(2, 'Please enter a valid city'),
  state: z
    .enum(stateWithEmptyValues)
    .refine((val) => val !== '', { message: 'Please select a state' }),
  zipCode: z
    .string()
    .min(1, 'Zip code is required')
    .regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid zip code (e.g., 12345)'),
  billingAddressSameAsShipment: z.boolean(),
});

// Billing Address Schema
export const billingAddressSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  address: z.string(),
  apt: z.string().optional(),
  city: z.string(),
  state: z.enum(stateWithEmptyValues),
  zipCode: z.string(),
});

// Checkout Form Schema
export const checkoutFormSchema = z
  .object({
    selectedProduct: z
      .object({
        name: z.enum(['semaglutide', 'tirzepatide']),
        medicationType: z.enum(['injections', 'tablets']),
      })
      .nullable(),
    selectedPlan: z.string(),
    planDetails: z
      .object({
        id: z.string(),
        plan_type: z.enum(['quarterly', 'monthly', 'sixMonth', 'annual']),
        title: z.string(),
        totalPayToday: z.number(),
        monthlyPrice: z.number(),
        originalPrice: z.number().optional(),
        savings: z.number().optional(),
      })
      .nullable(),
    selectedAddons: z.array(z.enum(['nad_plus', 'sermorelin', 'b12', 'elite_bundle'])).default([]),
    shippingAddress: shippingAddressSchema,
    billingAddress: billingAddressSchema,
    cardholderName: z.string().min(1, 'Name on card is required'),
    email: z.string().min(1, 'Email is required').email('Please enter a valid email').max(254),
    phone: z
      .string()
      .min(1, 'Phone number is required')
      .min(10, 'Please enter a valid phone number')
      .max(20),
    promotionCodeId: z.string().optional(),
    discountPercentage: z.number().optional(),
    discountAmount: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    // When billing address is different from shipping, validate billing fields
    if (!data.shippingAddress.billingAddressSameAsShipment) {
      const billingFields = [
        { field: 'firstName', message: 'First name is required' },
        { field: 'lastName', message: 'Last name is required' },
        { field: 'address', message: 'Address is required' },
        { field: 'city', message: 'City is required' },
        { field: 'state', message: 'Please select a state' },
        { field: 'zipCode', message: 'Zip code is required' },
      ] as const;

      for (const { field, message } of billingFields) {
        if (!data.billingAddress[field] || data.billingAddress[field] === '') {
          ctx.addIssue({
            code: 'custom',
            message,
            path: ['billingAddress', field],
          });
        }
      }

      // Validate zip code format if provided
      if (data.billingAddress.zipCode && !/^\d{5}(-\d{4})?$/.test(data.billingAddress.zipCode)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Please enter a valid zip code (e.g., 12345)',
          path: ['billingAddress', 'zipCode'],
        });
      }
    }
  });

export type ShippingAddressSchemaType = z.infer<typeof shippingAddressSchema>;
export type BillingAddressSchemaType = z.infer<typeof billingAddressSchema>;

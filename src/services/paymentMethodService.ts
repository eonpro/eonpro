import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  encrypt,
  decrypt,
  getLast4,
  detectCardBrand,
  validateCardNumber,
  generateCardFingerprint,
} from '@/lib/encryption';
import type { PaymentMethod } from '@prisma/client';

export interface CardDetails {
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv?: string;
  cardholderName: string;
  billingZip: string;
}

export interface SavedCard {
  id: number;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  createdAt: Date;
}

export class PaymentMethodService {
  /**
   * Add a new payment method for a patient
   */
  static async addPaymentMethod(
    patientId: number,
    cardDetails: CardDetails,
    setAsDefault: boolean = false
  ): Promise<PaymentMethod> {
    // Validate card number
    if (!validateCardNumber(cardDetails.cardNumber)) {
      throw new Error('Invalid card number');
    }

    // Validate expiry
    const now = new Date();
    const expiryDate = new Date(cardDetails.expiryYear, cardDetails.expiryMonth - 1);
    if (expiryDate < now) {
      throw new Error('Card has expired');
    }

    // Generate fingerprint to check for duplicates
    const fingerprint = generateCardFingerprint(cardDetails.cardNumber);

    // Check if card already exists for this patient
    const existingCard: any = await prisma.paymentMethod.findFirst({
      where: {
        patientId,
        fingerprint,
        isActive: true,
      },
    });

    if (existingCard) {
      throw new Error('This card is already saved');
    }

    // If setting as default, unset other defaults
    if (setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: {
          patientId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Encrypt sensitive data
    const encryptedCardNumber = encrypt(cardDetails.cardNumber);
    const encryptedCvv = cardDetails.cvv ? encrypt(cardDetails.cvv) : undefined;

    // Create payment method
    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        patientId,
        encryptedCardNumber,
        cardLast4: getLast4(cardDetails.cardNumber),
        cardBrand: detectCardBrand(cardDetails.cardNumber),
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
        cardholderName: cardDetails.cardholderName,
        encryptedCvv,
        billingZip: cardDetails.billingZip,
        isDefault: setAsDefault,
        encryptionKeyId: 'v1', // Version of encryption key
        fingerprint,
      },
    });

    // Clear CVV from memory
    if (cardDetails.cvv) {
      cardDetails.cvv = '';
    }

    return paymentMethod;
  }

  /**
   * Get all active payment methods for a patient (without decrypting)
   */
  static async getPaymentMethods(patientId: number): Promise<SavedCard[]> {
    const methods = await prisma.paymentMethod.findMany({
      where: {
        patientId,
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return methods.map((method: any) => ({
      id: method.id,
      last4: method.cardLast4,
      brand: method.cardBrand || 'Unknown',
      expiryMonth: method.expiryMonth,
      expiryYear: method.expiryYear,
      cardholderName: method.cardholderName,
      isDefault: method.isDefault,
      createdAt: method.createdAt,
    }));
  }

  /**
   * Get decrypted card details (use with extreme caution)
   */
  static async getDecryptedCard(
    paymentMethodId: number,
    patientId: number
  ): Promise<CardDetails | null> {
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
        isActive: true,
      },
    });

    if (!method) {
      return null;
    }

    try {
      const cardNumber = decrypt(method.encryptedCardNumber);
      const cvv = method.encryptedCvv ? decrypt(method.encryptedCvv) : undefined;

      return {
        cardNumber,
        expiryMonth: method.expiryMonth,
        expiryYear: method.expiryYear,
        cvv,
        cardholderName: method.cardholderName,
        billingZip: method.billingZip,
      };
    } catch (error: unknown) {
      logger.error(
        'Failed to decrypt card:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error('Failed to decrypt payment method');
    }
  }

  /**
   * Set a payment method as default
   */
  static async setDefaultPaymentMethod(paymentMethodId: number, patientId: number): Promise<void> {
    // Verify ownership
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
        isActive: true,
      },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Unset other defaults
    await prisma.paymentMethod.updateMany({
      where: {
        patientId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set new default
    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isDefault: true },
    });
  }

  /**
   * Remove a payment method (soft delete)
   */
  static async removePaymentMethod(paymentMethodId: number, patientId: number): Promise<void> {
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
      },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Soft delete
    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isActive: false },
    });

    // If this was the default, set another as default
    if (method.isDefault) {
      const nextDefault: any = await prisma.paymentMethod.findFirst({
        where: {
          patientId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (nextDefault) {
        await prisma.paymentMethod.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }
  }

  /**
   * Update payment method expiry
   */
  static async updateExpiry(
    paymentMethodId: number,
    patientId: number,
    expiryMonth: number,
    expiryYear: number
  ): Promise<void> {
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
        isActive: true,
      },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Validate new expiry
    const now = new Date();
    const expiryDate = new Date(expiryYear, expiryMonth - 1);
    if (expiryDate < now) {
      throw new Error('Card has expired');
    }

    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: {
        expiryMonth,
        expiryYear,
      },
    });
  }

  /**
   * Check if a payment method is expired
   */
  static isExpired(expiryMonth: number, expiryYear: number): boolean {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth);
  }

  /**
   * Format card for display
   */
  static formatCardDisplay(card: SavedCard): string {
    const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
    return `${card.brand} •••• ${card.last4} (${expiry})`;
  }
}

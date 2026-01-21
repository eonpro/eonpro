import crypto from 'crypto';

// CRITICAL: Encryption key must be set in environment variables
// Never fall back to random keys - this causes data loss on restart
const IV_LENGTH = 16;
const AES_KEY_LENGTH = 32; // AES-256 requires 32 bytes

function getEncryptionKey(): Buffer {
  const key = process.env.CARD_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  
  if (!key) {
    // In development/test, use a deterministic key for local testing only
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.warn('[ENCRYPTION] WARNING: Using development encryption key. Set CARD_ENCRYPTION_KEY in production!');
      // Return a deterministic 32-byte key for development
      return Buffer.from('dev_encryption_key_for_testing!!'); // Exactly 32 chars
    }
    throw new Error(
      'CRITICAL: CARD_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable must be set. ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  
  // Support multiple key formats:
  // 1. 64-character hex string (32 bytes) - recommended: openssl rand -hex 32
  // 2. 32-character string (used directly as bytes)
  
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    // Hex-encoded 32-byte key
    return Buffer.from(key, 'hex');
  }
  
  if (key.length === 32) {
    // Direct string key (legacy format)
    return Buffer.from(key, 'utf8');
  }
  
  throw new Error(
    `CRITICAL: Invalid encryption key format. Key length: ${key.length}. ` +
    'Expected either: 64-character hex string (openssl rand -hex 32) or 32-character string. ' +
    'Current key is neither format.'
  );
}

const ENCRYPTION_KEY = getEncryptionKey();

export function encryptCardData(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    ENCRYPTION_KEY, // Already a Buffer
    iv
  );
  
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptCardData(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    ENCRYPTION_KEY, // Already a Buffer
    iv
  );
  
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString();
}

// Generic encryption functions for any sensitive data
export const encryptData = encryptCardData;
export const decryptData = decryptCardData;

export function getCardBrand(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(cleanNumber)) return 'Visa';
  if (/^5[1-5]/.test(cleanNumber)) return 'Mastercard';
  if (/^3[47]/.test(cleanNumber)) return 'American Express';
  if (/^6(?:011|5)/.test(cleanNumber)) return 'Discover';
  if (/^(?:2131|1800|35)/.test(cleanNumber)) return 'JCB';
  if (/^3(?:0[0-5]|[68])/.test(cleanNumber)) return 'Diners Club';
  
  return 'Unknown';
}

export function maskCardNumber(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\s/g, '');
  return `****${cleanNumber.slice(-4)}`;
}

export function formatCardNumber(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\D/g, '');
  const groups = cleanNumber.match(/.{1,4}/g);
  return groups ? groups.join(' ') : cleanNumber;
}

export function validateCardNumber(cardNumber: string): boolean {
  const cleanNumber = cardNumber.replace(/\D/g, '');
  
  if (cleanNumber.length < 13 || cleanNumber.length > 19) {
    return false;
  }
  
  // Luhn algorithm
  let sum = 0;
  let isEven = false;
  
  for (let i = cleanNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanNumber[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

export function validateExpiryDate(month: string, year: string): boolean {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const expMonth = parseInt(month, 10);
  const expYear = parseInt(year, 10);
  
  if (expMonth < 1 || expMonth > 12) return false;
  
  if (expYear < currentYear) return false;
  if (expYear === currentYear && expMonth < currentMonth) return false;
  
  return true;
}

export function validateCVV(cvv: string, cardBrand?: string): boolean {
  const cleanCVV = cvv.replace(/\D/g, '');
  
  if (cardBrand === 'American Express') {
    return cleanCVV.length === 4;
  }
  
  return cleanCVV.length === 3;
}

// Additional helper functions for payment method service
export function getLast4(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\s/g, '');
  return cleanNumber.slice(-4);
}

export function detectCardBrand(cardNumber: string): string {
  return getCardBrand(cardNumber);
}

export function generateCardFingerprint(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\D/g, '');
  const hash = crypto.createHash('sha256');
  hash.update(cleanNumber);
  return hash.digest('hex');
}

// Aliases for generic encryption functions
export const encrypt = encryptData;
export const decrypt = decryptData;
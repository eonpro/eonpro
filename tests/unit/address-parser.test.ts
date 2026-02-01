/**
 * Address Parser Unit Tests
 * =========================
 * Tests for the centralized address parsing library.
 */

import { describe, it, expect } from 'vitest';
import {
  parseAddressString,
  extractAddressFromPayload,
  smartParseAddress,
  normalizeState,
  normalizeZip,
  normalizeCity,
  normalizeStreetAddress,
  normalizeAddress,
  toTitleCase,
  validateAddress,
  isValidAddress,
  isApartmentString,
  isStateName,
  isZipCode,
} from '@/lib/address';

describe('Address Parser', () => {
  describe('parseAddressString', () => {
    it('should parse standard 4-part address: Street, City, State, ZIP', () => {
      const result = parseAddressString('289 Marcus St, Hamilton, Montana, 59840');

      expect(result.address1).toBe('289 Marcus St');
      expect(result.city).toBe('Hamilton');
      expect(result.state).toBe('MT');
      expect(result.zip).toBe('59840');
    });

    it('should parse address with apartment: Street, Apt, City, State, ZIP', () => {
      const result = parseAddressString('201 ELBRIDGE AVE, APT F, Cloverdale, California, 95425');

      expect(result.address1).toBe('201 ELBRIDGE AVE');
      expect(result.address2).toBe('APT F');
      expect(result.city).toBe('Cloverdale');
      expect(result.state).toBe('CA');
      expect(result.zip).toBe('95425');
    });

    it('should parse address with bare apartment number', () => {
      const result = parseAddressString('2900 W Dallas St, 130, Houston, Texas, 77019');

      expect(result.address1).toBe('2900 W Dallas St');
      expect(result.address2).toBe('130');
      expect(result.city).toBe('Houston');
      expect(result.state).toBe('TX');
      expect(result.zip).toBe('77019');
    });

    it('should handle state name to code conversion', () => {
      const result = parseAddressString('123 Main St, New York, New York, 10001');

      expect(result.state).toBe('NY');
    });

    it('should handle 2-letter state codes', () => {
      const result = parseAddressString('456 Oak Ave, Los Angeles, CA, 90001');

      expect(result.state).toBe('CA');
    });

    it('should handle State ZIP combined in last part', () => {
      const result = parseAddressString('789 Pine Rd, Seattle, WA 98101');

      expect(result.city).toBe('Seattle');
      expect(result.state).toBe('WA');
      expect(result.zip).toBe('98101');
    });

    it('should handle 9-digit ZIP codes', () => {
      const result = parseAddressString('100 First St, Boston, MA, 02101-1234');

      expect(result.zip).toBe('02101-1234');
    });

    it('should handle empty or invalid input', () => {
      expect(parseAddressString('')).toEqual({
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
      });

      expect(parseAddressString(null as any)).toEqual({
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
      });
    });

    it('should handle single-line address', () => {
      const result = parseAddressString('123 Main Street');

      expect(result.address1).toBe('123 Main Street');
      expect(result.city).toBe('');
      expect(result.state).toBe('');
    });
  });

  describe('extractAddressFromPayload', () => {
    it('should extract address from shipping_address combined string', () => {
      const result = extractAddressFromPayload({
        shipping_address: '289 Marcus St, Hamilton, Montana, 59840',
      });

      expect(result.address1).toBe('289 Marcus St');
      expect(result.city).toBe('Hamilton');
      expect(result.state).toBe('MT');
      expect(result.zip).toBe('59840');
    });

    it('should extract address from billing_address combined string', () => {
      const result = extractAddressFromPayload({
        billing_address: '456 Oak Ave, Portland, Oregon, 97201',
      });

      expect(result.address1).toBe('456 Oak Ave');
      expect(result.city).toBe('Portland');
      expect(result.state).toBe('OR');
      expect(result.zip).toBe('97201');
    });

    it('should prefer individual fields over combined string', () => {
      const result = extractAddressFromPayload({
        shipping_address: '999 Wrong St, Wrong City, CA, 99999',
        address1: '123 Correct St',
        city: 'Right City',
        state: 'NY',
        zip: '10001',
      });

      expect(result.address1).toBe('123 Correct St');
      expect(result.city).toBe('Right City');
      expect(result.state).toBe('NY');
      expect(result.zip).toBe('10001');
    });

    it('should handle various field name conventions', () => {
      const result = extractAddressFromPayload({
        addressLine1: '100 First Ave',
        shippingCity: 'Chicago',
        shipping_state: 'Illinois',
        zipCode: '60601',
      });

      expect(result.address1).toBe('100 First Ave');
      expect(result.city).toBe('Chicago');
      expect(result.state).toBe('IL');
      expect(result.zip).toBe('60601');
    });
  });

  describe('smartParseAddress', () => {
    it('should parse JSON address string', () => {
      const jsonAddress = JSON.stringify({
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
      });

      const result = smartParseAddress(jsonAddress);

      expect(result.address1).toBe('123 Main St');
      expect(result.city).toBe('New York');
      expect(result.state).toBe('NY');
    });

    it('should parse formatted string address', () => {
      const result = smartParseAddress('456 Oak Ave, Los Angeles, CA, 90001');

      expect(result.address1).toBe('456 Oak Ave');
      expect(result.city).toBe('Los Angeles');
      expect(result.state).toBe('CA');
    });

    it('should parse object input', () => {
      const result = smartParseAddress({
        shipping_address: '789 Pine Rd, Seattle, WA, 98101',
      });

      expect(result.address1).toBe('789 Pine Rd');
      expect(result.city).toBe('Seattle');
      expect(result.state).toBe('WA');
    });
  });

  describe('normalizeState', () => {
    it('should convert full state names to codes', () => {
      expect(normalizeState('California')).toBe('CA');
      expect(normalizeState('california')).toBe('CA');
      expect(normalizeState('CALIFORNIA')).toBe('CA');
      expect(normalizeState('New York')).toBe('NY');
      expect(normalizeState('new york')).toBe('NY');
    });

    it('should preserve valid 2-letter codes', () => {
      expect(normalizeState('CA')).toBe('CA');
      expect(normalizeState('ca')).toBe('CA');
      expect(normalizeState('NY')).toBe('NY');
    });

    it('should handle empty/invalid input', () => {
      expect(normalizeState('')).toBe('');
      expect(normalizeState(undefined as any)).toBe('');
    });

    it('should handle multi-word state names', () => {
      expect(normalizeState('North Carolina')).toBe('NC');
      expect(normalizeState('South Dakota')).toBe('SD');
      expect(normalizeState('West Virginia')).toBe('WV');
      expect(normalizeState('District of Columbia')).toBe('DC');
    });
  });

  describe('normalizeZip', () => {
    it('should preserve valid 5-digit ZIP', () => {
      expect(normalizeZip('10001')).toBe('10001');
      expect(normalizeZip('90210')).toBe('90210');
    });

    it('should normalize 9-digit ZIP', () => {
      expect(normalizeZip('10001-1234')).toBe('10001-1234');
      expect(normalizeZip('100011234')).toBe('10001-1234');
    });

    it('should handle empty/invalid input', () => {
      expect(normalizeZip('')).toBe('');
      expect(normalizeZip(undefined as any)).toBe('');
    });

    it('should extract ZIP from noisy input', () => {
      expect(normalizeZip('ZIP: 10001')).toBe('10001');
    });
  });

  describe('normalizeCity', () => {
    it('should capitalize city names', () => {
      expect(normalizeCity('new york')).toBe('New York');
      expect(normalizeCity('LOS ANGELES')).toBe('Los Angeles');
      expect(normalizeCity('san francisco')).toBe('San Francisco');
    });

    it('should handle empty input', () => {
      expect(normalizeCity('')).toBe('');
      expect(normalizeCity(undefined as any)).toBe('');
    });
  });

  describe('validateAddress', () => {
    it('should validate complete address', () => {
      const result = validateAddress({
        address1: '123 Main St',
        address2: '',
        city: 'New York',
        state: 'NY',
        zip: '10001',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing fields', () => {
      const result = validateAddress({
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about PO Box addresses', () => {
      const result = validateAddress({
        address1: 'PO Box 123',
        address2: '',
        city: 'New York',
        state: 'NY',
        zip: '10001',
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('PO Box'))).toBe(true);
    });
  });

  describe('isValidAddress', () => {
    it('should return true for valid address', () => {
      expect(isValidAddress({
        address1: '123 Main St',
        address2: '',
        city: 'New York',
        state: 'NY',
        zip: '10001',
      })).toBe(true);
    });

    it('should return false for incomplete address', () => {
      expect(isValidAddress({
        address1: '123 Main St',
        address2: '',
        city: '',
        state: '',
        zip: '',
      })).toBe(false);
    });
  });

  describe('Helper functions', () => {
    describe('isApartmentString', () => {
      it('should detect apartment prefixes', () => {
        expect(isApartmentString('APT 4B')).toBe(true);
        expect(isApartmentString('Apt. 4B')).toBe(true);
        expect(isApartmentString('Unit 100')).toBe(true);
        expect(isApartmentString('Suite 200')).toBe(true);
        expect(isApartmentString('#5')).toBe(true);
      });

      it('should detect bare apartment numbers', () => {
        expect(isApartmentString('130')).toBe(true);
        expect(isApartmentString('4B')).toBe(true);
        expect(isApartmentString('12A')).toBe(true);
      });

      it('should detect alphanumeric apartment numbers', () => {
        expect(isApartmentString('G05')).toBe(true);
        expect(isApartmentString('2078')).toBe(true);
        expect(isApartmentString('E216')).toBe(true);
        expect(isApartmentString('PH1')).toBe(true);
        expect(isApartmentString('TH12')).toBe(true);
      });

      it('should detect apartment numbers with dashes', () => {
        expect(isApartmentString('A-1')).toBe(true);
        expect(isApartmentString('12-B')).toBe(true);
        expect(isApartmentString('1-A')).toBe(true);
      });

      it('should not detect regular addresses', () => {
        expect(isApartmentString('123 Main Street')).toBe(false);
        expect(isApartmentString('New York')).toBe(false);
      });
    });

    describe('isStateName', () => {
      it('should recognize state names', () => {
        expect(isStateName('California')).toBe(true);
        expect(isStateName('california')).toBe(true);
        expect(isStateName('New York')).toBe(true);
      });

      it('should recognize state codes', () => {
        expect(isStateName('CA')).toBe(true);
        expect(isStateName('NY')).toBe(true);
      });

      it('should reject invalid states', () => {
        expect(isStateName('New Jersey City')).toBe(false);
        expect(isStateName('XX')).toBe(false);
      });
    });

    describe('isZipCode', () => {
      it('should validate 5-digit ZIP', () => {
        expect(isZipCode('10001')).toBe(true);
        expect(isZipCode('90210')).toBe(true);
      });

      it('should validate 9-digit ZIP', () => {
        expect(isZipCode('10001-1234')).toBe(true);
      });

      it('should reject invalid ZIP', () => {
        expect(isZipCode('1234')).toBe(false);
        expect(isZipCode('123456')).toBe(false);
        expect(isZipCode('ABCDE')).toBe(false);
      });
    });
  });
});

describe('Real-world WellMedR Address Scenarios', () => {
  it('should parse Airtable shipping_address format', () => {
    // These are actual formats from the Airtable screenshots
    const testCases = [
      {
        input: '289 Marcus St, Hamltion, Montana, 59840',
        expected: { address1: '289 Marcus St', city: 'Hamltion', state: 'MT', zip: '59840' },
      },
      {
        input: '201 ELBRIDGE AVE, APT F, Cloverdale, California, 95425',
        expected: { address1: '201 ELBRIDGE AVE', address2: 'APT F', city: 'Cloverdale', state: 'CA', zip: '95425' },
      },
      {
        input: '169 Maree Dr, Daleville, Alabama, 36322',
        expected: { address1: '169 Maree Dr', city: 'Daleville', state: 'AL', zip: '36322' },
      },
      {
        input: '6503 S Prado Cove, Mohave Valley, AZ, 86440',
        expected: { address1: '6503 S Prado Cove', city: 'Mohave Valley', state: 'AZ', zip: '86440' },
      },
      {
        input: '42047 Eddy Point Ln, Astoria, Oregon, 97103',
        expected: { address1: '42047 Eddy Point Ln', city: 'Astoria', state: 'OR', zip: '97103' },
      },
      {
        input: '18250 N 25th ave , Apt 2078, Phoenix, Arizona, 85023',
        expected: { address1: '18250 N 25th ave', address2: 'Apt 2078', city: 'Phoenix', state: 'AZ', zip: '85023' },
      },
      {
        input: '10124 9th Ave W, E216, Everett, WA, 98204',
        expected: { address1: '10124 9th Ave W', address2: 'E216', city: 'Everett', state: 'WA', zip: '98204' },
      },
      {
        input: '2900 W Dallas St, 130, Houston, Texas, 77019',
        expected: { address1: '2900 W Dallas St', address2: '130', city: 'Houston', state: 'TX', zip: '77019' },
      },
      {
        input: '11726 SAHARA WAY, Dallas, Texas, 75218',
        expected: { address1: '11726 SAHARA WAY', city: 'Dallas', state: 'TX', zip: '75218' },
      },
      {
        input: '2930 Tait Terrace, Norfolk, VA, 23509',
        expected: { address1: '2930 Tait Terrace', city: 'Norfolk', state: 'VA', zip: '23509' },
      },
      {
        input: '4554 Hammocks Dr, Apt 201, Erie, Pennsylvania, 16506',
        expected: { address1: '4554 Hammocks Dr', address2: 'Apt 201', city: 'Erie', state: 'PA', zip: '16506' },
      },
    ];

    for (const { input, expected } of testCases) {
      const result = parseAddressString(input);

      expect(result.address1.trim()).toBe(expected.address1);
      if (expected.address2) {
        expect(result.address2).toBe(expected.address2);
      }
      expect(result.city).toBe(expected.city);
      expect(result.state).toBe(expected.state);
      expect(result.zip).toBe(expected.zip);
    }
  });

  it('should handle payload extraction for WellMedR webhook', () => {
    // Simulating the Airtable webhook payload
    const payload = {
      shipping_address: '8201 Shorecrest Ct, Spring Hill, Florida, 34606',
      customer_email: 'patient@example.com',
    };

    const result = extractAddressFromPayload(payload);

    expect(result.address1).toBe('8201 Shorecrest Ct');
    expect(result.city).toBe('Spring Hill');
    expect(result.state).toBe('FL');
    expect(result.zip).toBe('34606');
  });
});

describe('Title Case Formatting', () => {
  describe('toTitleCase', () => {
    it('should capitalize first letter of each word', () => {
      expect(toTitleCase('123 MAIN STREET')).toBe('123 Main Street');
      expect(toTitleCase('456 oak avenue')).toBe('456 Oak Avenue');
      expect(toTitleCase('PINE ROAD')).toBe('Pine Road');
    });

    it('should preserve directionals (N, S, E, W, NE, NW, SE, SW)', () => {
      expect(toTitleCase('456 NW OAK AVE')).toBe('456 NW Oak Ave');
      expect(toTitleCase('123 SE MAIN ST')).toBe('123 SE Main St');
      expect(toTitleCase('789 N FIRST ST')).toBe('789 N First St');
      expect(toTitleCase('100 WEST BROADWAY')).toBe('100 West Broadway');
    });

    it('should preserve unit designators', () => {
      expect(toTitleCase('APT 2078')).toBe('APT 2078');
      expect(toTitleCase('STE 100')).toBe('STE 100');
      expect(toTitleCase('BLDG A')).toBe('BLDG A');
      expect(toTitleCase('FL 5')).toBe('FL 5');
    });

    it('should handle ordinals correctly', () => {
      expect(toTitleCase('1ST FLOOR')).toBe('1st Floor');
      expect(toTitleCase('2ND STREET')).toBe('2nd Street');
      expect(toTitleCase('3RD AVENUE')).toBe('3rd Avenue');
      expect(toTitleCase('4TH PLACE')).toBe('4th Place');
      expect(toTitleCase('25TH STREET')).toBe('25th Street');
    });

    it('should handle empty or null input', () => {
      expect(toTitleCase('')).toBe('');
      expect(toTitleCase(null)).toBe('');
      expect(toTitleCase(undefined)).toBe('');
    });

    it('should handle alphanumeric parts', () => {
      expect(toTitleCase('4TH AVE')).toBe('4th Ave');
      expect(toTitleCase('10124 9TH AVE W')).toBe('10124 9th Ave W');
    });

    it('should handle real WellMedR addresses', () => {
      expect(toTitleCase('8201 SHORECREST CT')).toBe('8201 Shorecrest Ct');
      expect(toTitleCase('18250 N 25TH AVE')).toBe('18250 N 25th Ave');
      expect(toTitleCase('11726 SAHARA WAY')).toBe('11726 Sahara Way');
      expect(toTitleCase('2930 TAIT TERRACE')).toBe('2930 Tait Terrace');
    });
  });

  describe('normalizeStreetAddress', () => {
    it('should apply title case by default', () => {
      expect(normalizeStreetAddress('123 MAIN STREET')).toBe('123 Main Street');
      expect(normalizeStreetAddress('456 NW OAK AVE')).toBe('456 NW Oak Ave');
    });

    it('should preserve title case when already correct', () => {
      expect(normalizeStreetAddress('123 Main Street')).toBe('123 Main Street');
    });

    it('should allow disabling title case', () => {
      expect(normalizeStreetAddress('123 MAIN STREET', { titleCase: false })).toBe('123 MAIN STREET');
    });

    it('should handle empty input', () => {
      expect(normalizeStreetAddress('')).toBe('');
      expect(normalizeStreetAddress(undefined)).toBe('');
    });

    it('should normalize multiple spaces', () => {
      expect(normalizeStreetAddress('123   MAIN    STREET')).toBe('123 Main Street');
    });
  });

  describe('normalizeAddress (complete address)', () => {
    it('should apply title case to all address components', () => {
      const result = normalizeAddress({
        address1: '123 MAIN STREET',
        address2: 'APT 4B',
        city: 'NEW YORK',
        state: 'ny',
        zip: '10001',
      });

      expect(result.address1).toBe('123 Main Street');
      expect(result.address2).toBe('APT 4b');
      expect(result.city).toBe('New York');
      expect(result.state).toBe('NY');
      expect(result.zip).toBe('10001');
    });

    it('should handle real WellMedR addresses', () => {
      const result = normalizeAddress({
        address1: '8201 SHORECREST CT',
        address2: '',
        city: 'SPRING HILL',
        state: 'florida',
        zip: '34606',
      });

      expect(result.address1).toBe('8201 Shorecrest Ct');
      expect(result.city).toBe('Spring Hill');
      expect(result.state).toBe('FL');
      expect(result.zip).toBe('34606');
    });

    it('should preserve directionals in full address normalization', () => {
      const result = normalizeAddress({
        address1: '456 NW OAK AVE',
        address2: '',
        city: 'PORTLAND',
        state: 'OR',
        zip: '97201',
      });

      expect(result.address1).toBe('456 NW Oak Ave');
      expect(result.city).toBe('Portland');
    });
  });
});

import { describe, it, expect } from "vitest";
import { providerSchema } from "@/lib/providerSchema";

describe("providerSchema", () => {
  it("trims and validates NPIs while normalizing state names", () => {
    const parsed = providerSchema.parse({
      npi: " 1467560003 ",
      firstName: "  Joel ",
      lastName: " Jones ",
      titleLine: "DO",
      licenseState: "Texas",
      licenseNumber: " T2895 ",
      dea: " BJ7346201 ",
      email: " jjonesdo@eonmeds.com ",
      phone: " 8132637844 ",
      signatureDataUrl: null,
    });

    expect(parsed.npi).toBe("1467560003");
    expect(parsed.firstName).toBe("Joel");
    expect(parsed.lastName).toBe("Jones");
    expect(parsed.licenseState).toBe("TX");
    expect(parsed.licenseNumber).toBe("T2895");
    expect(parsed.dea).toBe("BJ7346201");
    expect(parsed.email).toBe("jjonesdo@eonmeds.com");
    expect(parsed.phone).toBe("8132637844");
    expect(parsed.signatureDataUrl).toBeUndefined();
  });

  it("throws when NPI is not exactly 10 digits", () => {
    expect(() =>
      providerSchema.parse({
        npi: "123",
        firstName: "Test",
        lastName: "Doc",
      })
    ).toThrow(/NPI must be exactly 10 digits/);
  });

  it("throws when license state cannot be normalized", () => {
    expect(() =>
      providerSchema.parse({
        npi: "1234567890",
        firstName: "Test",
        lastName: "Doc",
        licenseState: "NotAState",
      })
    ).toThrow(/License state must be a valid US state/);
  });
});


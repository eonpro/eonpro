import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/prescriptions/route";
import { prisma } from "@/lib/db";
import lifefile from "@/lib/lifefile";
import { generatePrescriptionPDF } from "@/lib/pdf";

const lifefileCast = lifefile as unknown as {
  createFullOrder: ReturnType<typeof vi.fn>;
};

vi.mock("@/lib/db", () => {
  const fn = () => vi.fn();
  const prismaMock = {
    provider: { findUnique: fn() },
    patient: { findFirst: fn(), create: fn() },
    order: { create: fn(), update: fn(), updateMany: fn(), findMany: fn(), findFirst: fn() },
    rx: { createMany: fn() },
    orderEvent: { create: fn() },
  };
  return { prisma: prismaMock };
});

vi.mock("@/lib/lifefile", () => ({
  default: {
    createFullOrder: vi.fn(),
  },
}));

vi.mock("@/lib/pdf", () => ({
  generatePrescriptionPDF: vi.fn().mockResolvedValue("base64pdf=="),
}));

vi.mock("@/lib/medications", () => ({
  MEDS: {
    TEST_MED: {
      id: 111,
      name: "Test Medication",
      strength: "10 mg",
      form: "TAB",
    },
  },
}));

describe("POST /api/prescriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const prismaCast = prisma as unknown as Record<string, any>;
    prismaCast.provider.findUnique.mockResolvedValue({
      id: 1,
      firstName: "Jane",
      lastName: "Doe",
      npi: "1234567890",
      licenseState: "FL",
      licenseNumber: "ME1234",
      dea: "AA1234567",
      signatureDataUrl: null,
      titleLine: "MD",
    });
    prismaCast.patient.findFirst.mockResolvedValue(null);
    prismaCast.patient.create.mockResolvedValue({ id: 99 });
    prismaCast.order.create.mockResolvedValue({ id: 500 });
    prismaCast.rx.createMany.mockResolvedValue(undefined);
    lifefileCast.createFullOrder.mockResolvedValue({
      orderId: "LF-1",
      status: "received",
    });
    prismaCast.order.update.mockResolvedValue({
      id: 500,
      status: "received",
    });
    prismaCast.order.updateMany.mockResolvedValue(undefined);
  });

  it("creates order successfully", async () => {
    const payload = {
      providerId: 1,
      patient: {
        firstName: "John",
        lastName: "Smith",
        dob: "01/01/1990",
        gender: "m",
        phone: "5551112222",
        email: "john@example.com",
        address1: "123 Main",
        address2: "",
        city: "Tampa",
        state: "FL",
        zip: "33602",
      },
      rxs: [
        {
          medicationKey: "TEST_MED",
          sig: "Take 1 daily",
          quantity: "30",
          refills: "1",
        },
      ],
      shippingMethod: 8115,
      signatureDataUrl: null,
    };

    const req = new Request("http://localhost/api/prescriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(lifefileCast.createFullOrder).toHaveBeenCalledOnce();
    expect(prisma.order.create).toHaveBeenCalled();
    expect(generatePrescriptionPDF).toHaveBeenCalled();
  });

  it("rejects unknown medication", async () => {
    const payload = {
      providerId: 1,
      patient: {
        firstName: "John",
        lastName: "Smith",
        dob: "01/01/1990",
        gender: "m",
        phone: "5551112222",
        email: "john@example.com",
        address1: "123 Main",
        address2: "",
        city: "Tampa",
        state: "FL",
        zip: "33602",
      },
      rxs: [
        {
          medicationKey: "UNKNOWN",
          sig: "Take 1 daily",
          quantity: "30",
          refills: "1",
        },
      ],
      shippingMethod: 8115,
      signatureDataUrl: null,
    };

    const req = new Request("http://localhost/api/prescriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid medicationKey/);
  });
});


import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as webhookPost } from "@/app/api/lifefile-webhook/route";
import { prisma } from "@/lib/db";
import { createHmac } from "crypto";

vi.mock("@/lib/db", () => {
  const fn = () => vi.fn();
  const prismaMock = {
    provider: { findUnique: fn() },
    patient: { findFirst: fn(), create: fn() },
    order: {
      create: fn(),
      update: fn(),
      updateMany: fn(),
      findMany: fn(),
      findFirst: fn(),
    },
    rx: { createMany: fn() },
    orderEvent: { create: fn() },
  };
  return { prisma: prismaMock };
});

describe("POST /api/lifefile-webhook", () => {
  const prismaCast = prisma as unknown as Record<string, any>;

  beforeEach(() => {
    process.env.LIFEFILE_WEBHOOK_USERNAME = "hook";
    process.env.LIFEFILE_WEBHOOK_PASSWORD = "secret";
    process.env.LIFEFILE_WEBHOOK_ALLOWED_IPS = "1.1.1.1,2.2.2.2";
    process.env.LIFEFILE_WEBHOOK_HMAC_SECRET = "hmacsecret";
    process.env.LIFEFILE_WEBHOOK_ALERT_URL = "https://example.com/sheets-hook";

    prismaCast.order.findFirst.mockResolvedValue({
      id: 101,
      lifefileOrderId: "LF-1",
    });
    prismaCast.order.update.mockResolvedValue(undefined);
    prismaCast.orderEvent.create.mockResolvedValue(undefined);
  });

  it("accepts valid webhook and updates order", async () => {
    const body = JSON.stringify({
      orderId: "LF-1",
      status: "shipped",
      shipping: { trackingNumber: "1Z999" },
    });
    const signature = createHmac(
      "sha256",
      process.env.LIFEFILE_WEBHOOK_HMAC_SECRET as string
    )
      .update(body)
      .digest("hex");

    const req = new Request("http://localhost/api/lifefile-webhook", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("hook:secret").toString("base64")}`,
        "x-forwarded-for": "1.1.1.1",
        "x-lifefile-signature": signature,
      },
      body,
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);
    expect(prismaCast.order.update).toHaveBeenCalled();
    expect(prismaCast.orderEvent.create).toHaveBeenCalled();
  });

  it("rejects unauthorized IP and notifies alert hook", async () => {
    const body = JSON.stringify({ orderId: "LF-1" });
    const signature = createHmac(
      "sha256",
      process.env.LIFEFILE_WEBHOOK_HMAC_SECRET as string
    )
      .update(body)
      .digest("hex");

    const alertSpy = vi.spyOn(global, "fetch");

    const req = new Request("http://localhost/api/lifefile-webhook", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("hook:secret").toString("base64")}`,
        "x-forwarded-for": "10.0.0.1",
        "x-lifefile-signature": signature,
      },
      body,
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(401);
    expect(alertSpy).toHaveBeenCalledWith(
      process.env.LIFEFILE_WEBHOOK_ALERT_URL,
      expect.objectContaining({ method: "POST" })
    );
  });
});


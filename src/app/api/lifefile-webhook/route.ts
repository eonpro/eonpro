import { prisma } from "@/lib/db";
import { createHmac } from "crypto";
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';

const SIGNATURE_HEADER = "x-lifefile-signature";

type WebhookConfig = {
  username?: string;
  password?: string;
  allowedIps: string[];
  hmacSecret?: string;
  alertUrl?: string;
};

function getConfig(): WebhookConfig {
  const allowedIps = (process.env.LIFEFILE_WEBHOOK_ALLOWED_IPS ?? "")
    .split(",")
    .map((ip: any) => ip.trim())
    .filter(Boolean);
  return {
    username: process.env.LIFEFILE_WEBHOOK_USERNAME,
    password: process.env.LIFEFILE_WEBHOOK_PASSWORD,
    allowedIps,
    hmacSecret: process.env.LIFEFILE_WEBHOOK_HMAC_SECRET,
    alertUrl: process.env.LIFEFILE_WEBHOOK_ALERT_URL,
  };
}

function unauthorized(message: string) {
  return new Response(message, {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="lifefile-webhook"' },
  });
}

function log(level: "info" | "warn" | "error", message: string, meta?: any) {
  const payload = meta ? { message, ...meta } : { message };
  const serialized = JSON.stringify(payload);
  if (level === "error") {
    logger.error("[LIFEFILE WEBHOOK]", { value: serialized });
  } else if (level === "warn") {
    logger.warn("[LIFEFILE WEBHOOK]", { value: serialized });
  } else {
    logger.debug("[LIFEFILE WEBHOOK]", { value: serialized });
  }
}

async function sendAlert(config: WebhookConfig, event: string, detail: Record<string, unknown>) {
  log("error", event, detail);
  if (!config.alertUrl) return;
  try {
    await fetch(config.alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...detail }),
    });
  } catch (err: any) {
    // @ts-ignore
   
    logger.error("[LIFEFILE WEBHOOK] Failed to notify alert URL", err);
  }
}

function verifyBasicAuth(config: WebhookConfig, header: string | null): boolean {
  if (!config.username || !config.password) {
    logger.warn("[LIFEFILE WEBHOOK] Missing LIFEFILE_WEBHOOK_USERNAME/PASSWORD env vars"
    );
    return false;
  }
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
  const [authUser, authPass] = decoded.split(":");
  return authUser === config.username && authPass === config.password;
}

function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

function verifyIp(config: WebhookConfig, ip: string | null): boolean {
  if (!config.allowedIps.length) return true;
  if (!ip) return false;
  return config.allowedIps.includes(ip);
}

function verifySignature(
  config: WebhookConfig,
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!config.hmacSecret) return true;
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", config.hmacSecret).update(rawBody).digest("hex");
  return timingSafeEqual(expected, signatureHeader);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function extractFirst<T>(...values: Array<T | undefined | null>): T | undefined {
  for (const val of values) {
    if (val !== undefined && val !== null && val !== "") {
      return val;
    }
  }
  return undefined;
}

export async function POST(request: Request) {
  const config = getConfig();
  const authHeader = request.headers.get("authorization");
  if (!verifyBasicAuth(config, authHeader)) {
    await sendAlert(config, "webhook_auth_failed", { reason: "basic_auth" });
    return unauthorized("Unauthorized");
  }

  const ip = getRequestIp(request);
  if (!verifyIp(config, ip)) {
    await sendAlert(config, "webhook_ip_blocked", { ip });
    return unauthorized("Unauthorized");
  }

  const rawBody = await request.text();
  if (!verifySignature(config, rawBody, request.headers.get(SIGNATURE_HEADER) ?? undefined)) {
    await sendAlert(config, "webhook_signature_invalid", { ip, header: SIGNATURE_HEADER });
    return unauthorized("Unauthorized");
  }

  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (err: any) {
    // @ts-ignore
   
    await sendAlert(config, "webhook_invalid_json", {
      ip,
      err: (err as Error).message,
    });
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const lifefileOrderId = extractFirst(
    payload.orderId,
    payload.data?.orderId,
    payload?.order?.orderId
  );
  const referenceId = extractFirst(
    payload.referenceId,
    payload.data?.referenceId,
    payload.order?.referenceId
  );
  const status = extractFirst(
    payload.status,
    payload.order?.status,
    payload.data?.status
  );
  const shippingStatus = extractFirst(
    payload.shippingStatus,
    payload.shipping?.status,
    payload.data?.shippingStatus
  );
  const trackingNumber = extractFirst(
    payload.trackingNumber,
    payload.shipping?.trackingNumber,
    payload.data?.trackingNumber
  );
  const trackingUrl = extractFirst(
    payload.trackingUrl,
    payload.shipping?.trackingUrl,
    payload.data?.trackingUrl
  );

  if (!lifefileOrderId && !referenceId) {
    await sendAlert(config, "webhook_missing_identifiers", { payload });
    return Response.json(
      { error: "Payload missing lifefile order identifiers" },
      { status: 400 }
    );
  }

  const order: any = await // @ts-ignore
    prisma.order.findFirst({
    where: lifefileOrderId
      ? { lifefileOrderId: String(lifefileOrderId) }
      : { referenceId: String(referenceId) },
  });

  if (!order) {
    await sendAlert(config, "webhook_unknown_order", {
      lifefileOrderId,
      referenceId,
    });
    return Response.json(
      { warning: "Order not found, payload logged" },
      { status: 202 }
    );
  }

  const updateData: any = {
    lastWebhookPayload: JSON.stringify(payload),
    lastWebhookAt: new Date(),
  };
  if (status) updateData.status = status;
  if (shippingStatus) updateData.shippingStatus = shippingStatus;
  if (trackingNumber) updateData.trackingNumber = trackingNumber;
  if (trackingUrl) updateData.trackingUrl = trackingUrl;

  await prisma.order.update({
    where: { id: order.id },
    data: updateData,
  });

  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      lifefileOrderId: order.lifefileOrderId,
      eventType: status ?? shippingStatus ?? "webhook",
      payload,
      note: trackingNumber ? `Tracking # ${trackingNumber}` : undefined,
    },
  });

  log("info", "webhook_processed", {
    orderId: order.id,
    lifefileOrderId,
    status,
    shippingStatus,
  });

  return Response.json({ success: true });
}


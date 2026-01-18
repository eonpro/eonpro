/**
 * EONPRO Webhook Ping Endpoint
 * 
 * Simple endpoint to verify connectivity from intake platform.
 * Returns success without authentication - for connectivity testing only.
 * 
 * GET /api/webhooks/ping - Returns status and configuration info
 * POST /api/webhooks/ping - Echo back what was sent (for integration testing)
 */

import { NextRequest } from "next/server";

export async function GET() {
  return Response.json({
    status: "ok",
    message: "EONPRO webhook endpoint is reachable",
    timestamp: new Date().toISOString(),
    endpoints: {
      main: "/api/webhooks/weightlossintake",
      test: "/api/webhooks/test",
      health: "/api/webhooks/health",
      ping: "/api/webhooks/ping",
    },
    expectedHeaders: {
      "Content-Type": "application/json",
      "x-webhook-secret": "YOUR_SECRET_HERE",
    },
    documentation: "https://app.eonpro.io/api/docs",
  });
}

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  
  // Log the request for debugging
  console.log(`[PING ${timestamp}] Received POST request`);
  
  // Get headers
  const hasSecret = !!req.headers.get("x-webhook-secret");
  const hasApiKey = !!req.headers.get("x-api-key");
  const hasAuth = !!req.headers.get("authorization");
  const contentType = req.headers.get("content-type");
  
  // Try to parse body
  let body: any = null;
  let bodySize = 0;
  try {
    const text = await req.text();
    bodySize = text.length;
    body = JSON.parse(text);
  } catch {
    // Body might not be JSON
  }
  
  console.log(`[PING ${timestamp}] Headers: secret=${hasSecret}, apiKey=${hasApiKey}, auth=${hasAuth}`);
  console.log(`[PING ${timestamp}] Body size: ${bodySize} bytes`);
  
  return Response.json({
    success: true,
    message: "Ping received! Your request reached EONPRO successfully.",
    timestamp,
    received: {
      hasWebhookSecret: hasSecret,
      hasApiKey: hasApiKey,
      hasAuthorization: hasAuth,
      contentType,
      bodySize,
      bodyFields: body ? Object.keys(body) : null,
    },
    nextStep: hasSecret 
      ? "Authentication header present. Try the main webhook at /api/webhooks/weightlossintake"
      : "⚠️ Missing x-webhook-secret header. Add this header with your secret.",
  });
}

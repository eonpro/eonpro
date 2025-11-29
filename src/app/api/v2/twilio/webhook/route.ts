import { NextRequest, NextResponse } from "next/server";
import { processIncomingSMS } from "@/lib/integrations/twilio/smsService";
import { isFeatureEnabled } from "@/lib/features";
import { logger } from '@/lib/logger';

// Validate webhook signature
function validateTwilioWebhook(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  // Only validate in production environments
  // In development/testing, we may not have valid signatures
  if (process.env.NODE_ENV === 'development' || process.env.TWILIO_USE_MOCK === 'true') {
    return true;
  }

  try {
    // Dynamically import twilio only on the server side
    const twilio = require('twilio');
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error: any) {
    // @ts-ignore
   
    logger.error("[TWILIO_WEBHOOK] Failed to validate signature:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled("TWILIO_SMS")) {
      return NextResponse.json(
        { error: "Twilio SMS feature is disabled" },
        { status: 403 }
      );
    }

    // Parse the form data from Twilio
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    // Validate webhook signature (if auth token is available)
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      const twilioSignature = req.headers.get("X-Twilio-Signature") || "";
      const url = req.url;
      
      // Convert FormData to object for validation
      const params: Record<string, string> = {};
      formData.forEach((value, key) => {
        params[key] = value.toString();
      });

      const isValid = validateTwilioWebhook(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        params
      );

      if (!isValid) {
        logger.warn("[TWILIO_WEBHOOK] Invalid signature");
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }

    // Process the incoming SMS
    const responseMessage = await processIncomingSMS(from, body, messageSid);

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${responseMessage}</Message>
    </Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error("[TWILIO_WEBHOOK_ERROR]", error);
    
    // Return empty TwiML response on error
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    
    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

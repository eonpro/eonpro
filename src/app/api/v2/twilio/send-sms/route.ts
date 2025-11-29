import { NextRequest, NextResponse } from "next/server";
import { sendSMS, formatPhoneNumber } from "@/lib/integrations/twilio/smsService";
import { isFeatureEnabled } from "@/lib/features";
import { TWILIO_ERRORS, isTwilioConfigured } from "@/lib/integrations/twilio/config";
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled("TWILIO_SMS")) {
      return NextResponse.json(
        { error: TWILIO_ERRORS.FEATURE_DISABLED },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { to, message, patientId } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: "Phone number and message are required" },
        { status: 400 }
      );
    }

    // Format phone number
    const formattedPhone = formatPhoneNumber(to);

    // Send SMS
    const result = await sendSMS({
      to: formattedPhone,
      body: message,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    const isMock = !isTwilioConfigured() || process.env.TWILIO_USE_MOCK === 'true';
    
    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      details: result.details,
      mock: isMock, // Indicate if using mock service
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("[SEND_SMS_API_ERROR]", error);
    return NextResponse.json(
      { error: errorMessage || "Failed to send SMS" },
      { status: 500 }
    );
  }
}

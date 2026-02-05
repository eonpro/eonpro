import { NextRequest, NextResponse } from "next/server";
import { logger } from '@/lib/logger';

// Debug endpoint to test MedLink webhook without authentication
export async function POST(req: NextRequest) {
  // Disable test endpoint in production for security
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoint disabled in production' },
      { status: 404 }
    );
  }

  logger.debug("[HEYFLOW TEST] ========================================");
  logger.debug("[HEYFLOW TEST] Received test webhook at:", { timestamp: new Date().toISOString() });
  
  // Log all headers
  logger.debug("[HEYFLOW TEST] Headers:");
  req.headers.forEach((value, key) => {
    logger.debug(`  ${key}: ${value}`);
  });
  
  // Log body
  try {
    const body = await req.json();
    logger.debug("[HEYFLOW TEST] Body:");
    logger.debug("Data:", { json: JSON.stringify(body, null, 2) });
    
    return Response.json({ 
      success: true, 
      message: "Test webhook received successfully",
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries(req.headers.entries()),
      body: body
    });
  } catch (err: any) {
    // @ts-ignore
   
    logger.error("[HEYFLOW TEST] Error parsing body:", { error: err });
    return Response.json({ 
      success: false, 
      error: "Failed to parse body",
      timestamp: new Date().toISOString()
    }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  return Response.json({ 
    status: "ok",
    message: "MedLink test webhook endpoint is running",
    timestamp: new Date().toISOString(),
    instructions: {
      url: "POST to this endpoint to test webhook",
      authentication: "None required (test endpoint)",
      purpose: "Debug and test MedLink webhook payloads"
    }
  });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { WebhookStatus } from "@prisma/client";
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    // Try to create a test webhook log
    const log = await prisma.webhookLog.create({
      data: {
        endpoint: "/api/test-webhook-log",
        method: "GET",
        headers: { test: "header" },
        payload: { test: "payload" },
        status: WebhookStatus.SUCCESS,
        statusCode: 200,
        errorMessage: null,
        responseData: { result: "test" },
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
        processingTimeMs: 100,
      },
    });

    // Try to read all logs
    const allLogs = await prisma.webhookLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return Response.json({
      success: true,
      createdLog: log,
      allLogs,
      totalCount: await prisma.webhookLog.count(),
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error("Webhook log test error:", error);
    return Response.json({
      success: false,
      error: String(error),
      message: "Failed to create or read webhook logs",
    }, { status: 500 });
  }
}

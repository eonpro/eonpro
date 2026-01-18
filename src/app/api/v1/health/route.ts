/**
 * API v1 Health Check
 * 
 * Simple health endpoint for external systems to verify connectivity.
 * Used by the intake platform's EMR client for health checks.
 * 
 * GET /api/v1/health
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  // Quick database check
  let dbStatus = "healthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "unhealthy";
  }
  
  const responseTime = Date.now() - startTime;
  
  return Response.json({
    status: dbStatus === "healthy" ? "healthy" : "degraded",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    responseTime: `${responseTime}ms`,
    services: {
      database: dbStatus,
      api: "healthy",
    },
    endpoints: {
      webhook: "/api/webhooks/weightlossintake",
      patients: "/api/v1/patients",
      intakes: "/api/v1/intakes",
    },
  });
}

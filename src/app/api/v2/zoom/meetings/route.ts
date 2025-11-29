/**
 * API endpoint for managing Zoom meetings
 */

import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/features";
import { logger } from '@/lib/logger';
import {
  createZoomMeeting, 
  getZoomMeeting,
  cancelZoomMeeting,
  getMeetingParticipants 
} from "@/lib/integrations/zoom/meetingService";
import { isZoomConfigured } from "@/lib/integrations/zoom/config";

// Create a new meeting
export async function POST(req: NextRequest) {
  try {
    // Check feature flag
    if (!isFeatureEnabled("ZOOM_TELEHEALTH")) {
      return NextResponse.json(
        { error: "Zoom Telehealth feature is not enabled" },
        { status: 403 }
      );
    }

    const { topic, patientId, duration, scheduledAt, agenda, settings } = await req.json();

    if (!topic || !duration) {
      return NextResponse.json(
        { error: "Topic and duration are required" },
        { status: 400 }
      );
    }

    // Check if using mock mode
    const isMockMode = !isZoomConfigured() || process.env.ZOOM_USE_MOCK === 'true';

    try {
      const meeting = await createZoomMeeting({
        topic,
        duration,
        patientId: patientId || 1,
        providerId: 1, // Would come from auth in production
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        agenda,
        settings,
      });

      logger.debug('[ZOOM_API] Meeting created:', { value: meeting.id });

      return NextResponse.json({
        success: true,
        meetingId: meeting.id?.toString(),
        joinUrl: meeting.joinUrl,
        startUrl: meeting.startUrl,
        password: meeting.password,
        topic: meeting.topic,
        duration: meeting.duration,
        scheduledAt: meeting.startTime,
        mock: isMockMode,
      });
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Meeting creation failed:', error);
      return NextResponse.json(
        { error: "Failed to create meeting", details: errorMessage },
        { status: 500 }
      );
    }
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Error:', error);
    return NextResponse.json(
      { error: "Failed to process request", details: errorMessage },
      { status: 500 }
    );
  }
}

// Get meeting details
export async function GET(req: NextRequest) {
  try {
    // Check feature flag
    if (!isFeatureEnabled("ZOOM_TELEHEALTH")) {
      return NextResponse.json(
        { error: "Zoom Telehealth feature is not enabled" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get("meetingId");

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID is required" },
        { status: 400 }
      );
    }

    const meeting = await getZoomMeeting(meetingId);

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Get participants if meeting is active
    let participants: any[] = [];
    try {
      participants = await getMeetingParticipants(meetingId);
    } catch (err: any) {
    // @ts-ignore
   
      logger.debug('[ZOOM_API] Could not get participants:', err);
    }

    return NextResponse.json({
      success: true,
      meeting,
      participants,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Error:', error);
    return NextResponse.json(
      { error: "Failed to get meeting", details: errorMessage },
      { status: 500 }
    );
  }
}

// Cancel a meeting
export async function DELETE(req: NextRequest) {
  try {
    // Check feature flag
    if (!isFeatureEnabled("ZOOM_TELEHEALTH")) {
      return NextResponse.json(
        { error: "Zoom Telehealth feature is not enabled" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get("meetingId");

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID is required" },
        { status: 400 }
      );
    }

    const success = await cancelZoomMeeting(meetingId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to cancel meeting" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Meeting cancelled successfully",
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Error:', error);
    return NextResponse.json(
      { error: "Failed to cancel meeting", details: errorMessage },
      { status: 500 }
    );
  }
}

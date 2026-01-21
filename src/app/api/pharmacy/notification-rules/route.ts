import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { z } from 'zod';

const notificationRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  triggerStatus: z.enum([
    'PENDING',
    'SENT_TO_PHARMACY',
    'RECEIVED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'ON_HOLD',
    'FAILED'
  ]),
  sendSMS: z.boolean(),
  sendChat: z.boolean(),
  sendEmail: z.boolean(),
  smsTemplate: z.string().optional(),
  chatTemplate: z.string().optional(),
  emailTemplate: z.string().optional(),
  emailSubject: z.string().optional(),
  delayMinutes: z.number().min(0).optional(),
});

// GET /api/pharmacy/notification-rules
export const GET = withAdminAuth(async (req: NextRequest) => {
  try {
    const rules = await (prisma as any).notificationRule.findMany({
      orderBy: { triggerStatus: 'asc' }
    });

    return NextResponse.json({ rules });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch notification rules' },
      { status: 500 }
    );
  }
});

// POST /api/pharmacy/notification-rules
export const POST = withAdminAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = notificationRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const rule = await (prisma as any).notificationRule.create({
      data: parsed.data as any
    });

    return NextResponse.json({ 
      success: true, 
      rule 
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create notification rule' },
      { status: 500 }
    );
  }
});

// PUT /api/pharmacy/notification-rules
export const PUT = withAdminAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Rule ID required' },
        { status: 400 }
      );
    }

    const rule = await (prisma as any).notificationRule.update({
      where: { id },
      data: data as any
    });

    return NextResponse.json({ 
      success: true, 
      rule 
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update notification rule' },
      { status: 500 }
    );
  }
});

// DELETE /api/pharmacy/notification-rules
export const DELETE = withAdminAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Rule ID required' },
        { status: 400 }
      );
    }

    await (prisma as any).notificationRule.delete({
      where: { id: parseInt(id) }
    });

    return NextResponse.json({ 
      success: true,
      message: 'Rule deleted successfully'
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete notification rule' },
      { status: 500 }
    );
  }
});

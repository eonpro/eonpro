import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';

import { JWT_SECRET } from '@/lib/auth/config';
import { logger } from '@/lib/logger';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const token = req.cookies.get('influencer-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const influencerId = payload.id as number;

    const bankAccountId = parseInt(resolvedParams.id);
    if (isNaN(bankAccountId)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Check if the bank account belongs to this influencer
    const bankAccount = await prisma.influencerBankAccount.findUnique({
      where: { id: bankAccountId },
    });

    if (!bankAccount || bankAccount.influencerId !== influencerId) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }

    // Delete the bank account
    await prisma.influencerBankAccount.delete({
      where: { id: bankAccountId },
    });

    return NextResponse.json({ message: 'Bank account deleted successfully' });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Influencer Bank Account API] Error deleting bank account:', error);
    return NextResponse.json({ error: 'Failed to delete bank account' }, { status: 500 });
  }
}

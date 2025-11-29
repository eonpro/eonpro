import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';
import { encryptCardData, decryptCardData } from '@/lib/encryption';

import { JWT_SECRET } from '@/lib/auth/config';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('influencer-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const influencerId = payload.id as number;

    const bankAccounts = await prisma.influencerBankAccount.findMany({
      where: { influencerId },
      select: {
        id: true,
        bankName: true,
        accountType: true,
        isDefault: true,
        accountNumber: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Decrypt account numbers and mask them for display
    const decryptedAccounts = bankAccounts.map((account: any) => ({
      ...account,
      accountNumber: account.accountNumber ? `****${account.accountNumber.slice(-4)}` : '****'
    }));

    return NextResponse.json(decryptedAccounts);
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Bank Accounts API] Error fetching bank accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank accounts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('influencer-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const influencerId = payload.id as number;

    const { bankName, accountNumber, routingNumber, accountType, isDefault } = await req.json();

    // Validate required fields
    if (!bankName || !accountNumber || !routingNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Encrypt sensitive data
    const encryptedAccountNumber = encryptCardData(accountNumber);
    const encryptedRoutingNumber = encryptCardData(routingNumber);

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.influencerBankAccount.updateMany({
        where: { influencerId },
        data: { isDefault: false }
      });
    }

    // Create the bank account
    const bankAccount = await prisma.influencerBankAccount.create({
      data: {
        influencerId,
        bankName,
        accountNumber: encryptedAccountNumber,
        routingNumber: encryptedRoutingNumber,
        accountType: accountType || 'checking',
        isDefault: isDefault || false
      }
    });

    return NextResponse.json({
      success: true,
      bankAccount: {
        id: bankAccount.id,
        bankName: bankAccount.bankName,
        accountNumber: `****${accountNumber.slice(-4)}`,
        accountType: bankAccount.accountType,
        isDefault: bankAccount.isDefault
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Bank Accounts API] Error creating bank account:', error);
    return NextResponse.json(
      { error: 'Failed to create bank account' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get('influencer-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const influencerId = payload.id as number;

    const { accountId, isDefault } = await req.json();

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify the account belongs to this influencer
    const account: any = await prisma.influencerBankAccount.findFirst({
      where: {
        id: accountId,
        influencerId
      }
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.influencerBankAccount.updateMany({
        where: { 
          influencerId,
          id: { not: accountId }
        },
        data: { isDefault: false }
      });
    }

    // Update the account
    const updatedAccount = await prisma.influencerBankAccount.update({
      where: { id: accountId },
      data: { isDefault }
    });

    return NextResponse.json({
      success: true,
      bankAccount: {
        id: updatedAccount.id,
        bankName: updatedAccount.bankName,
        accountType: updatedAccount.accountType,
        isDefault: updatedAccount.isDefault
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Bank Accounts API] Error updating bank account:', error);
    return NextResponse.json(
      { error: 'Failed to update bank account' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get('influencer-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const influencerId = payload.id as number;

    const { searchParams } = new URL(req.url);
    const accountId = parseInt(searchParams.get('id') || '0');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify the account belongs to this influencer
    const account: any = await prisma.influencerBankAccount.findFirst({
      where: {
        id: accountId,
        influencerId
      }
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Delete the account
    await prisma.influencerBankAccount.delete({
      where: { id: accountId }
    });

    return NextResponse.json({
      success: true,
      message: 'Bank account deleted successfully'
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Bank Accounts API] Error deleting bank account:', error);
    return NextResponse.json(
      { error: 'Failed to delete bank account' },
      { status: 500 }
    );
  }
}
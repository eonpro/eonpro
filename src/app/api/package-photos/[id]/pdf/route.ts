import { NextRequest, NextResponse } from 'next/server';
import { withPharmacyAccessAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { downloadFromS3 } from '@/lib/integrations/aws/s3Service';
import { logger } from '@/lib/logger';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const TRACKING_SOURCE_LABELS: Record<string, string> = {
  order: 'Order Record',
  lifefile_webhook: 'LifeFile Webhook',
  shipping_update: 'Shipping Update',
  fedex_label: 'FedEx Label',
  manual: 'Manual Entry',
};

async function getHandler(
  req: NextRequest,
  user: AuthUser,
  context?: unknown,
) {
  try {
    const ctx = context as { params: Promise<{ id: string }> };
    const { id } = await ctx.params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }

    const photo = await prisma.packagePhoto.findUnique({
      where: { id: photoId },
      include: {
        capturedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
        order: { select: { id: true, lifefileOrderId: true, status: true, trackingNumber: true } },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Package photo not found' }, { status: 404 });
    }

    const patientName = photo.patient
      ? `${decryptPHI(photo.patient.firstName) || 'Unknown'} ${decryptPHI(photo.patient.lastName) || ''}`
      : null;

    const repName = `${photo.capturedBy.firstName} ${photo.capturedBy.lastName}`;
    const timestamp = new Date(photo.createdAt).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const mono = await pdfDoc.embedFont(StandardFonts.Courier);
    const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const navy = rgb(30 / 255, 47 / 255, 138 / 255);
    const darkGray = rgb(0.2, 0.2, 0.2);
    const medGray = rgb(0.45, 0.45, 0.45);
    const green = rgb(5 / 255, 150 / 255, 105 / 255);
    const amber = rgb(217 / 255, 119 / 255, 6 / 255);
    const white = rgb(1, 1, 1);

    let y = pageHeight - margin;

    // -- Header --
    page.drawRectangle({
      x: margin - 10,
      y: y - 30,
      width: contentWidth + 20,
      height: 40,
      color: navy,
    });
    page.drawText('PACKAGE PHOTO AUDIT RECORD', {
      x: margin,
      y: y - 22,
      size: 14,
      font: fontBold,
      color: white,
    });
    page.drawText(`Record #${photo.id}`, {
      x: pageWidth - margin - font.widthOfTextAtSize(`Record #${photo.id}`, 9),
      y: y - 20,
      size: 9,
      font,
      color: rgb(0.8, 0.8, 0.9),
    });
    y -= 55;

    // -- Photo --
    let photoBottom = y;
    if (photo.s3Key) {
      try {
        const imgBuffer = await downloadFromS3(photo.s3Key);
        const imgBytes = new Uint8Array(imgBuffer);
        const isJpeg = photo.contentType.includes('jpeg') || photo.contentType.includes('jpg');
        const isPng = photo.contentType.includes('png');
        if (!isJpeg && !isPng) {
          throw new Error(`Unsupported image format for PDF: ${photo.contentType}`);
        }
        const image = isJpeg
          ? await pdfDoc.embedJpg(imgBytes)
          : await pdfDoc.embedPng(imgBytes);

        const imgAspect = image.width / image.height;
        let drawWidth = contentWidth;
        let drawHeight = drawWidth / imgAspect;
        const maxImgHeight = 300;
        if (drawHeight > maxImgHeight) {
          drawHeight = maxImgHeight;
          drawWidth = drawHeight * imgAspect;
        }

        const imgX = margin + (contentWidth - drawWidth) / 2;
        const imgY = y - drawHeight;
        page.drawImage(image, { x: imgX, y: imgY, width: drawWidth, height: drawHeight });

        page.drawRectangle({
          x: imgX,
          y: imgY,
          width: drawWidth,
          height: 28,
          color: rgb(0, 0, 0),
          opacity: 0.6,
        });
        page.drawText(`ID: ${photo.lifefileId}`, {
          x: imgX + 8,
          y: imgY + 9,
          size: 11,
          font: monoBold,
          color: white,
        });
        const tsShort = new Date(photo.createdAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        const tsWidth = font.widthOfTextAtSize(tsShort, 8);
        page.drawText(tsShort, {
          x: imgX + drawWidth - tsWidth - 8,
          y: imgY + 11,
          size: 8,
          font,
          color: rgb(0.85, 0.85, 0.85),
        });

        photoBottom = imgY - 15;
      } catch (imgErr) {
        logger.warn('[PackagePhoto PDF] Failed to embed image', {
          photoId: photo.id,
          error: imgErr instanceof Error ? imgErr.message : String(imgErr),
        });
        page.drawText('[Photo could not be loaded]', {
          x: margin,
          y: y - 20,
          size: 10,
          font,
          color: medGray,
        });
        photoBottom = y - 40;
      }
    } else {
      page.drawText('[No photo available]', { x: margin, y: y - 20, size: 10, font, color: medGray });
      photoBottom = y - 40;
    }

    y = photoBottom;

    // -- Divider --
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 20;

    // -- Detail rows helper --
    const drawRow = (label: string, value: string, valueColor = darkGray, valueFont = font) => {
      page.drawText(label, { x: margin, y, size: 9, font, color: medGray });
      page.drawText(value, { x: margin + 120, y, size: 9, font: valueFont, color: valueColor });
      y -= 18;
    };

    drawRow('LifeFile ID', photo.lifefileId, darkGray, monoBold);
    drawRow('Date & Time', timestamp);
    drawRow('Captured By', repName);

    if (photo.trackingNumber) {
      drawRow('Tracking', photo.trackingNumber, darkGray, mono);
      if (photo.trackingSource) {
        drawRow('Tracking Source', TRACKING_SOURCE_LABELS[photo.trackingSource] || photo.trackingSource);
      }
    }

    y -= 5;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 15;

    drawRow('Match Status', photo.matched ? 'Matched to Patient' : 'Unmatched — Stored for Search', photo.matched ? green : amber);

    if (patientName) {
      drawRow('Patient', patientName.trim());
    }

    if (photo.order) {
      const orderLabel = `#${photo.order.id}${photo.order.lifefileOrderId ? ` (LF: ${photo.order.lifefileOrderId})` : ''}`;
      drawRow('Order', orderLabel);
    }

    if (photo.matchStrategy) {
      drawRow('Matched Via', photo.matchStrategy === 'lifefileOrderId' ? 'LifeFile Order ID' : 'Patient LifeFile ID');
    }

    if (photo.notes) {
      drawRow('Notes', photo.notes);
    }

    // -- Chain of Custody footer --
    y -= 10;
    page.drawRectangle({
      x: margin - 5,
      y: y - 40,
      width: contentWidth + 10,
      height: 45,
      color: rgb(0.97, 0.97, 0.97),
    });
    page.drawText('CHAIN OF CUSTODY', {
      x: margin,
      y: y - 12,
      size: 8,
      font: fontBold,
      color: medGray,
    });
    page.drawText(`Captured by ${repName} on ${timestamp}`, {
      x: margin,
      y: y - 28,
      size: 9,
      font,
      color: darkGray,
    });

    // Serialize
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="package-audit-${photo.lifefileId}-${photo.id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, { context: { route: 'GET /api/package-photos/[id]/pdf' } });
  }
}

export const GET = withPharmacyAccessAuth(getHandler);

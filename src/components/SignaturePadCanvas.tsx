'use client';

import { useEffect, useRef, useCallback } from 'react';
import SignaturePad from 'signature_pad';
import { logger } from '@/lib/logger';

type Props = {
  onChange: (dataUrl: string | null) => void;
  initialSignature?: string;
};

export default function SignaturePadCanvas({ onChange, initialSignature }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const updateSignature = useCallback(() => {
    if (padRef.current) {
      if (padRef.current.isEmpty()) {
        onChange(null);
      } else {
        const dataUrl = padRef.current.toDataURL();
        logger.debug('Signature captured:', { preview: dataUrl.substring(0, 50) });
        onChange(dataUrl);
      }
    }
  }, [onChange]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const pad = new SignaturePad(canvasRef.current);
    padRef.current = pad;

    if (initialSignature) {
      try {
        pad.fromDataURL(initialSignature);
      } catch (err: any) {
        // @ts-ignore

        logger.warn('Unable to load initial signature', err);
      }
    }

    // Capture signature after each stroke
    const handleStrokeEnd = () => {
      logger.debug('Stroke ended, updating signature');
      updateSignature();
    };

    // Listen to both stroke end and after update events
    // @ts-ignore
    pad.addEventListener('endStroke', handleStrokeEnd);

    return () => {
      // @ts-ignore
      pad.removeEventListener('endStroke', handleStrokeEnd);
      pad.off();
    };
  }, [initialSignature, updateSignature]);

  const clear = () => {
    padRef.current?.clear();
    onChange(null);
  };

  // Force capture the signature on demand
  const captureSignature = () => {
    updateSignature();
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="rounded border bg-white"
        onMouseUp={captureSignature}
        onTouchEnd={captureSignature}
      />
      <button type="button" onClick={clear} className="mt-2 text-sm text-gray-600 underline">
        Clear Signature
      </button>
    </div>
  );
}

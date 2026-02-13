'use client';

/**
 * Bottom Sheet Component
 *
 * Mobile-optimized modal that slides up from the bottom.
 * Supports drag-to-dismiss, snap points, and accessibility.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface BottomSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Callback when sheet should close */
  onClose: () => void;
  /** Sheet title */
  title?: string;
  /** Sheet description */
  description?: string;
  /** Sheet content */
  children: React.ReactNode;
  /** Height preset */
  height?: 'auto' | 'half' | 'full';
  /** Show close button */
  showClose?: boolean;
  /** Show drag handle */
  showHandle?: boolean;
  /** Allow closing by clicking backdrop */
  closeOnBackdropClick?: boolean;
  /** Allow closing by dragging down */
  closeOnDrag?: boolean;
  /** Additional className for content */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  height = 'auto',
  showClose = true,
  showHandle = true,
  closeOnBackdropClick = true,
  closeOnDrag = true,
  className,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);

  // Mount state for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Handle body scroll lock
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Handle animation state
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!closeOnDrag) return;

      isDragging.current = true;
      startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
      currentY.current = startY.current;
    },
    [closeOnDrag]
  );

  const handleDragMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isDragging.current || !closeOnDrag) return;

      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      currentY.current = clientY;
      const offset = Math.max(0, clientY - startY.current);
      setDragOffset(offset);
    },
    [closeOnDrag]
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current || !closeOnDrag) return;

    isDragging.current = false;
    const sheetHeight = sheetRef.current?.offsetHeight || 0;
    const threshold = sheetHeight * 0.3;

    if (dragOffset > threshold) {
      onClose();
    }
    setDragOffset(0);
  }, [closeOnDrag, dragOffset, onClose]);

  // Height classes
  const heightClasses = {
    auto: 'max-h-[85vh]',
    half: 'h-[50vh]',
    full: 'h-[95vh]',
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 transition-opacity duration-300',
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'bottom-sheet-title' : undefined}
      aria-describedby={description ? 'bottom-sheet-description' : undefined}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black transition-opacity duration-300',
          isOpen ? 'bg-opacity-50' : 'bg-opacity-0'
        )}
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ease-out',
          heightClasses[height],
          isOpen ? 'translate-y-0' : 'translate-y-full',
          className
        )}
        style={{
          transform: isOpen ? `translateY(${dragOffset}px)` : 'translateY(100%)',
        }}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        {/* Handle */}
        {showHandle && (
          <div className="flex justify-center pb-2 pt-3">
            <div className="h-1.5 w-12 rounded-full bg-gray-300" />
          </div>
        )}

        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex-1">
              {title && (
                <h2 id="bottom-sheet-title" className="text-lg font-semibold text-gray-900">
                  {title}
                </h2>
              )}
              {description && (
                <p id="bottom-sheet-description" className="mt-1 text-sm text-gray-500">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                onClick={onClose}
                className="ml-4 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// =============================================================================
// Bottom Sheet with Actions
// =============================================================================

interface BottomSheetActionsProps extends Omit<BottomSheetProps, 'children'> {
  /** List of action items */
  actions: Array<{
    id: string;
    label: string;
    icon?: React.ReactNode;
    destructive?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }>;
}

export function BottomSheetActions({ actions, ...props }: BottomSheetActionsProps) {
  return (
    <BottomSheet {...props} height="auto" showHandle={true}>
      <div className="space-y-1">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => {
              action.onClick();
              props.onClose();
            }}
            disabled={action.disabled}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
              action.destructive
                ? 'text-red-600 hover:bg-red-50'
                : 'text-gray-700 hover:bg-gray-100',
              action.disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
            <span className="font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// =============================================================================
// Bottom Sheet with Confirmation
// =============================================================================

interface BottomSheetConfirmProps extends Omit<BottomSheetProps, 'children'> {
  /** Confirmation message */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Whether confirm action is destructive */
  destructive?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Callback when confirmed */
  onConfirm: () => void;
}

export function BottomSheetConfirm({
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  ...props
}: BottomSheetConfirmProps) {
  return (
    <BottomSheet {...props} height="auto" showHandle={false}>
      <div className="text-center">
        <p className="text-gray-600">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={props.onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex-1 rounded-xl py-3 font-medium text-white transition-colors disabled:opacity-50',
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'
            )}
          >
            {loading ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// =============================================================================
// Export All
// =============================================================================

export default BottomSheet;

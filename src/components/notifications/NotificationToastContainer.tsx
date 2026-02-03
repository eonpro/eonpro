'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from 'framer-motion';
import {
  X,
  Pill,
  User,
  Package,
  AlertCircle,
  Calendar,
  MessageSquare,
  CreditCard,
  RefreshCw,
  Bell,
  FileText,
  Truck,
  Moon,
} from 'lucide-react';
import { useNotificationContext, type ToastNotification } from './NotificationProvider';
import type { NotificationCategory } from '@/hooks/useNotifications';

// ============================================================================
// Category Configuration - Apple-style icons and colors
// ============================================================================

const categoryConfig: Record<NotificationCategory, {
  icon: typeof Bell;
  gradient: string;
  iconColor: string;
  label: string;
}> = {
  PRESCRIPTION: {
    icon: Pill,
    gradient: 'from-purple-500 to-purple-600',
    iconColor: 'text-white',
    label: 'Prescriptions'
  },
  PATIENT: {
    icon: FileText,
    gradient: 'from-blue-500 to-blue-600',
    iconColor: 'text-white',
    label: 'New Intake'
  },
  ORDER: {
    icon: Package,
    gradient: 'from-green-500 to-green-600',
    iconColor: 'text-white',
    label: 'Orders'
  },
  SYSTEM: {
    icon: AlertCircle,
    gradient: 'from-orange-500 to-orange-600',
    iconColor: 'text-white',
    label: 'System'
  },
  APPOINTMENT: {
    icon: Calendar,
    gradient: 'from-cyan-500 to-cyan-600',
    iconColor: 'text-white',
    label: 'Appointments'
  },
  MESSAGE: {
    icon: MessageSquare,
    gradient: 'from-indigo-500 to-indigo-600',
    iconColor: 'text-white',
    label: 'New Chat'
  },
  PAYMENT: {
    icon: CreditCard,
    gradient: 'from-emerald-500 to-emerald-600',
    iconColor: 'text-white',
    label: 'Payment'
  },
  REFILL: {
    icon: RefreshCw,
    gradient: 'from-pink-500 to-pink-600',
    iconColor: 'text-white',
    label: 'RX Queue'
  },
  SHIPMENT: {
    icon: Truck,
    gradient: 'from-amber-500 to-amber-600',
    iconColor: 'text-white',
    label: 'Shipment'
  },
};

// ============================================================================
// Time Formatter
// ============================================================================

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);

  if (diffSecs < 30) return 'now';
  if (diffMins < 1) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  return then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ============================================================================
// Apple-Style Toast Item
// ============================================================================

interface AppleToastProps {
  toast: ToastNotification;
  onDismiss: () => void;
  onClick: () => void;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

function AppleToast({ toast, onDismiss, onClick, position }: AppleToastProps) {
  const config = categoryConfig[toast.category];
  const Icon = config.icon;
  const [timeAgo, setTimeAgo] = useState(formatTimeAgo(toast.createdAt));

  // Swipe to dismiss
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);
  const scale = useTransform(x, [-200, 0, 200], [0.8, 1, 0.8]);

  // Update time ago every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(toast.createdAt));
    }, 30000);
    return () => clearInterval(interval);
  }, [toast.createdAt]);

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 100 || Math.abs(info.velocity.x) > 500) {
      onDismiss();
    }
  }, [onDismiss]);

  const isLeft = position.includes('left');

  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        y: position.includes('top') ? -20 : 20,
        x: isLeft ? -100 : 100,
        scale: 0.9
      }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      exit={{
        opacity: 0,
        x: isLeft ? -100 : 100,
        scale: 0.9,
        transition: { duration: 0.2 }
      }}
      style={{ x, opacity, scale }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={handleDragEnd}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative cursor-pointer select-none"
    >
      {/* Apple-style glass morphism card */}
      <div className="relative w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/20">
        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />

        {/* Content */}
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            {/* App Icon - Apple style with gradient */}
            <div className={`flex-shrink-0 w-11 h-11 rounded-[12px] bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg`}>
              <Icon className={`h-6 w-6 ${config.iconColor}`} strokeWidth={2} />
            </div>

            {/* Text Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              {/* App Name & Time */}
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {config.label}
                </span>
                <span className="text-[11px] text-gray-400">
                  {timeAgo}
                </span>
              </div>

              {/* Title */}
              <h4 className="text-[15px] font-semibold text-gray-900 leading-tight truncate">
                {toast.title}
              </h4>

              {/* Message */}
              <p className="text-[13px] text-gray-600 leading-snug line-clamp-2 mt-0.5">
                {toast.message}
              </p>

              {/* Priority Badge */}
              {toast.priority === 'URGENT' && (
                <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full uppercase">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  Urgent
                </div>
              )}
              {toast.priority === 'HIGH' && (
                <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full uppercase">
                  Important
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors group"
            >
              <X className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </button>
          </div>

          {/* Action hint */}
          {toast.actionUrl && (
            <div className="flex items-center justify-center mt-3 pt-3 border-t border-gray-100/80">
              <span className="text-[12px] font-medium text-blue-500">
                Tap to view details
              </span>
            </div>
          )}
        </div>

        {/* Progress indicator for auto-dismiss */}
        {!toast.isPinned && toast.priority !== 'URGENT' && (
          <ProgressBar toast={toast} />
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ProgressBar({ toast }: { toast: ToastNotification }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const duration = toast.expiresAt - startTime;

    if (duration <= 0) return;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining > 0) {
        requestAnimationFrame(animate);
      }
    };

    const frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [toast.expiresAt]);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100 overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-blue-400 to-blue-500"
        style={{ width: `${progress}%` }}
        initial={false}
      />
    </div>
  );
}

// ============================================================================
// Main Container - Apple Notification Center Style
// ============================================================================

export default function NotificationToastContainer() {
  const router = useRouter();
  const {
    toasts,
    dismissToast,
    pinToast,
    dismissAllToasts,
    markAsRead,
    preferences,
    isDndActive,
    toggleDnd,
  } = useNotificationContext();

  // Position classes
  const positionClasses: Record<string, string> = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const handleToastClick = async (toast: ToastNotification) => {
    if (!toast.isRead) {
      await markAsRead(toast.id);
    }
    dismissToast(toast.toastId);
    if (toast.actionUrl) {
      router.push(toast.actionUrl);
    }
  };

  // Auto-pin on hover
  const handleMouseEnter = (toastId: string) => {
    pinToast(toastId);
  };

  if (toasts.length === 0 && !isDndActive) return null;

  return (
    <div
      className={`fixed ${positionClasses[preferences.toastPosition]} z-[9999] flex flex-col gap-3`}
      style={{ maxHeight: 'calc(100vh - 2rem)' }}
    >
      {/* DND Banner - Apple style */}
      {isDndActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          className="flex items-center gap-3 px-4 py-3 bg-gray-900/95 backdrop-blur-xl text-white rounded-2xl shadow-xl"
        >
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Moon className="h-4 w-4 text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Do Not Disturb</p>
            <p className="text-xs text-gray-400">Notifications are silenced</p>
          </div>
          <button
            onClick={toggleDnd}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
          >
            Turn Off
          </button>
        </motion.div>
      )}

      {/* Stack counter & clear all */}
      {toasts.length > 2 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-2"
        >
          <span className="text-xs font-medium text-gray-500">
            {toasts.length} notifications
          </span>
          <button
            onClick={dismissAllToasts}
            className="text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
          >
            Clear All
          </button>
        </motion.div>
      )}

      {/* Toast Stack - show max 4 */}
      <div className="flex flex-col gap-3 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {toasts.slice(0, 4).map((toast, index) => (
            <div
              key={toast.toastId}
              onMouseEnter={() => handleMouseEnter(toast.toastId)}
              style={{
                // Apple-style stacking effect
                transform: index > 0 ? `scale(${1 - index * 0.02})` : undefined,
                opacity: index > 2 ? 0.7 : 1,
              }}
            >
              <AppleToast
                toast={toast}
                onDismiss={() => dismissToast(toast.toastId)}
                onClick={() => handleToastClick(toast)}
                position={preferences.toastPosition}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Overflow indicator */}
      {toasts.length > 4 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-2"
        >
          <span className="text-xs font-medium text-gray-400">
            +{toasts.length - 4} more notifications
          </span>
        </motion.div>
      )}
    </div>
  );
}

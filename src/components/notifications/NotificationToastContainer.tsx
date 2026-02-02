'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Pin,
  ChevronRight,
  Pill,
  User,
  Package,
  AlertCircle,
  Calendar,
  MessageSquare,
  CreditCard,
  RefreshCw,
  Bell,
  Check,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNotificationContext, type ToastNotification } from './NotificationProvider';
import type { NotificationCategory } from '@/hooks/useNotifications';

// ============================================================================
// Category Icons
// ============================================================================

const categoryConfig: Record<NotificationCategory, { icon: typeof Bell; color: string; bgColor: string }> = {
  PRESCRIPTION: { icon: Pill, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  PATIENT: { icon: User, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  ORDER: { icon: Package, color: 'text-green-600', bgColor: 'bg-green-100' },
  SYSTEM: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  APPOINTMENT: { icon: Calendar, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  MESSAGE: { icon: MessageSquare, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  PAYMENT: { icon: CreditCard, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  REFILL: { icon: RefreshCw, color: 'text-pink-600', bgColor: 'bg-pink-100' },
};

const priorityStyles = {
  LOW: 'border-l-gray-300',
  NORMAL: 'border-l-blue-400',
  HIGH: 'border-l-orange-400 shadow-orange-100',
  URGENT: 'border-l-red-500 shadow-red-100 animate-pulse-subtle',
};

// ============================================================================
// Toast Item
// ============================================================================

interface ToastItemProps {
  toast: ToastNotification;
  onDismiss: () => void;
  onPin: () => void;
  onMarkRead: () => void;
  onClick: () => void;
}

function ToastItem({ toast, onDismiss, onPin, onMarkRead, onClick }: ToastItemProps) {
  const config = categoryConfig[toast.category];
  const Icon = config.icon;
  const [progress, setProgress] = useState(100);
  const [isHovered, setIsHovered] = useState(false);

  // Progress bar animation
  useEffect(() => {
    if (toast.isPinned || toast.priority === 'URGENT') return;
    
    const duration = toast.expiresAt - Date.now();
    if (duration <= 0) return;

    const interval = setInterval(() => {
      const remaining = toast.expiresAt - Date.now();
      const pct = Math.max(0, (remaining / duration) * 100);
      setProgress(pct);
      
      if (pct <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.expiresAt, toast.isPinned, toast.priority]);

  // Pause progress on hover
  useEffect(() => {
    if (isHovered && !toast.isPinned) {
      onPin();
    }
  }, [isHovered, toast.isPinned, onPin]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-96 max-w-[calc(100vw-2rem)] border-l-4 ${priorityStyles[toast.priority]}`}
    >
      {/* Progress bar */}
      {!toast.isPinned && toast.priority !== 'URGENT' && (
        <div className="absolute bottom-0 left-0 h-1 bg-gray-100 w-full">
          <motion.div
            className="h-full bg-blue-400"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${config.color}`} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {toast.title}
              </p>
              {toast.priority === 'URGENT' && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded uppercase">
                  Urgent
                </span>
              )}
              {toast.priority === 'HIGH' && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded uppercase">
                  High
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
              {toast.message}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          {toast.actionUrl && (
            <button
              onClick={onClick}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              View details
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
          
          <div className="flex-1" />
          
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            title="Mark as read"
          >
            <Check className="h-4 w-4" />
          </button>
          
          {!toast.isPinned && (
            <button
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Pin notification"
            >
              <Pin className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Container
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
  const positionClasses = {
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

  if (toasts.length === 0) return null;

  return (
    <div className={`fixed ${positionClasses[preferences.toastPosition]} z-[9999] flex flex-col gap-3`}>
      {/* DND indicator */}
      {isDndActive && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-xl shadow-lg"
        >
          <VolumeX className="h-4 w-4" />
          <span>Do Not Disturb is on</span>
          <button
            onClick={toggleDnd}
            className="ml-2 px-2 py-0.5 bg-white/20 rounded hover:bg-white/30 transition-colors"
          >
            Turn off
          </button>
        </motion.div>
      )}

      {/* Clear all button */}
      {toasts.length > 1 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={dismissAllToasts}
          className="self-end px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-lg"
        >
          Clear all ({toasts.length})
        </motion.button>
      )}

      {/* Toasts */}
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.toastId}
            toast={toast}
            onDismiss={() => dismissToast(toast.toastId)}
            onPin={() => pinToast(toast.toastId)}
            onMarkRead={() => {
              markAsRead(toast.id);
              dismissToast(toast.toastId);
            }}
            onClick={() => handleToastClick(toast)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

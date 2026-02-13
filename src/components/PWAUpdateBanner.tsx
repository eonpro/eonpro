'use client';

/**
 * PWA Update Banner
 * Shows when a new version of the app is available
 */

import { useState, useEffect } from 'react';
import { X, RefreshCw, Download } from 'lucide-react';
import { useServiceWorker } from '@/hooks/useServiceWorker';

export function PWAUpdateBanner() {
  const { updateAvailable, skipWaiting, isOffline } = useServiceWorker();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Download className="h-5 w-5 text-blue-600" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900">Update Available</h3>
            <p className="mt-0.5 text-sm text-gray-600">
              A new version of the app is ready. Refresh to get the latest features.
            </p>

            <div className="mt-3 flex gap-2">
              <button
                onClick={skipWaiting}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary,#4fa77e)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" />
                Update Now
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Later
              </button>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Offline Banner
 * Shows when user loses internet connection
 */
export function OfflineBanner() {
  const { isOffline } = useServiceWorker();

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed left-0 right-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-950" />
        You&apos;re offline. Some features may be limited.
      </span>
    </div>
  );
}

/**
 * Install PWA Prompt
 * Prompts user to install the app on their device
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Listen for beforeinstallprompt event with proper cleanup
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('[PWA] User accepted install prompt');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (dismissed || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <div className="rounded-2xl bg-gradient-to-r from-[var(--brand-primary,#4fa77e)] to-[var(--brand-secondary,#3B82F6)] p-4 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Download className="h-6 w-6 text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Install the App</h3>
            <p className="mt-0.5 text-sm text-white/80">
              Add to your home screen for quick access and a better experience.
            </p>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleInstall}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-[var(--brand-primary,#4fa77e)] transition-colors hover:bg-white/90"
              >
                Install
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
              >
                Not Now
              </button>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-white/60 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

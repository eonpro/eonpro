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
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-blue-600" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Update Available</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              A new version of the app is ready. Refresh to get the latest features.
            </p>

            <div className="flex gap-2 mt-3">
              <button
                onClick={skipWaiting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand-primary,#4fa77e)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-4 h-4" />
                Update Now
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                Later
              </button>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
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
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 py-2 px-4 text-center text-sm font-medium">
      <span className="inline-flex items-center gap-2">
        <span className="w-2 h-2 bg-amber-950 rounded-full animate-pulse" />
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
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-[var(--brand-primary,#4fa77e)] to-[var(--brand-secondary,#3B82F6)] rounded-2xl shadow-lg p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">Install the App</h3>
            <p className="text-sm text-white/80 mt-0.5">
              Add to your home screen for quick access and a better experience.
            </p>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-4 py-2 bg-white text-[var(--brand-primary,#4fa77e)] text-sm font-medium rounded-lg hover:bg-white/90 transition-colors"
              >
                Install
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-4 py-2 text-white/80 text-sm font-medium hover:text-white transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

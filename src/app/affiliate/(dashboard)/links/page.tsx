'use client';

/**
 * Affiliate Links Page
 * 
 * Manage referral links with easy copy functionality.
 * QR code generation for sharing.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RefCode {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  clickCount: number;
  conversionCount: number;
  lastClickAt?: string;
  createdAt: string;
}

interface LinksData {
  baseUrl: string;
  refCodes: RefCode[];
  canCreateMore: boolean;
  maxCodes: number;
}

const formatNumber = (num: number) => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
};

export default function LinksPage() {
  const [data, setData] = useState<LinksData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newCodeName, setNewCodeName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const res = await fetch('/api/affiliate/ref-codes');
        if (res.ok) {
          const linksData = await res.json();
          setData(linksData);
        }
      } catch (error) {
        console.error('Failed to fetch links:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLinks();
  }, []);

  const copyLink = async (code: string, id: string) => {
    const url = `${data?.baseUrl || 'https://app.example.com'}?ref=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      
      // Haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const shareLink = async (code: string, name: string) => {
    const url = `${data?.baseUrl || 'https://app.example.com'}?ref=${code}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check this out',
          text: 'I thought you might be interested in this',
          url: url,
        });
      } catch {
        // User cancelled or error
      }
    } else {
      copyLink(code, name);
    }
  };

  const handleCreateCode = async () => {
    if (!newCodeName.trim()) {
      setCreateError('Please enter a name for your link');
      return;
    }

    setCreateError(null);
    try {
      const res = await fetch('/api/affiliate/ref-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCodeName.trim() }),
      });

      if (res.ok) {
        const newCode = await res.json();
        setData(prev => prev ? {
          ...prev,
          refCodes: [...prev.refCodes, newCode],
        } : null);
        setNewCodeName('');
        setIsCreating(false);
      } else {
        const error = await res.json();
        setCreateError(error.message || 'Failed to create link');
      }
    } catch {
      setCreateError('Something went wrong');
    }
  };

  // Use real data or empty state
  const displayData: LinksData = data || {
    baseUrl: window.location.origin,
    refCodes: [],
    canCreateMore: true,
    maxCodes: 10,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Your Links</h1>
          {displayData.canCreateMore && (
            <button
              onClick={() => setIsCreating(true)}
              className="text-sm font-medium text-gray-900 hover:text-gray-600"
            >
              + New
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        {/* Empty State */}
        {displayData.refCodes.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-8 text-center"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No links yet</h2>
            <p className="text-gray-500 mb-6">Create your first referral link to start earning</p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
            >
              Create Your First Link
            </button>
          </motion.div>
        )}

        {/* Quick Copy Card - Only show when there are links */}
        {displayData.refCodes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 text-white rounded-2xl p-6"
        >
          <p className="text-gray-400 text-sm mb-3">Your main link</p>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-4 mb-4">
            <span className="flex-1 truncate text-sm font-mono">
              {displayData.baseUrl}?ref={displayData.refCodes.find(c => c.isDefault)?.code || displayData.refCodes[0]?.code}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const defaultCode = displayData.refCodes.find(c => c.isDefault) || displayData.refCodes[0];
                if (defaultCode) copyLink(defaultCode.code, defaultCode.id);
              }}
              className="flex-1 py-3 bg-white text-gray-900 font-medium rounded-xl flex items-center justify-center gap-2
                       hover:bg-gray-100 transition-colors"
            >
              {copiedId === (displayData.refCodes.find(c => c.isDefault)?.id || displayData.refCodes[0]?.id) ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={() => {
                const defaultCode = displayData.refCodes.find(c => c.isDefault) || displayData.refCodes[0];
                if (defaultCode) shareLink(defaultCode.code, defaultCode.name);
              }}
              className="py-3 px-6 bg-white/10 font-medium rounded-xl flex items-center gap-2
                       hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </motion.div>
        )}

        {/* All Links */}
        {displayData.refCodes.length > 0 && (
        <div className="space-y-3">
          {displayData.refCodes.map((refCode, index) => (
            <motion.div
              key={refCode.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{refCode.name}</h3>
                      {refCode.isDefault && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 font-mono mt-1">?ref={refCode.code}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(refCode.code, refCode.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {copiedId === refCode.id ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => setShowQR(showQR === refCode.id ? null : refCode.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-6">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(refCode.clickCount)}</p>
                    <p className="text-xs text-gray-500">Clicks</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(refCode.conversionCount)}</p>
                    <p className="text-xs text-gray-500">Conversions</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {refCode.clickCount > 0 
                        ? ((refCode.conversionCount / refCode.clickCount) * 100).toFixed(1)
                        : '0'}%
                    </p>
                    <p className="text-xs text-gray-500">Conv. Rate</p>
                  </div>
                </div>
              </div>

              {/* QR Code Drawer */}
              <AnimatePresence>
                {showQR === refCode.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-100 overflow-hidden"
                  >
                    <div className="p-6 flex flex-col items-center">
                      <div className="w-40 h-40 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                        {/* QR Code would be rendered here with a library like qrcode.react */}
                        <div className="text-center text-gray-400 text-sm">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                          QR Code
                        </div>
                      </div>
                      <button className="text-sm text-gray-500 hover:text-gray-700">
                        Download QR
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
        )}

        {/* Tips */}
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-5">
          <h3 className="font-medium text-gray-900 mb-2">Tips for success</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Create different links for each platform to track performance
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Add your link to your bio on social media
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Use QR codes in stories and videos
            </li>
          </ul>
        </div>
      </div>

      {/* Create New Code Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
            onClick={() => setIsCreating(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Create new link</h2>
                <button
                  onClick={() => setIsCreating(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Link name
                  </label>
                  <input
                    type="text"
                    value={newCodeName}
                    onChange={(e) => setNewCodeName(e.target.value)}
                    placeholder="e.g., Instagram Bio, TikTok"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-900 focus:ring-0"
                  />
                </div>

                {createError && (
                  <p className="text-red-500 text-sm">{createError}</p>
                )}

                <button
                  onClick={handleCreateCode}
                  className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl
                           hover:bg-gray-800 transition-colors"
                >
                  Create Link
                </button>
              </div>

              <p className="mt-4 text-center text-sm text-gray-400">
                {displayData.refCodes.length} of {displayData.maxCodes} links used
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

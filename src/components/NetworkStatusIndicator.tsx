/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { subscribeToSyncState, FirestoreSyncStatus, waitForPendingFirestoreWrites } from '../firebase';

export const NetworkStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<FirestoreSyncStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  );
  const [showReconnectedToast, setShowReconnectedToast] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    let timeoutId: any = null;

    const handleOnline = async () => {
      setIsOnline(true);
      setShowReconnectedToast(true);
      setIsDismissed(false);

      // Trigger pending write sync check
      await waitForPendingFirestoreWrites();

      // Keep toast visible for 4.5 seconds then gently fade out
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowReconnectedToast(false);
      }, 4500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnectedToast(false);
      setIsDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribeSync = subscribeToSyncState((status) => {
      setSyncStatus(status);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeSync();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // When offline
  if (!isOnline && !isDismissed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-4 z-50 max-w-sm sm:max-w-md w-full bg-gradient-to-r from-amber-900 to-amber-950 text-amber-50 p-3.5 rounded-2xl border-2 border-amber-500/60 shadow-2xl shadow-amber-950/50 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl shrink-0 mt-0.5 border border-amber-500/30">
            <WifiOff className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
              <h4 className="text-xs font-black tracking-wide text-amber-300">
                የኦፍላይን ሁነታ (Offline Mode Active)
              </h4>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-100/90 font-medium">
              የኢንተርኔት ግንኙነት የለም። አፑ ያለ ኢንተርኔት መስራቱን ይቀጥላል፤ የሚሰሩት ለውጦች በሙሉ በመሳሪያዎ (IndexedDB) ላይ ተቀምጠው ኢንተርኔት ሲመለስ በራሳቸው ወደ Firestore ዳታቤዝ ይመሳሰላሉ።
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsDismissed(true)}
          className="text-amber-300/70 hover:text-amber-100 p-1 rounded-lg hover:bg-amber-800/40 transition-colors shrink-0"
          title="አሳንስ (Dismiss)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // When back online
  if (showReconnectedToast) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-4 z-50 max-w-sm sm:max-w-md w-full bg-gradient-to-r from-emerald-900 to-[#1B5E20] text-emerald-50 p-3.5 rounded-2xl border-2 border-emerald-400/60 shadow-2xl shadow-emerald-950/50 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-400/20 text-emerald-300 rounded-xl shrink-0 mt-0.5 border border-emerald-400/30">
            {syncStatus === 'syncing' ? (
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-300" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <h4 className="text-xs font-black tracking-wide text-emerald-200">
                ኢንተርኔት ተገናኝቷል (Online Reconnected)
              </h4>
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-100/90 font-medium">
              {syncStatus === 'syncing'
                ? 'በኦፍላይን የተሰሩ ለውጦች ወደ Firestore ዳታቤዝ በራስ-ሰር በመመሳሰል ላይ ናቸው...'
                : 'ሁሉም የኦፍላይን መረጃዎች ወደ Firestore ዳታቤዝ በተሳካ ሁኔታ ተመሳስለዋል!'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowReconnectedToast(false)}
          className="text-emerald-300/70 hover:text-emerald-100 p-1 rounded-lg hover:bg-emerald-800/40 transition-colors shrink-0"
          title="ዝጋ"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Subtle minimized indicator when offline was dismissed
  if (!isOnline && isDismissed) {
    return (
      <button
        onClick={() => setIsDismissed(false)}
        className="fixed bottom-4 left-4 z-50 bg-amber-900/95 text-amber-200 border border-amber-500/50 px-3 py-1.5 rounded-full text-[11px] font-bold shadow-lg flex items-center gap-1.5 hover:bg-amber-800 transition-colors cursor-pointer"
        title="የኦፍላይን ዝርዝር እይ"
      >
        <WifiOff className="w-3.5 h-3.5 animate-pulse text-amber-400" />
        <span>ኦፍላይን (Offline)</span>
      </button>
    );
  }

  return null;
};

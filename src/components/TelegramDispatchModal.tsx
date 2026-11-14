/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Send,
  Phone,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Smartphone,
  Share2,
} from 'lucide-react';
import {
  copyToClipboardSafe,
  getTelegramPhoneUrl,
  getSmsUrl,
  normalizeEthiopianPhone,
} from '../utils/telegramShare';

interface TelegramDispatchModalProps {
  recipientName: string;
  recipientRole: string; // e.g. "አባል" or "የቤተሰብ ወኪል" or "ስራ አስፈፃሚ" or "ፋይናንስ ሀላፊ"
  initialPhone: string;
  initialTelegram?: string;
  messageText: string;
  directUrl: string;
  onClose: () => void;
}

export const TelegramDispatchModal: React.FC<TelegramDispatchModalProps> = ({
  recipientName,
  recipientRole,
  initialPhone,
  initialTelegram,
  messageText,
  directUrl,
  onClose,
}) => {
  const [phoneNumber, setPhoneNumber] = useState(initialPhone || '');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const cleanPhone = normalizeEthiopianPhone(phoneNumber);
  const tgPhoneUrl = getTelegramPhoneUrl(cleanPhone);
  const smsUrl = getSmsUrl(cleanPhone || phoneNumber, messageText);
  const shareTgUrl = `https://t.me/share/url?url=${encodeURIComponent(directUrl)}&text=${encodeURIComponent(messageText)}`;

  const handleCopyText = async () => {
    const ok = await copyToClipboardSafe(messageText);
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboardSafe(directUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-emerald-950 flex items-center justify-center font-bold shadow-xs">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                ሪፖርት በTelegram / ስልክ ቁጥር መላኪያ
              </h3>
              <p className="text-[11px] text-emerald-200">
                ለ{recipientName} ({recipientRole})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Phone Number Input for Admin Command */}
          <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2">
            <label className="flex items-center justify-between text-xs font-bold text-neutral-800">
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                የተቀባዩ ስልክ ቁጥር (Phone Number)፡
              </span>
              <span className="text-[10px] font-normal text-neutral-500">በአድሚን ትእዛዝ የሚቀየር</span>
            </label>
            <div className="relative">
              <input
                type="tel"
                inputMode="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="ለምሳሌ፡ 0911234567 ወይም +966..."
                className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold bg-white rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <Phone className="w-4 h-4 text-neutral-400 absolute left-2.5 top-2.5" />
            </div>
            {cleanPhone && (
              <p className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                የተረጋገጠ የኢትዮጵያ ቁጥር፡ <span className="font-mono">{cleanPhone}</span>
              </p>
            )}
          </div>

          {/* Action Dispatch Buttons */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-700">ለመላክ አማራጭ ይምረጡ፡</p>

            {/* 1. Direct Telegram by Phone */}
            <a
              href={tgPhoneUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between p-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors shadow-xs group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Send className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                <div className="text-left">
                  <span className="block leading-tight">በስልክ ቁጥር ወደ Telegram ላክ</span>
                  <span className="text-[10px] text-sky-100 font-normal">
                    {cleanPhone ? `${cleanPhone} ላይ ቴሌግራም ይከፍታል` : 'ቴሌግራም ይከፍታል'}
                  </span>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>

            {/* 2. Telegram Share with Prefilled Text */}
            <a
              href={shareTgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-xs group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Share2 className="w-4 h-4 group-hover:scale-105 transition-transform" />
                <div className="text-left">
                  <span className="block leading-tight">በTelegram መተግበሪያ ሼር አድርግ</span>
                  <span className="text-[10px] text-emerald-200 font-normal">
                    ሙሉውን ሪፖርትና ሊንክ ይዞ በTelegram ይልካል
                  </span>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>

            {/* 3. Direct SMS */}
            <a
              href={smsUrl}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-emerald-950 font-bold text-xs transition-colors shadow-xs group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4" />
                <div className="text-left">
                  <span className="block leading-tight">በቀጥታ በSMS (የስልክ መልእክት) ላክ</span>
                  <span className="text-[10px] text-amber-950/80 font-normal">
                    የስልኩን መደበኛ SMS መተግበሪያ ይከፍታል
                  </span>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>

          {/* Copy Tools */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200">
            <button
              type="button"
              onClick={handleCopyText}
              className="py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedText ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>ተቀድቷል (Copied!)</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-neutral-600" />
                  <span>ሙሉ ጽሑፉን ኮፒ አድርግ</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>ሊንኩ ተቀድቷል!</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 text-neutral-600" />
                  <span>ሊንኩን ብቻ ኮፒ አድርግ</span>
                </>
              )}
            </button>
          </div>

          {/* Message Preview */}
          <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">
              የሚላከው ጽሑፍ ቅድመ-ዕይታ (Preview)፦
            </span>
            <div className="max-h-36 overflow-y-auto text-[11px] text-neutral-700 font-sans whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-neutral-200 select-all">
              {messageText}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-neutral-100 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-300 hover:bg-neutral-400 text-neutral-800 font-bold text-xs transition-colors cursor-pointer"
          >
            ዝጋ (Close)
          </button>
        </div>
      </div>
    </div>
  );
};

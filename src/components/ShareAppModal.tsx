/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Send,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  Info,
  QrCode,
  Link2,
  Globe,
  Save,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  getAppUrl,
  copyToClipboardSafe,
  setCustomPublicAppUrl,
  getCustomPublicAppUrl,
} from '../utils/telegramShare';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareAppModal: React.FC<ShareAppModalProps> = ({ isOpen, onClose }) => {
  const [currentUrl, setCurrentUrl] = useState<string>(getAppUrl());
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [customInputUrl, setCustomInputUrl] = useState<string>(getCustomPublicAppUrl() || '');
  const [copied, setCopied] = useState(false);
  const [savedUrlSuccess, setSavedUrlSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const success = await copyToClipboardSafe(currentUrl);
    if (success) {
      setCopied(true);
      try {
        confetti({
          particleCount: 35,
          spread: 50,
          origin: { y: 0.6 },
          colors: ['#047857', '#d97706'],
        });
      } catch {}
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSaveCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomPublicAppUrl(customInputUrl);
    setCurrentUrl(getAppUrl());
    setIsEditingUrl(false);
    setSavedUrlSuccess(true);
    setTimeout(() => setSavedUrlSuccess(false), 3000);
  };

  const telegramShareHref = `https://t.me/share/url?url=${encodeURIComponent(
    currentUrl
  )}&text=${encodeURIComponent(
    `ሰላም፤ የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ) መተግበሪያን በስልክዎ በቀጥታ ለመክፈት ከታች ያለውን ሊንክ ይጫኑ፦\n👉 ${currentUrl}\n\n— የአበሩስ አንድነት ማህበር`
  )}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-neutral-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-amber-950 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white">
                የአፑን ሊንክ ማጋሪያ (Share App Link)
              </h3>
              <p className="text-xs text-amber-200/80">
                ለቤተሰብ ወኪሎችና አባላት በማናቸውም ስልክ ላይ እንዲከፈት
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Why the link might not work on others' devices notice */}
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/90 text-amber-950 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Info className="w-4 h-4 text-amber-700 shrink-0" />
              <span>ሊንኩ በሌሎች ስልኮች ላይ እንዲሰራ ማወቅ የሚገባው፡</span>
            </div>
            <ul className="text-xs text-amber-900/90 space-y-1.5 list-disc pl-5">
              <li>
                የግል ማበልፀጊያ ሊንክ (<strong>ais-dev-...</strong>) ለገንቢው ብቻ የተፈቀደ ስለሆነ በሌላ ሰው ስልክ ላይ 403 ይሰጣል።
              </li>
              <li>
                ለሌሎች ሰዎች እንዲከፍት በAI Studio የላይኛው ቀኝ ጥግ ያለውን <strong>"Share"</strong> ወይም <strong>"Deploy"</strong> ቁልፍ ተጭነው አፑን ይፋዊ (Public) ያድርጉ።
              </li>
              <li>
                ይፋዊው ሊንክ <strong>ais-pre-...</strong> ወይም የራስዎ ዶሜይን ሲሆን በማንኛውም ስልክ ያለ ምንም መግቢያ (login) ይሰራል!
              </li>
            </ul>
          </div>

          {/* Current URL Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-neutral-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-700" />
                የሚላከው ይፋዊ የመተግበሪያ ሊንክ (Active App Link)
              </label>
              <button
                type="button"
                onClick={() => setIsEditingUrl(!isEditingUrl)}
                className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 underline"
              >
                {isEditingUrl ? 'ሰርዝ' : 'ሊንክ ቀይር/አስተካክል'}
              </button>
            </div>

            {isEditingUrl ? (
              <form onSubmit={handleSaveCustomUrl} className="space-y-2">
                <input
                  type="url"
                  value={customInputUrl}
                  onChange={(e) => setCustomInputUrl(e.target.value)}
                  placeholder="https://ais-pre-...run.app"
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-900 transition-colors flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    <span>አስቀምጥ</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 font-mono text-xs text-neutral-800 break-all select-all flex items-center justify-between gap-2">
                <span className="truncate">{currentUrl}</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                  Public
                </span>
              </div>
            )}

            {savedUrlSuccess && (
              <p className="text-[11px] font-bold text-emerald-700">
                ✓ አዲሱ ይፋዊ ሊንክ በስኬት ተቀምጧል!
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            <button
              onClick={handleCopy}
              className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                copied
                  ? 'bg-emerald-800 text-white'
                  : 'bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {copied ? <Check className="w-4 h-4 text-amber-300" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'ሊንኩ ተቀድቷል!' : 'ሊንኩን ኮፒ አድርግ'}</span>
            </button>

            <a
              href={telegramShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-[#229ED9] hover:bg-[#1e8bc0] text-white flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>በቴሌግራም ላክ</span>
            </a>

            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-800 flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>በአሳሽ ክፈት</span>
            </a>
          </div>

          {/* Quick instructions for family heads */}
          <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <p className="font-bold text-neutral-800 flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
              ለቤተሰብ ወኪሎች ሲላክ፦
            </p>
            <p className="text-[11px] leading-relaxed">
              ወኪሎቹ በሞባይል ስልካቸው ሊንኩን በመጫን በቀጥታ የራሳቸውን ቤተሰብ የከፈሉ/ያልከፈሉ አባላት ዝርዝር እና የወርሃዊ ክፍያ ሁኔታ መከታተል ይችላሉ።
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-neutral-50 px-6 py-3 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-200/80 transition-colors"
          >
            ዝጋ (Close)
          </button>
        </div>
      </div>
    </div>
  );
};

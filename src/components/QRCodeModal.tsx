/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Printer, Download, Share2, Check, Send } from 'lucide-react';
import { Member } from '../types';
import { generateSvgQRCode } from '../utils/qrCode';
import { shareAppLinkToMember } from '../utils/telegramShare';

interface QRCodeModalProps {
  member: Member;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ member, onClose }) => {
  const [copied, setCopied] = React.useState(false);
  const qrData = `ABARRUS-MEMBER:${member.id}|${member.fullName}|GEN:${member.generation}|FAM:${member.familyName}`;
  const qrSvg = generateSvgQRCode(qrData, 220);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${member.fullName} (${member.id}) - የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTelegram = () => {
    const { url } = shareAppLinkToMember(member);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-emerald-900/10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/abarrus_logo.jpg"
              alt="የአበሩስ አርማ"
              className="w-10 h-10 rounded-full ring-2 ring-amber-400 object-cover"
            />
            <div>
              <h3 className="font-bold text-sm tracking-tight text-amber-200">የአባል መታወቂያ QR ኮድ</h3>
              <p className="text-[11px] text-emerald-200 truncate max-w-[200px]">የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-emerald-700/50 text-emerald-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Body */}
        <div className="p-6 text-center space-y-4">
          <div className="inline-block p-3 bg-neutral-50 rounded-2xl border-2 border-dashed border-emerald-700/30 shadow-inner">
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} className="flex justify-center" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-2">
              <span>{member.id}</span>
              <span>·</span>
              <span>{member.generation}ኛ ትውልድ</span>
            </div>
            <h4 className="text-xl font-bold text-neutral-900">{member.fullName}</h4>
            <p className="text-sm text-neutral-600 mt-1">ቤተሰብ፡ {member.familyName}</p>
            {member.phone && (
              <p className="text-xs text-neutral-500 font-mono mt-0.5">ስልክ፡ {member.phone}</p>
            )}
          </div>

          <p className="text-xs text-neutral-500 bg-amber-50 border border-amber-200/60 rounded-lg p-2.5 text-left">
            ይህ የQR ኮድ በአስተዳዳሪው ስካን ሲደረግ የአባሉን የክፍያ ታሪክ፣ ወርሃዊ መዋጮ እና የቤተሰብ መረጃ ወዲያውኑ ያሳያል።
          </p>

          {/* Telegram share button */}
          <button
            onClick={handleShareTelegram}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#229ED9] hover:bg-[#1e8bc0] text-white font-bold text-xs transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>የአፑን ሊንክ ለ{member.fullName.split(' ')[0]} በTelegram ላክ</span>
          </button>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handlePrint}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-800 text-white font-medium text-xs hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>አትም (Print)</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 text-neutral-700 font-medium text-xs hover:bg-neutral-50 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span>{copied ? 'ተቀድቷል' : 'ኮፒ'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

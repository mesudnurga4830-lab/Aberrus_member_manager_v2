/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Member, Family, Contribution, SettingsRates, GenerationNumber } from '../types';
import { normalizePhoneNumber } from '../firebase';
import {
  X,
  User,
  Phone,
  Send,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  Save,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AdminEditMemberModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  onUpdateMember: (id: string, updates: Partial<Member>) => void;
  onDeleteMember?: (id: string) => void;
  onToggleMonthlyStatus: (memberId: string, month: number, year: number, markPaid: boolean) => void;
  onToggleGenStatus: (memberId: string, markPaid: boolean) => void;
}

export const AdminEditMemberModal: React.FC<AdminEditMemberModalProps> = ({
  member,
  isOpen,
  onClose,
  families,
  contributions,
  settings,
  onUpdateMember,
  onDeleteMember,
  onToggleMonthlyStatus,
  onToggleGenStatus,
}) => {
  const currentMonth = 11; // ሀምሌ
  const currentYear = 2018;

  // Check current status in contributions
  const isCurrentlyMonthlyPaid = !!member && contributions.some(
    (c) =>
      c.memberId === member.id &&
      c.type === 'ወርሃዊ' &&
      c.ethiopianMonth === currentMonth &&
      c.ethiopianYear === currentYear &&
      c.status === 'ተከፍሏል'
  );

  const isCurrentlyGenPaid = !!member && contributions.some(
    (c) => c.memberId === member.id && c.type === 'ትውልድ' && c.status === 'ተከፍሏል'
  );

  // Form states - called unconditionally
  const [fullName, setFullName] = useState(member?.fullName || '');
  const [phone, setPhone] = useState(member?.phone || '');
  const [telegram, setTelegram] = useState(member?.telegram || '');
  const [generation, setGeneration] = useState<GenerationNumber>(member?.generation || 4);
  const [isHead, setIsHead] = useState<boolean>(!!member?.isHead);
  const [notes, setNotes] = useState(member?.notes || '');

  // Payment status states
  const [monthlyPaid, setMonthlyPaid] = useState<boolean>(isCurrentlyMonthlyPaid);
  const [genPaid, setGenPaid] = useState<boolean>(isCurrentlyGenPaid);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (member) {
      setFullName(member.fullName);
      setPhone(member.phone || '');
      setTelegram(member.telegram || '');
      setGeneration(member.generation);
      setIsHead(!!member.isHead);
      setNotes(member.notes || '');
      setMonthlyPaid(isCurrentlyMonthlyPaid);
      setGenPaid(isCurrentlyGenPaid);
      setSaveSuccess(false);
    }
  }, [member, isCurrentlyMonthlyPaid, isCurrentlyGenPaid]);

  if (!isOpen || !member) return null;

  const monthlyRate = settings.monthlyRate[generation] || 50;
  const genRate = settings.generationPayment[generation] || 500;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    const cleanPhone = phone.trim() ? normalizePhoneNumber(phone.trim()) : '';

    // 1. Update Member Details
    onUpdateMember(member.id, {
      fullName: fullName.trim(),
      phone: cleanPhone || phone.trim(),
      telegram: telegram.trim(),
      generation,
      isHead,
      notes: notes.trim(),
    });

    // 2. Update Monthly Status if toggled
    if (monthlyPaid !== isCurrentlyMonthlyPaid) {
      onToggleMonthlyStatus(member.id, currentMonth, currentYear, monthlyPaid);
    }

    // 3. Update Generation Status if toggled
    if (genPaid !== isCurrentlyGenPaid) {
      onToggleGenStatus(member.id, genPaid);
    }

    try {
      confetti({
        particleCount: 30,
        spread: 45,
        origin: { y: 0.6 },
        colors: ['#047857', '#d97706'],
      });
    } catch {}

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-neutral-200">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-neutral-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <User className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                  አስተዳዳሪ (Mesud Nurga)
                </span>
                <span className="text-xs font-mono text-neutral-400">{member.id}</span>
              </div>
              <h3 className="text-base font-extrabold text-neutral-900 mt-0.5">
                የአባል መረጃ እና የክፍያ ሁኔታ ማስተካከያ
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {saveSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-neutral-900">ለውጦቹ በስኬት ተቀምጠዋል!</h4>
            <p className="text-xs text-neutral-500">
              የ{fullName} ስም፣ ስልክ፣ ቴሌግራም እና የክፍያ ሁኔታዎች ተመዝግበዋል።
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 space-y-5">
            {/* 1. Full Name */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                ሙሉ ስም (Full Name) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="የአባሉ ሙሉ ስም"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm font-semibold text-neutral-900 focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 transition-all"
                />
              </div>
            </div>

            {/* 2. Phone & Telegram in 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  <span>ስልክ ቁጥር (Phone Number)</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0911234567"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm font-mono text-neutral-900 focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 transition-all"
                />
              </div>

              {/* Telegram Account */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-[#229ED9]" />
                  <span>ቴሌግራም አካውንት (Telegram)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="@username ወይም ስልክ ቁጥር"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm font-mono text-neutral-900 focus:ring-2 focus:ring-sky-500/30 focus:border-[#229ED9] transition-all"
                  />
                  {telegram && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-sky-600 font-semibold">
                      Telegram
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Generation & Head status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  የትውልድ ደረጃ (Generation)
                </label>
                <select
                  value={generation}
                  onChange={(e) => setGeneration(Number(e.target.value) as GenerationNumber)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-900 bg-white"
                >
                  <option value={3}>3ኛ ትውልድ (ወርሃዊ፡ {settings.monthlyRate[3]} ብር / ትውልድ፡ {settings.generationPayment[3]} ብር)</option>
                  <option value={4}>4ኛ ትውልድ (ወርሃዊ፡ {settings.monthlyRate[4]} ብር / ትውልድ፡ {settings.generationPayment[4]} ብር)</option>
                  <option value={5}>5ኛ ትውልድ (ወርሃዊ፡ {settings.monthlyRate[5]} ብር / ትውልድ፡ {settings.generationPayment[5]} ብር)</option>
                  <option value={6}>6ኛ ትውልድ (ወርሃዊ፡ {settings.monthlyRate[6]} ብር / ትውልድ፡ {settings.generationPayment[6]} ብር)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  የቤተሰብ ወኪልነት (Family Head)
                </label>
                <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-neutral-300 bg-neutral-50/70 cursor-pointer hover:bg-neutral-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={isHead}
                    onChange={(e) => setIsHead(e.target.checked)}
                    className="w-4 h-4 text-emerald-700 rounded focus:ring-emerald-700"
                  />
                  <span className="text-xs font-semibold text-neutral-800">
                    የዚህ ቤተሰብ ወኪል ነው (Family Head)
                  </span>
                </label>
              </div>
            </div>

            {/* 4. PAYMENT STATUS SECTION (የከፈለ / ያልከፈለ ኤዲት ማድረጊያ) */}
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/90 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                <span className="text-xs font-extrabold text-neutral-900 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-800" />
                  <span>የክፍያ ሁኔታ ማስተካከያ (Payment Status Control)</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">የአስተዳዳሪ መቆጣጠሪያ</span>
              </div>

              {/* 4a. Monthly Payment (Hamle 2018) Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-800">
                    ወርሃዊ መዋጮ (ሀምሌ 2018 ዓ.ም)፡
                  </span>
                  <span className="text-xs font-mono font-bold text-neutral-600">
                    {monthlyRate} ብር/ወር
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMonthlyPaid(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                      monthlyPaid
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-600/30'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-emerald-50 hover:text-emerald-800'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>✓ ተከፍሏል (Paid)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonthlyPaid(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                      !monthlyPaid
                        ? 'bg-red-600 text-white border-red-700 shadow-xs ring-2 ring-red-600/30'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-red-50 hover:text-red-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>✗ ያልተከፈለ (Unpaid)</span>
                  </button>
                </div>
              </div>

              {/* 4b. Generation Payment Toggle */}
              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-neutral-800 block">
                      የትውልድ መዋጮ (Generation Contribution)፡
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      የክፍያ መጀመሪያ፦ ሀምሌ 01፣ 2018 ዓ.ም (በአንድ ጊዜ ወይም በየወሩ)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-700">
                    {genRate} ብር
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGenPaid(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                      genPaid
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-600/30'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-emerald-50 hover:text-emerald-800'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>✓ ተከፍሏል (Paid)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGenPaid(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                      !genPaid
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-600/30'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-amber-50 hover:text-amber-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>✗ ያልተከፈለ (Unpaid)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 5. Notes */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                ተጨማሪ ማስታወሻ (Notes)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ስለዚህ አባል የሚመዘገብ ልዩ ማስታወሻ..."
                className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 text-xs text-neutral-900 focus:ring-2 focus:ring-emerald-700/30"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              {onDeleteMember ? (
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `⚠️ እርግጠኛ ነዎት? "${member.fullName}" (${member.id}) የተባሉትን አባል ከዝርዝር ውስጥ ሙሉ በሙሉ መሰረዝ ይፈልጋሉ?\n\nይህ አባል በስህተት የተመዘገበ ከሆነ አዎ በማለት ማጥፋት ይችላሉ።`
                    );
                    if (confirmed) {
                      onDeleteMember(member.id);
                      onClose();
                    }
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  title="በስህተት የተመዘገበ አባል ሰርዝ"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span>ይህን አባል ሰርዝ (Delete Member)</span>
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-semibold text-xs transition-colors"
                >
                  ይቅር (Cancel)
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>ለውጦችን መዝግብና አስቀምጥ (Save)</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

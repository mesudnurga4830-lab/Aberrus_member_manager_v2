/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { X, UserPlus, Upload, Image, Phone, Users, ShieldCheck, Sparkles, Heart } from 'lucide-react';
import { Member, Family, GenerationNumber, SettingsRates } from '../types';
import { normalizePhoneNumber } from '../firebase';

interface AddMemberModalProps {
  families: Family[];
  settings: SettingsRates;
  initialFamilyId?: string;
  lockFamily?: boolean;
  onSave: (member: Omit<Member, 'id'>) => void;
  onClose: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  families,
  settings,
  initialFamilyId,
  lockFamily = false,
  onSave,
  onClose,
}) => {
  const [fullName, setFullName] = useState('');
  const [generation, setGeneration] = useState<GenerationNumber>(4);
  const [familyId, setFamilyId] = useState(initialFamilyId || families[0]?.id || 'FA001');
  const [phone, setPhone] = useState('');
  const [isHead, setIsHead] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [isSpouse, setIsSpouse] = useState(false);
  const [telegram, setTelegram] = useState('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFamily = families.find((f) => f.id === familyId);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !selectedFamily) return;

    const cleanPhone = phone.trim() ? normalizePhoneNumber(phone.trim()) : '';

    onSave({
      fullName: fullName.trim(),
      generation,
      familyId,
      familyName: selectedFamily.familyName,
      phone: cleanPhone,
      isHead,
      isMinor,
      isSpouse,
      telegram: telegram.trim() || undefined,
      photo,
      notes: isMinor
        ? '18 ዓመት ያልሞላ - ከክፍያ ነጻ'
        : isSpouse
        ? 'የትዳር አጋር - ከትውልድ ክፍያ ነፃ'
        : undefined,
    });

    onClose();
  };

  const currentMonthlyRate = isMinor
    ? 0
    : isSpouse
    ? settings.spouseMonthlyRate || 100
    : settings.monthlyRate[generation] || 50;

  const currentGenPayment = isMinor || isSpouse
    ? 0
    : settings.generationPayment[generation] || 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-900/10 animate-in fade-in zoom-in-95 duration-200 my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/20 text-amber-300">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-amber-200">አዲስ አባል መመዝገቢያ</h3>
              <p className="text-xs text-emerald-200">የአበሩስ አንድነት ማህበር አባል ምዝገባ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-emerald-700/50 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Photo Upload Row */}
          <div className="flex items-center gap-4 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="relative w-14 h-14 rounded-full bg-emerald-100 border-2 border-emerald-600/30 flex items-center justify-center overflow-hidden shrink-0">
              {photo ? (
                <img src={photo} alt="Member preview" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-7 h-7 text-emerald-700" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-neutral-800">የአባል ፎቶ (አማራጭ)</p>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 shadow-2xs cursor-pointer mt-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>ፎቶ ይምረጡ</span>
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhoto(undefined)}
                  className="ml-2 text-[11px] text-red-600 hover:underline cursor-pointer"
                >
                  አስወግድ
                </button>
              )}
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              ሙሉ ስም (FullName) *
            </label>
            <input
              type="text"
              placeholder="ለምሳሌ፡ አኢሻ አ/ቃድር"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full text-sm rounded-xl border border-neutral-300 px-3.5 py-2.5 bg-neutral-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700"
              required
            />
          </div>

          {/* Generation & Family Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                ትውልድ (Generation) *
              </label>
              <select
                value={generation}
                onChange={(e) => setGeneration(Number(e.target.value) as GenerationNumber)}
                className="w-full text-xs font-semibold rounded-xl border border-neutral-300 px-3 py-2.5 bg-neutral-50/50 focus:ring-2 focus:ring-emerald-700/40"
              >
                <option value={3}>3ኛ ትውልድ</option>
                <option value={4}>4ኛ ትውልድ</option>
                <option value={5}>5ኛ ትውልድ</option>
                <option value={6}>6ኛ ትውልድ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                ቤተሰብ (Family) *
              </label>
              <select
                value={familyId}
                onChange={(e) => setFamilyId(e.target.value)}
                disabled={lockFamily}
                className={`w-full text-xs rounded-xl border border-neutral-300 px-3 py-2.5 bg-neutral-50/50 focus:ring-2 focus:ring-emerald-700/40 ${
                  lockFamily ? 'bg-neutral-100 opacity-90 cursor-not-allowed font-bold text-emerald-950' : ''
                }`}
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.id} · {f.familyName} ({f.headName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Member Special Category Checkboxes */}
          <div className="space-y-2 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
            <span className="font-bold text-neutral-800 block mb-1">የአባል ልዩ መደብ (አማራጭ)፦</span>

            {/* Minor Checkbox */}
            <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-neutral-100">
              <input
                type="checkbox"
                checked={isMinor}
                onChange={(e) => {
                  setIsMinor(e.target.checked);
                  if (e.target.checked) setIsSpouse(false);
                }}
                className="w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700 mt-0.5"
              />
              <div>
                <span className="font-bold text-neutral-900">👶 18 ዓመት ያልሞላ ልጅ (ከክፍያ ነፃ - 0 ብር)</span>
                <p className="text-[10px] text-neutral-500">
                  የ3ኛ ትውልድ ልጆች (4ኛ ትውልድ) እድሜያቸው 18 ካልሞላ ከወርሃዊም ሆነ ከትውልድ ክፍያ ነፃ ናቸው።
                </p>
              </div>
            </label>

            {/* Spouse Checkbox */}
            <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-neutral-100">
              <input
                type="checkbox"
                checked={isSpouse}
                onChange={(e) => {
                  setIsSpouse(e.target.checked);
                  if (e.target.checked) setIsMinor(false);
                }}
                className="w-4 h-4 rounded text-purple-800 focus:ring-purple-700 mt-0.5"
              />
              <div>
                <span className="font-bold text-purple-950">💍 የአባል የትዳር አጋር (Spouse)</span>
                <p className="text-[10px] text-purple-700">
                  የትዳር አጋሮች ከትውልድ ክፍያ ነፃ (0 ብር) ሲሆኑ፣ ወርሃዊ ክፍያቸው 100 ብር ብቻ ነው።
                </p>
              </div>
            </label>
          </div>

          {/* Automatic Rates Notice */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>የተመደበው የመዋጮ ተመን</span>
              </p>
              <p className="text-neutral-600 text-[11px] mt-0.5">
                ወርሃዊ መዋጮ፡ <span className="font-bold text-neutral-900">{currentMonthlyRate} ብር/ወር</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-amber-800">የትውልድ ክፍያ</span>
              <p className="font-bold text-neutral-900 text-xs">{currentGenPayment} ብር</p>
            </div>
          </div>

          {/* Phone & Telegram */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                ስልክ ቁጥር (Phone)
              </label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0911234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50/50 focus:ring-2 focus:ring-emerald-700/40 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Telegram (@username)
              </label>
              <input
                type="text"
                placeholder="@username"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50/50 focus:ring-2 focus:ring-emerald-700/40 font-mono"
              />
            </div>
          </div>

          {/* Family Head Checkbox */}
          {!isMinor && !lockFamily && (
            <div className="pt-1">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHead}
                  onChange={(e) => setIsHead(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700 mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                    የቤተሰብ ወኪል / ራስ (Family Head)
                  </span>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    ይህ አባል የወርሃዊ መዋጮ ማሳሰቢያዎችን እና የቴሌግራም መልዕክቶችን በዋናነት እንዲቀበል ያደርጋል።
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Helpful note for mistakes */}
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
            <span className="text-amber-600 font-bold">💡</span>
            <span>
              አባል በስህተት ከተመዘገበ ከአባላት ዝርዝር ላይ <b>«ሰርዝ» (Delete)</b> የሚለውን በመጫን ወይም በ«አስተካክል» ገጽ ውስጥ በቀላሉ ሙሉ በሙሉ መሰረዝ ይችላሉ።
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              ይቅር (Cancel)
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>አባሉን መዝግብ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

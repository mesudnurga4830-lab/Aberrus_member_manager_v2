/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  Mail,
  User,
  X,
  AlertCircle,
  CheckCircle2,
  Users,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MASTER_ADMIN, verifyAndAuthorizeDevice, isPrimaryAdminDevice } from '../utils/adminAuth';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSelectRole: (role: 'family_head' | 'member') => void;
  onOpenChangePin?: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSelectRole,
  onOpenChangePin,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  if (!isOpen) return null;

  const isDevDevice = isPrimaryAdminDevice();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const result = verifyAndAuthorizeDevice(pinInput);
    if (result.success) {
      setSuccessMessage(result.message);
      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#047857', '#d97706'],
        });
      } catch {}

      setTimeout(() => {
        setSuccessMessage(null);
        setPinInput('');
        onSuccess();
        onClose();
      }, 1000);
    } else {
      setErrorMessage(result.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-neutral-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950 via-neutral-900 to-amber-950 p-6 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center mx-auto text-amber-300 mb-3 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          <h3 className="font-extrabold text-base tracking-tight text-white">
            የአስተዳዳሪ ፍቃድ የተገደበ ነው
          </h3>
          <p className="text-xs text-amber-200/90 mt-1">
            Admin Access Restricted (Protected Area)
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Authorized Admin Identity Card */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>የተፈቀደለት ብቸኛ ዋና አስተዳዳሪ፡</span>
            </div>
            
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2 text-neutral-900 font-semibold">
                <User className="w-3.5 h-3.5 text-emerald-700" />
                <span>{MASTER_ADMIN.name}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-600 font-mono text-[11px]">
                <Mail className="w-3.5 h-3.5 text-neutral-500" />
                <span>{MASTER_ADMIN.email}</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 leading-relaxed pt-1 border-t border-neutral-200">
              ይህ የአስተዳዳሪ ክፍል የመስኡድ ኑርጋ ዋና መሳሪያ ላይ ብቻ ክፍት ሲሆን፣ ከዚህ መሳሪያ ውጪ በፍጹም አይከፈትም።
            </p>
          </div>

          {!isDevDevice ? (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 text-center font-medium">
              ⚠️ ይህ መሳሪያ ዋናው የአስተዳዳሪ መሳሪያ ስላልሆነ የአስተዳዳሪ ክፍሉን መክፈት አይቻልም። እባክዎ እንደ ቤተሰብ ወኪል ወይም አባል ይቀጥሉ።
            </div>
          ) : (
            /* Form for Mesud Nurga on this device */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-800" />
                  <span>የአስተዳዳሪ ደህንነት ፒን (Admin Security PIN)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    placeholder="የደህንነት ፒን ያስገቡ"
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setErrorMessage(null);
                    }}
                    maxLength={12}
                    className="w-full text-center font-mono text-lg tracking-widest px-4 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700 focus:bg-white transition-all font-bold"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 hover:text-neutral-700 font-semibold"
                  >
                    {showPin ? 'ደብቅ' : 'አሳይ'}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Unlock className="w-4 h-4" />
                <span>ይህን መሳሪያ ፍቀድ (Authorize This Device)</span>
              </button>

              {onOpenChangePin && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenChangePin();
                    }}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3 text-amber-600" />
                    <span>🔑 የአስተዳዳሪ ፒን ኮድ መቀየር ይፈልጋሉ? (Change PIN)</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Quick Fallback Role Selection */}
          <div className="pt-2 border-t border-neutral-100 space-y-2">
            <p className="text-[11px] text-neutral-400 text-center">
              አስተዳዳሪ ካልሆኑ በሚከተሉት ሚናዎች ይቀጥሉ፦
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectRole('family_head');
                  onClose();
                }}
                className="py-2 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>የቤተሰብ ወኪል</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectRole('member');
                  onClose();
                }}
                className="py-2 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Users className="w-3.5 h-3.5 text-emerald-700" />
                <span>የአባል እይታ</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

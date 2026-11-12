/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  MASTER_ADMIN,
  getAdminPin,
  changeAdminPin,
  resetAdminPinToDefault,
  isThisDeviceAdminAuthorized,
} from '../utils/adminAuth';

interface ChangeAdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newPin: string) => void;
}

export const ChangeAdminPinModal: React.FC<ChangeAdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const currentSavedPin = getAdminPin();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isAuthorized = isThisDeviceAdminAuthorized();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const result = changeAdminPin(currentPin, newPin, confirmPin);

    if (result.success) {
      setSuccessMessage(result.message);
      try {
        confetti({
          particleCount: 60,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#047857', '#d97706', '#10b981'],
        });
      } catch {}

      if (onSuccess) {
        onSuccess(newPin.trim());
      }

      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setSuccessMessage(null);
      }, 1400);
    } else {
      setIsSubmitting(false);
      setErrorMessage(result.message);
    }
  };

  const handleResetDefault = () => {
    resetAdminPinToDefault();
    setSuccessMessage('የአስተዳዳሪ ፒን ወደ ነባሪው ተመልሷል!');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    if (onSuccess) {
      onSuccess(MASTER_ADMIN.defaultPin);
    }
    setTimeout(() => {
      onClose();
      setSuccessMessage(null);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-neutral-200 overflow-hidden my-8 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-amber-950 p-6 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center mx-auto text-amber-300 mb-3 shadow-inner">
            <KeyRound className="w-7 h-7" />
          </div>

          <h3 className="font-extrabold text-base tracking-tight text-white">
            የአስተዳዳሪ ፒን ኮድ መቀየሪያ
          </h3>
          <p className="text-xs text-amber-200/90 mt-1">
            Change Admin Security PIN (መስኡድ ኑርጋ)
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {/* Info Banner without leaking PIN hint */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-neutral-800 font-bold">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>የደህንነት ጥበቃ</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                ሚስጥራዊ
              </span>
            </div>
            <p className="text-neutral-600 text-[11px] leading-relaxed">
              ይህ ፒን ኮድ የአስተዳዳሪ ክፍሎችን (አባላትን ማስተካከል፣ መዋጮ መቀበል፣ ማስተካከያዎች) ለመጠበቅ ያገለግላል።
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: Current PIN */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-neutral-500" />
                  <span>የአሁኑ ፒን ኮድ (Current PIN)</span>
                </label>
                {isAuthorized && (
                  <button
                    type="button"
                    onClick={() => setCurrentPin(currentSavedPin)}
                    className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold underline"
                  >
                    የአሁኑን በራስ-ሰር ሙላ
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPins ? 'text' : 'password'}
                  placeholder="የአሁኑን ፒን ያስገቡ"
                  value={currentPin}
                  onChange={(e) => {
                    setCurrentPin(e.target.value);
                    setErrorMessage(null);
                  }}
                  maxLength={12}
                  className="w-full font-mono text-center tracking-widest text-base px-4 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700 focus:bg-white font-bold transition-all"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Field 2: New PIN */}
            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1.5">
                <Unlock className="w-3.5 h-3.5 text-amber-600" />
                <span>አዲሱ ፒን ኮድ (New PIN)</span>
              </label>
              <div className="relative">
                <input
                  type={showPins ? 'text' : 'password'}
                  placeholder="አዲስ ፒን (ቢያንስ 4 አሃዝ)"
                  value={newPin}
                  onChange={(e) => {
                    setNewPin(e.target.value);
                    setErrorMessage(null);
                  }}
                  maxLength={12}
                  className="w-full font-mono text-center tracking-widest text-base px-4 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700 focus:bg-white font-bold transition-all"
                  required
                />
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                ቢያንስ 4 ቁጥሮች ወይም ፊደላት መሆን አለበት።
              </p>
            </div>

            {/* Field 3: Confirm New PIN */}
            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>አዲሱን ፒን በድጋሚ ያረጋግጡ (Confirm New PIN)</span>
              </label>
              <div className="relative">
                <input
                  type={showPins ? 'text' : 'password'}
                  placeholder="አዲሱን ፒን በድጋሚ ያስገቡ"
                  value={confirmPin}
                  onChange={(e) => {
                    setConfirmPin(e.target.value);
                    setErrorMessage(null);
                  }}
                  maxLength={12}
                  className="w-full font-mono text-center tracking-widest text-base px-4 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700 focus:bg-white font-bold transition-all"
                  required
                />
              </div>
              {newPin && confirmPin && newPin !== confirmPin && (
                <p className="text-[11px] text-red-600 mt-1 font-medium">
                  ⚠️ ፒን ኮዶቹ አይዛመዱም!
                </p>
              )}
            </div>

            {/* Show / Hide Toggle */}
            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => setShowPins(!showPins)}
                className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 font-semibold cursor-pointer"
              >
                {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showPins ? 'ፒን ኮዶችን ደብቅ' : 'ፒን ኮዶችን አሳይ'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefault}
                className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-800 font-bold cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>ወደ ነባሪ ፒን መልስ</span>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Submit / Cancel Buttons */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition-colors text-center cursor-pointer"
              >
                ሰርዝ
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-2/3 py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'በማስቀመጥ ላይ...' : 'ፒን ኮድ ቀይር (Save PIN)'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

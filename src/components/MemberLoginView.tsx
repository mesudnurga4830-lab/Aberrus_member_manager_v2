/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  loginOrRegisterMemberWithPhone,
  googleSignIn,
  normalizePhoneNumber,
  saveMemberToFirestore,
} from '../firebase';
import { Member } from '../types';
import {
  Lock,
  Phone,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Send,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface MemberLoginViewProps {
  onLoginSuccess: (member: Member) => void;
  onAdminGoogleLoginSuccess?: (user: any) => void;
  lang?: 'am' | 'en';
  initialPhone?: string;
}

export const MemberLoginView: React.FC<MemberLoginViewProps> = ({
  onLoginSuccess,
  onAdminGoogleLoginSuccess,
  lang = 'am',
}) => {
  const [activeTab, setActiveTab] = useState<'member' | 'admin'>('member');

  // Member Login Inputs - must start completely empty
  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isEn = lang === 'en';

  // Handle Member Login with Phone + Default 4-digit password
  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizePhoneNumber(phoneInput.trim());
    if (!clean) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const result = await loginOrRegisterMemberWithPhone(clean, passwordInput.trim());

      // Explicitly verify and update phone number in member record and Firestore document
      if (!result.member.phone || result.member.phone !== clean) {
        result.member.phone = clean;
        (result.member as any).phoneNumber = clean;
        result.member.authUid = result.user.uid;
        await saveMemberToFirestore(result.member);
      }

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#1B5E20', '#FFD700', '#4CAF50'],
        });
      } catch {}

      if (result.isNewRegistration) {
        setSuccessNotice(
          isEn
            ? `Welcome! Your account has been registered with default password (last 4 digits).`
            : `እንኳን ደህና መጡ! አካውንትዎ በነባሪ የይለፍ ቃል (የስልክዎ የመጨረሻ 4 አሃዞች) ተመዝግቧል።`
        );
      } else {
        setSuccessNotice(
          isEn ? `Welcome back, ${result.member.fullName}!` : `እንኳን ደህና መጡ ${result.member.fullName}!`
        );
      }

      setTimeout(() => {
        onLoginSuccess(result.member);
      }, 700);
    } catch (err: any) {
      console.error('Member login error:', err);
      setErrorMessage(
        err.message ||
          (isEn
            ? 'Login failed. Please verify your phone number and password.'
            : 'መግባት አልተቻለም። እባክዎ ስልክ ቁጥርዎን እና የይለፍ ቃልዎን ያረጋግጡ።')
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Admin Google Sign-In
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const res = await googleSignIn();
      if (res?.user) {
        try {
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#047857', '#d97706'],
          });
        } catch {}

        setSuccessNotice(
          isEn
            ? `Admin signed in successfully (${res.user.email})`
            : `አድሚን በተሳካ ሁኔታ ገብቷል (${res.user.email})`
        );

        setTimeout(() => {
          if (onAdminGoogleLoginSuccess) {
            onAdminGoogleLoginSuccess(res.user);
          }
        }, 700);
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setErrorMessage(
        err.message || (isEn ? 'Google Sign-In failed. Please try again.' : 'በGoogle መግባት አልተሳካም። እባክዎ እንደገና ይሞክሩ።')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const cleanDigits = normalizePhoneNumber(phoneInput);
  const suggestedDefaultPass = cleanDigits.length >= 4 ? cleanDigits.slice(-4) : '••••';

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="card-abarrus p-6 sm:p-8 border-2 border-[#1B5E20]/20 shadow-xl rounded-3xl">
          {/* Header */}
          <div className="text-center space-y-3 pb-5 border-b border-[#E0E0E0]">
            <div className="w-16 h-16 rounded-full bg-[#1B5E20] border-2 border-[#FFD700] mx-auto flex items-center justify-center shadow-md">
              <Lock className="w-8 h-8 text-[#FFD700]" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#212121]">
                {isEn ? 'Abarrus Portal Login' : 'የአበሩስ አንድነት ማህበር መግቢያ'}
              </h2>
              <p className="text-xs text-[#757575] mt-1">
                {isEn ? 'Official Portal (Asya Mesud App)' : 'ይፋዊ የአባላት እና የአድሚን መግቢያ'}
              </p>
            </div>
          </div>

          {/* Dual Tabs: Member Login vs Google Sign-In (for Admin) */}
          <div className="grid grid-cols-2 gap-2 mt-5 p-1 bg-[#F5F5F5] rounded-xl border border-[#E0E0E0]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('member');
                setErrorMessage(null);
                setSuccessNotice(null);
              }}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'member'
                  ? 'bg-[#1B5E20] text-white shadow-sm'
                  : 'text-[#757575] hover:text-[#212121]'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{isEn ? 'Member Login' : 'የአባላት መግቢያ'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setErrorMessage(null);
                setSuccessNotice(null);
              }}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'admin'
                  ? 'bg-[#1B5E20] text-white shadow-sm'
                  : 'text-[#757575] hover:text-[#212121]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isEn ? 'Google Sign-In' : 'Google Sign-In (አድሚን)'}</span>
            </button>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
          )}

          {successNotice && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed font-medium">{successNotice}</span>
            </div>
          )}

          {/* TAB 1: MEMBER LOGIN WITH PHONE & DEFAULT 4-DIGIT PASSWORD */}
          {activeTab === 'member' ? (
            <form onSubmit={handleMemberLogin} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#212121] block mb-1.5">
                  {isEn ? 'Phone Number:' : 'ስልክ ቁጥር (Phone Number)፡'}
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder={isEn ? 'e.g. 0912345678' : 'ለምሳሌ፦ 0912345678'}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full text-xs font-mono bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-3 pr-10 text-[#212121] focus:ring-2 focus:ring-[#1B5E20] outline-none"
                  />
                  <Phone className="w-4 h-4 text-[#757575] absolute right-3 top-3.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[#212121]">
                    {isEn ? 'Password (Default: Last 4 digits):' : 'የይለፍ ቃል (ነባሪ፦ የመጨረሻ 4 አሃዞች)፡'}
                  </label>
                  {phoneInput.trim().length >= 4 && (
                    <span className="text-[11px] font-mono text-[#1B5E20] bg-emerald-50 px-2 py-0.5 rounded font-bold">
                      ነባሪ፦ {suggestedDefaultPass}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={
                      isEn
                        ? `Last 4 digits (e.g. ${suggestedDefaultPass})`
                        : `የስልክዎ የመጨረሻ 4 አሃዞች (ለምሳሌ፦ ${suggestedDefaultPass})`
                    }
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full text-xs font-mono bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-3 pr-10 text-[#212121] focus:ring-2 focus:ring-[#1B5E20] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-[#757575] hover:text-[#212121] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-[#757575] mt-1.5 leading-relaxed">
                  {isEn
                    ? '💡 First-time login? The system will automatically create your account using the last 4 digits of your phone number.'
                    : '💡 ለመጀመሪያ ጊዜ ሲገቡ ማህበሩ በስልክዎ የመጨረሻ 4 አሃዞች አካውንትዎን በራስ-ሰር ያዘጋጅልዎታል።'}
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !phoneInput.trim()}
                className="btn-primary w-full py-3 text-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm rounded-xl font-bold"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Authenticating...' : 'እየተረጋገጠ ነው...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isEn ? 'Log In / Register' : 'ግባ / ተመዝገብ'}</span>
                    <ArrowRight className="w-4 h-4 text-[#FFD700]" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* TAB 2: GOOGLE SIGN-IN FOR ADMIN */
            <div className="mt-5 space-y-4">
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  <span>{isEn ? 'Authorized Association Admin Access' : 'የአበሩስ አንድነት ማህበር አስተዳዳሪ መግቢያ'}</span>
                </div>
                <p className="leading-relaxed">
                  {isEn
                    ? 'Sign in using your authorized Google Workspace account (mesudnurga4830@gmail.com) for full administrative privileges.'
                    : 'ሙሉ የአስተዳዳሪ ፍቃድ ለማግኘት በተፈቀደለት የGoogle አካውንት (mesudnurga4830@gmail.com) ይግቡ።'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-neutral-50 text-neutral-800 border-2 border-neutral-300 hover:border-[#1B5E20] rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#1B5E20]" />
                    <span>{isEn ? 'Connecting to Google...' : 'ወደ Google በመገናኘት ላይ...'}</span>
                  </>
                ) : (
                  <>
                    {/* Official Google 'G' icon */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{isEn ? 'Sign In with Google' : 'በGoogle አካውንት ግባ'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Telegram Helper Banner */}
          <div className="mt-6 p-4 bg-[#F5F5F5] rounded-2xl border border-[#E0E0E0] text-xs text-[#757575] space-y-1.5">
            <div className="flex items-center gap-2 text-[#1B5E20] font-bold">
              <Send className="w-4 h-4 text-[#229ED9]" />
              <span>{isEn ? 'Need help or your login link?' : 'እርዳታ ወይም የመግቢያ ሊንክ ይፈልጋሉ?'}</span>
            </div>
            <p className="leading-relaxed">
              {isEn
                ? 'Open our official Telegram bot and send /start. You can also sign in directly using your registered phone number.'
                : 'በቴሌግራም ቦት (/start) የተላከሎትን ሊንክ በቀጥታ በመጫን ወይም የተመዘገበበትን ስልክ ቁጥር በማስገባት በቀላሉ መግባት ይችላሉ።'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

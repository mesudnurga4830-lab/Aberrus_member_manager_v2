/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  GitFork,
  CreditCard,
  AlertTriangle,
  Bot,
  User,
  ShieldCheck,
  Menu,
  X,
  RefreshCw,
  Globe,
  Crown,
  Wrench,
  KeyRound,
  Check,
  LogOut,
} from 'lucide-react';
import { UserRole } from '../types';
import { getLastSavedTimestamp, formatSavedTime, touchSaveTimestamp } from '../utils/storage';
import { isThisDeviceAdminAuthorized } from '../utils/adminAuth';
import { googleSignIn, logoutGoogle, initGoogleAuth } from '../firebase';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  onOpenSettings: () => void;
  onOpenChangePin: () => void;
  onRefreshData?: () => void;
  lang?: 'am' | 'en';
  onToggleLang?: () => void;
  activeMemberName?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  userRole,
  onChangeRole,
  onOpenSettings,
  onOpenChangePin,
  onRefreshData,
  lang = 'am',
  onToggleLang,
  activeMemberName,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isJustRefreshed, setIsJustRefreshed] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  useEffect(() => {
    const unsub = initGoogleAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleGoogleAuth = async () => {
    if (googleUser) {
      if (confirm(`ከGoogle መለያዎ (${googleUser.email}) መውጣት ይፈልጋሉ?`)) {
        await logoutGoogle();
        setGoogleUser(null);
      }
      return;
    }
    setIsGoogleSigningIn(true);
    try {
      const res = await googleSignIn();
      if (res?.user) {
        setGoogleUser(res.user);
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      alert('የGoogle/Gmail መግቢያ አልተሳካም፦ ' + (err?.message || 'Error'));
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const isEn = lang === 'en';

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    if (onRefreshData) {
      await onRefreshData();
    }
    setIsRefreshing(false);
    setIsJustRefreshed(true);
    setTimeout(() => setIsJustRefreshed(false), 2000);
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return isEn ? 'Dashboard Overview' : 'የአስተዳዳሪ ዳሽቦርድ';
      case 'heads':
        return isEn ? 'Family Representatives' : 'የቤተሰብ ወኪሎች';
      case 'members':
        return isEn ? 'Members Directory' : 'የአባላት ማውጫ';
      case 'portal':
        return isEn ? 'Member Portal' : 'የአባል የግል ገጽ';
      case 'leadership':
        return isEn ? 'Leadership Panel' : 'የማህበሩ አመራር ክፍል';
      case 'tree':
        return isEn ? 'Family Tree' : 'የቤተሰብ ዛፍ';
      case 'contributions':
        return isEn ? 'Contributions Manager' : 'የመዋጮዎች አስተዳደር';
      case 'unpaid':
        return isEn ? 'Outstanding Dues' : 'ያልተከፈሉ መዋጮዎች';
      case 'corrections':
        return isEn ? 'Data Corrections' : 'የመረጃ ማስተካከያ';
      case 'automations':
        return isEn ? 'Automations & Telegram' : 'ቴሌግራም አውቶሜሽን';
      default:
        return isEn ? 'Abarrus Unity' : 'የአበሩስ አንድነት ማህበር';
    }
  };

  const navItems = [
    { id: 'dashboard', label: isEn ? 'Dashboard' : 'ዳሽቦርድ', icon: LayoutDashboard },
    { id: 'portal', label: isEn ? 'Portal' : 'የአባል ገጽ', icon: User },
    { id: 'heads', label: isEn ? 'Families' : 'ቤተሰቦች', icon: ShieldCheck },
    { id: 'members', label: isEn ? 'Members' : 'አባላት', icon: Users },
    { id: 'contributions', label: isEn ? 'Payments' : 'ክፍያዎች', icon: CreditCard },
    { id: 'unpaid', label: isEn ? 'Unpaid' : 'ያልተከፈሉ', icon: AlertTriangle },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#1B5E20] text-white border-b-2 border-[#FFD700] shadow-md no-print">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* LEFT: Logo & Association Name */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                if (userRole === 'member') onSelectTab('portal');
                else if (userRole === 'family_head') onSelectTab('heads');
                else onSelectTab('dashboard');
              }}
              className="flex items-center gap-2 text-left hover:opacity-90 transition-opacity"
            >
              <div className="w-10 h-10 rounded-full border-2 border-[#FFD700] overflow-hidden bg-white shrink-0 shadow-sm flex items-center justify-center">
                <img
                  src="/abarrus_logo.jpg"
                  alt="Abarrus Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="hidden sm:block">
                <span className="font-extrabold text-sm sm:text-base leading-tight block text-white tracking-tight">
                  {isEn ? 'Abarrus Unity Association' : 'የአበሩስ አንድነት ማህበር'}
                </span>
                <span className="text-[10px] text-[#FFD700] font-medium block">
                  {isEn ? 'Asya Mesud App' : 'አሲያ መስኡድ አፕ'}
                </span>
              </div>
            </button>
          </div>

          {/* CENTER: Current Page Title (Prominent) */}
          <div className="flex-1 text-center truncate px-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 border border-white/10 backdrop-blur-xs">
              <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-pulse" />
              <h1 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                {getPageTitle()}
              </h1>
            </div>
          </div>

          {/* RIGHT: Google Auth, Language Toggle, Refresh, & User Avatar */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Google / Gmail Sign-In Button */}
            {googleUser ? (
              <button
                onClick={handleGoogleAuth}
                className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title={`በGoogle ገብተዋል (${googleUser.email}) - ለመውጣት ይጫኑ`}
              >
                {googleUser.photoURL ? (
                  <img src={googleUser.photoURL} alt="Avatar" className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-white text-blue-600 font-bold text-[10px] flex items-center justify-center">G</div>
                )}
                <span className="hidden sm:inline font-mono text-[11px] truncate max-w-[100px]">{googleUser.email.split('@')[0]}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              </button>
            ) : (
              <button
                onClick={handleGoogleAuth}
                disabled={isGoogleSigningIn}
                className="px-2.5 py-1 rounded-lg bg-white text-neutral-800 hover:bg-neutral-100 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="በGoogle / Gmail ይግቡ"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="hidden sm:inline">{isGoogleSigningIn ? 'በመግባት ላይ...' : 'Gmail'}</span>
              </button>
            )}

            {/* Language Toggle (አማርኛ / English) */}
            <button
              onClick={onToggleLang}
              className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title={isEn ? 'ወደ አማርኛ ቀይር' : 'Switch to English'}
            >
              <Globe className="w-3.5 h-3.5 text-[#FFD700]" />
              <span className="text-[11px] font-mono">{isEn ? 'አማርኛ' : 'EN'}</span>
            </button>

            {/* Refresh Button */}
            {onRefreshData && (
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title={isEn ? 'Sync live data' : 'መረጃዎችን አድስ'}
              >
                <RefreshCw
                  className={`w-4 h-4 text-[#FFD700] ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </button>
            )}

            {/* User Avatar & Role Badge */}
            <div className="flex items-center gap-2 pl-1 border-l border-white/15">
              <div
                className="w-9 h-9 rounded-full bg-[#FFD700] text-[#1B5E20] font-black flex items-center justify-center text-sm shadow-sm ring-2 ring-white/30"
                title={activeMemberName || (userRole === 'admin' ? 'አስተዳዳሪ' : 'አባል')}
              >
                {activeMemberName ? activeMemberName.charAt(0) : userRole === 'admin' ? 'A' : 'M'}
              </div>
              <div className="hidden lg:block text-left text-xs">
                <span className="font-bold text-white block leading-tight max-w-[120px] truncate">
                  {activeMemberName || (userRole === 'admin' ? 'አስተዳዳሪ' : 'የአበሩስ አባል')}
                </span>
                <span className="text-[10px] text-[#FFD700] font-semibold uppercase tracking-wider block">
                  {userRole === 'admin' ? (isEn ? 'Admin' : 'አስተዳዳሪ') : (isEn ? 'Member' : 'አባል')}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-2.5 py-1.5 rounded-lg bg-red-600/85 hover:bg-red-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ml-1"
                title={isEn ? 'Logout' : 'ውጣ (Logout)'}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isEn ? 'Logout' : 'ውጣ'}</span>
              </button>
            )}

            {/* Desktop Navigation Links for Admin */}
            {userRole === 'admin' && (
              <div className="hidden xl:flex items-center gap-1 ml-2">
                {navItems.map((item) => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      className={`px-2 py-1 text-xs font-semibold rounded-md transition-all ${
                        isActive
                          ? 'bg-[#FFD700] text-[#1B5E20] font-bold'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mobile Menu Toggle for extra admin tabs */}
            {userRole === 'admin' && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Dropdown for Admin */}
        {mobileMenuOpen && userRole === 'admin' && (
          <div className="xl:hidden py-3 px-2 border-t border-white/15 space-y-1 bg-[#144818] rounded-b-xl animate-in fade-in slide-in-from-top-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`p-2 rounded-lg text-left flex items-center gap-2 font-semibold ${
                      isActive
                        ? 'bg-[#FFD700] text-[#1B5E20] font-bold shadow-xs'
                        : 'text-white/90 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

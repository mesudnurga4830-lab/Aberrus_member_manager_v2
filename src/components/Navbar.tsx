/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  GitFork,
  CreditCard,
  ListChecks,
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
  Bell,
  CheckCheck,
  MessageSquareWarning,
  ArrowRight,
  Clock,
  UserCog,
} from 'lucide-react';
import { AppRoleType, ComplaintRecord, PermissionKey, UserRole } from '../types';
import { getRoleDisplayLabel, hasAppPermission } from '../utils/roles';
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
  adminComplaints?: ComplaintRecord[];
  onOpenComplaintNotification?: (complaint: ComplaintRecord) => void;
  onMarkAllComplaintsRead?: (ids: string[]) => void;
  onViewAllComplaints?: () => void;
  appRole?: AppRoleType;
  permissions?: PermissionKey[];
  isMasterAdmin?: boolean;
  allowedTabs?: string[];
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
  adminComplaints = [],
  onOpenComplaintNotification,
  onMarkAllComplaintsRead,
  onViewAllComplaints,
  appRole,
  permissions = [],
  isMasterAdmin = false,
  allowedTabs,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isJustRefreshed, setIsJustRefreshed] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadComplaints = adminComplaints.filter(
    (c) =>
      String(c.status || '').trim().toLowerCase() !== 'resolved' &&
      c.isReadByAdmin !== true
  );
  const openComplaints = adminComplaints.filter(
    (c) => String(c.status || '').trim().toLowerCase() !== 'resolved'
  );
  const notificationItems = (openComplaints.length > 0 ? openComplaints : adminComplaints).slice(0, 8);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

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
      await logoutGoogle();
      setGoogleUser(null);
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
        return isEn ? 'Paid, Partial & Unpaid Lists' : 'የከፈሉ፣ በከፊል እና ያልከፈሉ ስም ዝርዝር';
      case 'corrections':
        return isEn ? 'Data Corrections' : 'የመረጃ ማስተካከያ';
      case 'automations':
        return isEn ? 'Automations & Telegram' : 'ቴሌግራም አውቶሜሽን';
      case 'roles':
        return isEn ? 'Role Management' : 'የሚና እና ፍቃድ አስተዳደር';
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
    { id: 'unpaid', label: isEn ? 'Status Lists' : 'የከፈሉ/ያልከፈሉ', icon: ListChecks },
    { id: 'roles', label: isEn ? 'Roles' : 'ሚናዎች', icon: UserCog },
  ];

  const visibleNavItems = allowedTabs
    ? navItems.filter((item) => allowedTabs.includes(item.id))
    : navItems.filter((item) => item.id !== 'roles' || isMasterAdmin);

  const showNavLinks = userRole === 'admin' || visibleNavItems.length > 1;
  const canSeeComplaintBell =
    userRole === 'admin' &&
    (isMasterAdmin ||
      hasAppPermission(permissions, 'manage_complaints', isMasterAdmin) ||
      hasAppPermission(permissions, 'view_dashboard', isMasterAdmin));

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
                else if (allowedTabs && allowedTabs.length > 0) onSelectTab(allowedTabs[0]);
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

            {/* Admin Complaint Notification Bell */}
            {canSeeComplaintBell && (
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className={`relative p-2 rounded-lg transition-all cursor-pointer ${
                    notificationsOpen
                      ? 'bg-[#FFD700] text-[#1B5E20]'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={
                    isEn
                      ? 'Member Complaint Notifications'
                      : 'የአባላት ቅሬታ ማሳወቂያዎች'
                  }
                  aria-label="Admin Complaint Notifications"
                >
                  <Bell
                    className={`w-4 h-4 ${
                      notificationsOpen ? 'text-[#1B5E20]' : 'text-[#FFD700]'
                    } ${unreadComplaints.length > 0 && !notificationsOpen ? 'animate-bounce' : ''}`}
                  />
                  {unreadComplaints.length > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm ring-2 ring-[#1B5E20]">
                      {unreadComplaints.length > 9 ? '9+' : unreadComplaints.length}
                    </span>
                  ) : openComplaints.length > 0 ? (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-[#1B5E20]" />
                  ) : null}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-neutral-900 rounded-2xl shadow-2xl border border-emerald-900/20 overflow-hidden z-50">
                    <div className="px-4 py-3 bg-emerald-950 text-white flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MessageSquareWarning className="w-4 h-4 text-[#FFD700] shrink-0" />
                        <div>
                          <p className="text-xs font-extrabold leading-tight">
                            {isEn ? 'Complaint Alerts' : 'የአባላት ቅሬታ ማሳወቂያ'}
                          </p>
                          <p className="text-[10px] text-emerald-200">
                            {unreadComplaints.length > 0
                              ? `${unreadComplaints.length} ያልተነበበ አዲስ ቅሬታ`
                              : openComplaints.length > 0
                              ? `${openComplaints.length} መልስ የሚጠብቅ ቅሬታ`
                              : 'ሁሉም ቅሬታዎች ተነበዋል'}
                          </p>
                        </div>
                      </div>
                      {unreadComplaints.length > 0 && onMarkAllComplaintsRead && (
                        <button
                          type="button"
                          onClick={() =>
                            onMarkAllComplaintsRead(unreadComplaints.map((c) => c.id))
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-[10px] font-bold text-[#FFD700] cursor-pointer transition-colors"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>ሁሉንም አንብብ</span>
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
                      {notificationItems.length === 0 ? (
                        <div className="p-6 text-center text-xs text-neutral-400">
                          {isEn ? 'No complaints yet.' : 'እስካሁን የደረሰ ቅሬታ የለም።'}
                        </div>
                      ) : (
                        notificationItems.map((comp) => {
                          const isResolved =
                            String(comp.status || '').trim().toLowerCase() === 'resolved';
                          const isUnread = !isResolved && comp.isReadByAdmin !== true;
                          const sender = comp.firstName || comp.memberName || 'አባል';
                          return (
                            <button
                              key={comp.id}
                              type="button"
                              onClick={() => {
                                setNotificationsOpen(false);
                                onOpenComplaintNotification?.(comp);
                              }}
                              className={`w-full text-left px-4 py-3 hover:bg-emerald-50/70 transition-colors cursor-pointer flex items-start gap-2.5 ${
                                isUnread ? 'bg-amber-50/60' : 'bg-white'
                              }`}
                            >
                              <div
                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                  isUnread
                                    ? 'bg-rose-600'
                                    : isResolved
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-400'
                                }`}
                              />
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-neutral-900 truncate">
                                    {sender}
                                    {comp.memberId ? ` (${comp.memberId})` : ''}
                                  </span>
                                  {isUnread ? (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-extrabold shrink-0">
                                      አዲስ
                                    </span>
                                  ) : (
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                        isResolved
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {isResolved ? 'ተመልሷል' : 'Open'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-neutral-600 line-clamp-2 leading-snug">
                                  {comp.complaintText}
                                </p>
                                <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>
                                    {comp.createdAt
                                      ? new Date(comp.createdAt).toLocaleString('am-ET')
                                      : ''}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="p-2.5 bg-neutral-50 border-t border-neutral-100">
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationsOpen(false);
                          onViewAllComplaints?.();
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-[#1B5E20] hover:bg-[#144818] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span>
                          {isEn ? 'Open Complaints Panel' : 'ሁሉንም ቅሬታዎች በዳሽቦርድ እይ'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#FFD700]" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  {getRoleDisplayLabel(
                    appRole || (isMasterAdmin ? 'super_admin' : userRole === 'admin' ? 'co_admin' : userRole === 'family_head' ? 'family_head' : 'member'),
                    lang
                  )}
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

            {/* Desktop Navigation Links */}
            {showNavLinks && (
              <div className="hidden xl:flex items-center gap-1 ml-2">
                {visibleNavItems.map((item) => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      className={`px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
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

            {/* Mobile Menu Toggle for extra tabs */}
            {showNavLinks && (
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

        {/* Mobile Dropdown */}
        {mobileMenuOpen && showNavLinks && (
          <div className="xl:hidden py-3 px-2 border-t border-white/15 space-y-1 bg-[#144818] rounded-b-xl animate-in fade-in slide-in-from-top-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
              {visibleNavItems.map((item) => {
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

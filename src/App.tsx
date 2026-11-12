/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  getMembers,
  getFamilies,
  getContributions,
  getSettings,
  addMember,
  updateMember,
  deleteMember,
  addContribution,
  addContributionsBatch,
  updateContribution,
  deleteContribution,
  saveSettings,
  resetAllData,
  updateFamily,
  syncWithBackendServer,
  refreshAllDataFromServer,
} from './utils/storage';
import { Member, Family, Contribution, SettingsRates, ContributionStatus, UserRole } from './types';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { MembersList } from './components/MembersList';
import { FamilyTreeView } from './components/FamilyTreeView';
import { ContributionsManager } from './components/ContributionsManager';
import { UnpaidReport } from './components/UnpaidReport';
import { AutomationsPanel } from './components/AutomationsPanel';
import { MemberPortal } from './components/MemberPortal';
import { FamilyHeadPortal } from './components/FamilyHeadPortal';
import { MemberLoginView } from './components/MemberLoginView';
import { BottomNav } from './components/BottomNav';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { AddMemberModal } from './components/AddMemberModal';
import { QRCodeModal } from './components/QRCodeModal';
import { PrintReportModal } from './components/PrintReportModal';
import { SettingsModal } from './components/SettingsModal';
import { ChangeAdminPinModal } from './components/ChangeAdminPinModal';
import { LeadershipView } from './components/LeadershipView';
import { DataCorrectionView } from './components/DataCorrectionView';
import { TelegramDispatchModal } from './components/TelegramDispatchModal';
import { BulkImportModal } from './components/BulkImportModal';
import { AdminMemberPaymentManagerModal } from './components/AdminMemberPaymentManagerModal';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';
import { getCurrentEthiopianDate, getEthiopianMonthName } from './utils/ethiopianCalendar';
import {
  auth,
  onAuthStateChanged,
  signOut,
  getMemberByAuthUidOrPhone,
  getMemberByPhone,
  normalizePhoneNumber,
  getMemberByLoginToken,
  getMembersFromFirestore,
  getFamiliesFromFirestore,
  getContributionsFromFirestore,
  getSettingsFromFirestore,
  saveContributionToFirestore,
  deleteContributionFromFirestore,
  saveMemberToFirestore,
  deleteMemberFromFirestore,
  subscribeToAllContributions,
} from './firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  Monitor,
  Download,
  X,
  LayoutDashboard,
  ShieldCheck,
  Users,
  CreditCard,
  User,
  Sparkles,
  Lock,
} from 'lucide-react';

import { isThisDeviceAdminAuthorized, MASTER_ADMIN, verifyAndAuthorizeDevice } from './utils/adminAuth';
import { AdminAuthModal } from './components/AdminAuthModal';

export default function App() {
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [families, setFamilies] = useState<Family[]>(getFamilies());
  const [contributions, setContributions] = useState<Contribution[]>(getContributions());
  const [settings, setSettings] = useState<SettingsRates>(getSettings());
  const [lang, setLang] = useState<'am' | 'en'>('am');
  const [authFirebaseUser, setAuthFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoginPage, setIsLoginPage] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<UserRole>('member');
  const [currentTab, setCurrentTab] = useState<string>('portal');
  const [selectedPortalMemberId, setSelectedPortalMemberId] = useState<string>('');
  
  // Persisted family head selection so it never resets unexpectedly to FA001
  const [selectedHeadFamilyId, setSelectedHeadFamilyId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('abarrus_active_head_family_id');
      if (saved && families.some((f) => f.id.toUpperCase() === saved.toUpperCase())) {
        return saved;
      }
    } catch {}
    return families[0]?.id || 'FA001';
  });

  const [addMemberInitialFamilyId, setAddMemberInitialFamilyId] = useState<string | undefined>(undefined);

  // Modals state
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [recordPaymentMemberId, setRecordPaymentMemberId] = useState<string | undefined>(undefined);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintReportOpen, setIsPrintReportOpen] = useState(false);
  const [activeQRMember, setActiveQRMember] = useState<Member | null>(null);
  const [isPaymentManagerOpen, setIsPaymentManagerOpen] = useState(false);
  const [paymentManagerMemberId, setPaymentManagerMemberId] = useState<string | undefined>(undefined);
  const [paymentManagerMode, setPaymentManagerMode] = useState<'list' | 'add'>('list');

  const handleOpenPaymentManager = (memberId?: string, mode: 'list' | 'add' = 'list') => {
    setPaymentManagerMemberId(memberId);
    setPaymentManagerMode(mode);
    setIsPaymentManagerOpen(true);
  };

  // Desktop Shortcut Prompt state
  const [showDesktopPrompt, setShowDesktopPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Telegram Dispatch Modal state (with phone number option for admin)
  const [telegramDispatchPayload, setTelegramDispatchPayload] = useState<{
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  } | null>(null);

  // Firebase Auth state listener to protect routes, maintain persistent login, and map member
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] onAuthStateChanged fired:', firebaseUser ? firebaseUser.email : 'null');
      if (firebaseUser) {
        setAuthFirebaseUser(firebaseUser);
        const email = (firebaseUser.email || '').toLowerCase();
        const isMasterAdminEmail = email === 'mesudnurga4830@gmail.com';

        if (isMasterAdminEmail) {
          setUserRole('admin');
          setCurrentTab('dashboard');
          setIsLoginPage(false);
          setIsAuthChecking(false);
          return;
        }

        // Member Login: dummy email is <phone>@abarrus.local
        let phone = '';
        if (email.endsWith('@abarrus.local')) {
          phone = email.replace('@abarrus.local', '');
        }

        try {
          const matchedMem = await getMemberByAuthUidOrPhone(firebaseUser.uid, phone);
          if (matchedMem) {
            // Keep existing valid phone number on member if present, or fill if empty
            let shouldSave = false;
            if (!matchedMem.phone && phone) {
              matchedMem.phone = normalizePhoneNumber(phone);
              (matchedMem as any).phoneNumber = matchedMem.phone;
              shouldSave = true;
            }
            if (!matchedMem.authUid || matchedMem.authUid !== firebaseUser.uid) {
              matchedMem.authUid = firebaseUser.uid;
              shouldSave = true;
            }
            if (shouldSave) {
              await saveMemberToFirestore(matchedMem);
            }

            setSelectedPortalMemberId(matchedMem.id);
            setSelectedHeadFamilyId(matchedMem.familyId || 'FA001');
            setUserRole('member');
            setCurrentTab('portal');
            setIsLoginPage(false);

            // Ensure member document is in local members state
            setMembers((prev) => {
              const idx = prev.findIndex((m) => m.id === matchedMem.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...matchedMem };
                return copy;
              }
              return [matchedMem, ...prev];
            });
          } else {
            console.warn('[Auth] No member record found in Firestore for:', phone, firebaseUser.uid);
            setSelectedPortalMemberId('');
            setIsLoginPage(true);
          }
        } catch (fetchErr) {
          console.error('[Auth] Error fetching member after Firebase auth:', fetchErr);
          setSelectedPortalMemberId('');
          setIsLoginPage(true);
        }
      } else {
        // No active Firebase Auth session - strictly protect routes
        setAuthFirebaseUser(null);
        setSelectedPortalMemberId('');
        setUserRole('member');
        setIsLoginPage(true);
      }
      setIsAuthChecking(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out notice:', err);
    }
    setAuthFirebaseUser(null);
    setSelectedPortalMemberId('');
    try {
      localStorage.removeItem('abarrus_active_member_id');
      localStorage.removeItem('abarrus_admin_authorized');
      localStorage.removeItem('abarrus_admin_device_authorized_v6_locked');
    } catch {}
    setIsLoginPage(true);
  };

  const handleRefreshData = async () => {
    await refreshAllDataFromServer();
    setMembers(getMembers());
    setFamilies(getFamilies());
    setContributions(getContributions());
    setSettings(getSettings());
  };

  const currentDate = getCurrentEthiopianDate();

  // Listen for storage events, real-time Firestore sync, and PWA install prompt
  useEffect(() => {
    // 1. Initial live fetch from Firestore
    getMembersFromFirestore().then((live) => {
      if (live && live.length > 0) setMembers(live);
    });
    getFamiliesFromFirestore().then((live) => {
      if (live && live.length > 0) setFamilies(live);
    });
    getContributionsFromFirestore().then((live) => {
      if (live && live.length > 0) setContributions(live);
    });
    getSettingsFromFirestore().then((live) => {
      if (live) setSettings(live);
    });

    // 2. Real-time global subscription monitoring the 'contributions' collection in Firestore
    const unsubscribeContribs = subscribeToAllContributions(
      (live) => {
        if (Array.isArray(live)) {
          setContributions(live);
          try {
            localStorage.setItem('abarrus_contributions_v6', JSON.stringify(live));
          } catch {}
        }
      },
      (err) => {
        console.warn('[App Global Subscription Error]:', err);
      }
    );

    // Initial sync with backend server
    syncWithBackendServer();

    const handleSync = () => {
      setMembers(getMembers());
      setFamilies(getFamilies());
      setContributions(getContributions());
      setSettings(getSettings());
    };

    window.addEventListener('abarrus_data_synced', handleSync);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowDesktopPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      unsubscribeContribs();
      window.removeEventListener('abarrus_data_synced', handleSync);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Parse deep-link query and hash params on mount (when opened via Telegram link on mobile)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?')
        ? window.location.hash.substring(window.location.hash.indexOf('?'))
        : '';
      const hashParams = new URLSearchParams(hashQuery);

      const tokenParam = searchParams.get('token') || hashParams.get('token');
      const roleParam = searchParams.get('role') || hashParams.get('role');
      const familyIdParam = searchParams.get('familyId') || hashParams.get('familyId');
      const memberIdParam = searchParams.get('memberId') || hashParams.get('memberId');
      const tabParam = searchParams.get('tab') || hashParams.get('tab');
      const secretAdminUnlock = searchParams.get('adminAuth') || hashParams.get('adminAuth') || searchParams.get('authPin');

      // Secret one-time authorization for Mesud Nurga's device via link
      if (secretAdminUnlock) {
        verifyAndAuthorizeDevice(secretAdminUnlock);
      }

      if (window.location.pathname.startsWith('/login')) {
        setIsLoginPage(true);
        return;
      }

      if (familyIdParam) {
        const cleanFamId = decodeURIComponent(familyIdParam).trim().toUpperCase();
        const matchFam = families.find((f) => f.id.toUpperCase() === cleanFamId);
        if (matchFam) {
          setSelectedHeadFamilyId(matchFam.id);
          localStorage.setItem('abarrus_active_head_family_id', matchFam.id);
        }
      }
    } catch {}
  }, [families, members]);

  const handleInstallShortcut = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowDesktopPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      alert('የአበሩስ አባል ማኔጀርን በዴስክቶፕ ለመጫን፦ በብሮውዘርዎ የላይኛው ምናሌ "Install App" ወይም "Add to Home Screen" ይጫኑ።');
    }
  };

  const handleChangeRole = (role: UserRole) => {
    if (role === 'admin' && !isThisDeviceAdminAuthorized()) {
      // Strictly disabled outside this device: do nothing, do not open modal
      return;
    }
    setUserRole(role);
    if (role === 'admin') {
      setCurrentTab('dashboard');
    } else if (role === 'family_head') {
      setCurrentTab('heads');
    } else if (role === 'member') {
      setCurrentTab('portal');
    }
  };

  const handleOpenRecordPaymentForMember = (memberId: string) => {
    setRecordPaymentMemberId(memberId);
    setIsRecordPaymentOpen(true);
  };

  const handleSavePayment = async (conData: Omit<Contribution, 'id'>) => {
    const newCon = addContribution(conData);
    setContributions(getContributions());
    await saveContributionToFirestore(newCon);
  };

  const handleSavePaymentsBatch = async (conList: Omit<Contribution, 'id'>[]) => {
    const newCons = addContributionsBatch(conList);
    setContributions(getContributions());
    for (const c of newCons) {
      await saveContributionToFirestore(c);
    }
  };

  const handleDeleteContribution = async (id: string) => {
    deleteContribution(id);
    setContributions(getContributions());
    try {
      await deleteContributionFromFirestore(id);
    } catch (err) {
      console.warn('[Firestore] Error deleting contribution from Firestore:', err);
    }
    setContributions(getContributions());
  };

  const handleDeleteMember = async (id: string) => {
    deleteMember(id);
    setMembers(getMembers());
    setFamilies(getFamilies());
    setContributions(getContributions());
    try {
      await deleteMemberFromFirestore(id);
    } catch (err) {
      console.warn('[Firestore] Error deleting member from Firestore:', err);
    }
  };

  const handleSaveMember = async (memberData: Omit<Member, 'id'>) => {
    const rawPhone = memberData.phone || (memberData as any).phoneNumber || '';
    const cleanPhone = rawPhone ? normalizePhoneNumber(String(rawPhone)) : '';
    const finalPhone = cleanPhone || String(rawPhone).trim();
    const cleanData = {
      ...memberData,
      phone: finalPhone,
      phoneNumber: finalPhone,
    };
    const newMember = addMember(cleanData);
    setMembers(getMembers());
    setFamilies(getFamilies());
    try {
      await saveMemberToFirestore(newMember);
    } catch (err) {
      console.warn('[Firestore] Error saving member to Firestore:', err);
    }
  };

  const handleUpdateContributionStatus = async (id: string, status: ContributionStatus) => {
    const updated = updateContribution(id, { status });
    setContributions(getContributions());
    if (updated) {
      await saveContributionToFirestore(updated);
    }
  };

  const handleUpdateFamilyContact = (familyId: string, phone: string, telegram: string) => {
    updateFamily(familyId, { phone, telegram });
    setFamilies(getFamilies());
    setMembers(getMembers());
  };

  const handleToggleMonthlyStatus = async (
    memberId: string,
    month: number,
    year: number,
    markPaid: boolean
  ) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const rate = settings.monthlyRate[member.generation] || 50;

    const existingCon = contributions.find(
      (c) =>
        c.memberId === memberId &&
        c.type === 'ወርሃዊ' &&
        c.ethiopianMonth === month &&
        c.ethiopianYear === year
    );

    if (markPaid) {
      if (existingCon) {
        const updated = updateContribution(existingCon.id, {
          status: 'ተከፍሏል',
          paidAmount: rate,
          amount: rate,
          datePaid: `${currentDate.formatted}`,
          notes: 'በአስተዳዳሪው (መስኡድ ኑርጋ) የተመዘገበ ክፍያ',
        });
        setContributions(getContributions());
        if (updated) {
          await saveContributionToFirestore(updated);
        }
      } else {
        const newCon = addContribution({
          memberId: member.id,
          memberName: member.fullName,
          familyId: member.familyId,
          familyName: member.familyName,
          generation: member.generation,
          type: 'ወርሃዊ',
          ethiopianMonth: month,
          ethiopianMonthName: getEthiopianMonthName(month),
          ethiopianYear: year,
          amount: rate,
          paidAmount: rate,
          status: 'ተከፍሏል',
          paymentMethod: 'ጥሬ ገንዘብ (Cash)',
          datePaid: `${currentDate.formatted}`,
          notes: 'በአስተዳዳሪው (መስኡድ ኑርጋ) የተመዘገበ ክፍያ',
        });
        setContributions(getContributions());
        await saveContributionToFirestore(newCon);
      }
    } else {
      if (existingCon) {
        deleteContribution(existingCon.id);
        setContributions(getContributions());
        await deleteContributionFromFirestore(existingCon.id);
      }
    }
  };

  const handleToggleGenStatus = async (memberId: string, markPaid: boolean) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const genRate = settings.generationPayment[member.generation] || 500;

    const existingCon = contributions.find(
      (c) => c.memberId === memberId && c.type === 'ትውልድ'
    );

    if (markPaid) {
      if (existingCon) {
        const updated = updateContribution(existingCon.id, {
          status: 'ተከፍሏል',
          paidAmount: genRate,
          amount: genRate,
          datePaid: `${currentDate.formatted}`,
          notes: 'በአስተዳዳሪው (መስኡድ ኑርጋ) የተመዘገበ የትውልድ ክፍያ',
        });
        setContributions(getContributions());
        if (updated) {
          await saveContributionToFirestore(updated);
        }
      } else {
        const newCon = addContribution({
          memberId: member.id,
          memberName: member.fullName,
          familyId: member.familyId,
          familyName: member.familyName,
          generation: member.generation,
          type: 'ትውልድ',
          ethiopianMonth: 1, // Hamle
          ethiopianMonthName: 'ሀምሌ',
          ethiopianYear: 2018,
          amount: genRate,
          paidAmount: genRate,
          status: 'ተከፍሏል',
          paymentMethod: 'ጥሬ ገንዘብ (Cash)',
          datePaid: `${currentDate.formatted}`,
          notes: 'በአስተዳዳሪው (መስኡድ ኑርጋ) የተመዘገበ የትውልድ መዋጮ',
        });
        setContributions(getContributions());
        await saveContributionToFirestore(newCon);
      }
    } else {
      if (existingCon) {
        deleteContribution(existingCon.id);
        setContributions(getContributions());
        await deleteContributionFromFirestore(existingCon.id);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100/70 text-neutral-900 font-sans selection:bg-emerald-800 selection:text-amber-200">
      {/* Top Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'login') {
            setIsLoginPage(true);
            return;
          }
          if (!authFirebaseUser && !isThisDeviceAdminAuthorized()) {
            setIsLoginPage(true);
            return;
          }
          if (userRole !== 'admin') {
            if (userRole === 'family_head') {
              setCurrentTab('heads');
            } else if (userRole === 'member') {
              setCurrentTab('portal');
            }
            return;
          }
          setCurrentTab(tab);
          setIsLoginPage(false);
        }}
        userRole={userRole}
        onChangeRole={handleChangeRole}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenChangePin={() => setIsChangePinOpen(true)}
        onRefreshData={handleRefreshData}
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'am' ? 'en' : 'am'))}
        activeMemberName={members.find((m) => m.id === selectedPortalMemberId)?.fullName}
        onLogout={handleLogout}
      />

      {/* Desktop / Mobile Shortcut Notification Banner */}
      {showDesktopPrompt && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-emerald-950 px-4 py-2 text-xs font-semibold shadow-xs flex items-center justify-between no-print">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <Monitor className="w-4 h-4 text-emerald-950 shrink-0" />
            <span>
              የአበሩስ አባል ማኔጀርን በኮምፒውተርዎ ወይም በስልክዎ ዴስክቶፕ ላይ እንደ አፕሊኬሽን ይጫኑ (Desktop Shortcut)!
            </span>
            <button
              onClick={handleInstallShortcut}
              className="ml-2 px-3 py-1 bg-emerald-950 text-amber-300 rounded-lg hover:bg-emerald-900 font-bold transition-colors inline-flex items-center gap-1 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ጫን (Install)</span>
            </button>
          </div>
          <button
            onClick={() => setShowDesktopPrompt(false)}
            className="p-1 text-emerald-950 hover:bg-amber-600/20 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 xl:pb-8">
        {isAuthChecking ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#1B5E20] border-t-[#FFD700] rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-[#1B5E20]">
              {lang === 'en' ? 'Verifying authentication...' : 'የመለያ ማረጋገጫ በመፈተሽ ላይ...'}
            </p>
          </div>
        ) : !authFirebaseUser || isLoginPage ? (
          <MemberLoginView
            lang={lang}
            onLoginSuccess={(m) => {
              setMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
              setSelectedPortalMemberId(m.id);
              setSelectedHeadFamilyId(m.familyId || 'FA001');
              setUserRole('member');
              setCurrentTab('portal');
              setIsLoginPage(false);
            }}
            onAdminGoogleLoginSuccess={(user) => {
              setUserRole('admin');
              setCurrentTab('dashboard');
              setIsLoginPage(false);
              try {
                localStorage.setItem('abarrus_admin_authorized', 'true');
                localStorage.setItem('abarrus_admin_auth_timestamp', Date.now().toString());
              } catch {}
            }}
          />
        ) : userRole === 'member' || currentTab === 'portal' ? (
          <MemberPortal
            members={members}
            families={families}
            contributions={contributions}
            settings={settings}
            currentMemberId={selectedPortalMemberId}
            userRole={userRole}
            lang={lang}
            onNavigateToLogin={() => setIsLoginPage(true)}
            onLogout={handleLogout}
            onSelectMember={(id) => setSelectedPortalMemberId(id)}
            onSubmitPaymentClaim={async (claimData) => {
              const {
                memberId,
                month,
                amount,
                method,
                ref,
                type,
                slipPhoto,
                payerId,
                payerName,
                beneficiaryId,
                beneficiaryName,
                isProxyPayment,
                status,
              } = claimData;

              const targetMemberId = beneficiaryId || memberId;
              const mem = members.find((m) => m.id === targetMemberId);
              const isGen = type === 'ትውልድ';
              const effectiveStatus: ContributionStatus = status || (isProxyPayment ? 'Pending' : 'ተከፍሏል');

              const newCon: Contribution = {
                id: `CON-${Date.now()}`,
                memberId: targetMemberId,
                memberName: beneficiaryName || mem?.fullName || 'አባል',
                familyId: mem?.familyId || 'FA001',
                familyName: mem?.familyName || 'የአበሩስ ቤተሰብ',
                generation: mem?.generation || 4,
                type: isGen ? 'ትውልድ' : 'ወርሃዊ',
                ethiopianMonth: isGen ? 0 : month,
                ethiopianMonthName: isGen ? 'የትውልድ መዋጮ' : getEthiopianMonthName(month),
                ethiopianYear: currentDate.year || 2018,
                amount,
                paidAmount: amount,
                status: effectiveStatus,
                paymentMethod: method as any,
                transactionRef: ref,
                datePaid: `${currentDate.formatted}`,
                notes: isProxyPayment
                  ? `ተኪ ክፍያ፡ በ${payerName || payerId} ለ${beneficiaryName || mem?.fullName} የተከፈለ (Pending Admin Approval)`
                  : slipPhoto
                  ? 'ደረሰኝ ፎቶ ተያይዟል (በአባል በኩል የቀረበ)'
                  : 'በአባል በኩል የቀረበ የክፍያ ማረጋገጫ',
                payerId,
                payerName,
                beneficiaryId: targetMemberId,
                beneficiaryName: beneficiaryName || mem?.fullName,
                isProxyPayment,
                slipPhoto,
              };

              addContribution(newCon);
              setContributions(getContributions());
              await saveContributionToFirestore(newCon);
            }}
          />
        ) : userRole === 'family_head' || currentTab === 'heads' ? (
          <FamilyHeadPortal
            families={families}
            members={members}
            contributions={contributions}
            settings={settings}
            selectedFamilyId={selectedHeadFamilyId}
            userRole={userRole}
            onSelectFamily={(id) => {
              setSelectedHeadFamilyId(id);
              localStorage.setItem('abarrus_active_head_family_id', id);
            }}
            onUpdateFamilyContact={handleUpdateFamilyContact}
            onRecordPayment={(memberId) => handleOpenRecordPaymentForMember(memberId)}
            onOpenAddMember={(familyId) => {
              setAddMemberInitialFamilyId(familyId);
              setIsAddMemberOpen(true);
            }}
            onDispatchTelegram={(payload) => setTelegramDispatchPayload(payload)}
          />
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardOverview
                members={members}
                families={families}
                contributions={contributions}
                settings={settings}
                onOpenRecordPayment={() => {
                  setRecordPaymentMemberId(undefined);
                  setIsRecordPaymentOpen(true);
                }}
                onOpenPaymentManager={handleOpenPaymentManager}
                onOpenAddMember={() => setIsAddMemberOpen(true)}
                onOpenBulkImport={() => setIsBulkImportOpen(true)}
                onOpenPrintReport={() => setIsPrintReportOpen(true)}
                onNavigateTab={(tab) => {
                  if (tab === 'heads') {
                    setUserRole('family_head');
                  }
                  setCurrentTab(tab);
                }}
                onOpenQR={(m) => setActiveQRMember(m)}
                onOpenChangePin={() => setIsChangePinOpen(true)}
                onNavigateToMember={(memId) => {
                  const targetMember = members.find((m) => m.id === memId);
                  if (targetMember) {
                    setSelectedPortalMemberId(targetMember.id);
                    setSelectedHeadFamilyId(targetMember.familyId);
                    setCurrentTab('portal');
                  }
                }}
                onNavigateToFamily={(famId) => {
                  setSelectedHeadFamilyId(famId);
                  setUserRole('family_head');
                  setCurrentTab('heads');
                }}
              />
            )}

            {currentTab === 'members' && (
              <MembersList
                members={members}
                families={families}
                contributions={contributions}
                settings={settings}
                onOpenAddMember={() => setIsAddMemberOpen(true)}
                onOpenBulkImport={() => setIsBulkImportOpen(true)}
                onOpenQR={(m) => setActiveQRMember(m)}
                onRecordPayment={(id) => handleOpenRecordPaymentForMember(id)}
                onOpenPaymentManager={handleOpenPaymentManager}
                onDeleteMember={handleDeleteMember}
                onUpdateMember={async (id, updates) => {
                  const rawPhone = updates.phone || (updates as any).phoneNumber;
                  if (rawPhone) {
                    const cleanPhone = normalizePhoneNumber(rawPhone);
                    updates.phone = cleanPhone;
                    (updates as any).phoneNumber = cleanPhone;
                  }
                  const updated = updateMember(id, updates);
                  setMembers(getMembers());
                  setFamilies(getFamilies());
                  setContributions(getContributions());
                  if (updated) {
                    try {
                      await saveMemberToFirestore(updated);
                    } catch (err) {
                      console.warn('[Firestore] Error saving updated member:', err);
                    }
                  }
                }}
                onToggleMonthlyStatus={handleToggleMonthlyStatus}
                onToggleGenStatus={handleToggleGenStatus}
                onDispatchTelegram={(payload) => setTelegramDispatchPayload(payload)}
              />
            )}

            {currentTab === 'tree' && (
              <FamilyTreeView
                families={families}
                members={members}
                contributions={contributions}
                settings={settings}
                onOpenQR={(m) => setActiveQRMember(m)}
                onRecordPayment={(id) => handleOpenRecordPaymentForMember(id)}
                onOpenPaymentManager={handleOpenPaymentManager}
              />
            )}

            {currentTab === 'contributions' && (
              <ContributionsManager
                contributions={contributions}
                members={members}
                families={families}
                settings={settings}
                onOpenRecordPayment={() => {
                  setRecordPaymentMemberId(undefined);
                  setIsRecordPaymentOpen(true);
                }}
                onOpenPaymentManager={handleOpenPaymentManager}
                onUpdateStatus={handleUpdateContributionStatus}
                onDeleteContribution={handleDeleteContribution}
                onOpenPrintReport={() => setIsPrintReportOpen(true)}
              />
            )}

            {currentTab === 'unpaid' && (
              <UnpaidReport
                members={members}
                families={families}
                contributions={contributions}
                settings={settings}
                onRecordPayment={(id) => handleOpenRecordPaymentForMember(id)}
                onOpenPaymentManager={handleOpenPaymentManager}
              />
            )}

            {currentTab === 'leadership' && (
              <LeadershipView
                settings={settings}
                members={members}
                families={families}
                contributions={contributions}
                onUpdateSettings={(s) => {
                  saveSettings(s);
                  setSettings(getSettings());
                }}
                onOpenRecordPayment={(id) => {
                  if (id) {
                    handleOpenRecordPaymentForMember(id);
                  } else {
                    setRecordPaymentMemberId(undefined);
                    setIsRecordPaymentOpen(true);
                  }
                }}
                onOpenQR={(m) => setActiveQRMember(m)}
                onNavigateToMember={(memId) => {
                  const targetMember = members.find((m) => m.id === memId);
                  if (targetMember) {
                    setSelectedPortalMemberId(targetMember.id);
                    setSelectedHeadFamilyId(targetMember.familyId);
                    setCurrentTab('portal');
                  }
                }}
                onDispatchTelegram={(payload) => setTelegramDispatchPayload(payload)}
              />
            )}

            {currentTab === 'corrections' && (
              <DataCorrectionView
                contributions={contributions}
                members={members}
                families={families}
                settings={settings}
                onRefreshData={handleRefreshData}
              />
            )}

            {currentTab === 'automations' && (
              <AutomationsPanel
                families={families}
                members={members}
                contributions={contributions}
                settings={settings}
                onUpdateSettings={(s) => saveSettings(s)}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200/80 py-6 text-xs text-neutral-500 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/abarrus_logo.jpg"
              alt="Abarrus Logo"
              className="w-7 h-7 rounded-full object-cover ring-1 ring-amber-400"
            />
            <span>
              የአበሩስ አባል ማኔጀር( አስያ መስኡድ ) · {currentDate.formatted}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>ጠቅላላ ቤተሰቦች፡ {families.length}</span>
            <span>·</span>
            <span>አባላት፡ {members.length}</span>
            <span>·</span>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-emerald-800 hover:text-emerald-950 font-semibold underline"
            >
              ተመን ማስተካከያ (Settings)
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (4 icons: Home, Payments, Receipts, Profile) */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'heads') setUserRole('family_head');
          else if (tab === 'portal') setUserRole('member');
          else if (tab === 'dashboard' && isThisDeviceAdminAuthorized()) setUserRole('admin');
          setCurrentTab(tab);
          setIsLoginPage(false);
        }}
        userRole={userRole}
        lang={lang}
      />

      {/* MODALS */}
      {isRecordPaymentOpen && (
        <RecordPaymentModal
          members={members}
          settings={settings}
          initialMemberId={recordPaymentMemberId}
          onSave={handleSavePayment}
          onSaveBatch={handleSavePaymentsBatch}
          onClose={() => {
            setIsRecordPaymentOpen(false);
            setRecordPaymentMemberId(undefined);
          }}
        />
      )}

      {isAddMemberOpen && (
        <AddMemberModal
          families={families}
          settings={settings}
          initialFamilyId={addMemberInitialFamilyId}
          lockFamily={userRole === 'family_head'}
          onSave={handleSaveMember}
          onClose={() => {
            setIsAddMemberOpen(false);
            setAddMemberInitialFamilyId(undefined);
          }}
        />
      )}

      {isBulkImportOpen && userRole === 'admin' && (
        <BulkImportModal
          userRole={userRole}
          adminEmail={authFirebaseUser?.email || undefined}
          onClose={() => setIsBulkImportOpen(false)}
          onImportSuccess={async () => {
            const live = await getMembersFromFirestore();
            if (live && live.length > 0) {
              setMembers(live);
            } else {
              setMembers(getMembers());
            }
          }}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          members={members}
          onSave={(s) => saveSettings(s)}
          onReset={() => resetAllData()}
          onClose={() => setIsSettingsOpen(false)}
          onOpenChangePin={() => setIsChangePinOpen(true)}
        />
      )}

      {isPrintReportOpen && (
        <PrintReportModal
          contributions={contributions}
          members={members}
          families={families}
          settings={settings}
          selectedMonth={currentDate.month}
          selectedYear={currentDate.year}
          onClose={() => setIsPrintReportOpen(false)}
        />
      )}

      {/* Admin Member Payment Manager Modal (Strict Ledger Management: View, Delete & Add) */}
      {isPaymentManagerOpen && (
        <AdminMemberPaymentManagerModal
          isOpen={isPaymentManagerOpen}
          onClose={() => setIsPaymentManagerOpen(false)}
          members={members}
          families={families}
          contributions={contributions}
          settings={settings}
          initialMemberId={paymentManagerMemberId}
          initialMode={paymentManagerMode}
          onDeletePayment={async (contributionId: string) => {
            await handleDeleteContribution(contributionId);
          }}
          onAddManualPayment={async (payment: Omit<Contribution, 'id'>) => {
            await handleSavePayment(payment);
          }}
        />
      )}

      {activeQRMember && (
        <QRCodeModal
          member={activeQRMember}
          onClose={() => setActiveQRMember(null)}
        />
      )}

      {/* Admin Device Authorization Security Modal */}
      {isAdminAuthOpen && (
        <AdminAuthModal
          isOpen={true}
          onClose={() => setIsAdminAuthOpen(false)}
          onSuccess={() => {
            setUserRole('admin');
            setCurrentTab('dashboard');
          }}
          onSelectRole={(r) => {
            setUserRole(r);
            setCurrentTab(r === 'family_head' ? 'heads' : 'portal');
          }}
          onOpenChangePin={() => setIsChangePinOpen(true)}
        />
      )}

      {/* Change Admin PIN Modal */}
      {isChangePinOpen && (
        <ChangeAdminPinModal
          isOpen={isChangePinOpen}
          onClose={() => setIsChangePinOpen(false)}
        />
      )}

      {/* Telegram / Phone Dispatch Modal for Admin */}
      {telegramDispatchPayload && (
        <TelegramDispatchModal
          recipientName={telegramDispatchPayload.name}
          recipientRole={telegramDispatchPayload.role}
          initialPhone={telegramDispatchPayload.phone}
          initialTelegram={telegramDispatchPayload.telegram}
          messageText={telegramDispatchPayload.messageText}
          directUrl={telegramDispatchPayload.directUrl}
          onClose={() => setTelegramDispatchPayload(null)}
        />
      )}

      {/* Offline / Online Network Status Indicator & Firestore Auto-Sync Banner */}
      <NetworkStatusIndicator />
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  isPaidOrPartialStatus,
  isPendingStatus,
  getContributionMonth,
  getContributionYear,
  normalizeContributionRecord,
} from './utils/storage';
import {
  Member,
  Family,
  Contribution,
  SettingsRates,
  ContributionStatus,
  UserRole,
  ComplaintRecord,
  RoleAssignment,
} from './types';
import {
  EffectiveAccess,
  getAllowedTabsForAccess,
  getDefaultLandingTab,
  hasAppPermission,
  resolveEffectiveAccess,
} from './utils/roles';
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
import { RoleManagementView } from './components/RoleManagementView';
import { TelegramDispatchModal } from './components/TelegramDispatchModal';
import { BulkImportModal } from './components/BulkImportModal';
import { AdminMemberPaymentManagerModal } from './components/AdminMemberPaymentManagerModal';
import { BatchPaymentManagerModal } from './components/BatchPaymentManagerModal';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getCurrentEthiopianDate, getEthiopianMonthName, buildPaymentTimestamps } from './utils/ethiopianCalendar';
import {
  formatSinglePaymentTelegramReport,
  formatBulkPaymentTelegramReport,
  dispatchApprovedPaymentReportToGroup,
} from './utils/telegramShare';
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
  saveSettingsToFirestore,
  subscribeToSettings,
  saveContributionToFirestore,
  deleteContributionFromFirestore,
  saveMemberToFirestore,
  deleteMemberFromFirestore,
  subscribeToAllContributions,
  subscribeToMembersWithMetadata,
  subscribeToFamiliesWithMetadata,
  subscribeToComplaints,
  markComplaintAsReadInFirestore,
  markAllComplaintsAsReadInFirestore,
  getMyRoleAssignmentsFromFirestore,
  subscribeToMyRoleAssignments,
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
  MessageSquareWarning,
  ArrowRight,
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
  const [isMembersLoading, setIsMembersLoading] = useState<boolean>(true);
  const [isContributionsLoading, setIsContributionsLoading] = useState<boolean>(true);
  const [isLoginPage, setIsLoginPage] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<UserRole>('member');
  const [currentTab, setCurrentTab] = useState<string>('portal');
  const [selectedPortalMemberId, setSelectedPortalMemberId] = useState<string>('');
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [authAccessError, setAuthAccessError] = useState<string | null>(null);
  const [hasMemberProfile, setHasMemberProfile] = useState<boolean>(false);
  const matchedAuthMemberRef = useRef<Member | null>(null);

  const effectiveAccess: EffectiveAccess = useMemo(() => {
    const matchedMem =
      matchedAuthMemberRef.current ||
      members.find((m) => m.id === selectedPortalMemberId) ||
      null;
    return resolveEffectiveAccess({
      authEmail: authFirebaseUser?.email,
      authUid: authFirebaseUser?.uid,
      matchedMember: matchedMem,
      roleAssignments,
    });
  }, [authFirebaseUser, members, selectedPortalMemberId, roleAssignments]);

  const allowedTabs = useMemo(
    () => getAllowedTabsForAccess(effectiveAccess, hasMemberProfile || Boolean(selectedPortalMemberId)),
    [effectiveAccess, hasMemberProfile, selectedPortalMemberId]
  );

  const currentUserEmail = (authFirebaseUser?.email || '').trim();
  const currentUserName =
    effectiveAccess.isMasterAdmin
      ? MASTER_ADMIN.name
      : effectiveAccess.assignment?.memberName ||
        matchedAuthMemberRef.current?.fullName ||
        authFirebaseUser?.displayName ||
        currentUserEmail ||
        'አባል / ወኪል';

  const defaultLandingTab = useMemo(
    () => getDefaultLandingTab(effectiveAccess),
    [effectiveAccess]
  );

  // Admin real-time complaint notification states
  const [adminComplaints, setAdminComplaints] = useState<ComplaintRecord[]>([]);
  const [liveComplaintToast, setLiveComplaintToast] = useState<ComplaintRecord | null>(null);
  const knownComplaintIdsRef = useRef<Set<string>>(new Set());
  const complaintsInitialLoadedRef = useRef<boolean>(false);
  
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
  const [isBatchPaymentOpen, setIsBatchPaymentOpen] = useState(false);
  const [batchPaymentPayerId, setBatchPaymentPayerId] = useState<string | undefined>(undefined);
  const [paymentListInitialType, setPaymentListInitialType] = useState<'ወርሃዊ' | 'ትውልድ'>('ወርሃዊ');

  const handleOpenPaymentManager = (memberId?: string, mode: 'list' | 'add' = 'list') => {
    setPaymentManagerMemberId(memberId);
    setPaymentManagerMode(mode);
    setIsPaymentManagerOpen(true);
  };

  const handleOpenBatchPayment = (payerId?: string) => {
    setBatchPaymentPayerId(payerId);
    setIsBatchPaymentOpen(true);
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

  // Firebase Auth state listener to protect routes, maintain persistent login, and resolve RBAC roles
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] onAuthStateChanged fired:', firebaseUser ? firebaseUser.email : 'null');
      if (firebaseUser) {
        setAuthFirebaseUser(firebaseUser);
        setAuthAccessError(null);
        const email = (firebaseUser.email || '').toLowerCase();
        const isMasterAdminEmail = email === MASTER_ADMIN.email.toLowerCase();

        if (isMasterAdminEmail) {
          matchedAuthMemberRef.current = null;
          setHasMemberProfile(false);
          setRoleAssignments([]);
          setUserRole('admin');
          setCurrentTab('dashboard');
          setIsLoginPage(false);
          setIsAuthChecking(false);
          return;
        }

        // Member Login: dummy email is <phone>@abarrus.local OR delegated Google email
        let phone = '';
        if (email.endsWith('@abarrus.local')) {
          phone = email.replace('@abarrus.local', '');
        }

        try {
          const [matchedMem, myAssignments] = await Promise.all([
            getMemberByAuthUidOrPhone(firebaseUser.uid, phone),
            getMyRoleAssignmentsFromFirestore(firebaseUser),
          ]);

          if (matchedMem) {
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

            matchedAuthMemberRef.current = matchedMem;
            setHasMemberProfile(true);
            setSelectedPortalMemberId(matchedMem.id);
            setSelectedHeadFamilyId(matchedMem.familyId || 'FA001');

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
            matchedAuthMemberRef.current = null;
            setHasMemberProfile(false);
            setSelectedPortalMemberId('');
          }

          setRoleAssignments(myAssignments);

          const access = resolveEffectiveAccess({
            authEmail: firebaseUser.email,
            authUid: firebaseUser.uid,
            matchedMember: matchedMem,
            roleAssignments: myAssignments,
          });

          if (!matchedMem && access.permissions.length === 0) {
            console.warn('[Auth] Unauthorized Google/Auth account rejected:', email, firebaseUser.uid);
            setAuthAccessError(
              'ይህ አካውንት በአድሚን የተሰጠ ንቁ ሚና የለውም ወይም ፍቃዱ ተነስቷል። እባክዎ ዋና አስተዳዳሪውን ያነጋግሩ።'
            );
            await signOut(auth);
            setAuthFirebaseUser(null);
            setSelectedPortalMemberId('');
            setIsLoginPage(true);
            setIsAuthChecking(false);
            return;
          }

          setUserRole(access.userRole);
          setCurrentTab(getDefaultLandingTab(access));
          setIsLoginPage(false);
        } catch (fetchErr) {
          console.error('[Auth] Error fetching member/roles after Firebase auth:', fetchErr);
          matchedAuthMemberRef.current = null;
          setHasMemberProfile(false);
          setSelectedPortalMemberId('');
          setRoleAssignments([]);
          setIsLoginPage(true);
        }
      } else {
        // No active Firebase Auth session - strictly protect routes
        matchedAuthMemberRef.current = null;
        setAuthFirebaseUser(null);
        setHasMemberProfile(false);
        setSelectedPortalMemberId('');
        setRoleAssignments([]);
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
    if (authFirebaseUser) {
      try {
        const [liveMembers, liveFamilies, liveContribs, liveSettings] = await Promise.all([
          getMembersFromFirestore(),
          getFamiliesFromFirestore(),
          getContributionsFromFirestore(),
          getSettingsFromFirestore(),
        ]);
        if (liveMembers.length > 0) setMembers(liveMembers);
        if (liveFamilies.length > 0) setFamilies(liveFamilies);
        if (liveContribs.length >= 0) setContributions(liveContribs.map(normalizeContributionRecord));
        if (liveSettings) setSettings(liveSettings);
        return;
      } catch (err) {
        console.warn('[App] Firestore refresh fallback:', err);
      }
    }
    await refreshAllDataFromServer();
    setMembers(getMembers());
    setFamilies(getFamilies());
    setContributions(getContributions());
    setSettings(getSettings());
  };

  const handleSaveSettings = async (nextSettings: SettingsRates): Promise<void> => {
    saveSettings(nextSettings);
    setSettings(nextSettings);
    await saveSettingsToFirestore(nextSettings);
  };

  const currentDate = getCurrentEthiopianDate();

  // Listen for local storage sync events and PWA install prompt (no Firestore calls before auth)
  useEffect(() => {
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
      window.removeEventListener('abarrus_data_synced', handleSync);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Requirement 2 & 3: Wait for onAuthStateChanged AND handle Firestore Offline Persistence empty-cache snapshots
  useEffect(() => {
    // Do NOT query Firestore until onAuthStateChanged confirms auth state and user is signed in
    if (isAuthChecking) {
      setIsMembersLoading(true);
      setIsContributionsLoading(true);
      return;
    }

    if (!authFirebaseUser) {
      setIsMembersLoading(false);
      setIsContributionsLoading(false);
      return;
    }

    let isActive = true;
    let offlineFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    setIsMembersLoading(true);
    setIsContributionsLoading(true);

    // 1. Real-time metadata-aware listener for 'members'
    const unsubscribeMembers = subscribeToMembersWithMetadata(
      (liveMembers, meta) => {
        if (!isActive) return;

        // If IndexedDB offline cache emits an initial empty snapshot while waiting for server,
        // keep loading state active until server snapshot (!meta.fromCache) or non-empty data arrives.
        if (meta.fromCache && meta.empty) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            if (!offlineFallbackTimer) {
              offlineFallbackTimer = setTimeout(() => {
                if (isActive) setIsMembersLoading(false);
              }, 1200);
            }
          }
          return;
        }

        if (offlineFallbackTimer) {
          clearTimeout(offlineFallbackTimer);
          offlineFallbackTimer = null;
        }

        if (liveMembers.length > 0 || !meta.fromCache) {
          setMembers(liveMembers);
          if (liveMembers.length > 0) {
            try {
              localStorage.setItem('abarrus_members_v6', JSON.stringify(liveMembers));
            } catch {}
          }
        }
        setIsMembersLoading(false);
      },
      (err) => {
        console.warn('[App Members Subscription Error]:', err);
        if (isActive) setIsMembersLoading(false);
      }
    );

    // 2. Real-time metadata-aware listener for 'families'
    const unsubscribeFamilies = subscribeToFamiliesWithMetadata(
      (liveFamilies, meta) => {
        if (!isActive) return;
        if (meta.fromCache && meta.empty) return;
        if (liveFamilies.length > 0 || !meta.fromCache) {
          setFamilies(liveFamilies);
          if (liveFamilies.length > 0) {
            try {
              localStorage.setItem('abarrus_families_v6', JSON.stringify(liveFamilies));
            } catch {}
          }
        }
      },
      (err) => {
        console.warn('[App Families Subscription Error]:', err);
      }
    );

    // 3. Real-time global subscription monitoring the 'contributions' collection in Firestore
    const unsubscribeContribs = subscribeToAllContributions(
      (live, meta) => {
        if (!isActive) return;
        if (meta?.fromCache && meta?.empty) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setIsContributionsLoading(false);
          }
          return;
        }
        if (Array.isArray(live) && (live.length > 0 || !meta?.fromCache)) {
          setContributions(live);
          if (live.length > 0) {
            try {
              localStorage.setItem('abarrus_contributions_v6', JSON.stringify(live));
            } catch {}
          }
        }
        setIsContributionsLoading(false);
      },
      (err) => {
        console.warn('[App Global Subscription Error]:', err);
        if (isActive) setIsContributionsLoading(false);
      }
    );

    // 4. Fetch & subscribe to live settings (including leadership appointments) from Firestore
    getSettingsFromFirestore().then((live) => {
      if (isActive && live) {
        setSettings(live);
        try {
          localStorage.setItem('abarrus_settings_v6', JSON.stringify(live));
        } catch {}
      }
    });

    const unsubscribeSettings = subscribeToSettings(
      (liveSettings) => {
        if (!isActive) return;
        setSettings(liveSettings);
        try {
          localStorage.setItem('abarrus_settings_v6', JSON.stringify(liveSettings));
        } catch {}
      },
      (err) => {
        console.warn('[App Settings Subscription Error]:', err);
      }
    );

    return () => {
      isActive = false;
      if (offlineFallbackTimer) clearTimeout(offlineFallbackTimer);
      unsubscribeMembers();
      unsubscribeFamilies();
      unsubscribeContribs();
      unsubscribeSettings();
    };
  }, [isAuthChecking, authFirebaseUser]);

  // Live RBAC Role Assignment subscription for instant Grant / Revoke enforcement
  useEffect(() => {
    if (isAuthChecking || !authFirebaseUser) return;
    const email = (authFirebaseUser.email || '').toLowerCase();
    if (email === MASTER_ADMIN.email.toLowerCase()) return;

    let hadActiveAssignment = false;
    const unsubRoles = subscribeToMyRoleAssignments(authFirebaseUser, (liveAssignments) => {
      setRoleAssignments(liveAssignments);
      const matchedMem = matchedAuthMemberRef.current;
      const nextAccess = resolveEffectiveAccess({
        authEmail: authFirebaseUser.email,
        authUid: authFirebaseUser.uid,
        matchedMember: matchedMem,
        roleAssignments: liveAssignments,
      });

      if (nextAccess.permissions.length > 0) {
        hadActiveAssignment = true;
      }

      if (!matchedMem && nextAccess.permissions.length === 0 && hadActiveAssignment) {
        setAuthAccessError('የአስተዳዳሪ ፍቃድዎ በዋና አስተዳዳሪው ተነስቷል (Revoked)።');
        void signOut(auth);
        setIsLoginPage(true);
        return;
      }

      setUserRole(nextAccess.userRole);
      const nextAllowed = getAllowedTabsForAccess(nextAccess, Boolean(matchedMem));
      setCurrentTab((prevTab) => {
        if (nextAllowed.includes(prevTab)) return prevTab;
        return getDefaultLandingTab(nextAccess);
      });
    });

    return () => unsubRoles();
  }, [isAuthChecking, authFirebaseUser]);

  // Real-time Admin Notification listener for newly submitted Member Complaints
  useEffect(() => {
    const canViewComplaints =
      effectiveAccess.isMasterAdmin ||
      hasAppPermission(effectiveAccess.permissions, 'manage_complaints', effectiveAccess.isMasterAdmin);

    if (isAuthChecking || !authFirebaseUser || userRole !== 'admin' || !canViewComplaints) {
      setAdminComplaints([]);
      setLiveComplaintToast(null);
      knownComplaintIdsRef.current.clear();
      complaintsInitialLoadedRef.current = false;
      return;
    }

    const playAlertChime = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.36);
      } catch {}
    };

    const unsubComplaints = subscribeToComplaints(
      (docs) => {
        setAdminComplaints(docs);

        if (!complaintsInitialLoadedRef.current) {
          knownComplaintIdsRef.current = new Set(docs.map((d) => d.id));
          complaintsInitialLoadedRef.current = true;
          return;
        }

        const newlyArrived = docs.find(
          (d) =>
            !knownComplaintIdsRef.current.has(d.id) &&
            String(d.status || '').trim().toLowerCase() !== 'resolved' &&
            d.isReadByAdmin !== true
        );

        docs.forEach((d) => knownComplaintIdsRef.current.add(d.id));

        if (newlyArrived) {
          setLiveComplaintToast(newlyArrived);
          playAlertChime();
        }
      },
      (err) => {
        console.warn('[App Admin Complaint Notifications Error]:', err);
      }
    );

    return () => {
      unsubComplaints();
    };
  }, [isAuthChecking, authFirebaseUser, userRole]);

  const handleJumpToAdminComplaints = (complaint?: ComplaintRecord) => {
    if (complaint && complaint.id && complaint.isReadByAdmin !== true) {
      void markComplaintAsReadInFirestore(complaint.id);
    }
    setLiveComplaintToast(null);
    setCurrentTab('dashboard');
    setIsLoginPage(false);
    setTimeout(() => {
      document.getElementById('admin-complaints-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  };

  const deepLinkFamilyAppliedRef = useRef(false);

  // Parse deep-link query and hash params on mount (when opened via Telegram link on mobile)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?')
        ? window.location.hash.substring(window.location.hash.indexOf('?'))
        : '';
      const hashParams = new URLSearchParams(hashQuery);

      const familyIdParam = searchParams.get('familyId') || hashParams.get('familyId');
      const secretAdminUnlock = searchParams.get('adminAuth') || hashParams.get('adminAuth') || searchParams.get('authPin');

      // Secret one-time authorization for Mesud Nurga's device via link
      if (secretAdminUnlock) {
        verifyAndAuthorizeDevice(secretAdminUnlock);
      }

      if (window.location.pathname.startsWith('/login')) {
        setIsLoginPage(true);
        return;
      }

      if (familyIdParam && !deepLinkFamilyAppliedRef.current) {
        const cleanFamId = decodeURIComponent(familyIdParam).trim().toUpperCase();
        const matchFam = families.find((f) => f.id.toUpperCase() === cleanFamId);
        if (matchFam) {
          deepLinkFamilyAppliedRef.current = true;
          setSelectedHeadFamilyId(matchFam.id);
          localStorage.setItem('abarrus_active_head_family_id', matchFam.id);
        }
      }
    } catch {}
  }, [families]);

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

  const enforcePaymentGovernance = (conData: Omit<Contribution, 'id'>): Omit<Contribution, 'id'> => {
    const ts = buildPaymentTimestamps();
    const rawIntended = conData.intendedStatus || conData.status;
    const requestedPaidOrPartial = isPaidOrPartialStatus(rawIntended);
    const resolvedIntended: ContributionStatus =
      rawIntended === 'ከፊል' || String(rawIntended || '').toLowerCase() === 'partial'
        ? 'ከፊል'
        : 'ተከፍሏል';

    const finalStatus: ContributionStatus = effectiveAccess.isMasterAdmin
      ? (isPendingStatus(conData.status) ? 'Pending' : conData.status)
      : 'Pending';

    const baseDatePaid =
      conData.datePaid && /\d{1,2}:\d{2}/.test(conData.datePaid)
        ? conData.datePaid
        : ts.datePaid;

    return {
      ...conData,
      status: finalStatus,
      intendedStatus: requestedPaidOrPartial ? resolvedIntended : conData.intendedStatus || 'ተከፍሏል',
      paidAt: conData.paidAt || ts.paidAt,
      datePaid: baseDatePaid,
      recordedBy: conData.recordedBy || currentUserName,
      recordedByEmail: conData.recordedByEmail || currentUserEmail || undefined,
      approvedBy:
        effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(finalStatus)
          ? conData.approvedBy || currentUserName
          : undefined,
      approvedAt:
        effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(finalStatus)
          ? conData.approvedAt || ts.datePaid
          : undefined,
    };
  };

  const handleSavePayment = async (conData: Omit<Contribution, 'id'>) => {
    const governed = enforcePaymentGovernance(conData);
    const normalizedInput = normalizeContributionRecord({ ...(governed as Contribution), id: '' });
    const newCon = addContribution(normalizedInput);
    const updatedList = [newCon, ...contributions.filter((c) => c.id !== newCon.id)];
    setContributions(updatedList);
    await saveContributionToFirestore(newCon);
    if (effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(newCon.status)) {
      const m = members.find((mem) => mem.id === newCon.memberId);
      const reportText = formatSinglePaymentTelegramReport(newCon, m, updatedList, settings);
      void dispatchApprovedPaymentReportToGroup({
        target: 'payment',
        payment: newCon,
        reportText,
      });
    }
  };

  const handleSavePaymentsBatch = async (conList: Omit<Contribution, 'id'>[]) => {
    const normalizedInputs = conList.map((c) =>
      normalizeContributionRecord({ ...(enforcePaymentGovernance(c) as Contribution), id: '' })
    );
    const newCons = addContributionsBatch(normalizedInputs);
    const newIds = new Set(newCons.map((c) => c.id));
    const updatedList = [...newCons, ...contributions.filter((c) => !newIds.has(c.id))];
    setContributions(updatedList);
    for (const c of newCons) {
      await saveContributionToFirestore(c);
    }
    const approvedCons = effectiveAccess.isMasterAdmin
      ? newCons.filter((c) => isPaidOrPartialStatus(c.status))
      : [];
    if (approvedCons.length === 1) {
      const single = approvedCons[0];
      const m = members.find((mem) => mem.id === single.memberId);
      const reportText = formatSinglePaymentTelegramReport(single, m, updatedList, settings);
      void dispatchApprovedPaymentReportToGroup({
        target: 'payment',
        payment: single,
        reportText,
      });
    } else if (approvedCons.length > 1) {
      const bulkText = formatBulkPaymentTelegramReport({
        items: approvedCons.map((c) => ({
          member: members.find((mem) => mem.id === c.memberId) || {
            id: c.memberId,
            fullName: c.memberName,
            generation: c.generation,
            familyId: c.familyId,
            familyName: c.familyName,
            phone: '',
          },
          type: c.type,
          amount: Number(c.paidAmount ?? c.amount ?? 0),
          ethiopianMonth: getContributionMonth(c),
          ethiopianMonthName: c.ethiopianMonthName,
          ethiopianYear: getContributionYear(c),
          datePaid: c.datePaid,
        })),
        allContributions: updatedList,
        settings,
      });
      void dispatchApprovedPaymentReportToGroup({
        target: 'bulk_payment',
        bulkItems: approvedCons.map((c) => {
          const m = members.find((mem) => mem.id === c.memberId);
          return {
            memberId: c.memberId,
            memberName: c.memberName,
            generation: c.generation,
            isMinor: m?.isMinor,
            isSpouse: m?.isSpouse,
            type: c.type,
            amount: Number(c.paidAmount ?? c.amount ?? 0),
            ethiopianMonth: getContributionMonth(c),
            ethiopianMonthName: c.ethiopianMonthName,
            ethiopianYear: getContributionYear(c),
            datePaid: c.datePaid,
          };
        }),
        reportText: bulkText,
      });
    }
  };

  const handleDeleteContribution = async (id: string) => {
    const existing = contributions.find((c) => c.id === id);
    if (!effectiveAccess.isMasterAdmin && existing && isPaidOrPartialStatus(existing.status)) {
      return;
    }
    deleteContribution(id);
    setContributions((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteContributionFromFirestore(id);
    } catch (err) {
      console.warn('[Firestore] Error deleting contribution from Firestore:', err);
    }
  };

  const handleDeleteMember = async (id: string) => {
    deleteMember(id);
    setMembers(getMembers());
    setFamilies(getFamilies());
    setContributions((prev) => prev.filter((c) => c.memberId !== id));
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
    setMembers((prev) => [newMember, ...prev.filter((m) => m.id !== newMember.id)]);
    setFamilies(getFamilies());
    try {
      await saveMemberToFirestore(newMember);
    } catch (err) {
      console.warn('[Firestore] Error saving member to Firestore:', err);
    }
  };

  const handleUpdateContributionStatus = async (id: string, status: ContributionStatus) => {
    // CRITICAL SECURITY GATE: Only Master Admin can approve/mark contributions Paid or Partial
    if (!effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(status)) {
      return;
    }
    const existing = contributions.find((c) => c.id === id);
    if (!existing) return;
    const wasPendingOrUnpaid = !isPaidOrPartialStatus(existing.status);
    const ts = buildPaymentTimestamps();

    const patch: Partial<Contribution> = {
      status,
      ...(isPaidOrPartialStatus(status)
        ? {
            approvedBy: currentUserName,
            approvedAt: ts.datePaid,
            paidAt: existing.paidAt || ts.paidAt,
            datePaid: existing.datePaid && /\d{1,2}:\d{2}/.test(existing.datePaid) ? existing.datePaid : ts.datePaid,
          }
        : {}),
    };

    const localUpdated = updateContribution(id, patch);
    const updated = { ...existing, ...patch, ...(localUpdated || {}) };
    const nextList = contributions.map((c) => (c.id === id ? updated : c));
    setContributions(nextList);
    await saveContributionToFirestore(updated);

    if (effectiveAccess.isMasterAdmin && wasPendingOrUnpaid && isPaidOrPartialStatus(status)) {
      const m = members.find((mem) => mem.id === updated.memberId);
      const reportText = formatSinglePaymentTelegramReport(updated, m, nextList, settings);
      void dispatchApprovedPaymentReportToGroup({
        target: 'payment',
        payment: updated,
        reportText,
      });
    }
  };

  const handleApproveContribution = async (c: Contribution) => {
    if (!effectiveAccess.isMasterAdmin) return;
    const ts = buildPaymentTimestamps();
    const paidNum = Number(c.paidAmount ?? c.amount ?? 0);
    const targetNum = Number(c.amount ?? 0);
    const approvedStatus: ContributionStatus =
      c.intendedStatus === 'ከፊል' || (c.type === 'ትውልድ' && paidNum > 0 && targetNum > 0 && paidNum < targetNum)
        ? 'ከፊል'
        : 'ተከፍሏል';

    const updated: Contribution = normalizeContributionRecord({
      ...c,
      status: approvedStatus,
      approvedBy: currentUserName,
      approvedAt: ts.datePaid,
      paidAt: c.paidAt || ts.paidAt,
      datePaid: c.datePaid && /\d{1,2}:\d{2}/.test(c.datePaid) ? c.datePaid : ts.datePaid,
    });

    updateContribution(c.id, updated);
    const nextList = contributions.map((item) => (item.id === c.id ? updated : item));
    setContributions(nextList);
    await saveContributionToFirestore(updated);

    const m = members.find((mem) => mem.id === updated.memberId);
    const reportText = formatSinglePaymentTelegramReport(updated, m, nextList, settings);
    void dispatchApprovedPaymentReportToGroup({
      target: 'payment',
      payment: updated,
      reportText,
    });
  };

  const handleRejectContribution = async (c: Contribution) => {
    if (!effectiveAccess.isMasterAdmin) return;
    deleteContribution(c.id);
    setContributions((prev) => prev.filter((item) => item.id !== c.id));
    try {
      await deleteContributionFromFirestore(c.id);
    } catch (err) {
      console.warn('[Firestore] Error rejecting pending contribution:', err);
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
    const rate = member.isMinor
      ? 0
      : member.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[member.generation] || 50;

    const existingCon = contributions.find(
      (c) =>
        c.memberId === memberId &&
        (!c.type || c.type === 'ወርሃዊ') &&
        getContributionMonth(c) === month &&
        getContributionYear(c) === year
    );

    if (markPaid) {
      const ts = buildPaymentTimestamps();
      const targetStatus: ContributionStatus = effectiveAccess.isMasterAdmin ? 'ተከፍሏል' : 'Pending';
      let targetCon: Contribution | undefined;
      let nextContribs = contributions;

      if (existingCon) {
        if (!effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(existingCon.status)) {
          return;
        }
        const updatedCon: Contribution = normalizeContributionRecord({
          ...existingCon,
          month,
          year,
          ethiopianMonth: month,
          ethiopianMonthName: getEthiopianMonthName(month),
          ethiopianYear: year,
          status: targetStatus,
          intendedStatus: 'ተከፍሏል',
          paidAmount: rate,
          amount: rate,
          datePaid: ts.datePaid,
          paidAt: ts.paidAt,
          recordedBy: currentUserName,
          recordedByEmail: currentUserEmail || undefined,
          ...(effectiveAccess.isMasterAdmin
            ? { approvedBy: currentUserName, approvedAt: ts.datePaid }
            : {}),
          notes: effectiveAccess.isMasterAdmin
            ? `በዋና አስተዳዳሪው (${currentUserName}) የተመዘገበ ክፍያ`
            : `በ${currentUserName} የተመዘገበ (የዋና አድሚን ማረጋገጫ የሚጠብቅ / Pending)`,
        });
        updateContribution(existingCon.id, updatedCon);
        nextContribs = contributions.map((c) => (c.id === existingCon.id ? updatedCon : c));
        setContributions(nextContribs);
        await saveContributionToFirestore(updatedCon);
        targetCon = updatedCon;
      } else {
        const newCon = addContribution({
          memberId: member.id,
          memberName: member.fullName,
          familyId: member.familyId,
          familyName: member.familyName,
          generation: member.generation,
          type: 'ወርሃዊ',
          month,
          year,
          ethiopianMonth: month,
          ethiopianMonthName: getEthiopianMonthName(month),
          ethiopianYear: year,
          amount: rate,
          paidAmount: rate,
          status: targetStatus,
          intendedStatus: 'ተከፍሏል',
          paymentMethod: 'ጥሬ ገንዘብ (Cash)',
          datePaid: ts.datePaid,
          paidAt: ts.paidAt,
          recordedBy: currentUserName,
          recordedByEmail: currentUserEmail || undefined,
          ...(effectiveAccess.isMasterAdmin
            ? { approvedBy: currentUserName, approvedAt: ts.datePaid }
            : {}),
          notes: effectiveAccess.isMasterAdmin
            ? `በዋና አስተዳዳሪው (${currentUserName}) የተመዘገበ ክፍያ`
            : `በ${currentUserName} የተመዘገበ (የዋና አድሚን ማረጋገጫ የሚጠብቅ / Pending)`,
        });
        nextContribs = [newCon, ...contributions.filter((c) => c.id !== newCon.id)];
        setContributions(nextContribs);
        await saveContributionToFirestore(newCon);
        targetCon = newCon;
      }
      if (effectiveAccess.isMasterAdmin && targetCon && isPaidOrPartialStatus(targetCon.status)) {
        const reportText = formatSinglePaymentTelegramReport(targetCon, member, nextContribs, settings);
        void dispatchApprovedPaymentReportToGroup({
          target: 'payment',
          payment: targetCon,
          reportText,
        });
      }
    } else {
      if (existingCon) {
        if (!effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(existingCon.status)) {
          return;
        }
        deleteContribution(existingCon.id);
        setContributions((prev) => prev.filter((c) => c.id !== existingCon.id));
        await deleteContributionFromFirestore(existingCon.id);
      }
    }
  };

  const handleToggleGenStatus = async (memberId: string, markPaid: boolean) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const genRate = settings.generationPayment[member.generation] || 200;

    const existingCon = contributions.find(
      (c) => c.memberId === memberId && c.type === 'ትውልድ'
    );

    if (markPaid) {
      const ts = buildPaymentTimestamps();
      const targetStatus: ContributionStatus = effectiveAccess.isMasterAdmin ? 'ተከፍሏል' : 'Pending';
      let targetCon: Contribution | undefined;
      let nextContribs = contributions;

      if (existingCon) {
        if (!effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(existingCon.status)) {
          return;
        }
        const updatedCon: Contribution = normalizeContributionRecord({
          ...existingCon,
          status: targetStatus,
          intendedStatus: 'ተከፍሏል',
          paidAmount: genRate,
          amount: genRate,
          datePaid: ts.datePaid,
          paidAt: ts.paidAt,
          recordedBy: currentUserName,
          recordedByEmail: currentUserEmail || undefined,
          ...(effectiveAccess.isMasterAdmin
            ? { approvedBy: currentUserName, approvedAt: ts.datePaid }
            : {}),
          notes: effectiveAccess.isMasterAdmin
            ? `በዋና አስተዳዳሪው (${currentUserName}) የተመዘገበ የትውልድ ክፍያ`
            : `በ${currentUserName} የተመዘገበ የትውልድ ክፍያ (Pending Approval)`,
        });
        updateContribution(existingCon.id, updatedCon);
        nextContribs = contributions.map((c) => (c.id === existingCon.id ? updatedCon : c));
        setContributions(nextContribs);
        await saveContributionToFirestore(updatedCon);
        targetCon = updatedCon;
      } else {
        const newCon = addContribution({
          memberId: member.id,
          memberName: member.fullName,
          familyId: member.familyId,
          familyName: member.familyName,
          generation: member.generation,
          type: 'ትውልድ',
          month: currentDate.month || 11,
          year: currentDate.year || 2018,
          ethiopianMonth: currentDate.month || 11,
          ethiopianMonthName: getEthiopianMonthName(currentDate.month || 11),
          ethiopianYear: currentDate.year || 2018,
          amount: genRate,
          paidAmount: genRate,
          status: targetStatus,
          intendedStatus: 'ተከፍሏል',
          paymentMethod: 'ጥሬ ገንዘብ (Cash)',
          datePaid: ts.datePaid,
          paidAt: ts.paidAt,
          recordedBy: currentUserName,
          recordedByEmail: currentUserEmail || undefined,
          ...(effectiveAccess.isMasterAdmin
            ? { approvedBy: currentUserName, approvedAt: ts.datePaid }
            : {}),
          notes: effectiveAccess.isMasterAdmin
            ? `በዋና አስተዳዳሪው (${currentUserName}) የተመዘገበ የትውልድ መዋጮ`
            : `በ${currentUserName} የተመዘገበ የትውልድ መዋጮ (Pending Approval)`,
        });
        nextContribs = [newCon, ...contributions.filter((c) => c.id !== newCon.id)];
        setContributions(nextContribs);
        await saveContributionToFirestore(newCon);
        targetCon = newCon;
      }
      if (effectiveAccess.isMasterAdmin && targetCon && isPaidOrPartialStatus(targetCon.status)) {
        const reportText = formatSinglePaymentTelegramReport(targetCon, member, nextContribs, settings);
        void dispatchApprovedPaymentReportToGroup({
          target: 'payment',
          payment: targetCon,
          reportText,
        });
      }
    } else {
      if (existingCon) {
        if (!effectiveAccess.isMasterAdmin && isPaidOrPartialStatus(existingCon.status)) {
          return;
        }
        deleteContribution(existingCon.id);
        setContributions((prev) => prev.filter((c) => c.id !== existingCon.id));
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
          if (!effectiveAccess.isMasterAdmin && !allowedTabs.includes(tab)) {
            setCurrentTab(defaultLandingTab);
            setIsLoginPage(false);
            return;
          }
          setCurrentTab(tab);
          setIsLoginPage(false);
        }}
        userRole={userRole}
        onChangeRole={handleChangeRole}
        onOpenSettings={() => {
          if (
            effectiveAccess.isMasterAdmin ||
            hasAppPermission(effectiveAccess.permissions, 'manage_settings', effectiveAccess.isMasterAdmin)
          ) {
            setIsSettingsOpen(true);
          }
        }}
        onOpenChangePin={() => setIsChangePinOpen(true)}
        onRefreshData={handleRefreshData}
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'am' ? 'en' : 'am'))}
        activeMemberName={
          members.find((m) => m.id === selectedPortalMemberId)?.fullName ||
          effectiveAccess.assignment?.memberName ||
          authFirebaseUser?.displayName ||
          undefined
        }
        onLogout={handleLogout}
        adminComplaints={adminComplaints}
        onOpenComplaintNotification={(c) => handleJumpToAdminComplaints(c)}
        onMarkAllComplaintsRead={(ids) => {
          void markAllComplaintsAsReadInFirestore(ids);
        }}
        onViewAllComplaints={() => handleJumpToAdminComplaints()}
        appRole={effectiveAccess.appRole}
        permissions={effectiveAccess.permissions}
        isMasterAdmin={effectiveAccess.isMasterAdmin}
        allowedTabs={allowedTabs}
      />

      {/* Real-time Admin Floating Alert Banner when a Member submits a Complaint */}
      {userRole === 'admin' && !isLoginPage && liveComplaintToast && (
        <div
          role="alert"
          className="fixed top-20 right-3 sm:right-6 z-50 w-[calc(100%-1.5rem)] max-w-md bg-white rounded-2xl shadow-2xl border-2 border-amber-400 p-4 flex items-start gap-3 no-print animate-in fade-in slide-in-from-top-3"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <MessageSquareWarning className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-emerald-950">
                አዲስ የአባል ቅሬታ ደርሷል!
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                አሁን
              </span>
            </div>
            <p className="text-xs font-bold text-neutral-800 truncate">
              ከ {liveComplaintToast.firstName || liveComplaintToast.memberName || 'አባል'}
              {liveComplaintToast.memberId ? ` (${liveComplaintToast.memberId})` : ''}
            </p>
            <p className="text-xs text-neutral-600 line-clamp-2">
              {liveComplaintToast.complaintText}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleJumpToAdminComplaints(liveComplaintToast)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1B5E20] hover:bg-[#144818] text-white text-[11px] font-bold cursor-pointer transition-colors"
              >
                <span>እይና መልስ ስጥ</span>
                <ArrowRight className="w-3 h-3 text-[#FFD700]" />
              </button>
              <button
                type="button"
                onClick={() => setLiveComplaintToast(null)}
                className="px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-semibold cursor-pointer"
              >
                ዝጋ
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLiveComplaintToast(null)}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer shrink-0"
            aria-label="Close alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8">
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
            externalAuthError={authAccessError}
            onLoginSuccess={(m) => {
              matchedAuthMemberRef.current = m;
              setHasMemberProfile(true);
              setMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
              setSelectedPortalMemberId(m.id);
              setSelectedHeadFamilyId(m.familyId || 'FA001');
              setIsLoginPage(false);
            }}
            onAdminGoogleLoginSuccess={() => {
              setAuthAccessError(null);
            }}
          />
        ) : userRole === 'member' || currentTab === 'portal' ? (
          <ErrorBoundary fallbackTitle="የአባል መገለጫ ገጽ ስህተት (Member Profile Error)">
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
                // CRITICAL: Every Member Portal payment (self or proxy) stays Pending until Master Admin approves
                const effectiveStatus: ContributionStatus = effectiveAccess.isMasterAdmin
                  ? (status || 'ተከፍሏል')
                  : 'Pending';

                const ts = buildPaymentTimestamps();
                const targetYear = currentDate.year || 2018;
                const newCon: Contribution = {
                  id: `CON-${Date.now()}`,
                  memberId: targetMemberId,
                  memberName: beneficiaryName || mem?.fullName || 'አባል',
                  familyId: mem?.familyId || 'FA001',
                  familyName: mem?.familyName || 'የአበሩስ ቤተሰብ',
                  generation: mem?.generation || 4,
                  type: isGen ? 'ትውልድ' : 'ወርሃዊ',
                  month: isGen ? 0 : month,
                  year: targetYear,
                  ethiopianMonth: isGen ? 0 : month,
                  ethiopianMonthName: isGen ? 'የትውልድ መዋጮ' : getEthiopianMonthName(month),
                  ethiopianYear: targetYear,
                  amount,
                  paidAmount: amount,
                  status: effectiveStatus,
                  intendedStatus: 'ተከፍሏል',
                  paymentMethod: method as any,
                  transactionRef: ref,
                  datePaid: ts.datePaid,
                  paidAt: ts.paidAt,
                  recordedBy: payerName || mem?.fullName || currentUserName,
                  recordedByEmail: currentUserEmail || undefined,
                  notes: isProxyPayment
                    ? `ተኪ ክፍያ፡ በ${payerName || payerId} ለ${beneficiaryName || mem?.fullName} የተከፈለ (የዋና አድሚን ማረጋገጫ የሚጠብቅ / Pending)`
                    : slipPhoto
                    ? 'ደረሰኝ ፎቶ ተያይዟል (በአባል በኩል የቀረበ - የዋና አድሚን ማረጋገጫ የሚጠብቅ)'
                    : 'በአባል በኩል የቀረበ የክፍያ ማረጋገጫ (Pending Master Admin Approval)',
                  payerId,
                  payerName,
                  beneficiaryId: targetMemberId,
                  beneficiaryName: beneficiaryName || mem?.fullName,
                  isProxyPayment,
                  slipPhoto,
                };

                addContribution(newCon);
                setContributions((prev) => [newCon, ...prev.filter((c) => c.id !== newCon.id)]);
                await saveContributionToFirestore(newCon);
              }}
            />
          </ErrorBoundary>
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
                permissions={effectiveAccess.permissions}
                isMasterAdmin={effectiveAccess.isMasterAdmin}
                onApproveContribution={handleApproveContribution}
                onRejectContribution={handleRejectContribution}
                onOpenRecordPayment={() => {
                  setRecordPaymentMemberId(undefined);
                  setIsRecordPaymentOpen(true);
                }}
                onOpenPaymentManager={handleOpenPaymentManager}
                onOpenBatchPayment={handleOpenBatchPayment}
                onOpenAddMember={() => setIsAddMemberOpen(true)}
                onOpenBulkImport={() => setIsBulkImportOpen(true)}
                onOpenPrintReport={() => setIsPrintReportOpen(true)}
                onNavigateTab={(tab) => {
                  if (!effectiveAccess.isMasterAdmin && !allowedTabs.includes(tab)) {
                    return;
                  }
                  setCurrentTab(tab);
                }}
                onNavigatePaymentLists={(type) => {
                  setPaymentListInitialType(type);
                  setCurrentTab('unpaid');
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
                isLoading={isMembersLoading}
                isMasterAdmin={effectiveAccess.isMasterAdmin}
                currentUserName={currentUserName}
                currentUserEmail={currentUserEmail}
                onOpenAddMember={() => setIsAddMemberOpen(true)}
                onOpenBulkImport={() => setIsBulkImportOpen(true)}
                onOpenQR={(m) => setActiveQRMember(m)}
                onRecordPayment={(id) => handleOpenRecordPaymentForMember(id)}
                onOpenPaymentManager={handleOpenPaymentManager}
                onOpenBatchPayment={handleOpenBatchPayment}
                onBulkWalletPaymentComplete={({ payerId, newWalletBalance, createdContributions }) => {
                  updateMember(payerId, { walletBalance: newWalletBalance });
                  if (createdContributions.length > 0) {
                    createdContributions.forEach((c) => addContribution(c));
                  }
                  setMembers(getMembers());
                  setContributions(getContributions());
                }}
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
                isMasterAdmin={effectiveAccess.isMasterAdmin}
                onApproveContribution={handleApproveContribution}
                onRejectContribution={handleRejectContribution}
                onOpenRecordPayment={() => {
                  setRecordPaymentMemberId(undefined);
                  setIsRecordPaymentOpen(true);
                }}
                onOpenPaymentManager={handleOpenPaymentManager}
                onOpenBatchPayment={handleOpenBatchPayment}
                onUpdateStatus={handleUpdateContributionStatus}
                onDeleteContribution={handleDeleteContribution}
                onOpenPrintReport={() => setIsPrintReportOpen(true)}
                onDispatchTelegram={(payload) => setTelegramDispatchPayload(payload)}
              />
            )}

            {currentTab === 'unpaid' && (
              <UnpaidReport
                members={members}
                families={families}
                contributions={contributions}
                settings={settings}
                initialContributionType={paymentListInitialType}
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
                onUpdateSettings={handleSaveSettings}
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

            {currentTab === 'automations' && effectiveAccess.isMasterAdmin && (
              <AutomationsPanel
                families={families}
                members={members}
                contributions={contributions}
                settings={settings}
                onUpdateSettings={handleSaveSettings}
              />
            )}

            {currentTab === 'roles' &&
              hasAppPermission(
                effectiveAccess.permissions,
                'manage_roles',
                effectiveAccess.isMasterAdmin
              ) && (
                <ErrorBoundary fallbackTitle="የሚና አስተዳደር ገጽ ስህተት (Role Management Error)">
                  <RoleManagementView
                    members={members}
                    currentUserEmail={authFirebaseUser?.email}
                    currentUserName={
                      authFirebaseUser?.displayName ||
                      matchedAuthMemberRef.current?.fullName ||
                      MASTER_ADMIN.name
                    }
                    isMasterAdmin={effectiveAccess.isMasterAdmin}
                    lang={lang}
                  />
                </ErrorBoundary>
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
            {(effectiveAccess.isMasterAdmin ||
              hasAppPermission(
                effectiveAccess.permissions,
                'manage_settings',
                effectiveAccess.isMasterAdmin
              )) && (
              <>
                <span>·</span>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="text-emerald-800 hover:text-emerald-950 font-semibold underline cursor-pointer"
                >
                  ተመን ማስተካከያ (Settings)
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (!effectiveAccess.isMasterAdmin && !allowedTabs.includes(tab)) {
            setCurrentTab(defaultLandingTab);
            setIsLoginPage(false);
            return;
          }
          setCurrentTab(tab);
          setIsLoginPage(false);
        }}
        userRole={userRole}
        lang={lang}
        allowedTabs={allowedTabs}
        defaultLandingTab={defaultLandingTab}
        unreadComplaintsCount={
          adminComplaints.filter(
            (c) =>
              String(c.status || '').trim().toLowerCase() !== 'resolved' &&
              c.isReadByAdmin !== true
          ).length
        }
      />

      {/* MODALS */}
      {isRecordPaymentOpen && (
        <RecordPaymentModal
          members={members}
          settings={settings}
          initialMemberId={recordPaymentMemberId}
          isMasterAdmin={effectiveAccess.isMasterAdmin}
          recordedByName={currentUserName}
          recordedByEmail={currentUserEmail}
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

      {isBulkImportOpen &&
        hasAppPermission(
          effectiveAccess.permissions,
          'manage_members',
          effectiveAccess.isMasterAdmin
        ) && (
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

      {isSettingsOpen &&
        hasAppPermission(
          effectiveAccess.permissions,
          'manage_settings',
          effectiveAccess.isMasterAdmin
        ) && (
        <SettingsModal
          settings={settings}
          members={members}
          onSave={handleSaveSettings}
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
          isMasterAdmin={effectiveAccess.isMasterAdmin}
          recordedByName={currentUserName}
          recordedByEmail={currentUserEmail}
          onApprovePayment={handleApproveContribution}
          onDeletePayment={async (contributionId: string) => {
            await handleDeleteContribution(contributionId);
          }}
          onAddManualPayment={async (payment: Omit<Contribution, 'id'>) => {
            await handleSavePayment(payment);
          }}
        />
      )}

      {/* Batch Payment & Wallet Allocation Modal */}
      {isBatchPaymentOpen && (
        <BatchPaymentManagerModal
          isOpen={isBatchPaymentOpen}
          onClose={() => {
            setIsBatchPaymentOpen(false);
            setBatchPaymentPayerId(undefined);
          }}
          members={members}
          families={families}
          contributions={contributions}
          settings={settings}
          initialPayerId={batchPaymentPayerId}
          isMasterAdmin={effectiveAccess.isMasterAdmin}
          recordedByName={currentUserName}
          recordedByEmail={currentUserEmail}
          onBatchComplete={({ payerId, newWalletBalance, createdContributions }) => {
            updateMember(payerId, { walletBalance: newWalletBalance });
            if (createdContributions.length > 0) {
              createdContributions.forEach((c) => addContribution(c));
            }
            setMembers(getMembers());
            setContributions(getContributions());
          }}
          onDispatchTelegram={(payload) => setTelegramDispatchPayload(payload)}
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

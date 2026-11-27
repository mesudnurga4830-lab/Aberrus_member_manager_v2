/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Member, Contribution, SettingsRates, Family, UserRole, ContributionStatus, MasterReceipt, PaymentMethod, ComplaintRecord } from '../types';
import {
  subscribeToMemberContributions,
  matchMonthContribution,
  saveContributionToFirestore,
  saveComplaintToFirestore,
  triggerPaymentSummaryEmail,
  triggerProxyPaymentNotification,
  getMembersByFamilyName,
  getFamilyContributions,
  getMemberByLoginToken,
  updateCurrentMemberPassword,
  subscribeToMasterReceipts,
  saveMasterReceiptToFirestore,
  subscribeToComplaints,
} from '../firebase';
import { generateSvgQRCode } from '../utils/qrCode';
import {
  getCurrentEthiopianDate,
  getEthiopianMonthName,
  buildPaymentTimestamps,
  formatDisplayPaymentDateTime,
} from '../utils/ethiopianCalendar';
import {
  isPendingStatus,
  isPaidStatus,
  isPartialStatus,
  isPaidOrPartialStatus,
} from '../utils/storage';
import {
  User,
  Users,
  CreditCard,
  History,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  Send,
  Building2,
  ShieldCheck,
  Upload,
  MessageSquare,
  Sparkles,
  RefreshCw,
  QrCode,
  Image,
  X,
  Phone,
  Printer,
  Download,
  BadgeCheck,
  ExternalLink,
  Lock,
  LogOut,
  Search,
  Heart,
  ChevronRight,
  Gift,
  ArrowRight,
  KeyRound,
  Eye,
  EyeOff,
  Wallet,
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { shareAppLinkToMember } from '../utils/telegramShare';

interface MemberPortalProps {
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  currentMemberId: string;
  userRole?: UserRole;
  onSelectMember: (id: string) => void;
  onSubmitPaymentClaim: (claim: {
    memberId: string;
    month: number;
    amount: number;
    method: string;
    ref: string;
    type?: string;
    slipPhoto?: string | null;
    payerId?: string;
    payerName?: string;
    beneficiaryId?: string;
    beneficiaryName?: string;
    isProxyPayment?: boolean;
    status?: ContributionStatus;
  }) => void;
  lang?: 'am' | 'en';
  onNavigateToLogin?: () => void;
  onLogout?: () => void;
}

interface MonthGridItem {
  month: number; // 1-12
  year: number; // 2018 or 2019
  nameAm: string;
  nameEn: string;
  isCurrent: boolean;
}

export const MemberPortal: React.FC<MemberPortalProps> = ({
  members,
  families,
  contributions: initialPropContributions,
  settings,
  currentMemberId,
  userRole = 'member',
  onSelectMember,
  onSubmitPaymentClaim,
  lang = 'am',
  onNavigateToLogin,
  onLogout,
}) => {
  const isEn = lang === 'en';

  // Live real-time Firestore contributions state
  const [liveContributions, setLiveContributions] = useState<Contribution[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // Claim and Receipt submission state
  const [copiedBank, setCopiedBank] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<'ወርሃዊ' | 'ትውልድ'>('ወርሃዊ');
  const [selectedPayMonth, setSelectedPayMonth] = useState<number>(11); // Default to Hamle (11)
  const [claimedTxRef, setClaimedTxRef] = useState<string>('');
  const [claimedMethod, setClaimedMethod] = useState<string>('የኢትዮጵያ ንግድ ባንክ (CBE)');
  const [claimAmount, setClaimAmount] = useState<string>('');
  const [slipPhoto, setSlipPhoto] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [submittedAlert, setSubmittedAlert] = useState(false);
  const [submittedBatchAlert, setSubmittedBatchAlert] = useState(false);
  const [receiptUploadMode, setReceiptUploadMode] = useState<'single' | 'batch'>('single');
  const [batchIntendedNotes, setBatchIntendedNotes] = useState<string>('');
  const [myMasterReceipts, setMyMasterReceipts] = useState<MasterReceipt[]>([]);
  const [activeTabSubView, setActiveTabSubView] = useState<'overview' | 'family' | 'receipt' | 'proxyHistory' | 'complaint' | 'password'>('overview');

  // Change Password state (for individual member profile only)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [requiresRecentLogin, setRequiresRecentLogin] = useState(false);

  // Family state
  const [familyMembersList, setFamilyMembersList] = useState<Member[]>([]);
  const [familyContributionsList, setFamilyContributionsList] = useState<Contribution[]>([]);
  const [isLoadingFamily, setIsLoadingFamily] = useState<boolean>(false);

  // Proxy payment state (Pay for someone else)
  const [payingForTargetId, setPayingForTargetId] = useState<string>(currentMemberId || '');
  const [proxySearchQuery, setProxySearchQuery] = useState<string>('');
  const [proxyNoticeMessage, setProxyNoticeMessage] = useState<string | null>(null);

  // Complaint state
  const [complaintCategory, setComplaintCategory] = useState<string>('የክፍያ ማስተካከያ');
  const [complaintPhone, setComplaintPhone] = useState<string>('');
  const [complaintText, setComplaintText] = useState<string>('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [complaintSubmitted, setComplaintSubmitted] = useState<boolean>(false);
  const [complaintError, setComplaintError] = useState<string | null>(null);
  const [myComplaints, setMyComplaints] = useState<ComplaintRecord[]>([]);

  const membersRef = useRef<Member[]>(members);
  membersRef.current = members;

  // Inline fast-login for members if not yet resolved
  const [inlineLoginInput, setInlineLoginInput] = useState('');
  const [inlineLoginError, setInlineLoginError] = useState('');
  const [isInlineLoggingIn, setIsInlineLoggingIn] = useState(false);

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inlineLoginInput.trim();
    if (!clean) return;
    setIsInlineLoggingIn(true);
    setInlineLoginError('');
    try {
      const matched = await getMemberByLoginToken(clean);
      if (matched) {
        onSelectMember(matched.id);
        try {
          localStorage.setItem('abarrus_active_member_id', matched.id);
        } catch {}
      } else {
        setInlineLoginError(
          isEn
            ? 'Member not found. Please verify your Member ID (e.g. MEM-001) or phone number.'
            : 'አባል አልተገኘም። እባክዎ የአባል መለያ (ለምሳሌ MEM-001) ወይም ስልክ ቁጥርዎን ያረጋግጡ።'
        );
      }
    } catch (err: any) {
      setInlineLoginError(err.message || 'Error looking up member');
    } finally {
      setIsInlineLoggingIn(false);
    }
  };

  // Active Member Resolution
  const activeMember = members.find((m) => m.id === currentMemberId) || (userRole === 'admin' ? members[0] : null);
  const activeFamily = families.find((f) => f.id === activeMember?.familyId);

  // Proxy Beneficiary Resolution (Paying for myself vs someone else)
  const isProxyPayment = Boolean(payingForTargetId && activeMember && payingForTargetId !== activeMember.id);
  const activeBeneficiary: Member | null = isProxyPayment
    ? (members.find((m) => m.id === payingForTargetId) || familyMembersList.find((m) => m.id === payingForTargetId) || activeMember)
    : activeMember;

  // Rates calculation for active logged-in member
  const monthlyRate = activeMember
    ? activeMember.isMinor
      ? 0
      : activeMember.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[activeMember.generation] || 50
    : 50;

  const genPaymentRate = activeMember
    ? activeMember.isMinor || activeMember.isSpouse
      ? 0
      : settings.generationPayment[activeMember.generation] || 500
    : 500;

  // Target rates for payment calculation (dynamically adapts if paying for someone else)
  const targetMonthlyRate = activeBeneficiary
    ? activeBeneficiary.isMinor
      ? 0
      : activeBeneficiary.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[activeBeneficiary.generation] || 50
    : monthlyRate;

  const targetGenPaymentRate = activeBeneficiary
    ? activeBeneficiary.isMinor || activeBeneficiary.isSpouse
      ? 0
      : settings.generationPayment[activeBeneficiary.generation] || 500
    : genPaymentRate;

  // Load family members and contributions from Firestore
  useEffect(() => {
    if (!activeMember) return;
    setPayingForTargetId((prev) => (prev ? prev : activeMember.id));

    let isMounted = true;
    const fetchFamilyData = async () => {
      setIsLoadingFamily(true);
      try {
        const familyName = activeMember.familyName || '';
        const familyId = activeMember.familyId || '';

        // Query Firestore members collection by familyName
        const fetchedMembers = await getMembersByFamilyName(familyName, familyId);

        // Fallback filter from local members ref (avoids re-running effect on every members snapshot)
        const fallbackMembers = membersRef.current.filter(
          (m) =>
            (familyName && m.familyName && m.familyName.trim().toLowerCase() === familyName.trim().toLowerCase()) ||
            (familyId && m.familyId && m.familyId === familyId)
        );

        const memberMap = new Map<string, Member>();
        fallbackMembers.forEach((m) => memberMap.set(m.id, m));
        fetchedMembers.forEach((m) => memberMap.set(m.id, m));
        if (activeMember) memberMap.set(activeMember.id, activeMember);

        const mergedFamily = Array.from(memberMap.values());
        if (isMounted) {
          setFamilyMembersList(mergedFamily);
        }

        // Fetch family contributions to accurately calculate status of each family member
        const fetchedContribs = await getFamilyContributions(familyId);
        if (isMounted) {
          setFamilyContributionsList(fetchedContribs);
        }
      } catch (err) {
        console.warn('Error loading family members:', err);
      } finally {
        if (isMounted) setIsLoadingFamily(false);
      }
    };

    fetchFamilyData();
    return () => {
      isMounted = false;
    };
  }, [activeMember?.id, activeMember?.familyName, activeMember?.familyId]);

  // STEP A, B, C: REAL-TIME ON-SNAPSHOT SUBSCRIPTION & CONSOLE DIAGNOSIS
  useEffect(() => {
    if (!activeMember || !activeMember.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFirestoreError(null);

    // STEP A: DIAGNOSTIC LOGS
    console.log('[DIAGNOSE 1] Logged-in member Firestore document ID:', activeMember.id);
    console.log(
      `[DIAGNOSE 2] Exact contributions query: collection="contributions", field="memberId", filterValue="${activeMember.id}"`
    );

    // STEP C: Firestore onSnapshot listener
    const unsubscribe = subscribeToMemberContributions(
      activeMember.id,
      (docs) => {
        // STEP A 3, 4, 5 diagnostics
        console.log('[DIAGNOSE 3] Number of documents the query returned:', docs.length);
        console.log('[DIAGNOSE 4] Sample contribution document (raw):', docs[0] || 'No contribution docs found');
        console.log('[DIAGNOSE 5] Exact string value stored in "status" field:', docs[0]?.status ?? 'N/A');

        setLiveContributions(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error('[DIAGNOSE ERROR] Real-time subscription error:', err);
        setFirestoreError(err.message || 'Failed to fetch contributions from Firestore');
        setIsLoading(false);
      }
    );

    // STEP C: Proper useEffect cleanup
    return () => {
      unsubscribe();
    };
  }, [activeMember?.id]);

  // Subscribe to member's Master Receipts (Batch / Lump-Sum receipts)
  useEffect(() => {
    if (!activeMember?.id) {
      setMyMasterReceipts([]);
      return;
    }
    const unsub = subscribeToMasterReceipts(
      (allReceipts) => {
        setMyMasterReceipts(allReceipts.filter((r) => r.payerId === activeMember.id));
      },
      (err) => {
        console.warn('[MemberPortal] Master receipts listener error:', err);
      }
    );
    return () => unsub();
  }, [activeMember?.id]);

  // Subscribe to member's own complaints & admin responses
  useEffect(() => {
    if (!activeMember?.id) {
      setMyComplaints([]);
      return;
    }
    const unsub = subscribeToComplaints(
      (docs) => setMyComplaints(docs),
      (err) => console.warn('[MemberPortal] Complaints listener notice:', err),
      activeMember.id
    );
    return () => unsub();
  }, [activeMember?.id]);

  // STEP D: 12 ETHIOPIAN MONTHS STARTING FROM HAMLE 2018 (month 11, year 2018)
  const currentDate = getCurrentEthiopianDate();
  const currentEthMonth = currentDate.month;
  const currentEthYear = currentDate.year;

  const twelveMonthsList: MonthGridItem[] = [
    { month: 11, year: 2018, nameAm: 'ሀምሌ', nameEn: 'Hamle', isCurrent: currentEthMonth === 11 && currentEthYear === 2018 },
    { month: 12, year: 2018, nameAm: 'ነሐሴ', nameEn: 'Nehase', isCurrent: currentEthMonth === 12 && currentEthYear === 2018 },
    { month: 1, year: 2019, nameAm: 'መስከረም', nameEn: 'Meskerem', isCurrent: currentEthMonth === 1 && currentEthYear === 2019 },
    { month: 2, year: 2019, nameAm: 'ጥቅምት', nameEn: 'Tikimt', isCurrent: currentEthMonth === 2 && currentEthYear === 2019 },
    { month: 3, year: 2019, nameAm: 'ህዳር', nameEn: 'Hidar', isCurrent: currentEthMonth === 3 && currentEthYear === 2019 },
    { month: 4, year: 2019, nameAm: 'ታህሳስ', nameEn: 'Tahsas', isCurrent: currentEthMonth === 4 && currentEthYear === 2019 },
    { month: 5, year: 2019, nameAm: 'ጥር', nameEn: 'Tir', isCurrent: currentEthMonth === 5 && currentEthYear === 2019 },
    { month: 6, year: 2019, nameAm: 'የካቲት', nameEn: 'Yekatit', isCurrent: currentEthMonth === 6 && currentEthYear === 2019 },
    { month: 7, year: 2019, nameAm: 'መጋቢት', nameEn: 'Megabit', isCurrent: currentEthMonth === 7 && currentEthYear === 2019 },
    { month: 8, year: 2019, nameAm: 'ሚያዚያ', nameEn: 'Miazia', isCurrent: currentEthMonth === 8 && currentEthYear === 2019 },
    { month: 9, year: 2019, nameAm: 'ግንቦት', nameEn: 'Ginbot', isCurrent: currentEthMonth === 9 && currentEthYear === 2019 },
    { month: 10, year: 2019, nameAm: 'ሰኔ', nameEn: 'Sene', isCurrent: currentEthMonth === 10 && currentEthYear === 2019 },
  ];

  // Month-by-month matching results using robust helper
  const monthStatuses = twelveMonthsList.map((m) => {
    const match = matchMonthContribution(liveContributions, m.month, m.year, monthlyRate);
    return {
      ...m,
      status: match.status,
      contribution: match.contribution,
      paidAmount: match.paidAmount,
    };
  });

  const paidMonthsCount = monthStatuses.filter((m) => m.status === 'paid').length;
  const partialMonthsCount = monthStatuses.filter((m) => m.status === 'partial').length;
  const pendingMonthsCount = monthStatuses.filter((m) => m.status === 'pending').length;
  const unpaidMonthsCount = monthStatuses.filter((m) => m.status === 'unpaid').length;

  // Monthly progress calculation
  const monthlyProgressPercent = Math.min(Math.round((paidMonthsCount / 12) * 100), 100);

  // Birth contribution (የትውልድ መዋጮ) calculation
  const genContributions = liveContributions.filter((c: any) => {
    const t = String(c.type || '').trim().toLowerCase();
    return t === 'ትውልድ' || t === 'generation' || t.includes('ትውልድ');
  });

  const totalGenPaid = genContributions
    .filter((c: any) => {
      const s = String(c.status || '').trim().toLowerCase();
      return s === 'paid' || s === 'ተከፍሏል' || s === 'completed' || s === 'ከፊል' || s === 'partial';
    })
    .reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);

  const genProgressPercent = genPaymentRate > 0
    ? Math.min(Math.round((totalGenPaid / genPaymentRate) * 100), 100)
    : 100;

  // Outstanding dues
  const totalMonthlyUnpaidAmount = unpaidMonthsCount * monthlyRate;
  const totalGenUnpaidAmount = Math.max(genPaymentRate - totalGenPaid, 0);
  const totalOutstandingBalance = totalMonthlyUnpaidAmount + totalGenUnpaidAmount;

  // Proxy payments made by the active member for others
  const myProxyPayments = familyContributionsList
    .concat(liveContributions)
    .filter(
      (c, index, self) =>
        self.findIndex((other) => other.id === c.id) === index &&
        activeMember &&
        c.payerId === activeMember.id &&
        (c.beneficiaryId !== activeMember.id || c.isProxyPayment)
    );

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBank(label);
    setTimeout(() => setCopiedBank(null), 2000);
  };

  // Digital ID Card State & Handlers
  const [isDigitalIdModalOpen, setIsDigitalIdModalOpen] = useState(false);

  const handlePrintDigitalId = () => {
    window.print();
  };

  const handleDownloadDigitalId = () => {
    if (!activeMember) return;
    const cardEl = document.getElementById('digital-id-card-element');
    if (!cardEl) return;

    const htmlContent = `<!DOCTYPE html>
<html lang="am">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Abarrus Digital Member ID - ${activeMember.fullName} (${activeMember.id})</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      margin: 0;
      padding: 30px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #fff;
    }
    .wrapper {
      max-width: 480px;
      width: 100%;
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    @media print {
      body { background: white; padding: 0; }
      .wrapper { box-shadow: none; border: 1px solid #1B5E20; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    ${cardEl.innerHTML}
  </div>
  <p style="margin-top: 18px; font-size: 12px; color: #94a3b8; text-align: center;">
    ይህ ይፋዊ የአበሩስ አንድነት ማህበር ዲጂታል መታወቂያ ካርድ ነው። QR ኮዱን ስካን በማድረግ ማረጋገጥ ይቻላል።
  </p>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Abarrus_ID_${activeMember.id}_${activeMember.fullName.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate status summary for any member (for Family Dashboard)
  const getMemberStatusSummary = (member: Member) => {
    const isTargetActive = member.id === activeMember?.id;
    const memberContribs = isTargetActive
      ? liveContributions
      : familyContributionsList.filter((c) => c.memberId === member.id || c.beneficiaryId === member.id);

    const mRate = member.isMinor
      ? 0
      : member.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[member.generation] || 50;

    const gRate = member.isMinor || member.isSpouse
      ? 0
      : settings.generationPayment[member.generation] || 500;

    // Monthly paid count out of 12
    let paidCount = 0;
    twelveMonthsList.forEach((m) => {
      const match = matchMonthContribution(memberContribs, m.month, m.year, mRate);
      if (match.status === 'paid') paidCount++;
    });

    const monthPct = Math.min(Math.round((paidCount / 12) * 100), 100);

    // Gen paid amount
    const genPaid = memberContribs
      .filter((c: any) => {
        const t = String(c.type || '').trim().toLowerCase();
        const s = String(c.status || '').trim().toLowerCase();
        return (t === 'ትውልድ' || t.includes('ትውልድ')) && (s === 'paid' || s === 'ተከፍሏል' || s === 'completed');
      })
      .reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);

    const genPct = gRate > 0 ? Math.min(Math.round((genPaid / gRate) * 100), 100) : 100;

    return {
      monthlyRate: mRate,
      genPaymentRate: gRate,
      paidMonthsCount: paidCount,
      monthlyProgressPercent: monthPct,
      totalGenPaid: genPaid,
      genProgressPercent: genPct,
      isFullyPaid: paidCount === 12 && (gRate === 0 || genPaid >= gRate),
    };
  };

  // Start proxy payment for a specific family member
  const handleStartProxyPayment = (target: Member) => {
    setPayingForTargetId(target.id);
    const targetRate = target.isMinor
      ? 0
      : target.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[target.generation] || 50;
    setClaimAmount(`${targetRate}`);
    setActiveTabSubView('receipt');
    setProxyNoticeMessage(
      isEn
        ? `You are recording payment for ${target.fullName} (${target.id}). The receipt will be submitted for Admin approval.`
        : `ለ${target.fullName} (${target.id}) ክፍያ እየመዘገቡ ነው። ደረሰኙ ለአስተዳዳሪው ለማረጋገጫ 'Pending' በሚል ሁኔታ ይላካል።`
    );
    setTimeout(() => {
      document.getElementById('payment-claim-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Submit Receipt / Payment claim (supports both Single/Proxy and Batch Master Receipt)
  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimedTxRef.trim() || !activeMember) return;

    if (receiptUploadMode === 'batch') {
      const parsedTotal = parseFloat(claimAmount);
      if (!parsedTotal || parsedTotal <= 0) {
        setFirestoreError(
          isEn
            ? 'Please enter a valid lump-sum amount greater than 0 ETB.'
            : 'እባክዎ ከ0 በላይ የሆነ ትክክለኛ የጅምላ ክፍያ መጠን ያስገቡ።'
        );
        return;
      }

      setIsSubmittingPayment(true);
      setFirestoreError(null);
      try {
        const masterId = `MR-${Date.now()}`;
        const masterReceiptNumber = `M-RCPT-${Date.now().toString().slice(-6)}`;
        const ts = buildPaymentTimestamps();
        const newMasterReceipt: MasterReceipt = {
          id: masterId,
          receiptNumber: masterReceiptNumber,
          payerId: activeMember.id,
          payerName: activeMember.fullName,
          familyId: activeMember.familyId || 'FA001',
          familyName: activeMember.familyName || 'የአበሩስ ቤተሰብ',
          totalAmount: parsedTotal,
          allocatedAmount: 0,
          remainingBalance: parsedTotal,
          paymentMethod: claimedMethod as PaymentMethod,
          transactionRef: claimedTxRef.trim(),
          datePaid: ts.datePaid,
          slipPhoto: slipPhoto || null,
          status: 'Pending',
          walletCredited: false,
          notes:
            batchIntendedNotes.trim() ||
            'በአባሉ የቀረበ የጅምላ ደረሰኝ (Submitted via Member Portal for Batch Allocation)',
          createdAt: ts.paidAt,
          updatedAt: ts.paidAt,
          createdBy: 'member',
          recordedByName: activeMember.fullName,
          allocationsCount: 0,
        };

        await saveMasterReceiptToFirestore(newMasterReceipt);

        try {
          await triggerPaymentSummaryEmail({
            memberId: activeMember.id,
            memberName: activeMember.fullName,
            recipientEmail: 'mesudnurga4830@gmail.com',
            amount: parsedTotal,
            month: 0,
            monthName: 'የጅምላ ክፍያ ደረሰኝ (Batch)',
            year: 2018,
            type: 'የጅምላ ክፍያ ደረሰኝ (Master Receipt)',
            paymentMethod: claimedMethod,
            transactionRef: claimedTxRef.trim(),
            receiptNumber: masterReceiptNumber,
            notes: newMasterReceipt.notes,
          });
        } catch (notifErr) {
          console.warn('[MemberPortal] Batch email notice fallback:', notifErr);
        }

        try {
          confetti({
            particleCount: 70,
            spread: 75,
            origin: { y: 0.6 },
            colors: ['#1B5E20', '#FFD700', '#4CAF50'],
          });
        } catch {}

        setClaimedTxRef('');
        setClaimAmount('');
        setBatchIntendedNotes('');
        setSlipPhoto(null);
        setSubmittedBatchAlert(true);
        setTimeout(() => setSubmittedBatchAlert(false), 7000);
      } catch (err: any) {
        setFirestoreError(err?.message || 'Failed to submit batch receipt');
      } finally {
        setIsSubmittingPayment(false);
      }
      return;
    }

    const isProxy = Boolean(payingForTargetId && activeMember && payingForTargetId !== activeMember.id);
    const targetMember = isProxy ? (activeBeneficiary || activeMember) : activeMember;
    if (!targetMember) return;

    setIsSubmittingPayment(true);
    const defaultRate = paymentType === 'ትውልድ' ? targetGenPaymentRate : targetMonthlyRate;
    const parsedAmount = parseFloat(claimAmount) || defaultRate;

    const newContribId = `CON-${Date.now()}`;
    const ts = buildPaymentTimestamps();
    const newContribution: Contribution = {
      id: newContribId,
      memberId: targetMember.id,
      memberName: targetMember.fullName,
      familyId: targetMember.familyId || activeMember.familyId || 'FA001',
      familyName: targetMember.familyName || activeMember.familyName || 'የአበሩስ ቤተሰብ',
      generation: targetMember.generation,
      type: paymentType === 'ትውልድ' ? 'ትውልድ' : 'ወርሃዊ',
      ethiopianMonth: paymentType === 'ትውልድ' ? 0 : selectedPayMonth,
      ethiopianMonthName: paymentType === 'ትውልድ' ? 'የትውልድ መዋጮ' : getEthiopianMonthName(selectedPayMonth),
      ethiopianYear: 2018,
      amount: defaultRate,
      paidAmount: parsedAmount,
      status: 'Pending',
      intendedStatus: 'ተከፍሏል',
      paymentMethod: claimedMethod as any,
      transactionRef: claimedTxRef.trim(),
      datePaid: ts.datePaid,
      paidAt: ts.paidAt,
      recordedBy: activeMember.fullName,
      receiptNumber: `RCPT-${Date.now().toString().slice(-6)}`,
      notes: isProxy
        ? `ተኪ ክፍያ (Proxy): ከፋይ ${activeMember.fullName} (${activeMember.id}) ለ ${targetMember.fullName} (${targetMember.id}) — የዋና አድሚን ማረጋገጫ የሚጠብቅ`
        : slipPhoto
        ? 'ደረሰኝ ፎቶ ተያይዟል (Submitted via Member Portal — Pending Approval)'
        : 'Submitted via Member Portal (Pending Master Admin Approval)',
      slipPhoto: slipPhoto || null,
      payerId: activeMember.id,
      payerName: activeMember.fullName,
      beneficiaryId: targetMember.id,
      beneficiaryName: targetMember.fullName,
      isProxyPayment: isProxy,
    };

    // Immediate UI reactivity
    if (targetMember.id === activeMember.id) {
      setLiveContributions((prev) => [newContribution, ...prev]);
    }
    setFamilyContributionsList((prev) => [newContribution, ...prev]);

    onSubmitPaymentClaim({
      memberId: targetMember.id,
      month: paymentType === 'ትውልድ' ? 0 : selectedPayMonth,
      amount: parsedAmount,
      method: claimedMethod,
      ref: claimedTxRef.trim(),
      type: paymentType,
      slipPhoto: slipPhoto,
      payerId: activeMember.id,
      payerName: activeMember.fullName,
      beneficiaryId: targetMember.id,
      beneficiaryName: targetMember.fullName,
      isProxyPayment: isProxy,
      status: 'Pending',
    });

    // Save directly to Firestore contributions collection
    try {
      await saveContributionToFirestore(newContribution);
    } catch (saveErr) {
      console.warn('Could not save directly to Firestore:', saveErr);
    }

    // Trigger Telegram notification to beneficiary & Admin log if proxy payment
    if (isProxy) {
      try {
        await triggerProxyPaymentNotification({
          payerId: activeMember.id,
          payerName: activeMember.fullName,
          payerPhone: activeMember.phone,
          beneficiaryId: targetMember.id,
          beneficiaryName: targetMember.fullName,
          amount: parsedAmount,
          month: paymentType === 'ትውልድ' ? 0 : selectedPayMonth,
          monthName: paymentType === 'ትውልድ' ? 'የትውልድ መዋጮ' : getEthiopianMonthName(selectedPayMonth),
          year: 2018,
          type: paymentType === 'ትውልድ' ? 'የትውልድ መዋጮ' : 'ወርሃዊ መዋጮ',
          paymentMethod: claimedMethod,
          transactionRef: claimedTxRef.trim(),
        });
      } catch (proxyNotifErr) {
        console.warn('Proxy notification error:', proxyNotifErr);
      }
    } else {
      // Trigger automated email notice for direct self-payment
      try {
        await triggerPaymentSummaryEmail({
          memberId: activeMember.id,
          memberName: activeMember.fullName,
          recipientEmail: 'mesudnurga4830@gmail.com',
          amount: parsedAmount,
          month: paymentType === 'ትውልድ' ? 0 : selectedPayMonth,
          monthName: paymentType === 'ትውልድ' ? 'የትውልድ መዋጮ' : getEthiopianMonthName(selectedPayMonth),
          year: 2018,
          type: paymentType === 'ትውልድ' ? 'የትውልድ መዋጮ' : 'ወርሃዊ መዋጮ',
          paymentMethod: claimedMethod,
          transactionRef: claimedTxRef.trim(),
          receiptNumber: newContribution.receiptNumber,
          notes: `Submitted by ${activeMember.fullName}`,
        });
      } catch (notifErr) {
        console.warn('[MemberPortal] Notification notice:', notifErr);
      }
    }

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1B5E20', '#FFD700', '#4CAF50'],
      });
    } catch {}

    setClaimedTxRef('');
    setClaimAmount('');
    setSlipPhoto(null);
    setIsSubmittingPayment(false);
    setSubmittedAlert(true);
    setTimeout(() => setSubmittedAlert(false), 6000);
  };

  // Submit Complaint (100% In-App via Firestore)
  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintText.trim() || !activeMember) return;

    setIsSubmittingComplaint(true);
    setComplaintError(null);
    const phoneToUse = complaintPhone.trim() || activeMember.phone || '';
    const cleanMemberKey = String(activeMember.id || 'MEM').replace(/[^a-zA-Z0-9_-]/g, '_');
    const unifiedComplaintId = `comp_${Date.now()}_${cleanMemberKey}`;

    try {
      await saveComplaintToFirestore({
        id: unifiedComplaintId,
        memberId: activeMember.id,
        memberName: activeMember.fullName,
        category: complaintCategory,
        message: complaintText.trim(),
        phone: phoneToUse,
      });

      try {
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.7 },
          colors: ['#FF9800', '#1B5E20', '#FFD700'],
        });
      } catch {}

      setComplaintSubmitted(true);
      setComplaintText('');
      setTimeout(() => setComplaintSubmitted(false), 6000);
    } catch (err: any) {
      console.warn('[MemberPortal] Could not save complaint to Firestore:', err);
      setComplaintError(
        isEn
          ? 'Could not submit your complaint. Please check your connection and try again.'
          : 'ቅሬታዎን መመዝገብ አልተቻለም። እባክዎ ኢንተርኔትዎን አረጋግጠው ዳግም ይሞክሩ።'
      );
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  // Handle Member Password Change (Individual Member only)
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    setRequiresRecentLogin(false);

    // Rule 6: Admins cannot change passwords for members
    if (userRole === 'admin') {
      setPasswordError(
        isEn
          ? 'Admins cannot change passwords for members. Each member must do it from their own account.'
          : 'አስተዳዳሪዎች የአባላትን የይለፍ ቃል መቀየር አይችሉም። እያንዳንዱ አባል በራሱ አካውንት ብቻ መለወጥ አለበት።'
      );
      return;
    }

    // Validation 1: At least 6 characters
    if (!newPassword || newPassword.length < 6) {
      setPasswordError(
        isEn
          ? 'Password must be at least 6 characters long.'
          : 'አዲሱ የይለፍ ቃል ቢያንስ 6 ፊደላት ወይም ቁጥሮች መሆን አለበት።'
      );
      return;
    }

    // Validation 2: Passwords must match
    if (newPassword !== confirmPassword) {
      setPasswordError(
        isEn
          ? 'Passwords do not match. Please verify and re-type.'
          : 'ሁለቱም የይለፍ ቃሎች አይመሳሰሉም። እባክዎ በትክክል ያረጋግጡ።'
      );
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await updateCurrentMemberPassword(newPassword);
      setPasswordSuccess(
        isEn ? 'Password updated successfully!' : 'የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል!'
      );
      setNewPassword('');
      setConfirmPassword('');
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#1B5E20', '#FFD700', '#4CAF50'],
        });
      } catch {}
      setTimeout(() => {
        setPasswordSuccess(null);
      }, 7000);
    } catch (err: any) {
      console.error('Password change error:', err);
      if (
        err.message === 'auth/requires-recent-login' ||
        err.code === 'auth/requires-recent-login' ||
        String(err).includes('requires-recent-login')
      ) {
        setRequiresRecentLogin(true);
        setPasswordError(
          isEn
            ? 'For security reasons, please log out and log back in to change your password.'
            : 'ለደህንነት ሲባል የይለፍ ቃል ከመቀየርዎ በፊት እባክዎ ወጥተው በድጋሚ ይግቡ። (For security reasons, please log out and log back in to change your password.)'
        );
      } else {
        setPasswordError(err.message || (isEn ? 'Failed to update password.' : 'የይለፍ ቃል መቀየር አልተቻለም።'));
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // If no member is active / authenticated
  if (!activeMember) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl shadow-xl border-2 border-[#517DA2]/50 space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#1B5E20] flex items-center justify-center mx-auto border-2 border-[#1B5E20]/30 shadow-xs">
          <ShieldCheck className="w-8 h-8 text-[#1B5E20]" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-neutral-950">
            {isEn ? 'Authentication Required' : 'የአባል ማረጋገጫ ያስፈልጋል'}
          </h2>
          <p className="text-sm font-semibold text-neutral-900 mt-2">
            {isEn
              ? 'Please sign in with your registered phone number and password to view your member card and contributions.'
              : 'የአባልነት መታወቂያዎን እና የክፍያ ዝርዝርዎን ለመመልከት እባክዎ በስልክ ቁጥርዎ እና በይለፍ ቃልዎ ይግቡ።'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onNavigateToLogin) {
              onNavigateToLogin();
            } else if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }}
          className="w-full py-3.5 px-4 bg-[#155544] hover:bg-[#417E38] text-white text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md rounded-xl font-extrabold transition-colors"
        >
          <Lock className="w-4 h-4 text-[#FFD700]" />
          <span>{isEn ? 'Sign In to Member Portal' : 'ወደ አባል መግቢያ ገጽ ሂድ'}</span>
        </button>

        <div className="pt-2 border-t border-[#5A8FBB]/40 text-xs font-bold text-neutral-800">
          {isEn
            ? 'Default password is the last 4 digits of your phone number.'
            : 'ነባሪ የይለፍ ቃልዎ የስልክ ቁጥርዎ የመጨረሻ 4 አሃዞች ናቸው።'}
        </div>
      </div>
    );
  }

  const qrSvg = generateSvgQRCode(
    `ABARRUS-MEMBER:${activeMember.id}|${activeMember.fullName}|GEN:${activeMember.generation}`,
    140
  );
  const repliedComplaintsCount = myComplaints.filter(
    (c) => Boolean(c.adminResponse && c.adminResponse.trim())
  ).length;

  return (
    <div className="space-y-4 pb-16 page-fade-in max-w-7xl mx-auto">
      {/* 1. MEMBER PROFILE & BANNER CARD */}
      <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-[#155544] via-[#517DA2] to-[#83257B] text-white shadow-md border-2 border-[#1DAB61]/40 flex flex-col gap-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-[#1B5E20] text-[#FFD700] font-black text-2xl flex items-center justify-center shrink-0 shadow-sm ring-2 ring-[#FFD700]/50">
              {activeMember.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  {activeMember.fullName}
                </h2>
                <span className="text-xs font-mono font-extrabold bg-[#1DAB61] text-[#042116] px-2.5 py-0.5 rounded">
                  {activeMember.id}
                </span>
                {activeMember.isMinor && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white text-[#155544] font-extrabold">
                    {isEn ? 'Minor (Free)' : '18- (ነፃ)'}
                  </span>
                )}
                {activeMember.isSpouse && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#83257B] border border-white/40 text-white font-extrabold">
                    {isEn ? 'Spouse' : 'የትዳር አጋር'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-sm font-semibold text-white">
                  {isEn ? 'Family:' : 'ቤተሰብ፡'}{' '}
                  <strong className="text-white font-extrabold">{activeMember.familyName || 'የአበሩስ ቤተሰብ'}</strong>{' '}
                  · {activeMember.generation}
                  {isEn ? 'th Gen' : 'ኛ ትውልድ'}
                </p>
                <div className="inline-flex items-center gap-1.5 bg-white text-[#155544] border border-white/50 px-2.5 py-0.5 rounded-full text-xs font-extrabold shadow-2xs">
                  <Phone className="w-3.5 h-3.5 text-[#1B5E20]" />
                  <span className="font-mono">{activeMember.phone || (isEn ? 'No phone' : 'ስልክ የለም')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Switcher for Admin only, or Sub-tabs for Member */}
          <div className="flex items-center gap-2 self-start md:self-center flex-wrap">
            {userRole === 'admin' ? (
              <div className="flex items-center gap-2 bg-white/95 p-2 rounded-xl border border-white/40 shadow-xs">
                <label className="text-xs font-extrabold text-[#155544] whitespace-nowrap">
                  {isEn ? 'Switch Member:' : 'አባል ቀይር፡'}
                </label>
                <select
                  value={activeMember.id}
                  onChange={(e) => onSelectMember(e.target.value)}
                  className="text-xs font-extrabold bg-white border-2 border-[#5A8FBB]/50 rounded-lg px-2 py-1.5 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.generation}ኛ · {m.id})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTabSubView('password');
                    setTimeout(() => {
                      document.getElementById('change-password-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 50);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#417E38] hover:bg-[#155544] text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer border border-white/25"
                  title={isEn ? 'Change Password' : 'የይለፍ ቃል ቀይር'}
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#FFD700]" />
                  <span>{isEn ? 'Change Password' : 'የይለፍ ቃል ቀይር'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDigitalIdModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1DAB61] hover:bg-white text-[#042116] text-xs font-extrabold shadow-xs transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{isEn ? 'Export Digital ID' : 'ዲጂታል መታወቂያ'}</span>
                </button>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#155544] text-xs font-extrabold shadow-xs">
                  <ShieldCheck className="w-4 h-4 text-[#1B5E20]" />
                  <span>{isEn ? 'Verified Member' : 'የተረጋገጠ አባል'}</span>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#83257B] hover:bg-[#6a1d63] border border-white/30 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer"
                    title={isEn ? 'Sign Out' : 'ውጣ (Logout)'}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Logout' : 'ውጣ'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUB-VIEWS TAB NAVIGATION */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#5A8FBB]/15 rounded-2xl border-2 border-[#5A8FBB]/45 overflow-x-auto scrollbar-none shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTabSubView('overview')}
          className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTabSubView === 'overview'
              ? 'bg-[#155544] text-white shadow-sm'
              : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
          }`}
        >
          <User className="w-4 h-4" />
          <span>{isEn ? 'My Overview' : 'የእኔ መረጃ'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTabSubView('family')}
          className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTabSubView === 'family'
              ? 'bg-[#417E38] text-white shadow-sm'
              : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{isEn ? 'Family Dashboard' : 'የእኔ ቤተሰብ'}</span>
          {familyMembersList.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                activeTabSubView === 'family'
                  ? 'bg-[#1DAB61] text-[#042116]'
                  : 'bg-[#155544] text-white'
              }`}
            >
              {familyMembersList.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTabSubView('receipt');
            setTimeout(() => {
              document.getElementById('payment-claim-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTabSubView === 'receipt'
              ? 'bg-[#517DA2] text-white shadow-sm'
              : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>{isEn ? 'Record Payment' : 'ክፍያ መዝግብ'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTabSubView('proxyHistory')}
          className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTabSubView === 'proxyHistory'
              ? 'bg-[#83257B] text-white shadow-sm'
              : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
          }`}
        >
          <Heart className="w-4 h-4 text-rose-500" />
          <span>{isEn ? 'Payments for Others' : 'የተኪ ክፍያዎች ታሪክ'}</span>
          {myProxyPayments.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                activeTabSubView === 'proxyHistory'
                  ? 'bg-white text-[#83257B]'
                  : 'bg-[#83257B] text-white'
              }`}
            >
              {myProxyPayments.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTabSubView('complaint');
            setTimeout(() => {
              document.getElementById('complaint-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            activeTabSubView === 'complaint'
              ? 'bg-[#83257B] text-white shadow-sm'
              : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-amber-500" />
          <span>{isEn ? 'Complaints & Support' : 'ቅሬታና ድጋፍ'}</span>
          {repliedComplaintsCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#1DAB61] text-[#042116]">
              {repliedComplaintsCount} {isEn ? 'Reply' : 'መልስ'}
            </span>
          ) : myComplaints.length > 0 ? (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                activeTabSubView === 'complaint'
                  ? 'bg-white text-[#83257B]'
                  : 'bg-[#517DA2] text-white'
              }`}
            >
              {myComplaints.length}
            </span>
          ) : null}
        </button>

        {userRole !== 'admin' && (
          <button
            type="button"
            onClick={() => {
              setActiveTabSubView('password');
              setTimeout(() => {
                document.getElementById('change-password-section')?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
            className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTabSubView === 'password'
                ? 'bg-[#155544] text-white shadow-sm'
                : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
            }`}
          >
            <KeyRound className="w-4 h-4 text-[#FFD700]" />
            <span>{isEn ? 'Change Password' : 'የይለፍ ቃል ቀይር'}</span>
          </button>
        )}
      </div>

      {/* QUICK ACTIONS FOR MEMBERS: DIRECT SHORTCUTS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setActiveTabSubView('family')}
          className="p-3 bg-gradient-to-r from-[#155544] to-[#417E38] hover:from-[#104235] hover:to-[#34662c] text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-between transition-all cursor-pointer group border border-[#1DAB61]/40"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FFD700] text-[#1B5E20] flex items-center justify-center font-bold shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-[10px] text-white/95 font-bold">{isEn ? 'Family Group' : 'የእኔ ቤተሰብ'}</div>
              <div className="font-extrabold text-xs text-white truncate">{isEn ? 'Family Dashboard' : 'ቤተሰብ ዝርዝር'}</div>
            </div>
          </div>
          <span className="text-[10px] font-mono font-extrabold bg-white/25 px-1.5 py-0.5 rounded text-white group-hover:bg-white/35 transition-colors">
            {familyMembersList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTabSubView('receipt');
            setTimeout(() => {
              document.getElementById('payment-claim-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className="p-3 bg-[#417E38] hover:bg-[#155544] text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-between transition-all cursor-pointer group border border-[#1DAB61]/40"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FFD700] text-[#1B5E20] flex items-center justify-center font-bold shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-[10px] text-white/95 font-bold">{isEn ? 'Payment Slip' : 'ክፍያ መዝግብ'}</div>
              <div className="font-extrabold text-xs text-white truncate">{isEn ? 'Pay / Proxy Pay' : 'ክፍያ መዝግብ / ተኪ'}</div>
            </div>
          </div>
          <span className="text-[10px] font-extrabold bg-white/25 px-1.5 py-0.5 rounded text-white group-hover:bg-white/35 transition-colors">
            ↓
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsDigitalIdModalOpen(true)}
          className="p-3 bg-gradient-to-r from-[#517DA2] to-[#155544] hover:from-[#41688a] hover:to-[#104235] text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-between transition-all cursor-pointer group border border-[#5A8FBB]/50"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FFD700] text-[#1B5E20] flex items-center justify-center font-bold shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-[10px] text-white/95 font-bold">{isEn ? 'Digital Pass' : 'የአባልነት መታወቂያ'}</div>
              <div className="font-extrabold text-xs text-white truncate">{isEn ? 'Export ID' : 'ዲጂታል መታወቂያ'}</div>
            </div>
          </div>
          <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded text-white group-hover:bg-white/35 transition-colors">
            🪪
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTabSubView('complaint');
            setTimeout(() => {
              document.getElementById('complaint-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className="p-3 bg-[#83257B] hover:bg-[#6a1d63] text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-between transition-all cursor-pointer group border border-[#83257B]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white text-amber-600 flex items-center justify-center font-bold shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-[10px] text-white/95 font-bold">{isEn ? 'Support' : 'ድጋፍና ማስተካከያ'}</div>
              <div className="font-extrabold text-xs text-white truncate">
                {repliedComplaintsCount > 0
                  ? isEn
                    ? `Complaint (${repliedComplaintsCount} Reply)`
                    : `ቅሬታ (${repliedComplaintsCount} መልስ)`
                  : isEn
                  ? 'Complaint'
                  : 'ቅሬታ አቅርብ'}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono font-extrabold bg-white/25 px-1.5 py-0.5 rounded text-white group-hover:bg-white/35 transition-colors">
            {myComplaints.length > 0 ? myComplaints.length : '↓'}
          </span>
        </button>
      </div>

      {/* PROXY NOTICE BANNER */}
      {proxyNoticeMessage && (
        <div className="rounded-2xl bg-[#5A8FBB]/15 border-2 border-[#517DA2]/50 text-neutral-950 flex items-center justify-between gap-3 p-3.5 text-xs shadow-xs page-fade-in">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-extrabold">{proxyNoticeMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setProxyNoticeMessage(null)}
            className="text-neutral-950 font-extrabold p-1 rounded-md hover:bg-[#5A8FBB]/25 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CREDIT WALLET & MASTER RECEIPTS SUMMARY CARD */}
      {((activeMember.walletBalance || 0) > 0 || myMasterReceipts.length > 0) && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#1DAB61]/55 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-400 text-emerald-950 flex items-center justify-center shadow-xs shrink-0">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-neutral-950">
                  {isEn ? 'Member Credit Wallet & Batch Receipts' : 'የአባል ቀሪ ሂሳብ (Credit Wallet) እና የጅምላ ደረሰኞች'}
                </h4>
                <p className="text-[11px] font-semibold text-neutral-800">
                  {isEn
                    ? 'Unallocated credit from your lump-sum receipts stays safely in your balance.'
                    : 'ከትልቅ ደረሰኝዎ ያልተከፋፈለው ቀሪ ገንዘብ በቀጥታ በዚህ ሂሳብ ላይ ይጠበቃል።'}
                </p>
              </div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-[#155544] text-white flex items-center gap-3 shrink-0 shadow-xs">
              <span className="text-[11px] text-white font-bold">
                {isEn ? 'Remaining Balance:' : 'ቀሪ ሂሳብ፡'}
              </span>
              <span className="font-mono font-black text-lg text-[#1DAB61] tabular-nums">
                {Number(activeMember.walletBalance || 0).toLocaleString()} ብር
              </span>
            </div>
          </div>

          {myMasterReceipts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-[#5A8FBB]/35">
              {myMasterReceipts.slice(0, 6).map((mr) => (
                <div
                  key={mr.id}
                  className="p-2.5 rounded-xl bg-[#5A8FBB]/10 border border-[#5A8FBB]/45 text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-extrabold text-[#155544]">{mr.receiptNumber || mr.id}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        mr.status === 'Fully Allocated'
                          ? 'bg-[#1DAB61]/25 text-[#155544]'
                          : mr.status === 'Pending'
                          ? 'bg-[#83257B]/15 text-[#83257B]'
                          : 'bg-[#517DA2]/20 text-[#155544]'
                      }`}
                    >
                      {mr.status === 'Fully Allocated'
                        ? 'ሙሉ ተከፋፍሏል (Fully Allocated)'
                        : mr.status === 'Partially Allocated'
                        ? 'በከፊል ተከፋፍሏል (Partial)'
                        : mr.status === 'Credited to Wallet'
                        ? 'በሂሳብ ላይ (Credited)'
                        : 'በመጠባበቅ ላይ (Pending)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-neutral-900">
                    <span>ጠቅላላ: <strong className="font-mono text-neutral-950">{mr.totalAmount.toLocaleString()} ብር</strong></span>
                    <span>ቀሪ: <strong className="font-mono text-[#83257B]">{mr.remainingBalance.toLocaleString()} ብር</strong></span>
                  </div>
                  {mr.transactionRef && (
                    <div className="text-[10px] font-mono font-bold text-[#517DA2] truncate">
                      Ref: {mr.transactionRef}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1. FAMILY DASHBOARD TAB */}
      {activeTabSubView === 'family' && (
        <div className="space-y-4 page-fade-in">
          {/* Family Header Banner */}
          <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-[#155544] via-[#517DA2] to-[#83257B] text-white border-2 border-[#1DAB61]/40 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-[#FFD700] text-[#1B5E20] flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                  <Users className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-white bg-[#417E38] px-2.5 py-0.5 rounded-full">
                      {isEn ? 'Family Group' : 'የቤተሰብ ስብስብ'}
                    </span>
                    <span className="text-[10px] font-mono bg-white/25 text-white px-2.5 py-0.5 rounded-full font-extrabold">
                      {activeMember.familyId || 'FA001'}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                    {activeMember.familyName || 'የአበሩስ ቤተሰብ'}
                  </h3>
                  <p className="text-xs font-semibold text-white/95 mt-1">
                    {isEn
                      ? `Viewing all registered members of "${activeMember.familyName || 'Abarrus'}" family and their dues status.`
                      : `በ "${activeMember.familyName || 'የአበሩስ ቤተሰብ'}" ስር የተመዘገቡ የቤተሰብ አባላት ዝርዝር፣ የወርሃዊና የትውልድ ክፍያ ሁኔታ።`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <div className="px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur-xs border border-white/30 text-center">
                  <span className="text-[10px] text-white block uppercase font-extrabold">
                    {isEn ? 'Family Members' : 'የቤተሰብ አባላት'}
                  </span>
                  <span className="text-xl font-mono font-black text-white tabular-nums">
                    {familyMembersList.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Family Loading State */}
          {isLoadingFamily && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#5A8FBB]/45 animate-pulse space-y-3">
              <div className="h-6 bg-[#5A8FBB]/20 rounded w-1/4" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="h-44 bg-[#5A8FBB]/15 rounded-2xl" />
                <div className="h-44 bg-[#5A8FBB]/15 rounded-2xl" />
                <div className="h-44 bg-[#5A8FBB]/15 rounded-2xl" />
              </div>
              <p className="text-xs font-bold text-neutral-900 text-center flex items-center justify-center gap-1.5 pt-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B5E20]" />
                <span>{isEn ? 'Querying Firestore for family members...' : 'የቤተሰብ አባላት መረጃ ከFirestore እየተጫነ ነው...'}</span>
              </p>
            </div>
          )}

          {/* Empty Family State */}
          {!isLoadingFamily && familyMembersList.length === 0 && (
            <div className="p-8 text-center text-xs font-semibold text-neutral-900 bg-white rounded-2xl border-2 border-dashed border-[#5A8FBB]/50 space-y-2">
              <Users className="w-10 h-10 text-[#757575]/50 mx-auto" />
              <p className="font-extrabold text-sm text-neutral-950">
                {isEn ? 'No family members found' : 'ምንም የቤተሰብ አባላት አልተገኙም'}
              </p>
              <p>
                {isEn
                  ? `No other members share the family name "${activeMember.familyName}".`
                  : `በ "${activeMember.familyName}" የቤተሰብ ስም የተመዘገቡ ሌሎች አባላት አልተገኙም።`}
              </p>
            </div>
          )}

          {/* Family Members Grid / Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {familyMembersList.map((fMember) => {
              const fStatus = getMemberStatusSummary(fMember);
              const isSelf = fMember.id === activeMember.id;

              return (
                <div
                  key={fMember.id}
                  className={`bg-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between border-2 transition-all hover:shadow-md ${
                    isSelf ? 'border-[#155544] bg-[#1DAB61]/5' : 'border-[#5A8FBB]/45 hover:border-[#517DA2]'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Member Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${
                            isSelf
                              ? 'bg-[#1B5E20] text-[#FFD700] ring-2 ring-[#FFD700]'
                              : 'bg-neutral-800 text-white'
                          }`}
                        >
                          {fMember.fullName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-extrabold text-sm text-neutral-950 truncate">
                              {fMember.fullName}
                            </h4>
                            {isSelf && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#155544] text-white">
                                {isEn ? 'You' : 'እርስዎ'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-900 mt-0.5">
                            <span className="font-mono font-extrabold text-[#155544] bg-[#1DAB61]/20 px-1.5 py-0.5 rounded text-[10px]">
                              {fMember.id}
                            </span>
                            <span>· {fMember.generation}ኛ ትውልድ</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {fMember.isMinor && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#5A8FBB]/20 text-[#071E33] font-extrabold">
                            18- (ነፃ)
                          </span>
                        )}
                        {fMember.isSpouse && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#83257B]/15 text-[#83257B] font-extrabold">
                            የትዳር አጋር
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div className="flex items-center gap-1.5 text-xs text-neutral-950 bg-[#5A8FBB]/10 px-2.5 py-1.5 rounded-lg border border-[#5A8FBB]/35">
                      <Phone className="w-3.5 h-3.5 text-[#1B5E20]" />
                      <span className="font-mono text-xs font-extrabold">
                        {fMember.phone || (isEn ? 'No phone' : 'ስልክ አልተመዘገበም')}
                      </span>
                    </div>

                    {/* Monthly Payment Status */}
                    <div className="space-y-1.5 pt-1 border-t border-[#5A8FBB]/30">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-neutral-900">
                          {isEn ? 'Monthly Dues:' : 'የወርሃዊ መዋጮ ሁኔታ፡'}
                        </span>
                        <strong className="font-mono font-extrabold text-[#155544] tabular-nums">
                          {fStatus.paidMonthsCount} / 12 {isEn ? 'Months' : 'ወራት'} ({fStatus.monthlyProgressPercent}%)
                        </strong>
                      </div>
                      {/* Visual progress bar */}
                      <div className="w-full bg-[#5A8FBB]/20 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            fStatus.paidMonthsCount === 12
                              ? 'bg-[#1DAB61]'
                              : fStatus.paidMonthsCount > 0
                              ? 'bg-gradient-to-r from-[#517DA2] to-[#1DAB61]'
                              : 'bg-[#83257B]'
                          }`}
                          style={{ width: `${fStatus.monthlyProgressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-neutral-900">
                        <span>{fStatus.monthlyRate} ብር/ወር</span>
                        {fStatus.paidMonthsCount < 12 ? (
                          <span className="text-[#83257B] font-extrabold">
                            {12 - fStatus.paidMonthsCount} ወራት ቀሪ ({(12 - fStatus.paidMonthsCount) * fStatus.monthlyRate} ብር)
                          </span>
                        ) : (
                          <span className="text-[#417E38] font-extrabold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> ሙሉ በሙሉ ተከፍሏል
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Birth Contribution Status */}
                    <div className="space-y-1.5 pt-1 border-t border-[#5A8FBB]/30">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-neutral-900">
                          {isEn ? 'Birth Contribution:' : 'የትውልድ መዋጮ፡'}
                        </span>
                        <strong className="font-mono font-extrabold text-[#517DA2] tabular-nums">
                          {fStatus.totalGenPaid} / {fStatus.genPaymentRate} ብር ({fStatus.genProgressPercent}%)
                        </strong>
                      </div>
                      {/* Visual progress bar */}
                      <div className="w-full bg-[#5A8FBB]/20 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#517DA2] to-[#83257B] rounded-full transition-all duration-500"
                          style={{ width: `${fStatus.genProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* PROXY PAYMENT BUTTON: "Pay For [Name]" */}
                  <div className="pt-3 mt-3 border-t border-[#5A8FBB]/30">
                    <button
                      type="button"
                      onClick={() => handleStartProxyPayment(fMember)}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs ${
                        isSelf
                          ? 'bg-[#155544] hover:bg-[#417E38] text-white'
                          : 'bg-gradient-to-r from-[#517DA2] to-[#155544] hover:from-[#155544] hover:to-[#417E38] text-white'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-[#FFD700]" />
                      <span>
                        {isSelf
                          ? isEn
                            ? 'Record Payment for Myself'
                            : 'ለራሴ ክፍያ መዝግብ'
                          : isEn
                          ? `Pay For ${fMember.fullName.split(' ')[0]}`
                          : `ለ${fMember.fullName.split(' ')[0]} ክፈል`}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#FFD700]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. PAYMENTS FOR OTHERS (PROXY HISTORY) TAB */}
      {activeTabSubView === 'proxyHistory' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#83257B]/45 shadow-sm space-y-4 page-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#5A8FBB]/30 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500" />
                <h3 className="text-lg font-extrabold text-neutral-950">
                  {isEn ? 'Payments Made for Others (Proxy History)' : 'ለሌሎች አባላት የተከፈሉ ተኪ ክፍያዎች'}
                </h3>
              </div>
              <p className="text-xs font-semibold text-neutral-800 mt-0.5">
                {isEn
                  ? 'History of payments and dues you contributed on behalf of family members or others.'
                  : 'ለቤተሰብዎ ወይም ለሌሎች አባላት የከፈሏቸው መዋጮዎች እና የማረጋገጫ ሁኔታ።'}
              </p>
            </div>
            <span className="text-xs font-mono font-extrabold px-3 py-1 rounded-full bg-[#83257B] text-white self-start sm:self-center">
              {myProxyPayments.length} {isEn ? 'Records' : 'ደረሰኞች'}
            </span>
          </div>

          {myProxyPayments.length === 0 ? (
            <div className="p-8 text-center text-xs font-semibold text-neutral-900 bg-[#5A8FBB]/10 rounded-2xl border-2 border-dashed border-[#5A8FBB]/50 space-y-2">
              <Users className="w-8 h-8 text-[#757575]/60 mx-auto" />
              <p className="font-extrabold text-sm text-neutral-950">
                {isEn ? 'No proxy payments recorded yet' : 'እስካሁን ለሌላ ሰው የተከፈለ ተኪ ክፍያ የለም'}
              </p>
              <p>
                {isEn
                  ? 'You can pay on behalf of family members via the "Family" tab.'
                  : 'በ"የእኔ ቤተሰብ" ገጽ በመሄድ ለቤተሰብዎ አባላት ክፍያ መፈጸም ይችላሉ።'}
              </p>
              <button
                type="button"
                onClick={() => setActiveTabSubView('family')}
                className="bg-[#155544] hover:bg-[#417E38] text-white py-2 px-4 text-xs font-extrabold rounded-xl mt-2 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{isEn ? 'Go to Family Dashboard' : 'ወደ ቤተሰብ ዳሽቦርድ ሂድ'}</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#5A8FBB]/40">
              <table className="w-full text-left text-xs text-neutral-950">
                <thead className="bg-[#155544] text-white font-extrabold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-3">የተከፈለለት አባል (Beneficiary)</th>
                    <th className="py-3 px-3">ዓይነት / ወር</th>
                    <th className="py-3 px-3">የተከፈለ መጠን</th>
                    <th className="py-3 px-3">ቀንና ሰዓት</th>
                    <th className="py-3 px-3">የክፍያ ዘዴ</th>
                    <th className="py-3 px-3">ማረጋገጫ Ref</th>
                    <th className="py-3 px-3">የማረጋገጫ ሁኔታ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#5A8FBB]/25">
                  {myProxyPayments.map((p, i) => (
                    <tr key={`${p.id}-${i}`} className={i % 2 === 0 ? 'bg-white hover:bg-[#5A8FBB]/10 transition-colors' : 'bg-[#5A8FBB]/5 hover:bg-[#5A8FBB]/15 transition-colors'}>
                      <td className="py-2.5 px-3">
                        <div className="font-extrabold text-neutral-950">
                          {p.beneficiaryName || p.memberName || p.beneficiaryId || p.memberId}
                        </div>
                        <span className="font-mono text-[10px] text-[#155544] bg-[#1DAB61]/20 px-1.5 py-0.5 rounded font-extrabold">
                          {p.beneficiaryId || p.memberId}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-extrabold text-[#517DA2] block">{p.type}</span>
                        <span className="text-[10px] font-bold text-neutral-900">
                          {p.ethiopianMonthName || p.ethiopianMonth} {p.ethiopianYear} ዓ.ም
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-extrabold text-[#155544] tabular-nums">
                        {p.paidAmount || p.amount} ብር
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-neutral-900">
                        {formatDisplayPaymentDateTime(p.datePaid, p.paidAt)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-neutral-900">{p.paymentMethod || 'CBE'}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-[#517DA2]">
                        {p.transactionRef || p.receiptNumber || p.id}
                      </td>
                      <td className="py-2.5 px-3">
                        {isPendingStatus(p.status) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/40">
                            <Clock className="w-3 h-3" />
                            <span>በመጠባበቅ ላይ (Pending)</span>
                          </span>
                        ) : isPartialStatus(p.status) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#517DA2]/20 text-[#071E33] border border-[#517DA2]/50">
                            <span>ከፊል (Partial)</span>
                          </span>
                        ) : isPaidStatus(p.status) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#1DAB61]/25 text-[#155544] border border-[#1DAB61]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{p.status || 'ተከፍሏል'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#83257B] text-white">
                            <span>{p.status || 'ያልተከፈለ'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. CHANGE PASSWORD CARD / SECTION (INDIVIDUAL MEMBER PROFILE ONLY - NOT VISIBLE TO ADMINS) */}
      {userRole !== 'admin' && (activeTabSubView === 'password' || activeTabSubView === 'overview') && (
        <div
          id="change-password-section"
          className="scroll-mt-6 rounded-2xl p-4 sm:p-5 border-2 border-[#517DA2]/50 bg-white shadow-md relative overflow-hidden page-fade-in"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b-2 border-[#5A8FBB]/30 gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E20] border border-[#1B5E20]/20 flex items-center justify-center font-bold shrink-0">
                <KeyRound className="w-5 h-5 text-[#1B5E20]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-base text-neutral-950">
                    {isEn ? 'Change Password' : 'የይለፍ ቃል ቀይር'}
                  </h4>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#1DAB61]/20 text-[#155544] border border-[#1DAB61]">
                    {isEn ? 'Personal Account Security' : 'የአካውንት ደህንነት'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-neutral-800 mt-0.5">
                  {isEn
                    ? 'Update your personal member account login password.'
                    : 'የግል አባልነት መግቢያ የይለፍ ቃልዎን እዚህ ይቀይሩ።'}
                </p>
              </div>
            </div>

            <div className="text-xs text-neutral-900 self-start sm:self-center font-bold">
              <span className="inline-flex items-center gap-1 text-[11px] bg-[#5A8FBB]/15 px-2.5 py-1 rounded-md text-[#155544] font-extrabold">
                <Lock className="w-3 h-3 text-[#1B5E20]" />
                <span>{isEn ? 'Min. 6 characters' : 'ቢያንስ 6 ፊደላት/ቁጥሮች'}</span>
              </span>
            </div>
          </div>

          {/* Success Toast / Notification */}
          {passwordSuccess && (
            <div className="p-3.5 mb-4 bg-[#1DAB61]/15 border-2 border-[#1DAB61] text-[#155544] rounded-xl text-xs flex items-center gap-2.5 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="font-extrabold">{passwordSuccess}</div>
            </div>
          )}

          {/* Error / Recent Login Prompt */}
          {passwordError && (
            <div className="p-3.5 mb-4 bg-[#83257B]/10 border-2 border-[#83257B]/50 text-[#83257B] rounded-xl text-xs space-y-2 shadow-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-extrabold">{passwordError}</span>
              </div>
              {requiresRecentLogin && onLogout && (
                <div className="pt-2 border-t border-[#83257B]/30 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[11px] font-bold text-neutral-950">
                    {isEn
                      ? 'Please sign out and sign back in with your phone and password, then return here to update it.'
                      : 'እባክዎ አሁን ይውጡና በስልክዎ ገብተው የይለፍ ቃልዎን ይቀይሩ።'}
                  </p>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-3 py-1.5 bg-[#83257B] hover:bg-[#6a1d63] text-white rounded-lg text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Log Out and Re-login' : 'ውጣና በድጋሚ ግባ'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Field 1: New Password */}
              <div>
                <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                  {isEn ? 'New Password:' : 'አዲስ የይለፍ ቃል (New Password)፡'}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder={isEn ? 'At least 6 characters' : 'ቢያንስ 6 ፊደላት ወይም ቁጥሮች'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full text-xs font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2.5 pr-9 text-neutral-950 focus:ring-2 focus:ring-[#155544] focus:bg-white transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2.5 text-neutral-800 hover:text-neutral-950 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] font-bold text-neutral-800 mt-1 block">
                  {isEn ? 'Must be 6+ characters' : 'ቢያንስ 6 አሃዞች/ፊደላት መሆን አለበት'}
                </span>
              </div>

              {/* Field 2: Confirm New Password */}
              <div>
                <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                  {isEn ? 'Confirm New Password:' : 'አዲሱን የይለፍ ቃል ያረጋግጡ (Confirm)፡'}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder={isEn ? 'Re-type new password' : 'አዲሱን የይለፍ ቃል ድጋሚ ይጻፉ'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full text-xs font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2.5 pr-9 text-neutral-950 focus:ring-2 focus:ring-[#155544] focus:bg-white transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2.5 text-neutral-800 hover:text-neutral-950 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword && (
                  <span
                    className={`text-[10px] font-extrabold mt-1 flex items-center gap-1 ${
                      newPassword === confirmPassword ? 'text-[#417E38]' : 'text-[#83257B]'
                    }`}
                  >
                    {newPassword === confirmPassword ? (
                      <>
                        <Check className="w-3 h-3 text-[#1B5E20]" />
                        <span>{isEn ? 'Passwords match' : 'የይለፍ ቃሎች ይጣጣማሉ'}</span>
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3 text-red-500" />
                        <span>{isEn ? 'Passwords do not match' : 'የይለፍ ቃሎች አይመሳሰሉም'}</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="bg-[#155544] hover:bg-[#417E38] text-white rounded-xl py-2.5 px-6 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 transition-colors"
              >
                {isUpdatingPassword ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[#FFD700]" />
                )}
                <span>
                  {isUpdatingPassword
                    ? isEn ? 'Updating Password...' : 'የይለፍ ቃል እየተቀየረ ነው...'
                    : isEn ? 'Save New Password' : 'አዲሱን የይለፍ ቃል መዝግብ'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError(null);
                }}
                className="py-2.5 px-4 rounded-xl text-xs font-extrabold text-neutral-900 border border-[#517DA2]/40 hover:bg-[#5A8FBB]/15 transition-colors cursor-pointer"
              >
                {isEn ? 'Clear' : 'አጽዳ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP E: FIRESTORE LOADING & ERROR STATES */}
      {isLoading && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#5A8FBB]/45 animate-pulse space-y-3">
          <div className="h-6 bg-[#5A8FBB]/20 rounded w-1/3" />
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#5A8FBB]/15 rounded-xl" />
            ))}
          </div>
          <p className="text-xs font-bold text-neutral-900 text-center mt-2 flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B5E20]" />
            <span>{isEn ? 'Syncing live payment data from Firestore...' : 'የቀጥታ ክፍያ መረጃዎች ከFirestore እየተጫኑ ነው...'}</span>
          </p>
        </div>
      )}

      {firestoreError && (
        <div className="bg-[#83257B]/10 rounded-2xl p-4 border-2 border-[#83257B] text-[#83257B] flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="text-sm">
            <p className="font-extrabold">{isEn ? 'Database Query Notice' : 'የመረጃ መጫን ማስታወሻ'}</p>
            <p className="text-xs font-bold text-neutral-950">{firestoreError}</p>
          </div>
        </div>
      )}

      {/* 2. MONTHLY PAYMENT GRID (PART 1 & PART 2) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#5A8FBB]/45 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b-2 border-[#5A8FBB]/30 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#155544]" />
              <h3 className="text-lg font-extrabold text-neutral-950">
                {isEn ? 'Monthly Contributions Grid (Hamle 2018 - Current)' : 'የወርሃዊ መዋጮ ሁኔታ (ከሀምሌ 2018 ጀምሮ)'}
              </h3>
            </div>
            <p className="text-xs font-semibold text-neutral-800 mt-0.5">
              {isEn
                ? 'All 12 Ethiopian months starting from Hamle 2018 (month 11, year 2018). Live from Firestore.'
                : 'ከሀምሌ 01፣ 2018 ዓ.ም ጀምሮ ያሉ 12ቱ ወራት የቀጥታ የክፍያ ሁኔታ።'}
            </p>
          </div>

          {/* Summary Badges */}
          <div className="flex items-center flex-wrap gap-2 text-xs font-extrabold">
            <span className="px-2.5 py-1 rounded-md bg-[#1DAB61]/20 text-[#155544] border border-[#1DAB61] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4CAF50]" />
              <span>{paidMonthsCount} {isEn ? 'Paid' : 'ተከፍሏል'}</span>
            </span>
            {pendingMonthsCount > 0 && (
              <span className="px-2.5 py-1 rounded-md bg-[#5A8FBB]/20 text-[#071E33] border border-[#517DA2]/50 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>{pendingMonthsCount} {isEn ? 'Pending' : 'በመጠባበቅ'}</span>
              </span>
            )}
            <span className="px-2.5 py-1 rounded-md bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/40 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-[#F44336]" />
              <span>{unpaidMonthsCount} {isEn ? 'Unpaid' : 'ያልተከፈለ'}</span>
            </span>
          </div>
        </div>

        {/* THE RESPONSIVE GRID: 4x3 on mobile, 6x2 on tablet, 12x1 on desktop */}
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2.5 sm:gap-3">
          {monthStatuses.map((item) => {
            const isPaid = item.status === 'paid';
            const isPartial = item.status === 'partial';
            const isPending = item.status === 'pending';
            const isUnpaid = item.status === 'unpaid';

            return (
              <div
                key={`${item.year}-${item.month}`}
                className={`month-cell rounded-xl p-2.5 flex flex-col items-center justify-between text-center relative aspect-square transition-all duration-300 ${
                  item.isCurrent
                    ? 'border-2 border-[#1DAB61] ring-2 ring-[#1DAB61]/35'
                    : 'border'
                } ${
                  isPaid
                    ? 'bg-[#417E38] text-white border-[#155544] shadow-xs'
                    : isPending
                    ? 'bg-[#5A8FBB]/20 text-[#071E33] border-[#517DA2]'
                    : isPartial
                    ? 'bg-[#517DA2]/20 text-neutral-950 border-[#517DA2]'
                    : 'bg-[#83257B]/15 text-neutral-950 border-[#83257B]/40'
                }`}
              >
                {/* Month Name Top */}
                <div className="w-full">
                  <span
                    className={`block text-xs font-extrabold truncate ${
                      isPaid ? 'text-white' : 'text-neutral-950'
                    }`}
                  >
                    {isEn ? item.nameEn : item.nameAm}
                  </span>
                  <span
                    className={`block text-[10px] font-mono font-bold leading-none ${
                      isPaid ? 'text-white/95' : 'text-neutral-900'
                    }`}
                  >
                    {item.year}
                  </span>
                </div>

                {/* Status Icon Below */}
                <div className="my-auto py-1">
                  {isPaid && (
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-white font-extrabold text-base leading-none">✓</span>
                    </div>
                  )}
                  {isPending && (
                    <div className="w-7 h-7 rounded-full bg-amber-500/25 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-amber-800" />
                    </div>
                  )}
                  {isPartial && (
                    <div className="w-7 h-7 rounded-full bg-[#FF9800]/20 flex items-center justify-center">
                      <span className="text-[#FF9800] font-black text-sm leading-none">◐</span>
                    </div>
                  )}
                  {isUnpaid && (
                    <div className="w-7 h-7 rounded-full bg-[#F44336]/15 flex items-center justify-center">
                      <span className="text-[#F44336] font-extrabold text-sm leading-none">✗</span>
                    </div>
                  )}
                </div>

                {/* Status Text & Amount Bottom */}
                <div className="w-full">
                  <span
                    className={`block text-[10px] font-extrabold uppercase tracking-tight truncate ${
                      isPaid
                        ? 'text-white'
                        : isPending
                        ? 'text-[#071E33]'
                        : isPartial
                        ? 'text-[#155544]'
                        : 'text-[#83257B]'
                    }`}
                  >
                    {isPaid
                      ? isEn
                        ? 'Paid'
                        : 'ተከፍሏል'
                      : isPending
                      ? isEn
                        ? 'Pending'
                        : 'በመጠባበቅ'
                      : isPartial
                      ? isEn
                        ? 'Partial'
                        : 'ከፊል'
                      : isEn
                      ? 'Unpaid'
                      : 'ያልተከፈለ'}
                  </span>
                </div>

                {/* Current Month Badge */}
                {item.isCurrent && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[#1DAB61] rounded-full border-2 border-white shadow-2xs" />
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center sm:justify-start gap-4 mt-4 pt-3 border-t border-[#5A8FBB]/35 text-xs font-bold text-neutral-950 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#417E38] text-white flex items-center justify-center text-[10px] font-bold">✓</span>
            <span>{isEn ? 'Paid' : 'ተከፍሏል'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#5A8FBB]/25 text-amber-800 border border-[#517DA2] flex items-center justify-center">
              <Clock className="w-2.5 h-2.5" />
            </span>
            <span>{isEn ? 'Pending Approval' : 'በመጠባበቅ ላይ (Pending)'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#517DA2]/25 text-[#FF9800] border border-[#517DA2] flex items-center justify-center text-[10px] font-bold">◐</span>
            <span>{isEn ? 'Partial' : 'ከፊል የተከፈለ'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/50 flex items-center justify-center text-[10px] font-bold">✗</span>
            <span>{isEn ? 'Unpaid' : 'ያልተከፈለ'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border-2 border-[#1DAB61] bg-white" />
            <span>{isEn ? 'Current Month' : 'የአሁኑ ወር'}</span>
          </div>
        </div>
      </div>

      {/* 3. PROGRESS BARS (PART 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* A. BIRTH CONTRIBUTION PROGRESS BAR (የትውልድ ቋሚ መዋጮ) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#5A8FBB]/45 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-neutral-900">
                {isEn ? 'Birth / Generation Contribution' : 'የትውልድ ቋሚ መዋጮ'}
              </span>
              <span className="text-xs font-extrabold text-white bg-[#517DA2] px-2.5 py-0.5 rounded-full">
                {activeMember.generation}{isEn ? 'th Generation' : 'ኛ ትውልድ'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-2xl font-extrabold font-mono text-neutral-950 tabular-nums">
                {totalGenPaid.toLocaleString()} <span className="text-sm font-bold text-neutral-800">ብር</span>
              </p>
              <span className="text-xs font-bold text-neutral-900">
                {isEn ? 'Target:' : 'ከሚፈለገው'} {genPaymentRate.toLocaleString()} ብር
              </span>
            </div>

            {/* Rounded bar with 6-color emerald gradient with percentage inside */}
            <div className="w-full h-6 bg-[#5A8FBB]/20 rounded-full overflow-hidden mt-3 relative p-0.5 shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max(genProgressPercent, 8)}%`,
                  background: 'linear-gradient(90deg, #155544 0%, #417E38 60%, #1DAB61 100%)',
                }}
              >
                <span className="text-[11px] font-extrabold text-white drop-shadow-xs font-mono">
                  {genProgressPercent}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#5A8FBB]/35 text-xs font-bold text-neutral-900 flex items-center justify-between">
            <span>{isEn ? 'Remaining Balance:' : 'የቀረ ቀሪ እዳ፡'}</span>
            <strong className="text-[#83257B] font-mono font-extrabold tabular-nums">
              {totalGenUnpaidAmount.toLocaleString()} ብር
            </strong>
          </div>
        </div>

        {/* B. MONTHLY CIRCULAR PROGRESS RING */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#517DA2]/45 shadow-sm flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-extrabold text-neutral-900">
              {isEn ? 'Annual Monthly Progress' : 'የዓመቱ ወርሃዊ መዋጮ ስኬት'}
            </span>
            <p className="text-2xl font-extrabold font-mono text-neutral-950 tabular-nums">
              {(paidMonthsCount * monthlyRate).toLocaleString()} <span className="text-sm font-bold text-neutral-800">ብር</span>
            </p>
            <p className="text-xs font-bold text-neutral-900">
              {paidMonthsCount} / 12 {isEn ? 'months paid' : 'ወራት ተከፍለዋል'} (
              {monthlyRate} ብር/ወር)
            </p>
            <p className={`text-xs font-extrabold mt-1 ${totalMonthlyUnpaidAmount > 0 ? 'text-[#83257B]' : 'text-[#417E38]'}`}>
              {totalMonthlyUnpaidAmount > 0
                ? `${totalMonthlyUnpaidAmount.toLocaleString()} ብር ያልተከፈለ ቀሪ እዳ`
                : 'ሁሉም ወራት ተከፍለዋል! እናመሰግናለን።'}
            </p>
          </div>

          {/* SVG Circular Progress Ring */}
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <path
                className="text-[#5A8FBB]/25"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {/* Progress circle */}
              <path
                className="text-[#155544] transition-all duration-700 ease-out"
                strokeDasharray={`${monthlyProgressPercent}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-base font-extrabold text-[#155544] font-mono leading-none">
                {monthlyProgressPercent}%
              </span>
              <span className="text-[10px] text-neutral-900 font-extrabold">
                {paidMonthsCount}/12
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. CBE BANK ACCOUNT CARD (OFFICIAL PAYMENT DETAILS) */}
      <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-[#155544] via-[#517DA2] to-[#83257B] text-white border-2 border-[#1DAB61]/50 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#FFD700]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-white bg-[#417E38] px-2.5 py-0.5 rounded-full">
                {isEn ? 'Official Association Bank Account' : 'የአበሩስ አንድነት ማህበር ይፋዊ የባንክ ሂሳብ'}
              </span>
            </div>
            <h4 className="text-lg font-extrabold text-white pt-0.5">
              {isEn ? 'Commercial Bank of Ethiopia (CBE)' : 'የኢትዮጵያ ንግድ ባንክ (CBE)'}
            </h4>
            <div className="flex items-center gap-3 pt-1">
              <div>
                <span className="text-[11px] font-bold text-white/95 block">{isEn ? 'Account Number:' : 'የሂሳብ ቁጥር፡'}</span>
                <p className="text-2xl font-mono font-extrabold text-white tracking-wider">
                  1000778285146
                </p>
              </div>
              <button
                onClick={() => handleCopy('1000778285146', 'account')}
                className="mt-3 px-3 py-1.5 rounded-lg bg-[#1DAB61] hover:bg-white text-[#042116] text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                {copiedBank === 'account' ? <Check className="w-4 h-4 text-[#FFD700]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedBank === 'account' ? (isEn ? 'Copied!' : 'ተቀድቷል!') : (isEn ? 'Copy' : 'ገልብጥ')}</span>
              </button>
            </div>
            <p className="text-xs font-semibold text-white/95 pt-1">
              {isEn ? 'Account Holder:' : 'የሂሳብ ስም፡'} <strong className="font-extrabold">Aida, Ibrahim and zebiba</strong> · {isEn ? 'Start Date: Hamle 01, 2018' : 'የመጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም'}
            </p>
          </div>

          {/* QR Code for Member identification */}
          <div className="bg-white p-2.5 rounded-xl shadow-inner text-center shrink-0 self-center md:self-auto min-w-[150px] border-2 border-white/60">
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} className="flex justify-center" />
            <span className="text-[10px] text-neutral-950 font-mono font-extrabold block mt-1">
              {activeMember.id}
            </span>
            <button
              type="button"
              onClick={() => setIsDigitalIdModalOpen(true)}
              className="mt-2 w-full py-1.5 px-2 rounded-lg bg-[#155544] hover:bg-[#417E38] text-white text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{isEn ? 'Export Digital ID' : 'ዲጂታል መታወቂያ'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. SUB-VIEWS / ACTION SECTIONS: RECEIPT SUBMISSION & COMPLAINTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SECTION A: RECEIPT / PAYMENT CLAIM SUBMISSION */}
        <div id="payment-claim-section" className="bg-white rounded-2xl p-4 sm:p-5 scroll-mt-6 border-2 border-[#5A8FBB]/45 focus-within:border-[#155544] shadow-sm transition-colors">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b-2 border-[#5A8FBB]/30">
            <Upload className="w-5 h-5 text-[#1B5E20]" />
            <div>
              <h4 className="font-extrabold text-base text-neutral-950">
                {isEn ? 'Submit Bank Slip / Payment Record' : 'የክፍያ ደረሰኝ / ማረጋገጫ አስገባ'}
              </h4>
              <p className="text-xs font-semibold text-neutral-800">
                {isEn ? 'Send CBE or Telebirr transaction confirmation' : 'የCBE ወይም የቴሌብር ክፍያ ማረጋገጫ ቁጥር እና ደረሰኝ ያስገቡ'}
              </p>
            </div>
          </div>

          {submittedAlert && (
            <div className="p-3 mb-3 bg-[#5A8FBB]/20 border-2 border-[#517DA2] text-[#071E33] font-bold rounded-xl text-xs flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {isEn
                  ? 'Payment submitted with exact date & time! Status is Pending until approved by the Master Admin.'
                  : 'የክፍያ ደረሰኝዎ በትክክለኛ ቀንና ሰዓት ተመዝግቦ ለዋናው አስተዳዳሪ ማረጋገጫ (Pending) ተልኳል! አስተዳዳሪው ሲያጸድቀው የክፍያ ሁኔታዎ ይታደሳል።'}
              </span>
            </div>
          )}

          {submittedBatchAlert && (
            <div className="p-3 mb-3 bg-[#5A8FBB]/20 border-2 border-[#517DA2] text-[#071E33] font-bold rounded-xl text-xs flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {isEn
                  ? 'Batch lump-sum receipt submitted! Once approved by Admin, the amount will be credited to your wallet and allocated.'
                  : 'የጅምላ ክፍያ ደረሰኝዎ በተሳካ ሁኔታ ተልኳል! አስተዳዳሪው ሲያረጋግጠው ወደ ቀሪ ሂሳብዎ ገብቶ ለተመረጡ አባላት ይከፋፈላል።'}
              </span>
            </div>
          )}

          {/* SINGLE PAYMENT VS BATCH / LUMP-SUM RECEIPT MODE SWITCH */}
          <div className="grid grid-cols-2 gap-2 p-1 mb-3 bg-[#5A8FBB]/15 rounded-xl border border-[#5A8FBB]/45">
            <button
              type="button"
              onClick={() => setReceiptUploadMode('single')}
              className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                receiptUploadMode === 'single'
                  ? 'bg-[#155544] text-white shadow-xs'
                  : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>{isEn ? 'Single Payment' : 'ነጠላ ክፍያ (Single)'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReceiptUploadMode('batch');
                if (!claimAmount || Number(claimAmount) <= 500) {
                  setClaimAmount('');
                }
              }}
              className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                receiptUploadMode === 'batch'
                  ? 'bg-[#83257B] text-white shadow-xs'
                  : 'text-neutral-950 hover:bg-[#5A8FBB]/25'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isEn ? 'Batch Receipt (Lump-Sum)' : 'የጅምላ ደረሰኝ (Batch)'}</span>
            </button>
          </div>

          {receiptUploadMode === 'single' && (
            <>
              {/* PROXY PAYMENT SELECTOR: PAYING FOR (ለማን እየከፈሉ ነው?) */}
              <div className="p-3 mb-3 bg-[#5A8FBB]/10 rounded-xl border border-[#5A8FBB]/45 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-neutral-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#1B5E20]" />
                    <span>{isEn ? 'Paying For (ለማን እየከፈሉ ነው?):' : 'ለማን እየከፈሉ ነው? (Paying For):'}</span>
                  </label>
                  {isProxyPayment && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#83257B] text-white">
                      ተኪ ክፍያ (Proxy)
                    </span>
                  )}
                </div>

                {/* Mode Toggle: Myself vs Someone Else */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPayingForTargetId(activeMember.id);
                      setClaimAmount(`${monthlyRate}`);
                      setProxyNoticeMessage(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isProxyPayment
                        ? 'bg-[#155544] text-white shadow-xs'
                        : 'bg-white border border-[#5A8FBB]/50 text-neutral-950 hover:bg-[#5A8FBB]/20'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Myself' : 'ለእኔ (Myself)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Default to first family member other than activeMember if available
                      const otherFamily = familyMembersList.find((m) => m.id !== activeMember.id);
                      const target = otherFamily || members.find((m) => m.id !== activeMember.id);
                      if (target) {
                        setPayingForTargetId(target.id);
                        const targetRate = target.isMinor ? 0 : target.isSpouse ? (settings.spouseMonthlyRate || 100) : (settings.monthlyRate[target.generation] || 50);
                        setClaimAmount(`${targetRate}`);
                      }
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isProxyPayment
                        ? 'bg-[#517DA2] text-white shadow-xs'
                        : 'bg-white border border-[#5A8FBB]/50 text-neutral-950 hover:bg-[#5A8FBB]/20'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Someone Else' : 'ለሌላ አባል / ቤተሰብ'}</span>
                  </button>
                </div>

                {/* When paying for someone else: Search & Dropdown Picker */}
                {isProxyPayment && (
                  <div className="space-y-2 pt-1 border-t border-[#5A8FBB]/35">
                    <div>
                      <div className="relative mb-2">
                        <Search className="w-3.5 h-3.5 text-[#757575] absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder={isEn ? 'Search by name or Member ID...' : 'በስም ወይም በአባል መለያ ፈልግ...'}
                          value={proxySearchQuery}
                          onChange={(e) => setProxySearchQuery(e.target.value)}
                          className="w-full text-xs font-bold bg-white border-2 border-[#5A8FBB]/50 rounded-lg pl-8 pr-2 py-2 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
                        />
                      </div>

                      <select
                        value={payingForTargetId}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setPayingForTargetId(newId);
                          const target = members.find((m) => m.id === newId) || familyMembersList.find((m) => m.id === newId);
                          if (target) {
                            const targetRate = target.isMinor
                              ? 0
                              : target.isSpouse
                              ? settings.spouseMonthlyRate || 100
                              : settings.monthlyRate[target.generation] || 50;
                            setClaimAmount(`${targetRate}`);
                          }
                        }}
                        className="w-full text-xs bg-white border-2 border-[#5A8FBB]/50 rounded-lg p-2.5 text-neutral-950 font-extrabold focus:ring-2 focus:ring-[#155544]"
                      >
                        <optgroup label={isEn ? 'Family Members (የቤተሰብ አባላት)' : '👨‍👩‍👧‍👦 የቤተሰብ አባላት (Family Members)'}>
                          {familyMembersList
                            .filter(
                              (m) =>
                                !proxySearchQuery.trim() ||
                                m.fullName.toLowerCase().includes(proxySearchQuery.toLowerCase()) ||
                                m.id.toLowerCase().includes(proxySearchQuery.toLowerCase())
                            )
                            .map((m) => (
                              <option key={`fam-${m.id}`} value={m.id}>
                                {m.fullName} ({m.id} · {m.generation}ኛ ትውልድ)
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label={isEn ? 'All Other Members (ሌሎች አባላት)' : '👥 ሌሎች የአበሩስ አባላት'}>
                          {members
                            .filter(
                              (m) =>
                                m.id !== activeMember.id &&
                                !familyMembersList.some((fm) => fm.id === m.id) &&
                                (!proxySearchQuery.trim() ||
                                  m.fullName.toLowerCase().includes(proxySearchQuery.toLowerCase()) ||
                                  m.id.toLowerCase().includes(proxySearchQuery.toLowerCase()))
                            )
                            .map((m) => (
                              <option key={`all-${m.id}`} value={m.id}>
                                {m.fullName} ({m.id} · {m.generation}ኛ ትውልድ)
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>

                    {activeBeneficiary && (
                      <div className="p-2.5 bg-[#517DA2]/15 rounded-lg border border-[#517DA2]/45 text-xs text-neutral-950 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{isEn ? 'Beneficiary:' : 'ተጠቃሚ አባል፦'}</span>
                          <strong className="font-extrabold text-[#155544]">
                            {activeBeneficiary.fullName} ({activeBeneficiary.id})
                          </strong>
                        </div>
                        <p className="text-[11px] font-semibold text-neutral-900 leading-relaxed">
                          {isEn
                            ? `This proxy payment will be submitted as Payer: "${activeMember.fullName}" for Beneficiary: "${activeBeneficiary.fullName}" with status "Pending" for Admin verification.`
                            : `ይህ ተኪ ክፍያ በስምዎ (ከፋይ፦ "${activeMember.fullName}") ለ "${activeBeneficiary.fullName}" በ 'Pending' ሁኔታ ይላካል፤ አስተዳዳሪው ሲያጸድቀው የአባሉ መረጃ በቀጥታ ይዘመናል።`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Type Toggle: Monthly vs Generation */}
              <div className="flex items-center gap-2 mb-3 bg-[#5A8FBB]/15 p-1 rounded-xl border border-[#5A8FBB]/45">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('ወርሃዊ');
                    setClaimAmount(`${targetMonthlyRate}`);
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    paymentType === 'ወርሃዊ'
                      ? 'bg-[#417E38] text-white shadow-xs'
                      : 'text-neutral-950 hover:bg-[#5A8FBB]/20'
                  }`}
                >
                  {isEn ? `Monthly Dues (${targetMonthlyRate} ETB)` : `ወርሃዊ መዋጮ (${targetMonthlyRate} ብር)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('ትውልድ');
                    setClaimAmount(`${targetGenPaymentRate}`);
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    paymentType === 'ትውልድ'
                      ? 'bg-[#417E38] text-white shadow-xs'
                      : 'text-neutral-950 hover:bg-[#5A8FBB]/20'
                  }`}
                >
                  {isEn ? `Generation Fund (${targetGenPaymentRate} ETB)` : `የትውልድ መዋጮ (${targetGenPaymentRate} ብር)`}
                </button>
              </div>
            </>
          )}

          <form onSubmit={handleClaimSubmit} className="space-y-3">
            {receiptUploadMode === 'batch' ? (
              <div className="space-y-3">
                <div className="p-3 bg-[#83257B]/10 border border-[#83257B]/40 rounded-xl text-xs text-neutral-950 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5 text-[#83257B]">
                    <Wallet className="w-4 h-4 text-amber-700" />
                    <span>{isEn ? 'Batch / Lump-Sum Deposit Receipt' : 'የጅምላ ክፍያ ደረሰኝ (ለብዙ አባላት የሚከፋፈል)'}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-neutral-900 leading-relaxed">
                    {isEn
                      ? 'Upload one bank receipt (e.g. 10,000 ETB) covering multiple family members or months. Admin will credit your wallet balance and allocate across selected members and dues types.'
                      : 'ትልቅ ክፍያ (ለምሳሌ 10,000 ብር) ለብዙ የቤተሰብ አባላት እና ለተለያዩ ወራት ወይም የትውልድ መዋጮ ለመክፈል ደረሰኙን እዚህ ይጫኑ። አስተዳዳሪው ሲያረጋግጠው በቀሪ ሂሳብዎ ላይ ተመዝግቦ ለተመረጡት አባላት ይከፋፈላል።'}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                    {isEn ? 'Total Lump-Sum Paid Amount (ETB):' : 'ጠቅላላ የተከፈለ የብር መጠን (ETB)፡'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="ለምሳሌ፡ 10000"
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                    className="w-full text-xs font-mono font-extrabold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2.5 text-neutral-950 focus:ring-2 focus:ring-[#83257B]"
                  />
                </div>

                <div>
                  <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                    {isEn ? 'Allocation Note / Family Instructions (Optional):' : 'የክፍፍል መመሪያ / ማስታወሻ (አማራጭ)፡'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder="ለምሳሌ፦ ለ10 የቤተሰብ አባላት ወርሃዊና የትውልድ መዋጮ ይከፋፈል..."
                    value={batchIntendedNotes}
                    onChange={(e) => setBatchIntendedNotes(e.target.value)}
                    className="w-full text-xs font-semibold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2 text-neutral-950 focus:ring-2 focus:ring-[#83257B]"
                  />
                </div>
              </div>
            ) : paymentType === 'ወርሃዊ' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                    {isEn ? 'Payment Month:' : 'የክፍያ ወር፡'}
                  </label>
                  <select
                    value={selectedPayMonth}
                    onChange={(e) => setSelectedPayMonth(Number(e.target.value))}
                    className="w-full text-xs font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
                  >
                    {twelveMonthsList.map((m) => (
                      <option key={m.month} value={m.month}>
                        {isEn ? m.nameEn : m.nameAm} ({targetMonthlyRate} ብር)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                    {isEn ? 'Amount (ETB):' : 'መጠን (ብር)፡'}
                  </label>
                  <input
                    type="number"
                    placeholder={`${targetMonthlyRate}`}
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                    className="w-full text-xs font-mono font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-2.5 bg-[#517DA2]/15 rounded-lg border border-[#517DA2]/45 text-xs text-neutral-950 flex justify-between items-center font-bold">
                  <span>{isEn ? 'Generation Fund Requirement:' : 'የሚጠበቅ የትውልድ መዋጮ፡'}</span>
                  <strong className="font-extrabold font-mono text-[#155544]">{targetGenPaymentRate} ብር</strong>
                </div>
                <div>
                  <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                    {isEn ? 'Payment Amount (ETB):' : 'የሚከፍሉት መጠን (ብር)፡'}
                  </label>
                  <input
                    type="number"
                    placeholder={`${targetGenPaymentRate}`}
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                    className="w-full text-xs font-mono font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                {isEn ? 'Payment Method:' : 'የክፍያ ዘዴ፡'}
              </label>
              <select
                value={claimedMethod}
                onChange={(e) => setClaimedMethod(e.target.value)}
                className="w-full text-xs font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
              >
                <option value="የኢትዮጵያ ንግድ ባንክ (CBE)">የኢትዮጵያ ንግድ ባንክ (CBE 1000778285146)</option>
                <option value="ቴሌብር (Telebirr)">ቴሌብር (Telebirr)</option>
                <option value="ጥሬ ገንዘብ (Cash)">ጥሬ ገንዘብ (Cash)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                {isEn ? 'Bank Reference / Transaction ID:' : 'የባንክ ማረጋገጫ ቁጥር (Transaction Ref)፡'}
              </label>
              <input
                type="text"
                required
                placeholder="ለምሳሌ፡ FT24213XXXXX ወይም የCBE/ቴሌብር Ref"
                value={claimedTxRef}
                onChange={(e) => setClaimedTxRef(e.target.value)}
                className="w-full text-xs font-mono font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2.5 text-neutral-950 focus:ring-2 focus:ring-[#155544]"
              />
            </div>

            {/* Optional Slip Photo Upload */}
            <div>
              <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                {isEn ? 'Bank Slip / Screenshot Photo (Optional):' : 'የደረሰኝ ፎቶ ወይም ስክሪንሾት (አስፈላጊ ከሆነ)፡'}
              </label>
              {slipPhoto ? (
                <div className="relative inline-block border-2 border-[#517DA2]/50 rounded-lg overflow-hidden">
                  <img src={slipPhoto} alt="Slip Receipt" className="h-20 w-auto object-cover" />
                  <button
                    type="button"
                    onClick={() => setSlipPhoto(null)}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-1 rounded-full cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 p-2.5 border-2 border-dashed border-[#517DA2]/60 hover:border-[#155544] rounded-lg bg-[#5A8FBB]/10 cursor-pointer text-xs font-bold text-neutral-900 hover:text-[#155544] transition-colors">
                  <Image className="w-4 h-4 text-[#1B5E20]" />
                  <span>{isEn ? 'Attach receipt photo / screenshot' : 'የደረሰኝ ፎቶ ወይም የስክሪን ማረጋገጫ ይምረጡ'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          setSlipPhoto(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmittingPayment}
              className="w-full py-3 px-4 bg-[#155544] hover:bg-[#417E38] text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmittingPayment ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>
                {isSubmittingPayment
                  ? isEn
                    ? 'Submitting...'
                    : 'እየተመዘገበ ነው...'
                  : receiptUploadMode === 'batch'
                  ? isEn
                    ? 'Submit Batch Receipt'
                    : 'የጅምላ ደረሰኙን ላክ (Submit Batch)'
                  : isEn
                  ? 'Submit Payment Record'
                  : 'ክፍያውን መዝግብ'}
              </span>
            </button>
          </form>
        </div>

        {/* SECTION B: COMPLAINT & SUGGESTIONS PAGE */}
        <div id="complaint-section" className="bg-white rounded-2xl p-4 sm:p-5 scroll-mt-6 border-2 border-[#83257B]/45 focus-within:border-[#83257B] shadow-sm transition-colors">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b-2 border-[#5A8FBB]/30">
            <MessageSquare className="w-5 h-5 text-[#FF9800]" />
            <div>
              <h4 className="font-extrabold text-base text-neutral-950">
                {isEn ? 'Complaints & Inquiries' : 'ቅሬታ ወይም ጥያቄ ማቅረቢያ'}
              </h4>
              <p className="text-xs font-semibold text-neutral-800">
                {isEn ? 'Direct message to association committee' : 'ለአበሩስ ማህበር አመራሮች ቀጥታ ጥያቄ ወይም ቅሬታ ያቅርቡ'}
              </p>
            </div>
          </div>

          {complaintSubmitted && (
            <div className="p-3 mb-3 bg-[#1DAB61]/15 border-2 border-[#1DAB61] text-[#155544] font-extrabold rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#4CAF50] shrink-0" />
              <span>
                {isEn
                  ? 'Complaint submitted! You will see Admin replies right here inside the app.'
                  : 'ቅሬታዎ በተሳካ ሁኔታ ተመዝግቧል! አስተዳዳሪው ሲመልሱ መልሱን እዚሁ አፕ ውስጥ በቀጥታ ያዩታል።'}
              </span>
            </div>
          )}

          {complaintError && (
            <div className="p-3 mb-3 bg-[#83257B]/10 border-2 border-[#83257B]/50 text-[#83257B] font-extrabold rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{complaintError}</span>
            </div>
          )}

          <form onSubmit={handleComplaintSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                {isEn ? 'Category:' : 'የጉዳዩ ዓይነት፡'}
              </label>
              <select
                value={complaintCategory}
                onChange={(e) => setComplaintCategory(e.target.value)}
                className="w-full text-xs font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2 text-neutral-950 focus:ring-2 focus:ring-[#83257B]"
              >
                <option value="የክፍያ ማስተካከያ">የክፍያ ማስተካከያ (ያልተመዘገበ ክፍያ አለኝ)</option>
                <option value="የአባልነት መረጃ">የአባልነት መረጃ (ስም፣ ስልክ ወይም ቤተሰብ)</option>
                <option value="የትውልድ መዋጮ">የትውልድ መዋጮ ክፍፍል ጉዳይ</option>
                <option value="አጠቃላይ አስተያየት">አጠቃላይ አስተያየት ወይም ጥያቄ</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                {isEn ? 'Your Contact Phone:' : 'የእርስዎ ስልክ ቁጥር (ለመልስ)፡'}
              </label>
              <input
                type="tel"
                inputMode="tel"
                placeholder={activeMember.phone || '0911234567 ወይም +966...'}
                value={complaintPhone}
                onChange={(e) => setComplaintPhone(e.target.value)}
                className="w-full text-xs font-bold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2.5 text-neutral-950 focus:ring-2 focus:ring-[#83257B]"
              />
            </div>

            <div>
              <label className="text-xs font-extrabold text-neutral-950 block mb-1">
                {isEn ? 'Message / Description:' : 'የቅሬታው ወይም የጥያቄው ዝርዝር፡'}
              </label>
              <textarea
                rows={3}
                required
                placeholder="ቅሬታዎን ወይም ጥያቄዎን በዝርዝር እዚህ ይጻፉ..."
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
                className="w-full text-xs font-semibold bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg p-2.5 text-neutral-950 focus:ring-2 focus:ring-[#83257B]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingComplaint}
              className="w-full py-3 px-4 bg-[#83257B] hover:bg-[#6a1d63] text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmittingComplaint ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {isSubmittingComplaint
                  ? isEn ? 'Sending...' : 'እየተላከ ነው...'
                  : isEn ? 'Submit Complaint' : 'ቅሬታውን ላክ'}
              </span>
            </button>
          </form>

          {myComplaints.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-[#5A8FBB]/35 space-y-2.5">
              <h5 className="text-xs font-extrabold text-neutral-950">
                {isEn ? 'Your Submitted Complaints & Replies' : 'የላኳቸው ቅሬታዎች እና የአስተዳዳሪ ምላሾች'}
              </h5>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {myComplaints.map((c) => {
                  const isResolved = String(c.status || '').toLowerCase() === 'resolved';
                  return (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-xl bg-[#5A8FBB]/10 border border-[#5A8FBB]/40 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-neutral-800">
                          {c.createdAt ? new Date(c.createdAt).toLocaleString('am-ET') : ''}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isResolved
                              ? 'bg-[#1DAB61]/25 text-[#155544]'
                              : 'bg-[#83257B]/15 text-[#83257B]'
                          }`}
                        >
                          {isResolved ? 'ተመልሷል (Resolved)' : 'በመጠባበቅ ላይ (Open)'}
                        </span>
                      </div>
                      <p className="text-neutral-950 font-semibold whitespace-pre-wrap">{c.complaintText}</p>
                      {c.adminResponse && (
                        <div className="p-2.5 rounded-lg bg-[#1DAB61]/15 border border-[#1DAB61]/60 text-[#155544] space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-[11px]">የአስተዳዳሪ ምላሽ፦</span>
                            {c.resolvedAt && (
                              <span className="text-[10px] text-[#417E38] font-bold font-mono">
                                {new Date(c.resolvedAt).toLocaleString('am-ET')}
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap font-bold">{c.adminResponse}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. RECENT PAYMENT RECEIPTS HISTORY */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#5A8FBB]/45 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#5A8FBB]/30">
          <h4 className="font-extrabold text-base text-neutral-950 flex items-center gap-2">
            <History className="w-5 h-5 text-[#1B5E20]" />
            <span>{isEn ? 'Live Payment History' : 'የክፍያ ታሪክ መዝገብ'}</span>
          </h4>
          <span className="text-xs font-mono font-extrabold px-2.5 py-1 rounded-full bg-[#155544] text-white">
            {liveContributions.length} {isEn ? 'Records' : 'ደረሰኞች'}
          </span>
        </div>

        {liveContributions.length === 0 ? (
          <div className="p-8 text-center text-xs font-bold text-neutral-900 bg-[#5A8FBB]/10 rounded-xl border-2 border-dashed border-[#5A8FBB]/50">
            {isEn
              ? 'No payment records found yet. Use the CBE bank account above to make your contribution.'
              : 'እስካሁን የተመዘገበ የክፍያ ታሪክ የለም። ከላይ የተጠቀሰውን የCBE ባንክ ሂሳብ ተጠቅመው ክፍያ መፈጸም ይችላሉ።'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#5A8FBB]/40">
            <table className="w-full text-left text-xs text-neutral-950">
              <thead className="bg-[#155544] text-white font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3">ወር / ዓመት</th>
                  <th className="py-3 px-3">ዓይነት</th>
                  <th className="py-3 px-3">የተከፈለ መጠን</th>
                  <th className="py-3 px-3">ቀንና ሰዓት</th>
                  <th className="py-3 px-3">የክፍያ ዘዴ</th>
                  <th className="py-3 px-3">ማረጋገጫ Ref</th>
                  <th className="py-3 px-3">ሁኔታ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#5A8FBB]/25">
                {liveContributions.map((c, i) => (
                  <tr key={`${c.id}-${i}`} className={i % 2 === 0 ? 'bg-white hover:bg-[#5A8FBB]/10 transition-colors' : 'bg-[#5A8FBB]/5 hover:bg-[#5A8FBB]/15 transition-colors'}>
                    <td className="py-2.5 px-3 font-extrabold text-neutral-950">
                      {c.ethiopianMonthName || c.ethiopianMonth} {c.ethiopianYear} ዓ.ም
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#517DA2]">{c.type}</td>
                    <td className="py-2.5 px-3 font-mono font-extrabold text-[#155544] tabular-nums">
                      {c.paidAmount || c.amount} ብር
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-neutral-900">
                      {formatDisplayPaymentDateTime(c.datePaid, c.paidAt)}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-neutral-900">{c.paymentMethod || 'CBE'}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-[#517DA2]">
                      {c.transactionRef || c.receiptNumber || c.id}
                    </td>
                    <td className="py-2.5 px-3">
                      {isPendingStatus(c.status) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#5A8FBB]/25 text-[#071E33] border border-[#517DA2]">
                          <Clock className="w-3 h-3" />
                          <span>በመጠባበቅ ላይ (Pending)</span>
                        </span>
                      ) : isPartialStatus(c.status) ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#517DA2]/20 text-[#155544] border border-[#517DA2]">
                          ከፊል (Partial)
                        </span>
                      ) : isPaidStatus(c.status) ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#1DAB61]/25 text-[#155544] border border-[#1DAB61]">
                          ✓ {c.status || 'ተከፍሏል'}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/40">
                          {c.status || 'ያልተከፈለ'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. DIGITAL MEMBER ID MODAL (PRINTABLE / DOWNLOADABLE SUMMARY CARD) */}
      {isDigitalIdModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border-2 border-[#155544]/60 overflow-hidden my-6">
            {/* Modal Top Bar */}
            <div className="px-5 py-3.5 bg-[#155544] text-white flex items-center justify-between border-b border-[#1DAB61]/40">
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5 text-[#FFD700]" />
                <span className="font-extrabold text-sm tracking-wide">
                  {isEn ? 'Official Digital Member ID' : 'ይፋዊ ዲጂታል መታወቂያ ካርድ'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDigitalIdModalOpen(false)}
                className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Card Container */}
            <div className="p-4 sm:p-6 bg-[#5A8FBB]/15 flex justify-center">
              {/* THE PRINTABLE / DOWNLOADABLE DIGITAL ID CARD ELEMENT */}
              <div
                id="digital-id-card-element"
                className="w-full max-w-[420px] rounded-3xl shadow-xl overflow-hidden bg-gradient-to-br from-[#155544] via-[#517DA2] to-[#83257B] text-white border-2 border-[#1DAB61] relative"
              >
                {/* Decorative Background Elements */}
                <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-[#1DAB61]/20 blur-xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full bg-[#5A8FBB]/20 blur-xl pointer-events-none" />

                {/* Card Header */}
                <div className="p-4 sm:p-5 border-b border-white/25 bg-black/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#FFD700] text-[#1B5E20] flex items-center justify-center font-black text-xl shadow-md shrink-0">
                      🏛️
                    </div>
                    <div>
                      <h3 className="font-black text-base text-white leading-tight">
                        የአበሩስ አንድነት ማህበር
                      </h3>
                      <p className="text-[10px] text-white/95 font-mono font-bold tracking-wider uppercase">
                        Abarrus Unity Association
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[9px] uppercase tracking-widest font-mono font-extrabold bg-[#1DAB61] text-[#042116] px-2.5 py-0.5 rounded-full block text-center">
                      VERIFIED
                    </span>
                    <span className="text-[9px] text-white font-mono block mt-0.5 font-extrabold">
                      2018 ዓ.ም
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-4">
                  {/* Member Profile Row */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#1B5E20] text-[#FFD700] font-black text-2xl flex items-center justify-center shrink-0 shadow-lg border-2 border-[#FFD700] ring-2 ring-emerald-400/30">
                      {activeMember.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-lg font-black text-white truncate">
                          {activeMember.fullName}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono font-extrabold bg-[#1DAB61] text-[#042116] px-2 py-0.5 rounded">
                          {activeMember.id}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-white bg-white/20 px-2 py-0.5 rounded">
                          {activeMember.familyId}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-white/95 mt-1 truncate">
                        {activeMember.familyName || 'የአበሩስ ቤተሰብ'}
                      </p>
                    </div>
                  </div>

                  {/* Attribute Grid */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/25 border border-white/20 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-white/90 block">ትውልድ (Generation)</span>
                      <strong className="text-white font-extrabold">{activeMember.generation}ኛ ትውልድ</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-white/90 block">ስልክ (Phone)</span>
                      <strong className="text-white font-mono font-extrabold">{activeMember.phone || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-white/90 block">ወርሃዊ መዋጮ</span>
                      <strong className="text-[#1DAB61] font-extrabold">{monthlyRate} ብር / ወር</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-white/90 block">የትውልድ መዋጮ</span>
                      <strong className="text-[#1DAB61] font-extrabold">{genPaymentRate} ብር</strong>
                    </div>
                  </div>

                  {/* QR Code Verification Section */}
                  <div className="p-3 rounded-2xl bg-white text-neutral-950 flex items-center justify-between gap-3 shadow-md">
                    <div className="flex justify-center p-1 bg-white rounded-lg border border-[#5A8FBB]/45 shrink-0">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: generateSvgQRCode(
                            typeof window !== 'undefined'
                              ? `${window.location.origin}/login?memberId=${activeMember.id}`
                              : `https://abarrus.local/login?memberId=${activeMember.id}`,
                            100
                          ),
                        }}
                      />
                    </div>
                    <div className="text-left space-y-1 min-w-0 flex-1">
                      <div className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#155544] bg-[#1DAB61]/20 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3 text-[#1B5E20]" />
                        <span>ይፋዊ የተረጋገጠ አባል</span>
                      </div>
                      <p className="text-[11px] font-bold text-neutral-950 leading-tight">
                        ይህን QR ኮድ በስልክዎ ስካን በማድረግ የአባልነት ዝርዝርዎን መክፈት ይችላሉ።
                      </p>
                      <p className="text-[9px] font-mono font-bold text-[#517DA2] truncate">
                        ID: {activeMember.id} · ABR-PASS
                      </p>
                    </div>
                  </div>

                  {/* Footer Security Stamp */}
                  <div className="flex items-center justify-between pt-1 text-[10px] text-white/90 font-mono font-bold border-t border-white/20">
                    <span>SECURITY: AES-VERIFIED</span>
                    <span className="text-white">ASYA MESUD APP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Action Controls */}
            <div className="p-4 bg-white border-t border-[#5A8FBB]/35 flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={handlePrintDigitalId}
                className="flex-1 py-2.5 px-4 bg-[#155544] hover:bg-[#417E38] text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>{isEn ? 'Print ID Card' : 'ካርዱን አትም (Print)'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadDigitalId}
                className="flex-1 py-2.5 px-4 bg-[#517DA2] hover:bg-[#83257B] text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{isEn ? 'Download Card' : 'ካርዱን አውርድ (Save)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDigitalIdModalOpen(false)}
                className="py-2.5 px-4 bg-white border-2 border-[#5A8FBB]/50 hover:bg-[#5A8FBB]/15 text-neutral-950 text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                {isEn ? 'Close' : 'ዝጋ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

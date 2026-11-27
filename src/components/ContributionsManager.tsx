/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Contribution, Member, Family, SettingsRates, ContributionStatus, NotificationLog } from '../types';
import {
  ETHIOPIAN_MONTHS,
  getEthiopianMonthName,
  getCurrentEthiopianDate,
  buildPaymentTimestamps,
  formatDisplayPaymentDateTime,
} from '../utils/ethiopianCalendar';
import {
  subscribeToAllContributions,
  matchMonthContribution,
  saveContributionToFirestore,
  getNotificationLogsFromFirestore,
  triggerPaymentSummaryEmail,
  deleteContributionFromFirestore,
  googleSignIn,
  logoutGoogle,
  sendGmailMessage,
  initGoogleAuth,
} from '../firebase';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Printer,
  Trash2,
  FileText,
  Download,
  Calendar,
  Layers,
  RefreshCw,
  Mail,
  User,
  Users,
  Check,
  X,
  ExternalLink,
  Wallet,
  Link2,
  Send,
} from 'lucide-react';
import {
  formatSinglePaymentTelegramReport,
  dispatchApprovedPaymentReportToGroup,
  getAppUrl,
} from '../utils/telegramShare';
import {
  isPaidStatus,
  isPartialStatus,
  isPendingStatus,
  isPaidOrPartialStatus,
  getContributionMonth,
  getContributionYear,
  getContributionPaidAmount,
} from '../utils/storage';

interface ContributionsManagerProps {
  contributions: Contribution[];
  members: Member[];
  families: Family[];
  settings: SettingsRates;
  isMasterAdmin?: boolean;
  onApproveContribution?: (c: Contribution) => void | Promise<void>;
  onRejectContribution?: (c: Contribution) => void | Promise<void>;
  onOpenRecordPayment: () => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
  onOpenBatchPayment?: (payerId?: string) => void;
  onUpdateStatus: (id: string, newStatus: ContributionStatus) => void;
  onDeleteContribution: (id: string) => void;
  onOpenPrintReport: () => void;
  onDispatchTelegram?: (payload: {
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  }) => void;
}

export const ContributionsManager: React.FC<ContributionsManagerProps> = ({
  contributions: propContributions,
  members,
  families,
  settings,
  isMasterAdmin = false,
  onApproveContribution,
  onRejectContribution,
  onOpenRecordPayment,
  onOpenPaymentManager,
  onOpenBatchPayment,
  onUpdateStatus,
  onDeleteContribution,
  onOpenPrintReport,
  onDispatchTelegram,
}) => {
  // Live real-time Firestore contributions state
  const [liveContributions, setLiveContributions] = useState<Contribution[]>(propContributions);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  // View mode: 'grid' (Monthly Payment Matrix) or 'table' (Ledger List) or 'notifications'
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'notifications'>('grid');

  // Grid Controls
  const [gridYear, setGridYear] = useState<number>(2018);
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [generationFilter, setGenerationFilter] = useState<string>('all');
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [togglingCellKey, setTogglingCellKey] = useState<string | null>(null);

  // Table Filter State
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Contribution | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // In-app delete confirmation state (no browser confirm dialogs in iframe)
  const [paymentToDelete, setPaymentToDelete] = useState<Contribution | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState<boolean>(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  // Notification logs state
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Google / Gmail Auth state
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [gmailComposeOpen, setGmailComposeOpen] = useState(false);
  const [gmailRecipient, setGmailRecipient] = useState('mesudnurga4830@gmail.com');
  const [gmailSubject, setGmailSubject] = useState('የአበሩስ አንድነት ማህበር የክፍያ ማጠቃለያ');
  const [gmailBody, setGmailBody] = useState('');
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [gmailStatusNotice, setGmailStatusNotice] = useState<string | null>(null);

  // Execute payment deletion
  const handleConfirmDeleteContribution = async () => {
    if (!paymentToDelete) return;
    const c = paymentToDelete;
    if (!isMasterAdmin && isPaidOrPartialStatus(c.status)) {
      setDeleteNotice('የጸደቁ ክፍያዎችን መሰረዝ የሚችለው ዋናው አስተዳዳሪ (Master Admin) ብቻ ነው።');
      setPaymentToDelete(null);
      setTimeout(() => setDeleteNotice(null), 4000);
      return;
    }
    setIsDeletingPayment(true);
    try {
      setLiveContributions((prev) => prev.filter((item) => item.id !== c.id));
      onDeleteContribution(c.id);
      await deleteContributionFromFirestore(c.id);
      setDeleteNotice(`የክፍያ መዝገብ "${c.id}" (${c.type}) በተሳካ ሁኔታ ተሰርዟል!`);
      setPaymentToDelete(null);
      setTimeout(() => setDeleteNotice(null), 4000);
    } catch (err: any) {
      console.error('Error deleting contribution:', err);
      setLiveContributions((prev) => [c, ...prev]);
      setDeleteNotice('ክፍያውን መሰረዝ አልተቻለም፡ ' + (err?.message || 'Error'));
      setTimeout(() => setDeleteNotice(null), 4000);
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // Approve payment & dispatch report ONLY to VITE_TELEGRAM_GROUP_CHAT_ID (Master Admin ONLY)
  const handleApproveContribution = async (c: Contribution): Promise<Contribution> => {
    if (!isMasterAdmin) {
      setDeleteNotice('ክፍያዎችን ማጽደቅ የሚችለው ዋናው አስተዳዳሪ (Master Admin) ብቻ ነው።');
      setTimeout(() => setDeleteNotice(null), 4000);
      return c;
    }

    const ts = buildPaymentTimestamps();
    const paidNum = Number(c.paidAmount ?? c.amount ?? 0);
    const targetNum = Number(c.amount ?? 0);
    const approvedStatus: ContributionStatus =
      c.intendedStatus === 'ከፊል' || (c.type === 'ትውልድ' && paidNum > 0 && targetNum > 0 && paidNum < targetNum)
        ? 'ከፊል'
        : 'ተከፍሏል';

    const updated: Contribution = {
      ...c,
      status: approvedStatus,
      approvedBy: 'ዋና አስተዳዳሪ',
      approvedAt: ts.datePaid,
      paidAt: c.paidAt || ts.paidAt,
      datePaid: c.datePaid && /\d{1,2}:\d{2}/.test(c.datePaid) ? c.datePaid : ts.datePaid,
    };

    if (onApproveContribution) {
      await onApproveContribution(c);
      setLiveContributions((prev) => prev.map((item) => (item.id === c.id ? updated : item)));
      setDeleteNotice(`የ${c.memberName} ክፍያ በዋና አስተዳዳሪ ጸድቋል፤ የክፍያ ሪፖርቱ ወደ Telegram Group ተልኳል!`);
      setTimeout(() => setDeleteNotice(null), 5000);
      return updated;
    }

    onUpdateStatus(c.id, approvedStatus);
    await saveContributionToFirestore(updated);
    const nextContribs = liveContributions.map((item) => (item.id === c.id ? updated : item));
    setLiveContributions(nextContribs);
    const memberObj = members.find((mem) => mem.id === c.memberId);
    const reportText = formatSinglePaymentTelegramReport(updated, memberObj, nextContribs, settings);
    const dispatchRes = await dispatchApprovedPaymentReportToGroup({
      target: 'payment',
      payment: updated,
      reportText,
    });
    setDeleteNotice(
      dispatchRes.telegramDispatched
        ? `የ${c.memberName} ክፍያ ጸድቋል፤ የክፍያ ሪፖርቱ ወደ Telegram Group ተልኳል!`
        : `የ${c.memberName} ክፍያ ጸድቋል፤ የክፍያ ሪፖርቱ ወደ Telegram Group መስመር ተዘጋጅቷል።`
    );
    setTimeout(() => setDeleteNotice(null), 5000);
    return updated;
  };

  useEffect(() => {
    const unsub = initGoogleAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // STEP C & REAL-TIME ONSNAPSHOT LISTENER WITH EFFECT CLEANUP
  useEffect(() => {
    setIsLoading(true);
    setFirestoreError(null);

    // Initial diagnostic console logging (STEP A)
    console.log('[ContributionsManager] Setting up real-time onSnapshot listener for collection "contributions"...');

    const unsubscribe = subscribeToAllContributions(
      (docs) => {
        // STEP A Diagnostics
        console.log(`[ContributionsManager onSnapshot] Received ${docs.length} live contribution documents.`);
        if (docs.length > 0) {
          const sample = docs[0];
          console.log('[ContributionsManager Sample Doc]:', {
            id: sample.id,
            memberId: sample.memberId,
            memberName: sample.memberName,
            month: sample.ethiopianMonth,
            year: sample.ethiopianYear,
            status: sample.status,
            paidAmount: sample.paidAmount,
          });
          console.log('[ContributionsManager Sample Status string]:', String(sample.status));
        }

        setLiveContributions(docs);
        setLastSyncTime(new Date());
        setIsLoading(false);
        setFirestoreError(null);
      },
      (err) => {
        console.error('[ContributionsManager Firestore error]:', err);
        setFirestoreError(err.message || 'ከFirestore መረጃ በማምጣት ላይ ስህተት ተፈጥሯል');
        setIsLoading(false);
      }
    );

    return () => {
      console.log('[ContributionsManager] Cleaning up onSnapshot listener.');
      unsubscribe();
    };
  }, []);

  // Fetch notification logs when notifications tab is active
  useEffect(() => {
    if (viewMode === 'notifications') {
      setLoadingLogs(true);
      getNotificationLogsFromFirestore()
        .then((logs) => {
          setNotificationLogs(logs.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()));
        })
        .finally(() => setLoadingLogs(false));
    }
  }, [viewMode]);

  // Current Ethiopian Date
  const currentDate = getCurrentEthiopianDate();

  // Ethiopian Months Sequence Starting from Hamle 2018 (Month 11, Year 2018)
  // Or displaying all 12 Ethiopian months for the selected fiscal year
  const gridMonths = ETHIOPIAN_MONTHS;

  // Filtered members for the grid view
  const filteredGridMembers = members.filter((m) => {
    if (familyFilter !== 'all' && m.familyId !== familyFilter) return false;
    if (generationFilter !== 'all' && m.generation !== Number(generationFilter)) return false;
    if (memberSearch) {
      const q = memberSearch.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.familyName && m.familyName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered contributions for Table view
  const filteredContributions = liveContributions.filter((c) => {
    if (selectedYear !== 'all' && getContributionYear(c) !== Number(selectedYear)) return false;
    if (selectedFamily !== 'all' && c.familyId !== selectedFamily) return false;
    if (selectedMonth !== 'all' && getContributionMonth(c) !== Number(selectedMonth)) return false;
    if (selectedType !== 'all' && c.type !== selectedType) return false;
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'Pending') {
        if (!isPendingStatus(c.status)) return false;
      } else if (selectedStatus === 'ተከፍሏል') {
        if (!isPaidStatus(c.status)) return false;
      } else if (selectedStatus === 'ከፊል') {
        if (!isPartialStatus(c.status)) return false;
      } else if (c.status !== selectedStatus) {
        return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.memberName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.receiptNumber && c.receiptNumber.toLowerCase().includes(q)) ||
        c.familyName.toLowerCase().includes(q) ||
        (c.transactionRef && c.transactionRef.toLowerCase().includes(q)) ||
        (c.memberId && c.memberId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalCollectedFiltered = filteredContributions
    .filter((c) => isPaidOrPartialStatus(c.status))
    .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

  const pendingContributionsCount = liveContributions.filter((c) => isPendingStatus(c.status)).length;

  // Quick Cell Click Toggle Handler: Toggles status live in Firestore with Master Admin governance
  const handleToggleCellStatus = async (
    member: Member,
    monthNum: number,
    yearNum: number,
    currentStatus: 'paid' | 'partial' | 'pending' | 'unpaid',
    existingDoc?: Contribution
  ) => {
    if (!isMasterAdmin && (currentStatus === 'paid' || currentStatus === 'partial')) {
      setDeleteNotice('የጸደቁ ክፍያዎችን መቀየር የሚችለው ዋናው አስተዳዳሪ (Master Admin) ብቻ ነው።');
      setTimeout(() => setDeleteNotice(null), 4000);
      return;
    }

    const cellKey = `${member.id}-${yearNum}-${monthNum}`;
    setTogglingCellKey(cellKey);

    const standardRate = member.isMinor
      ? 0
      : member.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[member.generation] || 50;

    let newStatus: ContributionStatus;
    if (isMasterAdmin) {
      newStatus = currentStatus === 'paid' ? 'ያልተከፈለ' : 'ተከፍሏል';
    } else {
      newStatus = currentStatus === 'pending' ? 'ያልተከፈለ' : 'Pending';
    }

    const ts = buildPaymentTimestamps();
    const isPaymentRecord = newStatus === 'ተከፍሏል' || newStatus === 'Pending';
    const newPaidAmount = isPaymentRecord ? standardRate : 0;
    const docId = existingDoc?.id || `CON-${member.id}-${yearNum}-${monthNum}`;

    const updatedDoc: Contribution = {
      id: docId,
      receiptNumber: existingDoc?.receiptNumber || `REC-${member.id.slice(-4)}-${yearNum}${monthNum}`,
      memberId: member.id,
      memberName: member.fullName,
      familyId: member.familyId || '',
      familyName: member.familyName || '',
      generation: member.generation || 4,
      type: 'ወርሃዊ',
      month: monthNum,
      year: yearNum,
      ethiopianMonth: monthNum,
      ethiopianMonthName: getEthiopianMonthName(monthNum),
      ethiopianYear: yearNum,
      amount: standardRate,
      paidAmount: newPaidAmount,
      status: newStatus,
      intendedStatus: isPaymentRecord ? 'ተከፍሏል' : undefined,
      paymentMethod: existingDoc?.paymentMethod || 'ጥሬ ገንዘብ (Cash)',
      transactionRef: existingDoc?.transactionRef || '',
      datePaid: isPaymentRecord ? ts.datePaid : '',
      paidAt: isPaymentRecord ? ts.paidAt : undefined,
      ...(isMasterAdmin && newStatus === 'ተከፍሏል'
        ? { approvedBy: 'ዋና አስተዳዳሪ', approvedAt: ts.datePaid }
        : {}),
      notes: isMasterAdmin
        ? `ማትሪክስ የቀጥታ ማስተካከያ (${newStatus})`
        : `ማትሪክስ ክፍያ (${newStatus} — የዋና አድሚን ማረጋገጫ የሚጠብቅ)`,
    };

    try {
      await saveContributionToFirestore(updatedDoc);
      onUpdateStatus(docId, newStatus);
      if (newStatus === 'ተከፍሏል' && isMasterAdmin) {
        const nextContribs = [updatedDoc, ...liveContributions.filter((c) => c.id !== docId)];
        const reportText = formatSinglePaymentTelegramReport(updatedDoc, member, nextContribs, settings);
        void dispatchApprovedPaymentReportToGroup({
          target: 'payment',
          payment: updatedDoc,
          reportText,
        });
      } else if (newStatus === 'Pending') {
        setDeleteNotice(`የ${member.fullName} ክፍያ በPending ሁኔታ ተመዝግቧል፤ ዋናው አስተዳዳሪ ሲያጸድቀው ይካተታል።`);
        setTimeout(() => setDeleteNotice(null), 4000);
      }
    } catch (err) {
      console.error('[Matrix Quick Toggle Error]:', err);
    } finally {
      setTimeout(() => setTogglingCellKey(null), 300);
    }
  };

  // Export filtered list of contributions as CSV with UTF-8 BOM for Excel support
  const handleExportCSV = () => {
    // Determine which list to export based on viewMode
    let listToExport = filteredContributions;
    let exportTitle = 'abarrus_contributions';

    if (viewMode === 'grid') {
      const memberIds = new Set(filteredGridMembers.map((m) => m.id));
      const gridItems = liveContributions.filter(
        (c) => memberIds.has(c.memberId) && getContributionYear(c) === gridYear
      );
      if (gridItems.length > 0) {
        listToExport = gridItems;
        exportTitle = `abarrus_contributions_grid_${gridYear}`;
      }
    }

    if (listToExport.length === 0) {
      alert('ምንም የሚወርድ የክፍያ መረጃ አልተገኘም (No filtered contributions to export)');
      return;
    }

    setIsExporting(true);
    try {
      const memberMap = new Map(members.map((m) => [m.id, m]));
      const escapeVal = (value: any): string => {
        if (value === null || value === undefined) return '""';
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        'ቀንና ሰዓት (Date & Time)',
        'የአባል ስም (Name)',
        'የአባል መለያ (Member ID)',
        'ስልክ (Phone)',
        'ቤተሰብ (Family)',
        'ትውልድ (Generation)',
        'የመዋጮ ዓይነት (Type)',
        'ወር (Month)',
        'ዓ.ም (Year)',
        'የተከፈለ መጠን (Amount Paid ETB)',
        'የሚጠበቅ መጠን (Target Amount ETB)',
        'ቀሪ እዳ (Remaining Balance ETB)',
        'ሁኔታ (Status)',
        'የክፍያ ዘዴ (Method)',
        'የደረሰኝ ቁጥር (Receipt No)',
        'የትራንዛክሽን ቁጥር (Transaction Ref)',
        'የመዋጮ መለያ (Contribution ID)',
        'ማስታወሻ (Notes)',
      ];

      let totalExpected = 0;
      let totalPaid = 0;
      let totalRemaining = 0;

      const rows = listToExport.map((c) => {
        const expected = Number(c.amount) || 0;
        const paid = getContributionPaidAmount(c);
        const remaining = Math.max(0, expected - paid);
        totalExpected += expected;
        totalPaid += paid;
        totalRemaining += remaining;

        const member = memberMap.get(c.memberId);
        const cMonth = getContributionMonth(c);
        const cYear = getContributionYear(c);
        const monthName =
          c.ethiopianMonthName ||
          (cMonth ? getEthiopianMonthName(cMonth) : '');

        return [
          escapeVal(formatDisplayPaymentDateTime(c.datePaid, c.paidAt)),
          escapeVal(c.memberName),
          escapeVal(c.memberId),
          escapeVal(member?.phone || ''),
          escapeVal(c.familyName || member?.familyName || ''),
          escapeVal(`${c.generation || 4}ኛ ትውልድ`),
          escapeVal(c.type || 'ወርሃዊ'),
          escapeVal(monthName),
          escapeVal(cYear || 2018),
          escapeVal(paid),
          escapeVal(expected),
          escapeVal(remaining),
          escapeVal(c.status || 'ያልተከፈለ'),
          escapeVal(c.paymentMethod || 'ቀጥታ'),
          escapeVal(c.receiptNumber || ''),
          escapeVal(c.transactionRef || ''),
          escapeVal(c.id),
          escapeVal(c.notes || ''),
        ].join(',');
      });

      // Add summary total row for easier financial accounting
      const summaryRow = [
        escapeVal('ድምር (TOTAL)'),
        escapeVal(`${listToExport.length} መዝገቦች (Records)`),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(totalPaid),
        escapeVal(totalExpected),
        escapeVal(totalRemaining),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
        escapeVal(''),
      ].join(',');

      // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel & spreadsheet viewers correctly recognize Amharic text
      const csvData = '\uFEFF' + [headers.map(escapeVal).join(','), ...rows, summaryRow].join('\r\n');
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');

      const todayStr = new Date().toISOString().slice(0, 10);
      const yearFilterStr = selectedYear !== 'all' ? `_${selectedYear}` : '';
      const monthFilterStr = selectedMonth !== 'all' ? `_ወር${selectedMonth}` : '';
      const typeFilterStr = selectedType !== 'all' ? `_${selectedType}` : '';
      const statusFilterStr = selectedStatus !== 'all' ? `_${selectedStatus}` : '';
      downloadLink.href = url;
      downloadLink.setAttribute(
        'download',
        `${exportTitle}${yearFilterStr}${monthFilterStr}${typeFilterStr}${statusFilterStr}_${todayStr}.csv`
      );

      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to export contributions to CSV:', err);
      alert('CSV ፋይል በማዘጋጀት ላይ ስህተት አጋጥሟል');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-[#155544] via-[#517DA2] to-[#83257B] p-5 rounded-2xl border-2 border-[#5A8FBB]/50 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/95">
            <span className="px-2.5 py-0.5 rounded-md bg-[#1DAB61] text-[#042116] text-xs font-extrabold">
              የቀጥታ ዳታቤዝ (Live Firestore Sync)
            </span>
            <span className="text-white/70">·</span>
            <span>
              የሰነዶች ብዛት፡ <strong className="text-white font-mono tabular-nums font-extrabold">{liveContributions.length}</strong>
            </span>
            <span className="text-white/70">·</span>
            <span>
              የመጨረሻ ማመሳሰል፡ <strong className="font-mono">{lastSyncTime.toLocaleTimeString()}</strong>
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-white mt-2 tracking-tight">
            የአበሩስ ቤተሰብ መዋጮዎችና ክፍያዎች መዝገብ
          </h2>
          <p className="text-xs text-white/95 font-semibold mt-1">
            የተጣራ ገቢ፡ <strong className="text-[#1DAB61] font-mono text-sm tabular-nums font-extrabold bg-black/25 px-2 py-0.5 rounded">{totalCollectedFiltered.toLocaleString()} ብር</strong>
            <span className="text-white/70 mx-2">·</span>
            በአሁኑ ወር: <strong className="text-white font-extrabold">{getEthiopianMonthName(currentDate.month)} {currentDate.year} ዓ.ም</strong>
          </p>
        </div>

        {/* View Switchers & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle Buttons */}
          <div className="inline-flex rounded-xl border-2 border-white/30 p-0.5 bg-black/25">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'grid'
                  ? 'bg-[#1DAB61] text-[#042116] shadow-xs'
                  : 'text-white hover:bg-white/15'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>የወርሃዊ ማትሪክስ (Grid)</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'table'
                  ? 'bg-[#1DAB61] text-[#042116] shadow-xs'
                  : 'text-white hover:bg-white/15'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ዝርዝር መዝገብ (Table)</span>
            </button>
            <button
              onClick={() => setViewMode('notifications')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'notifications'
                  ? 'bg-[#1DAB61] text-[#042116] shadow-xs'
                  : 'text-white hover:bg-white/15'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>ኢሜይሎች</span>
            </button>
          </div>

          {/* CSV Export Button */}
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-extrabold transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0 ${
              exportSuccess
                ? 'bg-[#1DAB61] border-white text-[#042116]'
                : 'border-white/40 bg-white text-[#155544] hover:bg-[#5A8FBB] hover:text-white'
            }`}
            title="የተጣራውን የመዋጮ መዝገብ በCSV (Excel) ፋይል አውርድ"
          >
            {exportSuccess ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>CSV ወርዷል!</span>
              </>
            ) : isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B5E20]" />
                <span>በማዘጋጀት ላይ...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-[#1B5E20]" />
                <span>CSV አውርድ ({filteredContributions.length})</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenPrintReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-white/40 bg-white text-[#0F2438] hover:bg-[#517DA2] hover:text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5 text-neutral-500" />
            <span>ሪፖርት አትም</span>
          </button>

          {onOpenPaymentManager && (
            <button
              onClick={() => onOpenPaymentManager(undefined, 'list')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#417E38] hover:bg-[#155544] text-white text-xs font-extrabold transition-colors shadow-xs cursor-pointer border border-white/25 whitespace-nowrap shrink-0"
              title="የአባላት ክፍያዎች መዝገብ አስተዳድር (Delete & Manual Add)"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>የአባላት ክፍያዎች (Ledger)</span>
            </button>
          )}

          {onOpenBatchPayment && (
            <button
              onClick={() => onOpenBatchPayment()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#5A8FBB] hover:bg-[#517DA2] hover:text-white text-[#071E33] text-xs font-extrabold transition-colors shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="የጅምላ ደረሰኝ / የክፍያ ክፍፍል (Batch Payment & Credit Wallet)"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-950" />
              <span>የክፍፍል ክፍያ (Batch)</span>
            </button>
          )}

          <button
            onClick={onOpenRecordPayment}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#155544] hover:bg-[#417E38] text-white text-xs font-extrabold transition-colors shadow-sm border border-[#1DAB61] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 text-[#FFD700]" />
            <span>ክፍያ መዝግብ</span>
          </button>
        </div>
      </div>

      {/* Pending Payments Approval Notice Banner */}
      {pendingContributionsCount > 0 && (
        <div className="bg-[#5A8FBB]/20 border-2 border-[#517DA2] text-neutral-950 p-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2.5 font-semibold">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong className="font-extrabold text-[#0F2438]">ማረጋገጫ የሚጠብቁ (Pending)፦</strong>{' '}
              {pendingContributionsCount} ክፍያ(ዎች) ከዋናው አስተዳዳሪ (Master Admin) ማረጋገጫ በመጠባበቅ ላይ ናቸው።
              {!isMasterAdmin && ' ክፍያዎች ዋናው አድሚን እስኪያጸድቃቸው ድረስ በሂሳብ ውስጥ አይካተቱም።'}
            </span>
          </div>
          <button
            onClick={() => {
              setViewMode('table');
              setSelectedStatus('Pending');
            }}
            className="px-3 py-1.5 bg-[#83257B] hover:bg-[#691c63] text-white rounded-lg font-extrabold text-[11px] shrink-0 cursor-pointer transition-colors whitespace-nowrap"
          >
            Pending ክፍያዎችን እይ ({pendingContributionsCount})
          </button>
        </div>
      )}

      {/* Firestore Error Alert */}
      {firestoreError && (
        <div className="bg-[#83257B]/10 border-2 border-[#83257B] text-neutral-950 p-4 rounded-xl text-xs flex items-center justify-between font-semibold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span><strong className="font-extrabold text-[#83257B]">የዳታቤዝ ማስጠንቀቂያ፡</strong> {firestoreError}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-2.5 py-1 bg-[#83257B] hover:bg-[#691c63] text-white rounded font-extrabold text-[11px] cursor-pointer"
          >
            እንደገና ጫን
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="bg-white p-8 rounded-xl border-2 border-[#5A8FBB]/40 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#1B5E20] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-extrabold text-[#155544]">የቀጥታ መረጃዎች ከFirestore እየተጫኑ ነው (Loading live payments)...</span>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-14 bg-[#5A8FBB]/15 rounded-lg animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* ═══════════════════════════════════════════════════════════════ */
        /* MONTHLY PAYMENT GRID VIEW (STEP D & PART 1)                   */
        /* ═══════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Grid Filters and Legend */}
          <div className="bg-white p-4 rounded-xl border-2 border-[#5A8FBB]/45 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Year Selector Tabs */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-neutral-900">የኢትዮጵያ ዓ.ም፡</span>
              <div className="inline-flex rounded-xl border border-[#517DA2]/45 p-0.5 bg-[#5A8FBB]/15">
                {[2018, 2019, 2020].map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setGridYear(yr)}
                    className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                      gridYear === yr
                        ? 'bg-[#155544] text-white shadow-xs'
                        : 'text-neutral-900 hover:text-[#155544] hover:bg-white'
                    }`}
                  >
                    {yr} ዓ.ም {yr === 2018 && '(ከሀምሌ ጀምሮ)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Member and Family Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="አባል ፈልግ..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#155544]/30 focus:border-[#155544] text-neutral-950 font-bold placeholder:text-neutral-600"
                />
              </div>

              <select
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ቤተሰቦች</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.familyName} ({f.headName})
                  </option>
                ))}
              </select>

              <select
                value={generationFilter}
                onChange={(e) => setGenerationFilter(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ትውልዶች</option>
                <option value="4">4ኛ ትውልድ</option>
                <option value="5">5ኛ ትውልድ</option>
                <option value="6">6ኛ ትውልድ</option>
              </select>
            </div>

            {/* Grid Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-extrabold text-neutral-900">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#417E38] border border-[#155544]"></span>
                <span>ተከፍሏል (Paid)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#5A8FBB] border border-[#517DA2]"></span>
                <span>በመጠባበቅ (Pending)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#83257B] border border-[#83257B]"></span>
                <span>ከፊል (Partial)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-neutral-200 border border-neutral-400"></span>
                <span>ያልተከፈለ (Unpaid)</span>
              </div>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="bg-white rounded-xl border-2 border-[#5A8FBB]/45 shadow-sm overflow-hidden">
            <div className="p-3.5 bg-[#517DA2]/10 border-b-2 border-[#5A8FBB]/35 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1B5E20]" />
                <h3 className="text-xs font-extrabold text-[#0F2438]">
                  የ{gridYear} ዓ.ም ወርሃዊ መዋጮ ማትሪክስ ({filteredGridMembers.length} አባላት)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-800 font-semibold italic hidden sm:inline">
                  * ሴሉን በመጫን የክፍያ ሁኔታውን በቀጥታ ይቀይሩ
                </span>
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold transition-all shadow-xs cursor-pointer ${
                    exportSuccess
                      ? 'bg-[#1DAB61] text-[#042116]'
                      : 'bg-white hover:bg-[#155544] hover:text-white text-[#155544] border border-[#155544]/40'
                  }`}
                  title={`የ${gridYear} ዓ.ም ማትሪክስ መረጃ በCSV አውርድ`}
                >
                  {exportSuccess ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-[#FFD700]" />
                      <span>CSV ወርዷል!</span>
                    </>
                  ) : isExporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B5E20]" />
                      <span>በማዘጋጀት ላይ...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-[#1B5E20]" />
                      <span>የማትሪክስ CSV አውርድ</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                <thead className="bg-[#155544] text-white font-extrabold border-b-2 border-[#417E38]">
                  <tr>
                    <th className="py-2.5 px-3 sticky left-0 bg-[#155544] text-white z-10 w-48 border-r border-white/20">
                      የአባል ስም / ትውልድ
                    </th>
                    {gridMonths.map((m) => {
                      const isHamleOrLater2018 = gridYear === 2018 ? m.number >= 11 : true;
                      const isCurr = currentDate.month === m.number && currentDate.year === gridYear;
                      return (
                        <th
                          key={m.number}
                          className={`py-2 px-2 text-center border-r border-white/15 text-[11px] font-extrabold ${
                            isCurr
                              ? 'bg-[#83257B] text-white'
                              : isHamleOrLater2018
                              ? 'text-white'
                              : 'text-white/75 bg-[#155544]/90'
                          }`}
                        >
                          <div>{m.amharic}</div>
                          <div className="text-[9px] font-bold text-white/90">
                            {m.number === 11 && gridYear === 2018 ? 'መነሻ' : `${m.number}ኛ`}
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-3 text-center text-white font-extrabold">
                      ማጠቃለያ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#5A8FBB]/20">
                  {filteredGridMembers.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-10 text-center text-neutral-800 font-bold">
                        ምንም የተመዘገበ አባል አልተገኘም
                      </td>
                    </tr>
                  ) : (
                    filteredGridMembers.map((member) => {
                      // Filter live contributions for this member
                      const memberContribs = liveContributions.filter(
                        (c) => String(c.memberId).trim() === String(member.id).trim()
                      );

                      const expectedRate = member.isMinor
                        ? 0
                        : member.isSpouse
                        ? settings.spouseMonthlyRate || 100
                        : settings.monthlyRate[member.generation] || 50;

                      let memberPaidCount = 0;
                      let memberPartialCount = 0;
                      let memberPendingCount = 0;
                      let memberUnpaidCount = 0;

                      return (
                        <tr key={member.id} className="hover:bg-[#5A8FBB]/10 transition-colors">
                          {/* Member Sticky Column */}
                          <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-[#5A8FBB]/30">
                            <div className="font-extrabold text-neutral-950 truncate max-w-[170px]" title={member.fullName}>
                              {member.fullName}
                            </div>
                            <div className="text-[10px] text-[#517DA2] font-bold flex items-center gap-1 mt-0.5">
                              <span className="font-mono text-[#155544]">{member.id}</span>
                              <span>·</span>
                              <span>{member.generation}ኛ ትውልድ</span>
                            </div>
                          </td>

                          {/* 12 Months Cells */}
                          {gridMonths.map((m) => {
                            const matchResult = matchMonthContribution(
                              memberContribs,
                              m.number,
                              gridYear,
                              expectedRate
                            );

                            const cellStatus = matchResult.status;
                            const contribDoc = matchResult.contribution;
                            const isStartingHamle = gridYear === 2018 && m.number < 11 && cellStatus === 'unpaid';

                            if (cellStatus === 'paid') memberPaidCount++;
                            else if (cellStatus === 'partial') memberPartialCount++;
                            else if (cellStatus === 'pending') memberPendingCount++;
                            else if (!isStartingHamle) memberUnpaidCount++;

                            const cellKey = `${member.id}-${gridYear}-${m.number}`;
                            const isToggling = togglingCellKey === cellKey;

                            return (
                              <td
                                key={m.number}
                                className="p-1 text-center border-r border-[#5A8FBB]/20 align-middle"
                              >
                                {isStartingHamle ? (
                                  <span className="text-[10px] text-neutral-500 font-mono font-bold">-</span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleToggleCellStatus(
                                        member,
                                        m.number,
                                        gridYear,
                                        cellStatus,
                                        contribDoc
                                      )
                                    }
                                    disabled={isToggling || (!isMasterAdmin && (cellStatus === 'paid' || cellStatus === 'partial'))}
                                    className={`w-full py-1.5 px-1 rounded-md text-[10px] font-extrabold transition-all flex flex-col items-center justify-center border ${
                                      cellStatus === 'paid'
                                        ? 'bg-[#417E38] text-white border-[#155544] hover:bg-[#155544] shadow-2xs'
                                        : cellStatus === 'pending'
                                        ? 'bg-[#5A8FBB]/30 text-[#0F2438] border-[#517DA2] hover:bg-[#5A8FBB]/50 shadow-2xs'
                                        : cellStatus === 'partial'
                                        ? 'bg-[#83257B] text-white border-[#691c63] hover:bg-[#691c63] shadow-2xs'
                                        : 'bg-neutral-100 text-neutral-800 border-neutral-300 hover:border-[#417E38] hover:bg-[#1DAB61]/15 hover:text-[#155544]'
                                    } ${!isMasterAdmin && (cellStatus === 'paid' || cellStatus === 'partial') ? 'cursor-default opacity-95' : 'cursor-pointer'}`}
                                    title={`${member.fullName} - ${m.amharic} ${gridYear}: ${
                                      cellStatus === 'paid'
                                        ? `ተከፍሏል (${matchResult.paidAmount} ብር)`
                                        : cellStatus === 'pending'
                                        ? isMasterAdmin
                                          ? `በመጠባበቅ ላይ (Pending) — ለማጽደቅ ይጫኑ`
                                          : `በመጠባበቅ ላይ (Pending) — የዋና አድሚን ማረጋገጫ ይጠብቃል`
                                        : cellStatus === 'partial'
                                        ? `ከፊል (${matchResult.paidAmount} ብር)`
                                        : isMasterAdmin
                                        ? 'ያልተከፈለ (ጠቅ ያድርጉ ለመመዝገብ)'
                                        : 'ያልተከፈለ (ጠቅ ያድርጉ በPending ለመመዝገብ)'
                                    }`}
                                  >
                                    {isToggling ? (
                                      <RefreshCw className="w-3 h-3 animate-spin text-neutral-400" />
                                    ) : cellStatus === 'paid' ? (
                                      <div className="flex items-center gap-0.5">
                                        <Check className="w-3 h-3" />
                                        <span>ተከፍሏል</span>
                                      </div>
                                    ) : cellStatus === 'pending' ? (
                                      <div className="flex items-center gap-0.5">
                                        <Clock className="w-3 h-3 text-amber-700" />
                                        <span>በመጠባበቅ</span>
                                      </div>
                                    ) : cellStatus === 'partial' ? (
                                      <div className="flex items-center gap-0.5">
                                        <span>{matchResult.paidAmount}ብር</span>
                                      </div>
                                    ) : (
                                      <span className="text-neutral-800 font-bold">ያልተከፈለ</span>
                                    )}
                                  </button>
                                )}
                              </td>
                            );
                          })}

                          {/* Summary Column */}
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5 text-[11px] flex-wrap justify-center">
                              <span className="px-1.5 py-0.5 rounded bg-[#1DAB61]/25 text-[#155544] border border-[#417E38]/40 font-extrabold">
                                {memberPaidCount} ወር
                              </span>
                              {memberPendingCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-[#5A8FBB]/25 text-[#0F2438] border border-[#517DA2]/50 font-extrabold">
                                  {memberPendingCount} Pending
                                </span>
                              )}
                              {memberUnpaidCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/40 font-extrabold">
                                  {memberUnpaidCount} ያልተከፈለ
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* ═══════════════════════════════════════════════════════════════ */
        /* CONTRIBUTIONS LEDGER TABLE VIEW                               */
        /* ═══════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border-2 border-[#5A8FBB]/45 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="አባል፣ ደረሰኝ ወይም Ref ፈልግ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-[#5A8FBB]/10 border-2 border-[#5A8FBB]/45 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#155544]/30 focus:border-[#155544] text-neutral-950 font-bold placeholder:text-neutral-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-[#0F2438] whitespace-nowrap bg-[#5A8FBB]/20 px-2.5 py-1.5 rounded-lg border border-[#517DA2]/40">
                የክፍያ ወር (Contribution Month)፦
              </span>
              {/* Year selector */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ዓ.ም</option>
                <option value="2018">2018 ዓ.ም</option>
                <option value="2019">2019 ዓ.ም</option>
                <option value="2020">2020 ዓ.ም</option>
              </select>

              {/* Family selector */}
              <select
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ቤተሰቦች</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.familyName}
                  </option>
                ))}
              </select>

              {/* Month selector */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ወራት</option>
                {ETHIOPIAN_MONTHS.map((m) => (
                  <option key={m.number} value={m.number}>
                    {m.number} = {m.amharic}
                  </option>
                ))}
              </select>

              {/* Type selector */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ዓይነት</option>
                <option value="ወርሃዊ">ወርሃዊ</option>
                <option value="ትውልድ">የትውልድ</option>
                <option value="ልዩ">ልዩ</option>
              </select>

              {/* Status selector */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs bg-white border-2 border-[#517DA2]/45 rounded-lg px-2.5 py-1.5 text-neutral-950 font-bold"
              >
                <option value="all">ሁሉም ሁኔታ</option>
                <option value="Pending">በመጠባበቅ ላይ (Pending)</option>
                <option value="ተከፍሏል">ተከፍሏል (Paid)</option>
                <option value="ከፊል">ከፊል (Partial)</option>
                <option value="ያልተከፈለ">ያልተከፈለ (Unpaid)</option>
              </select>

              {/* Clear filters button */}
              {(searchQuery || selectedYear !== 'all' || selectedFamily !== 'all' || selectedMonth !== 'all' || selectedType !== 'all' || selectedStatus !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedYear('all');
                    setSelectedFamily('all');
                    setSelectedMonth('all');
                    setSelectedType('all');
                    setSelectedStatus('all');
                  }}
                  className="text-xs text-[#83257B] hover:text-white font-extrabold px-2.5 py-1.5 rounded-lg bg-[#83257B]/10 hover:bg-[#83257B] border border-[#83257B]/40 flex items-center gap-1 transition-colors cursor-pointer"
                  title="ማጣሪያዎችን አጽዳ"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>አጽዳ</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Summary & Quick CSV Export Action Bar */}
          <div className="bg-[#1DAB61]/15 border-2 border-[#417E38]/45 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-neutral-950">
              <span className="font-extrabold">
                የተጣሩ ክፍያዎች፡ <span className="text-[#155544] font-mono font-black text-sm tabular-nums">{filteredContributions.length}</span>
              </span>
              <span className="text-[#517DA2] font-bold">·</span>
              <span className="font-bold">
                የተሰበሰበ ጠቅላላ፡ <strong className="text-[#155544] font-mono text-sm tabular-nums font-black">{totalCollectedFiltered.toLocaleString()} ብር</strong>
              </span>
              {selectedYear !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-white border border-[#517DA2]/50 text-neutral-950 text-[11px] font-extrabold">
                  {selectedYear} ዓ.ም
                </span>
              )}
              {selectedMonth !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-[#155544] text-white text-[11px] font-extrabold">
                  {getEthiopianMonthName(Number(selectedMonth))}
                </span>
              )}
              {selectedType !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-[#517DA2] text-white text-[11px] font-extrabold">
                  {selectedType}
                </span>
              )}
              {selectedStatus !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-[#83257B] text-white text-[11px] font-extrabold">
                  {selectedStatus}
                </span>
              )}
            </div>

            {/* Direct CSV Export Button for Filtered List */}
            <button
              onClick={handleExportCSV}
              disabled={isExporting || filteredContributions.length === 0}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all shadow-xs shrink-0 whitespace-nowrap ${
                exportSuccess
                  ? 'bg-[#417E38] text-white'
                  : filteredContributions.length === 0
                  ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed border border-neutral-300'
                  : 'bg-[#155544] hover:bg-[#417E38] text-white cursor-pointer'
              }`}
              title="የተጣራውን የመዋጮ ዝርዝር በCSV (Excel) ፋይል አውርድ"
            >
              {exportSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 text-[#FFD700]" />
                  <span>CSV ፋይል ወርዷል!</span>
                </>
              ) : isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#FFD700]" />
                  <span>በማዘጋጀት ላይ...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#FFD700]" />
                  <span>የተጣራውን በCSV አውርድ ({filteredContributions.length})</span>
                </>
              )}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border-2 border-[#5A8FBB]/45 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#155544] text-white font-extrabold border-b-2 border-[#417E38]">
                  <tr>
                    <th className="py-3.5 px-4">ContributionID</th>
                    <th className="py-3.5 px-4">MemberID & Name (አባል)</th>
                    <th className="py-3.5 px-4">Type (ዓይነት)</th>
                    <th className="py-3.5 px-4">ወር / ዓ.ም</th>
                    <th className="py-3.5 px-4">ቀንና ሰዓት (Date & Time)</th>
                    <th className="py-3.5 px-4 text-right">የተከፈለ መጠን</th>
                    <th className="py-3.5 px-4">የክፍያ ዘዴ / Ref</th>
                    <th className="py-3.5 px-4">Status (ሁኔታ)</th>
                    <th className="py-3.5 px-4 text-right">ተግባራት</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#5A8FBB]/20">
                  {filteredContributions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-neutral-800 font-bold">
                        ምንም ክፍያ አልተመዘገበም
                      </td>
                    </tr>
                  ) : (
                    filteredContributions.map((c, idx) => (
                      <tr key={`${c.id}-${idx}`} className="hover:bg-[#5A8FBB]/10 transition-colors">
                        <td className="py-3 px-4 font-mono font-extrabold text-[#155544]">
                          <div>
                            <span>{c.id}</span>
                            {c.receiptNumber && (
                              <span className="text-[10px] text-neutral-800 font-bold block">{c.receiptNumber}</span>
                            )}
                            {(c.masterReceiptId || c.masterReceiptNumber) && (
                              <span
                                className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#5A8FBB]/25 text-[#0F2438] border border-[#517DA2] text-[9px] font-extrabold"
                                title={`Master Receipt ID: ${c.masterReceiptId || ''}`}
                              >
                                <Link2 className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                <span>{c.masterReceiptNumber || c.masterReceiptId}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-neutral-950">{c.memberName}</span>
                              {(c.isProxyPayment || (c.payerId && c.payerId !== c.beneficiaryId)) && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/40">
                                  ተኪ (Proxy)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-800 font-semibold flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="font-mono font-bold text-[#155544]">{c.memberId}</span>
                              <span>·</span>
                              <span>{c.generation}ኛ ትውልድ</span>
                              <span>·</span>
                              <span>{c.familyName}</span>
                            </div>
                            {(c.isProxyPayment || (c.payerId && c.payerId !== c.beneficiaryId)) && (
                              <div className="text-[10px] text-[#83257B] font-extrabold mt-0.5">
                                ከፋይ (Payer)፡ {c.payerName || c.payerId}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-[#5A8FBB]/20 text-[#0F2438] border border-[#5A8FBB]/40 font-extrabold">
                            {c.type}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-extrabold text-neutral-950">
                            {c.ethiopianMonthName} {c.ethiopianYear}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-mono text-[11px] text-neutral-900 font-bold">
                            {formatDisplayPaymentDateTime(c.datePaid, c.paidAt)}
                          </div>
                          {c.recordedBy && (
                            <div className="text-[10px] text-[#517DA2] font-bold truncate max-w-[140px]" title={`የመዘገበው፡ ${c.recordedBy}`}>
                              መዝጋቢ፡ {c.recordedBy}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-extrabold tabular-nums text-neutral-950">
                          <span className="text-[#155544] text-sm">{c.paidAmount} ብር</span>
                          {c.amount > c.paidAmount && (
                            <span className="text-[10px] text-[#83257B] font-bold block">ከ{c.amount} ብር</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div>
                            <span className="text-neutral-950 font-bold">{c.paymentMethod || 'ቀጥታ'}</span>
                            {c.transactionRef && (
                              <span className="text-[10px] font-mono font-bold text-[#517DA2] block">{c.transactionRef}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {isMasterAdmin ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <select
                                value={c.status}
                                onChange={async (e) => {
                                  const newSt = e.target.value as ContributionStatus;
                                  if (isPaidOrPartialStatus(newSt) && !isPaidOrPartialStatus(c.status)) {
                                    await handleApproveContribution(c);
                                  } else {
                                    onUpdateStatus(c.id, newSt);
                                    await saveContributionToFirestore({
                                      ...c,
                                      status: newSt,
                                    });
                                  }
                                }}
                                className={`text-[11px] font-extrabold rounded-lg px-2 py-1 border-2 transition-colors ${
                                  isPaidStatus(c.status)
                                    ? 'bg-[#1DAB61]/20 text-[#155544] border-[#417E38]'
                                    : isPendingStatus(c.status)
                                    ? 'bg-[#5A8FBB]/25 text-[#0F2438] border-[#517DA2]'
                                    : isPartialStatus(c.status)
                                    ? 'bg-[#517DA2]/20 text-[#0F2438] border-[#517DA2]'
                                    : 'bg-[#83257B]/15 text-[#83257B] border-[#83257B]/60'
                                }`}
                              >
                                <option value="ተከፍሏል">ተከፍሏል (Paid)</option>
                                <option value="Pending">በመጠባበቅ ላይ (Pending)</option>
                                <option value="ከፊል">ከፊል (Partial)</option>
                                <option value="ያልተከፈለ">ያልተከፈለ (Unpaid)</option>
                              </select>
                              {isPendingStatus(c.status) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await handleApproveContribution(c);
                                    }}
                                    className="px-2 py-1 bg-[#417E38] hover:bg-[#155544] text-white text-[10px] font-extrabold rounded-md shadow-2xs flex items-center gap-1 cursor-pointer"
                                    title="ደረሰኙን አጽድቅና ወደ Telegram Group ላክ (Approve)"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>አጽድቅ</span>
                                  </button>
                                  {onRejectContribution && (
                                    <button
                                      type="button"
                                      onClick={() => onRejectContribution(c)}
                                      className="px-2 py-1 bg-[#83257B]/15 hover:bg-[#83257B] hover:text-white text-[#83257B] border border-[#83257B]/50 text-[10px] font-extrabold rounded-md flex items-center gap-1 cursor-pointer"
                                      title="ውድቅ አድርግ (Reject Pending Payment)"
                                    >
                                      <X className="w-3 h-3" />
                                      <span>ውድቅ</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-0.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                                  isPaidStatus(c.status)
                                    ? 'bg-[#1DAB61]/20 text-[#155544] border-[#417E38]'
                                    : isPendingStatus(c.status)
                                    ? 'bg-[#5A8FBB]/25 text-[#0F2438] border-[#517DA2]'
                                    : isPartialStatus(c.status)
                                    ? 'bg-[#517DA2]/20 text-[#0F2438] border-[#517DA2]'
                                    : 'bg-[#83257B]/15 text-[#83257B] border-[#83257B]/60'
                                }`}
                              >
                                {isPendingStatus(c.status) && <Clock className="w-3 h-3 text-amber-700" />}
                                <span>
                                  {isPendingStatus(c.status)
                                    ? 'በመጠባበቅ ላይ (Pending)'
                                    : c.status}
                                </span>
                              </span>
                              {isPendingStatus(c.status) && (
                                <span className="text-[9px] text-[#517DA2] font-extrabold">
                                  የዋና አድሚን ማረጋገጫ ይጠብቃል
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedReceipt(c)}
                              className="p-1.5 rounded-lg text-[#1B5E20] hover:bg-[#1DAB61]/20 transition-colors cursor-pointer"
                              title="ደረሰኝ እይ"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            {(isMasterAdmin || !isPaidOrPartialStatus(c.status)) && (
                              <button
                                onClick={() => setPaymentToDelete(c)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-[#83257B]/15 transition-colors cursor-pointer"
                                title="ክፍያ ሰርዝ (Delete Payment)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════ */
        /* AUTOMATED EMAIL & NOTIFICATION LOGS (FIRESTORE)              */
        /* ═══════════════════════════════════════════════════════════════ */
        /* ═══════════════════════════════════════════════════════════════ */
        <div className="bg-white p-5 rounded-2xl border-2 border-[#5A8FBB]/45 shadow-sm space-y-4">
          {/* Gmail Integration Banner */}
          <div className="p-4 rounded-xl border-2 border-[#5A8FBB]/50 bg-[#5A8FBB]/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-blue-100 flex items-center justify-center shadow-xs shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-neutral-950 flex items-center gap-2 flex-wrap">
                  <span>Google Workspace / Gmail Integration</span>
                  {googleUser ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#1DAB61] text-[#042116] text-[10px] font-extrabold">
                      ተገናኝቷል ({googleUser.email})
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#517DA2]/40 text-neutral-900 font-bold text-[10px]">
                      አልተገናኘም
                    </span>
                  )}
                </h4>
                <p className="text-[11px] font-semibold text-neutral-900 mt-0.5">
                  የክፍያ ማጠቃለያዎችን እና ሪፖርቶችን በቀጥታ በGmail API በኩል ወደ አባላት እና አመራሮች መላክ ይችላሉ።
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {googleUser ? (
                <>
                  <button
                    onClick={() => {
                      setGmailRecipient('mesudnurga4830@gmail.com');
                      const curDate = getCurrentEthiopianDate();
                      setGmailSubject(`የአበሩስ አንድነት ማህበር - የክፍያ ማጠቃለያ (${getEthiopianMonthName(curDate.month)} ${curDate.year} ዓ.ም)`);
                      setGmailBody(`ሰላም፤\n\nየአበሩስ አንድነት ማህበር የወቅቱ የክፍያ ማጠቃለያ እንደሚከተለው ይገኛል፦\n• የተጣራ የተሰበሰበ ገቢ፡ ${totalCollectedFiltered.toLocaleString()} ብር\n• የተመዘገቡ ክፍያዎች ብዛት፡ ${filteredContributions.length}\n\nአመሰግናለሁ፤\nየአበሩስ አንድነት ማህበር`);
                      setGmailComposeOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#517DA2] hover:bg-[#155544] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>በGmail ላክ (Compose)</span>
                  </button>
                  <button
                    onClick={async () => {
                      await logoutGoogle();
                      setGoogleUser(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border-2 border-[#83257B]/50 text-[#83257B] hover:bg-[#83257B] hover:text-white text-xs font-extrabold transition-colors cursor-pointer"
                  >
                    ውጣ
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    setIsGoogleSigningIn(true);
                    try {
                      const res = await googleSignIn();
                      if (res?.user) setGoogleUser(res.user);
                    } catch (e: any) {
                      alert('የGoogle መግቢያ አልተሳካም፦ ' + (e?.message || 'Error'));
                    } finally {
                      setIsGoogleSigningIn(false);
                    }
                  }}
                  disabled={isGoogleSigningIn}
                  className="px-3 py-1.5 rounded-lg bg-white border-2 border-[#517DA2]/60 hover:bg-[#517DA2] hover:text-white text-neutral-950 text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span>{isGoogleSigningIn ? 'በመግባት ላይ...' : 'Sign in with Google (Connect Gmail)'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-b-2 border-[#5A8FBB]/30 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-neutral-950 flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#1B5E20]" />
                በFirestore የተመዘገቡ የክፍያ ማጠቃለያ ኢሜይሎች (Notification Logs)
              </h3>
              <p className="text-xs font-semibold text-neutral-800 mt-0.5">
                አባላት በPortal ክፍያ ሲመዘግቡ በራስ-ሰር ወደ mesudnurga4830@gmail.com የተላኩ ማጠቃለያዎች
              </p>
            </div>
            <button
              onClick={() => {
                setLoadingLogs(true);
                getNotificationLogsFromFirestore()
                  .then((logs) => setNotificationLogs(logs))
                  .finally(() => setLoadingLogs(false));
              }}
              className="px-3 py-1.5 rounded-lg border-2 border-[#517DA2]/50 text-xs font-extrabold hover:bg-[#517DA2] hover:text-white flex items-center gap-1.5 text-neutral-950 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>አድስ</span>
            </button>
          </div>

          {loadingLogs ? (
            <div className="py-8 text-center text-xs font-bold text-neutral-900">
              የማሳወቂያ መዝገብ እየተጫነ ነው...
            </div>
          ) : notificationLogs.length === 0 ? (
            <div className="py-8 text-center text-xs font-bold text-neutral-800">
              እስካሁን የተመዘገበ የኢሜይል ማሳወቂያ የለም። አባላት በMember Portal በኩል ክፍያ ሲመዘግቡ እዚህ ይታያሉ።
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#5A8FBB]/40">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#155544] text-white font-extrabold border-b border-[#155544]">
                  <tr>
                    <th className="py-3 px-3">የመዝገብ መለያ (Log ID)</th>
                    <th className="py-3 px-3">ተቀባይ (Recipient)</th>
                    <th className="py-3 px-3">የአባል ስም & ID</th>
                    <th className="py-3 px-3">ርዕስ (Subject)</th>
                    <th className="py-3 px-3 text-right">የተከፈለ መጠን</th>
                    <th className="py-3 px-3">የትራንዛክሽን Ref</th>
                    <th className="py-3 px-3">ሁኔታ</th>
                    <th className="py-3 px-3">የተላከበት ሰዓት</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#5A8FBB]/25">
                  {notificationLogs.map((log, idx) => (
                    <tr key={log.id} className={idx % 2 === 0 ? 'bg-white hover:bg-[#5A8FBB]/10' : 'bg-[#5A8FBB]/5 hover:bg-[#5A8FBB]/15'}>
                      <td className="py-2.5 px-3 font-mono font-bold text-neutral-900">{log.id}</td>
                      <td className="py-2.5 px-3 font-bold text-neutral-950">{log.recipient}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-extrabold text-neutral-950">{log.memberName}</span>
                        <span className="text-[10px] font-bold text-[#517DA2] block font-mono">{log.memberId}</span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900 max-w-xs truncate" title={log.subject}>
                        {log.subject}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#155544] tabular-nums">
                        {log.amount} ብር
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-neutral-900">{log.transactionRef || 'N/A'}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-[#1DAB61]/20 text-[#155544] font-extrabold text-[10px]">
                          {log.status === 'sent' ? 'ተልኳል (Sent)' : log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-800 text-[11px]">
                        {new Date(log.sentAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Single Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-[#155544]/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#5A8FBB]/30 pb-3">
              <div className="flex items-center gap-2">
                <img
                  src="/src/assets/images/abarrus_logo_emblem_1793040526236.jpg"
                  alt="Abarrus Emblem"
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-amber-400"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4 className="font-extrabold text-sm text-[#155544]">የክፍያ ደረሰኝ (Official Receipt)</h4>
                  <p className="text-[11px] font-bold text-[#517DA2] font-mono">{selectedReceipt.receiptNumber || selectedReceipt.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 rounded-lg text-neutral-900 font-bold hover:bg-[#5A8FBB]/20 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#5A8FBB]/10 p-4 rounded-xl border border-[#5A8FBB]/40 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="font-bold text-neutral-900">የአባል ስም፡</span>
                <span className="font-extrabold text-neutral-950">{selectedReceipt.memberName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-neutral-900">ትውልድ & ቤተሰብ፡</span>
                <span className="font-bold text-neutral-950">
                  {selectedReceipt.generation}ኛ ትውልድ · {selectedReceipt.familyName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-neutral-900">የመዋጮ ዓይነት፡</span>
                <span className="font-bold text-[#517DA2]">{selectedReceipt.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-neutral-900">የተከፈለበት ወር፡</span>
                <span className="font-extrabold text-[#155544]">
                  {selectedReceipt.ethiopianMonthName} {selectedReceipt.ethiopianYear} ዓ.ም
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#5A8FBB]/40">
                <span className="text-neutral-950 font-extrabold">የተከፈለ መጠን፡</span>
                <span className="font-extrabold text-lg text-[#155544] font-mono tabular-nums">
                  {selectedReceipt.paidAmount} ብር
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-neutral-900">
                <span className="font-bold">የክፍያ ቀንና ሰዓት፡</span>
                <span className="font-mono font-extrabold text-neutral-950">
                  {formatDisplayPaymentDateTime(selectedReceipt.datePaid, selectedReceipt.paidAt)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-neutral-900">
                <span className="font-bold">የክፍያ ዘዴ፡</span>
                <span className="font-bold text-neutral-950">{selectedReceipt.paymentMethod || 'ቀጥታ'}</span>
              </div>
              {selectedReceipt.recordedBy && (
                <div className="flex justify-between text-[11px] text-neutral-900">
                  <span className="font-bold">የመዘገበው (Recorded By)፡</span>
                  <span className="font-extrabold text-neutral-950">{selectedReceipt.recordedBy}</span>
                </div>
              )}
              {selectedReceipt.approvedBy && (
                <div className="flex justify-between text-[11px] text-[#417E38]">
                  <span className="font-bold">ያጸደቀው (Approved By)፡</span>
                  <span className="font-extrabold">
                    {selectedReceipt.approvedBy} {selectedReceipt.approvedAt ? `(${selectedReceipt.approvedAt})` : ''}
                  </span>
                </div>
              )}
              {selectedReceipt.transactionRef && (
                <div className="flex justify-between text-[11px] text-neutral-900">
                  <span className="font-bold">የትራንዛክሽን ቁጥር፡</span>
                  <span className="font-mono font-bold text-neutral-950">{selectedReceipt.transactionRef}</span>
                </div>
              )}
              {(selectedReceipt.masterReceiptId || selectedReceipt.masterReceiptNumber) && (
                <div className="p-2.5 rounded-xl bg-[#83257B]/10 border border-[#83257B]/40 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[#83257B] flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-amber-700" />
                      <span>የጅምላ ደረሰኝ ትስስር (Master Receipt)</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#83257B] text-white text-[10px] font-extrabold">
                      Batch Linked
                    </span>
                  </div>
                  {selectedReceipt.masterReceiptNumber && (
                    <div className="flex justify-between">
                      <span className="font-bold text-[#83257B]">የዋና ደረሰኝ ቁጥር፡</span>
                      <span className="font-mono font-extrabold text-neutral-950">{selectedReceipt.masterReceiptNumber}</span>
                    </div>
                  )}
                  {selectedReceipt.masterReceiptId && (
                    <div className="flex justify-between">
                      <span className="font-bold text-[#83257B]">Master Receipt ID:</span>
                      <span className="font-mono font-extrabold text-neutral-950">{selectedReceipt.masterReceiptId}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedReceipt.isProxyPayment && (
                <div className="p-2.5 rounded-xl bg-[#517DA2]/15 border border-[#517DA2]/40 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[#155544]">የተኪ ክፍያ መረጃ (Proxy Payment)</span>
                    <span className="px-2 py-0.5 rounded bg-[#517DA2] text-white text-[10px] font-extrabold">Proxy</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-[#517DA2]">ከፋይ አባል (Payer)፡</span>
                    <span className="font-extrabold text-neutral-950">{selectedReceipt.payerName} ({selectedReceipt.payerId})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-[#517DA2]">ተጠቃሚ አባል (Beneficiary)፡</span>
                    <span className="font-extrabold text-neutral-950">{selectedReceipt.beneficiaryName || selectedReceipt.memberName} ({selectedReceipt.beneficiaryId || selectedReceipt.memberId})</span>
                  </div>
                </div>
              )}

              {selectedReceipt.slipPhoto && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] text-neutral-950 font-extrabold block">የተያያዘ የክፍያ ደረሰኝ ፎቶ (Receipt Image)፡</span>
                  <div className="rounded-xl overflow-hidden border border-[#517DA2]/50 bg-neutral-900 flex items-center justify-center max-h-56">
                    <img src={selectedReceipt.slipPhoto} alt="Receipt Slip" className="max-h-56 w-auto object-contain" />
                  </div>
                </div>
              )}
            </div>

            {isPendingStatus(selectedReceipt.status) && (
              <div className="p-3 bg-[#83257B]/10 border border-[#83257B]/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-extrabold text-[#83257B] block">የማረጋገጫ ሁኔታ፡</span>
                  <span className="text-[11px] font-bold text-neutral-900">
                    {isMasterAdmin
                      ? 'ይህ ደረሰኝ በዋና አስተዳዳሪ ማረጋገጫ በመጠባበቅ ላይ ነው'
                      : 'ይህ ክፍያ በዋናው አስተዳዳሪ (Master Admin) እስኪጸድቅ በPending ሁኔታ ላይ ይገኛል'}
                  </span>
                </div>
                {isMasterAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = await handleApproveContribution(selectedReceipt);
                      setSelectedReceipt(updated);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1DAB61] hover:bg-[#417E38] text-[#042116] hover:text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>ደረሰኙን አጽድቅና ወደ ግሩፕ ላክ (Approve)</span>
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {onDispatchTelegram && (
                <button
                  type="button"
                  onClick={() => {
                    const m = members.find((mem) => mem.id === selectedReceipt.memberId);
                    const reportText = formatSinglePaymentTelegramReport(
                      selectedReceipt,
                      m,
                      liveContributions,
                      settings,
                      { includeDateTime: false }
                    );
                    const directUrl = `${getAppUrl()}/?role=member&memberId=${encodeURIComponent(
                      selectedReceipt.memberId
                    )}`;
                    onDispatchTelegram({
                      name: selectedReceipt.memberName,
                      role: `${selectedReceipt.type} ክፍያ ደረሰኝ`,
                      phone: m?.phone || '',
                      telegram: m?.telegram || '',
                      messageText: reportText,
                      directUrl,
                    });
                  }}
                  className="px-4 py-2 rounded-lg bg-[#5A8FBB] hover:bg-[#517DA2] text-[#071E33] hover:text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>በTelegram ላክ</span>
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-[#155544] hover:bg-[#417E38] text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>ደረሰኝ አትም (Print)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Compose Modal */}
      {gmailComposeOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-[#517DA2]/60 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#5A8FBB]/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-neutral-950">በGmail ኢሜይል ላክ (Send via Gmail API)</h3>
                  <p className="text-[11px] font-semibold text-neutral-800">
                    ከመለያዎ ({googleUser?.email || 'Gmail'}) በቀጥታ የሚላክ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGmailComposeOpen(false)}
                className="p-1.5 rounded-lg text-neutral-800 hover:text-neutral-950 hover:bg-[#5A8FBB]/15 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {gmailStatusNotice && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  gmailStatusNotice.includes('ተልኳል')
                    ? 'bg-[#1DAB61]/15 text-[#155544] border border-[#1DAB61]/50'
                    : 'bg-[#83257B]/10 text-[#83257B] border border-[#83257B]/40'
                }`}
              >
                {gmailStatusNotice.includes('ተልኳል') ? (
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{gmailStatusNotice}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-extrabold text-neutral-950 mb-1">
                  ተቀባይ ኢሜይል (To:)
                </label>
                <input
                  type="email"
                  value={gmailRecipient}
                  onChange={(e) => setGmailRecipient(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 rounded-lg border-2 border-[#5A8FBB]/50 text-xs font-bold text-neutral-950 focus:outline-none focus:ring-2 focus:ring-[#517DA2] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-neutral-950 mb-1">
                  ርዕስ (Subject:)
                </label>
                <input
                  type="text"
                  value={gmailSubject}
                  onChange={(e) => setGmailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border-2 border-[#5A8FBB]/50 text-xs font-bold text-neutral-950 focus:outline-none focus:ring-2 focus:ring-[#517DA2]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-neutral-950 mb-1">
                  የመልዕክት ይዘት (Body:)
                </label>
                <textarea
                  value={gmailBody}
                  onChange={(e) => setGmailBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border-2 border-[#5A8FBB]/50 text-xs font-semibold text-neutral-950 focus:outline-none focus:ring-2 focus:ring-[#517DA2] resize-none font-sans"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#5A8FBB]/30 pt-3">
              <button
                type="button"
                onClick={() => setGmailComposeOpen(false)}
                className="px-3 py-1.5 rounded-lg border-2 border-[#517DA2]/40 text-xs font-extrabold text-neutral-900 hover:bg-[#517DA2]/10 transition-colors cursor-pointer"
              >
                ይቅር (Cancel)
              </button>
              <button
                type="button"
                disabled={isSendingGmail || !gmailRecipient.trim()}
                onClick={async () => {
                  setIsSendingGmail(true);
                  setGmailStatusNotice(null);
                  try {
                    await sendGmailMessage(gmailRecipient.trim(), gmailSubject, gmailBody);
                    setGmailStatusNotice('ኢሜይሉ በስኬት ተልኳል! (Email sent successfully via Gmail API)');
                    setTimeout(() => {
                      setGmailComposeOpen(false);
                      setGmailStatusNotice(null);
                    }, 2000);
                  } catch (err: any) {
                    console.error('Failed to send email via Gmail API:', err);
                    setGmailStatusNotice('ኢሜይል መላክ አልተሳካም፦ ' + (err?.message || 'Error occurred'));
                  } finally {
                    setIsSendingGmail(false);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-[#155544] hover:bg-[#417E38] disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {isSendingGmail ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>በመላክ ላይ...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>ላክ (Send with Gmail)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Delete Notification Banner */}
      {deleteNotice && (
        <div className="fixed bottom-6 right-6 z-60 bg-[#155544] text-white text-xs font-extrabold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border-2 border-[#1DAB61] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{deleteNotice}</span>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-[#83257B]/60 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-950">
                  የክፍያ መዝገብ ይሰረዝ? (Delete Payment)
                </h3>
                <p className="text-xs font-semibold text-neutral-800">
                  በስህተት የተመዘገበ ክፍያን ከዳታቤዝ የመሰረዝ ማረጋገጫ
                </p>
              </div>
            </div>

            <div className="bg-[#83257B]/10 border border-[#83257B]/40 rounded-xl p-3.5 space-y-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-neutral-900 font-bold">የአባል ስም፡</span>
                <span className="font-extrabold text-neutral-950">{paymentToDelete.memberName} ({paymentToDelete.memberId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-900 font-bold">የክፍያ ዓይነት፡</span>
                <span className="font-extrabold text-neutral-950">{paymentToDelete.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-900 font-bold">ወር / ዓ.ም፡</span>
                <span className="font-extrabold text-neutral-950">
                  {paymentToDelete.type === 'ትውልድ'
                    ? 'የትውልድ መዋጮ'
                    : `${paymentToDelete.ethiopianMonthName || paymentToDelete.ethiopianMonth || ''} ${paymentToDelete.ethiopianYear || ''} ዓ.ም`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-900 font-bold">የተከፈለ መጠን፡</span>
                <span className="font-mono font-extrabold text-[#83257B]">
                  {Number(paymentToDelete.paidAmount || paymentToDelete.amount || 0).toLocaleString()} ብር
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-900 font-bold">የክፍያ መለያ (ID)፡</span>
                <span className="font-mono font-bold text-[10px] text-neutral-800">{paymentToDelete.id}</span>
              </div>
            </div>

            <p className="text-[11px] font-bold text-neutral-900 mb-5 leading-relaxed">
              ⚠️ ይህ ድርጊት የተሳሳተውን የክፍያ መዝገብ ከFirestore 'contributions' ዳታቤዝ ላይ ሙሉ በሙሉ ይሰርዘዋል።
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={() => setPaymentToDelete(null)}
                className="px-4 py-2.5 rounded-xl border-2 border-[#517DA2]/40 text-neutral-900 hover:bg-[#517DA2]/10 text-xs font-extrabold transition-colors cursor-pointer"
              >
                ተመለስ (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={handleConfirmDeleteContribution}
                className="px-5 py-2.5 rounded-xl bg-[#83257B] hover:bg-[#6a1d63] text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeletingPayment ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>በመሰረዝ ላይ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>አዎ፣ ሙሉ በሙሉ ሰርዝ (Delete)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

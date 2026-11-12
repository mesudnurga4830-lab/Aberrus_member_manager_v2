/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Contribution, Member, Family, SettingsRates, ContributionStatus, NotificationLog } from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
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
} from 'lucide-react';

interface ContributionsManagerProps {
  contributions: Contribution[];
  members: Member[];
  families: Family[];
  settings: SettingsRates;
  onOpenRecordPayment: () => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
  onUpdateStatus: (id: string, newStatus: ContributionStatus) => void;
  onDeleteContribution: (id: string) => void;
  onOpenPrintReport: () => void;
}

export const ContributionsManager: React.FC<ContributionsManagerProps> = ({
  contributions: propContributions,
  members,
  families,
  settings,
  onOpenRecordPayment,
  onOpenPaymentManager,
  onUpdateStatus,
  onDeleteContribution,
  onOpenPrintReport,
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
    setIsDeletingPayment(true);
    try {
      // 1. Optimistically update local view
      setLiveContributions((prev) => prev.filter((item) => item.id !== c.id));
      // 2. Call parent callback
      onDeleteContribution(c.id);
      // 3. Delete from Firestore & server API
      await deleteContributionFromFirestore(c.id);
      setDeleteNotice(`የክፍያ መዝገብ "${c.id}" (${c.type}) በተሳካ ሁኔታ ተሰርዟል!`);
      setPaymentToDelete(null);
      setTimeout(() => setDeleteNotice(null), 4000);
    } catch (err: any) {
      console.error('Error deleting contribution:', err);
      // Rollback on error
      setLiveContributions((prev) => [c, ...prev]);
      alert('ክፍያውን መሰረዝ አልተቻለም፡ ' + (err?.message || 'Error'));
    } finally {
      setIsDeletingPayment(false);
    }
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
    if (selectedYear !== 'all' && c.ethiopianYear !== Number(selectedYear)) return false;
    if (selectedFamily !== 'all' && c.familyId !== selectedFamily) return false;
    if (selectedMonth !== 'all' && c.ethiopianMonth !== Number(selectedMonth)) return false;
    if (selectedType !== 'all' && c.type !== selectedType) return false;
    if (selectedStatus !== 'all' && c.status !== selectedStatus) return false;
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
    .filter((c) => {
      const st = String(c.status || '').toLowerCase();
      return st === 'ተከፍሏል' || st === 'paid' || st === 'ከፊል' || st === 'partial';
    })
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  // Quick Cell Click Toggle Handler: Toggles status between Paid and Unpaid live in Firestore
  const handleToggleCellStatus = async (
    member: Member,
    monthNum: number,
    yearNum: number,
    currentStatus: 'paid' | 'partial' | 'unpaid',
    existingDoc?: Contribution
  ) => {
    const cellKey = `${member.id}-${yearNum}-${monthNum}`;
    setTogglingCellKey(cellKey);

    const standardRate = member.isMinor
      ? 0
      : member.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[member.generation] || 50;

    const newStatus: ContributionStatus = currentStatus === 'paid' ? 'ያልተከፈለ' : 'ተከፍሏል';
    const newPaidAmount = newStatus === 'ተከፍሏል' ? standardRate : 0;
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
      ethiopianMonth: monthNum,
      ethiopianMonthName: getEthiopianMonthName(monthNum),
      ethiopianYear: yearNum,
      amount: standardRate,
      paidAmount: newPaidAmount,
      status: newStatus,
      paymentMethod: existingDoc?.paymentMethod || 'ጥሬ ገንዘብ (Cash)',
      transactionRef: existingDoc?.transactionRef || '',
      datePaid: newStatus === 'ተከፍሏል' ? new Date().toISOString().slice(0, 10) : '',
      notes: `ማትሪክስ የቀጥታ ማስተካከያ (${newStatus})`,
    };

    try {
      console.log(`[Matrix Quick Toggle] Saving contribution ${docId} with status "${newStatus}" for ${member.fullName}`);
      await saveContributionToFirestore(updatedDoc);
      // Also update local parent if callback exists
      onUpdateStatus(docId, newStatus);
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
        (c) => memberIds.has(c.memberId) && c.ethiopianYear === gridYear
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
        'ቀን (Date)',
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
        const paid = Number(c.paidAmount) || 0;
        const remaining = Math.max(0, expected - paid);
        totalExpected += expected;
        totalPaid += paid;
        totalRemaining += remaining;

        const member = memberMap.get(c.memberId);
        const monthName =
          c.ethiopianMonthName ||
          (c.ethiopianMonth ? getEthiopianMonthName(c.ethiopianMonth) : '');

        return [
          escapeVal(c.datePaid || ''),
          escapeVal(c.memberName),
          escapeVal(c.memberId),
          escapeVal(member?.phone || ''),
          escapeVal(c.familyName || member?.familyName || ''),
          escapeVal(`${c.generation || 4}ኛ ትውልድ`),
          escapeVal(c.type || 'ወርሃዊ'),
          escapeVal(monthName),
          escapeVal(c.ethiopianYear || 2018),
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
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-[#1B5E20]/10 text-[#1B5E20] text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              የቀጥታ ዳታቤዝ (Live Firestore Sync)
            </span>
            <span className="text-neutral-300">|</span>
            <span className="text-xs text-neutral-500">
              የሰነዶች ብዛት፡ <strong className="text-neutral-800 font-mono">{liveContributions.length}</strong>
            </span>
            <span className="text-neutral-300">|</span>
            <span className="text-xs text-neutral-400">
              የመጨረሻ ማመሳሰል፡ {lastSyncTime.toLocaleTimeString()}
            </span>
          </div>

          <h2 className="text-xl font-bold text-neutral-900 mt-2">
            የአበሩስ ቤተሰብ መዋጮዎችና ክፍያዎች መዝገብ
          </h2>
          <p className="text-xs text-neutral-600 mt-1">
            የተጣራ ገቢ፡ <strong className="text-[#1B5E20] font-mono text-sm tabular-nums">{totalCollectedFiltered.toLocaleString()} ብር</strong>
            <span className="text-neutral-300 mx-2">·</span>
            በአሁኑ ወር: <strong className="text-neutral-800">{getEthiopianMonthName(currentDate.month)} {currentDate.year} ዓ.ም</strong>
          </p>
        </div>

        {/* View Switchers & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle Buttons */}
          <div className="inline-flex rounded-lg border border-neutral-300 p-0.5 bg-neutral-100">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'grid'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>የወርሃዊ ማትሪክስ (Grid)</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ዝርዝር መዝገብ (Table)</span>
            </button>
            <button
              onClick={() => setViewMode('notifications')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'notifications'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
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
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all shadow-xs ${
              exportSuccess
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs font-semibold transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-neutral-500" />
            <span>ሪፖርት አትም</span>
          </button>

          {onOpenPaymentManager && (
            <button
              onClick={() => onOpenPaymentManager(undefined, 'list')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
              title="የአባላት ክፍያዎች መዝገብ አስተዳድር (Delete & Manual Add)"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>የአባላት ክፍያዎች (Ledger)</span>
            </button>
          )}

          <button
            onClick={onOpenRecordPayment}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B5E20] hover:bg-[#154a19] text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#FFD700]" />
            <span>ክፍያ መዝግብ</span>
          </button>
        </div>
      </div>

      {/* Firestore Error Alert */}
      {firestoreError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span><strong>የዳታቤዝ ማስጠንቀቂያ፡</strong> {firestoreError}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-semibold text-[11px]"
          >
            እንደገና ጫን
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="bg-white p-8 rounded-xl border border-neutral-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#1B5E20] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-semibold text-neutral-700">የቀጥታ መረጃዎች ከFirestore እየተጫኑ ነው (Loading live payments)...</span>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-14 bg-neutral-100 rounded-lg animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* ═══════════════════════════════════════════════════════════════ */
        /* MONTHLY PAYMENT GRID VIEW (STEP D & PART 1)                   */
        /* ═══════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Grid Filters and Legend */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Year Selector Tabs */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-600">የኢትዮጵያ ዓ.ም፡</span>
              <div className="inline-flex rounded-lg border border-neutral-300 p-0.5 bg-neutral-100">
                {[2018, 2019].map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setGridYear(yr)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                      gridYear === yr
                        ? 'bg-[#1B5E20] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
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
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
                />
              </div>

              <select
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
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
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
              >
                <option value="all">ሁሉም ትውልዶች</option>
                <option value="4">4ኛ ትውልድ</option>
                <option value="5">5ኛ ትውልድ</option>
                <option value="6">6ኛ ትውልድ</option>
              </select>
            </div>

            {/* Grid Legend */}
            <div className="flex items-center gap-3 text-[11px] font-medium text-neutral-600">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[#1B5E20] border border-emerald-700"></span>
                <span>ተከፍሏል (Paid)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-500 border border-amber-600"></span>
                <span>ከፊል (Partial)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-neutral-200 border border-neutral-300"></span>
                <span>ያልተከፈለ (Unpaid)</span>
              </div>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1B5E20]" />
                <h3 className="text-xs font-bold text-neutral-800">
                  የ{gridYear} ዓ.ም ወርሃዊ መዋጮ ማትሪክስ ({filteredGridMembers.length} አባላት)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-500 italic hidden sm:inline">
                  * ሴሉን በመጫን የክፍያ ሁኔታውን በቀጥታ ይቀይሩ
                </span>
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all shadow-xs ${
                    exportSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white hover:bg-neutral-100 text-[#1B5E20] border border-[#1B5E20]/30'
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
                <thead className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3 sticky left-0 bg-neutral-100 z-10 w-48 border-r border-neutral-200">
                      የአባል ስም / ትውልድ
                    </th>
                    {gridMonths.map((m) => {
                      const isHamleOrLater2018 = gridYear === 2018 ? m.number >= 11 : true;
                      const isCurr = currentDate.month === m.number && currentDate.year === gridYear;
                      return (
                        <th
                          key={m.number}
                          className={`py-2 px-2 text-center border-r border-neutral-200 text-[11px] font-bold ${
                            isCurr
                              ? 'bg-amber-100/70 text-amber-900 border-amber-300'
                              : isHamleOrLater2018
                              ? 'text-neutral-800'
                              : 'text-neutral-400 bg-neutral-50'
                          }`}
                        >
                          <div>{m.amharic}</div>
                          <div className="text-[9px] font-normal text-neutral-500">
                            {m.number === 11 && gridYear === 2018 ? 'መነሻ' : `${m.number}ኛ`}
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-3 text-center text-neutral-800 font-bold">
                      ማጠቃለያ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {filteredGridMembers.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-10 text-center text-neutral-400 italic">
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
                      let memberUnpaidCount = 0;

                      return (
                        <tr key={member.id} className="hover:bg-neutral-50/70 transition-colors">
                          {/* Member Sticky Column */}
                          <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-neutral-200">
                            <div className="font-bold text-neutral-900 truncate max-w-[170px]" title={member.fullName}>
                              {member.fullName}
                            </div>
                            <div className="text-[10px] text-neutral-500 flex items-center gap-1 mt-0.5">
                              <span className="font-mono">{member.id}</span>
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
                            const isStartingHamle = gridYear === 2018 && m.number < 11;

                            if (cellStatus === 'paid') memberPaidCount++;
                            else if (cellStatus === 'partial') memberPartialCount++;
                            else if (!isStartingHamle) memberUnpaidCount++;

                            const cellKey = `${member.id}-${gridYear}-${m.number}`;
                            const isToggling = togglingCellKey === cellKey;

                            return (
                              <td
                                key={m.number}
                                className="p-1 text-center border-r border-neutral-200 align-middle"
                              >
                                {isStartingHamle ? (
                                  <span className="text-[10px] text-neutral-300 font-mono">-</span>
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
                                    disabled={isToggling}
                                    className={`w-full py-1.5 px-1 rounded-md text-[10px] font-bold transition-all flex flex-col items-center justify-center cursor-pointer border ${
                                      cellStatus === 'paid'
                                        ? 'bg-[#1B5E20] text-white border-emerald-800 hover:bg-emerald-700 shadow-2xs'
                                        : cellStatus === 'partial'
                                        ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-2xs'
                                        : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-900'
                                    }`}
                                    title={`${member.fullName} - ${m.amharic} ${gridYear}: ${
                                      cellStatus === 'paid'
                                        ? `ተከፍሏል (${matchResult.paidAmount} ብር)`
                                        : cellStatus === 'partial'
                                        ? `ከፊል (${matchResult.paidAmount} ብር)`
                                        : 'ያልተከፈለ (ጠቅ ያድርጉ ለመመዝገብ)'
                                    }`}
                                  >
                                    {isToggling ? (
                                      <RefreshCw className="w-3 h-3 animate-spin text-neutral-400" />
                                    ) : cellStatus === 'paid' ? (
                                      <div className="flex items-center gap-0.5">
                                        <Check className="w-3 h-3" />
                                        <span>ተከፍሏል</span>
                                      </div>
                                    ) : cellStatus === 'partial' ? (
                                      <div className="flex items-center gap-0.5">
                                        <span>{matchResult.paidAmount}ብር</span>
                                      </div>
                                    ) : (
                                      <span className="text-neutral-400">ያልተከፈለ</span>
                                    )}
                                  </button>
                                )}
                              </td>
                            );
                          })}

                          {/* Summary Column */}
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-[#1B5E20] font-bold">
                                {memberPaidCount} ወር
                              </span>
                              {memberUnpaidCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">
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
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="አባል፣ ደረሰኝ ወይም Ref ፈልግ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-neutral-700 whitespace-nowrap bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200">
                የክፍያ ወር (Contribution Month)፦
              </span>
              {/* Year selector */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
              >
                <option value="all">ሁሉም ዓ.ም</option>
                <option value="2018">2018 ዓ.ም</option>
                <option value="2019">2019 ዓ.ም</option>
              </select>

              {/* Family selector */}
              <select
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
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
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
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
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
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
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
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
                  className="text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1 rounded bg-red-50 hover:bg-red-100 flex items-center gap-1 transition-colors"
                  title="ማጣሪያዎችን አጽዳ"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>አጽዳ</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Summary & Quick CSV Export Action Bar */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-neutral-700">
              <span className="font-bold text-neutral-900">
                የተጣሩ ክፍያዎች፡ <span className="text-[#1B5E20] font-mono font-bold text-sm tabular-nums">{filteredContributions.length}</span>
              </span>
              <span className="text-neutral-300">|</span>
              <span>
                የተሰበሰበ ጠቅላላ፡ <strong className="text-[#1B5E20] font-mono text-sm tabular-nums">{totalCollectedFiltered.toLocaleString()} ብር</strong>
              </span>
              {selectedYear !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-800 text-[11px] font-medium">
                  {selectedYear} ዓ.ም
                </span>
              )}
              {selectedMonth !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#1B5E20] text-[11px] font-medium">
                  {getEthiopianMonthName(Number(selectedMonth))}
                </span>
              )}
              {selectedType !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-medium">
                  {selectedType}
                </span>
              )}
              {selectedStatus !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-medium">
                  {selectedStatus}
                </span>
              )}
            </div>

            {/* Direct CSV Export Button for Filtered List */}
            <button
              onClick={handleExportCSV}
              disabled={isExporting || filteredContributions.length === 0}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 ${
                exportSuccess
                  ? 'bg-emerald-700 text-white'
                  : filteredContributions.length === 0
                  ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300'
                  : 'bg-[#1B5E20] hover:bg-[#154a19] text-white cursor-pointer'
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
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                  <tr>
                    <th className="py-3 px-4">ContributionID</th>
                    <th className="py-3 px-4">MemberID & Name (አባል)</th>
                    <th className="py-3 px-4">Type (ዓይነት)</th>
                    <th className="py-3 px-4">ወር / ዓ.ም</th>
                    <th className="py-3 px-4 text-right">የተከፈለ መጠን</th>
                    <th className="py-3 px-4">የክፍያ ዘዴ / Ref</th>
                    <th className="py-3 px-4">Status (ሁኔታ)</th>
                    <th className="py-3 px-4 text-right">ተግባራት</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredContributions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-neutral-400 italic">
                        ምንም ክፍያ አልተመዘገበም
                      </td>
                    </tr>
                  ) : (
                    filteredContributions.map((c, idx) => (
                      <tr key={`${c.id}-${idx}`} className="hover:bg-neutral-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-neutral-600">
                          <div>
                            <span>{c.id}</span>
                            {c.receiptNumber && (
                              <span className="text-[10px] text-neutral-400 block">{c.receiptNumber}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-neutral-900">{c.memberName}</span>
                              {(c.isProxyPayment || (c.payerId && c.payerId !== c.beneficiaryId)) && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                  ተኪ (Proxy)
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="font-mono">{c.memberId}</span>
                              <span>·</span>
                              <span>{c.generation}ኛ ትውልድ</span>
                              <span>·</span>
                              <span>{c.familyName}</span>
                            </div>
                            {(c.isProxyPayment || (c.payerId && c.payerId !== c.beneficiaryId)) && (
                              <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                                ከፋይ (Payer)፡ {c.payerName || c.payerId}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-medium">
                            {c.type}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-medium text-neutral-800">
                            {c.ethiopianMonthName} {c.ethiopianYear}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-neutral-900">
                          <span className="text-[#1B5E20] text-sm">{c.paidAmount} ብር</span>
                          {c.amount > c.paidAmount && (
                            <span className="text-[10px] text-neutral-400 block">ከ{c.amount} ብር</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div>
                            <span className="text-neutral-700">{c.paymentMethod || 'ቀጥታ'}</span>
                            {c.transactionRef && (
                              <span className="text-[10px] font-mono text-neutral-400 block">{c.transactionRef}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <select
                              value={c.status}
                              onChange={async (e) => {
                                const newSt = e.target.value as ContributionStatus;
                                onUpdateStatus(c.id, newSt);
                                await saveContributionToFirestore({
                                  ...c,
                                  status: newSt,
                                });
                              }}
                              className={`text-[11px] font-bold rounded-lg px-2 py-1 border transition-colors ${
                                c.status === 'ተከፍሏል'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : c.status === 'Pending'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                  : c.status === 'ከፊል'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-red-50 text-red-800 border-red-300'
                              }`}
                            >
                              <option value="ተከፍሏል">ተከፍሏል (Paid)</option>
                              <option value="Pending">በመጠባበቅ ላይ (Pending)</option>
                              <option value="ከፊል">ከፊል (Partial)</option>
                              <option value="ያልተከፈለ">ያልተከፈለ (Unpaid)</option>
                            </select>
                            {c.status === 'Pending' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  onUpdateStatus(c.id, 'ተከፍሏል');
                                  await saveContributionToFirestore({
                                    ...c,
                                    status: 'ተከፍሏል',
                                  });
                                }}
                                className="px-2 py-1 bg-[#1B5E20] hover:bg-[#154a19] text-white text-[10px] font-bold rounded-md shadow-2xs flex items-center gap-1"
                                title="ደረሰኙን አጽድቅ (Approve)"
                              >
                                <Check className="w-3 h-3" />
                                <span>አጽድቅ</span>
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedReceipt(c)}
                              className="p-1.5 rounded-lg text-[#1B5E20] hover:bg-emerald-50 transition-colors"
                              title="ደረሰኝ እይ"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPaymentToDelete(c)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="ክፍያ ሰርዝ (Delete Payment)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm space-y-4">
          {/* Gmail Integration Banner */}
          <div className="p-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
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
                <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                  <span>Google Workspace / Gmail Integration</span>
                  {googleUser ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B5E20] text-[10px] font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      ተገናኝቷል ({googleUser.email})
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px]">
                      አልተገናኘም
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-neutral-600 mt-0.5">
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
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>በGmail ላክ (Compose)</span>
                  </button>
                  <button
                    onClick={async () => {
                      await logoutGoogle();
                      setGoogleUser(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 text-xs font-medium transition-colors cursor-pointer"
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
                  className="px-3 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>{isGoogleSigningIn ? 'በመግባት ላይ...' : 'Sign in with Google (Connect Gmail)'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#1B5E20]" />
                በFirestore የተመዘገቡ የክፍያ ማጠቃለያ ኢሜይሎች (Notification Logs)
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
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
              className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-semibold hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>አድስ</span>
            </button>
          </div>

          {loadingLogs ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              የማሳወቂያ መዝገብ እየተጫነ ነው...
            </div>
          ) : notificationLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400 italic">
              እስካሁን የተመዘገበ የኢሜይል ማሳወቂያ የለም። አባላት በMember Portal በኩል ክፍያ ሲመዘግቡ እዚህ ይታያሉ።
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b">
                  <tr>
                    <th className="py-2.5 px-3">የመዝገብ መለያ (Log ID)</th>
                    <th className="py-2.5 px-3">ተቀባይ (Recipient)</th>
                    <th className="py-2.5 px-3">የአባል ስም & ID</th>
                    <th className="py-2.5 px-3">ርዕስ (Subject)</th>
                    <th className="py-2.5 px-3 text-right">የተከፈለ መጠን</th>
                    <th className="py-2.5 px-3">የትራንዛክሽን Ref</th>
                    <th className="py-2.5 px-3">ሁኔታ</th>
                    <th className="py-2.5 px-3">የተላከበት ሰዓት</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {notificationLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50">
                      <td className="py-2.5 px-3 font-mono text-neutral-600">{log.id}</td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900">{log.recipient}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold">{log.memberName}</span>
                        <span className="text-[10px] text-neutral-400 block font-mono">{log.memberId}</span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-700 max-w-xs truncate" title={log.subject}>
                        {log.subject}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1B5E20]">
                        {log.amount} ብር
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-500">{log.transactionRef || 'N/A'}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#1B5E20] font-bold text-[10px]">
                          {log.status === 'sent' ? 'ተልኳል (Sent)' : log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
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
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <img
                  src="/src/assets/images/abarrus_logo_emblem_1793040526236.jpg"
                  alt="Abarrus Emblem"
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-amber-400"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4 className="font-bold text-sm text-[#1B5E20]">የክፍያ ደረሰኝ (Official Receipt)</h4>
                  <p className="text-[11px] text-neutral-500 font-mono">{selectedReceipt.receiptNumber || selectedReceipt.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">የአባል ስም፡</span>
                <span className="font-bold text-neutral-900">{selectedReceipt.memberName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">ትውልድ & ቤተሰብ፡</span>
                <span className="font-medium text-neutral-800">
                  {selectedReceipt.generation}ኛ ትውልድ · {selectedReceipt.familyName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">የመዋጮ ዓይነት፡</span>
                <span className="font-medium text-neutral-800">{selectedReceipt.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">የተከፈለበት ወር፡</span>
                <span className="font-bold text-[#1B5E20]">
                  {selectedReceipt.ethiopianMonthName} {selectedReceipt.ethiopianYear} ዓ.ም
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
                <span className="text-neutral-700 font-semibold">የተከፈለ መጠን፡</span>
                <span className="font-extrabold text-lg text-[#1B5E20] font-mono tabular-nums">
                  {selectedReceipt.paidAmount} ብር
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>የክፍያ ዘዴ፡</span>
                <span>{selectedReceipt.paymentMethod || 'ቀጥታ'}</span>
              </div>
              {selectedReceipt.transactionRef && (
                <div className="flex justify-between text-[11px] text-neutral-500">
                  <span>የትራንዛክሽን ቁጥር፡</span>
                  <span className="font-mono">{selectedReceipt.transactionRef}</span>
                </div>
              )}
              {selectedReceipt.isProxyPayment && (
                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-indigo-900">የተኪ ክፍያ መረጃ (Proxy Payment)</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 text-[10px] font-bold">Proxy</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-indigo-700">ከፋይ አባል (Payer)፡</span>
                    <span className="font-bold text-neutral-900">{selectedReceipt.payerName} ({selectedReceipt.payerId})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-indigo-700">ተጠቃሚ አባል (Beneficiary)፡</span>
                    <span className="font-bold text-neutral-900">{selectedReceipt.beneficiaryName || selectedReceipt.memberName} ({selectedReceipt.beneficiaryId || selectedReceipt.memberId})</span>
                  </div>
                </div>
              )}

              {selectedReceipt.slipPhoto && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] text-neutral-600 font-bold block">የተያያዘ የክፍያ ደረሰኝ ፎቶ (Receipt Image)፡</span>
                  <div className="rounded-xl overflow-hidden border border-neutral-300 bg-neutral-900 flex items-center justify-center max-h-56">
                    <img src={selectedReceipt.slipPhoto} alt="Receipt Slip" className="max-h-56 w-auto object-contain" />
                  </div>
                </div>
              )}
            </div>

            {selectedReceipt.status === 'Pending' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-900 block">የማረጋገጫ ሁኔታ፡</span>
                  <span className="text-[11px] text-amber-700">ይህ ደረሰኝ በአድሚን ማረጋገጫ በመጠባበቅ ላይ ነው</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const updated = { ...selectedReceipt, status: 'ተከፍሏል' as ContributionStatus };
                    setSelectedReceipt(updated);
                    onUpdateStatus(selectedReceipt.id, 'ተከፍሏል');
                    await saveContributionToFirestore(updated);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1B5E20] hover:bg-[#154a19] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>ደረሰኙን አጽድቅ (Approve)</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-[#1B5E20] hover:bg-[#154a19] text-white font-medium text-xs flex items-center gap-1.5"
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">በGmail ኢሜይል ላክ (Send via Gmail API)</h3>
                  <p className="text-[11px] text-neutral-500">
                    ከመለያዎ ({googleUser?.email || 'Gmail'}) በቀጥታ የሚላክ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGmailComposeOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {gmailStatusNotice && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${
                  gmailStatusNotice.includes('ተልኳል')
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
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
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  ተቀባይ ኢሜይል (To:)
                </label>
                <input
                  type="email"
                  value={gmailRecipient}
                  onChange={(e) => setGmailRecipient(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  ርዕስ (Subject:)
                </label>
                <input
                  type="text"
                  value={gmailSubject}
                  onChange={(e) => setGmailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  የመልዕክት ይዘት (Body:)
                </label>
                <textarea
                  value={gmailBody}
                  onChange={(e) => setGmailBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-sans"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-neutral-100 pt-3">
              <button
                type="button"
                onClick={() => setGmailComposeOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
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
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
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
        <div className="fixed bottom-6 right-6 z-60 bg-emerald-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{deleteNotice}</span>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-900">
                  የክፍያ መዝገብ ይሰረዝ? (Delete Payment)
                </h3>
                <p className="text-xs text-neutral-500">
                  በስህተት የተመዘገበ ክፍያን ከዳታቤዝ የመሰረዝ ማረጋገጫ
                </p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 space-y-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የአባል ስም፡</span>
                <span className="font-bold text-neutral-900">{paymentToDelete.memberName} ({paymentToDelete.memberId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የክፍያ ዓይነት፡</span>
                <span className="font-bold text-neutral-900">{paymentToDelete.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">ወር / ዓ.ም፡</span>
                <span className="font-semibold text-neutral-900">
                  {paymentToDelete.type === 'ትውልድ'
                    ? 'የትውልድ መዋጮ'
                    : `${paymentToDelete.ethiopianMonthName || paymentToDelete.ethiopianMonth || ''} ${paymentToDelete.ethiopianYear || ''} ዓ.ም`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የተከፈለ መጠን፡</span>
                <span className="font-mono font-bold text-red-700">
                  {Number(paymentToDelete.paidAmount || paymentToDelete.amount || 0).toLocaleString()} ብር
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የክፍያ መለያ (ID)፡</span>
                <span className="font-mono text-[10px] text-neutral-500">{paymentToDelete.id}</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 mb-5 leading-relaxed">
              ⚠️ ይህ ድርጊት የተሳሳተውን የክፍያ መዝገብ ከFirestore 'contributions' ዳታቤዝ ላይ ሙሉ በሙሉ ይሰርዘዋል።
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={() => setPaymentToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                ተመለስ (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={handleConfirmDeleteContribution}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
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

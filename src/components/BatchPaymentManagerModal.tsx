/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Wallet,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Users,
  Layers,
  CreditCard,
  Search,
  RefreshCw,
  ArrowRight,
  Receipt,
  Sparkles,
  Image as ImageIcon,
  Coins,
  Link2,
  Check,
  Send,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  Member,
  Contribution,
  Family,
  SettingsRates,
  MasterReceipt,
  ContributionType,
  PaymentMethod,
} from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { getEffectiveMonthlyRate, getEffectiveGenRate } from '../utils/storage';
import { formatBulkPaymentTelegramReport, getAppUrl } from '../utils/telegramShare';
import {
  subscribeToMasterReceipts,
  saveMasterReceiptToFirestore,
  creditMasterReceiptToWalletInFirestore,
  allocateBatchPaymentsInFirestore,
  updateMemberWalletBalanceInFirestore,
  BatchAllocationItem,
} from '../firebase';

interface DraftAllocationRow {
  rowId: string;
  memberId: string;
  type: ContributionType;
  ethiopianMonth: number;
  ethiopianYear: number;
  amount: string;
  notes: string;
}

interface BatchPaymentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  initialPayerId?: string;
  onBatchComplete?: (result: {
    payerId: string;
    newWalletBalance: number;
    createdContributions: Contribution[];
  }) => void;
  onDispatchTelegram?: (payload: {
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  }) => void;
}

export const BatchPaymentManagerModal: React.FC<BatchPaymentManagerModalProps> = ({
  isOpen,
  onClose,
  members,
  contributions,
  settings,
  initialPayerId,
  onBatchComplete,
  onDispatchTelegram,
}) => {
  const currentDate = getCurrentEthiopianDate();
  const [masterReceipts, setMasterReceipts] = useState<MasterReceipt[]>([]);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState<boolean>(true);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'pending' | 'open' | 'completed'>('all');

  // New Master Receipt Creation View
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newPayerId, setNewPayerId] = useState<string>(initialPayerId || members[0]?.id || '');
  const [payerSearchQuery, setPayerSearchQuery] = useState<string>('');
  const [newTotalAmount, setNewTotalAmount] = useState<string>('10000');
  const [newMethod, setNewMethod] = useState<PaymentMethod>('የኢትዮጵያ ንግድ ባንክ (CBE)');
  const [newTxRef, setNewTxRef] = useState<string>('');
  const [newSlipPhoto, setNewSlipPhoto] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState<string>('');
  const [isCreatingReceipt, setIsCreatingReceipt] = useState<boolean>(false);

  // Allocation Draft Rows State
  const [draftRows, setDraftRows] = useState<DraftAllocationRow[]>([]);
  const [isAllocating, setIsAllocating] = useState<boolean>(false);
  const [memberPickerQuery, setMemberPickerQuery] = useState<string>('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastBatchTelegramPayload, setLastBatchTelegramPayload] = useState<{
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  } | null>(null);

  // Subscribe to live Master Receipts in Firestore
  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingReceipts(true);
    const unsub = subscribeToMasterReceipts(
      (docs) => {
        setMasterReceipts(docs);
        setIsLoadingReceipts(false);
        setSelectedReceiptId((prev) => {
          if (prev && docs.some((d) => d.id === prev)) return prev;
          return docs[0]?.id || null;
        });
      },
      () => setIsLoadingReceipts(false)
    );
    return () => unsub();
  }, [isOpen]);

  // Filtered Master Receipts
  const filteredMasterReceipts = useMemo(() => {
    return masterReceipts.filter((r) => {
      if (receiptFilter === 'pending') return r.status === 'Pending';
      if (receiptFilter === 'open') return r.remainingBalance > 0 && r.status !== 'Pending';
      if (receiptFilter === 'completed') return r.remainingBalance <= 0 || r.status === 'Fully Allocated';
      return true;
    });
  }, [masterReceipts, receiptFilter]);

  const selectedReceipt = useMemo(
    () => masterReceipts.find((r) => r.id === selectedReceiptId) || null,
    [masterReceipts, selectedReceiptId]
  );

  const selectedPayer = useMemo(
    () => (selectedReceipt ? members.find((m) => m.id === selectedReceipt.payerId) || null : null),
    [members, selectedReceipt]
  );

  // Linked child contributions for selected Master Receipt
  const linkedContributions = useMemo(() => {
    if (!selectedReceipt) return [];
    return contributions.filter((c) => c.masterReceiptId === selectedReceipt.id);
  }, [contributions, selectedReceipt]);

  // Live Draft Calculations
  const draftTotalAmount = useMemo(() => {
    return draftRows.reduce((sum, row) => {
      const val = parseFloat(row.amount);
      return sum + (isNaN(val) || val < 0 ? 0 : val);
    }, 0);
  }, [draftRows]);

  const receiptRemainingBeforeDraft = selectedReceipt
    ? Number(selectedReceipt.remainingBalance ?? selectedReceipt.totalAmount - (selectedReceipt.allocatedAmount || 0))
    : 0;
  const liveRemainingAfterDraft = receiptRemainingBeforeDraft - draftTotalAmount;
  const isOverAllocated = liveRemainingAfterDraft < 0;

  // Filtered members for dropdowns
  const filteredPayerOptions = useMemo(() => {
    const q = payerSearchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)) ||
        m.familyName.toLowerCase().includes(q)
    );
  }, [members, payerSearchQuery]);

  const filteredMemberPickerOptions = useMemo(() => {
    const q = memberPickerQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.familyName.toLowerCase().includes(q)
    );
  }, [members, memberPickerQuery]);

  if (!isOpen) return null;

  // Helper to get default rate for a member + contribution type
  const getRateForMemberType = (m: Member | undefined, type: ContributionType): number => {
    if (!m) return 50;
    if (type === 'ወርሃዊ') return getEffectiveMonthlyRate(m, settings) || 50;
    if (type === 'ትውልድ') return getEffectiveGenRate(m, settings) || 500;
    return 100;
  };

  // Add a single allocation row
  const handleAddRow = (member?: Member, type: ContributionType = 'ወርሃዊ', customAmount?: number) => {
    const targetMember = member || selectedPayer || members[0];
    if (!targetMember) return;
    const defaultAmt = customAmount !== undefined ? customAmount : getRateForMemberType(targetMember, type);

    const newRow: DraftAllocationRow = {
      rowId: `ROW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      memberId: targetMember.id,
      type,
      ethiopianMonth: type === 'ትውልድ' ? 0 : currentDate.month || 11,
      ethiopianYear: currentDate.year || 2018,
      amount: String(defaultAmt),
      notes: '',
    };
    setDraftRows((prev) => [...prev, newRow]);
  };

  // Load all family members of the payer in 1 click (up to 15 or all matching)
  const handleLoadFamilyMembers = () => {
    if (!selectedPayer) return;
    const familyMembers = members.filter(
      (m) =>
        !m.isMinor &&
        ((selectedPayer.familyId && m.familyId === selectedPayer.familyId) ||
          (selectedPayer.familyName && m.familyName === selectedPayer.familyName))
    );

    if (familyMembers.length === 0) {
      setNotice({ type: 'error', message: 'የዚህ አባል ቤተሰብ አባላት አልተገኙም።' });
      return;
    }

    const newRows: DraftAllocationRow[] = familyMembers.map((fm, idx) => ({
      rowId: `FAM-${Date.now()}-${idx}`,
      memberId: fm.id,
      type: 'ወርሃዊ',
      ethiopianMonth: currentDate.month || 11,
      ethiopianYear: currentDate.year || 2018,
      amount: String(getRateForMemberType(fm, 'ወርሃዊ')),
      notes: '',
    }));

    setDraftRows((prev) => [...prev, ...newRows]);
    setNotice({
      type: 'success',
      message: `${familyMembers.length} የ«${selectedPayer.familyName}» ቤተሰብ አባላት በክፍፍል ዝርዝር ውስጥ ገብተዋል!`,
    });
    setTimeout(() => setNotice(null), 3500);
  };

  // Duplicate a row for the same member with 'ትውልድ' (Generation) type
  const handleAddGenerationForRow = (row: DraftAllocationRow) => {
    const m = members.find((mem) => mem.id === row.memberId);
    if (!m) return;
    const genAmt = getRateForMemberType(m, 'ትውልድ');
    handleAddRow(m, 'ትውልድ', genAmt > 0 ? genAmt : 50);
  };

  // Update a row field
  const handleUpdateRow = (rowId: string, updates: Partial<DraftAllocationRow>) => {
    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const nextRow = { ...row, ...updates };
        if (updates.memberId || updates.type) {
          const targetMember = members.find((m) => m.id === nextRow.memberId);
          if (updates.type === 'ትውልድ') {
            nextRow.ethiopianMonth = 0;
          } else if (updates.type === 'ወርሃዊ' && nextRow.ethiopianMonth === 0) {
            nextRow.ethiopianMonth = currentDate.month || 11;
          }
          if (targetMember && !updates.amount) {
            nextRow.amount = String(getRateForMemberType(targetMember, nextRow.type));
          }
        }
        return nextRow;
      })
    );
  };

  // Remove a row
  const handleRemoveRow = (rowId: string) => {
    setDraftRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  // Create new Master Receipt (by Admin) -> immediately credits payer's walletBalance
  const handleCreateMasterReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const payer = members.find((m) => m.id === newPayerId);
    const totalNum = parseFloat(newTotalAmount);
    if (!payer) {
      setNotice({ type: 'error', message: 'እባክዎ ከፋይ አባል ይምረጡ።' });
      return;
    }
    if (isNaN(totalNum) || totalNum <= 0) {
      setNotice({ type: 'error', message: 'እባክዎ ትክክለኛ የገንዘብ መጠን ያስገቡ።' });
      return;
    }

    setIsCreatingReceipt(true);
    try {
      const nowIso = new Date().toISOString();
      const id = `MREC-${Date.now()}`;
      const receiptNumber = `BATCH-${currentDate.year || 2018}-${String(Date.now()).slice(-4)}`;
      const newReceipt: MasterReceipt = {
        id,
        receiptNumber,
        payerId: payer.id,
        payerName: payer.fullName,
        familyId: payer.familyId || 'FA001',
        familyName: payer.familyName || 'የአበሩስ ቤተሰብ',
        totalAmount: totalNum,
        allocatedAmount: 0,
        remainingBalance: totalNum,
        paymentMethod: newMethod,
        transactionRef: newTxRef.trim() || receiptNumber,
        slipPhoto: newSlipPhoto,
        status: 'Credited to Wallet',
        walletCredited: true,
        notes: newNotes.trim() || `በ${payer.fullName} የገባ የጅምላ ክፍያ ደረሰኝ`,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'admin',
        allocationsCount: 0,
      };

      const newWalletBal = Number(payer.walletBalance || 0) + totalNum;
      await saveMasterReceiptToFirestore(newReceipt);
      await updateMemberWalletBalanceInFirestore(payer.id, newWalletBal);

      if (onBatchComplete) {
        onBatchComplete({
          payerId: payer.id,
          newWalletBalance: newWalletBal,
          createdContributions: [],
        });
      }

      setShowCreateForm(false);
      setSelectedReceiptId(newReceipt.id);
      setNewTxRef('');
      setNewNotes('');
      setNewSlipPhoto(null);
      setNotice({
        type: 'success',
        message: `የ ${totalNum.toLocaleString()} ብር ዋና ደረሰኝ (${receiptNumber}) ተመዝግቦ በ${payer.fullName} ቀሪ ሂሳብ (Wallet) ላይ ገብቷል!`,
      });
      setTimeout(() => setNotice(null), 5000);
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'ደረሰኙን መመዝገብ አልተቻለም።' });
    } finally {
      setIsCreatingReceipt(false);
    }
  };

  // Approve Pending Master Receipt -> Credit payer's walletBalance
  const handleApproveAndCreditReceipt = async (receipt: MasterReceipt) => {
    const payer = members.find((m) => m.id === receipt.payerId);
    try {
      const { newWalletBalance } = await creditMasterReceiptToWalletInFirestore(
        receipt,
        Number(payer?.walletBalance || 0)
      );
      if (onBatchComplete && payer) {
        onBatchComplete({
          payerId: payer.id,
          newWalletBalance,
          createdContributions: [],
        });
      }
      setNotice({
        type: 'success',
        message: `ደረሰኝ ${receipt.receiptNumber} (${receipt.totalAmount.toLocaleString()} ብር) ጸድቆ ወደ ${receipt.payerName} የቀሪ ሂሳብ ገብቷል!`,
      });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'ማጽደቅ አልተቻለም።' });
    }
  };

  // Submit Batch Allocations
  const handleCommitAllocations = async (keepRemainderOnWallet: boolean = false) => {
    if (!selectedReceipt || !selectedPayer) return;

    const validItems: BatchAllocationItem[] = [];
    for (const row of draftRows) {
      const amt = parseFloat(row.amount);
      if (isNaN(amt) || amt <= 0) continue;
      const m = members.find((mem) => mem.id === row.memberId);
      if (!m) continue;
      validItems.push({
        member: m,
        type: row.type,
        ethiopianMonth: row.type === 'ትውልድ' ? 0 : Number(row.ethiopianMonth || 1),
        ethiopianYear: Number(row.ethiopianYear || 2018),
        amount: amt,
        notes: row.notes,
      });
    }

    if (validItems.length === 0 && !keepRemainderOnWallet) {
      setNotice({ type: 'error', message: 'እባክዎ ቢያንስ አንድ የክፍያ ክፍፍል መደብ ያስገቡ።' });
      return;
    }

    if (isOverAllocated) {
      setNotice({
        type: 'error',
        message: 'የተመደበው ጠቅላላ መጠን ካለው ቀሪ ሂሳብ ይበልጣል። እባክዎ መጠኑን ያስተካክሉ።',
      });
      return;
    }

    setIsAllocating(true);
    try {
      const res = await allocateBatchPaymentsInFirestore({
        masterReceipt: selectedReceipt,
        payerCurrentWalletBalance: Number(selectedPayer.walletBalance || 0),
        allocations: validItems,
        finalizeRemainderToWallet: keepRemainderOnWallet,
      });

      if (onBatchComplete) {
        onBatchComplete({
          payerId: selectedPayer.id,
          newWalletBalance: res.newWalletBalance,
          createdContributions: res.createdContributions,
        });
      }

      if (res.createdContributions.length > 0) {
        const updatedContribs = [
          ...res.createdContributions,
          ...contributions.filter(
            (existing) => !res.createdContributions.some((c) => c.id === existing.id)
          ),
        ];
        const reportText = formatBulkPaymentTelegramReport({
          payer: selectedPayer,
          masterReceiptNumber: selectedReceipt.receiptNumber,
          items: res.createdContributions.map((c) => ({
            member:
              members.find((m) => m.id === c.memberId) || {
                id: c.memberId,
                fullName: c.memberName,
                generation: c.generation,
                familyId: c.familyId,
                familyName: c.familyName,
                phone: '',
              },
            type: c.type,
            amount: Number(c.paidAmount ?? c.amount ?? 0),
            ethiopianMonth: c.ethiopianMonth,
            ethiopianMonthName: c.ethiopianMonthName,
            ethiopianYear: c.ethiopianYear,
            datePaid: c.datePaid,
          })),
          allContributions: updatedContribs,
          settings,
          title: 'የጅምላ ደረሰኝ ክፍፍል ሪፖርት (Batch Allocation)',
        });
        setLastBatchTelegramPayload({
          name: selectedPayer.fullName,
          role: `የጅምላ ደረሰኝ ${selectedReceipt.receiptNumber}`,
          phone: selectedPayer.phone || '',
          telegram: selectedPayer.telegram || '',
          messageText: reportText,
          directUrl: getAppUrl(),
        });
      }

      setDraftRows([]);
      try {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
      } catch {}

      setNotice({
        type: 'success',
        message:
          validItems.length > 0
            ? `${validItems.length} ክፍያዎች ከደረሰኝ ${selectedReceipt.receiptNumber} ጋር ተያይዘው ተመዝግበዋል! ቀሪ ሂሳብ፡ ${res.updatedReceipt.remainingBalance.toLocaleString()} ብር በ${selectedPayer.fullName} ሂሳብ ላይ ተቀምጧል።`
            : `ቀሪው ${res.updatedReceipt.remainingBalance.toLocaleString()} ብር በ${selectedPayer.fullName} የቀሪ ሂሳብ (Wallet) ላይ በአስተማማኝ ሁኔታ ተቀምጧል።`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'ክፍፍሉን መመዝገብ አልተቻለም።' });
    } finally {
      setIsAllocating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-neutral-50 rounded-2xl shadow-2xl max-w-7xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-emerald-900/20">
        {/* Top Modal Header */}
        <div className="bg-gradient-to-r from-[#064e3b] via-[#1B5E20] to-[#0f3d26] text-white px-5 py-4 flex items-center justify-between gap-4 shrink-0 border-b border-amber-400/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD700]/15 border border-[#FFD700]/40 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[#FFD700]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2">
                <span>የጅምላ ክፍያ ክፍፍል እና የቀሪ ሂሳብ ማስተዳደሪያ (Batch Payment & Wallet Allocation)</span>
              </h3>
              <p className="text-[11px] text-emerald-100/80">
                አንድ ትልቅ የደረሰኝ ክፍያን ለተለያዩ የቤተሰብ አባላት (ወርሃዊ እና የትውልድ) ማከፋፈያ እና ቀሪ ሂሳብ መቆጣጠሪያ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="ዝጋ (Close)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner */}
        {notice && (
          <div
            className={`px-5 py-2.5 text-xs font-bold flex items-center justify-between gap-2 shrink-0 ${
              notice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                : 'bg-red-50 text-red-900 border-b border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{notice.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {notice.type === 'success' && lastBatchTelegramPayload && onDispatchTelegram && (
                <button
                  type="button"
                  onClick={() => onDispatchTelegram(lastBatchTelegramPayload)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#229ED9] hover:bg-[#1d8cc1] text-white text-[11px] font-bold shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>በTelegram ላክ</span>
                </button>
              )}
              <button
                onClick={() => {
                  setNotice(null);
                  setLastBatchTelegramPayload(null);
                }}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Body: Two-Column Workspace */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-200">
          {/* LEFT PANEL: Master Receipts List & New Master Receipt Form */}
          <div className="lg:col-span-4 bg-white p-4 flex flex-col gap-3 max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#1B5E20]" />
                <span>ዋና ደረሰኞች (Master Receipts)</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-2.5 py-1.5 rounded-lg bg-[#1B5E20] hover:bg-[#154a19] text-[#FFD700] text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showCreateForm ? 'ዝርዝር እይ' : 'አዲስ የጅምላ ደረሰኝ'}</span>
              </button>
            </div>

            {showCreateForm ? (
              <form
                onSubmit={handleCreateMasterReceipt}
                className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <span className="text-xs font-extrabold text-[#1B5E20]">
                    አዲስ የጅምላ ክፍያ ደረሰኝ መዝግብ
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                    ከፋይ አባል ፈልግ እና ምረጥ (Payer Member)፡
                  </label>
                  <div className="relative mb-1.5">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={payerSearchQuery}
                      onChange={(e) => setPayerSearchQuery(e.target.value)}
                      placeholder="በስም፣ ID ወይም ቤተሰብ ፈልግ..."
                      className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-neutral-300 bg-white focus:ring-2 focus:ring-[#1B5E20]"
                    />
                  </div>
                  <select
                    value={newPayerId}
                    onChange={(e) => setNewPayerId(e.target.value)}
                    className="w-full text-xs bg-white border border-neutral-300 rounded-lg p-2 font-semibold text-neutral-900"
                  >
                    {filteredPayerOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} ({m.id} · {m.familyName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                      ጠቅላላ የገባ ብር (Total ETB)፡
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={newTotalAmount}
                      onChange={(e) => setNewTotalAmount(e.target.value)}
                      className="w-full text-xs font-mono font-bold bg-white border border-neutral-300 rounded-lg p-2 text-emerald-900"
                      placeholder="10000"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                      የክፍያ ዘዴ፡
                    </label>
                    <select
                      value={newMethod}
                      onChange={(e) => setNewMethod(e.target.value as PaymentMethod)}
                      className="w-full text-xs bg-white border border-neutral-300 rounded-lg p-2"
                    >
                      <option value="የኢትዮጵያ ንግድ ባንክ (CBE)">CBE ባንክ</option>
                      <option value="ቴሌብር (Telebirr)">ቴሌብር</option>
                      <option value="አዋሽ ባንክ (Awash)">አዋሽ ባንክ</option>
                      <option value="ጥሬ ገንዘብ (Cash)">ጥሬ ገንዘብ</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                    የባንክ ማረጋገጫ ቁጥር (Transaction Ref)፡
                  </label>
                  <input
                    type="text"
                    value={newTxRef}
                    onChange={(e) => setNewTxRef(e.target.value)}
                    placeholder="ለምሳሌ FT25112XXXX"
                    className="w-full text-xs bg-white border border-neutral-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                    የደረሰኝ ፎቶ (አማራጭ)፡
                  </label>
                  <label className="flex items-center gap-2 p-2 border border-dashed border-emerald-400 rounded-lg bg-white cursor-pointer text-[11px] text-neutral-600 hover:bg-emerald-50">
                    <ImageIcon className="w-4 h-4 text-[#1B5E20]" />
                    <span>{newSlipPhoto ? 'ፎቶ ተመርጧል ✓' : 'የደረሰኝ ፎቶ ይምረጡ'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => setNewSlipPhoto(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                    ማስታወሻ (Notes)፡
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="ለምሳሌ፦ ለ10 የቤተሰብ አባላት ወርሃዊና ትውልድ ክፍያ"
                    className="w-full text-xs bg-white border border-neutral-300 rounded-lg p-2 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingReceipt}
                  className="w-full py-2.5 rounded-xl bg-[#1B5E20] hover:bg-[#154a19] text-[#FFD700] text-xs font-extrabold shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isCreatingReceipt ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  <span>ደረሰኙን መዝግብ እና ቀሪ ሂሳብ ጨምር</span>
                </button>
              </form>
            ) : (
              <>
                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                  {[
                    { id: 'all', label: `ሁሉም (${masterReceipts.length})` },
                    {
                      id: 'pending',
                      label: `በመጠባበቅ (${masterReceipts.filter((r) => r.status === 'Pending').length})`,
                    },
                    {
                      id: 'open',
                      label: `ቀሪ ያላቸው (${masterReceipts.filter((r) => r.remainingBalance > 0 && r.status !== 'Pending').length})`,
                    },
                    {
                      id: 'completed',
                      label: `የተጠናቀቁ (${masterReceipts.filter((r) => r.remainingBalance <= 0).length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setReceiptFilter(tab.id as any)}
                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        receiptFilter === tab.id
                          ? 'bg-[#1B5E20] text-white shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Master Receipt Cards */}
                {isLoadingReceipts ? (
                  <div className="py-10 text-center text-xs text-neutral-500 flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#1B5E20]" />
                    <span>ዋና ደረሰኞችን በማምጣት ላይ...</span>
                  </div>
                ) : filteredMasterReceipts.length === 0 ? (
                  <div className="py-10 px-4 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-300 space-y-2">
                    <Wallet className="w-8 h-8 text-neutral-300 mx-auto" />
                    <p className="text-xs font-bold text-neutral-600">ምንም የጅምላ ደረሰኝ የለም</p>
                    <p className="text-[11px] text-neutral-500">
                      አዲስ የጅምላ ክፍያ (ለምሳሌ 10,000 ብር) ለመመዝገብ ከላይ «አዲስ የጅምላ ደረሰኝ» የሚለውን ይጫኑ።
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredMasterReceipts.map((r) => {
                      const isSelected = selectedReceiptId === r.id;
                      const pct =
                        r.totalAmount > 0
                          ? Math.min(100, Math.round(((r.allocatedAmount || 0) / r.totalAmount) * 100))
                          : 0;
                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            setSelectedReceiptId(r.id);
                            setDraftRows([]);
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                            isSelected
                              ? 'bg-emerald-50/80 border-[#1B5E20] ring-2 ring-[#1B5E20]/20 shadow-xs'
                              : 'bg-white border-neutral-200 hover:border-emerald-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-neutral-900 truncate">
                                {r.payerName}
                              </p>
                              <p className="text-[10px] font-mono text-neutral-500">
                                {r.receiptNumber} · {r.payerId}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                r.status === 'Pending'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : r.remainingBalance <= 0
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-blue-100 text-blue-800 border border-blue-300'
                              }`}
                            >
                              {r.status === 'Pending'
                                ? 'በመጠባበቅ (Pending)'
                                : r.remainingBalance <= 0
                                ? 'ሙሉ በሙሉ ተከፋፍሏል'
                                : 'ቀሪ ሂሳብ አለው'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 text-[10px] bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                            <div>
                              <span className="text-neutral-500 block">ጠቅላላ</span>
                              <strong className="font-mono text-neutral-900">
                                {Number(r.totalAmount || 0).toLocaleString()}
                              </strong>
                            </div>
                            <div>
                              <span className="text-neutral-500 block">የተከፋፈለ</span>
                              <strong className="font-mono text-emerald-700">
                                {Number(r.allocatedAmount || 0).toLocaleString()}
                              </strong>
                            </div>
                            <div>
                              <span className="text-neutral-500 block">ቀሪ ሂሳብ</span>
                              <strong className="font-mono text-amber-700">
                                {Number(r.remainingBalance || 0).toLocaleString()}
                              </strong>
                            </div>
                          </div>

                          <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-[#1B5E20] h-1.5 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT PANEL: Active Receipt Summary & Payment Allocation Form */}
          <div className="lg:col-span-8 p-4 sm:p-5 space-y-5 max-h-[82vh] overflow-y-auto">
            {!selectedReceipt ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center space-y-3 p-6 bg-white rounded-2xl border border-neutral-200">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#1B5E20] border border-emerald-200">
                  <Coins className="w-8 h-8" />
                </div>
                <h4 className="text-base font-extrabold text-neutral-900">
                  የክፍያ ክፍፍል ለመጀመር ዋና ደረሰኝ ይምረጡ ወይም አዲስ ይመዝግቡ
                </h4>
                <p className="text-xs text-neutral-500 max-w-md">
                  አንድ አባል ትልቅ ገንዘብ (ለምሳሌ 10,000 ብር) ሲያስገባ በዚያ ገንዘብ ለቤተሰብ አባላት ወርሃዊና የትውልድ መዋጮዎችን ማከፋፈል እና ቀሪውን ገንዘብ በአባሉ ሂሳብ (Wallet) ላይ ማስቀመጥ ይችላሉ።
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 rounded-xl bg-[#1B5E20] text-[#FFD700] text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>አዲስ የጅምላ ደረሰኝ መዝግብ</span>
                </button>
              </div>
            ) : (
              <>
                {/* Selected Receipt + Payer Wallet Credit Header Card */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#1B5E20] font-mono text-[11px] font-bold">
                          {selectedReceipt.receiptNumber}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-400">
                          ID: {selectedReceipt.id}
                        </span>
                      </div>
                      <h4 className="text-base font-extrabold text-neutral-900 mt-1">
                        ከፋይ አባል፡ {selectedReceipt.payerName} ({selectedReceipt.payerId})
                      </h4>
                      <p className="text-xs text-neutral-500">
                        {selectedReceipt.familyName} · {selectedReceipt.paymentMethod} · Ref:{' '}
                        <span className="font-mono text-neutral-700">{selectedReceipt.transactionRef}</span>
                      </p>
                    </div>

                    {/* Payer's Overall Wallet Balance Badge */}
                    <div className="bg-gradient-to-br from-emerald-900 to-[#1B5E20] text-white px-4 py-2.5 rounded-xl border border-amber-400/40 shadow-sm shrink-0">
                      <span className="text-[10px] text-amber-200 uppercase font-bold tracking-wider block">
                        የአባሉ ጠቅላላ የቀሪ ሂሳብ (Wallet Balance)
                      </span>
                      <div className="text-lg font-black font-mono text-[#FFD700] tabular-nums">
                        {Number(selectedPayer?.walletBalance || 0).toLocaleString()} ብር
                      </div>
                    </div>
                  </div>

                  {/* 4-Metric Live Balance Tracker */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                      <span className="text-[10px] font-bold text-neutral-500 block">ጠቅላላ የገባ (Master)</span>
                      <span className="text-sm sm:text-base font-black font-mono text-neutral-900 tabular-nums">
                        {Number(selectedReceipt.totalAmount || 0).toLocaleString()} ብር
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 block">ቀድሞ የተከፋፈለ</span>
                      <span className="text-sm sm:text-base font-black font-mono text-emerald-900 tabular-nums">
                        {Number(selectedReceipt.allocatedAmount || 0).toLocaleString()} ብር
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 block">አሁን እየተመደበ ያለ</span>
                      <span className="text-sm sm:text-base font-black font-mono text-blue-900 tabular-nums">
                        {draftTotalAmount.toLocaleString()} ብር
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-xl border-2 ${
                        isOverAllocated
                          ? 'bg-red-50 border-red-400'
                          : liveRemainingAfterDraft > 0
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-emerald-50 border-emerald-400'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold block ${
                          isOverAllocated ? 'text-red-700' : 'text-amber-800'
                        }`}
                      >
                        ቀሪ ሂሳብ (Remaining)
                      </span>
                      <span
                        className={`text-sm sm:text-base font-black font-mono tabular-nums ${
                          isOverAllocated ? 'text-red-700' : 'text-amber-900'
                        }`}
                      >
                        {liveRemainingAfterDraft.toLocaleString()} ብር
                      </span>
                    </div>
                  </div>

                  {/* Stacked Visual Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden flex border border-neutral-200">
                      <div
                        className="bg-emerald-600 h-full transition-all"
                        style={{
                          width: `${
                            selectedReceipt.totalAmount > 0
                              ? Math.min(100, ((selectedReceipt.allocatedAmount || 0) / selectedReceipt.totalAmount) * 100)
                              : 0
                          }%`,
                        }}
                        title="ቀድሞ የተከፋፈለ"
                      />
                      <div
                        className={`h-full transition-all ${isOverAllocated ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{
                          width: `${
                            selectedReceipt.totalAmount > 0
                              ? Math.min(100, (draftTotalAmount / selectedReceipt.totalAmount) * 100)
                              : 0
                          }%`,
                        }}
                        title="አሁን እየተመደበ ያለ"
                      />
                    </div>
                    {selectedReceipt.notes && (
                      <p className="text-[11px] text-neutral-600 bg-amber-50/70 px-2.5 py-1.5 rounded-lg border border-amber-200/70">
                        📝 ማስታወሻ፡ {selectedReceipt.notes}
                      </p>
                    )}
                  </div>

                  {/* Pending Approval Action Bar */}
                  {selectedReceipt.status === 'Pending' && !selectedReceipt.walletCredited && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs text-amber-950">
                        <strong className="block font-bold">
                          ይህ ደረሰኝ በአባሉ የቀረበ ሲሆን ገና ወደ ቀሪ ሂሳብ (Wallet) አልጸደቀም።
                        </strong>
                        <span className="text-[11px] text-amber-800">
                          ቀጥታ ክፍፍል ማድረግ ይችላሉ (ሲያጸድቁት ቀሪው ወደ አባሉ ሂሳብ ይገባል) ወይም አሁኑኑ ወደ ሂሳቡ ማስገባት ይችላሉ።
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApproveAndCreditReceipt(selectedReceipt)}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>ደረሰኙን አጽድቅ (Credit Wallet)</span>
                      </button>
                    </div>
                  )}

                  {selectedReceipt.slipPhoto && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-bold text-[#1B5E20] hover:underline">
                        🖼️ የተያያዘውን የደረሰኝ ፎቶ ይመልከቱ (View Master Receipt Slip)
                      </summary>
                      <div className="mt-2 rounded-xl overflow-hidden border border-neutral-300 bg-neutral-900 flex justify-center max-h-64">
                        <img
                          src={selectedReceipt.slipPhoto}
                          alt="Master Receipt Slip"
                          className="max-h-64 object-contain"
                        />
                      </div>
                    </details>
                  )}
                </div>

                {/* PAYMENT ALLOCATION BUILDER FORM */}
                {receiptRemainingBeforeDraft > 0 && (
                  <div className="bg-white rounded-2xl border-2 border-[#1B5E20]/25 p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-3">
                      <div>
                        <h5 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-[#1B5E20]" />
                          <span>የክፍያ ክፍፍል መመደቢያ ፎርም (Payment Allocation Form)</span>
                        </h5>
                        <p className="text-[11px] text-neutral-500">
                          ለእያንዳንዱ አባል ወርሃዊ፣ የትውልድ ወይም ልዩ ክፍያ ይመድቡ፤ መጠኑ ከቀሪው ሂሳብ በቀጥታ ይቀነሳል።
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleLoadFamilyMembers}
                          className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="የከፋዩን ቤተሰብ አባላት በሙሉ በአንድ ጊዜ ጫን"
                        >
                          <Users className="w-3.5 h-3.5 text-amber-700" />
                          <span>የቤተሰብ አባላትን ጫን</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddRow(selectedPayer || members[0], 'ወርሃዊ')}
                          className="px-3 py-1.5 rounded-lg bg-[#1B5E20] hover:bg-[#154a19] text-[#FFD700] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>አባል / ክፍያ ጨምር</span>
                        </button>
                      </div>
                    </div>

                    {/* Member Quick Search Filter for dropdowns */}
                    {draftRows.length > 0 && (
                      <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-200">
                        <Search className="w-3.5 h-3.5 text-neutral-400" />
                        <input
                          type="text"
                          value={memberPickerQuery}
                          onChange={(e) => setMemberPickerQuery(e.target.value)}
                          placeholder="የአባላት ዝርዝር ማጣሪያ (በስም፣ ID ወይም ቤተሰብ)..."
                          className="w-full text-xs bg-transparent focus:outline-none text-neutral-800"
                        />
                        {memberPickerQuery && (
                          <button
                            type="button"
                            onClick={() => setMemberPickerQuery('')}
                            className="text-[11px] text-neutral-500 hover:text-neutral-800 cursor-pointer"
                          >
                            አጽዳ
                          </button>
                        )}
                      </div>
                    )}

                    {/* Draft Rows List */}
                    {draftRows.length === 0 ? (
                      <div className="py-8 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-300 space-y-2">
                        <p className="text-xs font-semibold text-neutral-600">
                          ክፍፍል ለመጀመር «የቤተሰብ አባላትን ጫን» ወይም «አባል / ክፍያ ጨምር» የሚለውን ይጫኑ።
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {draftRows.map((row, idx) => {
                          const rowMember = members.find((m) => m.id === row.memberId);
                          return (
                            <div
                              key={row.rowId}
                              className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 hover:border-emerald-300 transition-colors space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-extrabold text-[#1B5E20] bg-emerald-100 px-2 py-0.5 rounded-md">
                                  #{idx + 1}
                                </span>

                                <div className="flex items-center gap-2">
                                  {row.type === 'ወርሃዊ' && (
                                    <button
                                      type="button"
                                      onClick={() => handleAddGenerationForRow(row)}
                                      className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                      title="ለዚሁ አባል የትውልድ ክፍያ ረድፍ ጨምር"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>የትውልድ ክፍያም ጨምር</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRow(row.rowId)}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                    title="ረድፉን አስወግድ"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                {/* Member Select */}
                                <div className="sm:col-span-4">
                                  <label className="text-[10px] font-bold text-neutral-500 block mb-1">
                                    ተጠቃሚ አባል (Beneficiary)፡
                                  </label>
                                  <select
                                    value={row.memberId}
                                    onChange={(e) => handleUpdateRow(row.rowId, { memberId: e.target.value })}
                                    className="w-full text-xs font-semibold bg-white border border-neutral-300 rounded-lg p-2 text-neutral-900"
                                  >
                                    {rowMember &&
                                      !filteredMemberPickerOptions.some((m) => m.id === rowMember.id) && (
                                        <option value={rowMember.id}>
                                          {rowMember.fullName} ({rowMember.id})
                                        </option>
                                      )}
                                    {filteredMemberPickerOptions.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.fullName} ({m.id} · {m.generation}ኛ ትውልድ)
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Type Select */}
                                <div className="sm:col-span-2">
                                  <label className="text-[10px] font-bold text-neutral-500 block mb-1">
                                    የክፍያ ዓይነት፡
                                  </label>
                                  <select
                                    value={row.type}
                                    onChange={(e) =>
                                      handleUpdateRow(row.rowId, {
                                        type: e.target.value as ContributionType,
                                      })
                                    }
                                    className="w-full text-xs font-bold bg-white border border-neutral-300 rounded-lg p-2 text-neutral-900"
                                  >
                                    <option value="ወርሃዊ">ወርሃዊ</option>
                                    <option value="ትውልድ">ትውልድ</option>
                                    <option value="ልዩ">ልዩ</option>
                                  </select>
                                </div>

                                {/* Month Select */}
                                <div className="sm:col-span-2">
                                  <label className="text-[10px] font-bold text-neutral-500 block mb-1">
                                    ወር፡
                                  </label>
                                  <select
                                    disabled={row.type === 'ትውልድ'}
                                    value={row.ethiopianMonth}
                                    onChange={(e) =>
                                      handleUpdateRow(row.rowId, { ethiopianMonth: Number(e.target.value) })
                                    }
                                    className="w-full text-xs bg-white border border-neutral-300 rounded-lg p-2 disabled:opacity-40"
                                  >
                                    {row.type === 'ትውልድ' ? (
                                      <option value={0}>ትውልድ</option>
                                    ) : (
                                      ETHIOPIAN_MONTHS.map((m) => (
                                        <option key={m.number} value={m.number}>
                                          {m.amharic}
                                        </option>
                                      ))
                                    )}
                                  </select>
                                </div>

                                {/* Year */}
                                <div className="sm:col-span-2">
                                  <label className="text-[10px] font-bold text-neutral-500 block mb-1">
                                    ዓ.ም፡
                                  </label>
                                  <select
                                    value={row.ethiopianYear}
                                    onChange={(e) =>
                                      handleUpdateRow(row.rowId, { ethiopianYear: Number(e.target.value) })
                                    }
                                    className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-lg p-2"
                                  >
                                    {[2018, 2019, 2020].map((y) => (
                                      <option key={y} value={y}>
                                        {y}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Amount */}
                                <div className="sm:col-span-2">
                                  <label className="text-[10px] font-bold text-neutral-500 block mb-1">
                                    መጠን (ብር)፡
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    value={row.amount}
                                    onChange={(e) => handleUpdateRow(row.rowId, { amount: e.target.value })}
                                    className="w-full text-xs font-mono font-extrabold bg-white border border-emerald-400 rounded-lg p-2 text-[#1B5E20]"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Over-allocation Warning */}
                    {isOverAllocated && (
                      <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex items-center gap-2 text-xs font-bold text-red-800">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>
                          ማስጠንቀቂያ፡ የመደቡት ድምር ({draftTotalAmount.toLocaleString()} ብር) ካለው ቀሪ ሂሳብ (
                          {receiptRemainingBeforeDraft.toLocaleString()} ብር) በ{' '}
                          {Math.abs(liveRemainingAfterDraft).toLocaleString()} ብር ይበልጣል!
                        </span>
                      </div>
                    )}

                    {/* Form Action Footer */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-neutral-200">
                      <button
                        type="button"
                        disabled={isAllocating || isOverAllocated || liveRemainingAfterDraft <= 0}
                        onClick={() => handleCommitAllocations(true)}
                        className="px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
                        title="ያልተከፋፈለው ቀሪ ገንዘብ በአባሉ የቀሪ ሂሳብ (Wallet) ላይ እንዲቀመጥ አድርግ"
                      >
                        <Wallet className="w-4 h-4 text-amber-800" />
                        <span>
                          ቀሪውን ({liveRemainingAfterDraft.toLocaleString()} ብር) በራሱ ሂሳብ ላይ አስቀምጥ
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isAllocating || draftRows.length === 0 || isOverAllocated}
                        onClick={() => handleCommitAllocations(false)}
                        className="px-5 py-2.5 rounded-xl bg-[#1B5E20] hover:bg-[#154a19] text-[#FFD700] text-xs font-extrabold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
                      >
                        {isAllocating ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>
                          {isAllocating
                            ? 'በመመዝገብ ላይ...'
                            : `ክፍፍሉን አጽድቅና መዝግብ (${draftTotalAmount.toLocaleString()} ብር)`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* LINKED CHILD CONTRIBUTIONS LEDGER (Database Linking View) */}
                <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-extrabold text-neutral-900 flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-[#1B5E20]" />
                      <span>
                        ከዚህ ዋና ደረሰኝ ({selectedReceipt.receiptNumber}) ጋር የተያያዙ ክፍያዎች ({linkedContributions.length})
                      </span>
                    </h5>
                    <span className="text-[11px] font-mono text-neutral-500">
                      Master ID: {selectedReceipt.id}
                    </span>
                  </div>

                  {linkedContributions.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-4 text-center bg-neutral-50 rounded-xl border border-neutral-200">
                      እስካሁን ከዚህ ደረሰኝ የተከፋፈለ ክፍያ የለም።
                    </p>
                  ) : (
                    <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 text-[11px]">
                          <tr>
                            <th className="py-2 px-3">ተጠቃሚ አባል</th>
                            <th className="py-2 px-3">ዓይነት</th>
                            <th className="py-2 px-3">ወር / ዓ.ም</th>
                            <th className="py-2 px-3 text-right">መጠን</th>
                            <th className="py-2 px-3">ደረሰኝ ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {linkedContributions.map((c) => (
                            <tr key={c.id} className="hover:bg-neutral-50">
                              <td className="py-2 px-3 font-bold text-neutral-900">
                                {c.memberName}{' '}
                                <span className="text-[10px] font-mono text-neutral-400">({c.memberId})</span>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    c.type === 'ወርሃዊ'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : c.type === 'ትውልድ'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {c.type}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-neutral-700">
                                {c.type === 'ትውልድ'
                                  ? 'የትውልድ መዋጮ'
                                  : `${c.ethiopianMonthName || getEthiopianMonthName(c.ethiopianMonth)} ${c.ethiopianYear}`}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-[#1B5E20]">
                                {Number(c.paidAmount || c.amount || 0).toLocaleString()} ብር
                              </td>
                              <td className="py-2 px-3 font-mono text-[10px] text-neutral-500">
                                {c.id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

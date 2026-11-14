/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Coins,
  RefreshCw,
  Trash2,
  Sparkles,
  Check,
  Search,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  Member,
  Contribution,
  SettingsRates,
  ContributionType,
  MasterReceipt,
} from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName } from '../utils/ethiopianCalendar';
import {
  getEffectiveMonthlyRate,
  getEffectiveGenRate,
  getMemberGenContributionStats,
} from '../utils/storage';
import {
  paySelectedFromWalletInFirestore,
  subscribeToMasterReceipts,
} from '../firebase';

interface BulkPaySelectedModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMembers: Member[];
  allMembers: Member[];
  contributions: Contribution[];
  settings: SettingsRates;
  defaultMonth: number;
  defaultYear: number;
  onOpenBatchPayment?: (payerId?: string) => void;
  onSuccess: (result: {
    payerId: string;
    newWalletBalance: number;
    createdContributions: Contribution[];
  }) => void;
}

export const BulkPaySelectedModal: React.FC<BulkPaySelectedModalProps> = ({
  isOpen,
  onClose,
  selectedMembers,
  allMembers,
  contributions,
  settings,
  defaultMonth,
  defaultYear,
  onOpenBatchPayment,
  onSuccess,
}) => {
  const [paymentType, setPaymentType] = useState<'ወርሃዊ' | 'ትውልድ'>('ወርሃዊ');
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth || 11);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear || 2018);

  // Members with a positive wallet balance sorted first
  const sortedPayerCandidates = useMemo(() => {
    return [...allMembers].sort((a, b) => {
      const wa = Number(a.walletBalance || 0);
      const wb = Number(b.walletBalance || 0);
      if (wb !== wa) return wb - wa;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [allMembers]);

  const walletHolders = useMemo(
    () => sortedPayerCandidates.filter((m) => Number(m.walletBalance || 0) > 0),
    [sortedPayerCandidates]
  );

  const [payerId, setPayerId] = useState<string>('');
  const [payerSearch, setPayerSearch] = useState<string>('');
  const [masterReceipts, setMasterReceipts] = useState<MasterReceipt[]>([]);
  const [selectedMasterReceiptId, setSelectedMasterReceiptId] = useState<string>('auto');

  // Local editable list of selected member rows
  const [rowMembers, setRowMembers] = useState<Member[]>(selectedMembers);
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [uniformAmountInput, setUniformAmountInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync defaults when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedMonth(defaultMonth || 11);
    setSelectedYear(defaultYear || 2018);
    setRowMembers(selectedMembers);
    setAmountOverrides({});
    setUniformAmountInput('');
    setErrorMsg(null);

    // Prefer a selected member who has wallet balance, otherwise highest wallet holder
    const selectedWithWallet = selectedMembers.find((m) => Number(m.walletBalance || 0) > 0);
    const defaultPayer = selectedWithWallet || walletHolders[0] || allMembers[0];
    setPayerId(defaultPayer?.id || '');
  }, [isOpen, selectedMembers, defaultMonth, defaultYear]);

  // Subscribe to open master receipts for optional receipt linking
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToMasterReceipts((docs) => setMasterReceipts(docs));
    return () => unsub();
  }, [isOpen]);

  const selectedPayer = useMemo(
    () => allMembers.find((m) => m.id === payerId) || null,
    [allMembers, payerId]
  );

  const payerMasterReceipts = useMemo(() => {
    if (!selectedPayer) return [];
    return masterReceipts.filter(
      (r) => r.payerId === selectedPayer.id && Number(r.remainingBalance || 0) > 0
    );
  }, [masterReceipts, selectedPayer]);

  // Helper to check if a member has already paid the chosen month/year or generation
  const isMemberAlreadyPaid = (member: Member): boolean => {
    if (paymentType === 'ወርሃዊ') {
      return contributions.some((c) => {
        const m = Number(c.month ?? c.ethiopianMonth);
        const y = Number(c.year ?? c.ethiopianYear);
        const st = String(c.status || '').trim().toLowerCase();
        const isPaid = st === 'paid' || st === 'ተከፍሏል';
        return (
          c.memberId === member.id &&
          (!c.type || c.type === 'ወርሃዊ') &&
          m === selectedMonth &&
          y === selectedYear &&
          isPaid
        );
      });
    }
    const genStats = getMemberGenContributionStats(member, settings, contributions);
    return genStats.status === 'ተከፍሏል (ሙሉ)';
  };

  // Compute default amount for a member
  const getDefaultAmount = (member: Member): number => {
    if (paymentType === 'ወርሃዊ') {
      return getEffectiveMonthlyRate(member, settings);
    }
    if (member.isMinor || member.isSpouse) return 0;
    const genStats = getMemberGenContributionStats(member, settings, contributions);
    return genStats.remainingBalance > 0
      ? genStats.remainingBalance
      : getEffectiveGenRate(member, settings);
  };

  const getRowAmount = (member: Member): number => {
    if (amountOverrides[member.id] !== undefined) {
      const parsed = parseFloat(amountOverrides[member.id]);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    return getDefaultAmount(member);
  };

  const totalToPay = useMemo(() => {
    return rowMembers.reduce((sum, m) => sum + getRowAmount(m), 0);
  }, [rowMembers, amountOverrides, paymentType, settings, contributions]);

  const payableCount = useMemo(
    () => rowMembers.filter((m) => getRowAmount(m) > 0).length,
    [rowMembers, amountOverrides, paymentType, settings, contributions]
  );

  const availableWallet = Number(selectedPayer?.walletBalance || 0);
  const remainingAfter = availableWallet - totalToPay;
  const isInsufficient = totalToPay > availableWallet;

  const filteredPayerList = useMemo(() => {
    const q = payerSearch.trim().toLowerCase();
    if (!q) return sortedPayerCandidates;
    return sortedPayerCandidates.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)) ||
        m.familyName.toLowerCase().includes(q)
    );
  }, [sortedPayerCandidates, payerSearch]);

  if (!isOpen) return null;

  const handleApplyUniformAmount = () => {
    const val = parseFloat(uniformAmountInput);
    if (isNaN(val) || val < 0) return;
    const next: Record<string, string> = {};
    rowMembers.forEach((m) => {
      next[m.id] = m.isMinor ? '0' : String(val);
    });
    setAmountOverrides(next);
  };

  const handleRemoveAlreadyPaid = () => {
    setRowMembers((prev) => prev.filter((m) => !isMemberAlreadyPaid(m) && !m.isMinor));
  };

  const handleConfirmPayment = async () => {
    if (!selectedPayer) {
      setErrorMsg('እባክዎ የCredit Wallet ከፋይ አባል ይምረጡ።');
      return;
    }
    if (payableCount === 0 || totalToPay <= 0) {
      setErrorMsg('ቢያንስ ከ0 ብር በላይ ክፍያ ያለው አንድ አባል መኖር አለበት።');
      return;
    }
    if (isInsufficient) {
      setErrorMsg(
        `የ${selectedPayer.fullName} ቀሪ ሂሳብ (${availableWallet.toLocaleString()} ብር) ለጠቅላላ ክፍያው (${totalToPay.toLocaleString()} ብር) በቂ አይደለም።`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const items = rowMembers
        .map((m) => ({
          member: m,
          amount: getRowAmount(m),
        }))
        .filter((i) => i.amount > 0);

      let linkedMasterReceipt: MasterReceipt | null = null;
      if (selectedMasterReceiptId === 'auto') {
        linkedMasterReceipt =
          payerMasterReceipts.find((r) => Number(r.remainingBalance || 0) >= totalToPay) || null;
      } else if (selectedMasterReceiptId !== 'none') {
        linkedMasterReceipt =
          payerMasterReceipts.find((r) => r.id === selectedMasterReceiptId) || null;
      }

      const result = await paySelectedFromWalletInFirestore({
        payer: selectedPayer,
        items,
        type: paymentType as ContributionType,
        ethiopianMonth: paymentType === 'ወርሃዊ' ? selectedMonth : 0,
        ethiopianYear: selectedYear,
        linkedMasterReceipt,
      });

      try {
        confetti({
          particleCount: 75,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#1B5E20', '#FFD700', '#4CAF50'],
        });
      } catch {}

      onSuccess({
        payerId: selectedPayer.id,
        newWalletBalance: result.newWalletBalance,
        createdContributions: result.createdContributions,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'ክፍያውን በመፈጸም ላይ ስህተት አጋጥሟል።');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-4xl w-full overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1B5E20] via-emerald-900 to-[#144818] text-white px-5 py-4 flex items-center justify-between border-b-2 border-[#FFD700]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD700] text-[#1B5E20] flex items-center justify-center shadow-sm shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold flex items-center gap-2">
                <span>ለተመረጡ አባላት ከCredit Wallet ክፍያ መፈጸሚያ</span>
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-[#FFD700] text-xs font-mono">
                  {rowMembers.length} ተመርጠዋል
                </span>
              </h3>
              <p className="text-[11px] text-emerald-100">
                Pay Selected Members ({paymentType}) directly from a member&apos;s Credit Wallet balance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* No wallet holders notice */}
          {walletHolders.length === 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">ምንም ቀሪ ሂሳብ (Credit Wallet) ያለው አባል አልተገኘም።</span>
                  <span className="text-[11px] text-amber-800">
                    በቅድሚያ የጅምላ ደረሰኝ (Batch Receipt) አስገብተው የአባሉን Credit Wallet ሂሳብ ይሙሉ።
                  </span>
                </div>
              </div>
              {onOpenBatchPayment && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenBatchPayment(payerId || undefined);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-emerald-950 font-bold text-xs shrink-0 cursor-pointer"
                >
                  + የጅምላ ደረሰኝ አስገባ (Credit Wallet)
                </button>
              )}
            </div>
          )}

          {/* Step 1 & 2 Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Credit Wallet Picker */}
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-amber-700" />
                  <span>1. ከማን Credit Wallet ይቀነስ? (Source Wallet)</span>
                </label>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  {walletHolders.length} ሂሳቦች አሉ
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={payerSearch}
                  onChange={(e) => setPayerSearch(e.target.value)}
                  placeholder="ከፋይ አባል በስም ወይም ID ፈልግ..."
                  className="w-full text-xs bg-white border border-amber-200 rounded-lg pl-8 pr-2.5 py-1.5 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full text-xs bg-white border border-amber-300 rounded-lg p-2 font-bold text-neutral-900 focus:ring-2 focus:ring-amber-500"
              >
                {filteredPayerList.map((m) => {
                  const bal = Number(m.walletBalance || 0);
                  return (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.id}) — ቀሪ ሂሳብ: {bal.toLocaleString()} ብር
                    </option>
                  );
                })}
              </select>

              {payerMasterReceipts.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-amber-900 block mb-1">
                    ከጅምላ ደረሰኝ (Master Receipt) ጋር አያይዝ (አማራጭ)፡
                  </label>
                  <select
                    value={selectedMasterReceiptId}
                    onChange={(e) => setSelectedMasterReceiptId(e.target.value)}
                    className="w-full text-[11px] bg-white border border-amber-200 rounded-lg p-1.5 text-neutral-800"
                  >
                    <option value="auto">በራስ-ሰር ከሚበቃው ደረሰኝ ጋር አያይዝ (Auto)</option>
                    {payerMasterReceipts.map((mr) => (
                      <option key={mr.id} value={mr.id}>
                        {mr.receiptNumber} (ቀሪ: {Number(mr.remainingBalance).toLocaleString()} ብር)
                      </option>
                    ))}
                    <option value="none">ከደረሰኝ ጋር አታያይዝ (Direct Wallet Only)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Contribution Type & Month/Year Selector */}
            <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
              <label className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#1B5E20]" />
                <span>2. የክፍያ ዓይነት እና ወር (Payment Type & Period)</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('ወርሃዊ');
                    setAmountOverrides({});
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    paymentType === 'ወርሃዊ'
                      ? 'bg-[#1B5E20] text-white border-[#1B5E20] shadow-xs'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  ወርሃዊ መዋጮ (Monthly)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('ትውልድ');
                    setAmountOverrides({});
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    paymentType === 'ትውልድ'
                      ? 'bg-[#1B5E20] text-white border-[#1B5E20] shadow-xs'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  የትውልድ መዋጮ (Generation)
                </button>
              </div>

              {paymentType === 'ወርሃዊ' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-700 block mb-1">ወር (Month)</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="w-full text-xs bg-white border border-emerald-200 rounded-lg p-2 font-semibold"
                    >
                      {ETHIOPIAN_MONTHS.map((m) => (
                        <option key={m.number} value={m.number}>
                          {m.amharic} ({m.english})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-700 block mb-1">ዓ.ም (Year)</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="w-full text-xs bg-white border border-emerald-200 rounded-lg p-2 font-semibold"
                    >
                      <option value={2018}>2018 ዓ.ም</option>
                      <option value={2019}>2019 ዓ.ም</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-[11px] text-emerald-900">
                  የእያንዳንዱ አባል የትውልድ መዋጮ ቀሪ እዳ (ለምሳሌ 5,000 / 1,000 / 500 / 250 ብር) በራስ-ሰር ይሞላል፤ ከፊል ለመክፈል መጠኑን ማስተካከል ይችላሉ።
                </div>
              )}

              {/* Optional quick uniform amount setter (e.g. 75 ETB) */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min="0"
                  placeholder="ለሁሉም ተመሳሳይ (ለምሳሌ 75)"
                  value={uniformAmountInput}
                  onChange={(e) => setUniformAmountInput(e.target.value)}
                  className="flex-1 text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 font-mono"
                />
                <button
                  type="button"
                  onClick={handleApplyUniformAmount}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold cursor-pointer shrink-0"
                >
                  ለሁሉም ተግብር
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Live Credit Wallet Calculation Banner */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-neutral-900 text-white">
              <div className="text-[10px] text-neutral-300 font-semibold">ያለው Credit Wallet</div>
              <div className="text-base sm:text-lg font-mono font-black text-[#FFD700] tabular-nums">
                {availableWallet.toLocaleString()} ብር
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-900 text-white">
              <div className="text-[10px] text-emerald-200 font-semibold">
                ለ{payableCount} አባላት የሚከፈል ጠቅላላ
              </div>
              <div className="text-base sm:text-lg font-mono font-black text-white tabular-nums">
                -{totalToPay.toLocaleString()} ብር
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border-2 ${
                isInsufficient
                  ? 'bg-red-50 border-red-400 text-red-900'
                  : 'bg-emerald-50 border-emerald-400 text-emerald-950'
              }`}
            >
              <div className="text-[10px] font-bold">ከክፍያ በኋላ የሚቀር ሂሳብ</div>
              <div className="text-base sm:text-lg font-mono font-black tabular-nums">
                {remainingAfter.toLocaleString()} ብር
              </div>
            </div>
          </div>

          {/* Step 4: Selected Members Breakdown Table */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <div className="bg-neutral-50 px-3.5 py-2.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-800">
                <Users className="w-4 h-4 text-[#1B5E20]" />
                <span>
                  የተመረጡ አባላት ዝርዝር ({rowMembers.length}) ·{' '}
                  {paymentType === 'ወርሃዊ'
                    ? `${getEthiopianMonthName(selectedMonth)} ${selectedYear}`
                    : 'የትውልድ መዋጮ'}
                </span>
              </div>

              {rowMembers.some((m) => isMemberAlreadyPaid(m) || m.isMinor) && (
                <button
                  type="button"
                  onClick={handleRemoveAlreadyPaid}
                  className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span>ቀድሞ የከፈሉትን / ነፃዎችን አስወግድ</span>
                </button>
              )}
            </div>

            {rowMembers.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                ምንም አባል በዝርዝሩ ውስጥ የለም።
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100/80 text-neutral-600 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">አባል (Member)</th>
                      <th className="py-2 px-2">ትውልድ</th>
                      <th className="py-2 px-2 text-center">የአሁን ሁኔታ</th>
                      <th className="py-2 px-3 text-right">የሚከፈል መጠን (ብር)</th>
                      <th className="py-2 px-2 text-center">አስወግድ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rowMembers.map((m) => {
                      const alreadyPaid = isMemberAlreadyPaid(m);
                      const amt = getRowAmount(m);
                      return (
                        <tr key={m.id} className={alreadyPaid ? 'bg-emerald-50/40' : ''}>
                          <td className="py-2 px-3">
                            <div className="font-bold text-neutral-900">{m.fullName}</div>
                            <div className="text-[10px] font-mono text-neutral-500">
                              {m.id} · {m.familyName}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-[10px]">
                              {m.isMinor ? 'ልጅ (<18)' : m.isSpouse ? 'ትዳር' : `${m.generation}ኛ`}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            {m.isMinor ? (
                              <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] font-bold">
                                ነፃ (0 ብር)
                              </span>
                            ) : alreadyPaid ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                                Paid (ተከፍሏል)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200">
                                Unpaid (አልከፈለም)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={amountOverrides[m.id] !== undefined ? amountOverrides[m.id] : String(amt)}
                              onChange={(e) =>
                                setAmountOverrides((prev) => ({ ...prev, [m.id]: e.target.value }))
                              }
                              className="w-24 text-right font-mono font-bold text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-[#1B5E20]"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => setRowMembers((prev) => prev.filter((x) => x.id !== m.id))}
                              className="p-1 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="ከዝርዝሩ አስወግድ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-[#1B5E20]" />
            <span>
              ክፍያው ከ<strong>{selectedPayer?.fullName || '—'}</strong> Credit Wallet ተቀንሶ ለ{payableCount} አባላት ይመዘገባል።
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 text-xs font-bold cursor-pointer"
            >
              ተመለስ
            </button>
            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={isSubmitting || isInsufficient || totalToPay <= 0 || !selectedPayer}
              className="px-5 py-2 rounded-xl bg-[#1B5E20] hover:bg-[#154a19] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>በመክፈል ላይ...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#FFD700]" />
                  <span>
                    ከWallet ክፈል ({totalToPay.toLocaleString()} ብር)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

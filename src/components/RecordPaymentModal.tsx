/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle,
  Calculator,
  Building,
  CreditCard,
  UserCheck,
  Sparkles,
  Layers,
  Calendar,
  Check,
  AlertCircle,
  Clock,
  Award,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Member, Contribution, ContributionStatus, PaymentMethod, SettingsRates } from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import {
  getEffectiveMonthlyRate,
  getEffectiveGenRate,
  getMemberGenContributionStats,
  getContributions,
} from '../utils/storage';

export interface PaymentMonthOption {
  month: number;
  year: number;
  name: string;
}

// Generates continuous Ethiopian payment months starting from Hamle 2018 onwards indefinitely (excluding Pagumen 13)
export function getContinuousPaymentMonths(startYear = 2018, endYear = 2028): PaymentMonthOption[] {
  const list: PaymentMonthOption[] = [];
  // 2018 starts from Hamle (11) and Nehase (12)
  list.push({ month: 11, year: 2018, name: 'ሀምሌ' });
  list.push({ month: 12, year: 2018, name: 'ነሐሴ' });

  const monthNames = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሀምሌ', 'ነሐሴ',
  ];

  for (let y = 2019; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      list.push({
        month: m,
        year: y,
        name: monthNames[m - 1],
      });
    }
  }
  return list;
}

export const AVAILABLE_PAYMENT_MONTHS: PaymentMonthOption[] = getContinuousPaymentMonths(2018, 2028);

interface RecordPaymentModalProps {
  members: Member[];
  settings: SettingsRates;
  initialMemberId?: string;
  onSave: (contribution: Omit<Contribution, 'id'>) => void;
  onSaveBatch?: (contributions: Omit<Contribution, 'id'>[]) => void;
  onClose: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  members,
  settings,
  initialMemberId,
  onSave,
  onSaveBatch,
  onClose,
}) => {
  const currentDate = getCurrentEthiopianDate();
  const [selectedMemberId, setSelectedMemberId] = useState<string>(initialMemberId || (members[0]?.id ?? ''));

  // Section 1: Monthly Contribution Controls
  const [includeMonthly, setIncludeMonthly] = useState<boolean>(true);
  const [selectedYearFilter, setSelectedYearFilter] = useState<number>(2018);
  const [selectedMonths, setSelectedMonths] = useState<PaymentMonthOption[]>([
    AVAILABLE_PAYMENT_MONTHS[0], // Hamle 2018 (start date)
  ]);
  const [monthlyPaidAmount, setMonthlyPaidAmount] = useState<number>(75);

  // Section 2: Generation Contribution Controls
  const [includeGeneration, setIncludeGeneration] = useState<boolean>(false);
  const [genPaymentOption, setGenPaymentOption] = useState<'full' | 'partial'>('full');
  const [genTargetAmount, setGenTargetAmount] = useState<number>(500);
  const [genPaidAmount, setGenPaidAmount] = useState<number>(500);
  const [genPaidMonth, setGenPaidMonth] = useState<number>(currentDate.month || 11);
  const [genPaidYear, setGenPaidYear] = useState<number>(currentDate.year || 2018);

  // Shared Payment Details
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('የኢትዮጵያ ንግድ ባንክ (CBE)');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const selectedMember = members.find((m) => m.id === selectedMemberId);
  const allContributions = getContributions();

  // Generation stats for the selected member
  const genStats = selectedMember
    ? getMemberGenContributionStats(selectedMember, settings, allContributions)
    : { expectedAmount: 0, paidSoFar: 0, remainingBalance: 0, status: 'ያልተከፈለ' as ContributionStatus, isExempt: false };

  // Update rates when selected member changes
  useEffect(() => {
    if (!selectedMember) return;

    // Monthly rates
    const singleRate = getEffectiveMonthlyRate(selectedMember, settings);
    const count = Math.max(selectedMonths.length, 1);
    setMonthlyPaidAmount(singleRate * count);

    // If minor, monthly is exempt (0)
    if (selectedMember.isMinor) {
      setIncludeMonthly(false);
      setIncludeGeneration(false);
    } else {
      setIncludeMonthly(true);
    }

    // Generation rates
    const effectiveGenTarget = getEffectiveGenRate(selectedMember, settings);
    const remainingGen = genStats.remainingBalance > 0 ? genStats.remainingBalance : effectiveGenTarget;
    setGenTargetAmount(remainingGen);
    setGenPaidAmount(remainingGen);

    if (selectedMember.isSpouse || selectedMember.isMinor || genStats.status === 'ተከፍሏል (ሙሉ)') {
      setIncludeGeneration(false);
    }
  }, [selectedMemberId, settings, selectedMember?.isMinor, selectedMember?.isSpouse]);

  // Recalculate monthly total when selected months count changes
  useEffect(() => {
    if (!selectedMember) return;
    const singleRate = getEffectiveMonthlyRate(selectedMember, settings);
    setMonthlyPaidAmount(singleRate * selectedMonths.length);
  }, [selectedMonths, selectedMember, settings]);

  // Multi-month toggle
  const handleToggleMonth = (opt: PaymentMonthOption) => {
    const exists = selectedMonths.some((m) => m.month === opt.month && m.year === opt.year);
    if (exists) {
      if (selectedMonths.length === 1) return; // Keep at least one
      setSelectedMonths(selectedMonths.filter((m) => !(m.month === opt.month && m.year === opt.year)));
    } else {
      const updated = [...selectedMonths, opt].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
      setSelectedMonths(updated);
    }
  };

  const handleSelectPreset = (count: number) => {
    setSelectedMonths(AVAILABLE_PAYMENT_MONTHS.slice(0, count));
  };

  // Grand Total calculation on this single unified page
  const singleMonthlyRate = selectedMember ? getEffectiveMonthlyRate(selectedMember, settings) : 0;
  const expectedMonthlyTotal = singleMonthlyRate * selectedMonths.length;
  const grandTotal = (includeMonthly ? monthlyPaidAmount : 0) + (includeGeneration ? genPaidAmount : 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    if (!includeMonthly && !includeGeneration) {
      setErrorNotice('እባክዎ ቢያንስ ወርሃዊ ወይም የትውልድ መዋጮን ይምረጡ!');
      return;
    }

    const contributionsToSave: Omit<Contribution, 'id'>[] = [];
    const datePaidStr = `${getEthiopianMonthName(selectedMonths[0]?.month || 11)} ${selectedMonths[0]?.year || 2018} ዓ.ም`;

    // 1. Process Monthly Payments
    if (includeMonthly && selectedMonths.length > 0) {
      const ratePerMonth = selectedMember.isMinor ? 0 : singleMonthlyRate;
      selectedMonths.forEach((mItem) => {
        const status: ContributionStatus =
          monthlyPaidAmount >= expectedMonthlyTotal
            ? 'ተከፍሏል'
            : monthlyPaidAmount > 0
            ? 'ከፊል'
            : 'ያልተከፈለ';

        contributionsToSave.push({
          memberId: selectedMember.id,
          memberName: selectedMember.fullName,
          familyId: selectedMember.familyId,
          familyName: selectedMember.familyName,
          generation: selectedMember.generation,
          type: 'ወርሃዊ',
          ethiopianMonth: mItem.month,
          ethiopianMonthName: mItem.name,
          ethiopianYear: mItem.year,
          amount: ratePerMonth,
          paidAmount: ratePerMonth,
          status,
          paymentMethod,
          transactionRef: transactionRef.trim() || '',
          notes: notes.trim() || (selectedMonths.length > 1 ? `የ${mItem.name} ${mItem.year} መዋጮ (${selectedMonths.length} ወራት በCBE የተከፈለ)` : ''),
          datePaid: status === 'ተከፍሏል' || status === 'ከፊል' ? `${mItem.name} ${mItem.year} ዓ.ም` : '',
        });
      });
    }

    // 2. Process Generation Payment
    if (includeGeneration && !selectedMember.isMinor && !selectedMember.isSpouse) {
      const genExpected = getEffectiveGenRate(selectedMember, settings);
      const isFull = genPaymentOption === 'full' || genPaidAmount >= genTargetAmount;
      const remainingAfterPayment = Math.max(genTargetAmount - genPaidAmount, 0);

      contributionsToSave.push({
        memberId: selectedMember.id,
        memberName: selectedMember.fullName,
        familyId: selectedMember.familyId,
        familyName: selectedMember.familyName,
        generation: selectedMember.generation,
        type: 'ትውልድ',
        ethiopianMonth: genPaidMonth,
        ethiopianMonthName: getEthiopianMonthName(genPaidMonth),
        ethiopianYear: genPaidYear,
        amount: genTargetAmount,
        paidAmount: genPaidAmount,
        status: isFull ? 'ተከፍሏል' : 'ከፊል',
        isInstallment: !isFull,
        remainingBalance: !isFull ? remainingAfterPayment : 0,
        paymentMethod,
        transactionRef: transactionRef.trim() || '',
        notes: notes.trim() || (isFull ? `የትውልድ መዋጮ ሙሉ በሙሉ ተከፍሏል (${getEthiopianMonthName(genPaidMonth)} ${genPaidYear})` : `የትውልድ መዋጮ በከፊል የተከፈለ (${getEthiopianMonthName(genPaidMonth)} ${genPaidYear}) - የቀረ ቀሪ ${remainingAfterPayment} ብር`),
        datePaid: datePaidStr || '',
      });
    }

    // Save batch or sequentially
    if (onSaveBatch) {
      onSaveBatch(contributionsToSave);
    } else {
      contributionsToSave.forEach((c) => onSave(c));
    }

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#047857', '#d97706', '#10b981'],
      });
    } catch {}

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-emerald-900/10 animate-in fade-in zoom-in-95 duration-200 my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/abarrus_logo.jpg"
              alt="Logo"
              className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-400"
            />
            <div>
              <h3 className="font-bold text-base text-amber-200">
                አንድ ወጥ የክፍያ መመዝገቢያ (ወርሃዊ + የትውልድ በአንድ ገጽ)
              </h3>
              <p className="text-xs text-emerald-200">የመጀመሪያ ክፍያ የሚጀምረው፡ ከ ሀምሌ 01፣ 2018 ዓ.ም</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-emerald-700/50 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bank Notice Banner */}
        <div className="bg-amber-50 px-5 py-2.5 border-b border-amber-200 flex items-center justify-between text-xs text-amber-950">
          <div>
            <span className="font-bold">ይፋዊ CBE ሂሳብ፡ </span>
            <span className="font-mono font-bold text-emerald-950">1000778285146</span>
            <span className="block text-[11px] text-neutral-600">ስም፡ Aida, Ibrahim and zebiba</span>
          </div>
          <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
            ሀምሌ 2018 ጀምሮ
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[76vh] overflow-y-auto">
          {errorNotice && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* 1. Member Selection */}
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              አባል ይምረጡ (Select Member)
            </label>
            <select
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                setErrorNotice(null);
              }}
              className="w-full text-xs sm:text-sm rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-700/40 focus:border-emerald-700 font-medium"
              required
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} {m.isMinor ? '👶 (18 ዓመት ያልሞላ - ነፃ)' : m.isSpouse ? '💍 (የትዳር አጋር)' : `(${m.generation}ኛ ትውልድ)`} · {m.familyName} [{m.id}]
                </option>
              ))}
            </select>
          </div>

          {/* Auto-populated Member Info Card */}
          {selectedMember && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-emerald-950 flex items-center gap-1.5 text-sm">
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  <span>{selectedMember.fullName}</span>
                </p>
                <p className="text-neutral-600 mt-0.5">
                  ቤተሰብ፡ <span className="font-medium text-neutral-800">{selectedMember.familyName}</span> ({selectedMember.familyId})
                </p>
              </div>
              <div className="text-right">
                {selectedMember.isMinor ? (
                  <span className="inline-block px-2.5 py-1 rounded-md bg-amber-200 text-amber-950 font-bold text-[11px]">
                    👶 ከክፍያ ነፃ (0 ብር)
                  </span>
                ) : selectedMember.isSpouse ? (
                  <span className="inline-block px-2.5 py-1 rounded-md bg-purple-100 text-purple-900 font-bold text-[11px]">
                    💍 የትዳር አጋር (100 ብር/ወር)
                  </span>
                ) : (
                  <span className="inline-block px-2.5 py-1 rounded-md bg-emerald-800 text-white font-bold text-[11px]">
                    {selectedMember.generation}ኛ ትውልድ ({singleMonthlyRate} ብር/ወር)
                  </span>
                )}
                <p className="text-[11px] text-emerald-800 font-mono mt-1">{selectedMember.id}</p>
              </div>
            </div>
          )}

          {/* SECTION 1: ወርሃዊ መዋጮ (Monthly Contribution) */}
          <div className={`p-4 rounded-2xl border transition-all ${
            includeMonthly ? 'bg-emerald-50/40 border-emerald-300 shadow-2xs' : 'bg-neutral-50/60 border-neutral-200 opacity-75'
          }`}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5 mb-3">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs sm:text-sm text-emerald-950">
                <input
                  type="checkbox"
                  checked={includeMonthly}
                  disabled={selectedMember?.isMinor}
                  onChange={(e) => setIncludeMonthly(e.target.checked)}
                  className="w-4 h-4 text-emerald-700 rounded border-neutral-300 focus:ring-emerald-600"
                />
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span>1. ወርሃዊ መዋጮ መዝግብ (Monthly Contribution)</span>
              </label>

              {includeMonthly && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  {selectedMonths.length} ወራት ተመርጠዋል
                </span>
              )}
            </div>

            {includeMonthly ? (
              <div className="space-y-3">
                {/* Ethiopian Year Selection Bar (የአመተ ምህረት አማራጭ) */}
                <div className="p-2.5 rounded-xl bg-neutral-100/90 border border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-800" />
                      የአመተ ምህረት አማራጭ (Ethiopian Year)፡
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      የተመረጠው ዓ.ም፡ {selectedYearFilter === 0 ? 'ሁሉም ዓመታት' : `${selectedYearFilter} ዓ.ም`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setSelectedYearFilter(y)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedYearFilter === y
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'bg-white text-neutral-700 hover:bg-neutral-200 border border-neutral-300'
                        }`}
                      >
                        {y} ዓ.ም
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedYearFilter(0)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedYearFilter === 0
                          ? 'bg-emerald-800 text-white shadow-xs'
                          : 'bg-white text-neutral-600 hover:bg-neutral-200 border border-neutral-300'
                      }`}
                    >
                      ሁሉም ዓመታት
                    </button>

                    {selectedYearFilter > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const yearMonths = AVAILABLE_PAYMENT_MONTHS.filter((m) => m.year === selectedYearFilter);
                          const others = selectedMonths.filter((m) => m.year !== selectedYearFilter);
                          setSelectedMonths([...others, ...yearMonths]);
                        }}
                        className="ml-auto text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
                      >
                        የ{selectedYearFilter} ዓ.ምን ወራት በሙሉ ምረጥ
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[10px] text-neutral-500 font-semibold mr-1">ፈጣን ምርጫ፡</span>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset(1)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                      selectedMonths.length === 1
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    1 ወር (ሀምሌ)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset(3)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                      selectedMonths.length === 3
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    3 ወራት
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset(6)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                      selectedMonths.length === 6
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    6 ወራት
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset(12)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                      selectedMonths.length === 12
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    12 ወራት (1 ሙሉ ዓመት)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMonths([])}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold transition-all border border-neutral-200 text-neutral-500 hover:bg-neutral-100 cursor-pointer ml-auto"
                  >
                    ምርጫ አጽዳ
                  </button>
                </div>

                {/* Interactive Month Chips Grid (Filtered by Ethiopian Year, Pagumen 13 removed!) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 pt-1">
                  {(selectedYearFilter === 0
                    ? AVAILABLE_PAYMENT_MONTHS
                    : AVAILABLE_PAYMENT_MONTHS.filter((m) => m.year === selectedYearFilter)
                  ).map((mOpt) => {
                    const isSelected = selectedMonths.some(
                      (m) => m.month === mOpt.month && m.year === mOpt.year
                    );
                    return (
                      <button
                        type="button"
                        key={`${mOpt.year}-${mOpt.month}`}
                        onClick={() => handleToggleMonth(mOpt)}
                        className={`py-1.5 px-2 rounded-xl text-left border text-xs flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-700 text-white border-emerald-700 font-bold shadow-xs'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:border-emerald-300 hover:bg-neutral-50'
                        }`}
                      >
                        <span className="truncate">
                          {mOpt.name} <span className="opacity-80 text-[10px] font-mono">{mOpt.year}</span>
                        </span>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-amber-300 shrink-0 ml-1" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-neutral-300 shrink-0 ml-1"></span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Rate breakdown & Amount Input */}
                <div className="pt-2 border-t border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-neutral-600 block">የወርሃዊ ተመን ስሌት፡</span>
                    <span className="font-bold text-emerald-950 font-mono">
                      {selectedMonths.length} ወር × {singleMonthlyRate} ብር = {expectedMonthlyTotal} ብር
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-neutral-700 whitespace-nowrap">የተከፈለ ወርሃዊ (ብር)፡</label>
                    <input
                      type="number"
                      value={monthlyPaidAmount}
                      onChange={(e) => setMonthlyPaidAmount(Number(e.target.value))}
                      className="w-24 text-sm font-bold text-emerald-950 font-mono rounded-lg border border-neutral-300 px-2 py-1 bg-white text-right"
                      required={includeMonthly}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">
                {selectedMember?.isMinor
                  ? '👶 ይህ አባል 18 ዓመት ስላልሞላው ከወርሃዊ መዋጮ ሙሉ በሙሉ ነፃ ነው።'
                  : 'ወርሃዊ መዋጮ አልተመረጠም።'}
              </p>
            )}
          </div>

          {/* SECTION 2: የትውልድ መዋጮ (Generation Contribution) */}
          <div className={`p-4 rounded-2xl border transition-all ${
            includeGeneration ? 'bg-amber-50/50 border-amber-300 shadow-2xs' : 'bg-neutral-50/60 border-neutral-200 opacity-75'
          }`}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5 mb-3">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs sm:text-sm text-amber-950">
                <input
                  type="checkbox"
                  checked={includeGeneration}
                  disabled={selectedMember?.isMinor || selectedMember?.isSpouse}
                  onChange={(e) => setIncludeGeneration(e.target.checked)}
                  className="w-4 h-4 text-amber-700 rounded border-neutral-300 focus:ring-amber-600"
                />
                <Layers className="w-4 h-4 text-amber-700" />
                <span>2. የትውልድ መዋጮ መዝግብ (Generation Contribution)</span>
              </label>

              {includeGeneration && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  {genStats.status}
                </span>
              )}
            </div>

            {includeGeneration ? (
              <div className="space-y-3">
                {/* 3 Metric Cards: ጠቅላላ ግዴታ | እስካሁን የተከፈለ | ቀሪ ክፍያ */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white p-2 rounded-xl border border-amber-200 shadow-2xs">
                    <span className="text-[10px] text-neutral-500 block">ጠቅላላ ግዴታ</span>
                    <span className="text-xs font-mono font-bold text-neutral-900">
                      {genStats.expectedAmount.toLocaleString()} ብር
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-emerald-200 shadow-2xs">
                    <span className="text-[10px] text-emerald-700 block">እስካሁን የተከፈለ</span>
                    <span className="text-xs font-mono font-bold text-emerald-800">
                      {genStats.paidSoFar.toLocaleString()} ብር
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-red-200 shadow-2xs">
                    <span className="text-[10px] text-red-600 block">ቀሪ ክፍያ</span>
                    <span className="text-xs font-mono font-bold text-red-800">
                      {genStats.remainingBalance.toLocaleString()} ብር
                    </span>
                  </div>
                </div>

                {/* Full vs Partial Selection */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1.5">
                    የትውልድ ክፍያ አማራጭ ይምረጡ፡
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setGenPaymentOption('full');
                        const rem = genStats.remainingBalance > 0 ? genStats.remainingBalance : genStats.expectedAmount;
                        setGenTargetAmount(rem);
                        setGenPaidAmount(rem);
                      }}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        genPaymentOption === 'full'
                          ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                          : 'bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>ሙሉ ክፍያ (Full)</span>
                        {genPaymentOption === 'full' && <Check className="w-3.5 h-3.5 text-amber-300" />}
                      </div>
                      <span className="text-[10px] opacity-80 block mt-0.5">
                        ያለውን ቀሪ {genStats.remainingBalance} ብር ሙሉውን መክፈል
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGenPaymentOption('partial');
                        const half = Math.min(500, genStats.remainingBalance > 0 ? genStats.remainingBalance : 500);
                        setGenPaidAmount(half);
                      }}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        genPaymentOption === 'partial'
                          ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                          : 'bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>ከፊል ክፍያ (Partial)</span>
                        {genPaymentOption === 'partial' && <Check className="w-3.5 h-3.5 text-amber-300" />}
                      </div>
                      <span className="text-[10px] opacity-80 block mt-0.5">
                        የተወሰነውን አሁን ከፍሎ ቀሪ ማቆየት
                      </span>
                    </button>
                  </div>
                </div>

                {/* Month & Year Paid for Generation Dues */}
                <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-amber-950 block">የትውልድ መዋጮ የተከፈለበት ወርና ዓ.ም፡</span>
                    <span className="text-[10px] text-neutral-500">አባሉ በከፈለበት ትክክለኛ ወር ይመዘገባል</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={genPaidMonth}
                      onChange={(e) => setGenPaidMonth(Number(e.target.value))}
                      className="text-xs font-bold rounded-lg border border-neutral-300 px-2.5 py-1 bg-white text-neutral-800"
                    >
                      {ETHIOPIAN_MONTHS.map((m) => (
                        <option key={m.number} value={m.number}>
                          {m.number} - {m.amharic}
                        </option>
                      ))}
                    </select>
                    <select
                      value={genPaidYear}
                      onChange={(e) => setGenPaidYear(Number(e.target.value))}
                      className="text-xs font-bold rounded-lg border border-neutral-300 px-2.5 py-1 bg-white text-neutral-800 font-mono"
                    >
                      {[2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028].map((yr) => (
                        <option key={yr} value={yr}>
                          {yr} ዓ.ም
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Amount Paid for Generation */}
                <div className="pt-2 border-t border-amber-200 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-neutral-600 block">አሁን የሚከፈል የትውልድ መጠን፡</span>
                    {genPaymentOption === 'partial' && genStats.remainingBalance - genPaidAmount > 0 && (
                      <span className="text-[10px] text-amber-900 font-bold block">
                        ለሚቀጥለው የቀረ ቀሪ፡ {Math.max(genStats.remainingBalance - genPaidAmount, 0)} ብር
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-neutral-700 whitespace-nowrap">የተከፈለ መጠን (ብር)፡</label>
                    <input
                      type="number"
                      value={genPaidAmount}
                      onChange={(e) => setGenPaidAmount(Number(e.target.value))}
                      className="w-24 text-sm font-bold text-amber-950 font-mono rounded-lg border border-neutral-300 px-2 py-1 bg-white text-right"
                      required={includeGeneration}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">
                {selectedMember?.isMinor
                  ? '👶 ይህ አባል 18 ዓመት ስላልሞላው ከትውልድ መዋጮ ሙሉ በሙሉ ነፃ ነው።'
                  : selectedMember?.isSpouse
                  ? '💍 የአባላት የትዳር አጋሮች ከትውልድ መዋጮ ክፍያ ነፃ ናቸው።'
                  : 'የትውልድ መዋጮ አልተመረጠም።'}
              </p>
            )}
          </div>

          {/* COMBINED TOTAL DISPLAY */}
          <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[11px] text-emerald-200 block uppercase font-bold tracking-wider">
                አጠቃላይ የሚመዘገብ ጠቅላላ ድምር (Grand Total)
              </span>
              <span className="text-xs text-amber-300">
                {includeMonthly && `ወርሃዊ (${monthlyPaidAmount} ብር)`}
                {includeMonthly && includeGeneration && ' + '}
                {includeGeneration && `ትውልድ (${genPaidAmount} ብር)`}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-extrabold font-mono text-amber-300 tabular-nums">
                {grandTotal.toLocaleString()} ብር
              </span>
            </div>
          </div>

          {/* Payment Method & Transaction Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">የክፍያ ዘዴ</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50/50 focus:ring-2 focus:ring-emerald-700/40 font-semibold text-emerald-950"
              >
                <option value="የኢትዮጵያ ንግድ ባንክ (CBE)">የኢትዮጵያ ንግድ ባንክ (CBE)</option>
                <option value="ጥሬ ገንዘብ (Cash)">ጥሬ ገንዘብ (Cash)</option>
                <option value="ሌላ">ሌላ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">የትራንዛክሽን ቁጥር (Ref)</label>
              <input
                type="text"
                placeholder="ለምሳሌ፡ CBE-10007782"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 bg-neutral-50/50 focus:ring-2 focus:ring-emerald-700/40 font-mono"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              ሰርዝ
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:scale-[1.02]"
            >
              <CheckCircle className="w-4 h-4 text-amber-300" />
              <span>ክፍያውን በአንድ ገጽ መዝግብ ({grandTotal} ብር)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

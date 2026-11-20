/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Member, Family, Contribution, SettingsRates } from '../types';
import {
  ETHIOPIAN_MONTHS,
  getCurrentEthiopianDate,
  getEthiopianMonthName,
} from '../utils/ethiopianCalendar';
import {
  getContributionMonth,
  getContributionPaidAmount,
  getContributionYear,
  getEffectiveMonthlyRate,
  getMemberGenContributionStats,
  isPaidOrPartialStatus,
  isPaidStatus,
  isPartialStatus,
} from '../utils/storage';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Layers,
  ListChecks,
  Search,
  Users,
} from 'lucide-react';

export type ContributionListMode = 'ወርሃዊ' | 'ትውልድ';
export type StatusCategoryKey = 'paid' | 'partial' | 'unpaid';
export type CategoryViewMode = 'all' | StatusCategoryKey;

interface UnpaidReportProps {
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  onRecordPayment: (memberId: string) => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
  initialContributionType?: ContributionListMode;
}

interface CategorizedMemberRow {
  member: Member;
  family?: Family;
  category: StatusCategoryKey;
  paidAmount: number;
  expectedAmount: number;
  remainingAmount: number; // Only populated/displayed in Generation ('ትውልድ') mode
  datePaid?: string;
}

function isMonthlyContributionType(type: unknown): boolean {
  const t = String(type || '').trim().toLowerCase();
  return !type || t === 'ወርሃዊ' || t === 'monthly' || t.includes('month');
}

export const UnpaidReport: React.FC<UnpaidReportProps> = ({
  members,
  families,
  contributions,
  settings,
  onRecordPayment,
  onOpenPaymentManager,
  initialContributionType = 'ወርሃዊ',
}) => {
  const currentDate = getCurrentEthiopianDate();
  const [contributionMode, setContributionMode] = useState<ContributionListMode>(initialContributionType);
  const [categoryView, setCategoryView] = useState<CategoryViewMode>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.month || 11);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.year || 2018);
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [selectedGenFilter, setSelectedGenFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedCategory, setCopiedCategory] = useState<StatusCategoryKey | null>(null);

  useEffect(() => {
    setContributionMode(initialContributionType);
  }, [initialContributionType]);

  const monthName = getEthiopianMonthName(selectedMonth);
  const yearOptions = useMemo(() => {
    const years = new Set<number>([2018, 2019, 2020]);
    if (currentDate.year >= 2018) years.add(currentDate.year);
    return Array.from(years).sort((a, b) => a - b);
  }, [currentDate.year]);

  const familyMap = useMemo(() => {
    const map = new Map<string, Family>();
    families.forEach((f) => map.set(f.id, f));
    return map;
  }, [families]);

  // Pre-index monthly contributions for selectedMonth & selectedYear
  const monthlyMemberBuckets = useMemo(() => {
    const map = new Map<
      string,
      {
        paidAmount: number;
        hasFullPaidStatus: boolean;
        hasPartialStatus: boolean;
        latestDatePaid: string;
      }
    >();

    for (const c of contributions) {
      if (!isMonthlyContributionType(c.type)) continue;
      if (getContributionMonth(c) !== selectedMonth || getContributionYear(c) !== selectedYear) {
        continue;
      }
      if (!isPaidOrPartialStatus(c.status)) continue;

      const key = String(c.memberId || '').trim();
      if (!key) continue;

      const existing = map.get(key) || {
        paidAmount: 0,
        hasFullPaidStatus: false,
        hasPartialStatus: false,
        latestDatePaid: '',
      };

      existing.paidAmount += getContributionPaidAmount(c);
      if (isPaidStatus(c.status)) existing.hasFullPaidStatus = true;
      if (isPartialStatus(c.status)) existing.hasPartialStatus = true;
      if (c.datePaid && !existing.latestDatePaid) {
        existing.latestDatePaid = c.datePaid;
      }
      map.set(key, existing);
    }

    return map;
  }, [contributions, selectedMonth, selectedYear]);

  // Filter members by search, family, and generation
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (selectedFamilyFilter !== 'all' && m.familyId !== selectedFamilyFilter) {
        return false;
      }
      if (selectedGenFilter !== 'all' && String(m.generation) !== selectedGenFilter) {
        return false;
      }
      if (q) {
        const hay = `${m.fullName} ${m.id} ${m.familyName} ${m.familyId} ${m.phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, selectedFamilyFilter, selectedGenFilter, searchQuery]);

  // Categorize members cleanly for the active mode (Monthly vs Generation)
  const { paidRows, partialRows, unpaidRows, exemptCount, totals } = useMemo(() => {
    const paid: CategorizedMemberRow[] = [];
    const partial: CategorizedMemberRow[] = [];
    const unpaid: CategorizedMemberRow[] = [];
    let exempt = 0;

    let collectedPaidSum = 0;
    let collectedPartialSum = 0;
    let genExpectedSum = 0;
    let genRemainingSum = 0;

    for (const member of filteredMembers) {
      const fam = familyMap.get(member.familyId);

      if (contributionMode === 'ወርሃዊ') {
        if (member.isMinor) {
          exempt++;
          continue;
        }

        const expectedRate = getEffectiveMonthlyRate(member, settings);
        const rec = monthlyMemberBuckets.get(String(member.id).trim());
        const paidAmt = rec?.paidAmount || 0;

        if (rec && (rec.hasFullPaidStatus || (expectedRate > 0 && paidAmt >= expectedRate))) {
          const finalPaid = paidAmt > 0 ? paidAmt : expectedRate;
          collectedPaidSum += finalPaid;
          paid.push({
            member,
            family: fam,
            category: 'paid',
            paidAmount: finalPaid,
            expectedAmount: expectedRate,
            remainingAmount: 0,
            datePaid: rec.latestDatePaid,
          });
        } else if (rec && (rec.hasPartialStatus || paidAmt > 0)) {
          collectedPartialSum += paidAmt;
          partial.push({
            member,
            family: fam,
            category: 'partial',
            paidAmount: paidAmt,
            expectedAmount: expectedRate,
            remainingAmount: 0, // Monthly reports strictly omit remaining balance/arrears
            datePaid: rec.latestDatePaid,
          });
        } else {
          unpaid.push({
            member,
            family: fam,
            category: 'unpaid',
            paidAmount: 0,
            expectedAmount: expectedRate,
            remainingAmount: 0,
          });
        }
      } else {
        // Generation ('ትውልድ') cumulative tracking
        const stats = getMemberGenContributionStats(member, settings, contributions);
        if (stats.isExempt) {
          exempt++;
          continue;
        }

        genExpectedSum += stats.expectedAmount;
        genRemainingSum += stats.remainingBalance;

        const latestDatePaid =
          stats.contributions.find((c) => isPaidOrPartialStatus(c.status) && c.datePaid)?.datePaid || '';

        if (stats.status === 'ተከፍሏል (ሙሉ)') {
          collectedPaidSum += stats.paidSoFar;
          paid.push({
            member,
            family: fam,
            category: 'paid',
            paidAmount: stats.paidSoFar,
            expectedAmount: stats.expectedAmount,
            remainingAmount: 0,
            datePaid: latestDatePaid,
          });
        } else if (stats.status === 'ከፊል ክፍያ') {
          collectedPartialSum += stats.paidSoFar;
          partial.push({
            member,
            family: fam,
            category: 'partial',
            paidAmount: stats.paidSoFar,
            expectedAmount: stats.expectedAmount,
            remainingAmount: stats.remainingBalance,
            datePaid: latestDatePaid,
          });
        } else {
          unpaid.push({
            member,
            family: fam,
            category: 'unpaid',
            paidAmount: 0,
            expectedAmount: stats.expectedAmount,
            remainingAmount: stats.remainingBalance,
          });
        }
      }
    }

    return {
      paidRows: paid,
      partialRows: partial,
      unpaidRows: unpaid,
      exemptCount: exempt,
      totals: {
        eligibleCount: paid.length + partial.length + unpaid.length,
        collectedSum: collectedPaidSum + collectedPartialSum,
        collectedPaidSum,
        collectedPartialSum,
        genExpectedSum,
        genRemainingSum,
      },
    };
  }, [filteredMembers, familyMap, contributionMode, settings, monthlyMemberBuckets, contributions]);

  const getCategoryTitle = (cat: StatusCategoryKey) => {
    if (cat === 'paid') {
      return contributionMode === 'ትውልድ' ? 'ሙሉ የከፈሉ ስም ዝርዝር' : 'የከፈሉ ስም ዝርዝር';
    }
    if (cat === 'partial') {
      return 'በከፊል የከፈሉ ስም ዝርዝር';
    }
    return 'ያልከፈሉ ስም ዝርዝር';
  };

  const handleCopyList = async (cat: StatusCategoryKey, rows: CategorizedMemberRow[]) => {
    const headerTitle =
      contributionMode === 'ወርሃዊ'
        ? `የ${monthName} ${selectedYear} ዓ.ም ወርሃዊ መዋጮ — ${getCategoryTitle(cat)} (${rows.length} አባላት)`
        : `የትውልድ መዋጮ — ${getCategoryTitle(cat)} (${rows.length} አባላት)`;

    const lines = rows.map((row, index) => {
      const genLabel = row.member.isSpouse ? 'የትዳር አጋር' : `${row.member.generation}ኛ ትውልድ`;
      if (cat === 'paid') {
        return `${index + 1}. ${row.member.fullName} (${row.member.familyName} · ${genLabel}) — ${row.paidAmount.toLocaleString()} ብር`;
      }
      if (cat === 'partial') {
        if (contributionMode === 'ትውልድ') {
          return `${index + 1}. ${row.member.fullName} (${row.member.familyName} · ${genLabel}) — የተከፈለ ${row.paidAmount.toLocaleString()} ብር / ቀሪ ${row.remainingAmount.toLocaleString()} ብር`;
        }
        return `${index + 1}. ${row.member.fullName} (${row.member.familyName} · ${genLabel}) — በከፊል የተከፈለ ${row.paidAmount.toLocaleString()} ብር`;
      }
      return `${index + 1}. ${row.member.fullName} (${row.member.familyName} · ${genLabel}) — ተመን ${row.expectedAmount.toLocaleString()} ብር`;
    });

    const text = [headerTitle, '', ...lines].join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedCategory(cat);
      setTimeout(() => setCopiedCategory((curr) => (curr === cat ? null : curr)), 2000);
    } catch {
      // Clipboard blocked silently
    }
  };

  const handleExportCsv = (cat: StatusCategoryKey, rows: CategorizedMemberRow[]) => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };

    const headers =
      contributionMode === 'ትውልድ'
        ? ['ተ.ቁ', 'የአባል ID', 'ሙሉ ስም', 'ቤተሰብ', 'ትውልድ', 'ሁኔታ', 'የተከፈለ (ብር)', 'ቀሪ (ብር)', 'የትውልድ ተመን (ብር)', 'የክፍያ ቀን']
        : ['ተ.ቁ', 'የአባል ID', 'ሙሉ ስም', 'ቤተሰብ', 'ትውልድ', 'ሁኔታ', 'የተከፈለ (ብር)', 'ወርሃዊ ተመን (ብር)', 'የክፍያ ቀን'];

    const statusAm =
      cat === 'paid' ? 'ተከፍሏል' : cat === 'partial' ? 'በከፊል የተከፈለ' : 'ያልተከፈለ';

    const csvRows = rows.map((row, idx) => {
      const genText = row.member.isSpouse ? 'የትዳር አጋር' : `${row.member.generation}ኛ ትውልድ`;
      const baseCols = [
        idx + 1,
        row.member.id,
        row.member.fullName,
        `${row.member.familyId} - ${row.member.familyName}`,
        genText,
        statusAm,
        row.paidAmount,
      ];
      if (contributionMode === 'ትውልድ') {
        baseCols.push(row.remainingAmount, row.expectedAmount, row.datePaid || '');
      } else {
        baseCols.push(row.expectedAmount, row.datePaid || '');
      }
      return baseCols.map(escapeCsv).join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const modeSlug = contributionMode === 'ወርሃዊ' ? `monthly-${selectedYear}-m${selectedMonth}` : 'generation';
    link.href = url;
    link.download = `abarrus-${modeSlug}-${cat}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderSeparatedPanel = (
    cat: StatusCategoryKey,
    rows: CategorizedMemberRow[],
    theme: {
      border: string;
      headerBg: string;
      titleColor: string;
      badgeBg: string;
      accentText: string;
      icon: React.ReactNode;
      emptyText: string;
    }
  ) => (
    <section
      key={cat}
      className={`bg-white rounded-2xl border ${theme.border} overflow-hidden flex flex-col`}
    >
      {/* Panel Header */}
      <div className={`px-4 py-3.5 border-b ${theme.border} ${theme.headerBg} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          {theme.icon}
          <div className="min-w-0">
            <h3 className={`text-sm font-extrabold ${theme.titleColor} truncate`}>
              {getCategoryTitle(cat)}
            </h3>
            <p className="text-[11px] text-neutral-600 tabular-nums">
              <strong className="font-mono">{rows.length}</strong> አባላት
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => handleCopyList(cat, rows)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 text-[11px] font-bold text-neutral-700 transition-colors cursor-pointer whitespace-nowrap"
            title="ስም ዝርዝሩን ቅዳ"
          >
            {copiedCategory === cat ? (
              <>
                <Check className="w-3 h-3 text-emerald-700" />
                <span className="text-emerald-700">ተቀድቷል</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>ቅዳ</span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => handleExportCsv(cat, rows)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 text-[11px] font-bold text-neutral-700 transition-colors cursor-pointer whitespace-nowrap"
            title="በCSV አውርድ"
          >
            <Download className="w-3 h-3" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Member Name Rows */}
      <div className="divide-y divide-neutral-100 max-h-[540px] overflow-y-auto flex-1">
        {rows.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-neutral-400">
            {theme.emptyText}
          </div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={row.member.id}
              className="px-3.5 py-2.5 hover:bg-neutral-50/80 transition-colors flex items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="text-[11px] font-mono font-bold text-neutral-400 tabular-nums pt-0.5 w-6 shrink-0">
                  {idx + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 truncate">
                    {row.member.fullName}
                  </p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    <span className="font-mono text-neutral-600">{row.member.id}</span>
                    {' · '}
                    <span>{row.member.familyName}</span>
                    {' · '}
                    <span>
                      {row.member.isSpouse ? 'ትዳር አጋር' : `${row.member.generation}ኛ`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  {cat === 'paid' && (
                    <>
                      <p className={`text-xs font-mono font-extrabold tabular-nums ${theme.accentText}`}>
                        {row.paidAmount.toLocaleString()} ብር
                      </p>
                      {row.datePaid && (
                        <p className="text-[10px] text-neutral-400 font-mono tabular-nums">
                          {row.datePaid}
                        </p>
                      )}
                    </>
                  )}
                  {cat === 'partial' && (
                    <>
                      <p className={`text-xs font-mono font-extrabold tabular-nums ${theme.accentText}`}>
                        {row.paidAmount.toLocaleString()} ብር
                      </p>
                      {contributionMode === 'ትውልድ' ? (
                        <p className="text-[10px] text-rose-700 font-mono tabular-nums">
                          ቀሪ {row.remainingAmount.toLocaleString()} ብር
                        </p>
                      ) : (
                        <p className="text-[10px] text-neutral-500">በከፊል</p>
                      )}
                    </>
                  )}
                  {cat === 'unpaid' && (
                    <>
                      <p className={`text-xs font-mono font-extrabold tabular-nums ${theme.accentText}`}>
                        {row.expectedAmount.toLocaleString()} ብር
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        {contributionMode === 'ትውልድ' ? 'ያልተከፈለ' : 'ተመን'}
                      </p>
                    </>
                  )}
                </div>

                {cat !== 'paid' ? (
                  <button
                    type="button"
                    onClick={() => onRecordPayment(row.member.id)}
                    className="px-2 py-1 rounded-lg bg-[#1B5E20] hover:bg-[#144818] text-white text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                    title="ክፍያ መዝግብ"
                  >
                    መዝግብ
                  </button>
                ) : (
                  onOpenPaymentManager && (
                    <button
                      type="button"
                      onClick={() => onOpenPaymentManager(row.member.id, 'list')}
                      className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                      title="የአባሉን ክፍያዎች እይ"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Action */}
      <div className="px-4 py-2.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-[11px]">
        <span className="text-neutral-500 tabular-nums">
          ድምር፡ <strong className="text-neutral-900">{rows.length}</strong> አባላት
        </span>
        <button
          type="button"
          onClick={() => setCategoryView(cat)}
          className="font-bold text-[#1B5E20] hover:underline cursor-pointer whitespace-nowrap"
        >
          ሙሉ ሰንጠረዥ እይ →
        </button>
      </div>
    </section>
  );

  const renderFocusedTable = (cat: StatusCategoryKey, rows: CategorizedMemberRow[]) => {
    const title = getCategoryTitle(cat);
    const badgeStyle =
      cat === 'paid'
        ? 'bg-emerald-100 text-emerald-800'
        : cat === 'partial'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800';
    const statusLabel =
      cat === 'paid'
        ? contributionMode === 'ትውልድ'
          ? 'ሙሉ ተከፍሏል'
          : 'ተከፍሏል'
        : cat === 'partial'
        ? 'በከፊል የተከፈለ'
        : 'ያልተከፈለ';

    return (
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-extrabold text-neutral-900">{title}</h3>
            <span className={`px-2 py-0.5 rounded-md text-xs font-bold font-mono tabular-nums ${badgeStyle}`}>
              {rows.length} አባላት
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => handleCopyList(cat, rows)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-100 disabled:opacity-40 text-xs font-bold text-neutral-700 cursor-pointer whitespace-nowrap"
            >
              {copiedCategory === cat ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-emerald-700">ተቀድቷል</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>ስም ዝርዝር ቅዳ</span>
                </>
              )}
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => handleExportCsv(cat, rows)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-100 disabled:opacity-40 text-xs font-bold text-neutral-700 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV አውርድ</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/70 text-neutral-600 font-bold border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">የአባል ID</th>
                <th className="py-3 px-4">ሙሉ ስም</th>
                <th className="py-3 px-4">ትውልድ</th>
                <th className="py-3 px-4">ቤተሰብ እና ወኪል</th>
                {cat === 'paid' && (
                  <>
                    <th className="py-3 px-4 text-right">የተከፈለ መጠን</th>
                    <th className="py-3 px-4">የክፍያ ቀን</th>
                  </>
                )}
                {cat === 'partial' && (
                  <>
                    <th className="py-3 px-4 text-right">የተከፈለ መጠን</th>
                    {contributionMode === 'ትውልድ' && (
                      <>
                        <th className="py-3 px-4 text-right">ቀሪ</th>
                        <th className="py-3 px-4 text-right">የትውልድ ተመን</th>
                      </>
                    )}
                    <th className="py-3 px-4">የክፍያ ቀን</th>
                  </>
                )}
                {cat === 'unpaid' && (
                  <th className="py-3 px-4 text-right">
                    {contributionMode === 'ትውልድ' ? 'የሚጠበቅ (ቀሪ)' : 'ወርሃዊ ተመን'}
                  </th>
                )}
                <th className="py-3 px-4">ሁኔታ</th>
                <th className="py-3 px-4 text-right">ፈጣን ተግባር</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-neutral-400">
                    በዚህ ምድብ ውስጥ የተገኘ አባል የለም።
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.member.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-neutral-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-neutral-700">{row.member.id}</td>
                    <td className="py-2.5 px-4 font-bold text-neutral-900">{row.member.fullName}</td>
                    <td className="py-2.5 px-4 text-neutral-700">
                      {row.member.isSpouse ? 'የትዳር አጋር' : `${row.member.generation}ኛ ትውልድ`}
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-semibold text-neutral-900">
                        {row.member.familyId} · {row.member.familyName}
                      </p>
                      {row.family?.headName && (
                        <p className="text-[11px] text-neutral-500">ወኪል፡ {row.family.headName}</p>
                      )}
                    </td>
                    {cat === 'paid' && (
                      <>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-800 tabular-nums">
                          {row.paidAmount.toLocaleString()} ብር
                        </td>
                        <td className="py-2.5 px-4 font-mono text-neutral-500 tabular-nums">
                          {row.datePaid || '—'}
                        </td>
                      </>
                    )}
                    {cat === 'partial' && (
                      <>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-800 tabular-nums">
                          {row.paidAmount.toLocaleString()} ብር
                        </td>
                        {contributionMode === 'ትውልድ' && (
                          <>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700 tabular-nums">
                              {row.remainingAmount.toLocaleString()} ብር
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-neutral-600 tabular-nums">
                              {row.expectedAmount.toLocaleString()} ብር
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-4 font-mono text-neutral-500 tabular-nums">
                          {row.datePaid || '—'}
                        </td>
                      </>
                    )}
                    {cat === 'unpaid' && (
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700 tabular-nums">
                        {row.expectedAmount.toLocaleString()} ብር
                      </td>
                    )}
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeStyle}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onOpenPaymentManager && (
                          <button
                            type="button"
                            onClick={() => onOpenPaymentManager(row.member.id, 'list')}
                            className="px-2 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>ክፍያዎች</span>
                          </button>
                        )}
                        {cat !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => onRecordPayment(row.member.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#1B5E20] hover:bg-[#144818] text-white font-bold text-[11px] transition-colors cursor-pointer whitespace-nowrap"
                          >
                            ክፍያ መዝግብ
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
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Mode Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-semibold">
            <ListChecks className="w-4 h-4 text-[#1B5E20]" />
            <span>የአባላት የክፍያ ሁኔታ ስም ዝርዝር</span>
            <span>·</span>
            <span className="tabular-nums">
              {totals.eligibleCount} ከፋይ አባላት ({exemptCount} ነፃ)
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-neutral-900">
            {contributionMode === 'ወርሃዊ'
              ? `የ${monthName} ${selectedYear} ዓ.ም ወርሃዊ መዋጮ — የከፈሉ፣ በከፊል እና ያልከፈሉ`
              : 'የትውልድ መዋጮ — ሙሉ የከፈሉ፣ በከፊል እና ያልከፈሉ'}
          </h2>
          <p className="text-xs text-neutral-500">
            {contributionMode === 'ወርሃዊ'
              ? 'ለተመረጠው ወር ወርሃዊ መዋጮ የከፈሉ፣ በከፊል የከፈሉ እና ያልከፈሉ አባላት ስም ዝርዝር ለየብቻ'
              : 'የትውልድ መዋጮ በጠቅላላው ሙሉ የከፈሉ፣ በከፊል የከፈሉ እና ያልከፈሉ አባላት ስም ዝርዝር ለየብቻ'}
          </p>
        </div>

        {/* Contribution Type Toggle + Monthly Period Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 rounded-xl bg-neutral-100 border border-neutral-200">
            <button
              type="button"
              onClick={() => setContributionMode('ወርሃዊ')}
              className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                contributionMode === 'ወርሃዊ'
                  ? 'bg-[#1B5E20] text-white'
                  : 'text-neutral-700 hover:text-neutral-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>ወርሃዊ መዋጮ</span>
            </button>
            <button
              type="button"
              onClick={() => setContributionMode('ትውልድ')}
              className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                contributionMode === 'ትውልድ'
                  ? 'bg-[#1B5E20] text-white'
                  : 'text-neutral-700 hover:text-neutral-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>የትውልድ መዋጮ</span>
            </button>
          </div>

          {contributionMode === 'ወርሃዊ' && (
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="text-xs font-bold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/30 cursor-pointer"
                aria-label="የኢትዮጵያ ወር"
              >
                {ETHIOPIAN_MONTHS.map((m) => (
                  <option key={m.number} value={m.number}>
                    ወር {m.number} · {m.amharic}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="text-xs font-bold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/30 font-mono cursor-pointer"
                aria-label="ዓመተ ምህረት"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y} ዓ.ም
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => setCategoryView(categoryView === 'paid' ? 'all' : 'paid')}
          className={`text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
            categoryView === 'paid'
              ? 'bg-emerald-50 border-emerald-500'
              : 'bg-white border-neutral-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
            <span>{contributionMode === 'ትውልድ' ? 'ሙሉ የከፈሉ' : 'የከፈሉ'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-950 font-mono tabular-nums mt-2">
            {paidRows.length} <span className="text-xs font-sans font-semibold text-neutral-500">አባላት</span>
          </p>
          <p className="text-[11px] text-emerald-700 font-mono tabular-nums mt-1">
            {totals.collectedPaidSum.toLocaleString()} ብር ተሰብስቧል
          </p>
        </button>

        <button
          type="button"
          onClick={() => setCategoryView(categoryView === 'partial' ? 'all' : 'partial')}
          className={`text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
            categoryView === 'partial'
              ? 'bg-amber-50 border-amber-500'
              : 'bg-white border-neutral-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
            <span>በከፊል የከፈሉ</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-amber-950 font-mono tabular-nums mt-2">
            {partialRows.length} <span className="text-xs font-sans font-semibold text-neutral-500">አባላት</span>
          </p>
          <p className="text-[11px] text-amber-800 font-mono tabular-nums mt-1">
            {totals.collectedPartialSum.toLocaleString()} ብር በከፊል
          </p>
        </button>

        <button
          type="button"
          onClick={() => setCategoryView(categoryView === 'unpaid' ? 'all' : 'unpaid')}
          className={`text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
            categoryView === 'unpaid'
              ? 'bg-rose-50 border-rose-500'
              : 'bg-white border-neutral-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-rose-800">
            <span>ያልከፈሉ</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-extrabold text-rose-950 font-mono tabular-nums mt-2">
            {unpaidRows.length} <span className="text-xs font-sans font-semibold text-neutral-500">አባላት</span>
          </p>
          <p className="text-[11px] text-rose-700 mt-1 tabular-nums">
            ከ{totals.eligibleCount} ከፋይ አባላት ውስጥ
          </p>
        </button>

        {/* 4th Card: Collection Totals (respecting Monthly vs Generation domain rules) */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
            <span>
              {contributionMode === 'ወርሃዊ' ? 'በወሩ የተሰበሰበ' : 'የትውልድ ገንዘብ ማጠቃለያ'}
            </span>
            <Users className="w-4 h-4 text-neutral-500" />
          </div>
          {contributionMode === 'ወርሃዊ' ? (
            <>
              <p className="text-2xl font-extrabold text-[#1B5E20] font-mono tabular-nums mt-2">
                {totals.collectedSum.toLocaleString()} <span className="text-xs font-sans font-semibold">ብር</span>
              </p>
              <p className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                {monthName} {selectedYear} · {exemptCount} ነፃ (18-)
              </p>
            </>
          ) : (
            <div className="mt-2 space-y-1 text-[11px] tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">እስካሁን የተሰበሰበ፦</span>
                <span className="font-mono font-extrabold text-[#1B5E20]">
                  {totals.collectedSum.toLocaleString()} ብር
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">ቀሪ ያልተሰበሰበ፦</span>
                <span className="font-mono font-extrabold text-rose-700">
                  {totals.genRemainingSum.toLocaleString()} ብር
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-neutral-200">
                <span className="text-neutral-500">መሰብሰብ የነበረበት፦</span>
                <span className="font-mono font-bold text-neutral-900">
                  {totals.genExpectedSum.toLocaleString()} ብር
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters & Category View Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[210px] max-w-sm">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ስም፣ የአባል ID ወይም ቤተሰብ ፈልግ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700"
            />
          </div>

          <select
            value={selectedFamilyFilter}
            onChange={(e) => setSelectedFamilyFilter(e.target.value)}
            className="text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 cursor-pointer"
            aria-label="ቤተሰብ ማጣሪያ"
          >
            <option value="all">ሁሉም ቤተሰቦች ({families.length})</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} · {f.familyName}
              </option>
            ))}
          </select>

          <select
            value={selectedGenFilter}
            onChange={(e) => setSelectedGenFilter(e.target.value)}
            className="text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 cursor-pointer"
            aria-label="ትውልድ ማጣሪያ"
          >
            <option value="all">ሁሉም ትውልዶች</option>
            <option value="3">3ኛ ትውልድ</option>
            <option value="4">4ኛ ትውልድ</option>
            <option value="5">5ኛ ትውልድ</option>
            <option value="6">6ኛ ትውልድ</option>
          </select>
        </div>

        {/* Category Focus Segmented Buttons */}
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-neutral-100 border border-neutral-200">
          <button
            type="button"
            onClick={() => setCategoryView('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              categoryView === 'all'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-700 hover:bg-white'
            }`}
          >
            ሁሉም 3 ክፍሎች
          </button>
          <button
            type="button"
            onClick={() => setCategoryView('paid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
              categoryView === 'paid'
                ? 'bg-emerald-700 text-white'
                : 'text-emerald-800 hover:bg-white'
            }`}
          >
            የከፈሉ ({paidRows.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryView('partial')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
              categoryView === 'partial'
                ? 'bg-amber-600 text-white'
                : 'text-amber-800 hover:bg-white'
            }`}
          >
            በከፊል ({partialRows.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryView('unpaid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
              categoryView === 'unpaid'
                ? 'bg-rose-700 text-white'
                : 'text-rose-800 hover:bg-white'
            }`}
          >
            ያልከፈሉ ({unpaidRows.length})
          </button>
        </div>
      </div>

      {/* Main Content: 3 Separate Lists Side-by-Side OR Focused Full-Width Table */}
      {categoryView === 'all' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {renderSeparatedPanel('paid', paidRows, {
            border: 'border-emerald-200',
            headerBg: 'bg-emerald-50/80',
            titleColor: 'text-emerald-950',
            badgeBg: 'bg-emerald-100 text-emerald-800',
            accentText: 'text-emerald-800',
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />,
            emptyText: 'በዚህ ማጣሪያ ውስጥ የከፈለ አባል የለም።',
          })}

          {renderSeparatedPanel('partial', partialRows, {
            border: 'border-amber-200',
            headerBg: 'bg-amber-50/80',
            titleColor: 'text-amber-950',
            badgeBg: 'bg-amber-100 text-amber-800',
            accentText: 'text-amber-800',
            icon: <Clock className="w-4 h-4 text-amber-700 shrink-0" />,
            emptyText: 'በከፊል የከፈለ አባል የለም።',
          })}

          {renderSeparatedPanel('unpaid', unpaidRows, {
            border: 'border-rose-200',
            headerBg: 'bg-rose-50/80',
            titleColor: 'text-rose-950',
            badgeBg: 'bg-rose-100 text-rose-800',
            accentText: 'text-rose-700',
            icon: <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />,
            emptyText: 'ያልከፈለ አባል የለም — ሁሉም ከፍለዋል።',
          })}
        </div>
      ) : categoryView === 'paid' ? (
        renderFocusedTable('paid', paidRows)
      ) : categoryView === 'partial' ? (
        renderFocusedTable('partial', partialRows)
      ) : (
        renderFocusedTable('unpaid', unpaidRows)
      )}
    </div>
  );
};

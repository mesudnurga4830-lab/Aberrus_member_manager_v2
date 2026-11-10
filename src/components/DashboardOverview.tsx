/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Member, Family, Contribution, SettingsRates } from '../types';
import { getCurrentEthiopianDate, getEthiopianMonthName, ETHIOPIAN_MONTHS } from '../utils/ethiopianCalendar';
import {
  Wallet,
  Users,
  Building,
  AlertCircle,
  TrendingUp,
  Plus,
  Send,
  Printer,
  ChevronRight,
  CheckCircle2,
  Calendar,
  CreditCard,
  QrCode,
  KeyRound,
  Search,
  User,
  ExternalLink,
  X,
  Crown,
  Wrench,
  FileSpreadsheet,
} from 'lucide-react';

interface DashboardOverviewProps {
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  onOpenRecordPayment: () => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
  onOpenAddMember: () => void;
  onOpenBulkImport?: () => void;
  onOpenPrintReport: () => void;
  onNavigateTab: (tab: string) => void;
  onOpenQR: (member: Member) => void;
  onOpenChangePin?: () => void;
  onNavigateToMember?: (memberId: string) => void;
  onNavigateToFamily?: (familyId: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  members,
  families,
  contributions,
  settings,
  onOpenRecordPayment,
  onOpenPaymentManager,
  onOpenAddMember,
  onOpenBulkImport,
  onOpenPrintReport,
  onNavigateTab,
  onOpenQR,
  onOpenChangePin,
  onNavigateToMember,
  onNavigateToFamily,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const currentDate = getCurrentEthiopianDate();
  const [selectedMonth, setSelectedMonth] = React.useState<number>(currentDate.month || 11);
  const [selectedYear, setSelectedYear] = React.useState<number>(currentDate.year || 2018);
  const selectedMonthName = getEthiopianMonthName(selectedMonth);

  // Requirement 2: STRICT MONTHLY AGGREGATION LOGIC (CRITICAL)
  // All reporting, summing, and dashboard aggregation queries are based STRICTLY on
  // the month (1-12) and year (e.g., 2018) fields of the contribution, NOT paidDate (timestamp).
  // Total monthly collections displayed on the Admin dashboard filters by:
  // where("month", "==", selectedMonth), where("year", "==", selectedYear), and where("status", "==", "Paid") (and "ተከፍሏል")
  const selectedMonthPaidContributions = contributions.filter((c) => {
    const m = Number(c.month ?? c.ethiopianMonth);
    const y = Number(c.year ?? c.ethiopianYear);
    const isTargetMonth = m === selectedMonth && y === selectedYear;
    const isPaid = c.status === 'Paid' || c.status === 'ተከፍሏል';
    return isTargetMonth && isPaid;
  });

  const selectedMonthPartialContributions = contributions.filter((c) => {
    const m = Number(c.month ?? c.ethiopianMonth);
    const y = Number(c.year ?? c.ethiopianYear);
    return m === selectedMonth && y === selectedYear && ((c.status as any) === 'ከፊል' || (c.status as any) === 'partial');
  });

  // Strict monthly collections for selected month & year (ወርሃዊ)
  const currentMonthMonthlyReceived = selectedMonthPaidContributions
    .filter((c) => !c.type || c.type === 'ወርሃዊ')
    .reduce((sum, c) => sum + Number(c.paidAmount || c.amount || 0), 0) +
    selectedMonthPartialContributions
      .filter((c) => !c.type || c.type === 'ወርሃዊ')
      .reduce((sum, c) => sum + Number(c.paidAmount || 0), 0);

  const currentMonthGenReceived = selectedMonthPaidContributions
    .filter((c) => c.type === 'ትውልድ')
    .reduce((sum, c) => sum + Number(c.paidAmount || c.amount || 0), 0) +
    selectedMonthPartialContributions
      .filter((c) => c.type === 'ትውልድ')
      .reduce((sum, c) => sum + Number(c.paidAmount || 0), 0);

  const currentMonthSpecialReceived = selectedMonthPaidContributions
    .filter((c) => c.type === 'ልዩ')
    .reduce((sum, c) => sum + Number(c.paidAmount || c.amount || 0), 0) +
    selectedMonthPartialContributions
      .filter((c) => c.type === 'ልዩ')
      .reduce((sum, c) => sum + Number(c.paidAmount || 0), 0);

  const totalContributionsReceivedThisMonth =
    currentMonthMonthlyReceived + currentMonthGenReceived + currentMonthSpecialReceived;

  const monthlyContributionsCount = selectedMonthPaidContributions.filter((c) => !c.type || c.type === 'ወርሃዊ').length;
  const genContributionsCount = selectedMonthPaidContributions.filter((c) => c.type === 'ትውልድ').length;

  const totalCollectedThisMonth = currentMonthMonthlyReceived;

  const totalExpectedThisMonth = members.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
    return sum + (settings.monthlyRate[m.generation] || 0);
  }, 0);

  const paidMembersCount = selectedMonthPaidContributions.filter((c) => !c.type || c.type === 'ወርሃዊ').length;
  const partialMembersCount = selectedMonthPartialContributions.filter((c) => !c.type || c.type === 'ወርሃዊ').length;
  const unpaidMembersCount = Math.max(members.length - paidMembersCount - partialMembersCount, 0);
  const collectionPercentage =
    totalExpectedThisMonth > 0 ? Math.round((currentMonthMonthlyReceived / totalExpectedThisMonth) * 100) : 0;

  const currentMonthReceived = [...selectedMonthPaidContributions, ...selectedMonthPartialContributions];

  // Breakdown by payment methods for current Ethiopian month
  const cbeReceived = currentMonthReceived
    .filter((c) => c.paymentMethod?.includes('CBE') || c.paymentMethod?.includes('ንግድ ባንክ'))
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const telebirrReceived = currentMonthReceived
    .filter((c) => c.paymentMethod?.includes('Telebirr') || c.paymentMethod?.includes('ቴሌብር'))
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const cashReceived = currentMonthReceived
    .filter((c) => c.paymentMethod?.includes('Cash') || c.paymentMethod?.includes('ጥሬ ገንዘብ'))
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const otherPaymentReceived = Math.max(
    totalContributionsReceivedThisMonth - (cbeReceived + telebirrReceived + cashReceived),
    0
  );

  // Breakdown by generation
  const genCounts = {
    3: members.filter((m) => m.generation === 3).length,
    4: members.filter((m) => m.generation === 4).length,
    5: members.filter((m) => m.generation === 5).length,
    6: members.filter((m) => m.generation === 6).length,
  };

  // Recent 5 contributions
  const recentContributions = contributions.slice(0, 5);

  // Global search filtering
  const searchResults = searchQuery.trim()
    ? members.filter((m) => {
        const q = searchQuery.toLowerCase().trim();
        return (
          m.fullName.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.familyId.toLowerCase().includes(q) ||
          m.familyName.toLowerCase().includes(q) ||
          (m.phone && m.phone.includes(q))
        );
      }).slice(0, 15)
    : [];

  return (
    <div className="space-y-6">
      {/* 1. GLOBAL SEARCH INPUT FIELD */}
      <div className="relative z-30">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3 shadow-sm border border-emerald-900/15 flex items-center gap-3 ring-2 ring-emerald-600/10 focus-within:ring-emerald-700/40 focus-within:border-emerald-700 transition-all">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 shrink-0">
            <Search className="w-5 h-5 text-emerald-700" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="አባል በስም፣ በስልክ ወይም በቤተሰብ መለያ (Family ID) ፈጥነህ ፈልግ... (ለምሳሌ፦ ሙራድ፣ FA002፣ FA019፣ 09...)"
            className="flex-1 text-xs sm:text-sm font-medium bg-transparent outline-none text-neutral-900 placeholder:text-neutral-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              title="አጽዳ"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="hidden sm:inline-flex text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0 font-semibold">
            ጠቅላላ {members.length} አባላት
          </span>
        </div>

        {/* Global Search Results Dropdown */}
        {searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-emerald-900/15 max-h-96 overflow-y-auto p-2 space-y-1.5 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-100 text-xs">
              <span className="font-bold text-neutral-700">
                የተገኙ አባላት ({searchResults.length})
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="text-[11px] text-neutral-400 hover:text-neutral-700"
              >
                ዝጋ ✕
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500 italic">
                «{searchQuery}» የሚል ስም ወይም የቤተሰብ መለያ ያለው አባል አልተገኘም።
              </div>
            ) : (
              searchResults.map((m) => {
                const fam = families.find((f) => f.id === m.familyId);
                return (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-xl hover:bg-emerald-50/80 transition-colors border border-transparent hover:border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-900 font-extrabold flex items-center justify-center text-xs shrink-0">
                        {m.fullName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-neutral-900">
                            {m.fullName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 font-semibold">
                            {m.id}
                          </span>
                          {m.isMinor && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                              18- (ነፃ)
                            </span>
                          )}
                          {m.isSpouse && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold border border-purple-200">
                              የትዳር አጋር
                            </span>
                          )}
                          {!m.isMinor && !m.isSpouse && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                              {m.generation}ኛ ትውልድ
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-emerald-900">
                            {m.familyId} · {m.familyName}
                          </span>
                          {m.phone && <span>· 📞 {m.phone}</span>}
                          {fam && <span>· ወኪል፡ {fam.headName}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Navigation and Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {onNavigateToMember && (
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateToMember(m.id);
                            setSearchQuery('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="ወደዚህ አባል መገለጫ ገጽ ሂድ"
                        >
                          <User className="w-3 h-3 text-amber-300" />
                          <span>አባል ገጽ</span>
                        </button>
                      )}

                      {onNavigateToFamily && (
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateToFamily(m.familyId);
                            setSearchQuery('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          title="የዚህ ቤተሰብ ወኪል ገጽ ሂድ"
                        >
                          <Users className="w-3 h-3 text-neutral-600" />
                          <span>ቤተሰብ ({m.familyId})</span>
                        </button>
                      )}

                      {onOpenPaymentManager && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenPaymentManager(m.id, 'list');
                            setSearchQuery('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="የዚህን አባል ክፍያዎች ተመልከት፣ ሰርዝ ወይም አዲስ መዝግብ"
                        >
                          <CreditCard className="w-3 h-3 text-emerald-800" />
                          <span>ክፍያዎች</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onOpenQR(m);
                          setSearchQuery('');
                        }}
                        className="p-1 rounded-lg text-neutral-500 hover:text-emerald-800 hover:bg-neutral-100 transition-colors"
                        title="የአባል QR መታወቂያ ተመልከት"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Hero Welcome Banner (Dark Green #1B5E20 & Gold #FFD700 Theme) */}
      <div className="card-abarrus bg-gradient-to-r from-[#1B5E20] via-[#144818] to-[#1B5E20] text-white border-2 border-[#FFD700] p-6 sm:p-8 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-[#FFD700] text-[#1B5E20] text-xs font-extrabold shadow-sm">
                የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)
              </span>
              <span className="text-xs text-white/70">·</span>
              <span className="text-xs text-white/90 font-mono">{currentDate.formatted}</span>
              <span className="text-xs text-white/70">·</span>
              <span className="text-xs text-[#FFD700] font-semibold">መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)
            </h1>
            <p className="text-sm text-white/85 max-w-xl leading-relaxed">
              የ25 ቤተሰቦችና {members.length} አባላት ወርሃዊ መዋጮ፣ የትውልድ ክፍያ (CBE 1000778285146) እና የቴሌግራም አውቶሜሽን ዳሽቦርድ
            </p>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigateTab('heads')}
              className="px-4 py-2.5 rounded-lg bg-[#FFD700] hover:bg-[#e6c200] text-[#1B5E20] font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>የቤተሰብ ወኪሎች</span>
            </button>
            <button
              onClick={() => onNavigateTab('leadership')}
              className="px-4 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold text-xs border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Crown className="w-4 h-4 text-[#FFD700]" />
              <span>የአመራር ክፍል</span>
            </button>
            <button
              onClick={onOpenRecordPayment}
              className="px-4 py-2.5 rounded-lg bg-[#FFD700] text-[#1B5E20] hover:bg-[#e6c200] font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>ክፍያ መዝግብ</span>
            </button>
            <button
              onClick={onOpenAddMember}
              className="px-4 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold text-xs border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Users className="w-4 h-4 text-[#FFD700]" />
              <span>አዲስ አባል</span>
            </button>
            {onOpenBulkImport && (
              <button
                type="button"
                onClick={onOpenBulkImport}
                className="px-4 py-2.5 rounded-lg bg-[#FFD700] hover:bg-[#e6c200] text-[#1B5E20] font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                title="የአባላት CSV ፋይል በጅምላ አስመጣ"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>ፋይል አስመጣ (Bulk Import)</span>
              </button>
            )}
            {onOpenPaymentManager && (
              <button
                type="button"
                onClick={() => onOpenPaymentManager(undefined, 'list')}
                className="px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs border border-white/20 transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                title="የአባላት የክፍያዎች መዝገብ፣ ክፍያ መመዝገብ ወይም መሰረዝ"
              >
                <CreditCard className="w-4 h-4 text-[#FFD700]" />
                <span>የክፍያዎች መዝገብ</span>
              </button>
            )}
            <button
              onClick={onOpenPrintReport}
              className="px-3.5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/10 transition-all flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-[#FFD700]" />
              <span>ሪፖርት አትም</span>
            </button>
          </div>
        </div>
      </div>

      {/* Requirement 2 & 3: Strict Monthly Aggregation Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-emerald-900/15 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-800" />
            <span>የክፍያ ወር (Contribution Month)፦</span>
          </span>
          {/* Ethiopian Month Dropdown */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="text-xs font-bold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/40 cursor-pointer"
          >
            {ETHIOPIAN_MONTHS.map((m) => (
              <option key={m.number} value={m.number}>
                {m.number}ኛ ወር - {m.amharic}
              </option>
            ))}
          </select>

          {/* Ethiopian Year Dropdown */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs font-bold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/40 font-mono cursor-pointer"
          >
            <option value={2018}>2018 ዓ.ም</option>
            <option value={2019}>2019 ዓ.ም</option>
          </select>

          <span className="text-[11px] text-neutral-500 font-medium">
            (የተጣራው ገቢ በጥብቅ በክፍያው ወር/ዓመት ላይ ብቻ የተመሰረተ ነው)
          </span>
        </div>

        {onOpenPaymentManager && (
          <button
            type="button"
            onClick={() => onOpenPaymentManager(undefined, 'add')}
            className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            title="በእጅ ክፍያ መዝግብ (Add Manual Offline Payment)"
          >
            <Plus className="w-4 h-4 text-[#FFD700]" />
            <span>ክፍያ መዝግብ (Manual)</span>
          </button>
        )}
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: የወሩ ጠቅላላ ገቢ */}
        <div className="card-abarrus flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#757575]">የ{selectedMonthName} {selectedYear} ጠቅላላ ገቢ</span>
            <div className="p-2 rounded-lg bg-[#1B5E20]/10 text-[#1B5E20]">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-[#1B5E20] font-mono tabular-nums">
              {totalCollectedThisMonth.toLocaleString()} ብር
            </p>
            <div className="flex items-center justify-between text-xs mt-1 text-[#757575]">
              <span>ከሚጠበቅ {totalExpectedThisMonth.toLocaleString()} ብር</span>
              <span className="font-bold text-[#1B5E20]">{collectionPercentage}%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-[#E0E0E0] rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-[#1B5E20] rounded-full transition-all duration-500"
              style={{ width: `${Math.min(collectionPercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* KPI 2: ያልተከፈለ ገቢ */}
        <div className="card-abarrus flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#757575]">ያልተከፈለ ቀሪ እዳ</span>
            <div className="p-2 rounded-lg bg-[#FFEBEE] text-[#F44336]">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-[#F44336] font-mono tabular-nums">
              {Math.max(totalExpectedThisMonth - totalCollectedThisMonth, 0).toLocaleString()} ብር
            </p>
            <p className="text-xs text-[#757575] mt-1">
              <strong className="text-[#212121]">{unpaidMembersCount}</strong> አባላት አልከፈሉም
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('unpaid')}
            className="mt-3 text-[11px] font-bold text-[#F44336] hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>ያልተከፈሉትን ይመልከቱ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* KPI 3: ጠቅላላ አባላት */}
        <div className="card-abarrus flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#757575]">ጠቅላላ አባላት</span>
            <div className="p-2 rounded-lg bg-[#F5F5F5] text-[#212121]">
              <Users className="w-4 h-4 text-[#1B5E20]" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-[#212121] font-mono tabular-nums">
              {members.length}
            </p>
            <p className="text-xs text-[#757575] mt-1">
              በ4 ትውልዶች ውስጥ (3ኛ - 6ኛ)
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('members')}
            className="mt-3 text-[11px] font-bold text-[#1B5E20] hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>የአባላት ማውጫ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* KPI 4: ቤተሰቦች ብዛት */}
        <div className="card-abarrus flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#757575]">የተመዘገቡ ቤተሰቦች</span>
            <div className="p-2 rounded-lg bg-[#F5F5F5] text-[#212121]">
              <Building className="w-4 h-4 text-[#1B5E20]" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-[#212121] font-mono tabular-nums">
              {families.length}
            </p>
            <p className="text-xs text-[#757575] mt-1">
              FA001 እስከ FA025
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('tree')}
            className="mt-3 text-[11px] font-bold text-[#1B5E20] hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>የቤተሰብ ዛፍ እይ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CURRENT ETHIOPIAN MONTH CONTRIBUTIONS SUMMARY SECTION                     */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-900/15 shadow-sm space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-neutral-100">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100/80 text-emerald-900 flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="w-5 h-5 text-emerald-800" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-extrabold tracking-wide">
                  የወሩ ገቢ ማጠቃለያ ({selectedMonthName} {selectedYear} ዓ.ም)
                </span>
                <span className="text-neutral-300">·</span>
                <span className="text-xs text-neutral-500 font-medium font-mono">{currentDate.formatted}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 mt-1">
                የ{selectedMonthName} {selectedYear} ጠቅላላ የተሰበሰበ መዋጮ ማጠቃለያ
              </h2>
              <p className="text-xs text-neutral-500">
                በወቅቱ የኢትዮጵያ ወር የተሰበሰቡ ወርሃዊ፣ የትውልድ እና ልዩ መዋጮዎች ዝርዝር ስሌት
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={() => onNavigateTab('contributions')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs transition-colors cursor-pointer"
            >
              <span>የወሩን ክፍያዎች እይ</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            </button>
            <button
              onClick={onOpenRecordPayment}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-amber-300" />
              <span>ክፍያ መዝግብ</span>
            </button>
          </div>
        </div>

        {/* 4 Cards Grid for Current Month */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. ጠቅላላ የተሰበሰበ ገቢ (Total Contributions Received This Month) */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-850 to-emerald-950 text-white shadow-xs space-y-2">
            <div className="flex items-center justify-between text-emerald-200 text-xs">
              <span className="font-semibold">በወሩ ጠቅላላ የተሰበሰበ</span>
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-amber-300 text-[10px] font-bold font-mono">
                {currentMonthReceived.length} ክፍያዎች
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums">
              {totalContributionsReceivedThisMonth.toLocaleString()} <span className="text-sm font-sans text-amber-300">ብር</span>
            </p>
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-emerald-200">
              <span>ከወርሃዊ ግብ ({collectionPercentage}%)</span>
              <span className="font-mono text-white font-semibold">ግብ፡ {totalExpectedThisMonth.toLocaleString()} ብር</span>
            </div>
          </div>

          {/* 2. የወርሃዊ መዋጮ ብቻ */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
            <div className="flex items-center justify-between text-emerald-900 text-xs">
              <span className="font-bold">የወርሃዊ መዋጮ ገቢ</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-200/60 text-emerald-900 text-[10px] font-bold font-mono">
                {monthlyContributionsCount} አባላት
              </span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-950 font-mono tabular-nums">
              {currentMonthMonthlyReceived.toLocaleString()} <span className="text-xs font-sans text-neutral-500">ብር</span>
            </p>
            <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] text-neutral-600">
              <span>ቀሪ ያልተሰበሰበ</span>
              <span className="font-mono font-bold text-amber-900">
                {Math.max(totalExpectedThisMonth - currentMonthMonthlyReceived, 0).toLocaleString()} ብር
              </span>
            </div>
          </div>

          {/* 3. የትውልድ መዋጮ ብቻ */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
            <div className="flex items-center justify-between text-amber-950 text-xs">
              <span className="font-bold">የትውልድ መዋጮ ገቢ</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-200/60 text-amber-900 text-[10px] font-bold font-mono">
                {genContributionsCount} ክፍያዎች
              </span>
            </div>
            <p className="text-2xl font-extrabold text-amber-950 font-mono tabular-nums">
              {currentMonthGenReceived.toLocaleString()} <span className="text-xs font-sans text-neutral-500">ብር</span>
            </p>
            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px] text-neutral-600">
              <span>ዓይነት</span>
              <span className="font-semibold text-neutral-800">የትውልድ መዋጮ (በከፊል/ሙሉ)</span>
            </div>
          </div>

          {/* 4. የአባላት ክፍያ ሁኔታ */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2">
            <div className="flex items-center justify-between text-neutral-700 text-xs">
              <span className="font-bold">የአባላት ክፍያ ተሳትፎ</span>
              <span className="text-[10px] font-mono font-bold text-neutral-500">
                ጠቅላላ {members.length}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold text-neutral-900 font-mono tabular-nums">
                {paidMembersCount}
              </p>
              <span className="text-xs text-emerald-700 font-bold">ሙሉ በሙሉ የከፈሉ</span>
            </div>
            <div className="pt-2 border-t border-neutral-200/60 flex items-center justify-between text-[11px] text-neutral-600">
              <span>{partialMembersCount > 0 ? `${partialMembersCount} ከፊል · ` : ''}{unpaidMembersCount} ያልከፈሉ</span>
              <span className="font-bold text-emerald-800">
                {members.length > 0 ? Math.round((paidMembersCount / members.length) * 100) : 0}% ተሳታፊ
              </span>
            </div>
          </div>
        </div>

        {/* Payment Channels & Distribution for Current Month */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Channel 1: CBE */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-900 flex items-center justify-center font-bold text-xs">
                CBE
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-900">የኢትዮጵያ ንግድ ባንክ (CBE)</p>
                <p className="text-[10px] text-neutral-400 font-mono">1000778285146</p>
              </div>
            </div>
            <p className="font-mono font-bold text-sm text-neutral-900 tabular-nums">
              {cbeReceived.toLocaleString()} <span className="text-[10px] font-normal text-neutral-500">ብር</span>
            </p>
          </div>

          {/* Channel 2: Telebirr */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center font-bold text-xs">
                TB
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-900">ቴሌብር (Telebirr)</p>
                <p className="text-[10px] text-neutral-400">የሞባይል ክፍያ</p>
              </div>
            </div>
            <p className="font-mono font-bold text-sm text-neutral-900 tabular-nums">
              {telebirrReceived.toLocaleString()} <span className="text-[10px] font-normal text-neutral-500">ብር</span>
            </p>
          </div>

          {/* Channel 3: Cash & Others */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-xs">
                💵
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-900">ጥሬ ገንዘብ እና ሌላ</p>
                <p className="text-[10px] text-neutral-400">በቀጥታ የተከፈለ</p>
              </div>
            </div>
            <p className="font-mono font-bold text-sm text-neutral-900 tabular-nums">
              {(cashReceived + otherPaymentReceived).toLocaleString()} <span className="text-[10px] font-normal text-neutral-500">ብር</span>
            </p>
          </div>
        </div>
      </div>

      {/* Mid Section: Generation Breakdown & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generations Summary */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h3 className="font-bold text-sm text-neutral-900">የትውልዶች ክፍፍል እና ተመን</h3>
            <span className="text-[11px] text-neutral-500">ከSettings</span>
          </div>

          <div className="space-y-3">
            {[3, 4, 5, 6].map((gen) => {
              const count = genCounts[gen as 3 | 4 | 5 | 6];
              const mRate = settings.monthlyRate[gen as 3 | 4 | 5 | 6];
              const gRate = settings.generationPayment[gen as 3 | 4 | 5 | 6];
              const pct = members.length > 0 ? Math.round((count / members.length) * 100) : 0;

              return (
                <div key={gen} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-900">{gen}ኛ ትውልድ</span>
                    <span className="font-mono font-bold text-emerald-900 tabular-nums">
                      {count} አባላት ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-800 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-0.5">
                    <span>ወርሃዊ፡ {mRate} ብር</span>
                    <span>የትውልድ፡ {gRate} ብር</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Contributions Table */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h3 className="font-bold text-sm text-neutral-900">የቅርብ ጊዜ የተመዘገቡ ክፍያዎች</h3>
            <button
              onClick={() => onNavigateTab('contributions')}
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-950"
            >
              ሁሉንም እይ ({contributions.length}) →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-500 font-semibold border-b border-neutral-100">
                <tr>
                  <th className="py-2 px-2">ደረሰኝ / ID</th>
                  <th className="py-2 px-2">አባል</th>
                  <th className="py-2 px-2">ዓይነት</th>
                  <th className="py-2 px-2 text-right">መጠን</th>
                  <th className="py-2 px-2">ሁኔታ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {recentContributions.map((c, idx) => (
                  <tr key={`${c.id}-${idx}`} className="hover:bg-neutral-50/60">
                    <td className="py-2.5 px-2 font-mono text-neutral-500 text-[11px]">{c.receiptNumber || c.id}</td>
                    <td className="py-2.5 px-2">
                      <p className="font-bold text-neutral-900">{c.memberName}</p>
                      <p className="text-[10px] text-neutral-400">{c.familyName} · {c.generation}ኛ</p>
                    </td>
                    <td className="py-2.5 px-2 text-neutral-600">{c.type}</td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums text-emerald-900">
                      {c.paidAmount} ብር
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          c.status === 'ተከፍሏል'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.status === 'ከፊል'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

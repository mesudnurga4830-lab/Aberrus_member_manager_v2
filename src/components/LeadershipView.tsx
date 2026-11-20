/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Crown,
  ShieldCheck,
  Send,
  Phone,
  MessageSquare,
  FileText,
  Users,
  CreditCard,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Edit2,
  Download,
  Building,
  RefreshCw,
} from 'lucide-react';
import { Member, Family, Contribution, SettingsRates, AssociationLeadership } from '../types';
import {
  shareReportToExecutiveOrSecretary,
  shareReportToFinanceOfficer,
  getAppUrl,
  buildAllPaidMonthsSummaryLines,
} from '../utils/telegramShare';
import { generateFinancialReportPdf } from '../utils/pdfGenerator';
import { getCurrentEthiopianDate, formatEthiopianCurrency, ETHIOPIAN_MONTHS, getEthiopianMonthName } from '../utils/ethiopianCalendar';
import {
  computeGenerationPortfolioSummary,
  isPaidStatus,
  isPaidOrPartialStatus,
  getContributionMonth,
  getContributionYear,
  getContributionPaidAmount,
} from '../utils/storage';

interface LeadershipViewProps {
  settings: SettingsRates;
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  onUpdateSettings: (settings: SettingsRates) => Promise<void> | void;
  onOpenRecordPayment: (memberId?: string) => void;
  onOpenQR: (member: Member) => void;
  onNavigateToMember: (memberId: string) => void;
  onDispatchTelegram: (payload: {
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  }) => void;
}

export const LeadershipView: React.FC<LeadershipViewProps> = ({
  settings,
  members,
  families,
  contributions,
  onUpdateSettings,
  onOpenRecordPayment,
  onOpenQR,
  onNavigateToMember,
  onDispatchTelegram,
}) => {
  const currentDate = getCurrentEthiopianDate();
  const leadership = settings.leadership;

  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.month || 11);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.year || 2018);
  const selectedMonthName = getEthiopianMonthName(selectedMonth);

  const [editingRole, setEditingRole] = useState<'executive' | 'secretary' | 'financeOfficer' | null>(null);
  const [selectedMemberIdForRole, setSelectedMemberIdForRole] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [customTelegram, setCustomTelegram] = useState<string>('');
  const [isSavingRole, setIsSavingRole] = useState<boolean>(false);
  const [roleSaveError, setRoleSaveError] = useState<string | null>(null);
  const [roleSaveSuccess, setRoleSaveSuccess] = useState<string | null>(null);

  // Financial aggregates
  const activeMembers = members.filter((m) => !m.isMinor);
  const totalMinors = members.filter((m) => m.isMinor).length;
  const totalSpouses = members.filter((m) => m.isSpouse).length;

  const monthContributions = contributions.filter(
    (c) =>
      getContributionMonth(c) === selectedMonth &&
      getContributionYear(c) === selectedYear &&
      (!c.type || c.type === 'ወርሃዊ')
  );
  const monthlyCollected = monthContributions
    .filter((c) => isPaidOrPartialStatus(c.status))
    .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

  const expectedMonthly = members.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
    return sum + (settings.monthlyRate[m.generation] || 0);
  }, 0);

  const monthlyArrears = Math.max(expectedMonthly - monthlyCollected, 0);

  const genPortfolio = computeGenerationPortfolioSummary(members, settings, contributions);
  const allPaidMonthsLines = buildAllPaidMonthsSummaryLines(contributions);
  const allTimeMonthlyCollected = contributions
    .filter((c) => (!c.type || c.type === 'ወርሃዊ') && isPaidOrPartialStatus(c.status))
    .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

  // Generate standardized leadership report summary string
  // Strictly omits Monthly remaining balance; includes all paid months + Generation Expected / Collected / Remaining.
  const generateReportSummaryText = () => {
    const paidCount = monthContributions.filter((c) => isPaidStatus(c.status)).length;
    const unpaidCount = Math.max(activeMembers.length - paidCount, 0);
    const monthsBlock =
      allPaidMonthsLines.length > 0
        ? `\n📆 ሁሉም የተከፈሉ ወራት (ጠቅላላ፡ ${formatEthiopianCurrency(allTimeMonthlyCollected)})፦\n${allPaidMonthsLines.join('\n')}`
        : '';

    return `📅 ቀን፡ ${currentDate.formatted}
👥 ጠቅላላ አባላት፡ ${members.length} (ከ18 ዓመት በታች፡ ${totalMinors}፣ የትዳር አጋር፡ ${totalSpouses})
✅ የ${selectedMonthName} ${selectedYear} ወርሃዊ ክፍያ የፈጸሙ፡ ${paidCount} አባላት (ያልከፈሉ፡ ${unpaidCount})
💰 የ${selectedMonthName} ${selectedYear} የተሰበሰበ ወርሃዊ መዋጮ፡ ${formatEthiopianCurrency(monthlyCollected)}${monthsBlock}

🏛️ የትውልድ መዋጮ ማጠቃለያ፦
• ጠቅላላ መሰብሰብ የነበረበት (Total Expected)፡ ${formatEthiopianCurrency(genPortfolio.totalExpected)}
• እስካሁን የተሰበሰበ (Total Collected)፡ ${formatEthiopianCurrency(genPortfolio.totalCollected)} (${genPortfolio.collectionPercentage}%)
• ቀሪ ያልተሰበሰበ (Remaining Balance)፡ ${formatEthiopianCurrency(genPortfolio.totalRemaining)}
🏦 የCBE ይፋዊ ሂሳብ፡ 1000778285146 (Aida, Ibrahim and zebiba)`;
  };

  const handleOpenAssignModal = (role: 'executive' | 'secretary' | 'financeOfficer') => {
    setEditingRole(role);
    setRoleSaveError(null);
    const curr = leadership?.[role];
    setSelectedMemberIdForRole(curr?.memberId || '');
    setCustomName(curr?.fullName || curr?.name || '');
    setCustomPhone(curr?.phoneNumber || curr?.phone || '');
    setCustomTelegram(curr?.telegramUsername || curr?.telegram || '');
  };

  const handleSaveAssignRole = async () => {
    if (!editingRole) return;
    const selectedMem = members.find((m) => m.id === selectedMemberIdForRole);
    const curr = leadership?.[editingRole];
    const resolvedName = customName.trim() || selectedMem?.fullName || curr?.fullName || curr?.name || '';
    if (!resolvedName) {
      setRoleSaveError('እባክዎ አባል ይምረጡ ወይም ሙሉ ስም ያስገቡ።');
      return;
    }

    const resolvedPhone = customPhone.trim() || selectedMem?.phone || '';
    const resolvedTelegram = customTelegram.trim() || selectedMem?.telegram || '';

    const updatedLeadership: AssociationLeadership = {
      ...leadership,
      [editingRole]: {
        ...(curr || {}),
        name: resolvedName,
        fullName: resolvedName,
        memberId: selectedMemberIdForRole || '',
        phone: resolvedPhone,
        phoneNumber: resolvedPhone,
        telegram: resolvedTelegram,
        telegramUsername: resolvedTelegram,
      },
    };

    setIsSavingRole(true);
    setRoleSaveError(null);
    try {
      await onUpdateSettings({
        ...settings,
        leadership: updatedLeadership,
      });
      const roleTitle =
        editingRole === 'executive'
          ? 'ስራ አስፈፃሚ'
          : editingRole === 'secretary'
          ? 'ጸሀፊ'
          : 'ፋይናንስ ሀላፊ';
      setEditingRole(null);
      setRoleSaveSuccess(`የ${roleTitle} ሹመት (${resolvedName}) በተሳካ ሁኔታ ተመዝግቧል!`);
      setTimeout(() => setRoleSaveSuccess(null), 5000);
    } catch (err: any) {
      console.error('[LeadershipView] Error saving leadership appointment:', err);
      setRoleSaveError(err?.message || 'ሹመቱን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።');
    } finally {
      setIsSavingRole(false);
    }
  };

  // Dispatch reports via Telegram with phone options
  const handleDispatchToExecutive = () => {
    const summary = generateReportSummaryText();
    const payload = shareReportToExecutiveOrSecretary('ስራ አስፈፃሚ', leadership.executive, summary);
    onDispatchTelegram({
      name: leadership.executive.name || leadership.executive.fullName || 'ስራ አስፈፃሚ',
      role: 'የማህበሩ ስራ አስፈፃሚ',
      phone: leadership.executive.phone || leadership.executive.phoneNumber || '',
      telegram: leadership.executive.telegram || leadership.executive.telegramUsername || '',
      messageText: payload.text,
      directUrl: payload.url,
    });
  };

  const handleDispatchToSecretary = () => {
    const summary = generateReportSummaryText();
    const payload = shareReportToExecutiveOrSecretary('ጸሀፊ', leadership.secretary, summary);
    onDispatchTelegram({
      name: leadership.secretary.name || leadership.secretary.fullName || 'ጸሀፊ',
      role: 'የማህበሩ ጸሀፊ',
      phone: leadership.secretary.phone || leadership.secretary.phoneNumber || '',
      telegram: leadership.secretary.telegram || leadership.secretary.telegramUsername || '',
      messageText: payload.text,
      directUrl: payload.url,
    });
  };

  const handleDispatchToFinance = () => {
    const summary = generateReportSummaryText();
    const payload = shareReportToFinanceOfficer(leadership, summary);
    onDispatchTelegram({
      name: leadership.financeOfficer.name || leadership.financeOfficer.fullName || 'ፋይናንስ ሀላፊ',
      role: 'የማህበሩ ፋይናንስ ሀላፊ',
      phone: leadership.financeOfficer.phone || leadership.financeOfficer.phoneNumber || '',
      telegram: leadership.financeOfficer.telegram || leadership.financeOfficer.telegramUsername || '',
      messageText: payload.text,
      directUrl: payload.url,
    });
  };

  const handleDownloadPDF = async () => {
    await generateFinancialReportPdf({
      contributions,
      members,
      families,
      settings,
      selectedMonth,
      selectedYear,
    });
  };

  const leadersList = [
    {
      key: 'executive' as const,
      title: 'የማህበሩ ስራ አስፈፃሚ',
      subtitle: 'Executive Director / President',
      data: leadership.executive,
      color: 'from-emerald-900 to-teal-950',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      onDispatch: handleDispatchToExecutive,
      duties: 'የማህበሩን አጠቃላይ እንቅስቃሴ ይመራል፤ ውሳኔዎችን ያስፈጽማል፤ የቤተሰብ ወኪሎችን ያስተባብራል።',
    },
    {
      key: 'secretary' as const,
      title: 'የማህበሩ ጸሀፊ',
      subtitle: 'Association Secretary',
      data: leadership.secretary,
      color: 'from-blue-900 to-sky-950',
      badgeColor: 'bg-sky-100 text-sky-900 border-sky-300',
      onDispatch: handleDispatchToSecretary,
      duties: 'የአባላትን መዝገብ ይይዛል፤ ቃለ-ጉባዔዎችን ያዘጋጃል፤ ይፋዊ መግለጫዎችንና መልእክቶችን ያሰራጫል።',
    },
    {
      key: 'financeOfficer' as const,
      title: 'የማህበሩ ፋይናንስ ሀላፊ',
      subtitle: 'Chief Finance Officer',
      data: leadership.financeOfficer,
      color: 'from-amber-900 to-amber-950',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      onDispatch: handleDispatchToFinance,
      duties: 'ወርሃዊ እና የትውልድ መዋጮዎችን ይቆጣጠራል፤ የባንክ ሂሳብ ገቢና ወጪን ያረጋግጣል፤ የሂሳብ ሪፖርት ያቀርባል።',
    },
  ];

  return (
    <div className="space-y-6">
      {roleSaveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{roleSaveSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setRoleSaveSuccess(null)}
            className="text-emerald-800 hover:text-emerald-950 px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400 text-emerald-950 text-xs font-black shadow-xs">
              <Crown className="w-3.5 h-3.5" />
              <span>የማህበሩ ይፋዊ መዋቅር</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              የአበሩስ አንድነት ማህበር አመራሮች ክፍል
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200">
              ስራ አስፈፃሚ፣ ጸሀፊ እና የፋይናንስ ሀላፊን ማስተዳደሪያ፤ ሪፖርቶችን በስልክና Telegram መላኪያ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-xs font-bold bg-white/95 text-emerald-950 rounded-xl px-2.5 py-2 border border-white/30 cursor-pointer"
            >
              {ETHIOPIAN_MONTHS.map((m) => (
                <option key={m.number} value={m.number}>
                  {m.number}ኛ ወር - {m.amharic}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs font-bold bg-white/95 text-emerald-950 rounded-xl px-2.5 py-2 border border-white/30 font-mono cursor-pointer"
            >
              <option value={2018}>2018 ዓ.ም</option>
              <option value={2019}>2019 ዓ.ም</option>
              <option value={2020}>2020 ዓ.ም</option>
            </select>
            <button
              onClick={handleDownloadPDF}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-100 text-emerald-950 font-bold text-xs transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-800" />
              <span>የአመራር ሪፖርት PDF አውርድ</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">ጠቅላላ አባላት</span>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900 font-mono">
            {members.length}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            {totalMinors} ከ18 በታች ነፃ • {totalSpouses} የትዳር አጋር
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">የተሰበሰበ ወርሃዊ</span>
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-900 font-mono">
            {formatEthiopianCurrency(monthlyCollected)}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            የ{selectedMonthName} {selectedYear} ዓ.ም መዋጮ
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">የትውልድ የተሰበሰበ</span>
            <Building className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-900 font-mono">
            {formatEthiopianCurrency(genPortfolio.totalCollected)}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            ከጠቅላላ {formatEthiopianCurrency(genPortfolio.totalExpected)} ({genPortfolio.collectionPercentage}%)
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">የትውልድ ቀሪ ያልተሰበሰበ</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-700 font-mono">
            {formatEthiopianCurrency(genPortfolio.totalRemaining)}
          </div>
          <p className="text-[10px] text-rose-600 font-semibold mt-1">
            ወርሃዊ ቀሪ ({selectedMonthName})፡ {formatEthiopianCurrency(monthlyArrears)}
          </p>
        </div>
      </div>

      {/* Leadership 3 Key Roles Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {leadersList.map((leader) => {
          const person = leader.data;
          const assignedMember = members.find((m) => m.id === person.memberId);

          return (
            <div
              key={leader.key}
              className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* Header of Leader Card */}
                <div className={`bg-gradient-to-r ${leader.color} text-white p-4`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      {leader.subtitle}
                    </span>
                    <button
                      onClick={() => handleOpenAssignModal(leader.key)}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer text-xs flex items-center gap-1"
                      title="መሪውን ቀይር / ሹም"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>ሹም / ቀይር</span>
                    </button>
                  </div>
                  <h3 className="font-extrabold text-base sm:text-lg mt-1">
                    {leader.title}
                  </h3>
                </div>

                {/* Profile Information */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-lg text-emerald-950 shrink-0">
                      {(person.fullName || person.name) ? (person.fullName || person.name || '').charAt(0) : 'አ'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-neutral-900 text-sm truncate">
                        {person.fullName || person.name || 'አልተሾመም'}
                      </div>
                      {assignedMember ? (
                        <div className="text-[11px] text-emerald-700 font-medium">
                          መታወቂያ፡ {assignedMember.id} ({assignedMember.generation}ኛ ትውልድ • {assignedMember.familyName})
                        </div>
                      ) : (
                        <div className="text-[11px] text-neutral-500">
                          {person.memberId ? `መታወቂያ፡ ${person.memberId}` : 'ቀጥታ የተመዘገበ'}
                        </div>
                      )}
                      <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${leader.badgeColor}`}>
                        ተሾሟል (Active)
                      </span>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-neutral-400" /> ስልክ፡
                      </span>
                      <span className="font-mono font-bold text-neutral-800">
                        {person.phone || person.phoneNumber || 'አልተሞላም'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5 text-neutral-400" /> Telegram፡
                      </span>
                      <span className="font-mono text-emerald-800 font-semibold">
                        {person.telegram || person.telegramUsername || 'አልተሞላም'}
                      </span>
                    </div>
                  </div>

                  {/* Duties snippet */}
                  <p className="text-[11px] text-neutral-600 italic leading-relaxed">
                    "{leader.duties}"
                  </p>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="p-4 pt-0 space-y-2">
                <button
                  onClick={leader.onDispatch}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                >
                  <Send className="w-4 h-4 text-amber-300" />
                  <span>በስልክ / Telegram ሪፖርት ላክ</span>
                </button>

                {assignedMember && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenRecordPayment(assignedMember.id)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      ክፍያ መዝግብ
                    </button>
                    <button
                      onClick={() => onOpenQR(assignedMember)}
                      className="py-1.5 px-2.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      QR ካርድ
                    </button>
                    <button
                      onClick={() => onNavigateToMember(assignedMember.id)}
                      className="py-1.5 px-2.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      ፕሮፋይል
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Official CBE Account Information */}
      <div className="bg-amber-50 rounded-2xl p-4 sm:p-5 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-amber-800" />
            <h4 className="font-extrabold text-amber-950 text-sm">
              የማህበሩ ይፋዊ የባንክ ሂሳብ (CBE Account)
            </h4>
          </div>
          <p className="text-xs text-amber-900">
            አባላት መዋጮዎቻቸውን በቀጥታ የሚያስገቡበት የተረጋገጠ የጋራ ሂሳብ
          </p>
        </div>

        <div className="bg-white px-4 py-2.5 rounded-xl border border-amber-300 font-mono text-xs sm:text-sm font-bold text-amber-950">
          <div>ሂሳብ ቁጥር፡ 1000778285146</div>
          <div className="text-[11px] text-neutral-600 font-sans font-medium">
            የሂሳብ ስም፡ Aida, Ibrahim and zebiba
          </div>
        </div>
      </div>

      {/* Modal for Assigning / Changing Leader */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 animate-in fade-in zoom-in-95">
            <div className="bg-emerald-950 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {editingRole === 'executive'
                    ? 'ስራ አስፈፃሚ መመደቢያ'
                    : editingRole === 'secretary'
                    ? 'ጸሀፊ መመደቢያ'
                    : 'የፋይናንስ ሀላፊ መመደቢያ'}
                </h3>
                <p className="text-[11px] text-emerald-200">
                  ከ403ቱ የአበሩስ አባላት ዝርዝር ውስጥ መርጠው ሹም
                </p>
              </div>
              <button
                onClick={() => setEditingRole(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {roleSaveError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
                  {roleSaveError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  አባል ይምረጡ (ከዝርዝሩ)፡
                </label>
                <select
                  value={selectedMemberIdForRole}
                  onChange={(e) => {
                    const memId = e.target.value;
                    setSelectedMemberIdForRole(memId);
                    const mem = members.find((m) => m.id === memId);
                    if (mem) {
                      setCustomName(mem.fullName || '');
                      setCustomPhone(mem.phone || '');
                      setCustomTelegram(mem.telegram || '');
                    } else if (!memId) {
                      setCustomName('');
                      setCustomPhone('');
                      setCustomTelegram('');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="">-- አባል ይምረጡ --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.id} • {m.generation}ኛ ትውልድ • {m.familyName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  ሙሉ ስም (Full Name)፡
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="የተሾመው አባል ሙሉ ስም"
                  className="w-full px-3 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  ስልክ ቁጥር (Phone Number)፡
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="0911234567"
                  className="w-full px-3 py-2 text-xs font-mono bg-neutral-50 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  የTelegram መለያ (Username ወይም ስልክ)፡
                </label>
                <input
                  type="text"
                  value={customTelegram}
                  onChange={(e) => setCustomTelegram(e.target.value)}
                  placeholder="@username ወይም 09..."
                  className="w-full px-3 py-2 text-xs font-mono bg-neutral-50 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  disabled={isSavingRole}
                  className="px-3.5 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  ሰርዝ
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignRole}
                  disabled={isSavingRole}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {isSavingRole && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingRole ? 'በማስቀመጥ ላይ...' : 'ሹመቱን አጽድቅና መዝግብ'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

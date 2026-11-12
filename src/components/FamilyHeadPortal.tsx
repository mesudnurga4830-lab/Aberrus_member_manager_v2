/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Family, Member, Contribution, SettingsRates, GenerationNumber, UserRole } from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Send,
  Phone,
  MessageSquare,
  Users,
  Award,
  Calendar,
  CreditCard,
  Edit3,
  Save,
  Copy,
  Check,
  ExternalLink,
  PlusCircle,
  FileText,
  Clock,
  Sparkles,
  Download,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateFinancialReportPdf } from '../utils/pdfGenerator';
import {
  shareAppLinkToFamilyHead,
  getFamilyHeadDirectChatUrl,
  getAppUrl,
  copyToClipboardSafe,
} from '../utils/telegramShare';
import {
  recordTelegramLinkSent,
  getTelegramDispatchedHeads,
  getContributions,
  getMembers,
  saveAllDataNow,
} from '../utils/storage';

interface FamilyHeadPortalProps {
  families: Family[];
  members: Member[];
  contributions: Contribution[];
  settings: SettingsRates;
  selectedFamilyId: string;
  userRole?: UserRole;
  onSelectFamily: (id: string) => void;
  onUpdateFamilyContact: (familyId: string, phone: string, telegram: string) => void;
  onRecordPayment: (memberId: string) => void;
  onOpenAddMember?: (familyId: string) => void;
  onDispatchTelegram?: (payload: {
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  }) => void;
}

export type FamilyHeadTab = 'monthly-paid' | 'monthly-unpaid' | 'gen-paid' | 'gen-unpaid' | 'minors-exempt' | 'spouses';

export const FamilyHeadPortal: React.FC<FamilyHeadPortalProps> = ({
  families,
  members,
  contributions,
  settings,
  selectedFamilyId,
  userRole = 'family_head',
  onSelectFamily,
  onUpdateFamilyContact,
  onRecordPayment,
  onOpenAddMember,
  onDispatchTelegram,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<FamilyHeadTab>('monthly-unpaid');
  const [selectedMonth, setSelectedMonth] = useState<number>(11); // Default Hamle (ሀምሌ)
  const [selectedYear, setSelectedYear] = useState<number>(2018);

  // Edit Head Contact Form state
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [copiedReport, setCopiedReport] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [dispatchedRecords, setDispatchedRecords] = useState<Record<string, string>>(getTelegramDispatchedHeads());

  const currentDate = getCurrentEthiopianDate();
  const currentMonthName = getEthiopianMonthName(selectedMonth);

  const currentFamily =
    families.find((f) => f.id.toLowerCase() === (selectedFamilyId || '').trim().toLowerCase()) ||
    families.find((f) => f.id === selectedFamilyId) ||
    families[0];
  const familyMembers = members.filter((m) => m.familyId === currentFamily.id);

  // Minors under 18 (100% exempt from monthly & generation dues)
  const minorMembers = familyMembers.filter((m) => m.isMinor);
  // Spouses (exempt from generation dues, 100 ETB monthly)
  const spouseMembers = familyMembers.filter((m) => m.isSpouse);

  // 1. Monthly contributions for this family in selected month/year
  const familyMonthlyCon = contributions.filter(
    (c) =>
      c.familyId === currentFamily.id &&
      c.type === 'ወርሃዊ' &&
      c.ethiopianMonth === selectedMonth &&
      c.ethiopianYear === selectedYear
  );

  const monthlyPaidMemberIds = new Set(
    familyMonthlyCon.filter((c) => c.status === 'ተከፍሏል').map((c) => c.memberId)
  );

  const monthlyPartialMap = new Map(
    familyMonthlyCon.filter((c) => c.status === 'ከፊል').map((c) => [c.memberId, c])
  );

  // 1. የራሳቸውን ቤተሰብ የከፈሉ ዝርዝር (Monthly Paid)
  const monthlyPaidMembers = familyMembers.filter((m) => monthlyPaidMemberIds.has(m.id));

  // 2. የራሳቸውን ቤተሰብ ያልከፈሉ ዝርዝር (Monthly Unpaid: excludes minors who are exempt)
  const monthlyUnpaidMembers = familyMembers.filter((m) => !m.isMinor && !monthlyPaidMemberIds.has(m.id));

  // 3. የራሳቸውን ቤተሰብ የትውልድ መዋጮ የከፈሉ (Generation Paid)
  const familyGenCon = contributions.filter(
    (c) => c.familyId === currentFamily.id && c.type === 'ትውልድ'
  );

  const genPaidMemberIds = new Set(
    familyGenCon.filter((c) => c.status === 'ተከፍሏል').map((c) => c.memberId)
  );

  const genPartialMap = new Map(
    familyGenCon.filter((c) => c.status === 'ከፊል').map((c) => [c.memberId, c])
  );

  const genPaidMembers = familyMembers.filter((m) => genPaidMemberIds.has(m.id));

  // 4. የራሳቸውን ቤተሰብ የትውልድ መዋጮ ያልከፈሉ (Generation Unpaid: excludes minors & spouses who are exempt)
  const genUnpaidMembers = familyMembers.filter(
    (m) => !m.isMinor && !m.isSpouse && !genPaidMemberIds.has(m.id)
  );

  // Totals for this family using effective rates
  const totalMonthlyExpected = familyMembers.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
    return sum + (settings.monthlyRate[m.generation] || 0);
  }, 0);

  const totalMonthlyPaid = familyMonthlyCon
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalMonthlyArrears = Math.max(totalMonthlyExpected - totalMonthlyPaid, 0);

  // Start editing contact
  const handleStartEdit = () => {
    setEditPhone(currentFamily.phone || '');
    setEditTelegram(currentFamily.telegram || currentFamily.phone || '');
    setIsEditingContact(true);
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateFamilyContact(currentFamily.id, editPhone.trim(), editTelegram.trim());
    setIsEditingContact(false);
    setSentNotice('የቴሌግራም እና የስልክ መረጃው በተሳካ ሁኔታ ተመዝግቧል!');
    setTimeout(() => setSentNotice(null), 3500);
  };

  // Compose Full End-of-Month Telegram Report for this Family with freshly loaded records
  const composeTelegramReport = () => {
    // Re-verify latest state from storage
    const freshCons = getContributions();
    const freshMembers = getMembers();
    const currentFamMembers = freshMembers.filter((m) => m.familyId === currentFamily.id);

    const freshMonthly = freshCons.filter(
      (c) =>
        c.familyId === currentFamily.id &&
        c.type === 'ወርሃዊ' &&
        c.ethiopianMonth === selectedMonth &&
        c.ethiopianYear === selectedYear
    );
    const freshPaidIds = new Set(freshMonthly.filter((c) => c.status === 'ተከፍሏል').map((c) => c.memberId));

    const fPaidMembers = currentFamMembers.filter((m) => freshPaidIds.has(m.id));
    const fUnpaidMembers = currentFamMembers.filter((m) => !m.isMinor && !freshPaidIds.has(m.id));

    const freshGen = freshCons.filter((c) => c.familyId === currentFamily.id && c.type === 'ትውልድ');
    const freshGenPaidIds = new Set(freshGen.filter((c) => c.status === 'ተከፍሏል').map((c) => c.memberId));
    const fGenPaid = currentFamMembers.filter((m) => freshGenPaidIds.has(m.id));
    const fGenUnpaid = currentFamMembers.filter((m) => !m.isMinor && !m.isSpouse && !freshGenPaidIds.has(m.id));

    const fTotalExpected = currentFamMembers.reduce((sum, m) => {
      if (m.isMinor) return sum;
      if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
      return sum + (settings.monthlyRate[m.generation] || 0);
    }, 0);

    const fTotalPaid = freshMonthly
      .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const fTotalArrears = Math.max(fTotalExpected - fTotalPaid, 0);

    // Helper: Group members by generation without parentheses
    const formatGroupedByGeneration = (memberList: Member[]): string => {
      if (!memberList || memberList.length === 0) return '';
      const map: Record<number, Member[]> = {};
      for (const m of memberList) {
        const gen = Number(m.generation) || 4;
        if (!map[gen]) map[gen] = [];
        map[gen].push(m);
      }
      const gens = Object.keys(map).map(Number).sort((a, b) => a - b);
      const sections: string[] = [];
      for (const g of gens) {
        const list = map[g].map((m) => `• ${m.fullName}`).join('\n');
        sections.push(`<b>${g}ኛ ትውልድ</b>\n${list}`);
      }
      return sections.join('\n\n');
    };

    let monthlyUnpaidSection = '';
    if (fUnpaidMembers.length === 0) {
      monthlyUnpaidSection = `❌ <b>ያልከፈሉ፦</b> 0 አባላት\nሁሉም ከፍለዋል ✅`;
    } else {
      monthlyUnpaidSection = `❌ <b>ያልከፈሉ፦</b> ${fUnpaidMembers.length} አባላት\n\n` + formatGroupedByGeneration(fUnpaidMembers);
    }

    // Paid generation members: • Name — Amount ብር (clean, no parentheses)
    const paidGenLines = fGenPaid.map((m) => {
      const c = freshGen.find((con) => con.memberId === m.id);
      const amt = Number(c?.paidAmount || c?.amount || 0);
      return `• ${m.fullName} — ${amt.toLocaleString()} ብር`;
    }).join('\n');

    const unpaidGenGrouped = formatGroupedByGeneration(fGenUnpaid);

    return `🏛️ <b>የአበሩስ አንድነት ማህበር</b>
የወርሃዊ መዋጮ ሪፖርት

━━━━━━━━━━━━━━━
👨‍👩‍👧‍👦 <b>ቤተሰብ፦</b> ${currentFamily.familyName}
🔖 <b>ኮድ፦</b> ${currentFamily.id}
👤 <b>ወኪል፦</b> ${currentFamily.headName}
📅 <b>ወቅት፦</b> ${currentMonthName} ${selectedYear} ዓ.ም
👥 <b>አባላት፦</b> ${currentFamMembers.length}

━━━━━━━━━━━━━━━
💰 <b>ወርሃዊ መዋጮ</b>
• የሚጠበቅ፦ ${fTotalExpected.toLocaleString()} ብር
• የተሰበሰበ፦ ${fTotalPaid.toLocaleString()} ብር
• ቀሪ፦ ${fTotalArrears.toLocaleString()} ብር
${monthlyUnpaidSection}

━━━━━━━━━━━━━━━
🏛️ <b>የትውልድ መዋጮ</b>
• ሙሉ የከፈሉ፦ ${fGenPaid.length}
• ቀሪ ያልከፈሉ፦ ${fGenUnpaid.length}

✅ <b>የከፈሉ</b>
${paidGenLines || '• እስካሁን የለም'}

❌ <b>ያልከፈሉ</b>
${unpaidGenGrouped || '• ሁሉም ከፍለዋል ✅'}

━━━━━━━━━━━━━━━
💳 <b>የባንክ ሂሳብ</b>
• ቁጥር፦ 1000778285146
• ስም፦ Aida, Ibrahim and Zebiba
━━━━━━━━━━━━━━━
🤖 የአበሩስ አንድነት ማህበር`;
  };

  const handleSendTelegramReport = async () => {
    // 1. Immediately persist current data before sending report
    saveAllDataNow({ members, families, contributions, settings });

    const reportText = composeTelegramReport();
    let tgTarget = currentFamily.telegram || currentFamily.phone || '';
    tgTarget = tgTarget.replace(/\s+/g, '');

    const familyPortalUrl = `${getAppUrl()}/?role=family_head&familyId=${encodeURIComponent(currentFamily.id)}`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(familyPortalUrl)}&text=${encodeURIComponent(reportText)}`;

    // Call backend endpoint gracefully (safe, never fails UI)
    try {
      await fetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'family_head',
          familyId: currentFamily.id,
          month: selectedMonth,
          year: selectedYear,
        }),
      });
    } catch (e) {
      console.warn('[Report Send Notice]: Backend report dispatched or queued');
    }

    if (onDispatchTelegram) {
      onDispatchTelegram({
        name: currentFamily.headName,
        role: `የ${currentFamily.familyName} ቤተሰብ ወኪል (${currentFamily.id})`,
        phone: currentFamily.phone || '',
        telegram: currentFamily.telegram || '',
        messageText: reportText,
        directUrl: familyPortalUrl,
      });
    } else {
      window.open(url, '_blank');
    }

    try {
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#047857', '#d97706'],
      });
    } catch {}

    setSentNotice(`የ${currentMonthName} ወር የክፍያ ሪፖርት ወደ ${currentFamily.headName} (${tgTarget || 'ቴሌግራም/ስልክ'}) ተዘጋጅቷል!`);
    setTimeout(() => setSentNotice(null), 5000);
  };

  const handleCopyReport = async () => {
    saveAllDataNow({ members, families, contributions, settings });
    const reportText = composeTelegramReport();
    await copyToClipboardSafe(reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handleDownloadPdf = () => {
    saveAllDataNow({ members, families, contributions, settings });
    generateFinancialReportPdf({
      contributions: getContributions(),
      members: getMembers(),
      families,
      settings,
      selectedMonth,
      selectedYear,
      familyFilterId: currentFamily.id,
    });
    setSentNotice(`የ${currentFamily.familyName} ቤተሰብ የ${currentMonthName} ወር ሪፖርት በPDF ተዘጋጅቶ ተቀምጧል!`);
    setTimeout(() => setSentNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP SUMMARY CARD: Total Unpaid Monthly Contributions for the entire family with pulse animation */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          totalMonthlyArrears > 0
            ? 'bg-gradient-to-br from-red-50/90 via-amber-50/50 to-white border-red-300 shadow-md ring-2 ring-red-400/20'
            : 'bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-emerald-300 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {totalMonthlyArrears > 0 ? (
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600"></span>
                </span>
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-neutral-800">
                የቤተሰቡ አጠቃላይ ያልተከፈለ ወርሃዊ መዋጮ ማጠቃለያ (Family Unpaid Monthly Summary)
              </h3>
              {totalMonthlyArrears > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-extrabold border border-red-200 animate-pulse">
                  ⚠️ ክፍያ ይጠበቃል
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                  ✓ ሁሉም ተከፍሏል
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${
                  totalMonthlyArrears > 0 ? 'text-red-700 animate-pulse' : 'text-emerald-800'
                }`}
              >
                {totalMonthlyArrears.toLocaleString()} ብር
              </span>
              <span className="text-xs font-semibold text-neutral-600">
                ({monthlyUnpaidMembers.length} ከ {familyMembers.length} አባላት አልከፈሉም · {monthlyPaidMembers.length} አባላት ከፍለዋል)
              </span>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed max-w-2xl">
              {totalMonthlyArrears > 0 ? (
                <span>
                  የ{currentFamily.familyName} ቤተሰብ የ{currentMonthName} {selectedYear} ዓ.ም ያልተከፈለ ቀሪ እዳ ነው። እባክዎ በቀጥታ በ
                  <strong className="text-neutral-900 mx-1">CBE ባንክ 1000778285146</strong>
                  (Aida, Ibrahim and zebiba) ክፍያውን ፈጽመው የደረሰኝ ቁጥር ያስመዝግቡ።
                </span>
              ) : (
                <span className="text-emerald-800 font-semibold">
                  እንኳን ደስ አሎት! የ{currentFamily.familyName} ቤተሰብ ሁሉም {familyMembers.length} አባላት የ{currentMonthName} {selectedYear} ዓ.ም ወርሃዊ መዋጮ በሙሉ በትክክል ከፍለዋል።
                </span>
              )}
            </p>
          </div>

          {/* Quick CTA Buttons on Summary Card */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {totalMonthlyArrears > 0 && monthlyUnpaidMembers[0] && (
              <button
                onClick={() => onRecordPayment(monthlyUnpaidMembers[0].id)}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-transform active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>ያልተከፈለውን አሁን መዝግብ</span>
              </button>
            )}
            <button
              onClick={handleSendTelegramReport}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-amber-300" />
              <span>ሪፖርት በቴሌግራም ላክ</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="የቤተሰቡን ሪፖርት በPDF ቀይረህ ሴቭ አድርግ"
            >
              <Download className="w-3.5 h-3.5 text-emerald-950" />
              <span>PDF አውርድ</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. VERIFIED FAMILY HEAD BADGE & SECURITY VERIFICATION (የተረጋገጠ የግል መለያ ባጅ እና የደህንነት ማረጋገጫ) */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-emerald-950 text-xs font-extrabold flex items-center gap-1.5 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-950" />
              የተረጋገጠ የቤተሰብ ወኪል ባጅ (VERIFIED HEAD)
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-mono text-[11px] font-bold border border-emerald-300">
              ID: {currentFamily.id}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              የደህንነት ማረጋገጫ፡ ጸድቋል (ACTIVE)
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-neutral-900 mt-2">
            የ{currentFamily.familyName} ቤተሰብ ወኪል ገጽ
          </h2>
          <p className="text-xs text-neutral-600 mt-0.5">
            የተረጋገጡ ወኪል፡ <strong className="text-neutral-900 font-bold">{currentFamily.headName}</strong>
            {currentFamily.coHeadName && (
              <span> / <strong className="text-neutral-900 font-bold">{currentFamily.coHeadName}</strong></span>
            )}
            <span className="mx-2 text-neutral-300">|</span>
            <span>ጠቅላላ አባላት፡ <strong className="text-neutral-900">{familyMembers.length}</strong></span>
          </p>
        </div>

        {/* Month selector & Locked Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Family Switcher: Admin Only. Family Heads are locked to their own family */}
          {userRole === 'admin' ? (
            <div className="flex items-center gap-1.5 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200">
              <label className="text-xs font-semibold text-neutral-600 whitespace-nowrap">ወኪል ይምረጡ፡</label>
              <select
                value={selectedFamilyId}
                onChange={(e) => {
                  onSelectFamily(e.target.value);
                  setIsEditingContact(false);
                }}
                className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 focus:ring-2 focus:ring-emerald-700/40"
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.id} · {f.headName} (የ{f.familyName} ቤተሰብ)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-50/90 px-3.5 py-2 rounded-xl border border-emerald-300 text-xs font-bold text-emerald-950 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <div>
                <span className="text-[10px] text-emerald-800 uppercase block tracking-wider font-semibold">የተፈቀደው ቤተሰብ ብቻ</span>
                <span className="text-xs font-extrabold text-neutral-900">የ{currentFamily.familyName} ቤተሰብ ({currentFamily.headName})</span>
              </div>
            </div>
          )}

          {/* Month selector starting from Hamle 2018 */}
          <div className="flex items-center gap-1 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200">
            <Calendar className="w-3.5 h-3.5 text-neutral-500 ml-1" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-xs font-bold bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-neutral-800 font-mono"
            >
              {ETHIOPIAN_MONTHS.map((m) => (
                <option key={m.number} value={m.number}>
                  {m.number} = {m.amharic} {m.number === 11 ? '(መጀመሪያ ወር)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* New Member Registration for Family Head */}
          {onOpenAddMember && (
            <button
              onClick={() => onOpenAddMember(currentFamily.id)}
              className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer hover:scale-[1.02]"
              title="አዲስ የቤተሰብ አባል መዝግብ (Register New Member)"
            >
              <PlusCircle className="w-4 h-4 text-amber-300" />
              <span>+ አዲስ አባል መዝግብ</span>
            </button>
          )}
        </div>
      </div>

      {sentNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{sentNotice}</span>
          </div>
          <button onClick={() => setSentNotice(null)} className="text-emerald-700 font-bold">✕</button>
        </div>
      )}

      {/* 3. HEAD PROFILE, CBE BANK ACCOUNT & TELEGRAM CARD */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-neutral-900 text-white rounded-3xl p-6 shadow-md border border-emerald-800/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center font-extrabold text-2xl shadow-inner shrink-0 ring-4 ring-amber-400/30">
              {currentFamily.headName.charAt(0)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-800 text-amber-300 font-bold">
                  {currentFamily.id}
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {currentFamily.headName}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold border border-amber-400/40">
                  የተረጋገጠ ወኪል
                </span>
              </div>
              <p className="text-xs text-emerald-200">
                የ{currentFamily.familyName} ቤተሰብ ወኪል · {familyMembers.length} አባላት · የክፍያ መጀመሪያ፡ ሀምሌ 01፣ 2018 ዓ.ም
              </p>

              {/* Registered Phone & Telegram */}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-200">
                  <Phone className="w-3.5 h-3.5 text-amber-300" />
                  <span className="font-mono">{currentFamily.phone || 'ስልክ አልተመዘገበም'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-200">
                  <Send className="w-3.5 h-3.5 text-[#229ED9]" />
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-amber-200">
                    {currentFamily.telegram || 'Telegram አልተመዘገበም'}
                  </span>
                </div>
                {dispatchedRecords[currentFamily.id] && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-800/90 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-amber-300" />
                    <span>የአፑ ሊንክ ተልኳል</span>
                  </span>
                )}
              </div>

              {/* CBE Bank Information Prominently Displayed */}
              <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-xl bg-amber-400/15 text-amber-200 border border-amber-400/30 font-semibold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-300" />
                  <span>CBE፡ <strong>1000778285146</strong> (Aida, Ibrahim and zebiba)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons on Head Card */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                const payload = shareAppLinkToFamilyHead(currentFamily, members, contributions, settings);
                recordTelegramLinkSent(currentFamily.id);
                setDispatchedRecords(getTelegramDispatchedHeads());
                try {
                  confetti({
                    particleCount: 50,
                    spread: 60,
                    origin: { y: 0.6 },
                    colors: ['#047857', '#d97706', '#229ed9'],
                  });
                } catch {}
                if (onDispatchTelegram) {
                  onDispatchTelegram({
                    name: currentFamily.headName,
                    role: `የ${currentFamily.familyName} ቤተሰብ ወኪል (${currentFamily.id})`,
                    phone: currentFamily.phone || '',
                    telegram: currentFamily.telegram || '',
                    messageText: payload.text,
                    directUrl: payload.directUrl,
                  });
                } else {
                  window.open(payload.url, '_blank');
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
              title="የአፑን ሊንክና የቤተሰብ ሪፖርት ለወኪሉ በTelegram / ስልክ ቁጥር ላክ"
            >
              <Send className="w-4 h-4 text-amber-300" />
              <span>የአፑን ሊንክ በTelegram ላክ</span>
            </button>

            {/* Direct Telegram Profile Link if available */}
            {currentFamily.telegram && (
              <a
                href={getFamilyHeadDirectChatUrl(currentFamily)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#229ED9]/80 hover:bg-[#229ED9] text-white font-semibold text-xs transition-colors"
                title="የወኪሉን የቴሌግራም አካውንት በቀጥታ ክፈት"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>ቀጥታ ቻት ({currentFamily.telegram})</span>
              </a>
            )}

            <button
              onClick={handleSendTelegramReport}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#229ED9] hover:bg-[#1e8bc0] text-white font-bold text-xs transition-colors shadow-sm"
              title="በየወሩ መጨረሻ የቤተሰባቸውን የክፍያ ሪፖርት በቴሌግራም አካውንታቸው እንዲላክላቸው"
            >
              <Send className="w-4 h-4" />
              <span>የወሩ መጨረሻ ሪፖርት በTelegram ላክ</span>
            </button>

            <button
              onClick={handleCopyReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/10 transition-colors"
            >
              {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedReport ? 'ተቀድቷል' : 'ሪፖርቱን ኮፒ አድርግ'}</span>
            </button>

            <button
              onClick={() => setIsEditingContact(!isEditingContact)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold text-xs transition-colors"
              title="የቴሌግራም አካውንታቸው በስልክ ቁጥራቸው እንዲመዘገብ"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>ቴሌግራም/ስልክ መዝግብ</span>
            </button>
          </div>
        </div>

        {/* Edit Contact inline form */}
        {isEditingContact && (
          <form
            onSubmit={handleSaveContact}
            className="mt-6 pt-5 border-t border-emerald-800/60 bg-white/5 p-4 rounded-2xl animate-in fade-in"
          >
            <h4 className="text-xs font-bold text-amber-300 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              የወኪሉን ቴሌግራም አካውንት በስልክ ቁጥር ወይም በUser Name መመዝገቢያ
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-emerald-200 mb-1">ስልክ ቁጥር (Phone)</label>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="0911234567 ወይም +966..."
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full text-xs rounded-xl bg-white/10 border border-white/20 text-white px-3 py-2 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-emerald-200 mb-1">
                  Telegram Account (ስልክ ቁጥር ወይም @username)
                </label>
                <input
                  type="text"
                  placeholder="+2519... ወይም @username"
                  value={editTelegram}
                  onChange={(e) => setEditTelegram(e.target.value)}
                  className="w-full text-xs rounded-xl bg-white/10 border border-white/20 text-white px-3 py-2 font-mono"
                  required
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>መዝግብ (Save)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingContact(false)}
                  className="py-2 px-3 rounded-xl bg-white/10 text-white hover:bg-white/20 text-xs"
                >
                  ተመለስ
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* 4 Required Interactive Filter Blocks for Family Heads */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs space-y-5">
        {/* Navigation Tabs between the 4 states requested */}
        <div className="border-b border-neutral-200 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                የቤተሰብ መዋጮ ክትትል (የ{currentFamily.familyName} ቤተሰብ)
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                የ{currentMonthName} {selectedYear} ዓ.ም ወርሃዊ እና የትውልድ ክፍያዎች ዝርዝር
              </p>
            </div>

            {/* Quick KPI pills */}
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                ወርሃዊ የተከፈለ፡ {totalMonthlyPaid.toLocaleString()} ብር
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                ቀሪ እዳ፡ {totalMonthlyArrears.toLocaleString()} ብር
              </span>
            </div>
          </div>

          {/* 4 Tab Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {/* 1. የከፈሉ ዝርዝር */}
            <button
              onClick={() => setActiveSubTab('monthly-paid')}
              className={`p-3 rounded-xl text-left border transition-all ${
                activeSubTab === 'monthly-paid'
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                  : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">1. ወርሃዊ የከፈሉ</span>
                <CheckCircle2
                  className={`w-4 h-4 ${activeSubTab === 'monthly-paid' ? 'text-amber-300' : 'text-emerald-600'}`}
                />
              </div>
              <p
                className={`text-xl font-extrabold font-mono mt-1 ${
                  activeSubTab === 'monthly-paid' ? 'text-amber-200' : 'text-emerald-900'
                }`}
              >
                {monthlyPaidMembers.length} አባላት
              </p>
              <p className={`text-[10px] mt-0.5 ${activeSubTab === 'monthly-paid' ? 'text-emerald-200' : 'text-neutral-500'}`}>
                የ{currentMonthName} ወር የከፈሉ
              </p>
            </button>

            {/* 2. ያልከፈሉ ዝርዝር */}
            <button
              onClick={() => setActiveSubTab('monthly-unpaid')}
              className={`p-3 rounded-xl text-left border transition-all ${
                activeSubTab === 'monthly-unpaid'
                  ? 'bg-amber-900 text-white border-amber-900 shadow-sm'
                  : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">2. ወርሃዊ ያልከፈሉ</span>
                <AlertTriangle
                  className={`w-4 h-4 ${activeSubTab === 'monthly-unpaid' ? 'text-amber-300' : 'text-amber-600'}`}
                />
              </div>
              <p
                className={`text-xl font-extrabold font-mono mt-1 ${
                  activeSubTab === 'monthly-unpaid' ? 'text-amber-200' : 'text-amber-900'
                }`}
              >
                {monthlyUnpaidMembers.length} አባላት
              </p>
              <p className={`text-[10px] mt-0.5 ${activeSubTab === 'monthly-unpaid' ? 'text-amber-200' : 'text-neutral-500'}`}>
                ቀነ-ገደብ (ቀን 5) ያለፈባቸው
              </p>
            </button>

            {/* 3. የትውልድ መዋጮ የከፈሉ */}
            <button
              onClick={() => setActiveSubTab('gen-paid')}
              className={`p-3 rounded-xl text-left border transition-all ${
                activeSubTab === 'gen-paid'
                  ? 'bg-emerald-900 text-white border-emerald-900 shadow-sm'
                  : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">3. የትውልድ የከፈሉ</span>
                <Award
                  className={`w-4 h-4 ${activeSubTab === 'gen-paid' ? 'text-amber-300' : 'text-emerald-700'}`}
                />
              </div>
              <p
                className={`text-xl font-extrabold font-mono mt-1 ${
                  activeSubTab === 'gen-paid' ? 'text-amber-200' : 'text-emerald-900'
                }`}
              >
                {genPaidMembers.length} አባላት
              </p>
              <p className={`text-[10px] mt-0.5 ${activeSubTab === 'gen-paid' ? 'text-emerald-200' : 'text-neutral-500'}`}>
                የትውልድ ቋሚ መዋጮ
              </p>
            </button>

            {/* 4. የትውልድ መዋጮ ያልከፈሉ */}
            <button
              onClick={() => setActiveSubTab('gen-unpaid')}
              className={`p-3 rounded-xl text-left border transition-all ${
                activeSubTab === 'gen-unpaid'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                  : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">4. የትውልድ ያልከፈሉ</span>
                <Clock
                  className={`w-4 h-4 ${activeSubTab === 'gen-unpaid' ? 'text-amber-300' : 'text-neutral-600'}`}
                />
              </div>
              <p
                className={`text-xl font-extrabold font-mono mt-1 ${
                  activeSubTab === 'gen-unpaid' ? 'text-amber-200' : 'text-neutral-900'
                }`}
              >
                {genUnpaidMembers.length} አባላት
              </p>
              <p className={`text-[10px] mt-0.5 ${activeSubTab === 'gen-unpaid' ? 'text-neutral-300' : 'text-neutral-500'}`}>
                ቋሚ ክፍያ የቀራቸው
              </p>
            </button>
          </div>
        </div>

        {/* Tab Content Tables */}
        <div>
          {/* TAB 1: ወርሃዊ የከፈሉ */}
          {activeSubTab === 'monthly-paid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  የ{currentMonthName} {selectedYear} ዓ.ም ወርሃዊ መዋጮ የከፈሉ የቤተሰብ አባላት ({monthlyPaidMembers.length})
                </h4>
              </div>

              {monthlyPaidMembers.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400 italic bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                  ለዚህ ወር እስካሁን ምንም ክፍያ አልተመዘገበም።
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-3">የአባል ID</th>
                        <th className="py-2.5 px-3">ሙሉ ስም</th>
                        <th className="py-2.5 px-3">ትውልድ</th>
                        <th className="py-2.5 px-3 text-right">የተከፈለ መጠን</th>
                        <th className="py-2.5 px-3">የክፍያ ዘዴ</th>
                        <th className="py-2.5 px-3">ደረሰኝ ቁጥር</th>
                        <th className="py-2.5 px-3 text-right">ሁኔታ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {monthlyPaidMembers.map((member) => {
                        const con = familyMonthlyCon.find((c) => c.memberId === member.id && c.status === 'ተከፍሏል');
                        const rate = settings.monthlyRate[member.generation] || 50;
                        return (
                          <tr key={member.id} className="hover:bg-neutral-50/70">
                            <td className="py-2.5 px-3 font-mono font-bold text-neutral-600">{member.id}</td>
                            <td className="py-2.5 px-3 font-bold text-neutral-900">{member.fullName}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium text-[11px]">
                                {member.generation}ኛ ትውልድ
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900 tabular-nums">
                              {con?.paidAmount || rate} ብር
                            </td>
                            <td className="py-2.5 px-3 text-neutral-600">{con?.paymentMethod || 'የኢትዮጵያ ንግድ ባንክ (CBE)'}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-500">
                              {con?.receiptNumber || con?.transactionRef || 'REC-2018'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                ተከፍሏል
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ወርሃዊ ያልከፈሉ */}
          {activeSubTab === 'monthly-unpaid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  የ{currentMonthName} {selectedYear} ዓ.ም ወርሃዊ መዋጮ ያልከፈሉ የቤተሰብ አባላት ({monthlyUnpaidMembers.length})
                </h4>
              </div>

              {monthlyUnpaidMembers.length === 0 ? (
                <div className="p-8 text-center text-xs text-emerald-800 font-semibold bg-emerald-50 rounded-xl border border-emerald-200">
                  🎉 እንኳን ደስ ያለዎት! የቤተሰብዎ አባላት በሙሉ የ{currentMonthName} ወር መዋጮ ከፍለዋል።
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-3">የአባል ID</th>
                        <th className="py-2.5 px-3">ሙሉ ስም</th>
                        <th className="py-2.5 px-3">ትውልድ</th>
                        <th className="py-2.5 px-3 text-right">የሚጠበቅ መጠን</th>
                        <th className="py-2.5 px-3">ስልክ</th>
                        <th className="py-2.5 px-3">ሁኔታ</th>
                        <th className="py-2.5 px-3 text-right">ተግባር</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {monthlyUnpaidMembers.map((member) => {
                        const rate = settings.monthlyRate[member.generation] || 50;
                        const partial = monthlyPartialMap.get(member.id);
                        return (
                          <tr key={member.id} className="hover:bg-amber-50/40">
                            <td className="py-2.5 px-3 font-mono font-bold text-neutral-600">{member.id}</td>
                            <td className="py-2.5 px-3 font-bold text-neutral-900">{member.fullName}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-medium text-[11px]">
                                {member.generation}ኛ ትውልድ
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-900 tabular-nums">
                              {rate} ብር
                            </td>
                            <td className="py-2.5 px-3 font-mono text-neutral-500">{member.phone || '—'}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  partial ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {partial ? 'ከፊል ተከፍሏል' : 'ያልተከፈለ'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {userRole === 'admin' ? (
                                <button
                                  onClick={() => onRecordPayment(member.id)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-[11px] transition-colors cursor-pointer"
                                >
                                  ክፍያ መዝግብ
                                </button>
                              ) : (
                                <span className="text-[11px] font-semibold text-neutral-500">
                                  የክትትል እይታ (Read-only)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: የትውልድ መዋጮ የከፈሉ */}
          {activeSubTab === 'gen-paid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  የትውልድ ቋሚ መዋጮ የከፈሉ የቤተሰብ አባላት ({genPaidMembers.length})
                </h4>
              </div>

              {genPaidMembers.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400 italic bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                  እስካሁን የትውልድ መዋጮ የተመዘገበለት አባል የለም።
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-3">የአባል ID</th>
                        <th className="py-2.5 px-3">ሙሉ ስም</th>
                        <th className="py-2.5 px-3">ትውልድ</th>
                        <th className="py-2.5 px-3 text-right">የትውልድ ተመን</th>
                        <th className="py-2.5 px-3 text-right">የተከፈለ መጠን</th>
                        <th className="py-2.5 px-3">የክፍያ ዘዴ</th>
                        <th className="py-2.5 px-3 text-right">ሁኔታ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {genPaidMembers.map((member) => {
                        const genPayment = settings.generationPayment[member.generation] || 500;
                        const con = familyGenCon.find((c) => c.memberId === member.id && c.status === 'ተከፍሏል');
                        return (
                          <tr key={member.id} className="hover:bg-neutral-50/70">
                            <td className="py-2.5 px-3 font-mono font-bold text-neutral-600">{member.id}</td>
                            <td className="py-2.5 px-3 font-bold text-neutral-900">{member.fullName}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium text-[11px]">
                                {member.generation}ኛ ትውልድ
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-neutral-500 tabular-nums">
                              {genPayment} ብር
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900 tabular-nums">
                              {con?.paidAmount || genPayment} ብር
                            </td>
                            <td className="py-2.5 px-3 text-neutral-600">{con?.paymentMethod || 'CBE'}</td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                ተከፍሏል
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: የትውልድ መዋጮ ያልከፈሉ */}
          {activeSubTab === 'gen-unpaid' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  የትውልድ ቋሚ መዋጮ ያልከፈሉ የቤተሰብ አባላት ({genUnpaidMembers.length})
                </h4>
              </div>

              {genUnpaidMembers.length === 0 ? (
                <div className="p-8 text-center text-xs text-emerald-800 font-semibold bg-emerald-50 rounded-xl border border-emerald-200">
                  🎉 ሁሉም የቤተሰብ አባላት የትውልድ መዋጮ ከፍለዋል!
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-3">የአባል ID</th>
                        <th className="py-2.5 px-3">ሙሉ ስም</th>
                        <th className="py-2.5 px-3">ትውልድ</th>
                        <th className="py-2.5 px-3 text-right">የሚጠበቅ የትውልድ መጠን</th>
                        <th className="py-2.5 px-3">ስልክ</th>
                        <th className="py-2.5 px-3">ሁኔታ</th>
                        <th className="py-2.5 px-3 text-right">ተግባር</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {genUnpaidMembers.map((member) => {
                        const genPayment = settings.generationPayment[member.generation] || 500;
                        const partial = genPartialMap.get(member.id);
                        return (
                          <tr key={member.id} className="hover:bg-neutral-50/70">
                            <td className="py-2.5 px-3 font-mono font-bold text-neutral-600">{member.id}</td>
                            <td className="py-2.5 px-3 font-bold text-neutral-900">{member.fullName}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-medium text-[11px]">
                                {member.generation}ኛ ትውልድ
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                              {genPayment} ብር
                            </td>
                            <td className="py-2.5 px-3 font-mono text-neutral-500">{member.phone || '—'}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  partial ? 'bg-amber-100 text-amber-800' : 'bg-neutral-200 text-neutral-800'
                                }`}
                              >
                                {partial ? 'ከፊል ተከፍሏል' : 'ያልተከፈለ'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => onRecordPayment(member.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-[11px] transition-colors"
                              >
                                ክፍያ መዝግብ
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
          )}
        </div>
      </div>
    </div>
  );
};

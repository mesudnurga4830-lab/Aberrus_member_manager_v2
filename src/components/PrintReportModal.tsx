/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Printer, Download, CheckCircle, AlertTriangle, Calendar, Layers, Check, Clock } from 'lucide-react';
import { Contribution, Member, Family, SettingsRates } from '../types';
import { getCurrentEthiopianDate, getEthiopianMonthName, ETHIOPIAN_MONTHS } from '../utils/ethiopianCalendar';
import { generateFinancialReportPdf } from '../utils/pdfGenerator';

interface PrintReportModalProps {
  contributions: Contribution[];
  members: Member[];
  families: Family[];
  settings: SettingsRates;
  selectedMonth: number;
  selectedYear: number;
  onClose: () => void;
}

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  contributions,
  members,
  families,
  settings,
  selectedMonth: initialMonth,
  selectedYear: initialYear,
  onClose,
}) => {
  // Allow user to switch month and year directly inside report modal
  const [currentMonth, setCurrentMonth] = useState<number>(initialMonth || 11);
  const [currentYear, setCurrentYear] = useState<number>(initialYear || 2018);
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [activeReportTab, setActiveReportTab] = useState<'both' | 'monthly' | 'generation'>('both');

  const currentDate = getCurrentEthiopianDate();
  const monthName = getEthiopianMonthName(currentMonth);

  // Filtered members by family if applicable
  const displayMembers = familyFilter === 'all'
    ? members
    : members.filter((m) => m.familyId === familyFilter);

  // 1. SEPARATE MONTHLY CONTRIBUTIONS (ወርሃዊ መዋጮ) FOR SELECTED MONTH (STRICT MONTH/YEAR)
  const monthlyContributions = contributions.filter(
    (c) =>
      c.type === 'ወርሃዊ' &&
      Number(c.month ?? c.ethiopianMonth) === currentMonth &&
      Number(c.year ?? c.ethiopianYear) === currentYear &&
      (familyFilter === 'all' || c.familyId === familyFilter)
  );

  const totalMonthlyCollected = monthlyContributions
    .filter((c) => {
      const st = String(c.status || '').toLowerCase();
      return st === 'ተከፍሏል' || st === 'paid' || st === 'ከፊል' || st === 'partial';
    })
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalMonthlyExpected = displayMembers.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
    return sum + (settings.monthlyRate[m.generation] || 0);
  }, 0);

  const paidMonthlyCount = displayMembers.filter((m) => {
    if (m.isMinor) return false;
    const c = monthlyContributions.find((con) => con.memberId === m.id);
    const st = String(c?.status || '').toLowerCase();
    return st === 'ተከፍሏል' || st === 'paid';
  }).length;

  const partialMonthlyCount = displayMembers.filter((m) => {
    if (m.isMinor) return false;
    const c = monthlyContributions.find((con) => con.memberId === m.id);
    const st = String(c?.status || '').toLowerCase();
    return st === 'ከፊል' || st === 'partial';
  }).length;

  const unpaidMonthlyCount = displayMembers.filter((m) => !m.isMinor).length - (paidMonthlyCount + partialMonthlyCount);
  const monthlyArrears = Math.max(totalMonthlyExpected - totalMonthlyCollected, 0);

  // 2. SEPARATE GENERATION CONTRIBUTIONS (የትውልድ መዋጮ)
  const allGenContributions = contributions.filter(
    (c) => c.type === 'ትውልድ' && (familyFilter === 'all' || c.familyId === familyFilter)
  );

  const genPaidThisMonth = allGenContributions
    .filter(
      (c) =>
        Number(c.ethiopianMonth) === currentMonth &&
        Number(c.ethiopianYear) === currentYear &&
        (c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    )
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalGenCollectedAllTime = allGenContributions
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalGenExpected = displayMembers.reduce((sum, m) => {
    if (m.isMinor || m.isSpouse) return sum;
    return sum + (settings.generationPayment[m.generation] || 500);
  }, 0);

  const genRemainingBalance = Math.max(totalGenExpected - totalGenCollectedAllTime, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    generateFinancialReportPdf({
      contributions,
      members,
      families,
      settings,
      selectedMonth: currentMonth,
      selectedYear: currentYear,
      familyFilterId: familyFilter === 'all' ? undefined : familyFilter,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200">
        {/* Modal Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3.5 border-b border-neutral-200 bg-neutral-50 shrink-0 gap-3">
          <div>
            <h3 className="font-extrabold text-neutral-900 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1B5E20]" />
              <span>የክፍያ ሪፖርት ማዘጋጃ (ወርሃዊ እና የትውልድ መዋጮ ለየብቻ)</span>
            </h3>
            <p className="text-xs text-neutral-500">
              የ{monthName} {currentYear} ዓ.ም የወርሃዊ እና የትውልድ መዋጮ ሰነድ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-neutral-700 whitespace-nowrap bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200">
              የክፍያ ወር (Contribution Month)፦
            </span>
            {/* Month Selector */}
            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              className="text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 font-bold text-neutral-800 cursor-pointer"
            >
              {ETHIOPIAN_MONTHS.map((m) => (
                <option key={m.number} value={m.number}>
                  {m.number}ኛ ወር = {m.amharic}
                </option>
              ))}
            </select>

            {/* Year Selector */}
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 font-bold text-neutral-800 font-mono cursor-pointer"
            >
              <option value={2018}>2018 ዓ.ም</option>
              <option value={2019}>2019 ዓ.ም</option>
            </select>

            {/* Family Filter */}
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              className="text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800"
            >
              <option value="all">ሁሉም ቤተሰቦች</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.familyName} ({f.headName})
                </option>
              ))}
            </select>

            {/* PDF and Print Action Buttons */}
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFD700] hover:bg-amber-400 text-neutral-900 font-bold text-xs transition-colors shadow-xs cursor-pointer"
              title="ሪፖርቱን ወደ PDF ቀይረህ ሴቭ አድርግ"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF አውርድ</span>
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B5E20] text-white font-bold text-xs hover:bg-[#154a19] transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>አትም</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Mode Filter Tabs */}
        <div className="bg-neutral-100 px-6 py-2 border-b border-neutral-200 flex items-center justify-between text-xs">
          <div className="inline-flex rounded-lg border border-neutral-300 p-0.5 bg-white">
            <button
              onClick={() => setActiveReportTab('both')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                activeReportTab === 'both' ? 'bg-[#1B5E20] text-white' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              📋 ሁለቱም ሪፖርቶች (ወርሃዊ + መዋጮ)
            </button>
            <button
              onClick={() => setActiveReportTab('monthly')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                activeReportTab === 'monthly' ? 'bg-[#1B5E20] text-white' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              📅 ክፍል 1፦ ወርሃዊ መዋጮ ብቻ
            </button>
            <button
              onClick={() => setActiveReportTab('generation')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                activeReportTab === 'generation' ? 'bg-[#1B5E20] text-white' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              🏛️ ክፍል 2፦ የትውልድ መዋጮ ብቻ
            </button>
          </div>

          <span className="text-[11px] text-neutral-500">
            አባላት፡ <strong className="text-neutral-800">{displayMembers.length}</strong> | ቤተሰብ፡ {familyFilter === 'all' ? 'ሁሉም 25 ቤተሰቦች' : familyFilter}
          </span>
        </div>

        {/* Printable Document Area */}
        <div className="p-8 overflow-y-auto print:p-0 print:overflow-visible space-y-8 text-neutral-800" id="printable-report">
          {/* Header Letterhead */}
          <div className="flex items-center justify-between border-b-2 border-[#1B5E20] pb-4">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/abarrus_logo_emblem_1793040526236.jpg"
                alt="የአበሩስ አርማ"
                className="w-14 h-14 rounded-full ring-2 ring-[#FFD700] object-cover"
                referrerPolicy="no-referrer"
              />
              <div>
                <h1 className="text-lg font-extrabold text-[#1B5E20] tracking-tight">
                  የአበሩስ ቤተሰብ አንድነት ማህበር (አሲያ መስኡድ አፕ)
                </h1>
                <h2 className="text-xs font-semibold text-neutral-600 tracking-wider">
                  Abarrus Unity Association - Monthly & Generation Financial Statement
                </h2>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  የክፍያ መነሻ ወቅት፡ {settings.associationInfo?.paymentStartDate || 'ሀምሌ 01፣ 2018 ዓ.ም'} (ጳጉሜን የለም)
                </p>
              </div>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p className="font-bold text-neutral-900">ቀን፡ {currentDate.formatted}</p>
              <p className="text-neutral-500 font-mono text-[11px]">ሪፖርት ወቅት፡ {monthName} {currentYear} ዓ.ም</p>
              <p className="text-emerald-900 font-semibold font-mono text-[11px]">CBE፡ 1000778285146</p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 1: MONTHLY CONTRIBUTIONS REPORT (ክፍል 1፦ ወርሃዊ መዋጮ) */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {(activeReportTab === 'both' || activeReportTab === 'monthly') && (
            <div className="space-y-4 rounded-xl border border-emerald-200 bg-white p-5 shadow-xs">
              <div className="bg-[#1B5E20] text-white p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#FFD700]" />
                  <h2 className="text-sm font-bold">
                    ክፍል 1፦ የ{monthName} {currentYear} ዓ.ም የወርሃዊ መዋጮ ሪፖርት (Monthly Contributions)
                  </h2>
                </div>
                <span className="text-[11px] bg-white/20 px-2.5 py-0.5 rounded font-mono font-bold">
                  ተመን፡ 3ኛ=50 | 4ኛ=50 | 5ኛ=50 | 6ኛ=50 ብር
                </span>
              </div>

              {/* Monthly KPI Cards */}
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                  <p className="text-neutral-500 font-medium">የሚጠበቅ ወርሃዊ ገቢ</p>
                  <p className="text-base font-bold text-neutral-900 font-mono mt-0.5 tabular-nums">
                    {totalMonthlyExpected.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">ከ{displayMembers.filter((m) => !m.isMinor).length} አባላት</p>
                </div>
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <p className="text-emerald-800 font-medium">የተሰበሰበ ወርሃዊ ገቢ</p>
                  <p className="text-base font-bold text-[#1B5E20] font-mono mt-0.5 tabular-nums">
                    {totalMonthlyCollected.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">{paidMonthlyCount} አባላት ሙሉ ከፍለዋል</p>
                </div>
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="text-amber-800 font-medium">ያልተሰበሰበ ወርሃዊ ቀሪ</p>
                  <p className="text-base font-bold text-amber-900 font-mono mt-0.5 tabular-nums">
                    {monthlyArrears.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">{unpaidMonthlyCount} አባላት ያልከፈሉ</p>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                  <p className="text-neutral-500 font-medium">ከፊል የከፈሉ</p>
                  <p className="text-base font-bold text-neutral-800 font-mono mt-0.5 tabular-nums">
                    {partialMonthlyCount} አባላት
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">የከፊል ክፍያ የተመዘገበላቸው</p>
                </div>
              </div>

              {/* Monthly Contributions Table */}
              <div className="border border-neutral-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">የአባል ID</th>
                      <th className="py-2 px-3">የአባል ሙሉ ስም</th>
                      <th className="py-2 px-3">ትውልድ</th>
                      <th className="py-2 px-3">ቤተሰብ</th>
                      <th className="py-2 px-3 text-right">የወርሃዊ ተመን</th>
                      <th className="py-2 px-3 text-right">የተከፈለ መጠን</th>
                      <th className="py-2 px-3 text-right">ቀሪ እዳ</th>
                      <th className="py-2 px-3">ሁኔታ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {displayMembers.map((m) => {
                      const con = monthlyContributions.find((c) => c.memberId === m.id);
                      const standardRate = m.isMinor
                        ? 0
                        : m.isSpouse
                        ? settings.spouseMonthlyRate || 100
                        : settings.monthlyRate[m.generation] || 50;

                      const paidAmt = con?.paidAmount || 0;
                      const remaining = Math.max(0, standardRate - paidAmt);
                      const isPaid = con?.status === 'ተከፍሏል' || (standardRate > 0 && paidAmt >= standardRate);
                      const isPartial = con?.status === 'ከፊል' || (paidAmt > 0 && paidAmt < standardRate);

                      return (
                        <tr key={`m-${m.id}`} className="hover:bg-neutral-50">
                          <td className="py-1.5 px-3 font-mono font-bold text-neutral-600">{m.id}</td>
                          <td className="py-1.5 px-3 font-medium text-neutral-900">{m.fullName}</td>
                          <td className="py-1.5 px-3 text-neutral-600">{m.isSpouse ? 'የትዳር አጋር' : `${m.generation}ኛ`}</td>
                          <td className="py-1.5 px-3 text-neutral-600">{m.familyName}</td>
                          <td className="py-1.5 px-3 font-mono text-right text-neutral-600">{standardRate} ብር</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-right text-[#1B5E20]">{paidAmt} ብር</td>
                          <td className="py-1.5 px-3 font-mono text-right text-amber-900">{remaining} ብር</td>
                          <td className="py-1.5 px-3">
                            {m.isMinor ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-500">
                                ነጻ (ህጻን)
                              </span>
                            ) : isPaid ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-[#1B5E20]">
                                ተከፍሏል
                              </span>
                            ) : isPartial ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                ከፊል
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                                ያልተከፈለ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-neutral-100 font-bold border-t border-neutral-300">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-neutral-900">ጠቅላላ የወርሃዊ መዋጮ ድምር፦</td>
                      <td className="py-2 px-3 text-right font-mono">{totalMonthlyExpected.toLocaleString()} ብር</td>
                      <td className="py-2 px-3 text-right font-mono text-[#1B5E20]">{totalMonthlyCollected.toLocaleString()} ብር</td>
                      <td className="py-2 px-3 text-right font-mono text-red-800">{monthlyArrears.toLocaleString()} ብር</td>
                      <td className="py-2 px-3 text-neutral-600 text-[11px]">{paidMonthlyCount} የከፈሉ</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 2: GENERATION CONTRIBUTIONS REPORT (ክፍል 2፦ የትውልድ መዋጮ) */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {(activeReportTab === 'both' || activeReportTab === 'generation') && (
            <div className="space-y-4 rounded-xl border border-amber-300 bg-white p-5 shadow-xs">
              <div className="bg-[#FFD700] text-neutral-900 p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-900" />
                  <h2 className="text-sm font-extrabold text-neutral-900">
                    ክፍል 2፦ የትውልድ መዋጮ ሪፖርት (Generation Contributions)
                  </h2>
                </div>
                <span className="text-[11px] bg-white/70 px-2.5 py-0.5 rounded font-mono font-bold text-neutral-900">
                  ተመን፡ 3ኛ=5000 | 4ኛ=1000 | 5ኛ=500 | 6ኛ=250 ብር
                </span>
              </div>

              {/* Generation KPI Cards */}
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                  <p className="text-neutral-500 font-medium">ጠቅላላ የሚጠበቅ የትውልድ መዋጮ</p>
                  <p className="text-base font-bold text-neutral-900 font-mono mt-0.5 tabular-nums">
                    {totalGenExpected.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">የሁሉም አባላት ድምር ተመን</p>
                </div>
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <p className="text-emerald-800 font-medium">እስካሁን የተሰበሰበ ጠቅላላ</p>
                  <p className="text-base font-bold text-[#1B5E20] font-mono mt-0.5 tabular-nums">
                    {totalGenCollectedAllTime.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">የተጠናቀቀ እና ከፊል ገቢ</p>
                </div>
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="text-amber-800 font-medium">በ{monthName} ወር የተከፈለ</p>
                  <p className="text-base font-bold text-amber-900 font-mono mt-0.5 tabular-nums">
                    {genPaidThisMonth.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">ለዚህ ወር የተመዘገበ ክፍፍል</p>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                  <p className="text-neutral-500 font-medium">ቀሪ ያልተጠናቀቀ እዳ</p>
                  <p className="text-base font-bold text-neutral-800 font-mono mt-0.5 tabular-nums">
                    {genRemainingBalance.toLocaleString()} ብር
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">በየወሩ የሚከፋፈል ቀሪ</p>
                </div>
              </div>

              {/* Generation Contributions Table */}
              <div className="border border-neutral-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-amber-50/80 text-neutral-800 font-bold border-b border-neutral-200 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">የአባል ID</th>
                      <th className="py-2 px-3">የአባል ሙሉ ስም</th>
                      <th className="py-2 px-3">ትውልድ</th>
                      <th className="py-2 px-3">ቤተሰብ</th>
                      <th className="py-2 px-3 text-right">የትውልድ ተመን</th>
                      <th className="py-2 px-3 text-right">በ{monthName} የተከፈለ</th>
                      <th className="py-2 px-3 text-right">ጠቅላላ የተከፈለ</th>
                      <th className="py-2 px-3 text-right">ቀሪ እዳ</th>
                      <th className="py-2 px-3">ሁኔታ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {displayMembers.map((m) => {
                      const targetRate = m.isMinor || m.isSpouse
                        ? 0
                        : settings.generationPayment[m.generation] || 500;

                      const memberGenDocs = allGenContributions.filter((c) => c.memberId === m.id);
                      const totalPaidMem = memberGenDocs
                        .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
                        .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

                      const monthPaidMem = memberGenDocs
                        .filter(
                          (c) =>
                            Number(c.ethiopianMonth) === currentMonth &&
                            Number(c.ethiopianYear) === currentYear &&
                            (c.status === 'ተከፍሏል' || c.status === 'ከፊል')
                        )
                        .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

                      const remaining = Math.max(0, targetRate - totalPaidMem);
                      const isComplete = targetRate > 0 && totalPaidMem >= targetRate;
                      const isPartial = totalPaidMem > 0 && totalPaidMem < targetRate;

                      return (
                        <tr key={`g-${m.id}`} className="hover:bg-neutral-50">
                          <td className="py-1.5 px-3 font-mono font-bold text-neutral-600">{m.id}</td>
                          <td className="py-1.5 px-3 font-medium text-neutral-900">{m.fullName}</td>
                          <td className="py-1.5 px-3 text-neutral-600">{m.isSpouse ? 'የትዳር አጋር' : `${m.generation}ኛ`}</td>
                          <td className="py-1.5 px-3 text-neutral-600">{m.familyName}</td>
                          <td className="py-1.5 px-3 font-mono text-right text-neutral-700">{targetRate} ብር</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-right text-amber-900">{monthPaidMem} ብር</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-right text-[#1B5E20]">{totalPaidMem} ብር</td>
                          <td className="py-1.5 px-3 font-mono text-right text-neutral-600">{remaining} ብር</td>
                          <td className="py-1.5 px-3">
                            {m.isMinor || m.isSpouse ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-500">
                                ነጻ
                              </span>
                            ) : isComplete ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-[#1B5E20]">
                                ሙሉ ተከፍሏል
                              </span>
                            ) : isPartial ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                በከፊል ({totalPaidMem} ብር)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600">
                                ያልተከፈለ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-amber-50 font-bold border-t border-neutral-300">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-neutral-900">ጠቅላላ የትውልድ መዋጮ ድምር፦</td>
                      <td className="py-2 px-3 text-right font-mono">{totalGenExpected.toLocaleString()} ብር</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-900">{genPaidThisMonth.toLocaleString()} ብር</td>
                      <td className="py-2 px-3 text-right font-mono text-[#1B5E20]">{totalGenCollectedAllTime.toLocaleString()} ብር</td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-700">{genRemainingBalance.toLocaleString()} ብር</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Official Signatures */}
          <div className="pt-6 grid grid-cols-2 gap-8 text-xs border-t border-neutral-200">
            <div>
              <p className="font-semibold text-neutral-900">ያዘጋጀው / የሂሳብ ሀላፊ፡</p>
              <div className="h-10 border-b border-dashed border-neutral-400 mt-2"></div>
              <p className="text-neutral-500 mt-1">ስም እና ፊርማ</p>
            </div>
            <div>
              <p className="font-semibold text-neutral-900">ያረጋገጠው / ዋና አስተዳዳሪ፡</p>
              <div className="h-10 border-b border-dashed border-neutral-400 mt-2"></div>
              <p className="text-neutral-500 mt-1">ስም፣ ፊርማ እና ማህተም</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

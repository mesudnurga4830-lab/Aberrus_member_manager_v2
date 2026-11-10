/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Member, Family, Contribution, SettingsRates } from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName } from '../utils/ethiopianCalendar';
import {
  AlertTriangle,
  Send,
  Phone,
  Search,
  CheckCircle2,
  Filter,
  CreditCard,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';

interface UnpaidReportProps {
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  onRecordPayment: (memberId: string) => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
}

export const UnpaidReport: React.FC<UnpaidReportProps> = ({
  members,
  families,
  contributions,
  settings,
  onRecordPayment,
  onOpenPaymentManager,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(11); // Default to Hamle (ሀምሌ)
  const [selectedYear, setSelectedYear] = useState<number>(2018);
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const monthName = getEthiopianMonthName(selectedMonth);

  // Month paid members set - case-insensitive and number-coerced matching
  const paidMemberIds = new Set(
    contributions
      .filter((c) => {
        const m = Number(c.ethiopianMonth ?? (c as any).month);
        const y = Number(c.ethiopianYear ?? (c as any).year);
        if (m !== selectedMonth || y !== selectedYear) return false;
        const typeStr = String(c.type || '').trim().toLowerCase();
        const isMonthly = !c.type || typeStr === 'ወርሃዊ' || typeStr === 'monthly' || typeStr.includes('month');
        if (!isMonthly) return false;
        const statusStr = String(c.status || '').trim().toLowerCase();
        return statusStr === 'ተከፍሏል' || statusStr === 'paid' || statusStr === 'completed' || statusStr === 'approved';
      })
      .map((c) => String(c.memberId).trim())
  );

  const partialContributions = new Map(
    contributions
      .filter((c) => {
        const m = Number(c.ethiopianMonth ?? (c as any).month);
        const y = Number(c.ethiopianYear ?? (c as any).year);
        if (m !== selectedMonth || y !== selectedYear) return false;
        const typeStr = String(c.type || '').trim().toLowerCase();
        const isMonthly = !c.type || typeStr === 'ወርሃዊ' || typeStr === 'monthly' || typeStr.includes('month');
        if (!isMonthly) return false;
        const statusStr = String(c.status || '').trim().toLowerCase();
        return statusStr === 'ከፊል' || statusStr === 'partial';
      })
      .map((c) => [String(c.memberId).trim(), c])
  );

  // Find all members who haven't paid or have partial
  const unpaidMembers = members.filter((member) => {
    if (paidMemberIds.has(member.id)) return false;

    if (selectedFamilyFilter !== 'all' && member.familyId !== selectedFamilyFilter) {
      return false;
    }

    if (
      searchQuery &&
      !member.fullName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !member.familyName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !member.id.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  // Total unpaid calculation
  const totalArrears = unpaidMembers.reduce((sum, m) => {
    const partial = partialContributions.get(m.id);
    const standardRate = settings.monthlyRate[m.generation] || 50;
    if (partial) {
      return sum + (standardRate - (partial.paidAmount || 0));
    }
    return sum + standardRate;
  }, 0);

  const composeReminderForHead = (fam: Family, unpaids: Member[]) => {
    const names = unpaids.slice(0, 3).map((m) => m.fullName).join('፣ ');
    const more = unpaids.length > 3 ? ` እና ሌሎች ${unpaids.length - 3} አባላት` : '';
    return `ሰላም ${fam.headName}፤ ከአበሩስ ቤተሰብ ማህበር። የ${monthName} ወር መዋጮ ያልከፈሉ የቤተሰብዎ አባላት (${names}${more}) ይገኛሉ። እባክዎ በአፋጣኝ እንዲከፍሉ ያሳስቡልን። እናመሰግናለን!`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold">
              ያልተከፈሉ ዝርዝር (Arrears & Delinquency)
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-xs text-neutral-500">የአበሩስ ቤተሰብ መዋጮ ክትትል</span>
          </div>
          <h2 className="text-lg font-bold text-neutral-900 mt-1">
            የ{monthName} {selectedYear} ዓ.ም ያልተከፈሉ መዋጮዎች
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            የመክፈያ ቀነ-ገደብ (ቀን 5) ያለፈባቸው እና ክፍያ ያልተመዘገበላቸው አባላት
          </p>
        </div>

        {/* Month & Year Selectors with Strict Contribution Month Label */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-neutral-700 whitespace-nowrap bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200">
            የክፍያ ወር (Contribution Month)፦
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/40"
          >
            {ETHIOPIAN_MONTHS.map((m) => (
              <option key={m.number} value={m.number}>
                ወር {m.number} = {m.amharic}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/40 font-mono"
          >
            <option value={2018}>2018 ዓ.ም</option>
            <option value={2019}>2019 ዓ.ም</option>
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50/70 border border-red-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-red-900 text-xs font-semibold">
            <span>ያልተከፈለ አጠቃላይ ገንዘብ</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-extrabold text-red-950 font-mono mt-2 tabular-nums">
            {totalArrears.toLocaleString()} ብር
          </p>
          <p className="text-[11px] text-red-700 mt-1">ለ{monthName} ወር መሰብሰብ ያለበት ቀሪ</p>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-amber-900 text-xs font-semibold">
            <span>ያልከፈሉ አባላት ብዛት</span>
            <span className="text-[11px] font-mono bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded font-bold">
              {unpaidMembers.length}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-amber-950 font-mono mt-2 tabular-nums">
            {unpaidMembers.length} አባላት
          </p>
          <p className="text-[11px] text-amber-700 mt-1">ከጠቅላላ {members.length} አባላት ውስጥ</p>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-emerald-900 text-xs font-semibold">
            <span>የተከፈለባቸው አባላት</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-950 font-mono mt-2 tabular-nums">
            {paidMemberIds.size} አባላት
          </p>
          <p className="text-[11px] text-emerald-700 mt-1">
            {members.length > 0 ? Math.round((paidMemberIds.size / members.length) * 100) : 0}% ተከፍሏል
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="አባል፣ ID ወይም ቤተሰብ ፈልግ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-neutral-600 whitespace-nowrap">ቤተሰብ፡</label>
          <select
            value={selectedFamilyFilter}
            onChange={(e) => setSelectedFamilyFilter(e.target.value)}
            className="text-xs bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800"
          >
            <option value="all">ሁሉም 25 ቤተሰቦች</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} · {f.familyName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Unpaid Members Table */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4">የአባል ID</th>
                <th className="py-3 px-4">ሙሉ ስም</th>
                <th className="py-3 px-4">ትውልድ</th>
                <th className="py-3 px-4">ቤተሰብ & ወኪል</th>
                <th className="py-3 px-4 text-right">ያልተከፈለ መጠን</th>
                <th className="py-3 px-4">ሁኔታ</th>
                <th className="py-3 px-4 text-right">ፈጣን ተግባር</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {unpaidMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400 italic">
                    እንኳን ደስ ያለዎት! ለ{monthName} ወር ያልተከፈለ መዋጮ የለም።
                  </td>
                </tr>
              ) : (
                unpaidMembers.map((member) => {
                  const partial = partialContributions.get(member.id);
                  const standardRate = settings.monthlyRate[member.generation] || 50;
                  const dueAmount = partial ? standardRate - (partial.paidAmount || 0) : standardRate;
                  const fam = families.find((f) => f.id === member.familyId);

                  return (
                    <tr key={member.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-neutral-600">{member.id}</td>
                      <td className="py-3 px-4 font-bold text-neutral-900">{member.fullName}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-medium">
                          {member.generation}ኛ ትውልድ
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-semibold text-neutral-900">{member.familyName}</p>
                          <p className="text-[11px] text-neutral-500">ወኪል፡ {fam?.headName}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-red-700 tabular-nums">
                        {dueAmount} ብር
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            partial ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {partial ? 'ከፊል ተከፍሏል' : 'ያልተከፈለ'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {fam?.telegram && (
                            <a
                              href={`https://t.me/${fam.telegram.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="ለወኪሉ በTelegram አሳስብ"
                              className="p-1.5 rounded-lg bg-[#229ED9]/10 text-[#229ED9] hover:bg-[#229ED9] hover:text-white transition-colors"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {onOpenPaymentManager && (
                            <button
                              onClick={() => onOpenPaymentManager(member.id, 'list')}
                              className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                              title="የዚህን አባል ክፍያዎች ተመልከት፣ ሰርዝ ወይም አዲስ መዝግብ"
                            >
                              <CreditCard className="w-3 h-3 text-emerald-800" />
                              <span>ክፍያዎች</span>
                            </button>
                          )}
                          <button
                            onClick={() => onRecordPayment(member.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            ክፍያ መዝግብ
                          </button>
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
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Family, Member, Contribution, SettingsRates, GenerationNumber } from '../types';
import { Users, GitFork, Crown, QrCode, Phone, Send, Search, CheckCircle2, ChevronRight, CreditCard, Plus } from 'lucide-react';

interface FamilyTreeViewProps {
  families: Family[];
  members: Member[];
  contributions: Contribution[];
  settings: SettingsRates;
  onOpenQR: (member: Member) => void;
  onRecordPayment: (memberId: string) => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
}

export const FamilyTreeView: React.FC<FamilyTreeViewProps> = ({
  families,
  members,
  contributions,
  settings,
  onOpenQR,
  onRecordPayment,
  onOpenPaymentManager,
}) => {
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(families[0]?.id || 'FA001');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentFamily = families.find((f) => f.id === selectedFamilyId) || families[0];
  const familyMembers = members.filter((m) => m.familyId === selectedFamilyId);

  // Group family members by generation
  const membersByGen: Record<GenerationNumber, Member[]> = {
    3: familyMembers.filter((m) => m.generation === 3),
    4: familyMembers.filter((m) => m.generation === 4),
    5: familyMembers.filter((m) => m.generation === 5),
    6: familyMembers.filter((m) => m.generation === 6),
  };

  const familyHead = familyMembers.find((m) => m.isHead) || familyMembers[0];

  // Financial summary for this family
  const familyContributions = contributions.filter((c) => c.familyId === selectedFamilyId);
  const totalPaidByFamily = familyContributions
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  // Filtered families list for quick sidebar/dropdown
  const filteredFamilies = families.filter(
    (f) =>
      f.familyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.headName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <GitFork className="w-5 h-5 text-emerald-800" />
            <span>የቤተሰብ ዛፍ ማሳያ (Family Tree Hierarchy)</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            የ25ቱ ቤተሰቦች የትውልድ ቅደም ተከተል (3ኛ፣ 4ኛ፣ 5ኛ እና 6ኛ ትውልዶች)
          </p>
        </div>

        {/* Quick Family Switcher and Payment Ledger */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenPaymentManager && (
            <button
              type="button"
              onClick={() => onOpenPaymentManager(undefined, 'list')}
              className="px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="የአባላት የክፍያዎች መዝገብ፣ ክፍያ መመዝገብ ወይም መሰረዝ"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>የክፍያዎች መዝገብ</span>
            </button>
          )}
          <label className="text-xs font-semibold text-neutral-600 whitespace-nowrap">ቤተሰብ ይምረጡ፡</label>
          <select
            value={selectedFamilyId}
            onChange={(e) => setSelectedFamilyId(e.target.value)}
            className="text-xs font-medium bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-neutral-800 focus:ring-2 focus:ring-emerald-700/40"
          >
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} · {f.familyName} ({f.headName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Family Tree Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: 25 Families Directory */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-4 shadow-xs flex flex-col h-[650px]">
          <div className="pb-3 border-b border-neutral-200">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ቤተሰብ ወይም ወኪል ይፈልጉ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700"
              />
            </div>
            <p className="text-[11px] text-neutral-400 mt-2 px-1">
              ጠቅላላ ቤተሰቦች ({filteredFamilies.length} ከ {families.length})
            </p>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-neutral-100 mt-2 pr-1 space-y-1">
            {filteredFamilies.map((fam) => {
              const count = members.filter((m) => m.familyId === fam.id).length;
              const isSelected = fam.id === selectedFamilyId;
              return (
                <button
                  key={fam.id}
                  onClick={() => setSelectedFamilyId(fam.id)}
                  className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-emerald-900 text-white shadow-xs'
                      : 'hover:bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          isSelected ? 'bg-amber-400 text-emerald-950' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {fam.id}
                      </span>
                      <p className="text-xs font-bold truncate">{fam.familyName}</p>
                    </div>
                    <p className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-emerald-200' : 'text-neutral-500'}`}>
                      ወኪል፡ {fam.headName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                        isSelected ? 'bg-emerald-800 text-emerald-100' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {count} አባላት
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Visual Tree View for Selected Family */}
        <div className="lg:col-span-3 space-y-6">
          {/* Family Banner Card */}
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-950 text-white rounded-2xl p-6 shadow-md border border-emerald-800/40 relative overflow-hidden">
            {/* Background filigree accent */}
            <div className="absolute right-4 top-2 opacity-10 pointer-events-none">
              <Users className="w-48 h-48 text-amber-300" />
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center font-extrabold text-xl shadow-inner shrink-0">
                  {currentFamily.id.replace('FA', '')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-800 text-amber-300 font-bold">
                      {currentFamily.id}
                    </span>
                    <h3 className="text-xl font-extrabold text-white tracking-tight">
                      የ{currentFamily.familyName} ቤተሰብ
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-200 mt-1 flex items-center gap-3">
                    <span>ጠቅላላ አባላት፡ <strong className="text-white">{familyMembers.length}</strong></span>
                    <span>·</span>
                    <span>የተሰበሰበ መዋጮ፡ <strong className="text-amber-300 font-mono tabular-nums">{totalPaidByFamily.toLocaleString()} ብር</strong></span>
                  </p>
                </div>
              </div>

              {/* Family Head Card Snippet */}
              <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-xl p-3 sm:max-w-xs">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>የቤተሰብ ወኪል (Family Head)</span>
                </div>
                <p className="text-sm font-bold text-white mt-0.5">{currentFamily.headName}</p>
                <div className="flex items-center gap-2 text-xs text-emerald-200 mt-1">
                  {currentFamily.phone && (
                    <a
                      href={`tel:${currentFamily.phone}`}
                      className="hover:text-white flex items-center gap-1 underline text-[11px]"
                    >
                      <Phone className="w-3 h-3" />
                      <span>{currentFamily.phone}</span>
                    </a>
                  )}
                  {currentFamily.telegram && (
                    <a
                      href={`https://t.me/${currentFamily.telegram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white flex items-center gap-1 text-[11px] bg-emerald-700/60 px-2 py-0.5 rounded text-amber-200"
                    >
                      <Send className="w-3 h-3" />
                      <span>{currentFamily.telegram}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tree Generations Display (3, 4, 5, 6) */}
          <div className="space-y-6">
            {([3, 4, 5, 6] as GenerationNumber[]).map((gen) => {
              const genList = membersByGen[gen];
              const monthlyRate = settings.monthlyRate[gen];
              const genPayment = settings.generationPayment[gen];

              return (
                <div key={gen} className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
                  {/* Generation Stage Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-100 gap-2 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center justify-center font-bold text-sm">
                        {gen}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900">
                          {gen}ኛ ትውልድ ({genList.length} አባላት)
                        </h4>
                        <p className="text-[11px] text-neutral-500">
                          ተመን፡ ወርሃዊ {monthlyRate} ብር · የትውልድ {genPayment} ብር
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {genList.length === 0 ? 'በዚህ ትውልድ አባል የለም' : `${genList.length} አባላት ተመዝግበዋል`}
                    </span>
                  </div>

                  {/* Members Cards in this generation */}
                  {genList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-400 italic bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                      በዚህ ቤተሰብ {gen}ኛ ትውልድ ውስጥ የተመዘገበ አባል የለም
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {genList.map((member) => {
                        const memberPaidCon = contributions.filter(
                          (c) => c.memberId === member.id && c.status === 'ተከፍሏል'
                        );
                        return (
                          <div
                            key={member.id}
                            className={`p-3.5 rounded-xl border transition-all relative ${
                              member.isHead
                                ? 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-300/60'
                                : 'border-neutral-200 bg-neutral-50/50 hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-900 font-bold text-xs shrink-0 overflow-hidden">
                                  {member.photo ? (
                                    <img src={member.photo} alt={member.fullName} className="w-full h-full object-cover" />
                                  ) : (
                                    member.fullName.charAt(0)
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <h5 className="text-xs font-bold text-neutral-900">{member.fullName}</h5>
                                    {member.isHead && (
                                      <span title="የቤተሰብ ወኪል">
                                        <Crown className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-neutral-500 font-mono mt-0.5">{member.id}</p>
                                </div>
                              </div>

                              <button
                                onClick={() => onOpenQR(member)}
                                title="QR Code አሳይ"
                                className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Member Details & Quick Action */}
                            <div className="mt-3 pt-2 border-t border-neutral-200/60 flex items-center justify-between text-[11px] gap-2">
                              <span className="text-neutral-500">
                                {memberPaidCon.length} ክፍያዎች
                              </span>
                              <div className="flex items-center gap-1.5">
                                {onOpenPaymentManager && (
                                  <button
                                    onClick={() => onOpenPaymentManager(member.id, 'list')}
                                    className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                    title="የዚህን አባል ክፍያዎች ተመልከት፣ ሰርዝ ወይም አዲስ መዝግብ"
                                  >
                                    <CreditCard className="w-3 h-3 text-emerald-800" />
                                    <span>ክፍያዎች</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => onRecordPayment(member.id)}
                                  className="text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
                                >
                                  መዝግብ →
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

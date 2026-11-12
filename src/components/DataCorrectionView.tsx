/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Wrench,
  Trash2,
  Edit2,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  ShieldAlert,
  Save,
  X,
  CreditCard,
  Users,
  Check,
} from 'lucide-react';
import { Contribution, Member, Family, SettingsRates, ContributionStatus } from '../types';
import {
  deleteContribution,
  updateContribution,
  updateMember,
  deleteMember,
  deduplicateAndCleanAllContributions,
  refreshAllDataFromServer,
  getEffectiveMonthlyRate,
  getEffectiveGenRate,
} from '../utils/storage';
import { getEthiopianMonthName, formatEthiopianCurrency } from '../utils/ethiopianCalendar';
import {
  deleteMemberFromFirestore,
  saveMemberToFirestore,
  normalizePhoneNumber,
  deleteContributionFromFirestore,
  saveContributionToFirestore,
} from '../firebase';

interface DataCorrectionViewProps {
  contributions: Contribution[];
  members: Member[];
  families: Family[];
  settings: SettingsRates;
  onRefreshData: () => void;
}

export const DataCorrectionView: React.FC<DataCorrectionViewProps> = ({
  contributions,
  members,
  families,
  settings,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'payments' | 'members' | 'tools'>('payments');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ወርሃዊ' | 'ትውልድ'>('all');
  const [yearFilter, setYearFilter] = useState<number>(0);

  // Deletion modal state
  const [contributionToDelete, setContributionToDelete] = useState<Contribution | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  // Edit Contribution Modal state
  const [contributionToEdit, setContributionToEdit] = useState<Contribution | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editMonth, setEditMonth] = useState<number>(11);
  const [editYear, setEditYear] = useState<number>(2018);
  const [editStatus, setEditStatus] = useState<ContributionStatus>('ተከፍሏል');
  const [editReceipt, setEditReceipt] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  // Edit Member Modal state
  const [memberToEdit, setMemberToEdit] = useState<Member | null>(null);
  const [editMemberName, setEditMemberName] = useState<string>('');
  const [editMemberPhone, setEditMemberPhone] = useState<string>('');
  const [editMemberTelegram, setEditMemberTelegram] = useState<string>('');
  const [editMemberFamilyId, setEditMemberFamilyId] = useState<string>('');
  const [editMemberGen, setEditMemberGen] = useState<number>(3);
  const [editMemberIsSpouse, setEditMemberIsSpouse] = useState<boolean>(false);
  const [editMemberIsMinor, setEditMemberIsMinor] = useState<boolean>(false);

  // Toast / feedback state
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Filtered Contributions
  const filteredContributions = contributions.filter((c) => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (yearFilter !== 0 && c.ethiopianYear !== yearFilter) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase().trim();
    return (
      c.memberName.toLowerCase().includes(q) ||
      c.memberId.toLowerCase().includes(q) ||
      c.familyId.toLowerCase().includes(q) ||
      (c.receiptNumber && c.receiptNumber.toLowerCase().includes(q)) ||
      (c.transactionRef && c.transactionRef.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  });

  // Filtered Members
  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      m.fullName.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.familyId.toLowerCase().includes(q) ||
      (m.phone && m.phone.includes(q))
    );
  });

  // Handle Delete Contribution (Local Storage + Firestore + API)
  const handleConfirmDeleteContribution = async () => {
    if (!contributionToDelete) return;
    const target = contributionToDelete;
    deleteContribution(target.id);
    setContributionToDelete(null);
    onRefreshData();
    showToast(`የደረሰኝ #${target.receiptNumber || target.id} ክፍያ በተሳካ ሁኔታ ተሰርዟል!`);
    try {
      await deleteContributionFromFirestore(target.id);
      onRefreshData();
    } catch (err) {
      console.error('Error deleting contribution from Firestore:', err);
    }
  };

  // Handle Open Edit Contribution
  const handleOpenEditContribution = (c: Contribution) => {
    setContributionToEdit(c);
    setEditAmount(c.paidAmount || c.amount || 0);
    setEditMonth(c.ethiopianMonth || 11);
    setEditYear(c.ethiopianYear || 2018);
    setEditStatus(c.status);
    setEditReceipt(c.receiptNumber || '');
    setEditNotes(c.notes || '');
  };

  // Handle Save Edit Contribution (Local Storage + Firestore)
  const handleSaveEditContribution = async () => {
    if (!contributionToEdit) return;
    const updated = updateContribution(contributionToEdit.id, {
      paidAmount: editAmount,
      amount: editAmount,
      ethiopianMonth: editMonth,
      ethiopianMonthName: getEthiopianMonthName(editMonth),
      ethiopianYear: editYear,
      status: editStatus,
      receiptNumber: editReceipt.trim() || contributionToEdit.receiptNumber,
      notes: editNotes.trim() || undefined,
    });
    setContributionToEdit(null);
    onRefreshData();
    showToast('የክፍያው መረጃ በተሳካ ሁኔታ ተስተካክሏል!');
    if (updated) {
      try {
        await saveContributionToFirestore(updated);
        onRefreshData();
      } catch (err) {
        console.error('Error saving updated contribution to Firestore:', err);
      }
    }
  };

  // Handle Open Edit Member
  const handleOpenEditMember = (m: Member) => {
    setMemberToEdit(m);
    setEditMemberName(m.fullName);
    setEditMemberPhone(m.phone || '');
    setEditMemberTelegram(m.telegram || '');
    setEditMemberFamilyId(m.familyId);
    setEditMemberGen(m.generation);
    setEditMemberIsSpouse(m.isSpouse || false);
    setEditMemberIsMinor(m.isMinor || false);
  };

  // Handle Save Edit Member
  const handleSaveEditMember = async () => {
    if (!memberToEdit) return;
    const targetFamily = families.find((f) => f.id === editMemberFamilyId);
    const cleanPhone = normalizePhoneNumber(editMemberPhone.trim());
    const updated = updateMember(memberToEdit.id, {
      fullName: editMemberName.trim(),
      phone: cleanPhone || undefined,
      telegram: editMemberTelegram.trim() || undefined,
      familyId: editMemberFamilyId,
      familyName: targetFamily?.familyName || memberToEdit.familyName,
      generation: editMemberGen as any,
      isSpouse: editMemberIsSpouse,
      isMinor: editMemberIsMinor,
    });
    setMemberToEdit(null);
    onRefreshData();
    showToast(`የአባል ${editMemberName} መረጃ በተሳካ ሁኔታ ተሻሽሏል!`);
    if (updated) {
      try {
        await saveMemberToFirestore(updated);
      } catch (err) {
        console.warn('[Firestore] Error saving edited member:', err);
      }
    }
  };

  // Handle Delete Member
  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;
    const targetId = memberToDelete.id;
    const targetName = memberToDelete.fullName;
    deleteMember(targetId);
    setMemberToDelete(null);
    onRefreshData();
    showToast(`አባል ${targetName} (${targetId}) በተሳካ ሁኔታ ተሰርዟል!`);
    try {
      await deleteMemberFromFirestore(targetId);
    } catch (err) {
      console.warn('[Firestore] Error deleting member in DataCorrectionView:', err);
    }
  };

  // Handle Deduplicate
  const handleCleanDuplicates = () => {
    const res = deduplicateAndCleanAllContributions();
    onRefreshData();
    if (res.removedCount > 0) {
      showToast(`ማጽዳት ተጠናቋል፡ ${res.removedCount} የተደገሙ መዋጮዎች ተወግደዋል!`);
    } else {
      showToast('ምንም አይነት የተባዛ መዋጮ አልተገኘም፤ ዳታው ንጹህ ነው!');
    }
  };

  // Handle Server Refresh
  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllDataFromServer();
    onRefreshData();
    setIsRefreshing(false);
    showToast('ሁሉም ክፍያዎች እና የአባላት መረጃዎች ከሰርቨር ጋር ታድሰዋል!');
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const data = {
      members,
      families,
      contributions,
      settings,
      exportDate: new Date().toISOString(),
      appName: 'Abarrus Unity Association',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Abarrus_Data_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('የማህበሩ ሙሉ ዳታ ባክአፕ ወደ መሳሪያዎ ወርዷል!');
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {feedbackMessage && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-700 animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0" />
          <span className="text-xs font-bold">{feedbackMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-emerald-950 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>የአድሚን ብቻ መቆጣጠሪያ</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              የመረጃ ማስተካከያ ክፍል (Data Management & Correction)
            </h1>
            <p className="text-xs sm:text-sm text-neutral-300">
              በስህተት የተመዘገቡ ክፍያዎችን ለመሰረዝ፣ አባላትን ለማስተካከል፣ እና ዳታን ከሰርቨር ጋር ለማመሳሰል
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCleanDuplicates}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors shadow-xs cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              <span>የተባዙ ክፍያዎችን አጽዳ</span>
            </button>
            <button
              onClick={handleForceRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>ክፍያ ሪፍሬሽ</span>
            </button>
            <button
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-colors border border-neutral-700 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>ዳታ ባክአፕ (JSON)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'payments'
              ? 'border-emerald-800 text-emerald-950 font-black'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>የክፍያዎች ማስተካከያና መሰረዣ ({contributions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'members'
              ? 'border-emerald-800 text-emerald-950 font-black'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>የአባላት መረጃ ማስተካከያ ({members.length})</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'payments'
                ? 'በአባል ስም፣ በደረሰኝ ቁጥር፣ በFamily ID ፈልግ...'
                : 'በአባል ስም፣ በስልክ ቁጥር፣ በID ፈልግ...'
            }
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-sans"
          />
          <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-2.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {activeTab === 'payments' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs bg-neutral-50 rounded-lg border border-neutral-300 font-bold"
            >
              <option value="all">ሁሉም ዓይነት</option>
              <option value="ወርሃዊ">ወርሃዊ መዋጮ</option>
              <option value="ትውልድ">የትውልድ መዋጮ</option>
            </select>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs bg-neutral-50 rounded-lg border border-neutral-300 font-bold"
            >
              <option value={0}>ሁሉም ዓመታት</option>
              <option value={2018}>2018 ዓ.ም</option>
              <option value={2019}>2019 ዓ.ም</option>
              <option value={2020}>2020 ዓ.ም</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: PAYMENTS CORRECTION & DELETION */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                  <th className="py-3 px-3">ደረሰኝ ቁጥር</th>
                  <th className="py-3 px-3">የአባል ስም</th>
                  <th className="py-3 px-3">ዓይነት</th>
                  <th className="py-3 px-3">ወር / ዓ.ም</th>
                  <th className="py-3 px-3">የተከፈለ መጠን</th>
                  <th className="py-3 px-3">ሁኔታ</th>
                  <th className="py-3 px-3">የከፈለበት ዘዴ</th>
                  <th className="py-3 px-3 text-right">እርምጃዎች</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredContributions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-neutral-500">
                      ምንም የተመዘገበ ክፍያ አልተገኘም
                    </td>
                  </tr>
                ) : (
                  filteredContributions.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-neutral-800">
                        {c.receiptNumber || c.id}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-neutral-900">
                        <div>{c.memberName}</div>
                        <div className="text-[10px] text-neutral-500">
                          {c.memberId} • {c.familyId}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.type === 'ወርሃዊ'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {c.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-neutral-800">
                        {c.ethiopianMonthName || (c.ethiopianMonth ? getEthiopianMonthName(c.ethiopianMonth) : '-')} {c.ethiopianYear || 2018} ዓ.ም
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-900">
                        {c.paidAmount || c.amount || 0} ብር
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status === 'ተከፍሏል'
                              ? 'bg-emerald-100 text-emerald-900'
                              : c.status === 'ከፊል'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 text-[11px]">
                        <div>{c.paymentMethod || 'CBE'}</div>
                        {c.transactionRef && (
                          <div className="font-mono text-[10px] text-neutral-500">
                            Ref: {c.transactionRef}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditContribution(c)}
                            className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors cursor-pointer"
                            title="ክፍያውን አስተካክል"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setContributionToDelete(c)}
                            className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors cursor-pointer"
                            title="ክፍያውን ሰርዝ (Delete)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MEMBERS CORRECTION */}
      {activeTab === 'members' && (
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                  <th className="py-3 px-3">መታወቂያ</th>
                  <th className="py-3 px-3">ሙሉ ስም</th>
                  <th className="py-3 px-3">ትውልድ</th>
                  <th className="py-3 px-3">የቤተሰብ መለያ</th>
                  <th className="py-3 px-3">ስልክ ቁጥር</th>
                  <th className="py-3 px-3">ሁኔታ</th>
                  <th className="py-3 px-3 text-right">እርምጃዎች</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-neutral-800">
                      {m.id}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-neutral-900">
                      {m.fullName}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-neutral-700">
                      {m.isSpouse ? 'የትዳር አጋር' : `${m.generation}ኛ ትውልድ`}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-600">
                      {m.familyId} ({m.familyName})
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-800">
                      {m.phone || '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      {m.isMinor ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                          ዕድሜ &lt; 18 (ነፃ)
                        </span>
                      ) : m.isSpouse ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                          የትዳር አጋር (100 ብር)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                          መደበኛ አባል
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditMember(m)}
                          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors cursor-pointer"
                          title="የአባሉን መረጃ አስተካክል"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setMemberToDelete(m)}
                          className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors cursor-pointer"
                          title="አባሉን ሰርዝ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONTRIBUTION CONFIRMATION */}
      {contributionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-neutral-900 text-base">ክፍያውን መሰረዝ ይፈልጋሉ?</h3>
                <p className="text-xs text-neutral-500">ይህ እርምጃ ክፍያውን ከመዝገብ ላይ ያጠፋል</p>
              </div>
            </div>

            <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs space-y-1.5 font-sans">
              <div>
                <span className="text-neutral-500">ደረሰኝ ቁጥር፡ </span>
                <span className="font-mono font-bold text-neutral-900">{contributionToDelete.receiptNumber || contributionToDelete.id}</span>
              </div>
              <div>
                <span className="text-neutral-500">የአባል ስም፡ </span>
                <span className="font-bold text-neutral-900">{contributionToDelete.memberName}</span>
              </div>
              <div>
                <span className="text-neutral-500">ዓይነትና ወር፡ </span>
                <span className="font-medium text-neutral-800">{contributionToDelete.type} • {contributionToDelete.ethiopianMonthName || ''} {contributionToDelete.ethiopianYear} ዓ.ም</span>
              </div>
              <div>
                <span className="text-neutral-500">የተከፈለ መጠን፡ </span>
                <span className="font-mono font-bold text-rose-700">{contributionToDelete.paidAmount || contributionToDelete.amount} ብር</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setContributionToDelete(null)}
                className="px-3.5 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs cursor-pointer"
              >
                ተመለስ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteContribution}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                አዎ፣ ሰርዘው (Delete)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT CONTRIBUTION */}
      {contributionToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-extrabold text-neutral-900 text-base">ክፍያ ማስተካከያ</h3>
                <p className="text-xs text-neutral-500">{contributionToEdit.memberName} ({contributionToEdit.receiptNumber || contributionToEdit.id})</p>
              </div>
              <button
                onClick={() => setContributionToEdit(null)}
                className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">የተከፈለ መጠን (ብር)፡</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">የክፍያ ወር፡</label>
                  <select
                    value={editMonth}
                    onChange={(e) => setEditMonth(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-bold"
                  >
                    {[11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => (
                      <option key={m} value={m}>
                        {getEthiopianMonthName(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">ዓመተ ምህረት፡</label>
                  <select
                    value={editYear}
                    onChange={(e) => setEditYear(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-bold"
                  >
                    <option value={2018}>2018 ዓ.ም</option>
                    <option value={2019}>2019 ዓ.ም</option>
                    <option value={2020}>2020 ዓ.ም</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">የክፍያ ሁኔታ (Status)፡</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-bold"
                >
                  <option value="ተከፍሏል">ተከፍሏል (Paid)</option>
                  <option value="ከፊል">ከፊል (Partial)</option>
                  <option value="ያልተከፈለ">ያልተከፈለ (Unpaid)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">ደረሰኝ ቁጥር፡</label>
                <input
                  type="text"
                  value={editReceipt}
                  onChange={(e) => setEditReceipt(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">ማስታወሻ (Notes)፡</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="ተጨማሪ ማስታወሻ..."
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-sans"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setContributionToEdit(null)}
                className="px-3.5 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs cursor-pointer"
              >
                ሰርዝ
              </button>
              <button
                type="button"
                onClick={handleSaveEditContribution}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                ለውጦቹን መዝግብ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT MEMBER */}
      {memberToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-extrabold text-neutral-900 text-base">የአባል መረጃ ማስተካከያ</h3>
                <p className="text-xs text-neutral-500">{memberToEdit.id} ({memberToEdit.fullName})</p>
              </div>
              <button
                onClick={() => setMemberToEdit(null)}
                className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">ሙሉ ስም፡</label>
                <input
                  type="text"
                  value={editMemberName}
                  onChange={(e) => setEditMemberName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">ስልክ ቁጥር፡</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={editMemberPhone}
                    onChange={(e) => setEditMemberPhone(e.target.value)}
                    placeholder="0911234567 ወይም +966..."
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">Telegram፡</label>
                  <input
                    type="text"
                    value={editMemberTelegram}
                    onChange={(e) => setEditMemberTelegram(e.target.value)}
                    placeholder="@username"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">ቤተሰብ (Family ID)፡</label>
                  <select
                    value={editMemberFamilyId}
                    onChange={(e) => setEditMemberFamilyId(e.target.value)}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-bold"
                  >
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id} - {f.familyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">ትውልድ (Generation)፡</label>
                  <select
                    value={editMemberGen}
                    onChange={(e) => setEditMemberGen(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-bold"
                  >
                    <option value={1}>1ኛ ትውልድ</option>
                    <option value={2}>2ኛ ትውልድ</option>
                    <option value={3}>3ኛ ትውልድ</option>
                    <option value={4}>4ኛ ትውልድ</option>
                  </select>
                </div>
              </div>

              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editMemberIsSpouse}
                    onChange={(e) => setEditMemberIsSpouse(e.target.checked)}
                    className="w-4 h-4 text-emerald-800 rounded border-neutral-300 focus:ring-emerald-700"
                  />
                  <span className="font-bold text-neutral-800">
                    የአባል የትዳር አጋር (Spouse - ወርሃዊ 100 ብር፣ ከትውልድ ክፍያ ነፃ)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editMemberIsMinor}
                    onChange={(e) => setEditMemberIsMinor(e.target.checked)}
                    className="w-4 h-4 text-emerald-800 rounded border-neutral-300 focus:ring-emerald-700"
                  />
                  <span className="font-bold text-neutral-800">
                    ዕድሜ ከ18 ዓመት በታች (Minor - ከወርሃዊና ከትውልድ ክፍያ ነፃ)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setMemberToEdit(null)}
                className="px-3.5 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs cursor-pointer"
              >
                ሰርዝ
              </button>
              <button
                type="button"
                onClick={handleSaveEditMember}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                የአባሉን ለውጦች መዝግብ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE MEMBER CONFIRMATION */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-neutral-900 text-base">አባሉን መሰረዝ ይፈልጋሉ?</h3>
                <p className="text-xs text-neutral-500">ይህ እርምጃ አባሉን ከዝርዝር ውስጥ ያጠፋል</p>
              </div>
            </div>

            <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs space-y-1.5 font-sans">
              <div>
                <span className="text-neutral-500">የአባል መታወቂያ፡ </span>
                <span className="font-mono font-bold text-neutral-900">{memberToDelete.id}</span>
              </div>
              <div>
                <span className="text-neutral-500">ሙሉ ስም፡ </span>
                <span className="font-bold text-neutral-900">{memberToDelete.fullName}</span>
              </div>
              <div>
                <span className="text-neutral-500">ቤተሰብ፡ </span>
                <span className="font-medium text-neutral-800">{memberToDelete.familyName} ({memberToDelete.familyId})</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-3.5 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs cursor-pointer"
              >
                ተመለስ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMember}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                አዎ፣ አባሉን ሰርዝ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

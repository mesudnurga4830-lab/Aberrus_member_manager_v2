/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  CreditCard,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  User,
  Building,
  Sparkles,
  ArrowLeft,
  FileText,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Member, Contribution, ContributionType, PaymentMethod, SettingsRates, Family } from '../types';
import { ETHIOPIAN_MONTHS, getEthiopianMonthName, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { getEffectiveMonthlyRate, getEffectiveGenRate } from '../utils/storage';

interface AdminMemberPaymentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  initialMemberId?: string;
  initialMode?: 'list' | 'add';
  onDeletePayment: (contributionId: string) => Promise<void>;
  onAddManualPayment: (payment: Omit<Contribution, 'id'>) => Promise<void>;
}

export const AdminMemberPaymentManagerModal: React.FC<AdminMemberPaymentManagerModalProps> = ({
  isOpen,
  onClose,
  members,
  families,
  contributions,
  settings,
  initialMemberId,
  initialMode = 'list',
  onDeletePayment,
  onAddManualPayment,
}) => {
  const currentDate = getCurrentEthiopianDate();
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    initialMemberId || (members[0]?.id ?? '')
  );
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const [activeView, setActiveView] = useState<'list' | 'add'>(initialMode);

  // Manual payment form state
  const [formType, setFormType] = useState<ContributionType>('ወርሃዊ');
  const [formMonth, setFormMonth] = useState<number>(currentDate.month || 11);
  const [formYear, setFormYear] = useState<number>(currentDate.year || 2018);
  const [formAmount, setFormAmount] = useState<string>('75');
  const [formMethod, setFormMethod] = useState<PaymentMethod>('ጥሬ ገንዘብ (Cash)');
  const [formRef, setFormRef] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<Contribution | null>(null);
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Selected member object
  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || members[0],
    [members, selectedMemberId]
  );

  // Update default amount when member or type changes
  React.useEffect(() => {
    if (!selectedMember) return;
    if (formType === 'ወርሃዊ') {
      const rate = getEffectiveMonthlyRate(selectedMember, settings);
      setFormAmount(String(rate));
    } else if (formType === 'ትውልድ') {
      const rate = getEffectiveGenRate(selectedMember, settings);
      setFormAmount(String(rate));
    } else {
      setFormAmount('100');
    }
  }, [selectedMember, formType, settings]);

  // All recorded payments for the selected member (excluding locally deleted)
  const memberPayments = useMemo(() => {
    if (!selectedMember) return [];
    return contributions
      .filter((c) => !locallyDeletedIds.includes(c.id))
      .filter((c) => c.memberId === selectedMember.id || c.beneficiaryId === selectedMember.id)
      .sort((a, b) => {
        const yA = Number(a.year ?? a.ethiopianYear ?? 0);
        const yB = Number(b.year ?? b.ethiopianYear ?? 0);
        if (yB !== yA) return yB - yA;
        const mA = Number(a.month ?? a.ethiopianMonth ?? 0);
        const mB = Number(b.month ?? b.ethiopianMonth ?? 0);
        return mB - mA;
      });
  }, [contributions, selectedMember, locallyDeletedIds]);

  // Total collected for this member
  const totalPaid = useMemo(() => {
    return memberPayments
      .filter((c) => c.status === 'Paid' || c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      .reduce((sum, c) => sum + Number(c.paidAmount || c.amount || 0), 0);
  }, [memberPayments]);

  // Filtered members for member selector dropdown/search
  const filteredMemberList = useMemo(() => {
    if (!memberSearchQuery.trim()) return members;
    const q = memberSearchQuery.toLowerCase().trim();
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)) ||
        m.familyName.toLowerCase().includes(q)
    );
  }, [members, memberSearchQuery]);

  if (!isOpen) return null;

  // Trigger Delete Confirmation Modal (no browser window.confirm!)
  const handleDeleteClick = (payment: Contribution) => {
    setPaymentToDelete(payment);
  };

  // Execute confirmed payment deletion
  const handleConfirmDelete = async () => {
    if (!paymentToDelete) return;
    const payment = paymentToDelete;

    try {
      setIsDeletingId(payment.id);
      // Optimistic instant UI update
      setLocallyDeletedIds((prev) => [...prev, payment.id]);
      await onDeletePayment(payment.id);
      setPaymentToDelete(null);
      setNotification({
        type: 'success',
        message: `የክፍያ መዝገብ "${payment.id}" (${payment.type}) ከዳታቤዝ በተሳካ ሁኔታ ተሰርዟል!`,
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error('Delete payment error:', err);
      // Revert optimistic removal on failure
      setLocallyDeletedIds((prev) => prev.filter((id) => id !== payment.id));
      setNotification({
        type: 'error',
        message: err.message || 'ክፍያውን መሰረዝ አልተቻለም። እባክዎ በድጋሚ ይሞክሩ።',
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  // Handle Submit Manual Payment
  const handleSubmitManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) {
      setNotification({ type: 'error', message: 'እባክዎ አባል ይምረጡ' });
      return;
    }

    const parsedAmount = Number(formAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setNotification({ type: 'error', message: 'እባክዎ ትክክለኛ የክፍያ መጠን ያስገቡ' });
      return;
    }

    const monthNum = formType === 'ትውልድ' ? 0 : Number(formMonth);
    const monthName = formType === 'ትውልድ' ? 'የትውልድ መዋጮ' : getEthiopianMonthName(monthNum);
    const yearNum = Number(formYear);

    setIsSubmitting(true);
    setNotification(null);

    try {
      const newPayment: Omit<Contribution, 'id'> = {
        memberId: selectedMember.id,
        memberName: selectedMember.fullName,
        familyId: selectedMember.familyId,
        familyName: selectedMember.familyName,
        generation: selectedMember.generation,
        type: formType,
        month: monthNum,
        year: yearNum,
        ethiopianMonth: monthNum,
        ethiopianMonthName: monthName,
        ethiopianYear: yearNum,
        amount: parsedAmount,
        paidAmount: parsedAmount,
        status: 'Paid', // Strict requirement: saved with status "Paid"
        paymentMethod: formMethod,
        transactionRef: formRef.trim() || `MANUAL-${Date.now().toString().slice(-6)}`,
        notes:
          formNotes.trim() ||
          `በአስተዳዳሪው በቀጥታ የተመዘገበ ኦፍላይን ክፍያ (Offline Manual Payment - ${monthName} ${yearNum})`,
        datePaid: new Date().toISOString(),
        recordedBy: 'Admin (መስኡድ ኑርጋ)',
      };

      await onAddManualPayment(newPayment);

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#1B5E20', '#FFD700', '#4CAF50'],
        });
      } catch {}

      setNotification({
        type: 'success',
        message: `ክፍያው በተሳካ ሁኔታ ተመዝግቧል! (የ${monthName} ${yearNum} ዓ.ም - ${parsedAmount} ብር Status: Paid)`,
      });

      // Reset optional inputs and return to list
      setFormRef('');
      setFormNotes('');
      setActiveView('list');
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      console.error('Add manual payment error:', err);
      setNotification({
        type: 'error',
        message: err.message || 'ክፍያውን መመዝገብ አልተቻለም። እባክዎ በድጋሚ ይሞክሩ።',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-200 bg-neutral-50 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-[#FFD700] flex items-center justify-center font-bold shadow-xs shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#FFD700]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-neutral-900 text-base sm:text-lg">
                  የአባላት ክፍያ ማኔጅመንት (Admin Payment Ledger)
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                የተመዘገቡ ክፍያዎችን መመልከት፣ ኦፍላይን ክፍያ መመዝገብ እና የተሳሳቱ መዝገቦችን መሰረዝ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {activeView === 'list' ? (
              <button
                type="button"
                onClick={() => setActiveView('add')}
                className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-[#FFD700] text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#FFD700]" />
                <span>ክፍያ መዝግብ (Add Manual)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveView('list')}
                className="px-3 py-1.5 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>ወደ ክፍያዎች ዝርዝር ተመለስ</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 transition-colors cursor-pointer"
              title="ዝጋ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast / Notification Banner */}
        {notification && (
          <div
            className={`px-5 py-3 text-xs font-semibold flex items-center gap-2.5 transition-all ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                : 'bg-red-50 text-red-900 border-b border-red-200'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Member Selection Strip */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-800" />
                <span>አባል ይምረጡ (Select Member)፡</span>
              </label>

              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="ስም፣ ስልክ ወይም ID ይፈልጉ..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="w-full text-xs bg-white border border-neutral-300 rounded-xl pl-8 pr-3 py-1.5 text-neutral-800 focus:ring-2 focus:ring-emerald-700 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Member Dropdown Picker */}
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-full text-xs font-bold bg-white border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
            >
              {filteredMemberList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} — {m.id} ({m.familyName} • {m.generation}ኛ ትውልድ {m.phone ? `• ${m.phone}` : ''})
                </option>
              ))}
            </select>

            {/* Selected Member Profile Preview */}
            {selectedMember && (
              <div className="flex flex-wrap items-center justify-between pt-2 border-t border-neutral-200/80 text-xs text-neutral-600 gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-900">{selectedMember.fullName}</span>
                  <span className="font-mono bg-neutral-200 px-1.5 py-0.5 rounded text-[11px] font-semibold text-neutral-700">
                    {selectedMember.id}
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-semibold">
                    {selectedMember.generation}ኛ ትውልድ
                  </span>
                  {selectedMember.isMinor && (
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-bold">
                      ዕድሜ &lt; 18 (ነጻ)
                    </span>
                  )}
                  {selectedMember.isSpouse && (
                    <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[11px] font-bold">
                      የትዳር አጋር
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] font-medium">
                  <span>ስልክ፦ <strong className="text-neutral-800 font-mono">{selectedMember.phone || '—'}</strong></span>
                  <span>ቤተሰብ፦ <strong className="text-neutral-800">{selectedMember.familyName}</strong></span>
                  <span>ጠቅላላ የተከፈለ፦ <strong className="text-emerald-800 font-mono font-bold">{totalPaid.toLocaleString()} ብር</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* VIEW 1: PAYMENTS LIST FOR SELECTED MEMBER */}
          {activeView === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-800" />
                    <span>የተመዘገቡ ክፍያዎች ዝርዝር ({memberPayments.length})</span>
                  </h4>
                  <p className="text-xs text-neutral-500">
                    ለዚህ አባል በሲስተሙ የተመዘገቡ ወርሃዊ እና የትውልድ ክፍያዎች
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveView('add')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-[#FFD700] text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#FFD700]" />
                  <span>አዲስ ክፍያ መዝግብ</span>
                </button>
              </div>

              {memberPayments.length === 0 ? (
                <div className="p-10 text-center rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-neutral-200 text-neutral-500 flex items-center justify-center mx-auto">
                    <Clock className="w-6 h-6" />
                  </div>
                  <h5 className="font-bold text-neutral-800 text-sm">
                    እስካሁን የተመዘገበ ክፍያ የለም
                  </h5>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    ለዚህ አባል እስካሁን የተመዘገበ የክፍያ መረጃ አልተገኘም። ከዚህ በታች ያለውን ቁልፍ በመጫን ኦፍላይን የተከፈለ ክፍያ መመዝገብ ይችላሉ።
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveView('add')}
                    className="mt-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-[#FFD700] text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>ክፍያ መዝግብ (Add Manual Payment)</span>
                  </button>
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-100/80 text-neutral-700 font-bold border-b border-neutral-200">
                        <tr>
                          <th className="py-3 px-3.5">የክፍያ አይነት</th>
                          <th className="py-3 px-3">የክፍያ ወርና ዓመት</th>
                          <th className="py-3 px-3 text-right">የተከፈለ መጠን</th>
                          <th className="py-3 px-3">የክፍያ ዘዴ</th>
                          <th className="py-3 px-3">ማጣቀሻ / ደረሰኝ</th>
                          <th className="py-3 px-3">ሁኔታ</th>
                          <th className="py-3 px-3 text-center">ተግባር (ሰርዝ)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200/80 bg-white">
                        {memberPayments.map((p) => {
                          const mNum = Number(p.month ?? p.ethiopianMonth ?? 0);
                          const yNum = Number(p.year ?? p.ethiopianYear ?? 2018);
                          const mName = p.ethiopianMonthName || (mNum > 0 ? getEthiopianMonthName(mNum) : 'የትውልድ መዋጮ');
                          const isPaidStatus = p.status === 'Paid' || p.status === 'ተከፍሏል';

                          return (
                            <tr key={p.id} className="hover:bg-neutral-50/80 transition-colors">
                              <td className="py-3 px-3.5 font-bold text-neutral-900">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      p.type === 'ትውልድ'
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                        : p.type === 'ልዩ'
                                        ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    }`}
                                  >
                                    {p.type}
                                  </span>
                                  <span className="font-mono text-[10px] text-neutral-400">
                                    {p.id}
                                  </span>
                                </div>
                              </td>

                              <td className="py-3 px-3 font-semibold text-neutral-800">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>
                                    {p.type === 'ትውልድ' ? 'የትውልድ መዋጮ' : `${mName} ${yNum} ዓ.ም`}
                                  </span>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-right font-mono font-bold text-emerald-900 tabular-nums">
                                {Number(p.paidAmount || p.amount || 0).toLocaleString()} ብር
                              </td>

                              <td className="py-3 px-3 text-neutral-600">
                                <span className="truncate max-w-[140px] block">
                                  {p.paymentMethod || 'ጥሬ ገንዘብ'}
                                </span>
                              </td>

                              <td className="py-3 px-3 font-mono text-[11px] text-neutral-500">
                                {p.transactionRef || p.receiptNumber || '—'}
                              </td>

                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isPaidStatus
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : p.status === 'ከፊል'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-neutral-100 text-neutral-700'
                                  }`}
                                >
                                  {isPaidStatus ? 'Paid (ተከፍሏል)' : p.status}
                                </span>
                              </td>

                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  disabled={isDeletingId === p.id}
                                  onClick={() => handleDeleteClick(p)}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-900 border border-red-200 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                  title="ይህን ክፍያ ሰርዝ"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                  <span>{isDeletingId === p.id ? 'በመሰረዝ ላይ...' : 'ሰርዝ'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: ADD MANUAL PAYMENT FORM */}
          {activeView === 'add' && (
            <div className="bg-white border-2 border-emerald-600/30 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-800" />
                  <h4 className="font-extrabold text-neutral-900 text-sm sm:text-base">
                    ኦፍላይን ክፍያ መዝግብ (Add Manual Offline Payment)
                  </h4>
                </div>
                <span className="text-xs text-neutral-500">
                  ሁኔታ፦ <strong className="text-emerald-800 font-bold">Paid</strong>
                </span>
              </div>

              <form onSubmit={handleSubmitManualPayment} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Contribution Type */}
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block mb-1">
                      የክፍያ አይነት (Contribution Type)፡
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as ContributionType)}
                      className="w-full text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
                    >
                      <option value="ወርሃዊ">ወርሃዊ መዋጮ (Monthly)</option>
                      <option value="ትውልድ">የትውልድ መዋጮ (Birth/Generation)</option>
                      <option value="ልዩ">ልዩ መዋጮ (Special Contribution)</option>
                    </select>
                  </div>

                  {/* Payment Amount */}
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block mb-1">
                      የተከፈለ መጠን በብር (Amount in ETB)፡
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        className="w-full text-xs font-mono font-bold bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 pr-12 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
                        placeholder="75"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-neutral-500 font-bold">
                        ብር
                      </span>
                    </div>
                  </div>

                  {/* Contribution Month (Strict 1-12) */}
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block mb-1">
                      የክፍያ ወር (Contribution Month)፡
                    </label>
                    <select
                      disabled={formType === 'ትውልድ'}
                      value={formMonth}
                      onChange={(e) => setFormMonth(Number(e.target.value))}
                      className="w-full text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700 disabled:opacity-50"
                    >
                      {ETHIOPIAN_MONTHS.map((m) => (
                        <option key={m.number} value={m.number}>
                          {m.number}ኛ ወር — {m.amharic}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-neutral-500 mt-1 block">
                      መዋጮው የሚታሰብበት ትክክለኛ ወር (1-12)
                    </span>
                  </div>

                  {/* Contribution Year */}
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block mb-1">
                      የክፍያ ዓመት (Contribution Year)፡
                    </label>
                    <select
                      value={formYear}
                      onChange={(e) => setFormYear(Number(e.target.value))}
                      className="w-full text-xs font-mono font-bold bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
                    >
                      <option value={2018}>2018 ዓ.ም</option>
                      <option value={2019}>2019 ዓ.ም</option>
                      <option value={2020}>2020 ዓ.ም</option>
                      <option value={2021}>2021 ዓ.ም</option>
                    </select>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block mb-1">
                      የክፍያ ዘዴ (Payment Method)፡
                    </label>
                    <select
                      value={formMethod}
                      onChange={(e) => setFormMethod(e.target.value as PaymentMethod)}
                      className="w-full text-xs bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
                    >
                      <option value="ጥሬ ገንዘብ (Cash)">ጥሬ ገንዘብ (Cash)</option>
                      <option value="የኢትዮጵያ ንግድ ባንክ (CBE)">የኢትዮጵያ ንግድ ባንክ (CBE)</option>
                      <option value="ቴሌብር (Telebirr)">ቴሌብር (Telebirr)</option>
                      <option value="አዋሽ ባንክ (Awash)">አዋሽ ባንክ (Awash)</option>
                      <option value="ሌላ">ሌላ (Other)</option>
                    </select>
                  </div>

                  {/* Reference / Receipt */}
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block mb-1">
                      ደረሰኝ ወይም ማጣቀሻ ቁጥር (Ref / Receipt #)፡
                    </label>
                    <input
                      type="text"
                      placeholder="ለምሳሌ፡ FT234567 ወይም REC-001"
                      value={formRef}
                      onChange={(e) => setFormRef(e.target.value)}
                      className="w-full text-xs font-mono bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-neutral-800 block mb-1">
                    ተጨማሪ ማስታወሻ (Notes - Optional)፡
                  </label>
                  <input
                    type="text"
                    placeholder="ለምሳሌ፡ በአካል በጥሬ ገንዘብ የተከፈለ"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full text-xs bg-neutral-50 border border-neutral-300 rounded-xl p-2.5 text-neutral-900 focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="pt-3 flex items-center justify-end gap-3 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setActiveView('list')}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                  >
                    ተመለስ
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-[#FFD700] text-xs font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>በመመዝገብ ላይ...</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-[#FFD700]" />
                        <span>ክፍያውን በ"Paid" ሁኔታ መዝግብ (Save Payment)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal Overlay (Eliminates browser window.confirm failure in iframe) */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-900">
                  የክፍያ መዝገብ ይሰረዝ? (Delete Payment)
                </h3>
                <p className="text-xs text-neutral-500">
                  በስህተት የተመዘገበ ክፍያን ከዳታቤዝ የመሰረዝ ማረጋገጫ
                </p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 space-y-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የአባል ስም፡</span>
                <span className="font-bold text-neutral-900">{paymentToDelete.memberName} ({paymentToDelete.memberId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የክፍያ ዓይነት፡</span>
                <span className="font-bold text-neutral-900">{paymentToDelete.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">ወር / ዓ.ም፡</span>
                <span className="font-semibold text-neutral-900">
                  {paymentToDelete.type === 'ትውልድ'
                    ? 'የትውልድ መዋጮ'
                    : `${paymentToDelete.ethiopianMonthName || paymentToDelete.month || ''} ${paymentToDelete.year || paymentToDelete.ethiopianYear || ''} ዓ.ም`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የተከፈለ መጠን፡</span>
                <span className="font-mono font-bold text-red-700">
                  {Number(paymentToDelete.paidAmount || paymentToDelete.amount || 0).toLocaleString()} ብር
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 font-medium">የክፍያ መለያ (ID)፡</span>
                <span className="font-mono text-[10px] text-neutral-500">{paymentToDelete.id}</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 mb-5 leading-relaxed">
              ⚠️ ይህ ድርጊት የክፍያውን መዝገብ ከFirestore 'contributions' ዳታቤዝ እና ከሂሳብ መዝገብ ላይ ሙሉ በሙሉ ያጠፋዋል።
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingId === paymentToDelete.id}
                onClick={() => setPaymentToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                ተመለስ (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeletingId === paymentToDelete.id}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeletingId === paymentToDelete.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>በመሰረዝ ላይ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>አዎ፣ ሙሉ በሙሉ ሰርዝ (Delete)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

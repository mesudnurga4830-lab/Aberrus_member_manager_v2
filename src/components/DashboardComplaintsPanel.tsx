/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ComplaintRecord, Member } from '../types';
import { replyToComplaintInFirestore, subscribeToComplaints } from '../firebase';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  MessageSquareWarning,
  Phone,
  Search,
  Send,
  User,
} from 'lucide-react';

interface DashboardComplaintsPanelProps {
  members: Member[];
  onNavigateToMember?: (memberId: string) => void;
}

export const DashboardComplaintsPanel: React.FC<DashboardComplaintsPanelProps> = ({
  members,
  onNavigateToMember,
}) => {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    const unsubscribe = subscribeToComplaints(
      (docs) => {
        setComplaints(docs);
        setIsLoading(false);
      },
      (err) => {
        console.warn('[DashboardComplaintsPanel] Firestore error:', err);
        setLoadError('ቅሬታዎችን ከFirestore መጫን አልተቻለም።');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const isResolvedStatus = (status?: string) =>
    String(status || '').trim().toLowerCase() === 'resolved';

  const openCount = complaints.filter((c) => !isResolvedStatus(c.status)).length;
  const resolvedCount = complaints.filter((c) => isResolvedStatus(c.status)).length;

  const filteredComplaints = complaints.filter((comp) => {
    const resolved = isResolvedStatus(comp.status);
    if (statusFilter === 'open' && resolved) return false;
    if (statusFilter === 'resolved' && !resolved) return false;

    const q = searchText.trim().toLowerCase();
    if (!q) return true;

    const senderName = String(comp.firstName || comp.memberName || '').toLowerCase();
    const memberId = String(comp.memberId || '').toLowerCase();
    const body = String(comp.complaintText || '').toLowerCase();
    const phone = String(comp.phone || '').toLowerCase();
    return (
      senderName.includes(q) ||
      memberId.includes(q) ||
      body.includes(q) ||
      phone.includes(q)
    );
  });

  const resolveMemberTelegramChatId = (comp: ComplaintRecord): string => {
    const direct = String(comp.telegramChatId || comp.fromId || comp.chatId || '').trim();
    if (direct && !direct.startsWith('-')) return direct;
    if (comp.memberId) {
      const matched = members.find(
        (m) => String(m.id).toLowerCase() === String(comp.memberId).toLowerCase()
      );
      const memChat = String(matched?.telegramChatId || matched?.telegramId || '').trim();
      if (memChat && !memChat.startsWith('-')) return memChat;
    }
    return '';
  };

  const handleSendReply = async (comp: ComplaintRecord) => {
    const compId = comp.id;
    const replyText = (replyDrafts[compId] || '').trim();
    if (!compId || !replyText) return;

    const personalChatId = resolveMemberTelegramChatId(comp);
    setSendingId(compId);
    setFeedbackMap((prev) => {
      const next = { ...prev };
      delete next[compId];
      return next;
    });

    try {
      const res = await fetch('/api/complaints/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId: compId, replyText }),
      });
      const data = await res.json();

      if (res.ok && data?.success) {
        setReplyDrafts((prev) => ({ ...prev, [compId]: '' }));
        setFeedbackMap((prev) => ({
          ...prev,
          [compId]: {
            ok: true,
            text: data.memberNotified
              ? `መልስዎ በዳታቤዝ ተመዝግቦ ወደ አባሉ Telegram (${data.targetChatId}) በግል ተልኳል!`
              : 'መልስዎ በዳታቤዝ ተመዝግቧል (አባሉ ፖርታል ውስጥ መልሱን ማየት ይችላሉ)።',
          },
        }));
        return;
      }
      throw new Error(data?.error || 'Server reply endpoint failed');
    } catch (apiErr) {
      // Fallback to direct Firestore Client SDK write so replies still work offline or without backend server
      try {
        await replyToComplaintInFirestore(compId, replyText, personalChatId);
        setReplyDrafts((prev) => ({ ...prev, [compId]: '' }));
        setFeedbackMap((prev) => ({
          ...prev,
          [compId]: {
            ok: true,
            text: 'መልስዎ በዳታቤዝ ተመዝግቧል (አባሉ በመገለጫ ገጻቸው ላይ መልሱን ያያሉ)።',
          },
        }));
      } catch (fsErr: any) {
        setFeedbackMap((prev) => ({
          ...prev,
          [compId]: {
            ok: false,
            text: fsErr?.message || 'መልሱን መላክ አልተቻለም። እባክዎ ዳግም ይሞክሩ።',
          },
        }));
      }
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-emerald-900/15 shadow-sm space-y-5">
      {/* Header & Counters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
            <MessageSquareWarning className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-neutral-900">
                ከአባላት የተላኩ ቅሬታዎች እና መመለሻ (Member Complaints)
              </h3>
              {openCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-extrabold border border-rose-200">
                  {openCount} ያልተመለሰ (Open)
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                {resolvedCount} የተመለሰ
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              ከአባላት ፖርታል ወይም ከቴሌግራም የመጡ ቅሬታዎችን እዚህ ይመልከቱ እና ለአባሉ በግል መልስ (Reply) ይላኩ።
            </p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-neutral-100 border border-neutral-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#1B5E20] text-[#FFD700] shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              ሁሉም ({complaints.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'open'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              ያልተመለሱ ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'resolved'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              የተመለሱ ({resolvedCount})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="በስም፣ ID ወይም ቃል ፈልግ..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-neutral-200 bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 w-48 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Loading / Error / Empty States */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-neutral-500 animate-pulse">
          የአባላት ቅሬታዎች ከዳታቤዝ እየተጫኑ ነው...
        </div>
      ) : loadError ? (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 font-semibold">
          {loadError}
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="p-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
          {complaints.length === 0
            ? 'እስካሁን ከአባላት የተላከ ቅሬታ የለም።'
            : 'በተመረጠው ማጣሪያ ውስጥ ቅሬታ አልተገኘም።'}
        </div>
      ) : (
        <div className="space-y-3 max-h-[34rem] overflow-y-auto pr-1">
          {filteredComplaints.map((comp) => {
            const resolved = isResolvedStatus(comp.status);
            const senderName = comp.firstName || comp.memberName || 'አባል';
            const personalChatId = resolveMemberTelegramChatId(comp);
            const fb = feedbackMap[comp.id];

            return (
              <div
                key={comp.id}
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  resolved
                    ? 'bg-neutral-50/70 border-neutral-200'
                    : 'bg-amber-50/35 border-amber-200/90'
                }`}
              >
                {/* Top Metadata Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-8 h-8 rounded-xl bg-[#1B5E20] text-[#FFD700] font-extrabold text-xs flex items-center justify-center shrink-0">
                      {senderName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-neutral-900">
                          {senderName}
                        </span>
                        {comp.memberId && (
                          <button
                            type="button"
                            onClick={() => onNavigateToMember && onNavigateToMember(comp.memberId!)}
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 ${
                              onNavigateToMember ? 'hover:bg-emerald-200 cursor-pointer' : ''
                            }`}
                            title={onNavigateToMember ? 'ወደ አባሉ ገጽ ሂድ' : undefined}
                          >
                            {comp.memberId}
                          </button>
                        )}
                        {comp.category && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200/80 text-neutral-700">
                            {comp.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] text-neutral-500 mt-0.5 flex-wrap">
                        {comp.phone && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-neutral-400" />
                            {comp.phone}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3 text-neutral-400" />
                          {personalChatId
                            ? `Telegram ID: ${personalChatId}`
                            : 'Telegram አልተገናኘም'}
                        </span>
                        {comp.createdAt && (
                          <span>{new Date(comp.createdAt).toLocaleString('am-ET')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold self-start sm:self-center shrink-0 ${
                      resolved
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {resolved ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-rose-600" />
                    )}
                    <span>{resolved ? 'ተመልሷል (Resolved)' : 'መልስ ይጠብቃል (Open)'}</span>
                  </span>
                </div>

                {/* Complaint Text */}
                <div className="rounded-xl bg-white border border-neutral-200/90 p-3 text-xs text-neutral-800 leading-relaxed flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="whitespace-pre-wrap">{comp.complaintText}</p>
                </div>

                {/* Existing Admin Response */}
                {comp.adminResponse && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-950 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-emerald-800">
                        የአስተዳዳሪ ምላሽ (Admin Reply)፦
                      </span>
                      {comp.resolvedAt && (
                        <span className="text-[10px] text-emerald-700 font-mono">
                          {new Date(comp.resolvedAt).toLocaleString('am-ET')}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{comp.adminResponse}</p>
                  </div>
                )}

                {/* Reply Input & Send Button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-0.5">
                  <input
                    type="text"
                    value={replyDrafts[comp.id] || ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [comp.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply(comp);
                      }
                    }}
                    placeholder={
                      comp.adminResponse
                        ? 'ተጨማሪ ወይም የተሻሻለ መልስ ይጻፉ...'
                        : 'ለቅሬታው ለአባሉ የሚላክ መልስ (Reply) እዚህ ይጻፉ...'
                    }
                    className="flex-1 text-xs rounded-xl border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/40"
                  />
                  <button
                    type="button"
                    disabled={sendingId === comp.id || !(replyDrafts[comp.id] || '').trim()}
                    onClick={() => handleSendReply(comp)}
                    className="px-4 py-2 rounded-xl bg-[#1B5E20] hover:bg-[#144818] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-2xs transition-colors"
                  >
                    <Send className="w-3.5 h-3.5 text-[#FFD700]" />
                    <span>
                      {sendingId === comp.id ? 'በመላክ ላይ...' : 'መልስ ላክ (Reply)'}
                    </span>
                  </button>
                </div>

                {fb && (
                  <p
                    className={`text-[11px] font-semibold ${
                      fb.ok ? 'text-emerald-800' : 'text-red-700'
                    }`}
                  >
                    {fb.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

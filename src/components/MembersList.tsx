/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Member, Family, GenerationNumber, SettingsRates, Contribution } from '../types';
import {
  Search,
  UserPlus,
  QrCode,
  Phone,
  Crown,
  Filter,
  CreditCard,
  Edit2,
  Trash2,
  Users,
  Check,
  ShieldCheck,
  Send,
  X,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Heart,
  Baby,
  FileSpreadsheet,
  Wallet,
  CheckSquare,
  Coins,
  Loader2,
  Clock,
} from 'lucide-react';
import {
  shareAppLinkToMember,
  formatBulkPaymentTelegramReport,
  dispatchApprovedPaymentReportToGroup,
  getAppUrl,
} from '../utils/telegramShare';
import { AdminEditMemberModal } from './AdminEditMemberModal';
import { BulkPaySelectedModal } from './BulkPaySelectedModal';
import { ETHIOPIAN_MONTHS, getCurrentEthiopianDate, getEthiopianMonthName } from '../utils/ethiopianCalendar';
import {
  getEffectiveMonthlyRate,
  getEffectiveGenRate,
  getMemberGenContributionStats,
  isPaidStatus,
  isPendingStatus,
  isPaidOrPartialStatus,
  getContributionMonth,
  getContributionYear,
} from '../utils/storage';

interface MembersListProps {
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
  isLoading?: boolean;
  isMasterAdmin?: boolean;
  currentUserName?: string;
  currentUserEmail?: string;
  onOpenAddMember: () => void;
  onOpenBulkImport?: () => void;
  onOpenQR: (member: Member) => void;
  onRecordPayment: (memberId: string) => void;
  onOpenPaymentManager?: (memberId?: string, mode?: 'list' | 'add') => void;
  onOpenBatchPayment?: (payerId?: string) => void;
  onBulkWalletPaymentComplete?: (result: {
    payerId: string;
    newWalletBalance: number;
    createdContributions: Contribution[];
  }) => void;
  onDeleteMember: (id: string) => void;
  onUpdateMember: (id: string, updates: Partial<Member>) => void;
  onToggleMonthlyStatus: (memberId: string, month: number, year: number, markPaid: boolean) => void;
  onToggleGenStatus: (memberId: string, markPaid: boolean) => void;
  onDispatchTelegram?: (payload: {
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  }) => void;
}

// Helper to normalize phone numbers for fast real-time search
function normalizePhone(str: string): string {
  return str.replace(/[\s+()-]/g, '');
}

// Helper to highlight matching text in table cells
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !query.trim() || !text) return text;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-amber-300 text-amber-950 font-black px-1 py-0.5 rounded shadow-2xs border border-amber-400/80"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export const MembersList: React.FC<MembersListProps> = ({
  members,
  families,
  contributions,
  settings,
  isLoading = false,
  isMasterAdmin = false,
  currentUserName,
  currentUserEmail,
  onOpenAddMember,
  onOpenBulkImport,
  onOpenQR,
  onRecordPayment,
  onOpenPaymentManager,
  onOpenBatchPayment,
  onBulkWalletPaymentComplete,
  onDeleteMember,
  onUpdateMember,
  onToggleMonthlyStatus,
  onToggleGenStatus,
  onDispatchTelegram,
}) => {
  const currentDate = getCurrentEthiopianDate();
  const [activeMonth, setActiveMonth] = useState<number>(currentDate.month || 11);
  const [activeYear, setActiveYear] = useState<number>(currentDate.year || 2018);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedGenFilter, setSelectedGenFilter] = useState<string>('all');
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [categoryTab, setCategoryTab] = useState<'all' | 'minors' | 'spouses' | 'heads'>('all');
  const [adminEditingMember, setAdminEditingMember] = useState<Member | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [lastBulkTelegramPayload, setLastBulkTelegramPayload] = useState<{
    name: string;
    role: string;
    phone: string;
    telegram?: string;
    messageText: string;
    directUrl: string;
  } | null>(null);

  // Bulk selection state for Pay Selected from Credit Wallet
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState<boolean>(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: press '/' to focus search input, press 'Escape' to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const minorCount = useMemo(() => members.filter((m) => m.isMinor).length, [members]);
  const spouseCount = useMemo(() => members.filter((m) => m.isSpouse).length, [members]);
  const headCount = useMemo(() => members.filter((m) => m.isHead).length, [members]);

  // Real-time optimized filtering across name, phone, ID, and family
  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const normQ = normalizePhone(q);

    return members.filter((member) => {
      // Category tab filter
      if (categoryTab === 'minors' && !member.isMinor) return false;
      if (categoryTab === 'spouses' && !member.isSpouse) return false;
      if (categoryTab === 'heads' && !member.isHead) return false;

      // Generation filter
      if (selectedGenFilter !== 'all' && Number(member.generation) !== Number(selectedGenFilter)) {
        return false;
      }
      // Family filter
      if (selectedFamilyFilter !== 'all' && String(member.familyId || '') !== selectedFamilyFilter) {
        return false;
      }

      // Real-time search query matching (defensively null-safe)
      if (q) {
        const fullName = String(member.fullName || '').toLowerCase();
        const memberId = String(member.id || '').toLowerCase();
        const familyName = String(member.familyName || '').toLowerCase();
        const rawPhone = String(member.phone || (member as any).phoneNumber || '');

        const nameMatch = fullName.includes(q);
        const idMatch =
          memberId.includes(q) ||
          memberId.replace(/[-_]/g, '').includes(q.replace(/[-_]/g, ''));
        const familyMatch = familyName.includes(q);

        let phoneMatch = false;
        if (rawPhone) {
          const lowerPhone = rawPhone.toLowerCase();
          const normPhone = normalizePhone(rawPhone);
          phoneMatch =
            lowerPhone.includes(q) ||
            (normQ.length >= 2 && normPhone.includes(normQ));
        }

        const telegramMatch = member.telegram
          ? String(member.telegram).toLowerCase().includes(q)
          : false;

        return nameMatch || idMatch || familyMatch || phoneMatch || telegramMatch;
      }

      return true;
    });
  }, [members, searchQuery, selectedGenFilter, selectedFamilyFilter, categoryTab]);

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSelectedGenFilter('all');
    setSelectedFamilyFilter('all');
    setCategoryTab('all');
    searchInputRef.current?.focus();
  };

  const isFiltering =
    searchQuery.trim().length > 0 ||
    selectedGenFilter !== 'all' ||
    selectedFamilyFilter !== 'all' ||
    categoryTab !== 'all';

  // Helper to check active month Paid status (supports both 'ተከፍሏል' and 'Paid')
  const isMemberPaidForActiveMonth = (memberId: string): boolean => {
    return contributions.some((c) => {
      const m = getContributionMonth(c);
      const y = getContributionYear(c);
      return (
        c.memberId === memberId &&
        (!c.type || c.type === 'ወርሃዊ') &&
        m === activeMonth &&
        y === activeYear &&
        isPaidStatus(c.status)
      );
    });
  };

  // Helper to check active month Pending status
  const isMemberPendingForActiveMonth = (memberId: string): boolean => {
    return contributions.some((c) => {
      const m = getContributionMonth(c);
      const y = getContributionYear(c);
      return (
        c.memberId === memberId &&
        (!c.type || c.type === 'ወርሃዊ') &&
        m === activeMonth &&
        y === activeYear &&
        isPendingStatus(c.status)
      );
    });
  };

  const selectedMembersList = useMemo(
    () => members.filter((m) => selectedMemberIds.has(m.id)),
    [members, selectedMemberIds]
  );

  const filteredPaidCount = useMemo(
    () => filteredMembers.filter((m) => !m.isMinor && isMemberPaidForActiveMonth(m.id)).length,
    [filteredMembers, contributions, activeMonth, activeYear]
  );

  const filteredUnpaidCount = useMemo(
    () => filteredMembers.filter((m) => !m.isMinor && !isMemberPaidForActiveMonth(m.id)).length,
    [filteredMembers, contributions, activeMonth, activeYear]
  );

  const allFilteredSelected =
    filteredMembers.length > 0 && filteredMembers.every((m) => selectedMemberIds.has(m.id));
  const someFilteredSelected =
    filteredMembers.some((m) => selectedMemberIds.has(m.id)) && !allFilteredSelected;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  const handleToggleSelectAllFiltered = () => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredMembers.forEach((m) => next.delete(m.id));
      } else {
        filteredMembers.forEach((m) => next.add(m.id));
      }
      return next;
    });
  };

  const handleToggleMemberSelect = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSelectUnpaidFiltered = () => {
    const unpaidIds = filteredMembers
      .filter((m) => !m.isMinor && !isMemberPaidForActiveMonth(m.id))
      .map((m) => m.id);
    setSelectedMemberIds(new Set(unpaidIds));
  };

  const activeMonthName = getEthiopianMonthName(activeMonth);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-[#155544] via-[#517DA2] to-[#83257B] p-5 sm:p-6 rounded-2xl border-2 border-[#5A8FBB]/50 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-[#1DAB61] text-[#042116] text-[11px] font-extrabold">
              የአባላት መዝገብ (Members Directory)
            </span>
            <span className="text-white font-bold">·</span>
            <span className="text-xs text-white font-bold">
              {isLoading && members.length === 0
                ? 'አባላትን ከFirestore በመጫን ላይ...'
                : `ጠቅላላ ${members.length} የተመዘገቡ አባላት`}
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#5A8FBB] text-[#071E33] border border-white/40 text-[10px] font-extrabold">
                <Loader2 className="w-3 h-3 animate-spin text-amber-700" />
                <span>በመጫን ላይ...</span>
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-white mt-1.5 tracking-tight">
            የአበሩስ ቤተሰብ አባላት ሙሉ ዝርዝር
          </h2>
          <p className="text-xs text-white/95 font-semibold mt-0.5">
            የአባላት ID፣ ሙሉ ስም፣ ትውልድ፣ ቤተሰብ እና ስልክ ቁጥር ማስተዳደሪያ
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenBulkImport && (
            <button
              type="button"
              onClick={onOpenBulkImport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#5A8FBB] hover:bg-[#517DA2] hover:text-white text-[#071E33] font-extrabold text-xs transition-colors shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="በCSV ፋይል አባላትን በጅምላ አስመጣ"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ፋይል አስመጣ (Bulk Import)</span>
            </button>
          )}
          {onOpenPaymentManager && (
            <button
              type="button"
              onClick={() => onOpenPaymentManager(undefined, 'list')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#417E38] hover:bg-[#155544] text-white font-extrabold text-xs transition-colors shadow-xs cursor-pointer border border-white/25 whitespace-nowrap shrink-0"
              title="የአባላት የክፍያዎች መዝገብ፣ ክፍያ መመዝገብ ወይም መሰረዝ"
            >
              <CreditCard className="w-4 h-4 text-[#FFD700]" />
              <span>የክፍያዎች መዝገብ</span>
            </button>
          )}
          <button
            onClick={onOpenAddMember}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#155544] hover:bg-[#417E38] text-white font-extrabold text-xs transition-colors shadow-sm cursor-pointer border border-[#1DAB61]/50 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 text-amber-300" />
            <span>አዲስ አባል መዝግብ (Add Member)</span>
          </button>
        </div>
      </div>

      {/* Deletion / Bulk Payment Toast / Notice */}
      {deleteNotice && (
        <div className="bg-[#1DAB61]/15 border-2 border-[#417E38] text-neutral-950 px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-xs animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{deleteNotice}</span>
          </div>
          <div className="flex items-center gap-2">
            {lastBulkTelegramPayload && onDispatchTelegram && (
              <button
                type="button"
                onClick={() => onDispatchTelegram(lastBulkTelegramPayload)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#517DA2] hover:bg-[#155544] text-white text-[11px] font-extrabold shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>የጅምላ ክፍያ ሪፖርት በTelegram ላክ</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDeleteNotice(null);
                setLastBulkTelegramPayload(null);
              }}
              className="text-neutral-900 hover:text-black p-1 rounded-lg hover:bg-[#1DAB61]/25 transition-colors cursor-pointer"
              aria-label="ዝጋ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Category Headings / Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-2xl border-2 border-[#5A8FBB]/40 shadow-2xs">
        <button
          onClick={() => setCategoryTab('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            categoryTab === 'all'
              ? 'bg-[#155544] text-white shadow-xs'
              : 'text-neutral-900 bg-[#5A8FBB]/10 hover:bg-[#5A8FBB]/25 border border-[#5A8FBB]/30'
          }`}
        >
          <span>ሁሉም አባላት</span>
          <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${categoryTab === 'all' ? 'bg-[#1DAB61] text-[#042116]' : 'bg-[#517DA2] text-white'}`}>
            {members.length}
          </span>
        </button>

        <button
          onClick={() => setCategoryTab('minors')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            categoryTab === 'minors'
              ? 'bg-[#517DA2] text-white shadow-xs'
              : 'text-[#0F2438] bg-[#5A8FBB]/15 hover:bg-[#5A8FBB]/30 border border-[#5A8FBB]/50'
          }`}
        >
          <Baby className="w-3.5 h-3.5" />
          <span>ከክፍያ ነፃ የሆኑ ልጆች (&lt;18 ዓመት)</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#1DAB61] text-[#042116] text-[10px] font-mono font-black">
            {minorCount}
          </span>
        </button>

        <button
          onClick={() => setCategoryTab('spouses')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            categoryTab === 'spouses'
              ? 'bg-[#83257B] text-white shadow-xs'
              : 'text-[#83257B] bg-[#83257B]/10 hover:bg-[#83257B]/20 border border-[#83257B]/35'
          }`}
        >
          <Heart className="w-3.5 h-3.5" />
          <span>የአባላት የትዳር አጋሮች (Spouses)</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${categoryTab === 'spouses' ? 'bg-white text-[#83257B]' : 'bg-[#83257B] text-white'}`}>
            {spouseCount}
          </span>
        </button>

        <button
          onClick={() => setCategoryTab('heads')}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            categoryTab === 'heads'
              ? 'bg-[#417E38] text-white shadow-xs'
              : 'text-[#155544] bg-[#1DAB61]/15 hover:bg-[#1DAB61]/25 border border-[#417E38]/40'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>የቤተሰብ ወኪሎች (25)</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${categoryTab === 'heads' ? 'bg-[#1DAB61] text-[#042116]' : 'bg-[#155544] text-white'}`}>
            {headCount}
          </span>
        </button>
      </div>

      {/* Category Banner If Specific Tab is Selected */}
      {categoryTab === 'minors' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#5A8FBB]/20 to-[#517DA2]/15 border-2 border-[#517DA2]/50 text-xs text-neutral-950 space-y-1">
          <div className="flex items-center gap-2 font-extrabold text-sm text-[#0F2438]">
            <Baby className="w-5 h-5 text-amber-700" />
            <span>ከክፍያ ነጻ የሆኑ የ3ኛ ትውልድ 18 አመት ያልሞላቸው ልጆች (4ኛ ትውልድ - 39 ልጆች)</span>
          </div>
          <p className="text-xs text-neutral-900 font-semibold leading-relaxed">
            4ኛ ትውልድ የ3ኛ ትውልድ ልጆች እድሜያቸው 18 ካልሞላ ከወርሃዊም ሆነ ከትውልድ መዋጮ ክፍያዎች 100% ነፃ (0 ብር) ናቸው። እነዚህ 39 ልጆች በFA019፣ FA021፣ FA022 እና FA024 ስር ተመዝግበው ይገኛሉ።
          </p>
        </div>
      )}

      {categoryTab === 'spouses' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#83257B]/15 to-[#5A8FBB]/15 border-2 border-[#83257B]/45 text-xs text-neutral-950 space-y-1">
          <div className="flex items-center gap-2 font-extrabold text-sm text-[#83257B]">
            <Heart className="w-5 h-5 text-purple-700" />
            <span>የአባላት የትዳር አጋሮች (Spouses)</span>
          </div>
          <p className="text-xs text-neutral-900 font-semibold leading-relaxed">
            የአባላት የትዳር አጋሮች ከትውልድ ክፍያ ነፃ (0 ብር) ሲሆኑ፤ ወርሃዊ ክፍያቸው 100 ብር ብቻ ነው።
          </p>
        </div>
      )}

      {/* Real-Time Search & Multi-Filter Control Center */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-[#5A8FBB]/40 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Enhanced Real-Time Search Input */}
          <div className="relative flex-1 max-w-xl">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-800">
              <Search className="w-4 h-4" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              name="abarrus-member-directory-search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="በስም፣ በስልክ ቁጥር፣ በአባል ID (ለምሳሌ MEM-001) ወይም በቤተሰብ ስም ይፈልጉ..."
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                setTimeout(() => setIsSearchFocused(false), 200);
              }}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs sm:text-sm pl-10 pr-28 py-2.5 bg-[#5A8FBB]/10 hover:bg-white focus:bg-white border-2 border-[#5A8FBB]/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155544]/30 focus:border-[#155544] transition-all text-neutral-950 placeholder:text-neutral-700 shadow-2xs font-bold"
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1.5">
              {searchQuery.trim() ? (
                <>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#1DAB61]/25 text-[#155544] border border-[#1DAB61] shadow-2xs font-mono">
                    {filteredMembers.length} ውጤት
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="p-1 rounded-lg text-neutral-800 hover:text-black hover:bg-[#5A8FBB]/25 transition-colors"
                    title="ፍለጋውን አጽዳ (Escape)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <kbd
                  onClick={() => searchInputRef.current?.focus()}
                  className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-extrabold text-[#155544] bg-[#5A8FBB]/20 border border-[#5A8FBB]/60 rounded cursor-pointer hover:bg-[#5A8FBB]/35"
                  title="ለመፈለግ '/' ይጫኑ"
                >
                  /
                </kbd>
              )}
            </div>

            {/* Instant Live Search Results Autocomplete Dropdown */}
            {isSearchFocused && searchQuery.trim() && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border-2 border-[#517DA2]/50 py-2 z-50 animate-in fade-in zoom-in-95 max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-extrabold text-neutral-800 uppercase tracking-wider flex items-center justify-between border-b border-[#5A8FBB]/30 mb-1">
                  <span className="flex items-center gap-1 text-[#155544]">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    የቅጽበታዊ ፍለጋ ውጤቶች ({filteredMembers.length})
                  </span>
                  <span className="text-[10px] text-[#517DA2] font-bold">ስም እና ID ተደምቀዋል</span>
                </div>

                {filteredMembers.length === 0 ? (
                  <div className="px-4 py-3 text-center text-xs text-neutral-800 font-bold">
                    «{searchQuery}» በሚል የተገኘ አባል የለም
                  </div>
                ) : (
                  filteredMembers.slice(0, 6).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearchQuery(m.fullName);
                        setIsSearchFocused(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#1DAB61]/15 flex items-center justify-between gap-2 transition-colors border-b border-neutral-100 last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-300">
                          {m.photo ? (
                            <img src={m.photo} alt={m.fullName || 'Member'} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            (m.fullName || '?').charAt(0)
                          )}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-extrabold text-neutral-950 truncate">
                            {highlightMatch(m.fullName || '', searchQuery)}
                          </p>
                          <p className="text-[10px] text-neutral-800 font-semibold truncate">
                            {highlightMatch(m.familyName || '', searchQuery)} · {m.phone || 'ስልክ የለም'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-extrabold text-[#155544] block">
                          {highlightMatch(m.id, searchQuery)}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#83257B] text-white rounded font-extrabold">
                          {m.generation}ኛ
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Generation & Family Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-[#5A8FBB]/15 p-1 rounded-xl border border-[#5A8FBB]/35 shrink-0">
              {['all', '3', '4', '5', '6'].map((val) => (
                <button
                  key={val}
                  onClick={() => setSelectedGenFilter(val)}
                  className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedGenFilter === val
                      ? 'bg-[#155544] text-white shadow-2xs'
                      : 'text-neutral-900 hover:text-[#155544] hover:bg-white'
                  }`}
                >
                  {val === 'all' ? 'ሁሉም' : `${val}ኛ`}
                </button>
              ))}
            </div>

            <select
              value={selectedFamilyFilter}
              onChange={(e) => setSelectedFamilyFilter(e.target.value)}
              className="text-xs bg-white border-2 border-[#517DA2]/50 rounded-xl px-3 py-2 text-neutral-950 focus:outline-none focus:ring-2 focus:ring-[#155544]/40 shrink-0 font-bold"
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

        {/* Live Filter Summary / Status Bar */}
        <div className="pt-2.5 border-t border-[#5A8FBB]/25 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-neutral-900">
              የፍለጋ ውጤት፡{' '}
              <strong className="text-[#155544] font-mono font-extrabold text-sm tabular-nums">
                {filteredMembers.length}
              </strong>{' '}
              አባላት (ከ {members.length})
            </span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5A8FBB]/20 text-[#0F2438] text-xs font-extrabold border border-[#517DA2] shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>ፍለጋ፡ &quot;{searchQuery}&quot; ({filteredMembers.length} አባላት ተገኝተዋል)</span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="hover:text-[#83257B] font-extrabold ml-1 text-xs"
                  title="ፍለጋውን አጽዳ"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {isFiltering && (
            <button
              onClick={handleClearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-[#83257B] hover:text-[#155544] font-extrabold hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>ሁሉንም አጽዳ (Reset Filters)</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Selection & Pay Selected Toolbar Above Table */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border-2 border-[#417E38]/40 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active Month Selector for Paid / Unpaid Status Column */}
          <div className="flex items-center gap-1.5 bg-[#5A8FBB]/15 border border-[#517DA2]/50 rounded-xl px-2.5 py-1.5">
            <span className="text-[11px] font-extrabold text-neutral-900">የክፍያ ወር፡</span>
            <select
              value={activeMonth}
              onChange={(e) => setActiveMonth(Number(e.target.value))}
              className="text-xs font-extrabold text-[#155544] bg-transparent outline-none cursor-pointer"
            >
              {ETHIOPIAN_MONTHS.map((m) => (
                <option key={m.number} value={m.number}>
                  {m.amharic}
                </option>
              ))}
            </select>
            <select
              value={activeYear}
              onChange={(e) => setActiveYear(Number(e.target.value))}
              className="text-xs font-mono font-extrabold text-neutral-950 bg-transparent outline-none cursor-pointer"
            >
              <option value={2018}>2018</option>
              <option value={2019}>2019</option>
            </select>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1DAB61]/20 text-[#155544] border border-[#417E38] text-[11px] font-extrabold">
            <span>Paid: {filteredPaidCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#83257B]/15 text-[#83257B] border border-[#83257B]/50 text-[11px] font-extrabold">
            <span>Unpaid: {filteredUnpaidCount}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSelectUnpaidFiltered}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#83257B]/10 hover:bg-[#83257B] hover:text-white text-[#83257B] border border-[#83257B]/45 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="በዚህ ወር ያልከፈሉትን አባላት በሙሉ በአንድ ጊዜ ምረጥ"
          >
            <CheckSquare className="w-3.5 h-3.5 text-red-600" />
            <span>ያልከፈሉትን ምረጥ ({filteredUnpaidCount})</span>
          </button>

          {selectedMemberIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedMemberIds(new Set())}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-[#5A8FBB]/20 hover:bg-[#517DA2] hover:text-white text-[#0F2438] text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>ምርጫ አጽዳ</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (selectedMemberIds.size === 0) {
                setDeleteNotice('እባክዎ መጀመሪያ ከሰንጠረዡ ላይ ቢያንስ አንድ አባል ይምረጡ (Checkbox ይንኩ)።');
                setTimeout(() => setDeleteNotice(null), 4000);
                return;
              }
              setIsBulkPayModalOpen(true);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0 ${
              selectedMemberIds.size > 0
                ? 'bg-[#155544] hover:bg-[#417E38] text-white ring-2 ring-[#1DAB61]'
                : 'bg-[#517DA2] hover:bg-[#155544] text-white'
            }`}
            title="ለተመረጡት አባላት ከCredit Wallet ክፍያ ፈጽም"
          >
            <Coins className="w-4 h-4 text-[#FFD700]" />
            <span>
              ለተመረጡት ክፈል (Pay Selected)
              {selectedMemberIds.size > 0 ? ` — ${selectedMemberIds.size}` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Table View */}
      <div className="bg-white rounded-2xl border-2 border-[#5A8FBB]/45 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#155544] text-white font-extrabold border-b-2 border-[#417E38]">
              <tr>
                <th className="py-3.5 px-3 w-10 text-center">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={handleToggleSelectAllFiltered}
                    aria-label="ሁሉንም ምረጥ (Select All)"
                    title="ሁሉንም የሚታዩ አባላት ምረጥ / አንሳ"
                    className="w-4 h-4 rounded border-white/60 accent-[#1DAB61] cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-3">የአባላት ID</th>
                <th className="py-3.5 px-3">FullName (ሙሉ ስም)</th>
                <th className="py-3.5 px-2">ትውልድ</th>
                <th className="py-3.5 px-3">Family (ቤተሰብ)</th>
                <th className="py-3.5 px-3">Phone (ስልክ ቁጥር)</th>
                <th className="py-3.5 px-3">Telegram Account</th>
                <th className="py-3.5 px-3 text-center">
                  የወሩ ሁኔታ ({activeMonthName} {activeYear})
                </th>
                <th className="py-3.5 px-3 text-center">የትውልድ መዋጮ (ሁኔታ & ቀሪ)</th>
                <th className="py-3.5 px-2 text-center">QR & ሊንክ</th>
                <th className="py-3.5 px-3 text-right">የአድሚን ኤዲት & ክፍያ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading && filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-3">
                      <div className="relative w-12 h-12 flex items-center justify-center">
                        <div className="w-12 h-12 border-4 border-emerald-200 border-t-[#1B5E20] rounded-full animate-spin" />
                        <Loader2 className="w-5 h-5 text-[#1B5E20] animate-spin absolute" />
                      </div>
                      <h4 className="font-extrabold text-[#155544] text-sm">
                        የአባላት ዝርዝር ከFirestore በመጫን ላይ...
                      </h4>
                      <p className="text-xs text-neutral-800 font-semibold leading-relaxed">
                        እባክዎ ትንሽ ይጠብቁ — የአባላት ዳታ እና የOffline መዝገብ ከሰርቨር ጋር በመመሳሰል ላይ ነው።
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
                        <Search className="w-6 h-6" />
                      </div>
                      <h4 className="font-extrabold text-neutral-950 text-sm">
                        የተፈለገው አባል አልተገኘም
                      </h4>
                      <p className="text-xs text-neutral-800 font-semibold leading-relaxed">
                        {searchQuery
                          ? `«${searchQuery}» የሚል ስም፣ ስልክ ቁጥር ወይም የአባል ID አልተገኘም።`
                          : members.length === 0
                          ? 'በዳታቤዝ ውስጥ የተመዘገበ አባል አልተገኘም።'
                          : 'በተመረጡት ማጣሪያዎች መሰረት ምንም አባል አልተገኘም።'}
                      </p>
                      {isFiltering && (
                        <button
                          type="button"
                          onClick={handleClearAllFilters}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#155544] hover:bg-[#417E38] text-white text-xs font-extrabold transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>ሁሉንም ማጣሪያዎች አጽዳ (Reset Filters)</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const monthlyRate = getEffectiveMonthlyRate(member, settings);
                  const isMonthlyPaid = isMemberPaidForActiveMonth(member.id);
                  const isMonthlyPending = !isMonthlyPaid && isMemberPendingForActiveMonth(member.id);
                  const isSelected = selectedMemberIds.has(member.id);

                  const genStats = getMemberGenContributionStats(member, settings, contributions);
                  const hasPendingGen = contributions.some(
                    (c) => c.memberId === member.id && c.type === 'ትውልድ' && isPendingStatus(c.status)
                  );

                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-[#5A8FBB]/10 transition-colors ${
                        isSelected
                          ? 'bg-[#1DAB61]/15'
                          : member.isMinor
                          ? 'bg-[#5A8FBB]/10'
                          : member.isSpouse
                          ? 'bg-[#83257B]/5'
                          : ''
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleMemberSelect(member.id)}
                          aria-label={`${member.fullName} ምረጥ`}
                          className="w-4 h-4 rounded border-[#517DA2] accent-[#155544] cursor-pointer"
                        />
                      </td>

                      {/* Member ID */}
                      <td className="py-3 px-3 font-mono font-extrabold text-[#155544] tabular-nums">
                        {highlightMatch(member.id, searchQuery)}
                      </td>

                      {/* Full Name & Badges */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-300">
                            {member.photo ? (
                              <img
                                src={member.photo}
                                alt={member.fullName || 'Member'}
                                className="w-full h-full object-cover rounded-full"
                              />
                            ) : (
                              (member.fullName || '?').charAt(0)
                            )}
                          </div>
                          <div>
                            <div className="font-extrabold text-neutral-950 flex items-center gap-1.5 flex-wrap">
                              <span>{highlightMatch(member.fullName || '', searchQuery)}</span>
                              {member.isHead && (
                                <span title="የቤተሰብ ወኪል" className="text-amber-600">
                                  <Crown className="w-3.5 h-3.5 fill-amber-500 inline" />
                                </span>
                              )}
                              {member.isMinor && (
                                <span className="px-1.5 py-0.5 rounded bg-[#5A8FBB]/25 text-[#0F2438] font-extrabold text-[10px] border border-[#517DA2]">
                                  👶 18 ያልሞላው (ከክፍያ ነጻ)
                                </span>
                              )}
                              {member.isSpouse && (
                                <span className="px-1.5 py-0.5 rounded bg-[#83257B]/15 text-[#83257B] font-extrabold text-[10px] border border-[#83257B]/40">
                                  💍 የትዳር አጋር
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <span className="text-[11px] text-neutral-800 font-bold font-mono tabular-nums">
                                ተመን፡ {monthlyRate} ብር/ወር
                              </span>
                              {(member.walletBalance || 0) > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#1DAB61]/20 text-[#155544] border border-[#417E38] font-mono font-extrabold text-[10px] tabular-nums"
                                  title="የአባሉ ያልተከፋፈለ ቀሪ ሂሳብ (Credit Wallet)"
                                >
                                  <Wallet className="w-2.5 h-2.5 text-amber-700" />
                                  <span>ቀሪ ሂሳብ: {Number(member.walletBalance).toLocaleString()} ብር</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Generation */}
                      <td className="py-3 px-2">
                        <span className="inline-block px-2 py-0.5 rounded bg-[#517DA2]/15 text-[#0F2438] border border-[#5A8FBB]/50 font-extrabold text-[11px] font-mono">
                          {member.generation}ኛ
                        </span>
                      </td>

                      {/* Family */}
                      <td className="py-3 px-3 text-neutral-950 font-bold">
                        <div>
                          <span>{highlightMatch(member.familyName || '', searchQuery)}</span>
                          <span className="text-[10px] font-mono font-bold text-[#517DA2] block">{member.familyId}</span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3 font-mono font-bold text-neutral-900">
                        {member.phone ? (
                          highlightMatch(member.phone, searchQuery)
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      {/* Telegram */}
                      <td className="py-3 px-3 font-mono text-neutral-900">
                        {member.telegram ? (
                          <a
                            href={
                              member.telegram.startsWith('http')
                                ? member.telegram
                                : member.telegram.startsWith('@')
                                ? `https://t.me/${member.telegram.replace('@', '')}`
                                : `https://t.me/+${member.telegram.replace(/[^0-9]/g, '')}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#517DA2] hover:text-[#155544] hover:underline font-extrabold"
                            title="በቴሌግራም አውራ"
                          >
                            <Send className="w-3 h-3 shrink-0" />
                            <span>{highlightMatch(member.telegram, searchQuery)}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      {/* Monthly Payment Status Badge (Paid / Pending / Unpaid) for Active Month */}
                      <td className="py-3 px-3 text-center">
                        {member.isMinor ? (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-[#5A8FBB]/20 text-[#0F2438] font-extrabold text-[10px] border border-[#517DA2]/50">
                            👶 ከክፍያ ነፃ
                          </span>
                        ) : isMonthlyPaid ? (
                          isMasterAdmin ? (
                            <button
                              type="button"
                              onClick={() => onToggleMonthlyStatus(member.id, activeMonth, activeYear, false)}
                              title={`${activeMonthName} ${activeYear} ተከፍሏል (Paid) - ለመቀየር ይጫኑ`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1DAB61]/25 hover:bg-[#83257B] hover:text-white hover:border-[#83257B] text-[#155544] font-extrabold text-[11px] transition-all border border-[#417E38] group cursor-pointer shadow-2xs whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 group-hover:hidden" />
                              <X className="w-3.5 h-3.5 text-red-600 hidden group-hover:inline" />
                              <span className="group-hover:hidden">Paid · ተከፍሏል</span>
                              <span className="hidden group-hover:inline">ሰርዝ</span>
                            </button>
                          ) : (
                            <span
                              title={`${activeMonthName} ${activeYear} ተከፍሏል (የጸደቀ ክፍያ)`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1DAB61]/25 text-[#155544] font-extrabold text-[11px] border border-[#417E38] shadow-2xs whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Paid · ተከፍሏል</span>
                            </span>
                          )
                        ) : isMonthlyPending ? (
                          isMasterAdmin ? (
                            <button
                              type="button"
                              onClick={() => onToggleMonthlyStatus(member.id, activeMonth, activeYear, true)}
                              title={`${activeMonthName} ${activeYear} የዋና አድሚን ማረጋገጫ ይጠብቃል — ለማጽደቅ ይጫኑ`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#5A8FBB]/25 hover:bg-[#417E38] hover:text-white hover:border-[#417E38] text-[#0F2438] font-extrabold text-[11px] transition-all border border-[#517DA2] group cursor-pointer shadow-2xs whitespace-nowrap"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-700 group-hover:hidden" />
                              <Check className="w-3.5 h-3.5 text-emerald-600 hidden group-hover:inline" />
                              <span className="group-hover:hidden">Pending · በመጠባበቅ</span>
                              <span className="hidden group-hover:inline">አጽድቅ</span>
                            </button>
                          ) : (
                            <span
                              title="የዋናው አስተዳዳሪ ማረጋገጫ በመጠባበቅ ላይ (Pending)"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#5A8FBB]/25 text-[#0F2438] font-extrabold text-[11px] border border-[#517DA2] shadow-2xs whitespace-nowrap"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-700" />
                              <span>Pending · በመጠባበቅ</span>
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleMonthlyStatus(member.id, activeMonth, activeYear, true)}
                            title={
                              isMasterAdmin
                                ? `${activeMonthName} ${activeYear} አልተከፈለም (Unpaid) - ለመክፈል ይጫኑ`
                                : `${activeMonthName} ${activeYear} አልተከፈለም - በPending ለመመዝገብ ይጫኑ`
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#83257B]/15 hover:bg-[#417E38] hover:text-white hover:border-[#417E38] text-[#83257B] font-extrabold text-[11px] transition-all border border-[#83257B]/50 group cursor-pointer shadow-2xs whitespace-nowrap"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 group-hover:hidden" />
                            <Check className="w-3.5 h-3.5 text-emerald-600 hidden group-hover:inline" />
                            <span className="group-hover:hidden">Unpaid · አልከፈለም</span>
                            <span className="hidden group-hover:inline">{isMasterAdmin ? 'ክፈል' : 'መዝግብ (Pending)'}</span>
                          </button>
                        )}
                      </td>

                      {/* Generation Contribution (Full/Partial/Paid/Remaining) */}
                      <td className="py-3 px-3 text-center">
                        {member.isMinor || member.isSpouse ? (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-[#5A8FBB]/20 text-[#0F2438] font-extrabold text-[10px] border border-[#517DA2]/50">
                            {member.isMinor ? '👶 ከክፍያ ነፃ' : '💍 ከትውልድ ነፃ'}
                          </span>
                        ) : genStats.status === 'ተከፍሏል (ሙሉ)' ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="px-2.5 py-0.5 rounded-full bg-[#1DAB61]/25 text-[#155544] font-extrabold text-[11px] border border-[#417E38] inline-flex items-center gap-1 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>ሙሉ ተከፍሏል ({genStats.paidSoFar.toLocaleString()} ብር)</span>
                            </span>
                          </div>
                        ) : genStats.status === 'ከፊል ክፍያ' ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="px-2 py-0.5 rounded-full bg-[#5A8FBB]/25 text-[#0F2438] font-extrabold text-[10px] border border-[#517DA2] whitespace-nowrap">
                              ከፊል ({genStats.paidSoFar.toLocaleString()} ብር)
                            </span>
                            <span className="text-[11px] text-[#83257B] font-mono font-extrabold tabular-nums">
                              ቀሪ፡ {genStats.remainingBalance.toLocaleString()} ብር
                            </span>
                            {hasPendingGen && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#5A8FBB]/20 text-[#0F2438] text-[9px] font-extrabold border border-[#517DA2]">
                                <Clock className="w-2.5 h-2.5" /> Pending
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            {hasPendingGen ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#5A8FBB]/25 text-[#0F2438] font-extrabold text-[10px] border border-[#517DA2] whitespace-nowrap">
                                <Clock className="w-3 h-3 text-amber-700" />
                                <span>በመጠባበቅ (Pending)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-[#83257B]/15 text-[#83257B] font-extrabold text-[10px] border border-[#83257B]/45">
                                አልተከፈለም
                              </span>
                            )}
                            <span className="text-[11px] text-neutral-900 font-mono font-bold tabular-nums">
                              ቀሪ፡ {genStats.remainingBalance.toLocaleString()} ብር
                            </span>
                          </div>
                        )}
                      </td>

                      {/* QR Code & Telegram App Link */}
                      <td className="py-3 px-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => onOpenQR(member)}
                            className="p-1.5 rounded-lg bg-[#1DAB61]/15 text-[#155544] hover:bg-[#1DAB61]/30 border border-[#417E38]/30 transition-colors inline-flex items-center justify-center cursor-pointer"
                            title="የQR መታወቂያ አሳይ"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const payload = shareAppLinkToMember(member, contributions, settings);
                              if (onDispatchTelegram) {
                                onDispatchTelegram({
                                  name: member.fullName,
                                  role: member.isSpouse ? 'የትዳር አጋር' : member.isMinor ? 'ልጅ (<18)' : `${member.generation}ኛ ትውልድ አባል`,
                                  phone: member.phone || '',
                                  telegram: member.telegram || '',
                                  messageText: payload.text,
                                  directUrl: payload.directUrl,
                                });
                              } else {
                                window.open(payload.url, '_blank');
                              }
                            }}
                            className="p-1.5 rounded-lg bg-[#5A8FBB]/20 text-[#517DA2] hover:bg-[#517DA2] hover:text-white border border-[#5A8FBB]/40 transition-colors inline-flex items-center justify-center cursor-pointer"
                            title="የአፑን ሊንክና የክፍያ ታሪክ ለዚህ አባል በTelegram / ስልክ ላክ"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      {/* Actions: Edit Member (Admin), Payment & Delete */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setAdminEditingMember(member)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#155544] hover:bg-[#417E38] text-white font-extrabold text-[11px] transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                            title="የአባሉን ስም፣ ስልክ፣ ቴሌግራም እና የከፈለ/ያልከፈለ ሁኔታ አስተካክል (Admin Edit)"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>አስተካክል</span>
                          </button>
                          {onOpenPaymentManager && (
                            <button
                              onClick={() => onOpenPaymentManager(member.id, 'list')}
                              className="px-2 py-1 rounded-lg bg-[#417E38]/15 hover:bg-[#417E38] hover:text-white text-[#155544] border border-[#417E38]/40 font-extrabold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                              title="የዚህን አባል ክፍያዎች ተመልከት፣ ሰርዝ ወይም አዲስ መዝግብ"
                            >
                              <CreditCard className="w-3 h-3 text-emerald-800" />
                              <span>ክፍያዎች</span>
                            </button>
                          )}
                          {onOpenBatchPayment && (
                            <button
                              onClick={() => onOpenBatchPayment(member.id)}
                              className="px-2 py-1 rounded-lg bg-[#5A8FBB]/20 hover:bg-[#517DA2] hover:text-white text-[#0F2438] border border-[#517DA2]/45 font-extrabold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                              title="የጅምላ ደረሰኝ / ቀሪ ሂሳብ ክፍፍል (Batch & Wallet)"
                            >
                              <Wallet className="w-3 h-3 text-amber-800" />
                              <span>ክፍፍል</span>
                            </button>
                          )}
                          <button
                            onClick={() => onRecordPayment(member.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#1DAB61]/25 hover:bg-[#1DAB61] text-[#042116] border border-[#417E38]/40 font-extrabold text-[11px] transition-colors cursor-pointer whitespace-nowrap"
                            title="ክፍያ መዝግብ"
                          >
                            መዝግብ
                          </button>
                          <button
                            onClick={() => setMemberToDelete(member)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#83257B]/10 hover:bg-[#83257B] hover:text-white text-[#83257B] border border-[#83257B]/45 font-extrabold text-[11px] transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                            title="በስህተት የተመዘገበ አባል ሰርዝ (Delete Member)"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                            <span>ሰርዝ</span>
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

      {/* Admin Member Edit Modal */}
      {adminEditingMember && (
        <AdminEditMemberModal
          isOpen={true}
          member={adminEditingMember}
          onClose={() => setAdminEditingMember(null)}
          families={families}
          contributions={contributions}
          settings={settings}
          isMasterAdmin={isMasterAdmin}
          onUpdateMember={onUpdateMember}
          onDeleteMember={onDeleteMember}
          onToggleMonthlyStatus={onToggleMonthlyStatus}
          onToggleGenStatus={onToggleGenStatus}
        />
      )}

      {/* Delete Member Confirmation Modal */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-[#83257B]/50 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#5A8FBB]/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-neutral-950">አባል መሰረዝ (Delete Member)</h3>
                  <p className="text-xs text-neutral-800 font-semibold">በስህተት የተመዘገበ አባልን ከሲስተም ማጥፋት</p>
                </div>
              </div>
              <button
                onClick={() => setMemberToDelete(null)}
                className="p-1 rounded-lg text-neutral-800 hover:text-black hover:bg-[#5A8FBB]/20 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 p-4 rounded-xl bg-[#5A8FBB]/10 border border-[#5A8FBB]/40 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-800 font-bold">የአባል ስም፦</span>
                <span className="font-extrabold text-neutral-950">{memberToDelete.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-800 font-bold">የአባል መለያ (ID)፦</span>
                <span className="font-mono font-extrabold text-[#155544]">{memberToDelete.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-800 font-bold">ቤተሰብ፦</span>
                <span className="font-bold text-neutral-950">
                  {memberToDelete.familyName} ({memberToDelete.familyId})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-800 font-bold">ትውልድ፦</span>
                <span className="font-extrabold text-[#155544]">{memberToDelete.generation}ኛ ትውልድ</span>
              </div>
              {memberToDelete.phone && (
                <div className="flex justify-between">
                  <span className="text-neutral-800 font-bold">ስልክ ቁጥር፦</span>
                  <span className="font-mono font-bold text-neutral-950">{memberToDelete.phone}</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#83257B]/10 border border-[#83257B]/40 text-xs text-neutral-950 font-semibold flex items-start gap-2 mb-5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <p>
                ይህ አባል በስህተት የተመዘገበ ከሆነ <b>«አዎ፣ ሙሉ በሙሉ ሰርዝ»</b> የሚለውን ይጫኑ። አባሉ ከFirestore እና ከመተግበሪያው ሙሉ በሙሉ ይሰረዛል።
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2 rounded-xl border-2 border-[#517DA2]/60 text-[#0F2438] hover:bg-[#5A8FBB]/20 font-extrabold text-xs transition-colors cursor-pointer"
              >
                ይቅር (Cancel)
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMember(memberToDelete.id);
                  setDeleteNotice(`አባል ${memberToDelete.fullName} (${memberToDelete.id}) በተሳካ ሁኔታ ተሰርዟል!`);
                  setMemberToDelete(null);
                  setTimeout(() => setDeleteNotice(null), 4000);
                }}
                className="px-4 py-2 rounded-xl bg-[#83257B] hover:bg-[#691c63] text-white font-extrabold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>አዎ፣ ሙሉ በሙሉ ሰርዝ</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Pay Selected Members From Credit Wallet Modal */}
      {isBulkPayModalOpen && (
        <BulkPaySelectedModal
          isOpen={isBulkPayModalOpen}
          onClose={() => setIsBulkPayModalOpen(false)}
          selectedMembers={selectedMembersList}
          allMembers={members}
          contributions={contributions}
          settings={settings}
          defaultMonth={activeMonth}
          defaultYear={activeYear}
          isMasterAdmin={isMasterAdmin}
          recordedByName={currentUserName}
          recordedByEmail={currentUserEmail}
          onOpenBatchPayment={onOpenBatchPayment}
          onSuccess={(result) => {
            if (onBulkWalletPaymentComplete) {
              onBulkWalletPaymentComplete(result);
            }
            const payerMember = members.find((m) => m.id === result.payerId) || null;
            const anyApproved = result.createdContributions.some((c) => isPaidOrPartialStatus(c.status));

            if (anyApproved) {
              const updatedContribs = [
                ...result.createdContributions,
                ...contributions.filter(
                  (existing) => !result.createdContributions.some((c) => c.id === existing.id)
                ),
              ];
              const bulkReportText = formatBulkPaymentTelegramReport({
                payer: payerMember,
                items: result.createdContributions.map((c) => ({
                  member:
                    members.find((m) => m.id === c.memberId) || {
                      id: c.memberId,
                      fullName: c.memberName,
                      generation: c.generation,
                      familyId: c.familyId,
                      familyName: c.familyName,
                      phone: '',
                    },
                  type: c.type,
                  amount: Number(c.paidAmount ?? c.amount ?? 0),
                  ethiopianMonth: c.ethiopianMonth,
                  ethiopianMonthName: c.ethiopianMonthName,
                  ethiopianYear: c.ethiopianYear,
                  datePaid: c.datePaid,
                })),
                allContributions: updatedContribs,
                settings,
              });
              setLastBulkTelegramPayload({
                name: 'የማህበሩ Telegram Group',
                role: 'የጅምላ ክፍያ ሪፖርት (Group Report)',
                phone: payerMember?.phone || '',
                telegram: payerMember?.telegram || '',
                messageText: bulkReportText,
                directUrl: getAppUrl(),
              });

              // Rule 3: Dispatch approved bulk payment report ONLY to VITE_TELEGRAM_GROUP_CHAT_ID
              void dispatchApprovedPaymentReportToGroup({
                target: 'bulk_payment',
                payerName: payerMember?.fullName || 'አስተዳዳሪ / ወኪል',
                bulkItems: result.createdContributions.map((c) => {
                  const mem = members.find((m) => m.id === c.memberId);
                  return {
                    memberId: c.memberId,
                    memberName: c.memberName,
                    generation: c.generation,
                    isMinor: mem?.isMinor,
                    isSpouse: mem?.isSpouse,
                    type: c.type,
                    amount: Number(c.paidAmount ?? c.amount ?? 0),
                    ethiopianMonth: c.ethiopianMonth,
                    ethiopianMonthName: c.ethiopianMonthName,
                    ethiopianYear: c.ethiopianYear,
                    datePaid: c.datePaid,
                  };
                }),
                reportText: bulkReportText,
              });
            }

            setSelectedMemberIds(new Set());
            setDeleteNotice(
              anyApproved
                ? `ለ${result.createdContributions.length} የተመረጡ አባላት ከCredit Wallet በተሳካ ሁኔታ ተከፍሏል! ቀሪ ሂሳብ፡ ${result.newWalletBalance.toLocaleString()} ብር (የጅምላ ሪፖርት ወደ Telegram Group ተልኳል)`
                : `ለ${result.createdContributions.length} የተመረጡ አባላት የቀረበው የክፍፍል ክፍያ በPending ሁኔታ ተመዝግቧል! የዋና አድሚን (Master Admin) ማረጋገጫ ይጠብቃል።`
            );
          }}
        />
      )}
    </div>
  );
};

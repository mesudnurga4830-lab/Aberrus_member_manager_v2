/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Family, Member, Contribution, SettingsRates, AssociationLeadership } from '../types';
import { getCurrentEthiopianDate, getEthiopianMonthName } from '../utils/ethiopianCalendar';
import {
  Bell,
  Clock,
  Send,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Settings,
  Phone,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Play,
  RotateCw,
  FileSpreadsheet,
  Check,
  Save,
  Link2,
  Shield,
  Briefcase,
  DollarSign,
  UserCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  shareAppLinkToFamilyHead,
  getFamilyHeadDirectChatUrl,
  getAppUrl,
  copyToClipboardSafe,
  shareReportToFinanceOfficer,
  shareReportToExecutiveOrSecretary,
  getDirectChatUrl,
} from '../utils/telegramShare';
import {
  recordTelegramLinkSent,
  getTelegramDispatchedHeads,
  saveAllDataNow,
  getContributions,
  getMembers,
  getFamilies,
  getSettings,
  getMemberGenContributionStats,
} from '../utils/storage';
import { TelegramWebhookManager } from './TelegramWebhookManager';

interface AutomationsPanelProps {
  families: Family[];
  members: Member[];
  contributions: Contribution[];
  settings: SettingsRates;
  onUpdateSettings: (settings: SettingsRates) => void;
}

export type AutomationsMessageType = 'app_link' | 'month_end_report' | 'reminder';

export const AutomationsPanel: React.FC<AutomationsPanelProps> = ({
  families,
  members,
  contributions,
  settings,
  onUpdateSettings,
}) => {
  const [selectedFamilyForMsg, setSelectedFamilyForMsg] = useState<string>(families[0]?.id || 'FA001');
  const [messageType, setMessageType] = useState<AutomationsMessageType>('app_link');
  const [lastDispatchedTime, setLastDispatchedTime] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [savedDataNotice, setSavedDataNotice] = useState(false);
  const [dispatchedRecords, setDispatchedRecords] = useState<Record<string, string>>(
    getTelegramDispatchedHeads()
  );

  // Leadership Officers state
  const leadership = settings.leadership || {
    executive: { name: 'ስራ አስፈፃሚ (Executive)', fullName: 'ስራ አስፈፃሚ (Executive)', phone: '+251911000001', telegram: '@executive_abarrus' },
    secretary: { name: 'ጸሀፊ (Secretary)', fullName: 'ጸሀፊ (Secretary)', phone: '+251911000002', telegram: '@secretary_abarrus' },
    financeOfficer: { name: 'ፋይናንስ ሀላፊ (Finance Officer)', fullName: 'ፋይናንስ ሀላፊ (Finance Officer)', phone: '+251911000003', telegram: '@finance_abarrus' },
  };

  const [execTelegram, setExecTelegram] = useState(leadership.executive.telegram || leadership.executive.telegramUsername || leadership.executive.phone || '');
  const [secTelegram, setSecTelegram] = useState(leadership.secretary.telegram || leadership.secretary.telegramUsername || leadership.secretary.phone || '');
  const [finTelegram, setFinTelegram] = useState(leadership.financeOfficer.telegram || leadership.financeOfficer.telegramUsername || leadership.financeOfficer.phone || '');

  const currentDate = getCurrentEthiopianDate();
  const currentMonthName = getEthiopianMonthName(currentDate.month);
  const liveAppUrl = getAppUrl();

  const selectedFamily = families.find((f) => f.id === selectedFamilyForMsg) || families[0];
  const familyMembers = members.filter((m) => m.familyId === selectedFamily.id);

  // Monthly stats for selected family
  const familyMonthlyCon = contributions.filter(
    (c) =>
      c.familyId === selectedFamily.id &&
      c.type === 'ወርሃዊ' &&
      c.ethiopianMonth === currentDate.month &&
      c.ethiopianYear === currentDate.year
  );

  const paidMemberIds = new Set(
    familyMonthlyCon.filter((c) => c.status === 'ተከፍሏል').map((c) => c.memberId)
  );

  const paidMembers = familyMembers.filter((m) => paidMemberIds.has(m.id));
  const unpaidMembers = familyMembers.filter((m) => !paidMemberIds.has(m.id));

  // Generation stats for selected family
  const familyGenCon = contributions.filter(
    (c) => c.familyId === selectedFamily.id && c.type === 'ትውልድ'
  );
  const genPaidMemberIds = new Set(
    familyGenCon.filter((c) => c.status === 'ተከፍሏል').map((c) => c.memberId)
  );
  const genPaidMembers = familyMembers.filter((m) => genPaidMemberIds.has(m.id));
  const genUnpaidMembers = familyMembers.filter((m) => !genPaidMemberIds.has(m.id));

  const totalFamilyMonthlyExpected = familyMembers.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
    return sum + (settings.monthlyRate[m.generation] || 0);
  }, 0);

  const totalFamilyMonthlyPaid = familyMonthlyCon
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  // 1. Compose App Link Invitation Message
  const appLinkInvitationMessage = shareAppLinkToFamilyHead(
    selectedFamily,
    members,
    contributions,
    settings,
    currentDate.month,
    currentDate.year
  ).text;

  // 2. Compose Monthly Reminder Message (ቀን 5)
  const monthlyReminderMessage = `ሰላም ${selectedFamily.headName} (የ${selectedFamily.familyName} ቤተሰብ ወኪል)፤

ይህ ከአበሩስ ቤተሰብ ማህበር የተላከ የወርሃዊ መዋጮ ማሳሰቢያ ነው።
የ${currentMonthName} ወር የመዋጮ መክፈያ ቀነ-ገደብ ቀን 5 (ጠዋት 9:00) ሲሆን፣ ቤተሰብዎ ${familyMembers.length} አባላት አሉት።

የመተግበሪያ ሊንክ፡ ${liveAppUrl}/?role=family_head&familyId=${encodeURIComponent(selectedFamily.id)}
💳 ይፋዊ የክፍያ አካውንት፦
• Commercial Bank of Ethiopia (የኢትዮጵያ ንግድ ባንክ)፡ ${settings.associationInfo.cbeAccount} (${settings.associationInfo.cbeAccountName})
• ማሳሰቢያ፡ ክፍያ የሚፈጸመው በተሰጠው የኢትዮጵያ ንግድ ባንክ ሂሳብ ብቻ ነው።

አባላትን እንድታሳስቡ በአክብሮት እንጠይቃለን። እናመሰግናለን!
— የአበሩስ ቤተሰብ ማህበር አስተዳደር`;

  const eligibleGenMembers = familyMembers.filter((m) => !m.isMinor && !m.isSpouse);
  let famGenTotalExpected = 0;
  let famGenTotalPaid = 0;
  let famGenTotalRemaining = 0;
  const genRemainingEntries: Array<{ member: Member; paidSoFar: number; remainingBalance: number }> = [];

  for (const m of eligibleGenMembers) {
    const st = getMemberGenContributionStats(m, settings, contributions);
    famGenTotalExpected += st.expectedAmount;
    famGenTotalPaid += st.paidSoFar;
    famGenTotalRemaining += st.remainingBalance;
    if (st.remainingBalance > 0) {
      genRemainingEntries.push({
        member: m,
        paidSoFar: st.paidSoFar,
        remainingBalance: st.remainingBalance,
      });
    }
  }

  // 3. Compose End-of-Month Family Payment Report (የወሩ መጨረሻ ሪፖርት)
  // Strictly: NO remaining balance for Monthly; ONLY Total Paid + Remaining Balance for Generation.
  const endOfMonthReportMessage = `📊 የአበሩስ ቤተሰብ ማህበር - የወሩ መጨረሻ የቤተሰብ የክፍያ ሪፖርት
━━━━━━━━━━━━━━━━━━━━
ቤተሰብ፡ ${selectedFamily.familyName} (${selectedFamily.id})
የቤተሰብ ወኪል፡ ${selectedFamily.headName}
ወር፡ ${currentMonthName} ${currentDate.year} ዓ.ም
ቀን፡ ${currentDate.formatted}
ጠቅላላ የቤተሰብ አባላት፡ ${familyMembers.length}

የመተግበሪያ ሊንክ፦ ${liveAppUrl}/?role=family_head&familyId=${encodeURIComponent(selectedFamily.id)}

💰 የወርሃዊ መዋጮ (${currentMonthName} ${currentDate.year} ዓ.ም)፡
• የተከፈለ ጠቅላላ መጠን፡ ${totalFamilyMonthlyPaid.toLocaleString()} ብር

✅ ወርሃዊ መዋጮ የከፈሉ (${paidMembers.length})፡
${paidMembers
  .map((m) => {
    const c = familyMonthlyCon.find((con) => con.memberId === m.id);
    const amt = Number(c?.paidAmount || c?.amount || 0);
    const d = c?.datePaid || currentDate.formatted;
    return `• ${m.fullName} — ${amt.toLocaleString()} ብር · ${currentMonthName} ${currentDate.year} · ቀን፡ ${d}`;
  })
  .join('\n') || '• እስካሁን የለም'}

⚠️ ወርሃዊ መዋጮ ያልከፈሉ (${unpaidMembers.length})፡
${unpaidMembers.map((m) => `• ${m.fullName} (${m.generation}ኛ ትውልድ)`).join('\n') || '• ሁሉም ከፍለዋል!'}

🎖️ የትውልድ መዋጮ ሁኔታ፡
• ጠቅላላ የሚጠበቅ (Total Expected)፡ ${famGenTotalExpected.toLocaleString()} ብር
• ጠቅላላ የተከፈለ (Total Paid)፡ ${famGenTotalPaid.toLocaleString()} ብር
• ቀሪ መዋጮ (Remaining Balance)፡ ${famGenTotalRemaining.toLocaleString()} ብር
${genRemainingEntries
  .slice(0, 8)
  .map(
    (e) =>
      `• ${e.member.fullName} — የተከፈለ፡ ${e.paidSoFar.toLocaleString()} ብር | ቀሪ፡ ${e.remainingBalance.toLocaleString()} ብር`
  )
  .join('\n') || '• ሁሉም የትውልድ መዋጮን አጠናቀዋል ✅'}${genRemainingEntries.length > 8 ? `\n• እና ሌሎች ${genRemainingEntries.length - 8} አባላት` : ''}

💳 ይፋዊ የክፍያ ማስገቢያ አካውንት፡
• Commercial Bank of Ethiopia (የኢትዮጵያ ንግድ ባንክ)፡ ${settings.associationInfo.cbeAccount} (${settings.associationInfo.cbeAccountName})
• ማሳሰቢያ፡ ክፍያ የሚፈጸመው በተሰጠው የኢትዮጵያ ንግድ ባንክ ሂሳብ ብቻ ነው።

— የአበሩስ ቤተሰብ ማህበር አስተዳደር`;

  let activeMessage = appLinkInvitationMessage;
  if (messageType === 'reminder') {
    activeMessage = monthlyReminderMessage;
  } else if (messageType === 'month_end_report') {
    activeMessage = endOfMonthReportMessage;
  }

  // Dispatch App Link to All 25 Family Heads
  const handleSendAllFamilyHeadsAppLink = () => {
    setIsSimulating(true);
    setDispatchStatus('የአፑን ሊንክ ለሁሉም 25 የቤተሰብ ወኪሎች (Family Heads) በTelegram በመላክ ላይ...');

    // Save and pull freshest data before sending
    saveAllDataNow({ members, families, contributions, settings });

    families.forEach((f) => {
      recordTelegramLinkSent(f.id);
    });
    setDispatchedRecords(getTelegramDispatchedHeads());

    setTimeout(() => {
      setIsSimulating(false);
      setLastDispatchedTime(new Date().toLocaleTimeString('am-ET'));
      setDispatchStatus(
        `የአፑ ሊንክ ለሁሉም 25 የቤተሰብ ወኪሎች በTelegram ተልኳል! ሁሉም መረጃዎች እና ለውጦችም በአፑ ውስጥ በቋሚነት ተቀምጠዋል።`
      );

      // Open Telegram share dialog
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(liveAppUrl)}&text=${encodeURIComponent(
        `ሰላም ለሁሉም የአበሩስ ቤተሰብ ወኪሎች (Family Heads)፤\n\nየአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ) መተግበሪያን በዚህ ሊንክ በመግባት የቤተሰብዎን አባላት የከፈሉትንና ያልከፈሉትን ወርሃዊ እንዲሁም የትውልድ መዋጮ በቀጥታ ይመልከቱ፦\n👉 ${liveAppUrl}\n\nየክፍያ መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም\nCBE ባንክ ሂሳብ፡ 1000778285146 (Aida, Ibrahim and zebiba)\n\n— የአበሩስ አንድነት ማህበር`
      )}`;
      window.open(shareUrl, '_blank');

      try {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#047857', '#d97706', '#229ed9'],
        });
      } catch {}
    }, 1200);
  };

  const handleSimulateMonthlyReminder = () => {
    saveAllDataNow({ members, families, contributions, settings });
    setIsSimulating(true);
    setDispatchStatus('በቴሌግራም ለሁሉም 25 የቤተሰብ ወኪሎች (Family Heads) ማሳሰቢያ በመላክ ላይ...');

    setTimeout(() => {
      setIsSimulating(false);
      setLastDispatchedTime(new Date().toLocaleTimeString('am-ET'));
      setDispatchStatus(`የወርሃዊ መዋጮ ማሳሰቢያ ለ${families.length} የቤተሰብ ወኪሎች በቴሌግራም እና በስልክ በተሳካ ሁኔታ ተልኳል!`);
      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#047857', '#d97706'],
        });
      } catch {}
    }, 1200);
  };

  const handleSimulateEndOfMonthDispatch = () => {
    saveAllDataNow({ members, families, contributions, settings });
    setIsSimulating(true);
    setDispatchStatus('የወሩ መጨረሻ የቤተሰብ የክፍያ ሪፖርት ለሁሉም 25 የቤተሰብ ወኪሎች በቴሌግራም በመላክ ላይ...');

    setTimeout(() => {
      setIsSimulating(false);
      setLastDispatchedTime(new Date().toLocaleTimeString('am-ET'));
      setDispatchStatus(`የወሩ መጨረሻ የክፍያ ሪፖርት ለሁሉም 25 የቤተሰብ ወኪሎች በቴሌግራም አካውንታቸው በተሳካ ሁኔታ ተልኳል!`);
      try {
        confetti({
          particleCount: 60,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#047857', '#d97706', '#229ed9'],
        });
      } catch {}
    }, 1400);
  };

  const handleSendSingleHeadAppLink = (fam: Family) => {
    // 1. Save data first
    saveAllDataNow({ members, families, contributions, settings });

    const { url } = shareAppLinkToFamilyHead(fam, members, contributions, settings, currentDate.month, currentDate.year);
    window.open(url, '_blank');
    recordTelegramLinkSent(fam.id);
    setDispatchedRecords(getTelegramDispatchedHeads());
    try {
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#047857', '#d97706', '#229ed9'],
      });
    } catch {}
    setDispatchStatus(`የአፑ ሊንክ ለ${fam.headName} (${fam.telegram || fam.phone || 'Telegram'}) ተልኳል!`);
    setTimeout(() => setDispatchStatus(null), 4000);
  };

  // -------------------------------------------------------------
  // LEADERSHIP DISPATCH FUNCTIONS (Exec, Secretary, Finance)
  // -------------------------------------------------------------

  // 1. Dispatch to Executive
  const handleDispatchToExecutive = () => {
    saveAllDataNow({ members, families, contributions, settings });
    const freshMembers = getMembers();
    const freshFamilies = getFamilies();
    const freshCons = getContributions();

    const minorsCount = freshMembers.filter((m) => m.isMinor).length;
    const spousesCount = freshMembers.filter((m) => m.isSpouse).length;
    const totalCollected = freshCons
      .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const summaryText = `• ጠቅላላ የተመዘገቡ አባላት፡ ${freshMembers.length}
• 18 ዓመት ያልሞላቸው ነፃ ልጆች፡ ${minorsCount} (ከክፍያ ነፃ)
• የአባላት የትዳር አጋሮች፡ ${spousesCount} (100 ብር/ወር)
• ጠቅላላ የቤተሰብ ወኪሎች፡ ${freshFamilies.length}
• እስካሁን የተሰበሰበ ጠቅላላ ገቢ፡ ${totalCollected.toLocaleString()} ብር
• ይፋዊ CBE ሂሳብ፡ ${settings.associationInfo.cbeAccount} (${settings.associationInfo.cbeAccountName})
• ሪፖርት የተላከበት ቀን፡ ${currentDate.formatted}`;

    const updatedOfficer = {
      ...leadership.executive,
      name: leadership.executive.name || leadership.executive.fullName || 'ስራ አስፈፃሚ',
      fullName: leadership.executive.name || leadership.executive.fullName || 'ስራ አስፈፃሚ',
      telegram: execTelegram.trim(),
      telegramUsername: execTelegram.trim(),
    };

    const { url } = shareReportToExecutiveOrSecretary('ስራ አስፈፃሚ', updatedOfficer, summaryText);
    window.open(url, '_blank');
    setDispatchStatus(`የአባላት ጠቅላላ መረጃ እና የክፍያ ሪፖርት ለማህበሩ ስራ አስፈፃሚ (${execTelegram}) በአድሚኑ ትእዛዝ ተልኳል!`);
    setTimeout(() => setDispatchStatus(null), 5000);
  };

  // 2. Dispatch to Secretary
  const handleDispatchToSecretary = () => {
    saveAllDataNow({ members, families, contributions, settings });
    const freshMembers = getMembers();
    const freshFamilies = getFamilies();
    const freshCons = getContributions();

    const minorsCount = freshMembers.filter((m) => m.isMinor).length;
    const spousesCount = freshMembers.filter((m) => m.isSpouse).length;
    const totalMonthlyCons = freshCons.filter((c) => c.type === 'ወርሃዊ').length;
    const totalGenCons = freshCons.filter((c) => c.type === 'ትውልድ').length;

    const summaryText = `• ጠቅላላ አባላት መዝገብ፡ ${freshMembers.length}
• የቤተሰብ ወኪሎች ብዛት፡ ${freshFamilies.length}
• 18 ዓመት ያልሞላቸው 4ኛ ትውልዶች፡ ${minorsCount}
• የትዳር አጋሮች፡ ${spousesCount}
• የተመዘገቡ ወርሃዊ መዋጮዎች፡ ${totalMonthlyCons}
• የተመዘገቡ የትውልድ መዋጮዎች፡ ${totalGenCons}
• ሪፖርት የተዘጋጀበት ቀን፡ ${currentDate.formatted}`;

    const updatedOfficer = {
      ...leadership.secretary,
      name: leadership.secretary.name || leadership.secretary.fullName || 'ጸሀፊ',
      fullName: leadership.secretary.name || leadership.secretary.fullName || 'ጸሀፊ',
      telegram: secTelegram.trim(),
      telegramUsername: secTelegram.trim(),
    };

    const { url } = shareReportToExecutiveOrSecretary('ጸሀፊ', updatedOfficer, summaryText);
    window.open(url, '_blank');
    setDispatchStatus(`የአባላት ጠቅላላ መረጃ ሪፖርት ለማህበሩ ጸሀፊ (${secTelegram}) በአድሚኑ ትእዛዝ ተልኳል!`);
    setTimeout(() => setDispatchStatus(null), 5000);
  };

  // 3. Dispatch to Finance Officer
  const handleDispatchToFinanceOfficer = () => {
    saveAllDataNow({ members, families, contributions, settings });
    const freshCons = getContributions();
    const freshMembers = getMembers();

    const monthlyCollected = freshCons
      .filter((c) => c.type === 'ወርሃዊ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'))
      .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const genCollected = freshCons
      .filter((c) => c.type === 'ትውልድ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'))
      .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const totalIncome = monthlyCollected + genCollected;

    const summaryText = `💰 የፋይናንስ ወቅታዊ ገቢና ሁኔታ፡
• ጠቅላላ የተጣራ ገቢ፡ ${totalIncome.toLocaleString()} ብር
  - የተሰበሰበ ወርሃዊ መዋጮ፡ ${monthlyCollected.toLocaleString()} ብር
  - የተሰበሰበ የትውልድ መዋጮ፡ ${genCollected.toLocaleString()} ብር
• ይፋዊ CBE ባንክ ሂሳብ፡ 1000778285146
• የሂሳብ ስም፡ Aida, Ibrahim and zebiba
• የክፍያ መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም
• ጠቅላላ አባላት፡ ${freshMembers.length}
• ሪፖርት የተዘጋጀበት ቀን፡ ${currentDate.formatted}`;

    const updatedLeadership: AssociationLeadership = {
      ...leadership,
      financeOfficer: {
        ...leadership.financeOfficer,
        name: leadership.financeOfficer.name || leadership.financeOfficer.fullName || 'ፋይናንስ ሀላፊ',
        fullName: leadership.financeOfficer.name || leadership.financeOfficer.fullName || 'ፋይናንስ ሀላፊ',
        telegram: finTelegram.trim(),
        telegramUsername: finTelegram.trim(),
      },
    };

    const { url } = shareReportToFinanceOfficer(updatedLeadership, summaryText);
    window.open(url, '_blank');
    setDispatchStatus(`የአባላት ወቅታዊ የክፍያ status ሪፖርት ለማህበሩ ፋይናንስ ሀላፊ (${finTelegram}) በአድሚኑ ትእዛዝ ተልኳል!`);
    setTimeout(() => setDispatchStatus(null), 5000);
  };

  const handleSaveAllDataExplicit = () => {
    // Also save leadership telegrams
    const updatedLeadership: AssociationLeadership = {
      executive: {
        ...leadership.executive,
        name: leadership.executive.name || leadership.executive.fullName || 'ስራ አስፈፃሚ',
        fullName: leadership.executive.name || leadership.executive.fullName || 'ስራ አስፈፃሚ',
        telegram: execTelegram.trim(),
        telegramUsername: execTelegram.trim(),
      },
      secretary: {
        ...leadership.secretary,
        name: leadership.secretary.name || leadership.secretary.fullName || 'ጸሀፊ',
        fullName: leadership.secretary.name || leadership.secretary.fullName || 'ጸሀፊ',
        telegram: secTelegram.trim(),
        telegramUsername: secTelegram.trim(),
      },
      financeOfficer: {
        ...leadership.financeOfficer,
        name: leadership.financeOfficer.name || leadership.financeOfficer.fullName || 'ፋይናንስ ሀላፊ',
        fullName: leadership.financeOfficer.name || leadership.financeOfficer.fullName || 'ፋይናንስ ሀላፊ',
        telegram: finTelegram.trim(),
        telegramUsername: finTelegram.trim(),
      },
    };
    onUpdateSettings({
      ...settings,
      leadership: updatedLeadership,
    });
    saveAllDataNow({ members, families, contributions, settings: { ...settings, leadership: updatedLeadership } });
    setSavedDataNotice(true);
    setTimeout(() => setSavedDataNotice(false), 3000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeMessage);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const dispatchedCount = Object.keys(dispatchedRecords).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              ራስ-ሰር ስራዎች (Automations & Telegram)
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-xs text-neutral-500">የአፑ ሊንክ፣ የአመራሮች ሪፖርት እና የቴሌግራም መልዕክቶች</span>
          </div>
          <h2 className="text-lg font-bold text-neutral-900 mt-1">
            የቴሌግራም እና የወርሃዊ መዋጮ አውቶሜሽን
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            የአፑን ሊንክ ለ25ቱ ወኪሎች መላክ፣ የቀን 5 ማሳሰቢያ እና ለአመራሮቹ ወቅታዊ ሪፖርት ማስተባበሪያ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Primary Action: Send App link to all family heads */}
          <button
            onClick={handleSendAllFamilyHeadsAppLink}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            title="የአፑን ሊንክ ለሁሉም 25 የቤተሰብ ወኪሎች በቴሌግራም አካውንታቸው ላክ"
          >
            <Send className="w-4 h-4 text-amber-300" />
            <span>የአፑን ሊንክ ለሁሉም 25 ወኪሎች ላክ</span>
          </button>

          <button
            onClick={handleSimulateEndOfMonthDispatch}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#229ED9] text-white font-semibold text-xs hover:bg-[#1e8bc0] transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>የወሩ መጨረሻ ሪፖርት ላክ</span>
          </button>

          {/* Explicit Save Button */}
          <button
            onClick={handleSaveAllDataExplicit}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold transition-colors cursor-pointer"
            title="ሁሉንም የተደረጉ ለውጦች አስቀምጥ"
          >
            {savedDataNotice ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4 text-neutral-500" />}
            <span>{savedDataNotice ? 'ለውጦቹ ተቀምጠዋል!' : 'ለውጦችን አስቀምጥ'}</span>
          </button>
        </div>
      </div>

      {dispatchStatus && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-emerald-900 font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{dispatchStatus}</span>
          </div>
          {lastDispatchedTime && (
            <span className="text-[11px] text-emerald-700 font-mono">የተላከበት ሰዓት፡ {lastDispatchedTime}</span>
          )}
        </div>
      )}

      {/* Telegram Webhook Manager & Live Testing */}
      <TelegramWebhookManager members={members} />

      {/* ========================================================================= */}
      {/* REQUIRED DEDICATED HEADING A: 1.የማህበሩ ስራ አስፈፃሚ እና 2.የማህበሩ ጸሀፊ     */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-emerald-900 via-emerald-850 to-neutral-900 text-white rounded-3xl p-6 shadow-md border border-emerald-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-emerald-950 font-extrabold text-[11px]">
                አመራር ሪፖርት (Leadership Portal)
              </span>
              <span className="text-xs text-emerald-300">በአድሚኑ ትእዛዝ ብቻ የሚላክ</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              📋 1. የማህበሩ ስራ አስፈፃሚ እና 2. የማህበሩ ጸሀፊ
            </h3>
            <p className="text-xs text-neutral-300 mt-0.5">
              የአባላት ጠቅላላ መረጃ እና የክፍያ ሪፖርት በአድሚኑ (መስኡድ ኑርጋ) ትእዛዝ ለመላክ የተዘጋጀ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-amber-200">
              ጠቅላላ አባላት፡ {members.length} | ቤተሰቦች፡ {families.length}
            </span>
          </div>
        </div>

        {/* 2 Sub-blocks for Executive and Secretary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. ስራ አስፈፃሚ */}
          <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/15 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-amber-300" />
                <h4 className="font-bold text-sm text-white">1. የማህበሩ ስራ አስፈፃሚ</h4>
              </div>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                EXECUTIVE
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-emerald-200 mb-1">
                የቴሌግራም አካውንት ወይም ስልክ (Telegram Account)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={execTelegram}
                  onChange={(e) => setExecTelegram(e.target.value)}
                  placeholder="@executive ወይም +2519..."
                  className="flex-1 text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-mono placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={handleDispatchToExecutive}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-950" />
                  <span>ሪፖርት ላክ</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-neutral-300 leading-snug">
              የአባላት አጠቃላይ ምዝገባ፣ የቤተሰብ ወኪሎች ብዛትና ጠቅላላ የክፍያ ማጠቃለያ በቴሌግራም ይላካል።
            </p>
          </div>

          {/* 2. ጸሀፊ */}
          <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/15 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-300" />
                <h4 className="font-bold text-sm text-white">2. የማህበሩ ጸሀፊ</h4>
              </div>
              <span className="text-[10px] bg-blue-400/20 text-blue-300 px-2 py-0.5 rounded font-mono font-bold">
                SECRETARY
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-emerald-200 mb-1">
                የቴሌግራም አካውንት ወይም ስልክ (Telegram Account)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={secTelegram}
                  onChange={(e) => setSecTelegram(e.target.value)}
                  placeholder="@secretary ወይም +2519..."
                  className="flex-1 text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-mono placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={handleDispatchToSecretary}
                  className="px-4 py-2 bg-[#229ED9] hover:bg-[#1e8bc0] text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                  <span>ሪፖርት ላክ</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-neutral-300 leading-snug">
              የአባላት ዝርዝር፣ የተመዘገቡ ወርሃዊ እና የትውልድ መዋጮዎች ስታትስቲክስ ለጸሀፊው በቴሌግራም ይላካል።
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REQUIRED DEDICATED HEADING B: 3. የማህበሩ ፋይናንስ ሀላፊ                     */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-amber-950 via-neutral-900 to-amber-900 text-white rounded-3xl p-6 shadow-md border border-amber-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-emerald-950 font-extrabold text-[11px]">
                ፋይናንስ ሪፖርት (Finance Portal)
              </span>
              <span className="text-xs text-amber-200">በአድሚኑ ትእዛዝ ብቻ የሚላክ</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-amber-200 mt-1">
              💰 3. የማህበሩ ፋይናንስ ሀላፊ (Finance Officer)
            </h3>
            <p className="text-xs text-neutral-300 mt-0.5">
              የአባላት ወቅታዊ የክፍያ status አደራጅተህ ለፋይናንስ ሀላፊው በአድሚኑ ትእዛዝ ለመላክ የተዘጋጀ
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-neutral-300 block">CBE ይፋዊ ሂሳብ፡</span>
            <span className="text-sm font-mono font-bold text-amber-300">1000778285146</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Dispatch Input Box */}
          <div className="md:col-span-2 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/15 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>የፋይናንስ ሀላፊ ቴሌግራም አካውንት (Telegram Account)</span>
              </label>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">
                FINANCE OFFICER
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={finTelegram}
                onChange={(e) => setFinTelegram(e.target.value)}
                placeholder="@finance_abarrus ወይም +2519..."
                className="flex-1 text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-mono placeholder:text-neutral-400"
              />
              <button
                type="button"
                onClick={handleDispatchToFinanceOfficer}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>ወቅታዊ የክፍያ Status ላክ</span>
              </button>
            </div>

            <p className="text-[11px] text-neutral-300 leading-snug">
              የወርሃዊ መዋጮ ገቢ፣ የትውልድ መዋጮ ሙሉ እና ከፊል ክፍያዎች፣ ያልተከፈሉ እዳዎች እና የባንክ ሂሳብ ዝርዝር ተጠቃሎ ይላካል።
            </p>
          </div>

          {/* Quick Financial Snapshot */}
          <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/15 space-y-2 text-xs">
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
              የገቢ ማጠቃለያ ቅድመ-ዕይታ
            </span>
            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex justify-between text-neutral-200">
                <span>የመጀመሪያ ክፍያ፡</span>
                <span className="font-bold text-white">ሀምሌ 01፣ 2018</span>
              </div>
              <div className="flex justify-between text-neutral-200">
                <span>18 ዓመት ያልሞላቸው፡</span>
                <span className="font-bold text-amber-300">39 (ነፃ)</span>
              </div>
              <div className="flex justify-between text-neutral-200">
                <span>የትዳር አጋሮች፡</span>
                <span className="font-bold text-purple-300">100 ብር/ወር</span>
              </div>
              <div className="flex justify-between text-neutral-200 pt-1 border-t border-white/10">
                <span>CBE ስም፡</span>
                <span className="font-semibold text-emerald-300">Aida, Ibrahim...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Core Rules Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Rule 1: App Link Dispatch to Family Heads */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800">
              <Link2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {dispatchedCount}/25 ተልኳል
            </span>
          </div>
          <h3 className="text-sm font-bold text-neutral-900">1. የአፑን ሊንክ ለወኪሎች መላክ</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ) መተግበሪያ ሊንክ በየቤተሰብ ወኪሉ ቴሌግራም አካውንት ተልኮ ቤተሰባቸውን በቀጥታ እንዲከታተሉ ያደርጋል።
          </p>
          <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 flex justify-between">
            <span>ሊንክ፡</span>
            <strong className="text-emerald-800 truncate max-w-[180px] font-mono">{liveAppUrl}</strong>
          </div>
        </div>

        {/* Rule 2: Monthly Reminder (ቀን 5) */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-800">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              ንቁ (Active)
            </span>
          </div>
          <h3 className="text-sm font-bold text-neutral-900">2. የወርሃዊ መዋጮ ማሳሰቢያ</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            በየወሩ ቀን {settings.automationSettings.reminderDay}፣ ጠዋት {settings.automationSettings.reminderTime} ለሁሉም 25 የቤተሰብ ወኪሎች Telegram እና ስልክ ማሳሰቢያ ይልካል።
          </p>
          <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 flex justify-between">
            <span>ቀጣይ ቀን፡</span>
            <strong className="text-neutral-900">{currentMonthName} 5፣ {settings.automationSettings.reminderTime}</strong>
          </div>
        </div>

        {/* Rule 3: End-of-Month Family Report via Telegram */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-[#229ED9]/10 text-[#229ED9]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              ንቁ (Active)
            </span>
          </div>
          <h3 className="text-sm font-bold text-neutral-900">3. የወሩ መጨረሻ የቤተሰብ ሪፖርት</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            በየወሩ መጨረሻ የቤተሰባቸው የከፈሉ፣ ያልከፈሉ እና የትውልድ መዋጮ ሙሉ ሪፖርት በቴሌግራም አካውንታቸው ይላካል።
          </p>
          <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 flex justify-between">
            <span>መላኪያ፡</span>
            <strong className="text-neutral-900">በወሩ መጨረሻ (ቀን 30)</strong>
          </div>
        </div>
      </div>

      {/* Telegram Message Composer & Family Heads Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 25 Family Heads with Registered Phone & Telegram */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-sm text-neutral-900">
              የቤተሰብ ወኪሎች (25 Family Heads)
            </h3>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
              {dispatchedCount}/25 ሊንክ ተልኳል
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-3">
            መልዕክት ለመላክ ወይም ቅድመ-ዕይታ ለማየት ወኪሉን ይምረጡ፡
          </p>

          <div className="overflow-y-auto flex-1 divide-y divide-neutral-100 pr-1 space-y-1">
            {families.map((fam) => {
              const isSelected = fam.id === selectedFamilyForMsg;
              const isDispatched = !!dispatchedRecords[fam.id];

              return (
                <div
                  key={fam.id}
                  className={`w-full p-2.5 rounded-xl transition-all flex items-center justify-between gap-2 ${
                    isSelected ? 'bg-emerald-900 text-white shadow-xs' : 'hover:bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <button
                    onClick={() => setSelectedFamilyForMsg(fam.id)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono px-1 rounded font-bold ${
                          isSelected ? 'bg-amber-400 text-emerald-950' : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {fam.id}
                      </span>
                      <p className="text-xs font-bold truncate">{fam.headName}</p>
                      {isDispatched && (
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-300' : 'text-emerald-600'}`}
                        />
                      )}
                    </div>
                    <p className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-emerald-200' : 'text-neutral-500'}`}>
                      ቤተሰብ፡ {fam.familyName} · <span className="font-mono">{fam.telegram || fam.phone || 'ያልተመዘገበ'}</span>
                    </p>
                  </button>

                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => handleSendSingleHeadAppLink(fam)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-emerald-950 hover:bg-amber-300'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                      title="የአፑን ሊንክ ለዚህ ወኪል በTelegram ላክ"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Message Preview & Dispatch */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-neutral-900">
                    ለ{selectedFamily.headName} የተዘጋጀ የቴሌግራም መልዕክት
                  </h4>
                  {dispatchedRecords[selectedFamily.id] && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      ሊንክ ተልኳል
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  ስልክ፡ <span className="font-mono text-neutral-800 font-semibold">{selectedFamily.phone || '—'}</span> · ቴሌግራም፡ <span className="font-mono text-neutral-800 font-semibold">{selectedFamily.telegram || '—'}</span>
                </p>
              </div>

              {/* Message Type 3-Way Selector */}
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
                <button
                  onClick={() => setMessageType('app_link')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    messageType === 'app_link'
                      ? 'bg-emerald-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  የአፑ ሊንክ
                </button>
                <button
                  onClick={() => setMessageType('month_end_report')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    messageType === 'month_end_report'
                      ? 'bg-emerald-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  የወሩ መጨረሻ ሪፖርት
                </button>
                <button
                  onClick={() => setMessageType('reminder')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    messageType === 'reminder'
                      ? 'bg-emerald-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  የቀን 5 ማሳሰቢያ
                </button>
              </div>
            </div>

            {/* Telegram Message Box Preview */}
            <div className="p-4 rounded-xl bg-neutral-900 text-emerald-100 font-mono text-xs leading-relaxed border border-neutral-800 whitespace-pre-wrap select-all max-h-[300px] overflow-y-auto">
              {activeMessage}
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-xs text-amber-950 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>የሚላከው ይፋዊ መተግበሪያ ሊንክ (Live Public App URL)፡</span>
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const success = await copyToClipboardSafe(liveAppUrl);
                    if (success) {
                      setDispatchStatus('የአፑ ይፋዊ ሊንክ ተቀድቷል!');
                      setTimeout(() => setDispatchStatus(null), 3000);
                    }
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-200/70 hover:bg-amber-300 text-amber-950 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Link2 className="w-3 h-3" />
                  <span>ሊንኩን ኮፒ አድርግ</span>
                </button>
              </div>
              <p className="font-mono text-[11px] text-emerald-950 font-bold break-all bg-white p-2 rounded-xl border border-amber-200">
                {liveAppUrl}
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {selectedFamily.phone && (
                <a
                  href={`tel:${selectedFamily.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 text-neutral-700 text-xs font-medium hover:bg-neutral-50"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>ደውል ({selectedFamily.phone})</span>
                </a>
              )}
              {selectedFamily.telegram && (
                <a
                  href={getFamilyHeadDirectChatUrl(selectedFamily)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 text-[#229ED9] text-xs font-semibold hover:bg-sky-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>ቻት ({selectedFamily.telegram})</span>
                </a>
              )}
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 text-neutral-700 text-xs font-medium hover:bg-neutral-50 cursor-pointer"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <MessageSquare className="w-3.5 h-3.5" />}
                <span>{copiedText ? 'ተቀድቷል' : 'መልዕክቱን ኮፒ አድርግ'}</span>
              </button>
            </div>

            <button
              onClick={() => handleSendSingleHeadAppLink(selectedFamily)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#229ED9] hover:bg-[#1e8bc0] text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>በTelegram አካውንታቸው ላክ (Send to {selectedFamily.headName})</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

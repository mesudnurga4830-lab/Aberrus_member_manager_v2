/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Member, Family, AssociationLeadership, Contribution, SettingsRates } from '../types';
import {
  APP_CURRENT_VERSION,
  getContributions,
  getSettings,
  getEffectiveMonthlyRate,
  getMemberGenContributionStats,
} from './storage';
import { getEthiopianMonthName } from './ethiopianCalendar';

// Canonical Public Shared URL accessible to any recipient on mobile without login barrier
export const PUBLIC_SHARED_APP_URL =
  'https://ais-pre-m2yi2k7mkfljr6u6wey5u2-772686905687.europe-west2.run.app';

const CUSTOM_APP_URL_KEY = 'abarrus_custom_public_url_v4';

export function getCustomPublicAppUrl(): string | null {
  try {
    return localStorage.getItem(CUSTOM_APP_URL_KEY);
  } catch {
    return null;
  }
}

export function setCustomPublicAppUrl(url: string): void {
  try {
    if (url && url.trim()) {
      localStorage.setItem(CUSTOM_APP_URL_KEY, url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem(CUSTOM_APP_URL_KEY);
    }
  } catch {}
}

export function getAppUrl(): string {
  // 1. Check if user configured a custom published URL
  const custom = getCustomPublicAppUrl();
  if (custom) return custom;

  // 2. Check current window location
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const origin = window.location.origin;

    // Converting 'ais-dev-' to 'ais-pre-' gives the public preview route!
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }

    // If already on ais-pre- or a custom public production domain (not localhost)
    if (origin.includes('ais-pre-') || (!origin.includes('localhost') && !origin.includes('127.0.0.1'))) {
      return origin;
    }
  }

  return PUBLIC_SHARED_APP_URL;
}

export async function copyToClipboardSafe(text: string): Promise<boolean> {
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  // Fallback for mobile in-app browsers
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

// Format phone number to clean international E.164 string (+251...)
export function normalizeEthiopianPhone(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('09') || clean.startsWith('07')) {
    clean = '+251' + clean.substring(1);
  } else if (clean.startsWith('251') && !clean.startsWith('+')) {
    clean = '+' + clean;
  } else if (clean.startsWith('9') && clean.length === 9) {
    clean = '+251' + clean;
  }
  return clean;
}

// Telegram chat URL for phone number or username
export function getDirectChatUrl(contact: string): string {
  const tg = (contact || '').trim().replace(/\s+/g, '');
  if (tg.startsWith('@')) {
    return `https://t.me/${tg.replace('@', '')}`;
  }
  const normPhone = normalizeEthiopianPhone(tg);
  if (normPhone) {
    return `https://t.me/${normPhone}`;
  }
  if (tg.startsWith('+')) {
    return `https://t.me/${tg}`;
  }
  return 'https://t.me';
}

export function getTelegramPhoneUrl(phone: string): string {
  const norm = normalizeEthiopianPhone(phone);
  return norm ? `https://t.me/${norm}` : 'https://t.me';
}

export function getSmsUrl(phone: string, text: string): string {
  const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : '';
  return `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
}

export function getFamilyHeadDirectChatUrl(family: Family): string {
  return getDirectChatUrl(family.telegram || family.phone || '');
}

/**
 * Formats an individual payment receipt message for Telegram according to strict rules:
 * - Monthly ('ወርሃዊ'): Shows ONLY paid amount, month name, and payment date (NO remaining balance).
 * - Generation ('ትውልድ'): Shows paid amount, date, Total Paid, and Remaining Balance
 *   (Total Expected Generation Contribution - Total Paid Generation Contribution).
 */
export function formatSinglePaymentTelegramReport(
  contribution: Contribution,
  member: Member | undefined,
  allContributions: Contribution[] = getContributions(),
  settings: SettingsRates = getSettings()
): string {
  const paidAmt = Number(contribution.paidAmount ?? contribution.amount ?? 0);
  const datePaid =
    contribution.datePaid || new Date().toLocaleDateString('am-ET');
  const memberName = member?.fullName || contribution.memberName || 'አባል';
  const memberId = member?.id || contribution.memberId;

  if (contribution.type === 'ትውልድ') {
    const genStats = member
      ? getMemberGenContributionStats(member, settings, allContributions)
      : (() => {
          const genContribs = allContributions.filter(
            (c) =>
              c.memberId === memberId &&
              c.type === 'ትውልድ' &&
              (c.status === 'ተከፍሏል' ||
                c.status === 'ከፊል' ||
                String(c.status).toLowerCase() === 'paid' ||
                String(c.status).toLowerCase() === 'partial')
          );
          const paidSoFar = genContribs.reduce(
            (sum, c) => sum + Number(c.paidAmount ?? c.amount ?? 0),
            0
          );
          const expectedAmount =
            settings.generationPayment[contribution.generation] ?? 500;
          return {
            expectedAmount,
            paidSoFar,
            remainingBalance: Math.max(expectedAmount - paidSoFar, 0),
          };
        })();

    return `🏛️ የአበሩስ አንድነት ማህበር — የትውልድ መዋጮ የክፍያ ሪፖርት
━━━━━━━━━━━━━━━━━━━━
👤 አባል፦ ${memberName} (${memberId})
🏷️ የክፍያ ዓይነት፦ የትውልድ መዋጮ
💵 የተከፈለ መጠን፦ ${paidAmt.toLocaleString()} ብር
📅 የክፍያ ቀን፦ ${datePaid}

📊 የትውልድ መዋጮ ማጠቃለያ፦
• ጠቅላላ የተከፈለ (Total Paid)፦ ${genStats.paidSoFar.toLocaleString()} ብር
• ቀሪ መዋጮ (Remaining Balance)፦ ${genStats.remainingBalance.toLocaleString()} ብር
━━━━━━━━━━━━━━━━━━━━
— የአበሩስ አንድነት ማህበር`;
  }

  // Monthly contribution ('ወርሃዊ') — STRICTLY NO remaining balance!
  const monthName =
    contribution.ethiopianMonthName ||
    getEthiopianMonthName(contribution.ethiopianMonth || 11);
  const year = contribution.ethiopianYear || 2018;

  return `🏛️ የአበሩስ አንድነት ማህበር — የወርሃዊ መዋጮ የክፍያ ሪፖርት
━━━━━━━━━━━━━━━━━━━━
👤 አባል፦ ${memberName} (${memberId})
🏷️ የክፍያ ዓይነት፦ ወርሃዊ መዋጮ
💵 የተከፈለው መጠን፦ ${paidAmt.toLocaleString()} ብር
📅 የወሩ ስም፦ ${monthName} ${year} ዓ.ም
🗓️ የክፍያ ቀን፦ ${datePaid}
━━━━━━━━━━━━━━━━━━━━
— የአበሩስ አንድነት ማህበር`;
}

export interface BulkTelegramPaymentItem {
  member: Member;
  type: Contribution['type'];
  amount: number;
  ethiopianMonth?: number;
  ethiopianMonthName?: string;
  ethiopianYear?: number;
  datePaid?: string;
}

/**
 * Formats a bulk/batch payment report for Telegram:
 * - For each member in the list:
 *   - If Generation ('ትውልድ'): appends `ቀሪ፡ X ብር` (Total Expected Gen - Total Paid Gen).
 *   - If Monthly ('ወርሃዊ'): shows ONLY paid amount, month name, and payment date; NO remaining info.
 */
export function formatBulkPaymentTelegramReport(params: {
  payer?: Member | null;
  items: BulkTelegramPaymentItem[];
  allContributions?: Contribution[];
  settings?: SettingsRates;
  masterReceiptNumber?: string;
  title?: string;
}): string {
  const {
    payer,
    items,
    allContributions = getContributions(),
    settings = getSettings(),
    masterReceiptNumber,
    title = 'የጅምላ ክፍያ ሪፖርት (Bulk Payment Report)',
  } = params;

  const totalAmount = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const todayStr = new Date().toLocaleDateString('am-ET');

  const lines = items.map((item, idx) => {
    const datePaid = item.datePaid || todayStr;
    if (item.type === 'ትውልድ') {
      const genStats = getMemberGenContributionStats(
        item.member,
        settings,
        allContributions
      );
      return `${idx + 1}. ${item.member.fullName} — የትውልድ መዋጮ፡ ${Number(item.amount).toLocaleString()} ብር | ቀን፡ ${datePaid} | ጠቅላላ የተከፈለ፡ ${genStats.paidSoFar.toLocaleString()} ብር | ቀሪ፡ ${genStats.remainingBalance.toLocaleString()} ብር`;
    }

    const monthName =
      item.ethiopianMonthName ||
      getEthiopianMonthName(item.ethiopianMonth || 11);
    const year = item.ethiopianYear || 2018;
    return `${idx + 1}. ${item.member.fullName} — ወርሃዊ (${monthName} ${year} ዓ.ም)፡ ${Number(item.amount).toLocaleString()} ብር · የክፍያ ቀን፡ ${datePaid}`;
  });

  const payerLine = payer
    ? `💳 ከፋይ አባል፦ ${payer.fullName} (${payer.id})\n`
    : '';
  const receiptLine = masterReceiptNumber
    ? `🧾 የዋና ደረሰኝ ቁጥር፦ ${masterReceiptNumber}\n`
    : '';

  return `🏛️ የአበሩስ አንድነት ማህበር
📋 ${title}
━━━━━━━━━━━━━━━━━━━━
${payerLine}${receiptLine}👥 የተከፈለላቸው አባላት ብዛት፦ ${items.length}
💰 ጠቅላላ የተከፈለ መጠን፦ ${totalAmount.toLocaleString()} ብር
📅 ቀን፦ ${todayStr}

📌 የአባላት ክፍያ ዝርዝር፦
${lines.join('\n') || '• ምንም ክፍያ አልተመዘገበም'}
━━━━━━━━━━━━━━━━━━━━
— የአበሩስ አንድነት ማህበር`;
}

/**
 * Generates an up-to-date shareable message and deep-link for a member.
 * Includes monthly payments (no remaining balance) and generation stats (Total Paid + Remaining Balance).
 */
export function shareAppLinkToMember(
  member: Member,
  allContributions: Contribution[] = getContributions(),
  settings: SettingsRates = getSettings()
): {
  url: string;
  directUrl: string;
  text: string;
  phoneTelegramUrl: string;
  smsUrl: string;
} {
  const baseUrl = getAppUrl();
  const directUrl = `${baseUrl}/?role=member&memberId=${encodeURIComponent(member.id)}&v=${APP_CURRENT_VERSION}`;

  // Member's contribution history
  const memberCons = allContributions.filter((c) => c.memberId === member.id);
  const monthlyRate = getEffectiveMonthlyRate(member, settings);

  let statusSection = '';
  let totalPaidSoFar = 0;

  if (member.isMinor) {
    statusSection = `👶 ሁኔታ፡ የ3ኛ ትውልድ ልጅ (ዕድሜ ከ18 ዓመት በታች)
• ከወርሃዊ እና ከትውልድ መዋጮ ክፍያ ሙሉ በሙሉ ነፃ`;
  } else if (member.isSpouse) {
    const monthlyCons = memberCons.filter((c) => c.type === 'ወርሃዊ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'));
    const monthlyPaid = monthlyCons.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
    totalPaidSoFar = monthlyPaid;

    const paidMonthsText = monthlyCons.length > 0
      ? monthlyCons
          .map(
            (c) =>
              `${getEthiopianMonthName(c.ethiopianMonth)} ${c.ethiopianYear}${c.datePaid ? ` (${c.datePaid})` : ''}`
          )
          .join('፣ ')
      : 'እስካሁን አልተመዘገበም';

    statusSection = `💍 ሁኔታ፡ የአባል የትዳር አጋር
• ወርሃዊ መዋጮ፡ ${monthlyRate} ብር በወር
• ከትውልድ መዋጮ ሙሉ በሙሉ ነፃ
• የተከፈሉ ወራት፡ ${paidMonthsText}
• የተከፈለ ወርሃዊ መጠን፡ ${monthlyPaid.toLocaleString()} ብር`;
  } else {
    // Standard Member: Monthly shows ONLY paid amount, months & dates (ZERO remaining balance).
    // Generation shows Total Paid and Remaining Balance (Total Expected Gen - Total Paid Gen).
    const monthlyCons = memberCons.filter((c) => c.type === 'ወርሃዊ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'));
    const monthlyPaid = monthlyCons.reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const paidMonthsText = monthlyCons.length > 0
      ? monthlyCons
          .map(
            (c) =>
              `${getEthiopianMonthName(c.ethiopianMonth)} ${c.ethiopianYear}${c.datePaid ? ` (${c.datePaid})` : ''}`
          )
          .join('፣ ')
      : 'እስካሁን አልተመዘገበም';

    const genStats = getMemberGenContributionStats(member, settings, allContributions);
    totalPaidSoFar = monthlyPaid + genStats.paidSoFar;

    statusSection = `📊 የወቅቱ ክፍያ ታሪክ፡
• የተከፈሉ ወራት (ወርሃዊ)፡ ${paidMonthsText}
• የተከፈለ ወርሃዊ መጠን፡ ${monthlyPaid.toLocaleString()} ብር

🏛️ የትውልድ መዋጮ፡
• Total Expected: ${genStats.expectedAmount.toLocaleString()} ብር
• Total Paid (ጠቅላላ የተከፈለ)፡ ${genStats.paidSoFar.toLocaleString()} ብር
• Remaining Balance (ቀሪ መዋጮ)፡ ${genStats.remainingBalance.toLocaleString()} ብር (${genStats.status})`;
  }

  const text = `ሰላም ${member.fullName}፤

የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ) ወቅታዊ የክፍያ ሁኔታዎ እና የግል መረጃ መተግበሪያ ሊንክ እንደሚከተለው ተዘጋጅቷል፦

📋 የአባል መረጃ፡
• የአባል መታወቂያ፡ ${member.id}
• ቤተሰብ፡ ${member.familyName} (${member.isSpouse ? 'የትዳር አጋር' : `${member.generation}ኛ ትውልድ`})
• የክፍያ መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም

${statusSection}
• አጠቃላይ የተከፈለ ድምር፡ ${totalPaidSoFar.toLocaleString()} ብር

📲 የግል መረጃዎንና ዲጂታል ካርድዎን በቀጥታ በስልክዎ ለመክፈት፡
👉 ${directUrl}

🏦 የኢትዮጵያ ንግድ ባንክ (CBE) ይፋዊ ሂሳብ፡
• ሂሳብ ቁጥር፡ 1000778285146
• ስም፡ Aida, Ibrahim and zebiba

ማሳሰቢያ፡ ክፍያዎ ሲጠናቀቅ የደረሰኝ ቁጥር በቴሌግራም ወይም በስልክ ለቤተሰብ ወኪልዎ ወይም ለአስተዳዳሪው ያሳውቁ።

— የአበሩስ አንድነት ማህበር`;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(directUrl)}&text=${encodeURIComponent(text)}`;
  const phoneTelegramUrl = getTelegramPhoneUrl(member.phone || '');
  const smsUrl = getSmsUrl(member.phone || '', text);

  return { url: shareUrl, directUrl, text, phoneTelegramUrl, smsUrl };
}

/**
 * Generates an up-to-date shareable message and deep-link for a family representative.
 * Monthly section shows ONLY paid amount, month name, and payment dates (ZERO remaining info).
 * Generation section shows Total Paid and Remaining Balance (Expected - Total Paid Gen).
 */
export function shareAppLinkToFamilyHead(
  family: Family,
  allMembers: Member[] = [],
  allContributions: Contribution[] = getContributions(),
  settings: SettingsRates = getSettings(),
  reportMonth: number = 11,
  reportYear: number = 2018
): {
  url: string;
  directUrl: string;
  directChatUrl: string;
  phoneTelegramUrl: string;
  smsUrl: string;
  text: string;
} {
  const baseUrl = getAppUrl();
  const directUrl = `${baseUrl}/?role=family_head&familyId=${encodeURIComponent(family.id)}&v=${APP_CURRENT_VERSION}`;
  const directChatUrl = getFamilyHeadDirectChatUrl(family);
  const phoneTelegramUrl = getTelegramPhoneUrl(family.phone || '');

  const monthName = getEthiopianMonthName(reportMonth);

  // Calculate family aggregates if members provided
  const familyMembers = allMembers.filter((m) => m.familyId === family.id);
  const familyCons = allContributions.filter((c) => c.familyId === family.id);

  // 1. Monthly contributions for this period (NO remaining balance!)
  const monthCons = familyCons.filter(
    (c) =>
      c.type === 'ወርሃዊ' &&
      Number(c.ethiopianMonth) === reportMonth &&
      Number(c.ethiopianYear) === reportYear
  );
  const paidMonthlyCons = monthCons.filter((c) => {
    const st = String(c.status || '').toLowerCase();
    return st === 'ተከፍሏል' || st === 'paid' || st === 'completed' || st === 'ከፊል' || st === 'partial';
  });
  const monthlyCollected = paidMonthlyCons.reduce(
    (sum, c) => sum + (c.paidAmount || 0),
    0
  );

  const paidMonthlyMemberIds = new Set(
    paidMonthlyCons
      .filter((c) => {
        const st = String(c.status || '').toLowerCase();
        return st === 'ተከፍሏል' || st === 'paid' || st === 'completed';
      })
      .map((c) => c.memberId)
  );

  const paidMonthlyLines = familyMembers
    .filter((m) => paidMonthlyMemberIds.has(m.id))
    .map((m) => {
      const c = paidMonthlyCons.find((con) => con.memberId === m.id);
      const amt = Number(c?.paidAmount || c?.amount || 0);
      const d = c?.datePaid || '—';
      return `• ${m.fullName} — ${amt.toLocaleString()} ብር · ${monthName} ${reportYear} · ቀን፡ ${d}`;
    })
    .join('\n');

  // 2. Generation contributions per eligible member (Total Expected - Total Paid Gen)
  const genEligibleMembers = familyMembers.filter((m) => !m.isMinor && !m.isSpouse);
  const paidOrPartialGenLines: string[] = [];
  const unpaidGenMembers: Array<{ member: Member; remainingBalance: number }> = [];
  let totalGenExpected = 0;
  let totalGenPaid = 0;
  let totalGenRemaining = 0;

  for (const m of genEligibleMembers) {
    const stats = getMemberGenContributionStats(m, settings, familyCons);
    totalGenExpected += stats.expectedAmount;
    totalGenPaid += stats.paidSoFar;
    totalGenRemaining += stats.remainingBalance;

    if (stats.paidSoFar > 0) {
      paidOrPartialGenLines.push(
        `• ${m.fullName} — የተከፈለ፡ ${stats.paidSoFar.toLocaleString()} ብር | ቀሪ፡ ${stats.remainingBalance.toLocaleString()} ብር`
      );
    }
    if (stats.remainingBalance > 0) {
      unpaidGenMembers.push({ member: m, remainingBalance: stats.remainingBalance });
    }
  }

  const formatUnpaidGenGrouped = (): string => {
    if (unpaidGenMembers.length === 0) return '';
    const map: Record<number, Array<{ member: Member; remainingBalance: number }>> = {};
    for (const entry of unpaidGenMembers) {
      const gen = Number(entry.member.generation) || 4;
      if (!map[gen]) map[gen] = [];
      map[gen].push(entry);
    }
    const gens = Object.keys(map).map(Number).sort((a, b) => a - b);
    return gens
      .map((g) => {
        const list = map[g]
          .map((e) => `• ${e.member.fullName} — ቀሪ፡ ${e.remainingBalance.toLocaleString()} ብር`)
          .join('\n');
        return `${g}ኛ ትውልድ\n${list}`;
      })
      .join('\n\n');
  };

  const unpaidGenGrouped = formatUnpaidGenGrouped();

  const text = `🏛️ የአበሩስ አንድነት ማህበር
የመዋጮ ሪፖርት

━━━━━━━━━━━━━━━
👨‍👩‍👧‍👦 ቤተሰብ፦ ${family.familyName}
🔖 ኮድ፦ ${family.id}
👤 ወኪል፦ ${family.headName}
📅 ወቅት፦ ${monthName} ${reportYear} ዓ.ም
👥 አባላት፦ ${familyMembers.length}

━━━━━━━━━━━━━━━
💰 ወርሃዊ መዋጮ (${monthName} ${reportYear} ዓ.ም)
• የተከፈለ ጠቅላላ መጠን፦ ${monthlyCollected.toLocaleString()} ብር
• የከፈሉ አባላት (${paidMonthlyMemberIds.size})፦
${paidMonthlyLines || '• እስካሁን የከፈለ የለም'}

━━━━━━━━━━━━━━━
🏛️ የትውልድ መዋጮ
• ጠቅላላ የሚጠበቅ (Total Expected)፦ ${totalGenExpected.toLocaleString()} ብር
• ጠቅላላ የተከፈለ (Total Paid)፦ ${totalGenPaid.toLocaleString()} ብር
• ቀሪ መዋጮ (Remaining Balance)፦ ${totalGenRemaining.toLocaleString()} ብር

✅ የከፈሉ / በከፊል የከፈሉ
${paidOrPartialGenLines.join('\n') || '• እስካሁን የለም'}

❌ ያልጨረሱ / ያልከፈሉ
${unpaidGenGrouped || '• ሁሉም ከፍለዋል ✅'}

━━━━━━━━━━━━━━━
💳 የባንክ ሂሳብ
• ቁጥር፦ 1000778285146
• ስም፦ Aida, Ibrahim and Zebiba
━━━━━━━━━━━━━━━
🤖 የአበሩስ አንድነት ማህበር`;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(directUrl)}&text=${encodeURIComponent(text)}`;
  const smsUrl = getSmsUrl(family.phone || '', text);

  return { url: shareUrl, directUrl, directChatUrl, phoneTelegramUrl, smsUrl, text };
}

// Share Financial Status Report to Finance Officer
export function shareReportToFinanceOfficer(
  leadership: AssociationLeadership,
  reportSummary: string
): {
  url: string;
  directChatUrl: string;
  phoneTelegramUrl: string;
  smsUrl: string;
  text: string;
} {
  const officer = leadership.financeOfficer;
  const baseUrl = getAppUrl();
  const directChatUrl = getDirectChatUrl(officer.telegram || officer.telegramUsername || officer.phone || officer.phoneNumber || '');
  const phoneTelegramUrl = getTelegramPhoneUrl(officer.phone || officer.phoneNumber || '');

  const text = `📊 ለአበሩስ አንድነት ማህበር ፋይናንስ ሀላፊ
━━━━━━━━━━━━━━━━━━━━
ክቡር ${officer.name || officer.fullName || 'ፋይናንስ ሀላፊ'}፤

የማህበሩ ወቅታዊ የፋይናንስ፣ የወርሃዊ መዋጮ ገቢ እና የትውልድ መዋጮ (የተከፈለና ቀሪ) ሪፖርት እንደሚከተለው ተዘጋጅቷል፦

${reportSummary}

የማህበሩ መተግበሪያ ሊንክ፦
👉 ${baseUrl}/?v=${APP_CURRENT_VERSION}

💳 CBE ይፋዊ ሂሳብ፡ 1000778285146 (Aida, Ibrahim and zebiba)
የክፍያ መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም

— የአበሩስ አንድነት ማህበር አስተዳደር`;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(baseUrl)}&text=${encodeURIComponent(text)}`;
  const smsUrl = getSmsUrl(officer.phone || officer.phoneNumber || '', text);

  return { url: shareUrl, directChatUrl, phoneTelegramUrl, smsUrl, text };
}

// Share General Membership & Operations Report to Executive & Secretary
export function shareReportToExecutiveOrSecretary(
  roleName: 'ስራ አስፈፃሚ' | 'ጸሀፊ',
  targetPerson: { name?: string; fullName?: string; phone?: string; phoneNumber?: string; telegram?: string; telegramUsername?: string },
  reportSummary: string
): {
  url: string;
  directChatUrl: string;
  phoneTelegramUrl: string;
  smsUrl: string;
  text: string;
} {
  const baseUrl = getAppUrl();
  const directChatUrl = getDirectChatUrl(targetPerson.telegram || targetPerson.telegramUsername || targetPerson.phone || targetPerson.phoneNumber || '');
  const phoneTelegramUrl = getTelegramPhoneUrl(targetPerson.phone || targetPerson.phoneNumber || '');

  const text = `📋 ለአበሩስ አንድነት ማህበር ${roleName}
━━━━━━━━━━━━━━━━━━━━
ክቡር ${targetPerson.name || targetPerson.fullName || roleName}፤

የማህበሩ አጠቃላይ የአባላት ምዝገባ፣ የቤተሰብ ወኪሎች እንቅስቃሴ እና የመዋጮ አፈፃፀም ሪፖርት እንደሚከተለው ቀርቧል፦

${reportSummary}

የማህበሩ መተግበሪያ ሊንክ፦
👉 ${baseUrl}/?v=${APP_CURRENT_VERSION}

የክፍያ መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም
— የአበሩስ አንድነት ማህበር አስተዳደር`;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(baseUrl)}&text=${encodeURIComponent(text)}`;
  const smsUrl = getSmsUrl(targetPerson.phone || targetPerson.phoneNumber || '', text);

  return { url: shareUrl, directChatUrl, phoneTelegramUrl, smsUrl, text };
}

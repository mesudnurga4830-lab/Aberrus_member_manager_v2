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
 * Generates an up-to-date shareable message and deep-link for a member.
 * Includes complete updated payment history (monthly + generation) and excludes Pagumen completely.
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
      ? monthlyCons.map((c) => `${getEthiopianMonthName(c.ethiopianMonth)} ${c.ethiopianYear}`).join('፣ ')
      : 'እስካሁን አልተመዘገበም';

    statusSection = `💍 ሁኔታ፡ የአባል የትዳር አጋር
• ወርሃዊ መዋጮ፡ 100 ብር በወር
• ከትውልድ መዋጮ ሙሉ በሙሉ ነፃ
• የተከፈሉ ወራት፡ ${paidMonthsText}
• ጠቅላላ የተከፈለ ወርሃዊ፡ ${monthlyPaid} ብር`;
  } else {
    // Standard Member
    const monthlyCons = memberCons.filter((c) => c.type === 'ወርሃዊ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'));
    const monthlyPaid = monthlyCons.reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const paidMonthsText = monthlyCons.length > 0
      ? monthlyCons.map((c) => `${getEthiopianMonthName(c.ethiopianMonth)} ${c.ethiopianYear}`).join('፣ ')
      : 'እስካሁን አልተመዘገበም';

    const genStats = getMemberGenContributionStats(member, settings, allContributions);
    totalPaidSoFar = monthlyPaid + genStats.paidSoFar;

    statusSection = `📊 የወቅቱ ክፍያ ታሪክ፡
• ወርሃዊ ተመን፡ ${monthlyRate} ብር/ወር
• የተከፈሉ ወራት፡ ${paidMonthsText}
• የተከፈለ ወርሃዊ ድምር፡ ${monthlyPaid} ብር
• የትውልድ መዋጮ ግዴታ፡ ${genStats.expectedAmount} ብር
• የትውልድ የተከፈለ፡ ${genStats.paidSoFar} ብር (ቀሪ፡ ${genStats.remainingBalance} ብር | ${genStats.status})`;
  }

  const text = `ሰላም ${member.fullName}፤

የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ) ወቅታዊ የክፍያ ሁኔታዎ እና የግል መረጃ መተግበሪያ ሊንክ እንደሚከተለው ተዘጋጅቷል፦

📋 የአባል መረጃ፡
• የአባል መታወቂያ፡ ${member.id}
• ቤተሰብ፡ ${member.familyName} (${member.isSpouse ? 'የትዳር አጋር' : `${member.generation}ኛ ትውልድ`})
• የክፍያ መጀመሪያ ቀን፡ ሀምሌ 01፣ 2018 ዓ.ም

${statusSection}
• አጠቃላይ የተከፈለ ድምር፡ ${totalPaidSoFar} ብር

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
 */
export function shareAppLinkToFamilyHead(
  family: Family,
  allMembers: Member[] = [],
  allContributions: Contribution[] = getContributions(),
  settings: SettingsRates = getSettings()
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

  // Calculate family aggregates if members provided
  const familyMembers = allMembers.filter((m) => m.familyId === family.id);
  const activeContributingCount = familyMembers.filter((m) => !m.isMinor).length;
  const minorsCount = familyMembers.filter((m) => m.isMinor).length;

  const familyCons = allContributions.filter((c) => c.familyId === family.id);
  const monthlyCollected = familyCons
    .filter((c) => c.type === 'ወርሃዊ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'))
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);
  const genCollected = familyCons
    .filter((c) => c.type === 'ትውልድ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'))
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  // Calculate detailed monthly and generation members for family
  const monthCons = familyCons.filter((c) => c.type === 'ወርሃዊ');
  const paidMonthlyMembers = familyMembers.filter((m) => {
    const c = monthCons.find((con) => con.memberId === m.id);
    const st = String(c?.status || '').toLowerCase();
    return st === 'ተከፍሏል' || st === 'paid' || st === 'completed';
  });
  const unpaidMonthlyMembers = familyMembers.filter((m) => {
    if (m.isMinor) return false;
    const c = monthCons.find((con) => con.memberId === m.id);
    const st = String(c?.status || '').toLowerCase();
    return !(st === 'ተከፍሏል' || st === 'paid' || st === 'completed');
  });

  const genCons = familyCons.filter((c) => c.type === 'ትውልድ');
  const paidGenMembers = familyMembers.filter((m) => {
    const c = genCons.find((con) => con.memberId === m.id);
    const st = String(c?.status || '').toLowerCase();
    return st === 'ተከፍሏል' || st === 'paid';
  });
  const unpaidGenMembers = familyMembers.filter((m) => {
    if (m.isMinor || m.isSpouse) return false;
    const c = genCons.find((con) => con.memberId === m.id);
    const st = String(c?.status || '').toLowerCase();
    return !(st === 'ተከፍሏል' || st === 'paid');
  });

  // Grouping helper without parentheses
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
      sections.push(`${g}ኛ ትውልድ\n${list}`);
    }
    return sections.join('\n\n');
  };

  const expectedMonthly = familyMembers.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + 100;
    return sum + 50;
  }, 0);
  const monthlyRemaining = Math.max(0, expectedMonthly - monthlyCollected);

  let monthlyUnpaidSection = '';
  if (unpaidMonthlyMembers.length === 0) {
    monthlyUnpaidSection = `❌ ያልከፈሉ፦ 0 አባላት\nሁሉም ከፍለዋል ✅`;
  } else {
    monthlyUnpaidSection = `❌ ያልከፈሉ፦ ${unpaidMonthlyMembers.length} አባላት\n\n` + formatGroupedByGeneration(unpaidMonthlyMembers);
  }

  const paidGenLines = paidGenMembers.map((m) => {
    const c = genCons.find((con) => con.memberId === m.id);
    const amt = Number(c?.paidAmount || c?.amount || 0);
    return `• ${m.fullName} — ${amt.toLocaleString()} ብር`;
  }).join('\n');

  const unpaidGenGrouped = formatGroupedByGeneration(unpaidGenMembers);

  const text = `🏛️ የአበሩስ አንድነት ማህበር
የወርሃዊ መዋጮ ሪፖርት

━━━━━━━━━━━━━━━
👨👩👧👦 ቤተሰብ፦ ${family.familyName}
🔖 ኮድ፦ ${family.id}
👤 ወኪል፦ ${family.headName}
📅 ወቅት፦ ሀምሌ 2018 ዓ.ም
👥 አባላት፦ ${familyMembers.length}

━━━━━━━━━━━━━━━
💰 ወርሃዊ መዋጮ
• የሚጠበቅ፦ ${expectedMonthly.toLocaleString()} ብር
• የተሰበሰበ፦ ${monthlyCollected.toLocaleString()} ብር
• ቀሪ፦ ${monthlyRemaining.toLocaleString()} ብር
${monthlyUnpaidSection}

━━━━━━━━━━━━━━━
🏛️ የትውልድ መዋጮ
• ሙሉ የከፈሉ፦ ${paidGenMembers.length}
• ቀሪ ያልከፈሉ፦ ${unpaidGenMembers.length}

✅ የከፈሉ
${paidGenLines || '• እስካሁን የለም'}

❌ ያልከፈሉ
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

የማህበሩ ወቅታዊ የፋይናንስ፣ የወርሃዊ መዋጮ እና የትውልድ መዋጮ ገቢና ቀሪ እዳ ሪፖርት እንደሚከተለው ተዘጋጅቷል፦

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

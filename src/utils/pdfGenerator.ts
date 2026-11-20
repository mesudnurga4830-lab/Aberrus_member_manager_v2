/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Contribution, Member, Family, SettingsRates } from '../types';
import { getEthiopianMonthName, getCurrentEthiopianDate } from './ethiopianCalendar';
import {
  isPaidStatus,
  isPartialStatus,
  isPaidOrPartialStatus,
  getContributionMonth,
  getContributionYear,
  getContributionPaidAmount,
} from './storage';

interface GenerateReportPdfOptions {
  contributions: Contribution[];
  members: Member[];
  families: Family[];
  settings: SettingsRates;
  selectedMonth: number;
  selectedYear: number;
  familyFilterId?: string;
}

interface LoadedEthiopicFonts {
  regularBase64: string;
  boldBase64: string;
}

let cachedFontsPromise: Promise<LoadedEthiopicFonts | null> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function isValidTtfBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1024) return false;
  const view = new Uint8Array(buffer.slice(0, 4));
  // TrueType sfnt version: 0x00010000 or 'OTTO' (OpenType) or 'true'
  const isSfnt = view[0] === 0x00 && view[1] === 0x01 && view[2] === 0x00 && view[3] === 0x00;
  const isOtto = view[0] === 0x4f && view[1] === 0x54 && view[2] === 0x54 && view[3] === 0x4f;
  return isSfnt || isOtto;
}

async function fetchFontBase64(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!isValidTtfBuffer(buf)) continue;
      return arrayBufferToBase64(buf);
    } catch {
      // Try next URL
    }
  }
  return null;
}

async function loadEthiopicFonts(): Promise<LoadedEthiopicFonts | null> {
  if (cachedFontsPromise) {
    return cachedFontsPromise;
  }

  cachedFontsPromise = (async () => {
    const [regularBase64, boldBase64] = await Promise.all([
      fetchFontBase64([
        '/fonts/NotoSansEthiopic-Regular.ttf',
        'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSansEthiopic/full/ttf/NotoSansEthiopic-Regular.ttf',
      ]),
      fetchFontBase64([
        '/fonts/NotoSansEthiopic-Bold.ttf',
        'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSansEthiopic/full/ttf/NotoSansEthiopic-Bold.ttf',
      ]),
    ]);

    if (!regularBase64) {
      return null;
    }

    return {
      regularBase64,
      boldBase64: boldBase64 || regularBase64,
    };
  })();

  const result = await cachedFontsPromise;
  if (!result) {
    cachedFontsPromise = null;
  }
  return result;
}

function fitTextToWidth(doc: jsPDF, text: string, maxWidthMm: number): string {
  const safeText = String(text || '');
  if (!safeText || doc.getTextWidth(safeText) <= maxWidthMm) {
    return safeText;
  }
  let end = safeText.length;
  while (end > 1 && doc.getTextWidth(safeText.slice(0, end) + '...') > maxWidthMm) {
    end--;
  }
  return safeText.slice(0, end) + '...';
}

export async function generateFinancialReportPdf({
  contributions,
  members,
  families,
  settings,
  selectedMonth,
  selectedYear,
  familyFilterId,
}: GenerateReportPdfOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Register NotoSansEthiopic (full Amharic + Latin/digits vector TTF)
  const ethiopicFonts = await loadEthiopicFonts();
  const hasEthiopicFont = Boolean(ethiopicFonts);
  if (ethiopicFonts) {
    doc.addFileToVFS('NotoSansEthiopic-Regular.ttf', ethiopicFonts.regularBase64);
    doc.addFont('NotoSansEthiopic-Regular.ttf', 'NotoSansEthiopic', 'normal', 'Identity-H');
    doc.addFileToVFS('NotoSansEthiopic-Bold.ttf', ethiopicFonts.boldBase64);
    doc.addFont('NotoSansEthiopic-Bold.ttf', 'NotoSansEthiopic', 'bold', 'Identity-H');
  }

  const setFontStyle = (style: 'normal' | 'bold' = 'normal') => {
    doc.setFont(hasEthiopicFont ? 'NotoSansEthiopic' : 'helvetica', style);
  };

  const currentDate = getCurrentEthiopianDate();
  const monthName = getEthiopianMonthName(selectedMonth);

  // Filter members if family filter applied
  const filteredMembers = familyFilterId
    ? members.filter((m) => m.familyId === familyFilterId)
    : members;

  const targetFamily = familyFilterId
    ? families.find((f) => f.id === familyFilterId)
    : undefined;

  // 1. FILTER MONTHLY CONTRIBUTIONS (ወርሃዊ መዋጮ) FOR SELECTED MONTH
  const monthContributions = contributions.filter(
    (c) =>
      (!c.type || c.type === 'ወርሃዊ') &&
      getContributionMonth(c) === selectedMonth &&
      getContributionYear(c) === selectedYear &&
      (!familyFilterId || c.familyId === familyFilterId)
  );

  const totalMonthlyCollected = monthContributions
    .filter((c) => isPaidOrPartialStatus(c.status))
    .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

  const nonMinorMembers = filteredMembers.filter((m) => !m.isMinor);
  const paidMonthlyCount = nonMinorMembers.filter((m) => {
    const con = monthContributions.find((c) => c.memberId === m.id);
    return isPaidStatus(con?.status);
  }).length;
  const unpaidMonthlyCount = Math.max(nonMinorMembers.length - paidMonthlyCount, 0);

  // 2. FILTER GENERATION CONTRIBUTIONS (የትውልድ መዋጮ)
  const allGenContributions = contributions.filter(
    (c) => c.type === 'ትውልድ' && (!familyFilterId || c.familyId === familyFilterId)
  );

  const genPaidThisMonth = allGenContributions
    .filter(
      (c) =>
        getContributionMonth(c) === selectedMonth &&
        getContributionYear(c) === selectedYear &&
        isPaidOrPartialStatus(c.status)
    )
    .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

  const totalGenCollected = allGenContributions
    .filter((c) => isPaidOrPartialStatus(c.status))
    .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

  const totalGenExpected = filteredMembers.reduce((sum, m) => {
    if (m.isMinor || m.isSpouse) return sum;
    return sum + (settings.generationPayment[m.generation] || 500);
  }, 0);

  const genRemaining = Math.max(totalGenExpected - totalGenCollected, 0);

  // ═══════════════════════════════════════════════════════════════
  // PAGE 1: HEADER & SECTION 1 (MONTHLY CONTRIBUTIONS REPORT)
  // ═══════════════════════════════════════════════════════════════

  // Banner Header
  doc.setFillColor(27, 94, 32); // #1B5E20 Dark Green
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  setFontStyle('bold');
  doc.text('የአበሩስ አንድነት ማህበር (ABARRUS UNITY ASSOCIATION)', 105, 13, { align: 'center' });

  doc.setFontSize(10);
  setFontStyle('normal');
  doc.setTextColor(255, 215, 0); // Gold
  doc.text('የወርሃዊ እና የትውልድ መዋጮ ፋይናንስ ሪፖርት (FINANCIAL REPORT)', 105, 21, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(230, 245, 230);
  const subtitle = targetFamily
    ? `ቤተሰብ (Family): ${targetFamily.familyName} (${targetFamily.id}) | ወኪል: ${targetFamily.headName}`
    : `ወቅት (Period): ${monthName} (${selectedMonth}ኛ ወር) / ${selectedYear} ዓ.ም`;
  doc.text(fitTextToWidth(doc, subtitle, 185), 105, 28, { align: 'center' });

  // Metadata Strip
  doc.setFillColor(245, 245, 245);
  doc.rect(14, 40, 182, 16, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.rect(14, 40, 182, 16, 'S');

  doc.setFontSize(8);
  setFontStyle('bold');
  doc.setTextColor(33, 33, 33);
  doc.text(`የሪፖርት ወቅት: ${monthName} ${selectedYear} ዓ.ም`, 18, 46);
  doc.text('መዋጮ የተጀመረበት: ሀምሌ 01፣ 2018 ዓ.ም', 18, 51);
  doc.text(fitTextToWidth(doc, `የተዘጋጀበት ቀን: ${currentDate.formatted}`, 88), 105, 46);
  const cbeAcc = settings.associationInfo?.cbeAccount || '1000778285146';
  const cbeName = settings.associationInfo?.cbeAccountName || 'Aida, Ibrahim & Zebiba';
  doc.text(fitTextToWidth(doc, `CBE ሂሳብ: ${cbeAcc} (${cbeName})`, 88), 105, 51);

  // SECTION 1: MONTHLY CONTRIBUTIONS (Strictly NO monthly arrears/remaining balance)
  let y = 62;
  doc.setFontSize(10.5);
  setFontStyle('bold');
  doc.setTextColor(27, 94, 32);
  doc.text(`1. የወርሃዊ መዋጮ ሪፖርት (${monthName} ${selectedYear} ዓ.ም)`, 14, y);

  y += 4;
  const colW = 43;
  const monthlyBoxes = [
    { label: 'የተሰበሰበ ወርሃዊ (Collected)', val: `${totalMonthlyCollected.toLocaleString()} ብር`, bg: [232, 245, 233], fg: [27, 94, 32] },
    { label: 'የከፈሉ አባላት (Paid)', val: `${paidMonthlyCount} / ${nonMinorMembers.length}`, bg: [232, 245, 233], fg: [27, 94, 32] },
    { label: 'ያልከፈሉ (Not Yet Paid)', val: `${unpaidMonthlyCount} አባላት`, bg: [255, 248, 225], fg: [180, 83, 9] },
    { label: 'ጠቅላላ አባላት (Members)', val: `${filteredMembers.length} አባላት`, bg: [243, 244, 246], fg: [55, 65, 81] },
  ];

  monthlyBoxes.forEach((b, idx) => {
    const x = 14 + idx * (colW + 3);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.rect(x, y, colW, 14, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, y, colW, 14, 'S');

    doc.setFontSize(6.8);
    setFontStyle('normal');
    doc.setTextColor(100, 116, 139);
    doc.text(fitTextToWidth(doc, b.label, colW - 5), x + 3, y + 4.8);

    doc.setFontSize(8.8);
    setFontStyle('bold');
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(fitTextToWidth(doc, b.val, colW - 5), x + 3, y + 10.8);
  });

  // Table of Monthly Contributions
  y += 18;
  const drawMonthlyTableHeader = (yPos: number) => {
    doc.setFillColor(27, 94, 32);
    doc.rect(14, yPos, 182, 6.5, 'F');

    doc.setFontSize(7.2);
    setFontStyle('bold');
    doc.setTextColor(255, 255, 255);
    doc.text('መለያ (ID)', 16, yPos + 4.5);
    doc.text('ሙሉ ስም (Full Name)', 38, yPos + 4.5);
    doc.text('ትውልድ', 92, yPos + 4.5);
    doc.text('ቤተሰብ', 110, yPos + 4.5);
    doc.text('ተመን (Rate)', 128, yPos + 4.5);
    doc.text('የተከፈለ (Paid)', 150, yPos + 4.5);
    doc.text('ሁኔታ (Status)', 173, yPos + 4.5);
  };

  drawMonthlyTableHeader(y);

  y += 6.5;
  const pageLimit = 272;
  let rowCount = 0;

  for (const m of filteredMembers) {
    if (y > pageLimit) {
      doc.addPage();
      y = 15;
      drawMonthlyTableHeader(y);
      y += 6.5;
    }

    const con = monthContributions.find((c) => c.memberId === m.id);
    const standardRate = m.isMinor
      ? 0
      : m.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[m.generation] || 50;

    const paidAmt = getContributionPaidAmount(con);
    const isPaid = isPaidStatus(con?.status) || (standardRate > 0 && paidAmt >= standardRate);
    const isPartial = isPartialStatus(con?.status) || (paidAmt > 0 && paidAmt < standardRate);

    doc.setFillColor(rowCount % 2 === 0 ? 255 : 248, rowCount % 2 === 0 ? 255 : 249, rowCount % 2 === 0 ? 255 : 250);
    doc.rect(14, y, 182, 5.8, 'F');

    doc.setFontSize(7);
    setFontStyle('normal');
    doc.setTextColor(33, 33, 33);
    doc.text(fitTextToWidth(doc, m.id, 20), 16, y + 4);
    doc.text(fitTextToWidth(doc, m.fullName, 52), 38, y + 4);
    doc.text(m.isSpouse ? 'ባለቤት' : `${m.generation}ኛ`, 92, y + 4);
    doc.text(fitTextToWidth(doc, m.familyId, 16), 110, y + 4);
    doc.text(`${standardRate} ብር`, 128, y + 4);
    doc.text(`${paidAmt} ብር`, 150, y + 4);

    if (m.isMinor) {
      doc.setTextColor(117, 117, 117);
      doc.text('ነጻ (ታዳጊ)', 173, y + 4);
    } else if (isPaid) {
      doc.setTextColor(27, 94, 32);
      setFontStyle('bold');
      doc.text('ተከፍሏል', 173, y + 4);
    } else if (isPartial) {
      doc.setTextColor(217, 119, 6);
      setFontStyle('bold');
      doc.text('ከፊል', 173, y + 4);
    } else {
      doc.setTextColor(198, 40, 40);
      setFontStyle('bold');
      doc.text('ያልተከፈለ', 173, y + 4);
    }

    y += 5.8;
    rowCount++;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE 2 (OR SECTION 2): GENERATION CONTRIBUTIONS REPORT
  // ═══════════════════════════════════════════════════════════════
  doc.addPage();
  y = 15;

  // Banner Header for Generation Report
  doc.setFillColor(218, 165, 32); // Goldenrod
  doc.rect(14, y, 182, 10, 'F');
  doc.setFontSize(10.5);
  setFontStyle('bold');
  doc.setTextColor(255, 255, 255);
  doc.text('2. የትውልድ መዋጮ ሪፖርት (GENERATION CONTRIBUTIONS)', 105, y + 6.5, { align: 'center' });

  y += 14;
  const genBoxes = [
    { label: 'ጠቅላላ መሰብሰብ የነበረበት', val: `${totalGenExpected.toLocaleString()} ብር`, bg: [255, 248, 225], fg: [140, 100, 0] },
    { label: 'እስካሁን የተሰበሰበ', val: `${totalGenCollected.toLocaleString()} ብር`, bg: [232, 245, 233], fg: [27, 94, 32] },
    { label: `በ${monthName} የተከፈለ`, val: `${genPaidThisMonth.toLocaleString()} ብር`, bg: [254, 243, 199], fg: [180, 83, 9] },
    { label: 'ቀሪ ያልተሰበሰበ', val: `${genRemaining.toLocaleString()} ብር`, bg: [255, 235, 238], fg: [198, 40, 40] },
  ];

  genBoxes.forEach((b, idx) => {
    const x = 14 + idx * (colW + 3);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.rect(x, y, colW, 14, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, y, colW, 14, 'S');

    doc.setFontSize(6.8);
    setFontStyle('normal');
    doc.setTextColor(100, 116, 139);
    doc.text(fitTextToWidth(doc, b.label, colW - 5), x + 3, y + 4.8);

    doc.setFontSize(8.8);
    setFontStyle('bold');
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(fitTextToWidth(doc, b.val, colW - 5), x + 3, y + 10.8);
  });

  // Table of Generation Contributions
  y += 18;
  const drawGenTableHeader = (yPos: number) => {
    doc.setFillColor(180, 130, 20);
    doc.rect(14, yPos, 182, 6.5, 'F');

    doc.setFontSize(7.2);
    setFontStyle('bold');
    doc.setTextColor(255, 255, 255);
    doc.text('መለያ (ID)', 16, yPos + 4.5);
    doc.text('ሙሉ ስም (Full Name)', 38, yPos + 4.5);
    doc.text('ትውልድ', 92, yPos + 4.5);
    doc.text('የሚጠበቅ', 110, yPos + 4.5);
    doc.text(fitTextToWidth(doc, `በ${monthName}`, 18), 130, yPos + 4.5);
    doc.text('የተከፈለ', 150, yPos + 4.5);
    doc.text('ሁኔታ (Status)', 173, yPos + 4.5);
  };

  drawGenTableHeader(y);

  y += 6.5;
  rowCount = 0;

  for (const m of filteredMembers) {
    if (y > pageLimit) {
      doc.addPage();
      y = 15;
      drawGenTableHeader(y);
      y += 6.5;
    }

    const targetDues = m.isMinor || m.isSpouse
      ? 0
      : settings.generationPayment[m.generation] || 500;

    const mGenDocs = allGenContributions.filter((c) => c.memberId === m.id);
    const totalGenPaid = mGenDocs
      .filter((c) => isPaidOrPartialStatus(c.status))
      .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

    const thisMonthGenPaid = mGenDocs
      .filter(
        (c) =>
          getContributionMonth(c) === selectedMonth &&
          getContributionYear(c) === selectedYear &&
          isPaidOrPartialStatus(c.status)
      )
      .reduce((sum, c) => sum + getContributionPaidAmount(c), 0);

    const isComplete = targetDues > 0 && totalGenPaid >= targetDues;
    const isPartial = totalGenPaid > 0 && totalGenPaid < targetDues;

    doc.setFillColor(rowCount % 2 === 0 ? 255 : 252, rowCount % 2 === 0 ? 255 : 250, rowCount % 2 === 0 ? 255 : 242);
    doc.rect(14, y, 182, 5.8, 'F');

    doc.setFontSize(7);
    setFontStyle('normal');
    doc.setTextColor(33, 33, 33);
    doc.text(fitTextToWidth(doc, m.id, 20), 16, y + 4);
    doc.text(fitTextToWidth(doc, m.fullName, 52), 38, y + 4);
    doc.text(m.isSpouse ? 'ባለቤት' : `${m.generation}ኛ`, 92, y + 4);
    doc.text(`${targetDues} ብር`, 110, y + 4);
    doc.text(`${thisMonthGenPaid} ብር`, 130, y + 4);
    doc.text(`${totalGenPaid} ብር`, 150, y + 4);

    if (m.isMinor || m.isSpouse) {
      doc.setTextColor(117, 117, 117);
      doc.text('ነጻ (Exempt)', 173, y + 4);
    } else if (isComplete) {
      doc.setTextColor(27, 94, 32);
      setFontStyle('bold');
      doc.text('ተከፍሏል', 173, y + 4);
    } else if (isPartial) {
      doc.setTextColor(180, 83, 9);
      setFontStyle('bold');
      doc.text('ከፊል', 173, y + 4);
    } else {
      doc.setTextColor(198, 40, 40);
      setFontStyle('bold');
      doc.text('ያልተከፈለ', 173, y + 4);
    }

    y += 5.8;
    rowCount++;
  }

  // Leadership Signatures
  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y = Math.max(y + 8, 240);
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 5;

  doc.setFontSize(8);
  setFontStyle('bold');
  doc.setTextColor(33, 33, 33);
  doc.text('የማህበሩ አመራር ፊርማዎች (ASSOCIATION LEADERSHIP SIGNATORIES)', 14, y);
  y += 5;

  const lead = settings.leadership || {
    executive: { fullName: 'ስራ አስፈጻሚ', phoneNumber: '' },
    secretary: { fullName: 'ጸሐፊ', phoneNumber: '' },
    financeOfficer: { fullName: 'ፋይናንስ ሀላፊ', phoneNumber: '' },
  };

  const leadCols = [
    { title: 'ስራ አስፈጻሚ (Executive)', name: lead.executive?.fullName || lead.executive?.name || 'ስራ አስፈጻሚ', phone: lead.executive?.phoneNumber || lead.executive?.phone || '' },
    { title: 'ጸሐፊ (Secretary)', name: lead.secretary?.fullName || lead.secretary?.name || 'ጸሐፊ', phone: lead.secretary?.phoneNumber || lead.secretary?.phone || '' },
    { title: 'ፋይናንስ ሀላፊ (Finance)', name: lead.financeOfficer?.fullName || lead.financeOfficer?.name || 'ፋይናንስ ሀላፊ', phone: lead.financeOfficer?.phoneNumber || lead.financeOfficer?.phone || '' },
  ];

  leadCols.forEach((col, idx) => {
    const x = 14 + idx * 62;
    doc.setFontSize(7.5);
    setFontStyle('bold');
    doc.setTextColor(17, 24, 39);
    doc.text(fitTextToWidth(doc, col.title, 58), x, y);
    setFontStyle('normal');
    doc.setTextColor(100, 116, 139);
    doc.text(fitTextToWidth(doc, col.name, 58), x, y + 4.5);
    if (col.phone) {
      doc.text(fitTextToWidth(doc, col.phone, 58), x, y + 9);
    }
  });

  const filename = familyFilterId
    ? `Abarrus_Monthly_and_Generation_Report_${familyFilterId}_${selectedMonth}_${selectedYear}.pdf`
    : `Abarrus_Financial_Report_${selectedMonth}_${selectedYear}.pdf`;

  doc.save(filename);
}

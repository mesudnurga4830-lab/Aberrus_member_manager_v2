/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Contribution, Member, Family, SettingsRates } from '../types';
import { getEthiopianMonthName, getCurrentEthiopianDate } from './ethiopianCalendar';

interface GenerateReportPdfOptions {
  contributions: Contribution[];
  members: Member[];
  families: Family[];
  settings: SettingsRates;
  selectedMonth: number;
  selectedYear: number;
  familyFilterId?: string;
}

export function generateFinancialReportPdf({
  contributions,
  members,
  families,
  settings,
  selectedMonth,
  selectedYear,
  familyFilterId,
}: GenerateReportPdfOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

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
      c.type === 'ወርሃዊ' &&
      Number(c.ethiopianMonth) === selectedMonth &&
      Number(c.ethiopianYear) === selectedYear &&
      (!familyFilterId || c.familyId === familyFilterId)
  );

  const totalMonthlyCollected = monthContributions
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalMonthlyExpected = filteredMembers.reduce((sum, m) => {
    if (m.isMinor) return sum;
    if (m.isSpouse) return sum + (settings.spouseMonthlyRate || 100);
    return sum + (settings.monthlyRate[m.generation] || 0);
  }, 0);

  const totalArrears = Math.max(totalMonthlyExpected - totalMonthlyCollected, 0);

  const paidMonthlyCount = filteredMembers.filter((m) => {
    if (m.isMinor) return false;
    const con = monthContributions.find((c) => c.memberId === m.id);
    return con?.status === 'ተከፍሏል';
  }).length;

  const unpaidMonthlyCount = filteredMembers.filter((m) => !m.isMinor).length - paidMonthlyCount;

  // 2. FILTER GENERATION CONTRIBUTIONS (የትውልድ መዋጮ)
  const allGenContributions = contributions.filter(
    (c) => c.type === 'ትውልድ' && (!familyFilterId || c.familyId === familyFilterId)
  );

  const genPaidThisMonth = allGenContributions
    .filter(
      (c) =>
        Number(c.ethiopianMonth) === selectedMonth &&
        Number(c.ethiopianYear) === selectedYear &&
        (c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    )
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const totalGenCollected = allGenContributions
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

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
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ABARRUS UNITY ASSOCIATION (ASIYA MESUD APP)', 105, 13, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 215, 0); // Gold
  doc.text('YE ABARRUS ANDINET MAHBER - MONTHLY & GENERATION FINANCIAL REPORT', 105, 21, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(230, 245, 230);
  const subtitle = targetFamily
    ? `Family Statement: ${targetFamily.familyName} (${targetFamily.id}) | Representative: ${targetFamily.headName}`
    : `Official Financial Report | Period: ${monthName} (${selectedMonth}) / ${selectedYear} E.C.`;
  doc.text(subtitle, 105, 28, { align: 'center' });

  // Metadata Strip
  doc.setFillColor(245, 245, 245);
  doc.rect(14, 40, 182, 16, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.rect(14, 40, 182, 16, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 33, 33);
  doc.text(`Report Period: ${monthName} ${selectedYear} E.C.`, 18, 46);
  doc.text(`Payment Start Date: Hamle 01, 2018 E.C.`, 18, 51);
  doc.text(`Generated On: ${currentDate.formatted}`, 105, 46);
  doc.text(`CBE Account: 1000778285146 (Aida, Ibrahim & zebiba)`, 105, 51);

  // SECTION 1: MONTHLY CONTRIBUTIONS
  let y = 62;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 94, 32);
  doc.text(`1. MONTHLY CONTRIBUTIONS REPORT (${monthName.toUpperCase()} ${selectedYear} E.C.)`, 14, y);

  y += 4;
  const colW = 43;
  const monthlyBoxes = [
    { label: 'Expected Monthly', val: `${totalMonthlyExpected.toLocaleString()} ETB`, bg: [232, 245, 233], fg: [27, 94, 32] },
    { label: 'Collected Monthly', val: `${totalMonthlyCollected.toLocaleString()} ETB`, bg: [232, 245, 233], fg: [27, 94, 32] },
    { label: 'Monthly Arrears', val: `${totalArrears.toLocaleString()} ETB`, bg: [255, 235, 238], fg: [198, 40, 40] },
    { label: 'Paid Members', val: `${paidMonthlyCount} / ${filteredMembers.length}`, bg: [255, 248, 225], fg: [160, 120, 0] },
  ];

  monthlyBoxes.forEach((b, idx) => {
    const x = 14 + idx * (colW + 3);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.rect(x, y, colW, 14, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, y, colW, 14, 'S');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(117, 117, 117);
    doc.text(b.label, x + 3, y + 4.5);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.val, x + 3, y + 10.5);
  });

  // Table of Monthly Contributions
  y += 18;
  doc.setFillColor(27, 94, 32);
  doc.rect(14, y, 182, 6.5, 'F');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ID', 17, y + 4.5);
  doc.text('Full Name', 38, y + 4.5);
  doc.text('Gen', 90, y + 4.5);
  doc.text('Family ID', 108, y + 4.5);
  doc.text('Monthly Rate', 128, y + 4.5);
  doc.text('Paid (ETB)', 152, y + 4.5);
  doc.text('Monthly Status', 173, y + 4.5);

  y += 6.5;
  const pageLimit = 270;
  let rowCount = 0;

  for (const m of filteredMembers) {
    if (y > pageLimit) {
      doc.addPage();
      y = 15;
      doc.setFillColor(27, 94, 32);
      doc.rect(14, y, 182, 6.5, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('ID', 17, y + 4.5);
      doc.text('Full Name', 38, y + 4.5);
      doc.text('Gen', 90, y + 4.5);
      doc.text('Family ID', 108, y + 4.5);
      doc.text('Monthly Rate', 128, y + 4.5);
      doc.text('Paid (ETB)', 152, y + 4.5);
      doc.text('Monthly Status', 173, y + 4.5);
      y += 6.5;
    }

    const con = monthContributions.find((c) => c.memberId === m.id);
    const standardRate = m.isMinor
      ? 0
      : m.isSpouse
      ? settings.spouseMonthlyRate || 100
      : settings.monthlyRate[m.generation] || 50;

    const paidAmt = con?.paidAmount || 0;
    const isPaid = con?.status === 'ተከፍሏል' || (standardRate > 0 && paidAmt >= standardRate);
    const isPartial = con?.status === 'ከፊል' || (paidAmt > 0 && paidAmt < standardRate);

    doc.setFillColor(rowCount % 2 === 0 ? 255 : 248, rowCount % 2 === 0 ? 255 : 249, rowCount % 2 === 0 ? 255 : 250);
    doc.rect(14, y, 182, 5.5, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(33, 33, 33);
    doc.text(m.id, 17, y + 3.8);
    doc.text(m.fullName.substring(0, 25), 38, y + 3.8);
    doc.text(m.isSpouse ? 'Spouse' : `${m.generation}th`, 90, y + 3.8);
    doc.text(m.familyId, 108, y + 3.8);
    doc.text(`${standardRate} ETB`, 128, y + 3.8);
    doc.text(`${paidAmt} ETB`, 152, y + 3.8);

    if (m.isMinor) {
      doc.setTextColor(117, 117, 117);
      doc.text('Exempt (Minor)', 173, y + 3.8);
    } else if (isPaid) {
      doc.setTextColor(27, 94, 32);
      doc.setFont('helvetica', 'bold');
      doc.text('PAID (Tekeflual)', 173, y + 3.8);
    } else if (isPartial) {
      doc.setTextColor(245, 127, 23);
      doc.setFont('helvetica', 'bold');
      doc.text('PARTIAL', 173, y + 3.8);
    } else {
      doc.setTextColor(198, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.text('UNPAID', 173, y + 3.8);
    }

    y += 5.5;
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
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('2. GENERATION CONTRIBUTIONS REPORT (YE-TWLID MEWACHO)', 105, y + 6.5, { align: 'center' });

  y += 14;
  const genBoxes = [
    { label: 'Total Expected Generation', val: `${totalGenExpected.toLocaleString()} ETB`, bg: [255, 248, 225], fg: [140, 100, 0] },
    { label: 'Total Collected To Date', val: `${totalGenCollected.toLocaleString()} ETB`, bg: [232, 245, 233], fg: [27, 94, 32] },
    { label: `Paid in ${monthName}`, val: `${genPaidThisMonth.toLocaleString()} ETB`, bg: [254, 243, 199], fg: [180, 83, 9] },
    { label: 'Remaining Balance', val: `${genRemaining.toLocaleString()} ETB`, bg: [255, 235, 238], fg: [198, 40, 40] },
  ];

  genBoxes.forEach((b, idx) => {
    const x = 14 + idx * (colW + 3);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.rect(x, y, colW, 14, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, y, colW, 14, 'S');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(117, 117, 117);
    doc.text(b.label, x + 3, y + 4.5);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.val, x + 3, y + 10.5);
  });

  // Table of Generation Contributions
  y += 18;
  doc.setFillColor(180, 130, 20);
  doc.rect(14, y, 182, 6.5, 'F');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ID', 17, y + 4.5);
  doc.text('Full Name', 38, y + 4.5);
  doc.text('Gen', 90, y + 4.5);
  doc.text('Target Dues', 108, y + 4.5);
  doc.text(`In ${monthName}`, 130, y + 4.5);
  doc.text('Total Paid', 152, y + 4.5);
  doc.text('Gen Status', 173, y + 4.5);

  y += 6.5;
  rowCount = 0;

  for (const m of filteredMembers) {
    if (y > pageLimit) {
      doc.addPage();
      y = 15;
      doc.setFillColor(180, 130, 20);
      doc.rect(14, y, 182, 6.5, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('ID', 17, y + 4.5);
      doc.text('Full Name', 38, y + 4.5);
      doc.text('Gen', 90, y + 4.5);
      doc.text('Target Dues', 108, y + 4.5);
      doc.text(`In ${monthName}`, 130, y + 4.5);
      doc.text('Total Paid', 152, y + 4.5);
      doc.text('Gen Status', 173, y + 4.5);
      y += 6.5;
    }

    const targetDues = m.isMinor || m.isSpouse
      ? 0
      : settings.generationPayment[m.generation] || 500;

    const mGenDocs = allGenContributions.filter((c) => c.memberId === m.id);
    const totalGenPaid = mGenDocs
      .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const thisMonthGenPaid = mGenDocs
      .filter(
        (c) =>
          Number(c.ethiopianMonth) === selectedMonth &&
          Number(c.ethiopianYear) === selectedYear &&
          (c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      )
      .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

    const isComplete = targetDues > 0 && totalGenPaid >= targetDues;
    const isPartial = totalGenPaid > 0 && totalGenPaid < targetDues;

    doc.setFillColor(rowCount % 2 === 0 ? 255 : 252, rowCount % 2 === 0 ? 255 : 250, rowCount % 2 === 0 ? 255 : 242);
    doc.rect(14, y, 182, 5.5, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(33, 33, 33);
    doc.text(m.id, 17, y + 3.8);
    doc.text(m.fullName.substring(0, 25), 38, y + 3.8);
    doc.text(m.isSpouse ? 'Spouse' : `${m.generation}th`, 90, y + 3.8);
    doc.text(`${targetDues} ETB`, 108, y + 3.8);
    doc.text(`${thisMonthGenPaid} ETB`, 130, y + 3.8);
    doc.text(`${totalGenPaid} ETB`, 152, y + 3.8);

    if (m.isMinor || m.isSpouse) {
      doc.setTextColor(117, 117, 117);
      doc.text('Exempt', 173, y + 3.8);
    } else if (isComplete) {
      doc.setTextColor(27, 94, 32);
      doc.setFont('helvetica', 'bold');
      doc.text('COMPLETED', 173, y + 3.8);
    } else if (isPartial) {
      doc.setTextColor(180, 83, 9);
      doc.setFont('helvetica', 'bold');
      doc.text('PARTIAL', 173, y + 3.8);
    } else {
      doc.setTextColor(117, 117, 117);
      doc.text('UNPAID', 173, y + 3.8);
    }

    y += 5.5;
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
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 33, 33);
  doc.text('ASSOCIATION LEADERSHIP SIGNATORIES', 14, y);
  y += 5;

  const lead = settings.leadership || {
    executive: { fullName: 'Executive Officer', phoneNumber: '' },
    secretary: { fullName: 'Secretary', phoneNumber: '' },
    financeOfficer: { fullName: 'Finance Officer', phoneNumber: '' },
  };

  const leadCols = [
    { title: 'Executive Officer', name: lead.executive?.fullName || 'Assigned Executive', phone: lead.executive?.phoneNumber || '' },
    { title: 'Secretary', name: lead.secretary?.fullName || 'Assigned Secretary', phone: lead.secretary?.phoneNumber || '' },
    { title: 'Finance Officer', name: lead.financeOfficer?.fullName || 'Assigned Finance Officer', phone: lead.financeOfficer?.phoneNumber || '' },
  ];

  leadCols.forEach((col, idx) => {
    const x = 14 + idx * 62;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(col.title, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(117, 117, 117);
    doc.text(col.name, x, y + 4);
    if (col.phone) {
      doc.text(col.phone, x, y + 8);
    }
  });

  const filename = familyFilterId
    ? `Abarrus_Monthly_and_Generation_Report_${familyFilterId}_${monthName}_${selectedYear}.pdf`
    : `Abarrus_Financial_Report_${monthName}_${selectedYear}.pdf`;

  doc.save(filename);
}

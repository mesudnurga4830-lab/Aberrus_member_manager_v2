/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParsedCsvRow {
  rowNumber: number; // 1-indexed (row 1 is first data row after header)
  id: string;
  fullName: string;
  phone: string;
  generation: number;
  familyId: string;
  familyName: string;
  isHead: boolean;
  isMinor: boolean;
  isSpouse: boolean;
  telegram?: string;
  notes?: string;
  raw: Record<string, string>;
}

/**
 * Robust CSV parser that handles:
 * - Commas, semicolons, or tabs
 * - Quoted fields containing delimiters or escaped quotes
 * - Windows (\r\n), Unix (\n), or Mac (\r) line endings
 * - UTF-8 Byte Order Mark (BOM)
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: ParsedCsvRow[] } {
  if (!csvText) {
    return { headers: [], rows: [] };
  }

  // Remove BOM if present
  let cleanText = csvText.replace(/^\uFEFF/, '');

  // Detect line ending
  const rawLines = cleanText.split(/\r\n|\n|\r/);
  const nonEmptyLines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

  if (nonEmptyLines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Detect delimiter from first non-empty line
  const firstLine = nonEmptyLines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  }

  // Tokenize CSV row respecting quotes
  const tokenizeLine = (line: string): string[] => {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    tokens.push(current.trim());
    return tokens;
  };

  const rawHeaders = tokenizeLine(nonEmptyLines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());

  // Map header keys to normalized property names
  const headerMap: Record<number, string> = {};
  rawHeaders.forEach((h, index) => {
    const lower = h.toLowerCase().replace(/[\s_\-]/g, '');
    if (lower === 'id' || lower === 'memberid' || lower === 'memid' || lower === 'መለያ' || lower === 'አባልመለያ') {
      headerMap[index] = 'id';
    } else if (
      lower === 'fullname' ||
      lower === 'name' ||
      lower === 'membername' ||
      lower === 'ስም' ||
      lower === 'ሙሉስም'
    ) {
      headerMap[index] = 'fullName';
    } else if (
      lower === 'phone' ||
      lower === 'phonenumber' ||
      lower === 'mobile' ||
      lower === 'tele' ||
      lower === 'ስልክ' ||
      lower === 'ስልክቁጥር'
    ) {
      headerMap[index] = 'phone';
    } else if (lower === 'generation' || lower === 'gen' || lower === 'ትውልድ') {
      headerMap[index] = 'generation';
    } else if (
      lower === 'familyid' ||
      lower === 'family' ||
      lower === 'ቤተሰብid' ||
      lower === 'የቤተሰብid' ||
      lower === 'ቤተሰብ'
    ) {
      headerMap[index] = 'familyId';
    } else if (lower === 'familyname' || lower === 'የቤተሰብስም') {
      headerMap[index] = 'familyName';
    } else if (lower === 'ishead' || lower === 'head' || lower === 'ወኪል' || lower === 'የቤተሰብወኪል') {
      headerMap[index] = 'isHead';
    } else if (lower === 'isminor' || lower === 'minor' || lower === '18-') {
      headerMap[index] = 'isMinor';
    } else if (lower === 'isspouse' || lower === 'spouse' || lower === 'የትዳርአጋር') {
      headerMap[index] = 'isSpouse';
    } else if (lower === 'telegram' || lower === 'ቴሌግራም') {
      headerMap[index] = 'telegram';
    } else if (lower === 'notes' || lower === 'note' || lower === 'ማስታወሻ') {
      headerMap[index] = 'notes';
    } else {
      headerMap[index] = h;
    }
  });

  const parsedRows: ParsedCsvRow[] = [];

  for (let lineIdx = 1; lineIdx < nonEmptyLines.length; lineIdx++) {
    const rawTokens = tokenizeLine(nonEmptyLines[lineIdx]).map((t) => t.replace(/^["']|["']$/g, '').trim());
    if (rawTokens.every((t) => t === '')) continue; // skip blank row

    const rowObj: Record<string, string> = {};
    rawTokens.forEach((val, idx) => {
      const field = headerMap[idx] || `col_${idx}`;
      rowObj[field] = val;
    });

    const id = rowObj.id || '';
    const fullName = rowObj.fullName || '';
    const phone = rowObj.phone || '';
    const genVal = parseInt(rowObj.generation || '4', 10);
    const generation = isNaN(genVal) ? 4 : genVal;
    const familyId = (rowObj.familyId || 'FA001').toUpperCase().trim();
    const familyName = rowObj.familyName || 'የአበሩስ ቤተሰብ';

    const parseBool = (v?: string): boolean => {
      if (!v) return false;
      const lower = v.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'አዎ';
    };

    parsedRows.push({
      rowNumber: lineIdx + 1, // 1-indexed line in file
      id: id.trim(),
      fullName: fullName.trim(),
      phone: phone.trim(),
      generation,
      familyId,
      familyName: familyName.trim(),
      isHead: parseBool(rowObj.isHead),
      isMinor: parseBool(rowObj.isMinor),
      isSpouse: parseBool(rowObj.isSpouse),
      telegram: rowObj.telegram?.trim() || undefined,
      notes: rowObj.notes?.trim() || undefined,
      raw: rowObj,
    });
  }

  return { headers: rawHeaders, rows: parsedRows };
}

/**
 * Sample CSV Template Generator
 */
export function generateSampleCsvTemplate(): string {
  const headers = [
    'id',
    'fullName',
    'phone',
    'generation',
    'familyId',
    'familyName',
    'isHead',
    'isMinor',
    'isSpouse',
    'telegram',
    'notes',
  ].join(',');

  const rows = [
    'MEM-101,አበበ ከበደ ወርቁ,0911223344,4,FA001,የአበሩስ ቤተሰብ,false,false,false,@abebe,መደበኛ አባል',
    'MEM-102,ፋጡማ አህመድ ሰዒድ,0922334455,4,FA002,የሀጂ ኑርጋ ቤተሰብ,true,false,false,@fatuma,የቤተሰብ ወኪል',
    'MEM-103,መስኡድ ኑርጋ,0933445566,3,FA001,የአበሩስ ቤተሰብ,false,false,false,@mesud,',
    'MEM-104,ማርያም ዮሴፍ,0944556677,4,FA003,የወ/ሮ አሰፋሽ ቤተሰብ,false,false,true,,የትዳር አጋር',
    'MEM-105,ሳሙኤል ተፈራ,0955667788,5,FA001,የአበሩስ ቤተሰብ,false,true,false,,18 ዓመት በታች',
  ];

  return `${headers}\n${rows.join('\n')}`;
}

/**
 * Triggers a browser download of the sample CSV template
 */
export function downloadSampleCsvTemplate(filename = 'abarrus_members_template.csv'): void {
  const csvContent = generateSampleCsvTemplate();
  // Add UTF-8 BOM so Excel and spreadsheet editors open Amharic script properly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Users,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Member, UserRole } from '../types';
import { parseCsvText, ParsedCsvRow, downloadSampleCsvTemplate } from '../utils/csvParser';
import {
  bulkImportMembersToFirestore,
  BulkImportProgress,
  BulkImportResult,
  SkippedRecordInfo,
} from '../firebase';

interface BulkImportModalProps {
  userRole: UserRole;
  adminEmail?: string;
  onClose: () => void;
  onImportSuccess: (importedMembers: Member[]) => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  userRole,
  adminEmail,
  onClose,
  onImportSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedCsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<BulkImportProgress | null>(null);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState<boolean>(true);

  const isAdmin = userRole === 'admin';

  // File selection handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel')) {
      processFile(file);
    } else {
      setParseError('እባክዎ ትክክለኛ የCSV ፋይል (.csv) ይምረጡ (Please choose a valid .csv file)');
    }
  };

  const processFile = (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setImportResult(null);
    setImportProgress(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const { rows } = parseCsvText(text);
        if (rows.length === 0) {
          setParseError('በፋይሉ ውስጥ ምንም የአባላት መረጃ አልተገኘም (No data rows found in this CSV file)');
          setParsedRows([]);
        } else {
          setParsedRows(rows);
        }
      } catch (err: any) {
        setParseError(`ፋይሉን ማንበብ አልተቻለም (Error reading file): ${err.message || 'Unknown parse error'}`);
        setParsedRows([]);
      }
    };
    reader.onerror = () => {
      setParseError('ፋይሉን በመክፈት ላይ ስህተት አጋጥሟል (Failed to read file from disk)');
    };
    reader.readAsText(file);
  };

  // Perform Batch Import
  const handleStartImport = async () => {
    if (parsedRows.length === 0 || !isAdmin) return;

    setIsImporting(true);
    setImportProgress({
      currentBatch: 1,
      totalBatches: Math.ceil(parsedRows.length / 450) || 1,
      processedCount: 0,
      totalCount: parsedRows.length,
      percentage: 0,
    });

    try {
      const result = await bulkImportMembersToFirestore(parsedRows, (p) => {
        setImportProgress(p);
      });

      setImportResult(result);
      if (result.addedCount > 0) {
        try {
          confetti({
            particleCount: 70,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#1B5E20', '#FFD700', '#4CAF50'],
          });
        } catch {}
        onImportSuccess(result.addedMembers);
      }
    } catch (err: any) {
      console.error('Bulk import error:', err);
      setParseError(err.message || 'የጅምላ መረጃ ማስመጣት አልተሳካም። እባክዎ እንደገና ይሞክሩ።');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParsedRows([]);
    setParseError(null);
    setImportResult(null);
    setImportProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border-2 border-[#1B5E20]/20 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-[#1B5E20] via-[#144818] to-[#1B5E20] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FFD700] text-[#1B5E20] flex items-center justify-center shadow-md shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  የአባላት የጅምላ መረጃ ማስመጫ (Bulk Import)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#FFD700] text-[#1B5E20] text-[10px] font-black uppercase tracking-wider">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                በCSV ፋይል በርካታ አባላትን በአንድ ጊዜ ወደ Firestore ቋት ማስገቢያ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Admin Role Guard Notice */}
          {!isAdmin ? (
            <div className="p-6 bg-red-50 border-2 border-red-300 rounded-2xl text-center space-y-3">
              <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
              <h3 className="text-base font-bold text-red-900">ይህ አገልግሎት ለአስተዳዳሪ ብቻ የተፈቀደ ነው</h3>
              <p className="text-xs text-red-700 max-w-md mx-auto leading-relaxed">
                የአባላት የጅምላ መረጃ ማስመጣት የሚቻለው በተፈቀደለት የአስተዳዳሪ Google Sign-In አካውንት (mesudnurga4830@gmail.com) ሲገቡ ብቻ ነው።
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
              >
                ዝጋ (Close)
              </button>
            </div>
          ) : importResult ? (
            /* STEP 4: IMPORT COMPLETED SUMMARY */
            <div className="space-y-5 animate-in fade-in">
              <div className="p-5 bg-gradient-to-br from-emerald-50 to-green-100 border-2 border-emerald-300 rounded-2xl text-center space-y-3">
                <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-emerald-950">የመረጃ ማስመጣት ሂደት ተጠናቋል!</h3>
                  {/* Exact summary text per requirement 6 */}
                  <div className="mt-2 inline-block px-4 py-2 rounded-xl bg-white border border-emerald-300 shadow-2xs font-mono font-bold text-sm text-emerald-900">
                    {importResult.summaryMessage}
                  </div>
                  <p className="text-xs text-emerald-800 font-medium mt-1">
                    {importResult.addedCount} አባላት በተሳካ ሁኔታ ተመዝግበዋል፣ {importResult.skippedCount} አባላት ተዘለዋል (የተደገሙ/የተሳሳቱ)።
                  </p>
                </div>
              </div>

              {/* Detailed Breakdown of Skipped Records */}
              {importResult.skippedRecords.length > 0 && (
                <div className="border border-amber-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowSkippedDetails(!showSkippedDetails)}
                    className="w-full p-3.5 bg-amber-50 hover:bg-amber-100/80 transition-colors flex items-center justify-between text-left cursor-pointer border-b border-amber-200"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span className="text-xs font-bold text-amber-950">
                        የተዘለሉ መረጃዎች ዝርዝር ({importResult.skippedRecords.length} records skipped)
                      </span>
                    </div>
                    {showSkippedDetails ? (
                      <ChevronUp className="w-4 h-4 text-amber-800" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-amber-800" />
                    )}
                  </button>

                  {showSkippedDetails && (
                    <div className="max-h-60 overflow-y-auto divide-y divide-neutral-100 text-xs">
                      {importResult.skippedRecords.map((item, idx) => (
                        <div key={idx} className="p-3 hover:bg-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 font-mono font-bold text-[10px]">
                                Row #{item.rowNumber}
                              </span>
                              <span className="font-bold text-neutral-900">{item.fullName}</span>
                              <span className="font-mono text-neutral-500 text-[11px]">({item.memberId})</span>
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono">
                              ስልክ፡ {item.phone || 'ባዶ'}
                            </div>
                          </div>
                          <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 self-start sm:self-center">
                            {item.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-bold text-xs hover:bg-neutral-50 cursor-pointer"
                >
                  ሌላ ፋይል አስመጣ (Import Another)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-[#1B5E20] hover:bg-[#144818] text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  ተጠናቋል (Done)
                </button>
              </div>
            </div>
          ) : (
            /* STEP 1 & 2 & 3: UPLOAD, PREVIEW & BATCH WRITE */
            <div className="space-y-5">
              {/* Template Download Banner */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <FileCheck className="w-4 h-4 text-amber-700" />
                    <span>የCSV ፎርማት ናሙና (CSV Template Format)</span>
                  </div>
                  <p className="text-amber-900 leading-relaxed">
                    አባላትን በትክክለኛ አምዶች ለማስገባት የተዘጋጀውን የናሙና ፋይል አውርደው መረጃዎን ይሙሉ (id, fullName, phone, generation, familyId)።
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSampleCsvTemplate()}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold flex items-center gap-1.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>ናሙና አውርድ (Sample CSV)</span>
                </button>
              </div>

              {/* Upload Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 sm:p-8 border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-[#1B5E20] bg-emerald-50/50'
                    : 'border-neutral-300 hover:border-[#1B5E20] hover:bg-neutral-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,application/vnd.ms-excel"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>

                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#1B5E20]">{selectedFile.name}</p>
                    <p className="text-xs text-neutral-500 font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB · {parsedRows.length} አባላት ተገኝተዋል
                    </p>
                    <p className="text-[11px] text-[#1B5E20] font-semibold mt-1">
                      ፋይሉን ለመቀየር እዚህ ይጫኑ
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-neutral-800">
                      የአባላት CSV ፋይል እዚህ ይጎትቱ ወይም ይጫኑ
                    </p>
                    <p className="text-xs text-neutral-500">
                      ፋይሉ .csv መሆን አለበት። ከ500 በላይ አባላትን በራስ-ሰር ቆራርጦ በFirestore Batch ይጭናል።
                    </p>
                  </div>
                )}
              </div>

              {/* Parse Error Notification */}
              {parseError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-semibold">{parseError}</span>
                </div>
              )}

              {/* Parsed Preview Table */}
              {parsedRows.length > 0 && !isImporting && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900">የተገኙ መረጃዎች ማጠቃለያ (Preview)፡</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono">
                        {parsedRows.length} አባላት
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500">
                      የመጀመሪያዎቹ 5 ረድፎች ይታያሉ
                    </span>
                  </div>

                  <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-neutral-100/90 text-neutral-700 text-[11px] sticky top-0 font-bold">
                          <tr>
                            <th className="p-2.5">Row</th>
                            <th className="p-2.5">ID</th>
                            <th className="p-2.5">ሙሉ ስም</th>
                            <th className="p-2.5">ስልክ ቁጥር</th>
                            <th className="p-2.5">ትውልድ</th>
                            <th className="p-2.5">ቤተሰብ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-neutral-800 font-sans">
                          {parsedRows.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="hover:bg-neutral-50">
                              <td className="p-2.5 font-mono text-[11px] text-neutral-500">{row.rowNumber}</td>
                              <td className="p-2.5 font-mono font-bold text-[#1B5E20]">{row.id || 'N/A'}</td>
                              <td className="p-2.5 font-bold">{row.fullName || 'N/A'}</td>
                              <td className="p-2.5 font-mono">{row.phone || 'N/A'}</td>
                              <td className="p-2.5">{row.generation}ኛ</td>
                              <td className="p-2.5">{row.familyId}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {parsedRows.length > 5 && (
                      <div className="p-2 bg-neutral-50 border-t border-neutral-200 text-center text-[11px] text-neutral-500 font-medium">
                        ... እና ተጨማሪ {parsedRows.length - 5} አባላት
                      </div>
                    )}
                  </div>

                  {/* Requirements checklist preview */}
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-neutral-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>የማጣሪያ ህጎች (Validation Rules Applied Before Save)፡</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 pl-1 text-neutral-600">
                      <li>ስልክ ቁጥር በትክክለኛ 10 አሃዝ በ09 (ወይም 07) የሚጀምር መሆን አለበት።</li>
                      <li>የተደገመ Member ID በዳታቤዝ ውስጥም ሆነ በCSV ፋይል ውስጥ ካለ በራስ-ሰር ይዘለላል።</li>
                      <li>ፋይሉ ከ500 በላይ አባላት ቢኖሩትም በFirestore Batch Writes በቡድን ተቆራርጦ በሰላም ይጫናል።</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Progress Bar & Status (Requirement 5) */}
              {isImporting && importProgress && (
                <div className="p-5 bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#1B5E20]" />
                      <span>
                        የቡድን {importProgress.currentBatch} ከ {importProgress.totalBatches} በመጫን ላይ (Batch {importProgress.currentBatch} of {importProgress.totalBatches})...
                      </span>
                    </span>
                    <span className="font-mono text-sm text-[#1B5E20] font-black">
                      {importProgress.percentage}%
                    </span>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#1B5E20] via-emerald-600 to-[#FFD700] rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${importProgress.percentage}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-emerald-800 font-mono">
                    <span>
                      {importProgress.processedCount} ከ {importProgress.totalCount} አባላት ተከናውነዋል
                    </span>
                    <span>እባክዎ ገጹን አይዝጉት</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isImporting}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-bold text-xs hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  ሰርዝ (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleStartImport}
                  disabled={isImporting || parsedRows.length === 0}
                  className="btn-primary px-6 py-2.5 text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#FFD700]" />
                      <span>በመጫን ላይ...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-[#FFD700]" />
                      <span>{parsedRows.length} አባላትን ወደ Firestore አስመጣ</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

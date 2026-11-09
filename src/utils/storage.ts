/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Member, Family, Contribution, SettingsRates, GenerationNumber } from '../types';
import { initialFamilies, initialMembers, initialContributions, initialSettings } from '../data/initialData';

export const APP_CURRENT_VERSION = 'v6_2018_HAMLE';

const STORAGE_KEYS = {
  MEMBERS: 'abarrus_members_v6',
  FAMILIES: 'abarrus_families_v6',
  CONTRIBUTIONS: 'abarrus_contributions_v6',
  SETTINGS: 'abarrus_settings_v6',
  LAST_SAVED: 'abarrus_last_saved_time_v6',
  APP_VERSION: 'abarrus_app_version',
};

const SYNC_EVENT = 'abarrus_data_synced';

export function recordSaveTimestamp(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_SAVED, now);
    localStorage.setItem(STORAGE_KEYS.APP_VERSION, APP_CURRENT_VERSION);
  } catch {}
  return now;
}

export function getLastSavedTimestamp(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LAST_SAVED);
    if (saved) return saved;
    const now = recordSaveTimestamp();
    return now;
  } catch {
    return new Date().toISOString();
  }
}

export function touchSaveTimestamp(): string {
  const now = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'manual_touch', timestamp: now } }));
  return now;
}

export function formatSavedTime(isoStr: string | null): { timeStr: string; relativeStr: string } {
  if (!isoStr) {
    return { timeStr: 'አሁን', relativeStr: 'አሁን ተቀምጧል' };
  }
  try {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) {
      return { timeStr: 'አሁን', relativeStr: 'አሁን ተቀምጧል' };
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    let relativeStr = 'አሁን ተቀምጧል';
    if (diffSec < 10) {
      relativeStr = 'አሁን ተቀምጧል';
    } else if (diffSec < 60) {
      relativeStr = `ከ${diffSec} ሰከንድ በፊት ተቀምጧል`;
    } else {
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) {
        relativeStr = `ከ${diffMin} ደቂቃ በፊት ተቀምጧል`;
      } else {
        relativeStr = `${hours}:${minutes} ተቀምጧል`;
      }
    }
    return { timeStr, relativeStr };
  } catch {
    return { timeStr: 'አሁን', relativeStr: 'አሁን ተቀምጧል' };
  }
}

export function getSettings(): SettingsRates {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.SETTINGS) ||
      localStorage.getItem('abarrus_settings_v5') ||
      localStorage.getItem('abarrus_settings_v4');
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
      return initialSettings;
    }
    const parsed = JSON.parse(raw);
    let changed = false;

    // Ensure rebranding is reflected immediately
    if (parsed && parsed.associationInfo) {
      parsed.associationInfo.name = initialSettings.associationInfo.name;
      parsed.associationInfo.englishName = initialSettings.associationInfo.englishName;
      if (!parsed.associationInfo.paymentStartDate || parsed.associationInfo.paymentStartDate.includes('ጥቅምት')) {
        parsed.associationInfo.paymentStartDate = 'ሀምሌ 01፣ 2018 ዓ.ም';
        changed = true;
      }
    }
    if (!parsed.spouseMonthlyRate) {
      parsed.spouseMonthlyRate = 100;
      changed = true;
    }
    if (!parsed.leadership) {
      parsed.leadership = initialSettings.leadership;
      changed = true;
    }
    if (changed || !localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return initialSettings;
  }
}

export function saveSettings(settings: SettingsRates): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  const ts = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'settings', timestamp: ts } }));
  syncToBackendServerAsync();
}

export function getFamilies(): Family[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.FAMILIES) ||
      localStorage.getItem('abarrus_families_v5') ||
      localStorage.getItem('abarrus_families_v4');
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.FAMILIES, JSON.stringify(initialFamilies));
      return initialFamilies;
    }
    return JSON.parse(raw);
  } catch {
    return initialFamilies;
  }
}

export function saveFamilies(families: Family[]): void {
  localStorage.setItem(STORAGE_KEYS.FAMILIES, JSON.stringify(families));
  const ts = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'families', timestamp: ts } }));
  syncToBackendServerAsync();
}

export function updateFamily(id: string, updates: Partial<Family>): Family | null {
  const families = getFamilies();
  const index = families.findIndex((f) => f.id === id);
  if (index === -1) return null;
  const updated = { ...families[index], ...updates };
  families[index] = updated;
  saveFamilies(families);

  // Synchronize changes to head member in members list if phone or telegram updated
  if (updates.phone !== undefined || updates.telegram !== undefined || updates.headName !== undefined) {
    const members = getMembers();
    let memberChanged = false;
    members.forEach((m) => {
      if (m.familyId === id && m.isHead) {
        if (updates.phone !== undefined && m.phone !== updates.phone) {
          m.phone = updates.phone;
          memberChanged = true;
        }
        if (updates.telegram !== undefined && m.telegram !== updates.telegram) {
          m.telegram = updates.telegram;
          memberChanged = true;
        }
        if (updates.headName !== undefined && m.fullName !== updates.headName) {
          m.fullName = updates.headName;
          memberChanged = true;
        }
      }
    });
    if (memberChanged) {
      saveMembers(members);
    }
  }

  return updated;
}

export function getMembers(): Member[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.MEMBERS) ||
      localStorage.getItem('abarrus_members_v5') ||
      localStorage.getItem('abarrus_members_v4');
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(initialMembers));
      return initialMembers;
    }
    const parsed: Member[] = JSON.parse(raw);
    
    // Filter out MEM-113 (ጤኑ) and MEM-114 (አ/ማሊክ አርጋ) from 4th generation list since they are listed as spouses (MEM-SPOUSE-001, MEM-SPOUSE-002)
    const cleaned = parsed.filter((m) => m.id !== 'MEM-113' && m.id !== 'MEM-114');

    // Automatically ensure all 39 minors and spouses are present in the dataset
    let added = false;
    const existingIds = new Set(cleaned.map((m) => m.id));
    initialMembers.forEach((im) => {
      if ((im.isMinor || im.isSpouse) && !existingIds.has(im.id)) {
        cleaned.push(im);
        existingIds.add(im.id);
        added = true;
      }
    });

    if (added || cleaned.length !== parsed.length || !localStorage.getItem(STORAGE_KEYS.MEMBERS)) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return initialMembers;
  }
}

export function saveMembers(members: Member[]): void {
  localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
  const ts = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'members', timestamp: ts } }));
  syncToBackendServerAsync();
}

export function addMember(member: Omit<Member, 'id'> & { id?: string }): Member {
  const members = getMembers();
  const nextNum = members.length + 1;
  const newMember: Member = {
    ...member,
    id: member.id || `MEM-${String(nextNum).padStart(3, '0')}`,
  };
  members.unshift(newMember);
  saveMembers(members);

  // If this new member is designated as a head, update the family record
  if (newMember.isHead && newMember.familyId) {
    updateFamily(newMember.familyId, {
      headName: newMember.fullName,
      phone: newMember.phone || '',
      telegram: newMember.telegram || '',
    });
  }

  return newMember;
}

export function addMembersBatch(newMembers: Member[]): Member[] {
  if (!newMembers || newMembers.length === 0) return [];
  const currentMembers = getMembers();
  const existingIds = new Set(currentMembers.map((m) => m.id.toUpperCase().trim()));
  const trulyNew: Member[] = [];

  for (const m of newMembers) {
    if (!existingIds.has(m.id.toUpperCase().trim())) {
      trulyNew.push(m);
      existingIds.add(m.id.toUpperCase().trim());
    }
  }

  if (trulyNew.length > 0) {
    const updated = [...trulyNew, ...currentMembers];
    saveMembers(updated);
  }
  return trulyNew;
}

export function updateMember(id: string, updates: Partial<Member>): Member | null {
  const members = getMembers();
  const index = members.findIndex((m) => m.id === id);
  if (index === -1) return null;
  const oldName = members[index].fullName;
  const updated = { ...members[index], ...updates };
  members[index] = updated;
  saveMembers(members);

  // 1. If member fullName changed, update all corresponding contributions
  if (updates.fullName && updates.fullName !== oldName) {
    const contributions = getContributions();
    let conChanged = false;
    contributions.forEach((c) => {
      if (c.memberId === id) {
        c.memberName = updates.fullName!;
        conChanged = true;
      }
    });
    if (conChanged) {
      saveContributions(contributions);
    }
  }

  // 2. If this member is a family head, synchronize family's headName, phone, and telegram
  if (updated.isHead && updated.familyId) {
    const families = getFamilies();
    const fIdx = families.findIndex((f) => f.id === updated.familyId);
    if (fIdx !== -1) {
      let fChanged = false;
      if (updates.fullName && families[fIdx].headName !== updates.fullName) {
        families[fIdx].headName = updates.fullName;
        fChanged = true;
      }
      if (updates.phone !== undefined && families[fIdx].phone !== updates.phone) {
        families[fIdx].phone = updates.phone;
        fChanged = true;
      }
      if (updates.telegram !== undefined && families[fIdx].telegram !== updates.telegram) {
        families[fIdx].telegram = updates.telegram;
        fChanged = true;
      }
      if (fChanged) {
        saveFamilies(families);
      }
    }
  }

  return updated;
}

export function deleteMember(id: string): void {
  const members = getMembers().filter((m) => m.id !== id);
  saveMembers(members);
  const contributions = getContributions().filter((c) => c.memberId !== id);
  saveContributions(contributions);
  if (typeof window !== 'undefined') {
    fetch(`/api/members/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

export function getContributions(): Contribution[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONTRIBUTIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CONTRIBUTIONS, JSON.stringify(initialContributions));
      return initialContributions;
    }
    const parsed: Contribution[] = JSON.parse(raw);
    // Enforce: ከ ሀምሌ 01፣ 2018 በፊት ምንም አይነት ክፍያ የለም
    const valid = parsed.filter((c) => {
      if (!c.ethiopianYear || c.ethiopianYear < 2018) return false;
      if (c.ethiopianYear === 2018 && c.ethiopianMonth < 11) return false;
      return true;
    });

    // 1. Enforce: avoid double entry for the same member, same year, and same month
    let hasDeduplicated = false;
    const monthlyMap = new Map<string, Contribution>();
    const nonMonthly: Contribution[] = [];

    for (const c of valid) {
      if (c.type === 'ወርሃዊ') {
        const key = `${c.memberId}-${c.ethiopianYear}-${c.ethiopianMonth}`;
        const existing = monthlyMap.get(key);
        if (!existing) {
          monthlyMap.set(key, c);
        } else {
          hasDeduplicated = true;
          // Keep the paid record or the one with higher paid amount
          if ((c.paidAmount || 0) > (existing.paidAmount || 0) || (c.status === 'ተከፍሏል' && existing.status !== 'ተከፍሏል')) {
            monthlyMap.set(key, c);
          }
        }
      } else {
        nonMonthly.push(c);
      }
    }

    const deduplicatedEntries = [...Array.from(monthlyMap.values()), ...nonMonthly];

    // 2. Ensure strictly unique IDs to avoid React duplicate key errors (e.g. CON-247)
    let hasDuplicateId = false;
    const seenIds = new Set<string>();
    let maxNumericId = 0;

    for (const c of deduplicatedEntries) {
      if (c.id) {
        const numMatch = c.id.match(/^CON-(\d+)$/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num > maxNumericId) maxNumericId = num;
        }
      }
    }

    const sanitized: Contribution[] = deduplicatedEntries.map((c) => {
      if (!c.id || seenIds.has(c.id)) {
        hasDuplicateId = true;
        maxNumericId++;
        const newId = `CON-${String(maxNumericId).padStart(3, '0')}`;
        seenIds.add(newId);
        return { ...c, id: newId };
      }
      seenIds.add(c.id);
      return c;
    });

    if (hasDeduplicated || hasDuplicateId || valid.length !== parsed.length) {
      const finalCon = sanitized.length > 0 ? sanitized : initialContributions;
      localStorage.setItem(STORAGE_KEYS.CONTRIBUTIONS, JSON.stringify(finalCon));
      return finalCon;
    }
    return sanitized;
  } catch {
    return initialContributions;
  }
}

export function saveContributions(contributions: Contribution[]): void {
  // Ensure uniqueness before saving
  const seenIds = new Set<string>();
  let maxNumericId = 0;
  for (const c of contributions) {
    if (c.id) {
      const numMatch = c.id.match(/^CON-(\d+)$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxNumericId) maxNumericId = num;
      }
    }
  }

  const cleanContributions = contributions.map((c) => {
    if (!c.id || seenIds.has(c.id)) {
      maxNumericId++;
      const newId = `CON-${String(maxNumericId).padStart(3, '0')}`;
      seenIds.add(newId);
      return { ...c, id: newId };
    }
    seenIds.add(c.id);
    return c;
  });

  localStorage.setItem(STORAGE_KEYS.CONTRIBUTIONS, JSON.stringify(cleanContributions));
  const ts = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'contributions', timestamp: ts } }));
  syncToBackendServerAsync();
}

export function addContribution(con: Omit<Contribution, 'id'> & { id?: string }): Contribution {
  const contributions = getContributions();

  // Avoid double entry for the same year and same month for the same member
  if (con.type === 'ወርሃዊ') {
    const existingIndex = contributions.findIndex(
      (c) =>
        c.memberId === con.memberId &&
        c.type === 'ወርሃዊ' &&
        c.ethiopianMonth === con.ethiopianMonth &&
        c.ethiopianYear === con.ethiopianYear
    );
    if (existingIndex !== -1) {
      // Update existing record rather than creating a duplicate entry!
      const existing = contributions[existingIndex];
      const updated: Contribution = {
        ...existing,
        ...con,
        id: existing.id,
        receiptNumber: existing.receiptNumber || con.receiptNumber,
      };
      contributions[existingIndex] = updated;
      saveContributions(contributions);
      return updated;
    }
  }

  let maxNumericId = 0;
  for (const c of contributions) {
    if (c.id) {
      const numMatch = c.id.match(/^CON-(\d+)$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxNumericId) maxNumericId = num;
      }
    }
  }
  const nextNum = maxNumericId + 1;
  const newContribution: Contribution = {
    ...con,
    id: con.id || `CON-${String(nextNum).padStart(3, '0')}`,
    receiptNumber: con.receiptNumber || `REC-2018-${String(nextNum).padStart(3, '0')}`,
  };
  contributions.unshift(newContribution);
  saveContributions(contributions);
  return newContribution;
}

export function addContributionsBatch(conList: (Omit<Contribution, 'id'> & { id?: string })[]): Contribution[] {
  const contributions = getContributions();
  let maxNumericId = 0;
  for (const c of contributions) {
    if (c.id) {
      const numMatch = c.id.match(/^CON-(\d+)$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxNumericId) maxNumericId = num;
      }
    }
  }

  const resultContributions = [...contributions];
  const processed: Contribution[] = [];

  for (const con of conList) {
    if (con.type === 'ወርሃዊ') {
      const existingIdx = resultContributions.findIndex(
        (c) =>
          c.memberId === con.memberId &&
          c.type === 'ወርሃዊ' &&
          c.ethiopianMonth === con.ethiopianMonth &&
          c.ethiopianYear === con.ethiopianYear
      );
      if (existingIdx !== -1) {
        const existing = resultContributions[existingIdx];
        const updated: Contribution = {
          ...existing,
          ...con,
          id: existing.id,
          receiptNumber: existing.receiptNumber || con.receiptNumber,
        };
        resultContributions[existingIdx] = updated;
        processed.push(updated);
        continue;
      }
    }

    maxNumericId++;
    const newCon: Contribution = {
      ...con,
      id: con.id || `CON-${String(maxNumericId).padStart(3, '0')}`,
      receiptNumber: con.receiptNumber || `REC-2018-${String(maxNumericId).padStart(3, '0')}`,
    };
    resultContributions.unshift(newCon);
    processed.push(newCon);
  }

  saveContributions(resultContributions);
  return processed;
}

export function updateContribution(id: string, updates: Partial<Contribution>): Contribution | null {
  const contributions = getContributions();
  const index = contributions.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const updated = { ...contributions[index], ...updates };
  contributions[index] = updated;
  saveContributions(contributions);
  return updated;
}

export function deleteContribution(id: string): void {
  const contributions = getContributions().filter((c) => c.id !== id);
  saveContributions(contributions);
}

export function resetAllData(): void {
  localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(initialMembers));
  localStorage.setItem(STORAGE_KEYS.FAMILIES, JSON.stringify(initialFamilies));
  localStorage.setItem(STORAGE_KEYS.CONTRIBUTIONS, JSON.stringify(initialContributions));
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
  const ts = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'reset', timestamp: ts } }));
}

export function getMonthlyRateForGeneration(gen: GenerationNumber): number {
  const settings = getSettings();
  return settings.monthlyRate[gen] ?? 50;
}

export function getGenerationPaymentForGeneration(gen: GenerationNumber): number {
  const settings = getSettings();
  return settings.generationPayment[gen] ?? 500;
}

export function getEffectiveMonthlyRate(member: Member, settings: SettingsRates): number {
  if (member.isMinor) return 0; // 18 ዓመት ያልሞላቸው ከክፍያ ነፃ
  if (member.isSpouse) return settings.spouseMonthlyRate || 100; // የአባላት የትዳር አጋሮች 100 ብር
  return settings.monthlyRate[member.generation] ?? 50;
}

export function getEffectiveGenRate(member: Member, settings: SettingsRates): number {
  if (member.isMinor) return 0; // 18 ዓመት ያልሞላቸው ከክፍያ ነፃ
  if (member.isSpouse) return 0; // የአባላት የትዳር አጋሮች ከትውልድ ክፍያ ነፃ
  return settings.generationPayment[member.generation] ?? 500;
}

export interface MemberGenStats {
  expectedAmount: number;
  paidSoFar: number;
  remainingBalance: number;
  status: 'ነፃ (Exempt)' | 'ተከፍሏል (ሙሉ)' | 'ከፊል ክፍያ' | 'ያልተከፈለ';
  isExempt: boolean;
  contributions: Contribution[];
}

export function getMemberGenContributionStats(
  member: Member,
  settings: SettingsRates,
  contributions: Contribution[]
): MemberGenStats {
  const expectedAmount = getEffectiveGenRate(member, settings);
  if (member.isMinor || member.isSpouse || expectedAmount === 0) {
    return {
      expectedAmount: 0,
      paidSoFar: 0,
      remainingBalance: 0,
      status: 'ነፃ (Exempt)',
      isExempt: true,
      contributions: [],
    };
  }

  const memberGenCons = contributions.filter(
    (c) => c.memberId === member.id && c.type === 'ትውልድ'
  );

  const paidSoFar = memberGenCons
    .filter((c) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
    .reduce((sum, c) => sum + (c.paidAmount || 0), 0);

  const remainingBalance = Math.max(expectedAmount - paidSoFar, 0);

  let status: 'ተከፍሏል (ሙሉ)' | 'ከፊል ክፍያ' | 'ያልተከፈለ' = 'ያልተከፈለ';
  if (paidSoFar >= expectedAmount) {
    status = 'ተከፍሏል (ሙሉ)';
  } else if (paidSoFar > 0) {
    status = 'ከፊል ክፍያ';
  }

  return {
    expectedAmount,
    paidSoFar,
    remainingBalance,
    status,
    isExempt: false,
    contributions: memberGenCons,
  };
}

// Telegram dispatch tracking for Family Heads
const TG_DISPATCH_KEY = 'abarrus_tg_dispatched_heads_v4';

export function getTelegramDispatchedHeads(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TG_DISPATCH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordTelegramLinkSent(familyId: string): void {
  try {
    const records = getTelegramDispatchedHeads();
    records[familyId] = new Date().toISOString();
    localStorage.setItem(TG_DISPATCH_KEY, JSON.stringify(records));
  } catch {}
}

export function saveAllDataNow(data: {
  members: Member[];
  families: Family[];
  contributions: Contribution[];
  settings: SettingsRates;
}): void {
  saveMembers(data.members);
  saveFamilies(data.families);
  saveContributions(data.contributions);
  saveSettings(data.settings);
  syncToBackendServerAsync();
}

let isSyncingToServer = false;
let syncTimeout: any = null;

export function syncToBackendServerAsync(): void {
  if (typeof window === 'undefined') return;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(async () => {
    if (isSyncingToServer) return;
    try {
      isSyncingToServer = true;
      const members = getMembers();
      const families = getFamilies();
      const contributions = getContributions();
      const settings = getSettings();
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members, families, contributions, settings }),
      });
    } catch (err) {
      // Failover silently to browser localStorage
    } finally {
      isSyncingToServer = false;
    }
  }, 1000);
}

export async function syncWithBackendServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return false;
    const json = await res.json();
    if (json.success && json.data) {
      const serverData = json.data;
      let updatedAny = false;
      if (serverData.members && Array.isArray(serverData.members) && serverData.members.length > 0) {
        // filter out MEM-113 and MEM-114
        const clean = serverData.members.filter((m: any) => m.id !== 'MEM-113' && m.id !== 'MEM-114');
        localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(clean));
        updatedAny = true;
      }
      if (serverData.families && Array.isArray(serverData.families) && serverData.families.length > 0) {
        localStorage.setItem(STORAGE_KEYS.FAMILIES, JSON.stringify(serverData.families));
        updatedAny = true;
      }
      if (serverData.contributions && Array.isArray(serverData.contributions)) {
        localStorage.setItem(STORAGE_KEYS.CONTRIBUTIONS, JSON.stringify(serverData.contributions));
        updatedAny = true;
      }
      if (serverData.settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(serverData.settings));
        updatedAny = true;
      }
      if (updatedAny) {
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'backend_sync' } }));
        return true;
      }
    } else {
      // First time initialization: seed server with current state!
      syncToBackendServerAsync();
    }
  } catch {}
  return false;
}

export async function refreshAllDataFromServer(): Promise<boolean> {
  const result = await syncWithBackendServer();
  const ts = recordSaveTimestamp();
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { type: 'refresh', timestamp: ts } }));
  return result;
}

export function deduplicateAndCleanAllContributions(): { beforeCount: number; afterCount: number; removedCount: number } {
  const contributions = getContributions();
  const beforeCount = contributions.length;
  const monthlyMap = new Map<string, Contribution>();
  const nonMonthly: Contribution[] = [];

  for (const c of contributions) {
    if (c.type === 'ወርሃዊ') {
      const key = `${c.memberId}-${c.ethiopianYear}-${c.ethiopianMonth}`;
      const existing = monthlyMap.get(key);
      if (!existing) {
        monthlyMap.set(key, c);
      } else {
        // Keep the paid record or higher paid amount
        if ((c.paidAmount || 0) > (existing.paidAmount || 0) || (c.status === 'ተከፍሏል' && existing.status !== 'ተከፍሏል')) {
          monthlyMap.set(key, c);
        }
      }
    } else {
      nonMonthly.push(c);
    }
  }

  const cleaned = [...Array.from(monthlyMap.values()), ...nonMonthly];
  saveContributions(cleaned);
  return {
    beforeCount,
    afterCount: cleaned.length,
    removedCount: beforeCount - cleaned.length,
  };
}


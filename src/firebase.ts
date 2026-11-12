/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  waitForPendingWrites,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  Firestore,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { Member, Contribution, Family, SettingsRates, NotificationLog } from './types';
import { initialSettings, initialMembers } from './data/initialData';
import { getMembers, saveMembers, addMembersBatch } from './utils/storage';
import { generateLoginToken } from './utils/token';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Initialize Firestore with persistentLocalCache (Offline persistence & multi-tab auto-sync)
 */
function createPersistentFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (err) {
    try {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache(),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch (e2) {
      console.warn('[Firestore] Falling back to standard getFirestore:', e2);
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db: Firestore = createPersistentFirestoreInstance();

// Initialize Firebase Auth
export const auth = getAuth(app);
export { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Google Auth Provider with Gmail scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://mail.google.com/');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.compose');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.modify');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

/**
 * Send an email using Gmail API with the user's active Google OAuth session
 */
export async function sendGmailMessage(
  to: string,
  subject: string,
  bodyText: string,
  htmlBody?: string
): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error('Gmail access token is missing. Please sign in with Google first.');

  const boundary = 'abarrus_mail_boundary_' + Date.now();
  const rawSubject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  const messageParts = [
    `To: ${to}`,
    `Subject: ${rawSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody || `<div style="font-family: sans-serif; line-height: 1.6;">${bodyText.replace(/\n/g, '<br/>')}</div>`,
    '',
    `--${boundary}--`,
  ];

  const rawMessage = messageParts.join('\r\n');
  const base64Encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64Encoded }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gmail API returned ${response.status}`);
  }

  return response.json();
}

// -------------------------------------------------------------
// FIRESTORE COLLECTIONS
// -------------------------------------------------------------
export const MEMBERS_COLLECTION = 'members';
export const CONTRIBUTIONS_COLLECTION = 'contributions';
export const FAMILIES_COLLECTION = 'families';
export const SETTINGS_COLLECTION = 'settings';
export const COMPLAINTS_COLLECTION = 'complaints';
export const RECEIPTS_COLLECTION = 'receipts';
export const TELEGRAM_USERS_COLLECTION = 'telegramUsers';
export const NOTIFICATION_LOGS_COLLECTION = 'notificationLogs';

/**
 * 1. QUERY CODE USED FOR MEMBER LOGIN BY TOKEN OR ID OR PHONE
 * Look up a member by their unique secure loginToken, document ID, or phone number
 */
export async function getMemberByLoginToken(tokenOrId: string): Promise<Member | null> {
  if (!tokenOrId || typeof tokenOrId !== 'string' || !tokenOrId.trim()) {
    return null;
  }
  const clean = tokenOrId.trim();
  const cleanUpper = clean.toUpperCase();

  // A. Try matching by loginToken in Firestore
  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);
    const qToken = query(membersRef, where('loginToken', '==', clean));
    const snapToken = await getDocs(qToken);
    if (!snapToken.empty) {
      const d = snapToken.docs[0];
      return { id: d.id, ...d.data() } as Member;
    }
  } catch (err) {
    console.warn('[Firestore] Query by loginToken notice:', err);
  }

  // B. Try direct document ID lookup in Firestore (e.g. MEM-001, MEM-030)
  try {
    const directDoc = await getDoc(doc(db, MEMBERS_COLLECTION, cleanUpper));
    if (directDoc.exists()) {
      return { id: directDoc.id, ...directDoc.data() } as Member;
    }
    if (clean !== cleanUpper) {
      const directDocRaw = await getDoc(doc(db, MEMBERS_COLLECTION, clean));
      if (directDocRaw.exists()) {
        return { id: directDocRaw.id, ...directDocRaw.data() } as Member;
      }
    }
  } catch (err) {
    console.warn('[Firestore] Query by doc ID notice:', err);
  }

  // C. Try matching by phone number in Firestore (supports global and local formats)
  try {
    const phoneMatch = await getMemberByPhone(clean);
    if (phoneMatch) {
      return phoneMatch;
    }
  } catch (err) {
    console.warn('[Firestore] Query by phone notice:', err);
  }

  // D. Fallback to local storage (instant offline & synchronous cache)
  try {
    const localMembers = getMembers();
    const localMatch = localMembers.find((m) => {
      if (m.loginToken && m.loginToken === clean) return true;
      if (m.id.toUpperCase() === cleanUpper) return true;
      if (m.phone) {
        const pClean = m.phone.replace(/[^0-9]/g, '');
        const qClean = clean.replace(/[^0-9]/g, '');
        if (m.phone === clean || (qClean.length >= 7 && pClean.endsWith(qClean))) return true;
      }
      return false;
    });
    if (localMatch) {
      return localMatch;
    }
  } catch (err) {
    console.warn('[LocalStorage] Fallback search notice:', err);
  }

  // E. Fallback to initial seed members
  const seedMatch = initialMembers.find((m) => {
    if (m.id.toUpperCase() === cleanUpper) return true;
    if (m.phone) {
      const pClean = m.phone.replace(/[^0-9]/g, '');
      const qClean = clean.replace(/[^0-9]/g, '');
      if (m.phone === clean || (qClean.length >= 7 && pClean.endsWith(qClean))) return true;
    }
    return false;
  });
  if (seedMatch) {
    return seedMatch;
  }

  return null;
}

/**
 * Validates whether a phone number matches local Ethiopian or global international format.
 * - Local Ethiopian: 10 digits starting with 09 or 07 (or 9 digits starting with 9 or 7)
 * - Global International: starts with '+' (E.164 format, 7 to 15 digits) or '00', or 9 to 15 digits
 */
export function isValidPhoneNumber(rawPhone: string): boolean {
  if (!rawPhone) return false;
  const trimmed = String(rawPhone).trim().replace(/[\s()\-.]/g, '');
  if (!trimmed) return false;

  // 1. Local Ethiopian 10 digits: 09... or 07...
  if (/^(09|07)\d{8}$/.test(trimmed)) return true;

  // 2. Ethiopian without leading 0 (9 digits: 9... or 7...)
  if (/^(9|7)\d{8}$/.test(trimmed)) return true;

  // 3. Ethiopian international with +251
  if (/^\+251(9|7)\d{8}$/.test(trimmed)) return true;

  // 4. Ethiopian international with 251
  if (/^251(9|7)\d{8}$/.test(trimmed)) return true;

  // 5. Global international format starting with '+' (ITU E.164: + followed by 7 to 15 digits)
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return true;

  // 6. Global international starting with '00'
  if (/^00[1-9]\d{6,14}$/.test(trimmed)) return true;

  // 7. Standard digit sequence between 8 and 15 digits
  if (/^\d{8,15}$/.test(trimmed)) return true;

  return false;
}

/**
 * Normalize phone numbers with STRICT BACKWARD COMPATIBILITY:
 * - Local Ethiopian (09... or 07...): STRICTLY kept as "09..." / "07...". NEVER force-converted to +251...
 * - Ethiopian 9 digits (9... or 7...): prepends 0 -> "09..." / "07..."
 * - International starting with '+': keeps '+' followed by digits (e.g. +966501234567, +12025550123)
 * - International starting with '00': converts '00' to '+' (e.g. 00966... -> +966...)
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/[\s()\-.]/g, '');
  if (!trimmed) return '';

  // 1. If it starts with '+', keep the '+' followed by digits
  if (trimmed.startsWith('+')) {
    const digitsOnly = trimmed.slice(1).replace(/\D/g, '');
    return '+' + digitsOnly;
  }

  // 2. If it starts with '00', convert to '+' international format
  if (trimmed.startsWith('00') && trimmed.length > 4) {
    const digitsOnly = trimmed.slice(2).replace(/\D/g, '');
    return '+' + digitsOnly;
  }

  // 3. Ethiopian 10-digit format (09... or 07...): STRICTLY preserve leading 09/07, DO NOT convert to +251
  if (trimmed.length === 10 && (trimmed.startsWith('09') || trimmed.startsWith('07'))) {
    return trimmed;
  }

  // 4. Ethiopian 9-digit format (9... or 7...): prepend 0 -> 09... / 07...
  if (trimmed.length === 9 && (trimmed.startsWith('9') || trimmed.startsWith('7'))) {
    return '0' + trimmed;
  }

  // 5. If it starts with 251 and has 12 digits (e.g. 251912345678)
  if (trimmed.startsWith('251') && trimmed.length === 12) {
    return '+' + trimmed;
  }

  // 6. Default clean string
  return trimmed;
}

/**
 * Creates dummy email from phone number (<cleanPhone>@abarrus.local).
 * - If user enters "0912345678", generates "0912345678@abarrus.local"
 * - If user enters "+966501234567", strips the "+" sign and generates "966501234567@abarrus.local"
 */
export function getDummyEmailFromPhone(phone: string): string {
  if (!phone) return '';
  const normalized = normalizePhoneNumber(phone);
  // Strip '+' sign, spaces, hyphens, and parentheses
  const clean = String(normalized)
    .trim()
    .replace(/^\+/, '')
    .replace(/[\s()\-.]/g, '');
  return `${clean}@abarrus.local`;
}

/**
 * Returns candidate search variations for smart phone lookup in Firestore.
 * Prioritizes the exact input typed by the user as candidate #1!
 */
export function getPhoneNumberVariations(phone: string): string[] {
  if (!phone) return [];
  const trimmed = String(phone).trim().replace(/[\s()\-.]/g, '');
  if (!trimmed) return [];

  const variations: string[] = [];
  const add = (v: string) => {
    if (v && !variations.includes(v)) {
      variations.push(v);
    }
  };

  // 1. Prioritize what the user typed (and normalized) as candidate #1
  const norm = normalizePhoneNumber(trimmed);
  add(trimmed);
  add(norm);

  // 2. Ethiopian variations
  // If user typed "09..." or "07..." (10 digits)
  if (trimmed.length === 10 && (trimmed.startsWith('09') || trimmed.startsWith('07'))) {
    const nine = trimmed.slice(1);
    add(`+251${nine}`);
    add(`251${nine}`);
    add(nine);
  }
  // If user typed "+2519..." or "+2517..."
  else if (trimmed.startsWith('+251') && trimmed.length >= 12) {
    const nine = trimmed.slice(4);
    add(`0${nine}`);
    add(`251${nine}`);
    add(nine);
  }
  // If user typed "2519..." or "2517..."
  else if (trimmed.startsWith('251') && trimmed.length === 12) {
    const nine = trimmed.slice(3);
    add(`+251${nine}`);
    add(`0${nine}`);
    add(nine);
  }
  // If user typed 9 digits "9..." or "7..."
  else if (trimmed.length === 9 && (trimmed.startsWith('9') || trimmed.startsWith('7'))) {
    add(`0${trimmed}`);
    add(`+251${trimmed}`);
    add(`251${trimmed}`);
  }
  // 3. Global International variations (e.g. +966..., 00966...)
  else if (trimmed.startsWith('+')) {
    const withoutPlus = trimmed.slice(1);
    add(withoutPlus);
    add(`00${withoutPlus}`);
  } else if (trimmed.startsWith('00')) {
    const without00 = trimmed.slice(2);
    add(`+${without00}`);
    add(without00);
  } else if (trimmed.length >= 10) {
    add(`+${trimmed}`);
  }

  return variations;
}

/**
 * Formats password for Firebase Auth.
 * Default password is the last 4 digits of the phone number.
 * To satisfy Firebase Auth's minimum 6-character requirement while keeping the user's password strictly 4 digits,
 * we pad with prefix `ab_` behind the scenes if length < 6.
 */
export function formatAuthPassword(enteredPassword?: string, phone?: string): string {
  let pass = (enteredPassword || '').trim();
  if (!pass && phone) {
    const digitsOnly = String(phone).replace(/\D/g, '');
    pass = digitsOnly.slice(-4) || '1234';
  }
  if (pass.length < 6) {
    return `ab_${pass}`;
  }
  return pass;
}

/**
 * Smart look up member in Firestore by phone number.
 * Searches with smart fallback across candidate variations:
 * - If user typed "0912345678", checks "0912345678" first
 * - If user typed "+251912345678", checks "+251912345678" first
 * - If not found, checks alternate format (09... vs +251...) before throwing not found error
 * - Supports any global international number (e.g. +966..., +1..., +44...)
 */
export async function getMemberByPhone(phone: string): Promise<Member | null> {
  const variations = getPhoneNumberVariations(phone);
  if (variations.length === 0) return null;

  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);

    // 1. Check indexed query for each variation in priority order
    for (const candidate of variations) {
      const q1 = query(membersRef, where('phone', '==', candidate));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        const d = snap1.docs[0];
        const data = d.data() as any;
        return { ...data, id: d.id, phone: data.phone || candidate, phoneNumber: data.phoneNumber || candidate } as unknown as Member;
      }

      const q2 = query(membersRef, where('phoneNumber', '==', candidate));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const d = snap2.docs[0];
        const data = d.data() as any;
        return { ...data, id: d.id, phone: data.phone || candidate, phoneNumber: data.phoneNumber || candidate } as unknown as Member;
      }
    }

    // 2. Secondary scan across all docs in case spaces/formatting in Firestore differed
    const allSnap = await getDocs(membersRef);
    for (const d of allSnap.docs) {
      const m = d.data() as any;
      const raw = m.phone || m.phoneNumber;
      if (!raw) continue;
      const rawTrimmed = String(raw).trim().replace(/[\s()\-.]/g, '');
      const rawNorm = normalizePhoneNumber(rawTrimmed);
      if (variations.includes(rawTrimmed) || variations.includes(rawNorm)) {
        return { ...m, id: d.id, phone: m.phone || rawNorm, phoneNumber: m.phoneNumber || rawNorm } as unknown as Member;
      }
    }
  } catch (err) {
    console.warn('[Firestore] Phone lookup notice:', err);
  }

  // 3. Fallback to local storage
  try {
    const localList = getMembers();
    const foundLocal = localList.find((m) => {
      const raw = m.phone || (m as any).phoneNumber;
      if (!raw) return false;
      const rawTrimmed = String(raw).trim().replace(/[\s()\-.]/g, '');
      const rawNorm = normalizePhoneNumber(rawTrimmed);
      return variations.includes(rawTrimmed) || variations.includes(rawNorm);
    });
    if (foundLocal) {
      return { ...foundLocal, phone: foundLocal.phone || variations[0], phoneNumber: (foundLocal as any).phoneNumber || variations[0] };
    }
  } catch {}

  // 4. Fallback to initial seed members
  const foundInit = initialMembers.find((m) => {
    const raw = m.phone || (m as any).phoneNumber;
    if (!raw) return false;
    const rawTrimmed = String(raw).trim().replace(/[\s()\-.]/g, '');
    const rawNorm = normalizePhoneNumber(rawTrimmed);
    return variations.includes(rawTrimmed) || variations.includes(rawNorm);
  });
  return foundInit ? { ...foundInit, phone: foundInit.phone || variations[0], phoneNumber: (foundInit as any).phoneNumber || variations[0] } : null;
}

/**
 * Map Firebase Auth UID to the member document in Firestore and persist phone number
 */
export async function mapAuthUidToMember(memberId: string, authUid: string, phone?: string): Promise<void> {
  const cleanPhone = phone ? normalizePhoneNumber(phone) : '';
  const path = `${MEMBERS_COLLECTION}/${memberId}`;

  try {
    const updatePayload: Record<string, any> = {
      authUid: authUid,
      updatedAt: new Date().toISOString(),
    };
    if (cleanPhone) {
      updatePayload.phone = String(cleanPhone);
      updatePayload.phoneNumber = String(cleanPhone);
    }
    // Use setDoc with merge: true to avoid 'No document to update' failure if doc doesn't exist yet
    await setDoc(doc(db, MEMBERS_COLLECTION, memberId), updatePayload, { merge: true });
    console.log(`[Firestore] Successfully saved phone ${cleanPhone} and authUid ${authUid} for member ${memberId}`);
  } catch (err) {
    console.error(`[Firestore Error mapping authUid/phone for member ${memberId}]:`, err);
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  // Also keep local storage synchronized
  try {
    const localList = getMembers();
    const idx = localList.findIndex((m) => m.id === memberId);
    if (idx !== -1) {
      if (cleanPhone) {
        localList[idx].phone = cleanPhone;
      }
      localList[idx].authUid = authUid;
      saveMembers(localList);
    }
  } catch {}
}

/**
 * Look up member in Firestore by Firebase Auth UID or Phone (checks all variations)
 */
export async function getMemberByAuthUidOrPhone(authUid: string, phone?: string): Promise<Member | null> {
  const variations = phone ? getPhoneNumberVariations(phone) : [];

  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);

    // 1. Try querying by authUid
    if (authUid) {
      const qUid = query(membersRef, where('authUid', '==', authUid));
      const snapUid = await getDocs(qUid);
      if (!snapUid.empty) {
        const d = snapUid.docs[0];
        const data = d.data();
        return { ...data, id: d.id } as unknown as Member;
      }
    }

    // 2. Try querying by candidate phone variations
    for (const candidate of variations) {
      const qPhone = query(membersRef, where('phone', '==', candidate));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        const d = snapPhone.docs[0];
        return { ...d.data(), id: d.id } as unknown as Member;
      }

      const qPhone2 = query(membersRef, where('phoneNumber', '==', candidate));
      const snapPhone2 = await getDocs(qPhone2);
      if (!snapPhone2.empty) {
        const d = snapPhone2.docs[0];
        return { ...d.data(), id: d.id } as unknown as Member;
      }
    }

    // 3. Scan all docs if needed
    if (variations.length > 0) {
      const allSnap = await getDocs(membersRef);
      for (const d of allSnap.docs) {
        const m = d.data() as any;
        const raw = m.phone || m.phoneNumber;
        if (!raw) continue;
        const rawTrimmed = String(raw).trim().replace(/[\s()\-.]/g, '');
        const rawNorm = normalizePhoneNumber(rawTrimmed);
        if (variations.includes(rawTrimmed) || variations.includes(rawNorm)) {
          return { ...m, id: d.id } as unknown as Member;
        }
      }
    }
  } catch (err) {
    console.warn('[Firestore] Lookup by UID/Phone notice:', err);
  }

  // Fallback to local storage
  try {
    const localList = getMembers();
    if (authUid) {
      const foundByUid = localList.find((m) => m.authUid === authUid);
      if (foundByUid) return foundByUid;
    }
    if (variations.length > 0) {
      const foundByPhone = localList.find((m) => {
        const raw = m.phone || (m as any).phoneNumber;
        if (!raw) return false;
        const rawTrimmed = String(raw).trim().replace(/[\s()\-.]/g, '');
        const rawNorm = normalizePhoneNumber(rawTrimmed);
        return variations.includes(rawTrimmed) || variations.includes(rawNorm);
      });
      if (foundByPhone) return foundByPhone;
    }
  } catch {}

  // Fallback to initialMembers
  if (variations.length > 0) {
    const foundInit = initialMembers.find((m) => {
      const raw = m.phone || (m as any).phoneNumber;
      if (!raw) return false;
      const rawTrimmed = String(raw).trim().replace(/[\s()\-.]/g, '');
      const rawNorm = normalizePhoneNumber(rawTrimmed);
      return variations.includes(rawTrimmed) || variations.includes(rawNorm);
    });
    if (foundInit) return foundInit;
  }

  return null;
}

/**
 * Member Phone + Password Authentication (Auto-Register on first login)
 * - Verifies phone exists in Firestore members collection (checking variations)
 * - Uses dummy email <cleanPhone>@abarrus.local
 * - Default password is the last 4 digits of phone
 * - Supports global international numbers (e.g. +966...) as well as local Ethiopian (09...)
 * - Preserves existing "09..." format for backward compatibility
 */
export async function loginOrRegisterMemberWithPhone(
  phone: string,
  passwordInput?: string
): Promise<{ member: Member; user: User; isNewRegistration: boolean }> {
  const cleanPhone = normalizePhoneNumber(phone);
  if (!cleanPhone) {
    throw new Error('እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ (Please enter a valid phone number)');
  }

  // 1. Verify that this phone number exists in the Firestore members collection (smart lookup)
  const member = await getMemberByPhone(cleanPhone);
  if (!member) {
    throw new Error(
      'ይህ ስልክ ቁጥር በማህበሩ አልተመዘገበም። እባክዎ አድሚኑን ያነጋግሩ። (This phone number is not registered in the association. Please contact the Admin.)'
    );
  }

  // Primary dummy email from typed phone (Requirement 3: strip '+' if present)
  const primaryDummyEmail = getDummyEmailFromPhone(cleanPhone);
  // Alternate dummy email from member's stored phone in Firestore (if different)
  const storedDummyEmail = member.phone ? getDummyEmailFromPhone(member.phone) : primaryDummyEmail;

  const digitsOnly = cleanPhone.replace(/\D/g, '');
  const defaultLast4 = digitsOnly.slice(-4) || '1234';
  const effectivePass = passwordInput && passwordInput.trim().length > 0 ? passwordInput.trim() : defaultLast4;
  const authPass = formatAuthPassword(effectivePass, cleanPhone);

  // 2. Try to Sign In with Firebase Auth
  // We try primary email first; if not found, we also check storedDummyEmail
  const emailsToTry = [primaryDummyEmail];
  if (storedDummyEmail && storedDummyEmail !== primaryDummyEmail) {
    emailsToTry.push(storedDummyEmail);
  }

  let lastSignInErr: any = null;
  for (const email of emailsToTry) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, authPass);
      try {
        await updateProfile(userCredential.user, { displayName: member.fullName });
      } catch {}

      // Preserve member's phone number as stored if already present, or use cleanPhone
      if (!member.phone) {
        member.phone = cleanPhone;
        (member as any).phoneNumber = cleanPhone;
      }
      member.authUid = userCredential.user.uid;
      await mapAuthUidToMember(member.id, userCredential.user.uid, member.phone || cleanPhone);
      await saveMemberToFirestore(member);
      return { member, user: userCredential.user, isNewRegistration: false };
    } catch (err: any) {
      lastSignInErr = err;
      const code = err?.code || '';
      // If wrong password on existing account, don't try alternate email, throw immediately
      if (code === 'auth/wrong-password') {
        throw new Error(
          'የይለፍ ቃል የተሳሳተ ነው። ነባሪ የይለፍ ቃልዎ የስልክ ቁጥርዎ የመጨረሻ 4 አሃዞች ናቸው። (Incorrect password. Your default password is the last 4 digits of your phone number.)'
        );
      }
    }
  }

  // 3. If account doesn't exist under either email, auto-register them
  const errCode = lastSignInErr?.code || '';
  if (
    errCode === 'auth/user-not-found' ||
    errCode === 'auth/invalid-credential' ||
    errCode === 'auth/invalid-email'
  ) {
    // Choose creation email: prefer primaryDummyEmail
    const createEmail = primaryDummyEmail;
    try {
      const createCredential = await createUserWithEmailAndPassword(auth, createEmail, authPass);
      try {
        await updateProfile(createCredential.user, { displayName: member.fullName });
      } catch {}

      if (!member.phone) {
        member.phone = cleanPhone;
        (member as any).phoneNumber = cleanPhone;
      }
      member.authUid = createCredential.user.uid;
      await mapAuthUidToMember(member.id, createCredential.user.uid, member.phone || cleanPhone);
      await saveMemberToFirestore(member);
      return { member, user: createCredential.user, isNewRegistration: true };
    } catch (createErr: any) {
      if (createErr?.code === 'auth/email-already-in-use') {
        throw new Error(
          'የይለፍ ቃል የተሳሳተ ነው። ነባሪ የይለፍ ቃልዎ የስልክ ቁጥርዎ የመጨረሻ 4 አሃዞች ናቸው። (Incorrect password. Your default password is the last 4 digits of your phone number.)'
        );
      }
      if (createErr?.code === 'auth/weak-password') {
        const strongPass = `abarrus_${defaultLast4}`;
        const retryCred = await createUserWithEmailAndPassword(auth, createEmail, strongPass);
        try {
          await updateProfile(retryCred.user, { displayName: member.fullName });
        } catch {}

        if (!member.phone) {
          member.phone = cleanPhone;
          (member as any).phoneNumber = cleanPhone;
        }
        member.authUid = retryCred.user.uid;
        await mapAuthUidToMember(member.id, retryCred.user.uid, member.phone || cleanPhone);
        await saveMemberToFirestore(member);
        return { member, user: retryCred.user, isNewRegistration: true };
      }
      throw createErr;
    }
  }

  if (errCode === 'auth/wrong-password') {
    throw new Error(
      'የይለፍ ቃል የተሳሳተ ነው። ነባሪ የይለፍ ቃልዎ የስልክ ቁጥርዎ የመጨረሻ 4 አሃዞች ናቸው። (Incorrect password. Your default password is the last 4 digits of your phone number.)'
    );
  }

  if (errCode === 'auth/too-many-requests') {
    throw new Error(
      'በጣም ብዙ ሙከራዎች ተደርገዋል። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ። (Too many attempts. Please try again later.)'
    );
  }

  throw lastSignInErr;
}

/**
 * Update the current authenticated member's password in Firebase Auth.
 * If auth/requires-recent-login occurs, throws specific error so UI can prompt re-login.
 */
export async function updateCurrentMemberPassword(newPassword: string): Promise<{ success: boolean; message: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('ተጠቃሚው አልገባም። እባክዎ አስቀድመው ይግቡ። (No authenticated user found. Please log in first.)');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('የይለፍ ቃል ቢያንስ 6 ፊደላት/ቁጥሮች መሆን አለበት። (Password must be at least 6 characters long.)');
  }

  try {
    await updatePassword(currentUser, newPassword);
    return { success: true, message: 'Password updated successfully!' };
  } catch (error: any) {
    console.error('[FirebaseAuth] updatePassword error:', error);
    if (error.code === 'auth/requires-recent-login') {
      throw new Error('auth/requires-recent-login');
    }
    throw error;
  }
}

/**
 * Save a complaint/inquiry directly to Firestore complaints collection
 */
export async function saveComplaintToFirestore(complaint: {
  memberId: string;
  memberName: string;
  category: string;
  message: string;
  phone?: string;
}): Promise<string> {
  const cleanId = String(complaint.memberId || 'MEM').replace(/[^a-zA-Z0-9_-]/g, '_');
  const complaintId = `comp_${Date.now()}_${cleanId}`;
  const nowIso = new Date().toISOString();

  await safeClientFirestoreWrite(
    () =>
      setDoc(doc(db, COMPLAINTS_COLLECTION, complaintId), {
        id: complaintId,
        memberId: complaint.memberId,
        firstName: complaint.memberName,
        category: complaint.category,
        complaintText: `[${complaint.category}] ${complaint.message}`,
        phone: complaint.phone || '',
        status: 'open',
        createdAt: nowIso,
        source: 'member_portal',
      }),
    `saving complaint ${complaintId}`
  );

  return complaintId;
}

/**
 * Fetch all members live from Firestore (never from demo arrays or localStorage)
 */
export async function getMembersFromFirestore(): Promise<Member[]> {
  try {
    const snap = await getDocs(collection(db, MEMBERS_COLLECTION));
    return snap.docs.map((d) => {
      const data = d.data() as any;
      const rawPhone = data.phone || data.phoneNumber || '';
      const cleanPhone = normalizePhoneNumber(rawPhone);
      return {
        ...data,
        id: d.id,
        phone: cleanPhone || data.phone || '',
        phoneNumber: cleanPhone || data.phoneNumber || '',
      } as Member;
    });
  } catch (err) {
    console.error('Error reading members from Firestore:', err);
    return [];
  }
}

/**
 * Fetch all contributions live from Firestore
 */
export async function getContributionsFromFirestore(): Promise<Contribution[]> {
  try {
    const snap = await getDocs(collection(db, CONTRIBUTIONS_COLLECTION));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contribution));
  } catch (err) {
    console.error('Error reading contributions from Firestore:', err);
    return [];
  }
}

/**
 * Fetch ONLY a specific member's contributions from Firestore
 */
export async function getMemberContributionsFromFirestore(memberId: string): Promise<Contribution[]> {
  try {
    const q = query(collection(db, CONTRIBUTIONS_COLLECTION), where('memberId', '==', memberId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contribution));
  } catch (err) {
    console.error(`Error reading contributions for member ${memberId}:`, err);
    return [];
  }
}

/**
 * Fetch all families live from Firestore
 */
export async function getFamiliesFromFirestore(): Promise<Family[]> {
  try {
    const snap = await getDocs(collection(db, FAMILIES_COLLECTION));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Family));
  } catch (err) {
    console.error('Error reading families from Firestore:', err);
    return [];
  }
}

/**
 * Fetch association settings live from Firestore
 */
export async function getSettingsFromFirestore(): Promise<SettingsRates> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, 'rates');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as SettingsRates;
    }
  } catch (err) {
    console.error('Error reading settings from Firestore:', err);
  }
  return initialSettings;
}

/**
 * Recursively sanitizes data before sending to Firestore by removing any `undefined` values.
 * Firestore strictly rejects documents containing `undefined` properties.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

/**
 * Helper to safely perform client Firestore writes with persistent local cache support and quota handling
 */
async function safeClientFirestoreWrite(operation: () => Promise<void>, actionDesc: string): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (err: any) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const isQuota =
      err?.code === 'resource-exhausted' ||
      err?.code === 8 ||
      String(err?.message || '').includes('RESOURCE_EXHAUSTED') ||
      String(err?.message || '').includes('Quota limit exceeded');

    if (isOffline) {
      console.info(
        `[Firestore Offline Cache] ${actionDesc} saved in local persistent cache. Auto-sync will complete when connected.`
      );
      return true;
    }

    if (isQuota) {
      console.warn(
        `[Firestore Quota Notice] Daily write quota reached during ${actionDesc}. Data is safely stored in local memory and will sync when quota resets.`
      );
    } else {
      console.error(`[Firestore Error during ${actionDesc}]:`, err);
    }
    return false;
  }
}

/**
 * Wait for all local offline writes to be committed to cloud Firestore
 */
export async function waitForPendingFirestoreWrites(): Promise<void> {
  try {
    await waitForPendingWrites(db);
  } catch (err) {
    console.info('[Firestore] waitForPendingWrites notice:', err);
  }
}

export type FirestoreSyncStatus = 'online' | 'offline' | 'syncing';

/**
 * Subscribe to network and Firestore sync state
 */
export function subscribeToSyncState(callback: (status: FirestoreSyncStatus) => void): () => void {
  let isListening = true;

  const checkSync = async () => {
    if (!isListening) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      callback('offline');
      return;
    }
    callback('syncing');
    try {
      await waitForPendingWrites(db);
      if (isListening) callback('online');
    } catch {
      if (isListening) callback('online');
    }
  };

  const handleOnline = () => {
    checkSync();
  };

  const handleOffline = () => {
    callback('offline');
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  checkSync();

  return () => {
    isListening = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
}

/**
 * Save / Update a Member in Firestore with guaranteed unique loginToken
 */
export async function saveMemberToFirestore(member: Member): Promise<void> {
  const memberId = member.id;
  const token = member.loginToken || generateLoginToken();
  const rawPhone = member.phone || (member as any).phoneNumber || '';
  const cleanPhone = normalizePhoneNumber(String(rawPhone));
  const finalPhone = String(cleanPhone || rawPhone || '');
  const dataToSave: any = {
    ...member,
    loginToken: token,
    phone: finalPhone,
    phoneNumber: finalPhone,
    updatedAt: new Date().toISOString(),
  };
  const sanitized = sanitizeForFirestore(dataToSave);
  await safeClientFirestoreWrite(
    () => setDoc(doc(db, MEMBERS_COLLECTION, memberId), sanitized, { merge: true }),
    `saving member ${memberId}`
  );

  // Sync local storage
  try {
    const localList = getMembers();
    const idx = localList.findIndex((m) => m.id === memberId);
    if (idx !== -1) {
      localList[idx] = { ...localList[idx], ...dataToSave };
      saveMembers(localList);
    }
  } catch {}
}

export interface BulkImportProgress {
  currentBatch: number;
  totalBatches: number;
  processedCount: number;
  totalCount: number;
  percentage: number;
}

export interface SkippedRecordInfo {
  rowNumber: number;
  memberId: string;
  fullName: string;
  phone: string;
  reason: string;
}

export interface BulkImportResult {
  addedCount: number;
  skippedCount: number;
  addedMembers: Member[];
  skippedRecords: SkippedRecordInfo[];
  summaryMessage: string;
}

/**
 * Upload all parsed records into the Firestore "members" collection using Firestore Batch Writes.
 * Handles more than 500 records by chunking into batches of 450 (below the 500 operation limit).
 * Validates Phone Numbers format (10 digits starting with 09) and guards against duplicate MemberIDs.
 */
export async function bulkImportMembersToFirestore(
  records: Array<{
    rowNumber?: number;
    id?: string;
    fullName?: string;
    phone?: string;
    generation?: number | string;
    familyId?: string;
    familyName?: string;
    isHead?: boolean;
    isMinor?: boolean;
    isSpouse?: boolean;
    telegram?: string;
    notes?: string;
    [key: string]: any;
  }>,
  onProgress?: (progress: BulkImportProgress) => void
): Promise<BulkImportResult> {
  const skippedRecords: SkippedRecordInfo[] = [];
  const validMembers: Member[] = [];

  // 1. Fetch existing members to guard against duplicate MemberIDs in Firestore
  let existingIdSet = new Set<string>();
  try {
    const existingFirestoreMembers = await getMembersFromFirestore();
    existingIdSet = new Set(existingFirestoreMembers.map((m) => m.id.toUpperCase().trim()));
  } catch (err) {
    console.warn('[BulkImport] Could not fetch existing members from Firestore, using local cache:', err);
    const local = getMembers();
    existingIdSet = new Set(local.map((m) => m.id.toUpperCase().trim()));
  }

  // Set to track duplicate IDs within the imported batch itself
  const seenBatchIds = new Set<string>();

  // 2. Validate every record before saving
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    const rowNum = rec.rowNumber || idx + 1;
    const rawId = String(rec.id || '').trim();
    const rawName = String(rec.fullName || '').trim();
    const rawPhone = String(rec.phone || '').trim();

    // Check Member ID presence
    if (!rawId) {
      skippedRecords.push({
        rowNumber: rowNum,
        memberId: 'N/A',
        fullName: rawName || 'N/A',
        phone: rawPhone || 'N/A',
        reason: 'Missing Member ID (የአባል መለያ አልተገኘም)',
      });
      continue;
    }

    const normId = rawId.toUpperCase();

    // Check duplicate ID in database
    if (existingIdSet.has(normId)) {
      skippedRecords.push({
        rowNumber: rowNum,
        memberId: rawId,
        fullName: rawName || 'N/A',
        phone: rawPhone || 'N/A',
        reason: `Duplicate Member ID: '${rawId}' already exists in database (ቀድሞ በዳታቤዝ ውስጥ ያለ መለያ)`,
      });
      continue;
    }

    // Check duplicate ID within CSV
    if (seenBatchIds.has(normId)) {
      skippedRecords.push({
        rowNumber: rowNum,
        memberId: rawId,
        fullName: rawName || 'N/A',
        phone: rawPhone || 'N/A',
        reason: `Duplicate Member ID: '${rawId}' appears multiple times in file (በፋይሉ ውስጥ የተደገመ መለያ)`,
      });
      continue;
    }

    // Check Full Name
    if (!rawName) {
      skippedRecords.push({
        rowNumber: rowNum,
        memberId: rawId,
        fullName: 'N/A',
        phone: rawPhone || 'N/A',
        reason: 'Missing Full Name (የአባሉ ሙሉ ስም አልተሞላም)',
      });
      continue;
    }

    // Validate Phone Number: global format or Ethiopian (09...)
    const isValidPhone = isValidPhoneNumber(rawPhone);
    const cleanPhone = normalizePhoneNumber(rawPhone);

    if (!isValidPhone) {
      skippedRecords.push({
        rowNumber: rowNum,
        memberId: rawId,
        fullName: rawName,
        phone: rawPhone || 'N/A',
        reason: `Invalid Phone Number: '${rawPhone}'. Must be a valid phone number (09... or international e.g. +966...) (ትክክለኛ ስልክ ቁጥር መሆን አለበት)`,
      });
      continue;
    }

    // Valid record
    seenBatchIds.add(normId);

    const genNum = Number(rec.generation) || 4;
    const validGen = genNum === 3 || genNum === 4 || genNum === 5 || genNum === 6 ? genNum : 4;
    const familyId = String(rec.familyId || 'FA001').toUpperCase().trim();
    const familyName = String(rec.familyName || '').trim() || 'የአበሩስ ቤተሰብ';

    const validMember: Member = {
      id: rawId,
      fullName: rawName,
      phone: cleanPhone,
      phoneNumber: cleanPhone,
      generation: validGen as any,
      familyId,
      familyName,
      isHead: Boolean(rec.isHead),
      isMinor: Boolean(rec.isMinor),
      isSpouse: Boolean(rec.isSpouse),
      telegram: rec.telegram?.trim() || undefined,
      notes: rec.notes?.trim() || undefined,
      loginToken: generateLoginToken(),
      joinedDate: new Date().toISOString(),
    };

    validMembers.push(validMember);
  }

  // 3. Chunked Firestore Batch Writes (handles > 500 records smoothly)
  const BATCH_CHUNK_SIZE = 450;
  const totalBatches = Math.ceil(validMembers.length / BATCH_CHUNK_SIZE) || 1;
  let totalProcessed = 0;

  if (validMembers.length > 0) {
    for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
      const chunk = validMembers.slice(bIndex * BATCH_CHUNK_SIZE, (bIndex + 1) * BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const m of chunk) {
        const docRef = doc(db, MEMBERS_COLLECTION, m.id);
        const sanitized = sanitizeForFirestore(m);
        batch.set(docRef, sanitized, { merge: true });
      }

      try {
        await batch.commit();
      } catch (batchErr: any) {
        console.error(`[Firestore Batch Write Error at chunk ${bIndex + 1}]:`, batchErr);
        handleFirestoreError(batchErr, OperationType.WRITE, MEMBERS_COLLECTION);
      }

      totalProcessed += chunk.length;

      if (onProgress) {
        onProgress({
          currentBatch: bIndex + 1,
          totalBatches,
          processedCount: totalProcessed,
          totalCount: validMembers.length,
          percentage: Math.round((totalProcessed / validMembers.length) * 100),
        });
      }
    }

    // 4. Update local storage cache
    addMembersBatch(validMembers);
  }

  const addedCount = validMembers.length;
  const skippedCount = skippedRecords.length;
  const summaryMessage = `${addedCount} records successfully added, ${skippedCount} records skipped (duplicates/errors).`;

  return {
    addedCount,
    skippedCount,
    addedMembers: validMembers,
    skippedRecords,
    summaryMessage,
  };
}

/**
 * Delete a Member from Firestore and clean up any associated contributions
 */
export async function deleteMemberFromFirestore(memberId: string): Promise<void> {
  const cleanId = String(memberId || '').trim();
  if (!cleanId) return;

  await safeClientFirestoreWrite(
    () => deleteDoc(doc(db, MEMBERS_COLLECTION, cleanId)),
    `deleting member ${cleanId}`
  );

  try {
    const q = query(collection(db, CONTRIBUTIONS_COLLECTION), where('memberId', '==', cleanId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await safeClientFirestoreWrite(
        () => deleteDoc(d.ref),
        `deleting contribution ${d.id} for deleted member ${cleanId}`
      );
    }
  } catch (err) {
    console.warn(`[Firestore] Could not clean up contributions for deleted member ${cleanId}:`, err);
  }
}

/**
 * Save a Contribution (Monthly or Birth/Generation) directly to Firestore
 * Strict ledger logic: saves explicit 'month' (1-12) and 'year' (e.g. 2018) along with 'ethiopianMonth' and 'ethiopianYear'.
 * When status is paid, strictly saves status: 'Paid'.
 */
export async function saveContributionToFirestore(contribution: Contribution): Promise<void> {
  const contribId = contribution.id;
  const m = Number(contribution.month ?? contribution.ethiopianMonth ?? 11);
  const y = Number(contribution.year ?? contribution.ethiopianYear ?? 2018);
  const rawStatus = String(contribution.status || '').trim();
  const normalizedStatus = (rawStatus === 'ተከፍሏል' || rawStatus === 'Paid') ? 'Paid' : (contribution.status || 'Paid');

  const payload: any = {
    ...contribution,
    month: m,
    year: y,
    ethiopianMonth: m,
    ethiopianYear: y,
    status: normalizedStatus,
    statusAm: normalizedStatus === 'Paid' ? 'ተከፍሏል' : normalizedStatus,
    amount: Number(contribution.amount || 0),
    paidAmount: Number(contribution.paidAmount || contribution.amount || 0),
    updatedAt: new Date().toISOString(),
  };

  const sanitized = sanitizeForFirestore(payload);
  await safeClientFirestoreWrite(
    () => setDoc(doc(db, CONTRIBUTIONS_COLLECTION, contribId), sanitized, { merge: true }),
    `saving contribution ${contribId}`
  );
}

/**
 * Delete a Contribution from Firestore
 */
export async function deleteContributionFromFirestore(contributionId: string): Promise<void> {
  // 1. Delete from Firestore client SDK directly
  try {
    await safeClientFirestoreWrite(
      () => deleteDoc(doc(db, CONTRIBUTIONS_COLLECTION, contributionId)),
      `deleting contribution ${contributionId}`
    );
  } catch (clientErr) {
    console.warn('[Firestore] Client delete error:', clientErr);
  }

  // 2. Synchronize deletion with server endpoint if online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await fetch(`/api/contributions/${encodeURIComponent(contributionId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        console.warn(`[API] Server delete returned status ${res.status}`);
      }
    } catch (apiErr) {
      console.warn('[API] Delete contribution fetch notice (offline/local):', apiErr);
    }
  }
}

/**
 * Strict monthly collection query based on month (1-12), year (e.g. 2018), and status == "Paid"
 * CRITICAL: Filters by where("month", "==", selectedMonth), where("year", "==", selectedYear), and where("status", "==", "Paid")
 */
export async function queryMonthlyCollectionsFromFirestore(
  selectedMonth: number,
  selectedYear: number
): Promise<Contribution[]> {
  try {
    const collRef = collection(db, CONTRIBUTIONS_COLLECTION);
    // Strict requirement: where("month", "==", selectedMonth), where("year", "==", selectedYear), and where("status", "==", "Paid")
    const qPaid = query(
      collRef,
      where('month', '==', Number(selectedMonth)),
      where('year', '==', Number(selectedYear)),
      where('status', '==', 'Paid')
    );
    const snapPaid = await getDocs(qPaid);
    const resultsMap = new Map<string, Contribution>();
    snapPaid.docs.forEach((d) => {
      const data: any = d.data();
      const m = Number(data.month ?? data.ethiopianMonth ?? selectedMonth);
      const y = Number(data.year ?? data.ethiopianYear ?? selectedYear);
      resultsMap.set(d.id, {
        id: d.id,
        ...data,
        month: m,
        year: y,
        ethiopianMonth: m,
        ethiopianYear: y,
      } as Contribution);
    });

    // Also include any legacy records saved with ethiopianMonth or status == 'ተከፍሏል'
    try {
      const qLegacy = query(
        collRef,
        where('ethiopianMonth', '==', Number(selectedMonth)),
        where('ethiopianYear', '==', Number(selectedYear)),
        where('status', '==', 'ተከፍሏል')
      );
      const snapLegacy = await getDocs(qLegacy);
      snapLegacy.docs.forEach((d) => {
        if (!resultsMap.has(d.id)) {
          const data: any = d.data();
          const m = Number(data.month ?? data.ethiopianMonth ?? selectedMonth);
          const y = Number(data.year ?? data.ethiopianYear ?? selectedYear);
          resultsMap.set(d.id, {
            id: d.id,
            ...data,
            month: m,
            year: y,
            ethiopianMonth: m,
            ethiopianYear: y,
          } as Contribution);
        }
      });
    } catch {}

    return Array.from(resultsMap.values());
  } catch (err) {
    console.error(`Error querying monthly collections for ${selectedMonth}/${selectedYear}:`, err);
    return [];
  }
}

/**
 * Save Family to Firestore
 */
export async function saveFamilyToFirestore(family: Family): Promise<void> {
  const sanitized = sanitizeForFirestore(family);
  await safeClientFirestoreWrite(
    () => setDoc(doc(db, FAMILIES_COLLECTION, family.id), sanitized, { merge: true }),
    `saving family ${family.id}`
  );
}

export interface PaymentSummaryEmailPayload {
  memberId: string;
  memberName: string;
  recipientEmail?: string;
  amount: number;
  month: number;
  monthName: string;
  year: number;
  type: string;
  paymentMethod: string;
  transactionRef: string;
  receiptNumber?: string;
  notes?: string;
}

/**
 * Log notification to Firestore collection 'notificationLogs'
 */
export async function logNotificationToFirestore(log: NotificationLog): Promise<void> {
  const sanitized = sanitizeForFirestore(log);
  await safeClientFirestoreWrite(
    () => setDoc(doc(db, NOTIFICATION_LOGS_COLLECTION, log.id), sanitized, { merge: true }),
    `saving notification log ${log.id}`
  );
}

/**
 * Fetch all notification logs from Firestore
 */
export async function getNotificationLogsFromFirestore(): Promise<NotificationLog[]> {
  try {
    const snap = await getDocs(collection(db, NOTIFICATION_LOGS_COLLECTION));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationLog));
  } catch (err) {
    console.error('Error fetching notification logs:', err);
    return [];
  }
}

/**
 * Trigger an automated summary email when a member records a payment via the Portal,
 * utilizing the existing Firebase setup to store logs of these notifications.
 */
export async function triggerPaymentSummaryEmail(
  payload: PaymentSummaryEmailPayload
): Promise<{ success: boolean; logId: string; message: string }> {
  const logId = `NOTIF-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const recipient = payload.recipientEmail || 'mesudnurga4830@gmail.com';
  const subject = `የክፍያ ማጠቃለያ ደረሰኝ (Payment Summary) - ${payload.memberName} (${payload.monthName} ${payload.year})`;

  try {
    const logEntry: NotificationLog = {
      id: logId,
      type: 'payment_summary_email',
      recipient,
      memberId: payload.memberId,
      memberName: payload.memberName,
      subject,
      amount: payload.amount,
      transactionRef: payload.transactionRef,
      status: 'sent',
      provider: 'firebase-automated-emailer',
      sentAt: nowIso,
      createdAt: nowIso,
      details: {
        type: payload.type,
        month: payload.month,
        monthName: payload.monthName,
        year: payload.year,
        paymentMethod: payload.paymentMethod,
        receiptNumber: payload.receiptNumber || `REC-${Date.now().toString().slice(-6)}`,
        notes: payload.notes || 'Recorded via Member Portal',
      },
    };

    // 1. Immediately store the notification log in Firestore collection 'notificationLogs'
    await logNotificationToFirestore(logEntry);
    console.log(`[Firestore NotificationLog] Logged automated payment summary email ${logId} for member ${payload.memberId}`);

    // 2. Trigger automated email via server notification dispatcher
    try {
      await fetch('/api/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          logId,
          recipient,
          subject,
        }),
      });
    } catch (apiErr) {
      console.warn('[Notification API Notice] Server notification route called; Firestore notification log secured.');
    }

    return {
      success: true,
      logId,
      message: `የክፍያ ማጠቃለያ ደረሰኝ ወደ ${recipient} ተልኮ በዳታቤዝ ተመዝግቧል`,
    };
  } catch (err: any) {
    console.error('[Notification Dispatch Error]:', err);
    return { success: false, logId, message: 'Notification logging partially complete.' };
  }
}

export interface ProxyPaymentNotificationPayload {
  payerId: string;
  payerName: string;
  payerPhone?: string;
  beneficiaryId: string;
  beneficiaryName: string;
  amount: number;
  month?: number;
  monthName?: string;
  year?: number;
  type: string;
  paymentMethod?: string;
  transactionRef?: string;
  receiptNumber?: string;
  status?: string;
}

/**
 * Sends a Telegram notification to the beneficiary and logs a note for the Admin Dashboard
 */
export async function triggerProxyPaymentNotification(
  payload: ProxyPaymentNotificationPayload
): Promise<{ success: boolean; logId: string; message: string }> {
  const logId = `NOTIF-PROXY-${Date.now()}`;
  const nowIso = new Date().toISOString();

  // 1. Immediately store notification log in Firestore collection 'notificationLogs'
  const logEntry: NotificationLog = {
    id: logId,
    type: 'payment_claim_alert',
    recipient: 'Admin Dashboard',
    memberId: payload.beneficiaryId,
    memberName: payload.beneficiaryName,
    subject: `[ተኪ ክፍያ] ${payload.payerName} ለ${payload.beneficiaryName} (${payload.amount} ብር)`,
    amount: payload.amount,
    transactionRef: payload.transactionRef,
    status: (payload.status as any) || 'Pending',
    provider: 'proxy-payment-dispatcher',
    sentAt: nowIso,
    createdAt: nowIso,
    details: {
      isProxyPayment: true,
      payerId: payload.payerId,
      payerName: payload.payerName,
      beneficiaryId: payload.beneficiaryId,
      beneficiaryName: payload.beneficiaryName,
      type: payload.type,
      monthName: payload.monthName,
      year: payload.year,
      receiptNumber: payload.receiptNumber,
    },
  };

  try {
    await logNotificationToFirestore(logEntry);
  } catch (e) {
    console.warn('[Firestore] Log proxy notification notice:', e);
  }

  // 2. Dispatch to server to deliver Telegram notification to beneficiary
  try {
    await fetch('/api/notifications/proxy-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (apiErr) {
    console.warn('[Notification API Notice] Server proxy notification route called.');
  }

  return {
    success: true,
    logId,
    message: `ለ${payload.beneficiaryName} የተከፈለ ተኪ ክፍያ ማሳወቂያ ተልኳል`,
  };
}

/**
 * Fetch all members sharing the same familyName (or familyId) from Firestore 'members' collection
 */
export async function getMembersByFamilyName(
  familyName: string,
  familyId?: string
): Promise<Member[]> {
  const cleanFamilyName = (familyName || '').trim();
  const cleanFamilyId = (familyId || '').trim();

  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);
    let resultsMap = new Map<string, Member>();

    if (cleanFamilyName) {
      const qName = query(membersRef, where('familyName', '==', cleanFamilyName));
      const snapName = await getDocs(qName);
      snapName.forEach((docSnap) => {
        resultsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id } as Member);
      });
    }

    if (cleanFamilyId) {
      const qId = query(membersRef, where('familyId', '==', cleanFamilyId));
      const snapId = await getDocs(qId);
      snapId.forEach((docSnap) => {
        resultsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id } as Member);
      });
    }

    if (resultsMap.size > 0) {
      return Array.from(resultsMap.values());
    }
  } catch (err) {
    console.warn('[Firestore] Query members by familyName error:', err);
  }

  // Fallback to local cached storage
  try {
    const local = getMembers();
    return local.filter(
      (m) =>
        (cleanFamilyName && m.familyName === cleanFamilyName) ||
        (cleanFamilyId && m.familyId === cleanFamilyId)
    );
  } catch {
    return [];
  }
}

/**
 * Fetch all contributions for a given familyId from Firestore
 */
export async function getFamilyContributions(familyId: string): Promise<Contribution[]> {
  const cleanFamilyId = (familyId || '').trim();
  if (!cleanFamilyId) return [];

  try {
    const contribRef = collection(db, CONTRIBUTIONS_COLLECTION);
    const q = query(contribRef, where('familyId', '==', cleanFamilyId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Contribution));
    }
  } catch (err) {
    console.warn('[Firestore] Query family contributions error:', err);
  }

  try {
    const local = await getContributionsFromFirestore();
    return local.filter((c: Contribution) => c.familyId === cleanFamilyId);
  } catch {
    return [];
  }
}
export function subscribeToMemberContributions(
  memberId: string,
  onData: (contributions: Contribution[]) => void,
  onError?: (err: Error) => void
): () => void {
  const cleanId = String(memberId || '').trim();
  const q = query(
    collection(db, CONTRIBUTIONS_COLLECTION),
    where('memberId', '==', cleanId)
  );

  console.log('[DIAGNOSE 1] Logged-in member Firestore document ID:', cleanId);
  console.log(
    `[DIAGNOSE 2] Exact contributions query: collection="${CONTRIBUTIONS_COLLECTION}", field="memberId", filterValue="${cleanId}"`
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => {
        const raw: any = docSnap.data();
        const m = Number(raw.month ?? raw.ethiopianMonth ?? 11);
        const y = Number(raw.year ?? raw.ethiopianYear ?? 2018);
        return {
          id: docSnap.id,
          ...raw,
          month: m,
          year: y,
          ethiopianMonth: m,
          ethiopianYear: y,
        };
      }) as Contribution[];

      console.log('[DIAGNOSE 3] Number of documents the query returned:', docs.length);
      console.log(
        '[DIAGNOSE 4] Sample contribution document (raw):',
        docs[0] || 'No contribution documents found for this member'
      );
      console.log(
        '[DIAGNOSE 5] Exact string value stored in "status" field:',
        docs[0]?.status ?? 'N/A'
      );

      onData(docs);
    },
    (err) => {
      console.error('[Firestore onSnapshot Error in subscribeToMemberContributions]:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time global listener for the 'contributions' collection in Firestore.
 * Notifies callbacks whenever any document is added, modified, or deleted by an Admin or through an API call.
 */
export function subscribeToAllContributions(
  onData: (contributions: Contribution[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, CONTRIBUTIONS_COLLECTION),
    (snapshot) => {
      // Diagnostic change logging for status and amount updates
      snapshot.docChanges().forEach((change) => {
        const docData: any = change.doc.data();
        if (change.type === 'modified') {
          console.log(
            `[Firestore Real-time Update] Contribution modified: ${change.doc.id} (Status: "${docData.status}", Paid: ${docData.paidAmount} ETB)`
          );
        } else if (change.type === 'added') {
          console.log(`[Firestore Real-time Update] Contribution added: ${change.doc.id}`);
        } else if (change.type === 'removed') {
          console.log(`[Firestore Real-time Update] Contribution removed: ${change.doc.id}`);
        }
      });

      const docs = snapshot.docs.map((docSnap) => {
        const raw: any = docSnap.data();
        const m = Number(raw.month ?? raw.ethiopianMonth ?? 11);
        const y = Number(raw.year ?? raw.ethiopianYear ?? 2018);
        return {
          id: docSnap.id,
          memberId: String(raw.memberId || ''),
          memberName: String(raw.memberName || ''),
          familyId: String(raw.familyId || ''),
          familyName: String(raw.familyName || ''),
          generation: Number(raw.generation || 4),
          type: raw.type || 'ወርሃዊ',
          month: m,
          year: y,
          ethiopianMonth: m,
          ethiopianMonthName: raw.ethiopianMonthName || '',
          ethiopianYear: y,
          amount: Number(raw.amount || 0),
          paidAmount: Number(raw.paidAmount || 0),
          status: raw.status || 'ያልተከፈለ',
          paymentMethod: raw.paymentMethod || 'ቀጥታ',
          receiptNumber: raw.receiptNumber || '',
          transactionRef: raw.transactionRef || '',
          datePaid: raw.datePaid || '',
          notes: raw.notes || '',
          ...raw,
        } as Contribution;
      });

      onData(docs);
    },
    (err) => {
      console.error('[Firestore onSnapshot Error in subscribeToAllContributions]:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Robust Month-matching helper (STEP B & D)
 * Matches month, year, type, and status case-insensitively and type-flexibly.
 */
export function matchMonthContribution(
  contributions: Contribution[],
  targetMonth: number,
  targetYear: number,
  expectedRate: number = 0
): { status: 'paid' | 'partial' | 'unpaid'; contribution?: Contribution; paidAmount: number } {
  const match = contributions.find((c: any) => {
    // 1. Match type (Monthly, monthly, ወርሃዊ, or undefined if only monthly exists)
    const rawType = String(c.type || '').trim().toLowerCase();
    const isMonthlyType =
      !c.type ||
      rawType === 'ወርሃዊ' ||
      rawType === 'monthly' ||
      rawType.includes('month') ||
      rawType.includes('ወርሃዊ');

    if (!isMonthlyType) return false;

    // 2. Match month as Number
    const m = Number(c.ethiopianMonth ?? c.month ?? c.monthNumber ?? c.ethiopian_month);
    if (m !== targetMonth) return false;

    // 3. Match year as Number
    const y = Number(c.ethiopianYear ?? c.year ?? c.ethiopian_year);
    if (y !== targetYear) return false;

    return true;
  });

  if (!match) {
    return { status: 'unpaid', paidAmount: 0 };
  }

  // Determine status case-insensitively
  const rawStatus = String(match.status || '').trim().toLowerCase();
  const paidAmount = Number(match.paidAmount || match.amount || 0);

  const isPaid =
    rawStatus === 'paid' ||
    rawStatus === 'ተከፍሏል' ||
    rawStatus === 'completed' ||
    rawStatus === 'approved' ||
    (expectedRate > 0 && paidAmount >= expectedRate);

  const isPartial =
    rawStatus === 'partial' ||
    rawStatus === 'ከፊል' ||
    (paidAmount > 0 && expectedRate > 0 && paidAmount < expectedRate);

  if (isPaid) {
    return { status: 'paid', contribution: match, paidAmount };
  }
  if (isPartial) {
    return { status: 'partial', contribution: match, paidAmount };
  }
  return { status: 'unpaid', contribution: match, paidAmount };
}

/**
 * Save Settings to Firestore
 */
export async function saveSettingsToFirestore(settings: SettingsRates): Promise<void> {
  const sanitized = sanitizeForFirestore(settings);
  await safeClientFirestoreWrite(
    () => setDoc(doc(db, SETTINGS_COLLECTION, 'rates'), sanitized, { merge: true }),
    'saving association settings rates'
  );
}


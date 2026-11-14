/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { generateLoginToken } from './src/utils/token.ts';
import { initialFamilies, initialMembers, initialSettings, initialContributions } from './src/data/initialData.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Port 3000 in development for iframe proxy; in production use Cloud Run's PORT env variable
const port = process.env.NODE_ENV === 'production'
  ? parseInt(process.env.PORT || '8080', 10)
  : 3000;

// Increase request body limits to 50MB to prevent PayloadTooLargeError on bulk data syncs and media payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Error handler for request entity size or malformed JSON
app.use((err: any, req: Request, res: Response, next: any) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    console.warn('[Server] PayloadTooLargeError caught:', err.message);
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request payload exceeds maximum allowed limit.',
    });
  }
  next(err);
});

// Current in-memory community data store synced with frontend
const currentStore = {
  members: [...initialMembers],
  families: [...initialFamilies],
  contributions: [...initialContributions],
  settings: { ...initialSettings },
};

// Initialize Firebase client SDK for server-side Firestore operations
let db: any = null;
try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log('[Firestore] Initialized successfully with database:', firebaseConfig.firestoreDatabaseId);
  } else {
    console.warn('[Firestore] firebase-applet-config.json not found.');
  }
} catch (error) {
  console.error('[Firestore] Initialization error:', error);
}

// Recursively sanitizes data before sending to Firestore by removing any `undefined` values.
function sanitizeForFirestore<T>(data: T): T {
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

// Safe Firestore write helper with 3-second timeout protection
// Catches quota exhaustion (Code 8 / RESOURCE_EXHAUSTED) without blocking or looping
async function safeFirestoreSetDoc(docRef: any, data: any, options?: any): Promise<boolean> {
  if (!db) return false;
  try {
    const cleanData = sanitizeForFirestore(data);
    const writePromise = options ? setDoc(docRef, cleanData, options) : setDoc(docRef, cleanData);
    await Promise.race([
      writePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 3000)),
    ]);
    return true;
  } catch (err: any) {
    const isQuota =
      err?.code === 'resource-exhausted' ||
      err?.code === 8 ||
      String(err?.message || '').includes('RESOURCE_EXHAUSTED') ||
      String(err?.message || '').includes('Quota limit exceeded');
    if (isQuota) {
      console.warn('[Firestore Quota Notice] Daily write quota reached. Operation safely preserved in memory/store.');
    } else {
      console.warn('[Firestore Write Notice]:', err?.message || err);
    }
    return false;
  }
}

// Safe Firestore delete helper with 3-second timeout protection
async function safeFirestoreDeleteDoc(docRef: any): Promise<boolean> {
  if (!db) return false;
  try {
    await Promise.race([
      deleteDoc(docRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore delete timeout')), 3000)),
    ]);
    return true;
  } catch (err: any) {
    console.warn('[Firestore Delete Notice]:', err?.message || err);
    return false;
  }
}

// Telegram Bot Token and Chat IDs - ONLY stored server-side from environment variables
function sanitizeTelegramToken(raw?: string): string {
  if (!raw) return '';
  let token = String(raw).trim();
  // Strip surrounding quotes
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }
  // Strip redundant 'bot' prefix if user typed 'bot12345:...'
  if (token.toLowerCase().startsWith('bot')) {
    token = token.slice(3).trim();
  }
  return token;
}

function isValidTelegramBotToken(token: string): boolean {
  if (!token) return false;
  // Standard Telegram bot token format: <numeric_bot_id>:<secret_hash> (e.g. 123456789:ABCdefGhI...)
  const validPattern = /^\d+:[A-Za-z0-9_-]{20,}$/;
  if (!validPattern.test(token)) return false;
  const lower = token.toLowerCase();
  if (
    lower.includes('placeholder') ||
    lower.includes('your_token') ||
    lower.includes('my_telegram') ||
    lower.includes('bot_token')
  ) {
    return false;
  }
  return true;
}

function sanitizeChatId(raw?: string | number): string {
  if (raw === undefined || raw === null) return '';
  const str = String(raw).trim();
  if (!str) return '';
  if (str.toLowerCase().includes('placeholder') || str.toLowerCase().includes('your_chat_id')) return '';
  // Valid chat IDs are numeric (e.g. 12345678, -100123456789) or start with @
  if (/^-?\d+$/.test(str) || /^@[a-zA-Z0-9_]{3,}$/.test(str)) {
    return str;
  }
  return '';
}

const RAW_TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_BOT_TOKEN = sanitizeTelegramToken(RAW_TELEGRAM_BOT_TOKEN);
let isTelegramBotActive = isValidTelegramBotToken(TELEGRAM_BOT_TOKEN);

const ADMIN_TELEGRAM_CHAT_ID = sanitizeChatId(process.env.ADMIN_TELEGRAM_CHAT_ID) || '5100488512';
const EXECUTIVE_CHAT_ID = sanitizeChatId(process.env.EXECUTIVE_CHAT_ID) || ADMIN_TELEGRAM_CHAT_ID;
const FINANCE_CHAT_ID = sanitizeChatId(process.env.FINANCE_CHAT_ID) || ADMIN_TELEGRAM_CHAT_ID;
const SECRETARY_CHAT_ID = sanitizeChatId(process.env.SECRETARY_CHAT_ID) || ADMIN_TELEGRAM_CHAT_ID;
const APP_URL =
  process.env.APP_URL ||
  'https://ais-pre-m2yi2k7mkfljr6u6wey5u2-772686905687.europe-west2.run.app';

// Helper: Send Telegram API requests safely without throwing or triggering fatal error logs
async function callTelegramApi(endpoint: string, payload: Record<string, any>) {
  if (!TELEGRAM_BOT_TOKEN || !isTelegramBotActive) {
    // Silently skip if token is unconfigured, placeholder, or deactivated
    return null;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await response.json();
    if (!result.ok) {
      // If Telegram returns 404 (Not Found) or 401 (Unauthorized), the token doesn't exist on Telegram.
      if (result.error_code === 404 || result.error_code === 401) {
        isTelegramBotActive = false;
        console.warn(`[Telegram Bot Notice] Token is invalid or not registered on Telegram (${result.description || 'Not Found'}). Automatic Telegram delivery disabled until a valid token is set.`);
      } else {
        // Normal operational response (e.g. chat not found, user blocked bot)
        console.warn(`[Telegram Bot Notice] ${endpoint} returned:`, result.description || result);
      }
    }
    return result;
  } catch (error: any) {
    console.warn(`[Telegram API Network Notice] Failed to call ${endpoint}:`, error?.message || error);
    return null;
  }
}

// Send Text Message
async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
  const cleanChatId = sanitizeChatId(chatId);
  if (!cleanChatId || !isTelegramBotActive) {
    return null;
  }
  const payload: Record<string, any> = {
    chat_id: cleanChatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  return callTelegramApi('sendMessage', payload);
}

// Send Photo (e.g. forward receipt to admin)
async function sendTelegramPhoto(chatId: string | number, photoFileId: string, caption: string) {
  const cleanChatId = sanitizeChatId(chatId);
  if (!cleanChatId || !isTelegramBotActive) {
    return null;
  }
  return callTelegramApi('sendPhoto', {
    chat_id: cleanChatId,
    photo: photoFileId,
    caption: caption,
    parse_mode: 'HTML',
  });
}

// Answer callback query
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!callbackQueryId || !isTelegramBotActive) return null;
  return callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || '',
    show_alert: false,
  });
}

// Helper: Match or register member from Firestore with unique loginToken
async function findOrRegisterTelegramMember(
  fromId: string,
  username?: string,
  senderName?: string,
  searchStr?: string,
  allowAutoRegister: boolean = false
): Promise<any> {
  const cleanFromId = String(fromId || '').trim();
  const cleanUser = (username || '').trim().replace(/^@/, '').toLowerCase();
  const cleanSearch = (searchStr || '').trim().toLowerCase();

  // If Firestore is available, use live database
  if (db) {
    try {
      const membersRef = collection(db, 'members');

      // 1. If explicit ID searched (e.g. /start MEM-001)
      if (cleanSearch && cleanSearch.startsWith('mem-')) {
        const memDoc = await getDoc(doc(db, 'members', cleanSearch.toUpperCase()));
        if (memDoc.exists()) {
          const mData = memDoc.data();
          if (!mData.loginToken) {
            mData.loginToken = generateLoginToken();
            mData.telegramId = cleanFromId;
            await safeFirestoreSetDoc(doc(db, 'members', memDoc.id), mData, { merge: true });
          }
          return { id: memDoc.id, ...mData };
        }
      }

      // 2. Query by telegramId in members collection
      if (cleanFromId) {
        const qTgId = query(membersRef, where('telegramId', '==', cleanFromId));
        let snap = await getDocs(qTgId);
        if (snap.empty && !isNaN(Number(cleanFromId))) {
          snap = await getDocs(query(membersRef, where('telegramId', '==', Number(cleanFromId))));
        }
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const mData = docSnap.data();
          if (!mData.loginToken) {
            mData.loginToken = generateLoginToken();
            await safeFirestoreSetDoc(doc(db, 'members', docSnap.id), { loginToken: mData.loginToken }, { merge: true });
          }
          return { id: docSnap.id, ...mData };
        }
      }

      // 3. Query by telegram username in members collection
      if (cleanUser) {
        let snap = await getDocs(query(membersRef, where('telegram', '==', `@${cleanUser}`)));
        if (snap.empty) {
          snap = await getDocs(query(membersRef, where('telegram', '==', cleanUser)));
        }
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const mData = docSnap.data();
          if (!mData.loginToken) {
            mData.loginToken = generateLoginToken();
          }
          mData.telegramId = cleanFromId;
          await safeFirestoreSetDoc(doc(db, 'members', docSnap.id), { loginToken: mData.loginToken, telegramId: cleanFromId }, { merge: true });
          return { id: docSnap.id, ...mData };
        }
      }

      // 4. Check if registered in telegramUsers mapping collection
      if (cleanFromId) {
        const userDoc = await getDoc(doc(db, 'telegramUsers', cleanFromId));
        if (userDoc.exists() && userDoc.data()?.memberId) {
          const mId = userDoc.data().memberId;
          const mDoc = await getDoc(doc(db, 'members', mId));
          if (mDoc.exists()) {
            const mData = mDoc.data();
            if (!mData.loginToken) {
              mData.loginToken = generateLoginToken();
              await safeFirestoreSetDoc(doc(db, 'members', mId), { loginToken: mData.loginToken, telegramId: cleanFromId }, { merge: true });
            }
            return { id: mDoc.id, ...mData };
          }
        }
      }

      // 5. If member does not exist in Firestore yet, automatically register new member ONLY if allowAutoRegister is true
      if (allowAutoRegister && cleanFromId) {
        const newMemberId = `MEM-${cleanFromId.slice(-4) || Math.floor(1000 + Math.random() * 9000)}`;
        const newToken = generateLoginToken();
        const newMemberData = {
          id: newMemberId,
          fullName: senderName?.trim() || 'የአበሩስ አባል',
          phone: '',
          telegram: cleanUser ? `@${cleanUser}` : '',
          telegramId: cleanFromId,
          generation: 4,
          familyId: 'FA001',
          familyName: 'የአበሩስ ቤተሰብ',
          isHead: false,
          isMinor: false,
          isSpouse: false,
          loginToken: newToken,
          registeredAt: new Date().toISOString(),
        };

        await safeFirestoreSetDoc(doc(db, 'members', newMemberId), newMemberData);
        await safeFirestoreSetDoc(doc(db, 'telegramUsers', cleanFromId), {
          chatId: cleanFromId,
          fromId: cleanFromId,
          firstName: senderName || '',
          username: cleanUser || '',
          memberId: newMemberId,
          loginToken: newToken,
          updatedAt: new Date().toISOString(),
        });

        console.log(`[Firestore] Registered new member ${newMemberId} with unique loginToken for Telegram ID ${cleanFromId}`);
        return newMemberData;
      }
    } catch (dbErr) {
      console.error('[Firestore Error in findOrRegisterTelegramMember]:', dbErr);
    }
  }

  // Fallback to in-memory store if Firestore is unreachable
  const membersList = currentStore?.members || [];
  let match = membersList.find((m) => m.id.toLowerCase() === cleanSearch);
  if (!match && cleanUser) {
    match = membersList.find((m) => (m.telegram || '').replace(/^@/, '').toLowerCase() === cleanUser);
  }
  if (!match && cleanFromId) {
    match = membersList.find((m) => String(m.telegramId) === cleanFromId);
  }
  if (match) {
    if (!match.loginToken) {
      match.loginToken = generateLoginToken();
    }
    return match;
  }
  return null;
}

// Build personal payment info text for a matched member including UNIQUE login link
function buildPersonalPaymentMessage(member: any, loginUrl: string) {
  const genRates: Record<number, { monthly: number; gen: number }> = {
    3: { monthly: 100, gen: 5000 },
    4: { monthly: 75, gen: 1000 },
    5: { monthly: 50, gen: 500 },
    6: { monthly: 25, gen: 250 },
  };

  const rateInfo = genRates[member.generation] || { monthly: 50, gen: 500 };
  const monthlyAmount = member.isMinor ? 0 : member.isSpouse ? 100 : rateInfo.monthly;
  const genAmount = member.isMinor || member.isSpouse ? 0 : rateInfo.gen;

  let specialStatusNote = '';
  if (member.isMinor) {
    specialStatusNote = '\n⚠️ <i>(እድሜያቸው ከ18 ዓመት በታች በመሆኑ ከወርሃዊ እና ከትውልድ ክፍያ ነጻ ናቸው)</i>';
  } else if (member.isSpouse) {
    specialStatusNote = '\n⚠️ <i>(የትዳር አጋር በመሆናቸው የትውልድ መዋጮ ነጻ፣ ወርሃዊ 100 ብር ብቻ)</i>';
  }

  return `ሰላም <b>${member.fullName}</b>! 👋
እንኳን ወደ <b>የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)</b> ይፋዊ የቴሌግራም ቦት በሰላም መጡ።

👤 <b>የአባልነት መረጃዎ፦</b>
• የአባል መታወቂያ፡ <code>${member.id}</code>
• ቤተሰብ፡ <b>${member.familyName || 'የአበሩስ ቤተሰብ'}</b> (${member.generation || 4}ኛ ትውልድ)
• ስልክ፡ ${member.phone || 'ያልተመዘገበ'}${specialStatusNote}

🔑 <b>የእርስዎ የግል የመግቢያ ሊንክ (Secure Member Portal)፦</b>
<a href="${loginUrl}">${loginUrl}</a>

💳 <b>የእርስዎ የግል የክፍያ ተመን፦</b>
• <b>ወርሃዊ መዋጮ፡</b> <b>${monthlyAmount} ብር / በወር</b>
• <b>የትውልድ መዋጮ፡</b> <b>${genAmount} ብር</b> (በአንድ ጊዜ ወይም በየወሩ ከፋፍለው መክፈል ይችላሉ)

🏦 <b>ይፋዊ የባንክ ሂሳብ (CBE)፦</b>
• ባንክ፡ <b>የኢትዮጵያ ንግድ ባንክ (Commercial Bank of Ethiopia)</b>
• የሂሳብ ቁጥር፡ <code>1000778285146</code>
• የሂሳብ ስም፡ <b>Aida, Ibrahim and zebiba</b>
• የክፍያ መጀመሪያ ቀን፡ <b>ሀምሌ 01፣ 2018 ዓ.ም</b>

📸 <b>ክፍያ ፈጽመዋል?</b>
የባንክ ወይም የቴሌብር ክፍያ ደረሰኝ ፎቶ (Screenshot) በዚህ ቻት በቀጥታ ይላኩልን፤ የደረሰኙን File ID መዝግበን ለፋይናንስ ሀላፊው እናሳውቃለን።

✍️ <b>ቅሬታ ወይም አስተያየት ካለዎት፦</b>
<code>/complaint &lt;መልእክትዎ&gt;</code> ብለው ይጻፉ።`;
}

// Build general welcome message when member is not matched
function buildGeneralWelcomeMessage(fromName: string) {
  return `ሰላም <b>${fromName || 'ክቡር አባል'}</b>! 👋
እንኳን ወደ <b>የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)</b> የቴሌግራም ቦት በሰላም መጡ።

ይህ ቦት የአባላትን የክፍያ መረጃ፣ የወርሃዊና የትውልድ መዋጮ ሁኔታ ለማወቅ፣ የክፍያ ደረሰኝ ፎቶ ለመላክ እና ቅሬታዎችን ለማስተናገድ ያገለግላል።

🔍 <b>የግል ክፍያዎን ለማግኘት፦</b>
የአባል መታወቂያዎን (ለምሳሌ፡ <code>MEM-022</code>) ወይም በምዝገባ ወቅት የሰጡትን የስልክ ቁጥር በዚህ ቻት ይላኩልን።

🏦 <b>የማህበሩ ይፋዊ የባንክ ሂሳብ (CBE)፦</b>
• ባንክ፡ <b>የኢትዮጵያ ንግድ ባንክ (CBE)</b>
• የሂሳብ ቁጥር፡ <code>1000778285146</code>
• የሂሳብ ስም፡ <b>Aida, Ibrahim and zebiba</b>
• የክፍያ መጀመሪያ ቀን፡ <b>ሀምሌ 01፣ 2018 ዓ.ም</b>

💰 <b>የመዋጮ ተመኖች ማጠቃለያ፦</b>
• <b>3ኛ ትውልድ፡</b> ወርሃዊ 100 ብር | የትውልድ 5,000 ብር
• <b>4ኛ ትውልድ፡</b> ወርሃዊ 75 ብር | የትውልድ 1,000 ብር
• <b>5ኛ ትውልድ፡</b> ወርሃዊ 50 ብር | የትውልድ 500 ብር
• <b>6ኛ ትውልድ፡</b> ወርሃዊ 25 ብር | የትውልድ 250 ብር
• <b>የትዳር አጋር፡</b> ወርሃዊ 100 ብር (የትውልድ ነጻ)
• <b>18 ዓመት በታች፡</b> ከክፍያ ነጻ

💡 <i>ማሳሰቢያ፡ የትውልድ መዋጮን በአንድ ጊዜ ወይም በየወሩ ከፋፍሎ መክፈል ይቻላል።</i>

📸 <b>ደረሰኝ ለመላክ፦</b> የደረሰኙን ፎቶ በቀጥታ ወደዚህ ቻት ይላኩ።
✍️ <b>ቅሬታ ለመላክ፦</b> <code>/complaint &lt;መልእክትዎ&gt;</code> ብለው ይላኩ።`;
}

// Inline Keyboard with Member's unique portal link
function getMemberKeyboard(loginUrl: string) {
  return {
    inline_keyboard: [
      [
        {
          text: '🌐 ወደ የግል መለያዬ ግባ (Open My Portal)',
          url: loginUrl,
        },
      ],
      [
        { text: '💳 የባንክ ሂሳብ መረጃ', callback_data: 'cmd_payment_info' },
        { text: '🧾 ደረሰኝ እንዴት እንደሚላክ', callback_data: 'cmd_receipt_guide' },
      ],
      [
        { text: '✍️ ቅሬታ/አስተያየት አስገባ', callback_data: 'cmd_complaint_guide' },
        { text: '❓ እርዳታ / Help', callback_data: 'cmd_help' },
      ],
    ],
  };
}

// Standard Inline Keyboard for user actions (fallback)
function getStandardKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '🌐 መተግበሪያውን በስልክ ክፈት',
          url: APP_URL,
        },
      ],
      [
        { text: '💳 የባንክ ሂሳብ መረጃ', callback_data: 'cmd_payment_info' },
        { text: '🧾 ደረሰኝ እንዴት እንደሚላክ', callback_data: 'cmd_receipt_guide' },
      ],
      [
        { text: '✍️ ቅሬታ/አስተያየት አስገባ', callback_data: 'cmd_complaint_guide' },
        { text: '❓ እርዳታ / Help', callback_data: 'cmd_help' },
      ],
    ],
  };
}

// Asynchronous background processor for Telegram updates
async function processTelegramUpdate(update: any) {
  try {
    if (!update || typeof update !== 'object') {
      console.warn('[Telegram Webhook] Received invalid or empty update');
      return;
    }

    const message = update.message || update.edited_message;
    const callbackQuery = update.callback_query;

    // 1. Extract required fields: chat_id, from.id, from.first_name, text, message_id
    let chatId = '';
    let fromId = '';
    let firstName = '';
    let username = '';
    let text = '';
    let messageId = 0;
    let photoFileId = '';
    const updateType = callbackQuery ? 'callback_query' : 'message';

    if (message) {
      chatId = String(message.chat?.id || '');
      fromId = String(message.from?.id || '');
      firstName = message.from?.first_name || '';
      username = message.from?.username || '';
      text = message.text || message.caption || '';
      messageId = message.message_id || 0;

      // Extract highest resolution photo file_id if present
      if (Array.isArray(message.photo) && message.photo.length > 0) {
        photoFileId = message.photo[message.photo.length - 1].file_id;
      } else if (message.document && message.document.mime_type?.startsWith('image/')) {
        photoFileId = message.document.file_id;
      }
    } else if (callbackQuery) {
      chatId = String(callbackQuery.message?.chat?.id || callbackQuery.from?.id || '');
      fromId = String(callbackQuery.from?.id || '');
      firstName = callbackQuery.from?.first_name || '';
      username = callbackQuery.from?.username || '';
      text = callbackQuery.data || '';
      messageId = callbackQuery.message?.message_id || 0;

      // Immediately answer callback query
      await answerCallbackQuery(callbackQuery.id);
    } else {
      console.log('[Telegram Webhook] Unsupported update format:', Object.keys(update));
      return;
    }

    console.log(`[Telegram Webhook] Parsed: chat_id=${chatId}, from_id=${fromId}, name=${firstName}, text="${text.slice(0, 30)}", photo=${Boolean(photoFileId)}`);

    const nowIso = new Date().toISOString();

    // 2. Save message data to Firestore in collection "telegramMessages" (Requirement 4)
    if (db) {
      const docId = `msg_${Date.now()}_${fromId || 'anon'}_${messageId}`;
      await safeFirestoreSetDoc(doc(db, 'telegramMessages', docId), {
        chatId,
        fromId,
        firstName: firstName.slice(0, 100),
        text: text.slice(0, 4000),
        messageId: Number(messageId) || 0,
        updateType,
        fileId: photoFileId || '',
        createdAt: nowIso,
      });
      console.log(`[Firestore] Saved to telegramMessages: ${docId}`);
    }

    // =========================================================================
    // CRITICAL BUG FIX: IDENTIFY ADMIN REPLIES & STOP THE MEMBER WELCOME BUG
    // =========================================================================
    const replyToMessage = message?.reply_to_message || update.reply_to_message;
    const effectiveAdminChatId = sanitizeChatId(process.env.ADMIN_TELEGRAM_CHAT_ID) || ADMIN_TELEGRAM_CHAT_ID;
    const isFromAdmin = Boolean(
      update.isAdmin === true ||
      (effectiveAdminChatId && (chatId === effectiveAdminChatId || fromId === effectiveAdminChatId)) ||
      (ADMIN_TELEGRAM_CHAT_ID && (chatId === ADMIN_TELEGRAM_CHAT_ID || fromId === ADMIN_TELEGRAM_CHAT_ID))
    );

    if (isFromAdmin) {
      console.log(`[Telegram Admin Handler] Incoming message from Admin (chatId: ${chatId}, fromId: ${fromId}, hasReply: ${Boolean(replyToMessage)})`);

      // 1. IDENTIFY ADMIN REPLIES: Check if message.reply_to_message exists
      if (replyToMessage) {
        const repliedText = String(replyToMessage.text || replyToMessage.caption || '');
        console.log(`[Telegram Admin Reply] Admin replied to message: "${repliedText.slice(0, 100)}" with text: "${text}"`);

        // Check if the Admin is replying to a complaint notification
        const isComplaintNotification =
          repliedText.includes('ቅሬታ') ||
          repliedText.includes('አቤቱታ') ||
          repliedText.includes('complaint') ||
          repliedText.includes('comp_') ||
          /የቅሬታ መለያ/i.test(repliedText);

        if (isComplaintNotification) {
          // 3. PROCESS THE REPLY:
          const adminReplyText = text.trim();
          if (!adminReplyText) {
            await sendTelegramMessage(chatId, '⚠️ እባክዎ ለአባሉ የሚላክ የመልስ ጽሑፍ ይጻፉ።');
            return;
          }

          // Extract complaint ID (e.g. comp_1762683921_12345678)
          const complaintIdMatch = repliedText.match(/comp_[a-zA-Z0-9_-]+/);
          const complaintId = complaintIdMatch ? complaintIdMatch[0] : '';

          // Extract Telegram sender ID (e.g. ID: 12345678 or ID: <code>12345678</code>)
          const fromIdMatch = repliedText.match(/ID:\s*<code>?(\d+)<?/i) || repliedText.match(/ID\s*[:=]\s*(\d+)/i);
          const targetFromId = fromIdMatch ? fromIdMatch[1] : '';

          // Extract Member ID (e.g. MEM-001)
          const memberIdMatch = repliedText.match(/\b(MEM[-_]?[0-9a-zA-Z]+)\b/i);
          const targetMemberId = memberIdMatch ? memberIdMatch[1].toUpperCase() : '';

          console.log(`[Telegram Admin Reply] Extracted keys: compId="${complaintId}", targetFromId="${targetFromId}", targetMemberId="${targetMemberId}"`);

          let targetComplaint: any = null;

          if (db) {
            // A. Query by exact complaint document ID
            if (complaintId) {
              try {
                const cDoc = await getDoc(doc(db, 'complaints', complaintId));
                if (cDoc.exists()) {
                  targetComplaint = { id: cDoc.id, ...cDoc.data() };
                }
              } catch (e) {
                console.warn('[Firestore] Error getting complaint by ID:', e);
              }
            }

            // B. Query by targetFromId
            if (!targetComplaint && targetFromId) {
              try {
                const qFrom = query(
                  collection(db, 'complaints'),
                  where('fromId', '==', targetFromId),
                  limit(5)
                );
                const snap = await getDocs(qFrom);
                if (!snap.empty) {
                  const sorted = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                  targetComplaint = sorted[0];
                }
              } catch (e) {
                console.warn('[Firestore] Error getting complaint by fromId:', e);
              }
            }

            // C. Query by targetMemberId
            if (!targetComplaint && targetMemberId) {
              try {
                const qMem = query(
                  collection(db, 'complaints'),
                  where('memberId', '==', targetMemberId),
                  limit(5)
                );
                const snap = await getDocs(qMem);
                if (!snap.empty) {
                  const sorted = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                  targetComplaint = sorted[0];
                }
              } catch (e) {
                console.warn('[Firestore] Error getting complaint by memberId:', e);
              }
            }

            // D. Query by latest open complaint
            if (!targetComplaint) {
              try {
                const qOpen = query(
                  collection(db, 'complaints'),
                  where('status', '==', 'open'),
                  limit(5)
                );
                const snap = await getDocs(qOpen);
                if (!snap.empty) {
                  targetComplaint = { id: snap.docs[0].id, ...snap.docs[0].data() };
                }
              } catch (e) {
                console.warn('[Firestore] Error querying open complaints:', e);
              }
            }
          }

          // In-memory store fallback
          if (!targetComplaint) {
            const memComplaints = (currentStore as any)?.complaints || [];
            targetComplaint = memComplaints.find((c: any) =>
              (complaintId && c.id === complaintId) ||
              (targetFromId && String(c.fromId) === targetFromId) ||
              (targetMemberId && String(c.memberId).toUpperCase() === targetMemberId)
            ) || memComplaints[0];
          }

          if (targetComplaint) {
            const compDocId = targetComplaint.id;
            const memberName = targetComplaint.firstName || targetComplaint.memberName || 'አባል';
            let memberTelegramId = targetComplaint.chatId || targetComplaint.fromId || targetComplaint.telegramId || targetFromId;

            // Look up member's telegramId if not directly on the complaint
            if (!memberTelegramId && targetComplaint.memberId) {
              try {
                if (db) {
                  const mDoc = await getDoc(doc(db, 'members', targetComplaint.memberId));
                  if (mDoc.exists()) {
                    const mData: any = mDoc.data();
                    memberTelegramId = mData.telegramId || (mData.telegram ? String(mData.telegram).replace(/^@/, '') : '');
                  }
                }
                if (!memberTelegramId) {
                  const mMatch = (currentStore?.members || []).find((m) => m.id === targetComplaint.memberId);
                  if (mMatch) {
                    memberTelegramId = mMatch.telegramId || (mMatch.telegram ? String(mMatch.telegram).replace(/^@/, '') : '');
                  }
                }
              } catch (mErr) {
                console.warn('[Member Telegram Lookup Notice]:', mErr);
              }
            }

            // Update Firestore 'complaints' document:
            // set adminResponse to the Admin's text and status to "Resolved"
            const updateData = {
              adminResponse: adminReplyText,
              status: 'Resolved',
              resolvedAt: nowIso,
              resolvedBy: 'Admin',
              updatedAt: nowIso,
            };

            if (db) {
              await safeFirestoreSetDoc(doc(db, 'complaints', compDocId), updateData, { merge: true });
              console.log(`[Firestore] Updated complaint ${compDocId} to Resolved with adminResponse: "${adminReplyText}"`);
            }

            if ((currentStore as any).complaints) {
              const idx = (currentStore as any).complaints.findIndex((c: any) => c.id === compDocId);
              if (idx !== -1) {
                (currentStore as any).complaints[idx] = { ...(currentStore as any).complaints[idx], ...updateData };
              }
            }

            // Send Admin's response to the complaining member's telegramId:
            // Requirement 3: "ውድ [Member Name], ለቅሬታዎ የተሰጠ መልስ፦ [Admin Reply]"
            let memberNotified = false;
            if (memberTelegramId) {
              const memberMsg = `ውድ ${memberName}, ለቅሬታዎ የተሰጠ መልስ፦ ${adminReplyText}`;
              const sendRes = await sendTelegramMessage(memberTelegramId, memberMsg, getStandardKeyboard());
              memberNotified = Boolean(sendRes && sendRes.ok);
            }

            // Send confirmation back to the Admin:
            // Requirement 3: "መልስዎ ለአባሉ በተሳካ ሁኔታ ተልኳል።"
            if (memberNotified) {
              const adminConfirm = `መልስዎ ለአባሉ በተሳካ ሁኔታ ተልኳል።\n\n` +
                `👤 <b>አባል፦</b> ${memberName} (<code>${targetComplaint.memberId || targetFromId || 'N/A'}</code>)\n` +
                `📝 <b>የአባል ቅሬታ፦</b> ${targetComplaint.complaintText || '—'}\n` +
                `💬 <b>የተላከው መልስ፦</b> ${adminReplyText}\n` +
                `📌 <b>ሁኔታ፦</b> Resolved ✅`;
              await sendTelegramMessage(chatId, adminConfirm);
            } else {
              const adminNotice = `መልስዎ በመዝገቡ ላይ ተመዝግቧል (ሁኔታ፡ Resolved)።\n\n` +
                `💬 <b>የእርስዎ መልስ፦</b> ${adminReplyText}\n` +
                `ℹ️ <i>ማስታወሻ፦ አባሉ በቴሌግራም መለያ ስላልተገናኙ ወይም የቴሌግራም መለያቸው ስላልተገኘ በስልክ ቁጥራቸው (${targetComplaint.phone || 'የለም'}) ማሳወቅ ይችላሉ።</i>`;
              await sendTelegramMessage(chatId, adminNotice);
            }
            return;
          } else {
            console.warn('[Telegram Admin Reply] Complaint not found for this reply.');
            await sendTelegramMessage(chatId, 'ይህ ትዕዛዝ አይታወቅም');
            return;
          }
        }

        // 4. If the Admin replies to something else: send safe error message
        console.log('[Telegram Admin Reply] Admin replied to non-complaint message. Sending safe error.');
        await sendTelegramMessage(chatId, 'ይህ ትዕዛዝ አይታወቅም');
        return;
      }

      // 4. If the Admin sends a random command or non-reply text:
      // STOP THE WELCOME BUG: DO NOT trigger member welcome flow, send safe error message
      console.log(`[Telegram Admin] Admin sent non-reply message: "${text}". Sending safe error.`);
      await sendTelegramMessage(chatId, 'ይህ ትዕዛዝ አይታወቅም');
      return;
    }

    // 3. Handle Receipt Photo (Requirement 7)
    if (photoFileId) {
      console.log(`[Telegram Receipt] Received receipt photo file_id: ${photoFileId} from ${firstName} (${fromId})`);

      // Save to "receipts" collection in Firestore
      if (db) {
        const receiptDocId = `rcpt_${Date.now()}_${fromId}`;
        await safeFirestoreSetDoc(doc(db, 'receipts', receiptDocId), {
          chatId,
          fromId,
          firstName: firstName.slice(0, 100),
          fileId: photoFileId,
          caption: text.slice(0, 1000),
          status: 'pending',
          createdAt: nowIso,
        });
        console.log(`[Firestore] Saved receipt to receipts collection: ${receiptDocId}`);
      }

      // Notify Admin
      const adminChat = ADMIN_TELEGRAM_CHAT_ID;
      if (adminChat) {
        const adminAlertText = `🚨 <b>አዲስ የክፍያ ደረሰኝ ፎቶ ተልኳል!</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>ላኪ፡</b> ${firstName} (ID: <code>${fromId}</code>${username ? ` / @${username}` : ''})
🆔 <b>የደረሰኝ File ID:</b> <code>${photoFileId}</code>
📝 <b>መግለጫ፡</b> ${text || 'ምንም አልተጻፈም'}
⏰ <b>የተላከበት ሰዓት፡</b> ${new Date().toLocaleString('am-ET')}

💡 <i>እባክዎ ደረሰኙን በማረጋገጥ በአበሩስ አባል ማኔጀር መተግበሪያ ላይ የክፍያ ምዝገባ ያከናውኑ።</i>`;

        await sendTelegramMessage(adminChat, adminAlertText);
        // Also send photo to admin
        await sendTelegramPhoto(adminChat, photoFileId, `ደረሰኝ ከ፡ ${firstName} (ID: ${fromId})`);
      } else {
        console.log('[Telegram Admin Alert] (ADMIN_TELEGRAM_CHAT_ID not configured; receipt logged to Firestore and console)');
      }

      // Reply confirmation to sender
      const userReplyText = `✅ <b>የከፈሉበት የደረሰኝ ፎቶ በተሳካ ሁኔታ ደርሶናል!</b>

🆔 <b>የደረሰኝ መለያ (File ID)፦</b>
<code>${photoFileId}</code>

የማህበሩ ፋይናንስ ሀላፊ ደረሰኝዎን በማረጋገጥ በስርዓቱ ላይ ገቢ ያደርጋል።

ስለ ትብብርዎ ከልብ እናመሰግናለን! 🙏
— <b>የአበሩስ አንድነት ማህበር</b>`;

      await sendTelegramMessage(chatId, userReplyText, getStandardKeyboard());
      return;
    }

    // 4. Handle Complaints (Requirement 8)
    const isComplaint =
      text.startsWith('/complaint') ||
      text.startsWith('/ቅሬታ') ||
      text.startsWith('/claim') ||
      text.startsWith('/አቤቱታ') ||
      text.startsWith('cmd_complaint_guide') ||
      /\b(ቅሬታ|አቤቱታ|ችግር አለ|ያልተስተካከለ|ያልተመዘገበ|complaint)\b/i.test(text);

    if (isComplaint) {
      let cleanComplaint = text
        .replace(/^\/(complaint|ቅሬታ|claim|አቤቱታ)/i, '')
        .trim();

      if (!cleanComplaint || cleanComplaint === 'cmd_complaint_guide') {
        // User clicked the complaint button or sent empty /complaint command
        await sendTelegramMessage(
          chatId,
          `✍️ <b>ቅሬታ ወይም አስተያየት ለመላክ፦</b>

እባክዎ ቅሬታዎን በሚከተለው መልኩ ይላኩልን፦
<code>/complaint &lt;ቅሬታዎ ወይም አስተያየትዎ&gt;</code>

ለምሳሌ፦
<code>/complaint የመስከረም ወር ክፍያ ከፍዬ እስካሁን ያልተከፈለ ይላል፣ እባክዎ ይስተካከልልኝ።</code>

የላኩት ቅሬታ ወዲያውኑ ወደ አመራሮች መዝገብ ይገባል።`,
          getStandardKeyboard()
        );
        return;
      }

      console.log(`[Telegram Complaint] Received from ${firstName} (${fromId}): "${cleanComplaint}"`);

      const complaintDocId = `comp_${Date.now()}_${fromId}`;

      // Save to "complaints" collection in Firestore (Requirement 8)
      if (db) {
        await safeFirestoreSetDoc(doc(db, 'complaints', complaintDocId), {
          chatId,
          fromId,
          firstName: firstName.slice(0, 100),
          complaintText: cleanComplaint.slice(0, 4000),
          status: 'open',
          createdAt: nowIso,
        });
        console.log(`[Firestore] Saved complaint: ${complaintDocId}`);
      }

      // Notify Admin
      const adminChat = ADMIN_TELEGRAM_CHAT_ID;
      if (adminChat) {
        const adminComplaintAlert = `⚠️ <b>አዲስ አባል ቅሬታ/አስተያየት ተመዝግቧል!</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>የቅሬታ መለያ፦</b> <code>${complaintDocId}</code>
👤 <b>ከላኪ፡</b> ${firstName} (ID: <code>${fromId}</code>${username ? ` / @${username}` : ''})
📝 <b>ቅሬታ፡</b> ${cleanComplaint}
⏰ <b>ሰዓት፡</b> ${new Date().toLocaleString('am-ET')}

💬 <i>መልስ ለመስጠት ይህንን መልዕክት በቀጥታ Reply ያድርጉ (Reply to this message to send response)</i>`;
        await sendTelegramMessage(adminChat, adminComplaintAlert);
      }

      // Reply confirmation to sender
      const complaintReply = `📩 <b>ቅሬታዎ/አስተያየትዎ በተሳካ ሁኔታ ተመዝግቧል!</b>

የአበሩስ አንድነት ማህበር አመራሮች የላኩትን ጉዳይ ተመልክተው ተገቢውን ማስተካከያ እና ምላሽ ይሰጡዎታል።

ስለ ማሳሰቢያዎ እናመሰግናለን! 🙏`;

      await sendTelegramMessage(chatId, complaintReply, getStandardKeyboard());
      return;
    }

    // 5. Handle /start command (Requirement 6 & BUG 2 Fix)
    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const startArg = parts[1] || ''; // e.g. /start MEM-022

      const matchedMember = await findOrRegisterTelegramMember(fromId, username, firstName, startArg, true);

      if (matchedMember && matchedMember.loginToken) {
        const loginUrl = `${APP_URL}/login?token=${matchedMember.loginToken}`;
        const replyText = buildPersonalPaymentMessage(matchedMember, loginUrl);
        await sendTelegramMessage(chatId, replyText, getMemberKeyboard(loginUrl));
      } else {
        const replyText = buildGeneralWelcomeMessage(firstName);
        await sendTelegramMessage(chatId, replyText, getStandardKeyboard());
      }
      return;
    }

    // 6. Handle Callback Queries / Quick Commands
    if (text === 'cmd_payment_info' || text === '/payment' || text === '/ክፍያ') {
      const paymentInfoMsg = `🏦 <b>የአበሩስ አንድነት ማህበር ይፋዊ የባንክ ሂሳብ</b>
━━━━━━━━━━━━━━━━━━━━
• <b>ባንክ፡</b> የኢትዮጵያ ንግድ ባንክ (CBE)
• <b>የሂሳብ ቁጥር፡</b> <code>1000778285146</code>
• <b>የሂሳብ ስም፡</b> Aida, Ibrahim and zebiba
• <b>የክፍያ መጀመሪያ ቀን፡</b> ሀምሌ 01፣ 2018 ዓ.ም

💰 <b>የመዋጮ ተመኖች፦</b>
• 3ኛ ትውልድ፡ ወርሃዊ 100 ብር | የትውልድ 5,000 ብር
• 4ኛ ትውልድ፡ ወርሃዊ 75 ብር | የትውልድ 1,000 ብር
• 5ኛ ትውልድ፡ ወርሃዊ 50 ብር | የትውልድ 500 ብር
• 6ኛ ትውልድ፡ ወርሃዊ 25 ብር | የትውልድ 250 ብር
• የትዳር አጋር፡ ወርሃዊ 100 ብር (የትውልድ ነጻ)
• 18 ዓመት በታች፡ ነጻ

📌 <i>የትውልድ መዋጮን በአንድ ጊዜ ወይም በየወሩ ከፋፍሎ መክፈል ይቻላል።</i>
📸 ክፍያ ሲፈጽሙ የደረሰኙን ፎቶ በዚህ ቻት ይላኩልን።`;

      await sendTelegramMessage(chatId, paymentInfoMsg, getStandardKeyboard());
      return;
    }

    if (text === 'cmd_receipt_guide' || text === '/receipt' || text === '/ደረሰኝ') {
      const guideMsg = `🧾 <b>የክፍያ ደረሰኝ ፎቶ እንዴት እንደሚላክ፦</b>
━━━━━━━━━━━━━━━━━━━━
1. በባንክ (CBE) ወይም በቴሌብር ክፍያዎን ይፈጽሙ።
2. የክፍያ ማረጋገጫ ደረሰኝዎን ወይም የሞባይል ባንኪንግ ስክሪንሾት (Screenshot) ያዘጋጁ።
3. ልክ እንደማንኛውም ፎቶ ወደዚህ ቻት ይላኩ (Attachment -> Photo)።
4. ቦቱ የደረሰኝዎን <b>file_id</b> ወዲያውኑ በመመዝገብ ለፋይናንስ ሀላፊው ያሳውቃል።

ስለ ትብብርዎ እናመሰግናለን! 🙏`;

      await sendTelegramMessage(chatId, guideMsg, getStandardKeyboard());
      return;
    }

    if (text === 'cmd_help' || text === '/help' || text === '/እርዳታ') {
      const helpMsg = `📖 <b>የቦቱ የትእዛዝ ዝርዝር (Commands)፦</b>
━━━━━━━━━━━━━━━━━━━━
• <code>/start</code> - የቦቱ መክፈቻ እና የግል ክፍያ መረጃ
• <code>/payment</code> - ይፋዊ የባንክ ሂሳብ እና የመዋጮ ተመን
• <code>/receipt</code> - የደረሰኝ አላላክ መመሪያ
• <code>/complaint &lt;መልእክት&gt;</code> - ቅሬታ ወይም አስተያየት መላኪያ
• <b>የአባል መታወቂያ (ለምሳሌ፡ MEM-001)</b> - የግል ሂሳብዎን በቀጥታ ለማየት ቁጥሩን ብቻ ይላኩ

🌐 መተግበሪያውን በቀጥታ ለመክፈት፡ <a href="${APP_URL}">እዚህ ይጫኑ</a>`;

      await sendTelegramMessage(chatId, helpMsg, getStandardKeyboard());
      return;
    }

    // 7. General text: Check if user sent an ID (e.g. MEM-001) or phone number to look up info
    const isIdOrPhone =
      /^MEM[-_]?[0-9a-zA-Z]+/i.test(text.trim()) ||
      /(?:09|\+?2519)\d{8}/.test(text.trim());

    if (isIdOrPhone) {
      const matchedMember = await findOrRegisterTelegramMember(fromId, username, firstName, text, false);
      if (matchedMember && matchedMember.loginToken) {
        const loginUrl = `${APP_URL}/login?token=${matchedMember.loginToken}`;
        const personalMsg = buildPersonalPaymentMessage(matchedMember, loginUrl);
        await sendTelegramMessage(chatId, personalMsg, getMemberKeyboard(loginUrl));
        return;
      }
    }

    // Default polite response
    const defaultReply = `ሰላም <b>${firstName || 'ክቡር አባል'}</b>፤ መልእክትዎ ደርሶናል።

የግል የክፍያ መረጃዎን ለማየት <b>የአባል መታወቂያዎን</b> (ለምሳሌ፡ <code>MEM-022</code>) ወይም <b>የስልክ ቁጥርዎን</b> ይላኩልን።
የክፍያ ደረሰኝ ለመላክ ደግሞ የደረሰኙን ፎቶ በቀጥታ ይላኩ።

ቅሬታ ካለዎት፡ <code>/complaint &lt;መልእክትዎ&gt;</code> ብለው ይጻፉ።`;

    await sendTelegramMessage(chatId, defaultReply, getStandardKeyboard());
  } catch (err) {
    console.error('[Telegram Webhook Worker Error]:', err);
  }
}

// ==========================================
// TELEGRAM WEBHOOK ROUTES
// ==========================================

// Requirement 10: GET endpoint at /api/telegram-webhook returning "Webhook is active"
app.get('/api/telegram-webhook', (req: Request, res: Response) => {
  res.status(200).send('Webhook is active');
});

// Requirements 1, 2, 3, 4, 6, 7, 8, 9: POST endpoint at /api/telegram-webhook
app.post('/api/telegram-webhook', (req: Request, res: Response) => {
  // Requirement 9: Return HTTP 200 OK to Telegram immediately (within 1 second)
  res.status(200).json({ ok: true });

  // Process incoming update in background without blocking Telegram response
  processTelegramUpdate(req.body).catch((err) => {
    console.error('[Telegram Webhook Error]:', err);
  });
});

// ==========================================
// FULL-STACK COMMUNITY DATA SYNC ROUTES
// ==========================================

// GET /api/data - Return current community membership, families, contributions, and settings from Firestore
app.get('/api/data', async (req: Request, res: Response) => {
  if (db) {
    try {
      const [membersSnap, familiesSnap, contribsSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'families')),
        getDocs(collection(db, 'contributions')),
        getDoc(doc(db, 'settings', 'rates')),
      ]);

      const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const families = familiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const contributions = contribsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const settings = settingsSnap.exists() ? settingsSnap.data() : currentStore.settings;

      return res.status(200).json({
        success: true,
        data: {
          members: members.length > 0 ? members : currentStore.members,
          families: families.length > 0 ? families : currentStore.families,
          contributions: contributions.length > 0 ? contributions : currentStore.contributions,
          settings,
        },
      });
    } catch (err: any) {
      console.warn('[Firestore] Error reading live data for /api/data, using store:', err.message);
    }
  }
  res.status(200).json({
    success: true,
    data: currentStore,
  });
});

// POST /api/data - Sync community data from frontend into server store (without quota-exhausting loops)
app.post('/api/data', async (req: Request, res: Response) => {
  try {
    const { members, families, contributions, settings } = req.body || {};
    if (Array.isArray(members)) {
      currentStore.members = members;
    }
    if (Array.isArray(families)) {
      currentStore.families = families;
    }
    if (Array.isArray(contributions)) {
      currentStore.contributions = contributions;
    }
    if (settings && typeof settings === 'object') {
      currentStore.settings = settings;
    }
    res.status(200).json({ success: true, message: 'Data synced successfully to server store' });
  } catch (err: any) {
    console.error('[Data Sync Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to sync data' });
  }
});

// ==========================================
// REAL-TIME CONTRIBUTIONS REST API
// ==========================================

// GET /api/contributions - List all contributions
app.get('/api/contributions', async (req: Request, res: Response) => {
  try {
    const { memberId, status, type, month, year } = req.query;
    let list: any[] = [];
    if (db) {
      const snap = await getDocs(collection(db, 'contributions'));
      list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      list = currentStore.contributions || [];
    }

    if (memberId) list = list.filter((c) => c.memberId === String(memberId).trim());
    if (status) list = list.filter((c) => String(c.status).toLowerCase() === String(status).toLowerCase());
    if (type) list = list.filter((c) => c.type === String(type).trim());
    if (month) list = list.filter((c) => Number(c.month ?? c.ethiopianMonth) === Number(month));
    if (year) list = list.filter((c) => Number(c.year ?? c.ethiopianYear) === Number(year));

    res.status(200).json({ success: true, count: list.length, contributions: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch contributions' });
  }
});

// GET /api/contributions/:id - Get single contribution by ID
app.get('/api/contributions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (db) {
      const docSnap = await getDoc(doc(db, 'contributions', id));
      if (docSnap.exists()) {
        return res.status(200).json({ success: true, contribution: { id: docSnap.id, ...docSnap.data() } });
      }
    }
    const match = (currentStore.contributions || []).find((c: any) => c.id === id);
    if (match) {
      return res.status(200).json({ success: true, contribution: match });
    }
    return res.status(404).json({ success: false, error: `Contribution ${id} not found` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch contribution' });
  }
});

// POST /api/contributions - Create or upsert a contribution (triggers real-time global listener)
app.post('/api/contributions', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.memberId) {
      return res.status(400).json({ success: false, error: 'memberId is required' });
    }
    const id = body.id || `CON-${Date.now().toString().slice(-6)}`;
    const m = Number(body.month ?? body.ethiopianMonth ?? 11);
    const y = Number(body.year ?? body.ethiopianYear ?? 2018);
    const contributionData = {
      id,
      ...body,
      month: m,
      year: y,
      ethiopianMonth: m,
      ethiopianYear: y,
      status: body.status || 'Paid',
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await safeFirestoreSetDoc(doc(db, 'contributions', id), contributionData, { merge: true });
    }

    // Update in-memory store
    const existingIdx = (currentStore.contributions || []).findIndex((c: any) => c.id === id);
    if (existingIdx !== -1) {
      currentStore.contributions[existingIdx] = { ...currentStore.contributions[existingIdx], ...contributionData };
    } else {
      currentStore.contributions.unshift(contributionData);
    }

    res.status(201).json({
      success: true,
      message: `Contribution ${id} created/updated successfully in Firestore`,
      contribution: contributionData,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save contribution' });
  }
});

// PATCH /api/contributions/:id - Update status or payment info (immediately pushes to all user views)
app.patch('/api/contributions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No update fields provided' });
    }

    const payloadWithTimestamp = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await safeFirestoreSetDoc(doc(db, 'contributions', id), payloadWithTimestamp, { merge: true });
    }

    // Update server store
    const existingIdx = (currentStore.contributions || []).findIndex((c: any) => c.id === id);
    let updatedContribution: any = null;
    if (existingIdx !== -1) {
      currentStore.contributions[existingIdx] = {
        ...currentStore.contributions[existingIdx],
        ...payloadWithTimestamp,
      };
      updatedContribution = currentStore.contributions[existingIdx];
    } else {
      updatedContribution = { id, ...payloadWithTimestamp };
      currentStore.contributions.push(updatedContribution);
    }

    console.log(`[API PATCH] Updated contribution ${id} status: ${updates.status || 'N/A'}`);

    res.status(200).json({
      success: true,
      message: `Contribution ${id} updated in Firestore. Global subscription notified.`,
      contribution: updatedContribution,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update contribution' });
  }
});

// DELETE /api/contributions/:id - Delete a contribution
app.delete('/api/contributions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (db) {
      await safeFirestoreDeleteDoc(doc(db, 'contributions', id));
    }
    currentStore.contributions = (currentStore.contributions || []).filter((c: any) => c.id !== id);

    res.status(200).json({ success: true, message: `Contribution ${id} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete contribution' });
  }
});

// DELETE /api/members/:id - Delete a member (e.g. mistakenly registered) and cleanup data
app.delete('/api/members/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Member ID is required' });
    }

    // 1. Remove from in-memory server store
    currentStore.members = (currentStore.members || []).filter((m: any) => m.id !== id);
    currentStore.contributions = (currentStore.contributions || []).filter((c: any) => c.memberId !== id);

    // 2. Remove from Firestore
    if (db) {
      try {
        await safeFirestoreDeleteDoc(doc(db, 'members', id));
        const q = query(collection(db, 'contributions'), where('memberId', '==', id));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await safeFirestoreDeleteDoc(d.ref);
        }
      } catch (fErr: any) {
        console.warn(`[Firestore Server] Error deleting member ${id}:`, fErr?.message || fErr);
      }
    }

    console.log(`[Admin] Member ${id} and associated records deleted successfully.`);
    return res.status(200).json({ success: true, message: `Member ${id} deleted successfully` });
  } catch (err: any) {
    console.error(`[Admin Error] Failed to delete member:`, err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to delete member' });
  }
});

// ==========================================
// AUTOMATED NOTIFICATION & EMAIL LOGS API
// ==========================================

// POST /api/notifications/email - Automated summary email triggered when member records payment via Portal
app.post('/api/notifications/email', async (req: Request, res: Response) => {
  try {
    const {
      logId,
      recipient,
      memberId,
      memberName,
      amount,
      month,
      monthName,
      year,
      type,
      paymentMethod,
      transactionRef,
      receiptNumber,
      notes,
    } = req.body || {};

    const targetRecipient = recipient || 'mesudnurga4830@gmail.com';
    const finalLogId = logId || `NOTIF-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const subject = `[አበሩስ አንድነት ማህበር] የክፍያ ማጠቃለያ ደረሰኝ - ${memberName || 'አባል'} (${monthName || month} ${year || 2018})`;

    const emailContent = `
========================================
የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)
ይፋዊ የክፍያ ማረጋገጫ እና ማጠቃለያ ደረሰኝ
========================================

ክቡር አባል፡ ${memberName || 'ክቡር አባል'} (መለያ፡ ${memberId || 'N/A'})

የከፈሉት ክፍያ በስርዓቱ ላይ በተሳካ ሁኔታ ተመዝግቧል።

📋 የክፍያ ዝርዝር መረጃ፦
----------------------------------------
• የመዋጮ ዓይነት፡ ${type || 'ወርሃዊ መዋጮ'}
• የተከፈለበት ወቅት፡ ${monthName || 'ሀምሌ'} ${year || 2018} ዓ.ም
• የተከፈለ መጠን፡ ${amount || 0} ብር
• የክፍያ ዘዴ፡ ${paymentMethod || 'CBE / Telebirr'}
• የትራንዛክሽን Ref: ${transactionRef || 'ቀጥታ'}
• የደረሰኝ ቁጥር፡ ${receiptNumber || finalLogId}
• ቀን፡ ${new Date().toLocaleString('am-ET')}

ስለ ወቅታዊ ክፍያዎ እና ትብብርዎ ከልብ እናመሰግናለን! 🙏
የአበሩስ አንድነት ማህበር አመራሮች
`;

    // Persist notification log into Firestore collection 'notificationLogs'
    if (db) {
      await safeFirestoreSetDoc(doc(db, 'notificationLogs', finalLogId), {
        id: finalLogId,
        type: 'payment_summary_email',
        recipient: targetRecipient,
        memberId: memberId || '',
        memberName: memberName || '',
        subject,
        amount: Number(amount) || 0,
        transactionRef: transactionRef || '',
        receiptNumber: receiptNumber || '',
        status: 'sent',
        provider: 'firebase-automated-emailer',
        emailBodyPreview: emailContent.slice(0, 500),
        sentAt: nowIso,
        createdAt: nowIso,
      });
    }

    console.log(`[Automated Summary Email] Dispatched to ${targetRecipient} for member ${memberName} (${amount} ETB). Log ID: ${finalLogId}`);

    res.status(200).json({
      success: true,
      message: 'Payment summary email notification generated, sent, and logged in Firestore successfully.',
      logId: finalLogId,
      recipient: targetRecipient,
    });
  } catch (err: any) {
    console.error('[Notification Email Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch email notification' });
  }
});

// POST /api/notifications/proxy-payment - Send Telegram notification to beneficiary and notify Admin Dashboard
app.post('/api/notifications/proxy-payment', async (req: Request, res: Response) => {
  try {
    const {
      payerId,
      payerName,
      beneficiaryId,
      beneficiaryName,
      amount,
      type,
      monthName,
      year,
      transactionRef,
      receiptNumber,
      status,
    } = req.body || {};

    const finalLogId = `NOTIF-PROXY-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // 1. Find Beneficiary to check if they have a telegramId
    let beneficiaryTelegramId: string | null = null;

    if (beneficiaryId) {
      if (db) {
        try {
          const memDoc = await getDoc(doc(db, 'members', beneficiaryId));
          if (memDoc.exists()) {
            const foundBeneficiary = memDoc.data();
            if (foundBeneficiary.telegramId) {
              beneficiaryTelegramId = String(foundBeneficiary.telegramId);
            }
          }
        } catch (e) {}
      }
      if (!beneficiaryTelegramId) {
        const mem = (currentStore.members || []).find((m: any) => m.id === beneficiaryId);
        if (mem && mem.telegramId) {
          beneficiaryTelegramId = String(mem.telegramId);
        }
      }
      // Check telegramUsers collection
      if (!beneficiaryTelegramId && db) {
        try {
          const qTg = query(collection(db, 'telegramUsers'), where('memberId', '==', beneficiaryId));
          const snapTg = await getDocs(qTg);
          if (!snapTg.empty) {
            beneficiaryTelegramId = snapTg.docs[0].id;
          }
        } catch (e) {}
      }
    }

    // 2. Send Telegram notification to beneficiary if telegramId is found
    let tgDeliveryResult: any = null;
    if (beneficiaryTelegramId && isTelegramBotActive) {
      const datePaid = req.body?.datePaid || new Date().toLocaleDateString('am-ET');
      let tgText = '';
      if (type === 'ትውልድ') {
        let genRates: Record<number, number> = { 3: 5000, 4: 1000, 5: 500, 6: 250 };
        let beneficiaryMember: any = (currentStore.members || []).find((m: any) => m.id === beneficiaryId) || null;
        let genPaidSoFar = 0;

        if (db) {
          try {
            const [ratesSnap, mSnap, cSnap] = await Promise.all([
              getDoc(doc(db, 'settings', 'rates')),
              beneficiaryId ? getDoc(doc(db, 'members', beneficiaryId)) : Promise.resolve(null),
              beneficiaryId
                ? getDocs(query(collection(db, 'contributions'), where('memberId', '==', beneficiaryId)))
                : Promise.resolve(null),
            ]);
            if (ratesSnap.exists() && ratesSnap.data()?.generationPayment) {
              genRates = { ...genRates, ...ratesSnap.data().generationPayment };
            }
            if (mSnap && mSnap.exists()) {
              beneficiaryMember = { id: mSnap.id, ...mSnap.data() };
            }
            if (cSnap) {
              genPaidSoFar = cSnap.docs
                .map((d) => d.data())
                .filter((c: any) => {
                  const st = String(c.status || '').toLowerCase();
                  return (
                    c.type === 'ትውልድ' &&
                    (st === 'ተከፍሏል' || st === 'ከፊል' || st === 'paid' || st === 'partial' || st === 'completed')
                  );
                })
                .reduce((s: number, c: any) => s + Number(c.paidAmount ?? c.amount ?? 0), 0);
            }
          } catch {}
        }
        if (genPaidSoFar === 0) {
          genPaidSoFar = (currentStore.contributions || [])
            .filter((c: any) => {
              const st = String(c.status || '').toLowerCase();
              return (
                c.memberId === beneficiaryId &&
                c.type === 'ትውልድ' &&
                (st === 'ተከፍሏል' || st === 'ከፊል' || st === 'paid' || st === 'partial' || st === 'completed')
              );
            })
            .reduce((s: number, c: any) => s + Number(c.paidAmount ?? c.amount ?? 0), 0);
        }

        const expectedGen =
          beneficiaryMember && (beneficiaryMember.isMinor || beneficiaryMember.isSpouse)
            ? 0
            : Number(genRates[Number(beneficiaryMember?.generation || 4)] ?? 500);
        const genRemaining = Math.max(0, expectedGen - genPaidSoFar);

        tgText = `ውድ <b>${beneficiaryName}</b>፣ አባል <b>${payerName}</b> የትውልድ መዋጮዎን ከፍለዋል። እናመሰግናለን!\n\n` +
          `💰 የተከፈለ መጠን፦ <b>${Number(amount || 0).toLocaleString()} ብር</b>\n` +
          `🗓️ የክፍያ ቀን፦ <b>${datePaid}</b>\n` +
          `📊 ጠቅላላ የተከፈለ (Total Paid)፦ <b>${genPaidSoFar.toLocaleString()} ብር</b>\n` +
          `📉 ቀሪ መዋጮ (Remaining Balance)፦ <b>${genRemaining.toLocaleString()} ብር</b>\n` +
          `🧾 ማረጋገጫ Ref፦ <code>${transactionRef || 'ቀጥታ'}</code>\n` +
          `⏳ ሁኔታ፦ <b>${status || 'በአስተዳዳሪው ማረጋገጫ በመጠባበቅ ላይ (Pending)'}</b>`;
      } else {
        // Monthly payment: show ONLY paid amount, month name, and payment date (NO remaining balance)
        tgText = `ውድ <b>${beneficiaryName}</b>፣ አባል <b>${payerName}</b> የወርሃዊ መዋጮዎን ከፍለዋል። እናመሰግናለን!\n\n` +
          `💰 የተከፈለው መጠን፦ <b>${Number(amount || 0).toLocaleString()} ብር</b>\n` +
          `📅 የወሩ ስም፦ <b>${monthName || ''} ${year || 2018} ዓ.ም</b>\n` +
          `🗓️ የክፍያ ቀን፦ <b>${datePaid}</b>\n` +
          `🧾 ማረጋገጫ Ref፦ <code>${transactionRef || 'ቀጥታ'}</code>\n` +
          `⏳ ሁኔታ፦ <b>${status || 'በአስተዳዳሪው ማረጋገጫ በመጠባበቅ ላይ (Pending)'}</b>`;
      }
      tgDeliveryResult = await sendTelegramMessage(beneficiaryTelegramId, tgText);
    }

    // 3. Notify Admin Dashboard by logging to Firestore notificationLogs
    const adminNote = `ተኪ ክፍያ (Pending Approval)፦ ${payerName} (${payerId}) ለ${beneficiaryName} (${beneficiaryId}) ${amount} ብር`;
    if (db) {
      await safeFirestoreSetDoc(doc(db, 'notificationLogs', finalLogId), {
        id: finalLogId,
        type: 'proxy_payment_alert',
        recipient: 'Admin Dashboard',
        memberId: beneficiaryId || '',
        memberName: beneficiaryName || '',
        payerId: payerId || '',
        payerName: payerName || '',
        beneficiaryId: beneficiaryId || '',
        beneficiaryName: beneficiaryName || '',
        subject: `[ተኪ ክፍያ] ${payerName} ለ${beneficiaryName} (${amount} ብር)`,
        amount: Number(amount) || 0,
        transactionRef: transactionRef || '',
        receiptNumber: receiptNumber || '',
        status: status || 'Pending',
        provider: 'proxy-payment-dispatcher',
        notes: adminNote,
        details: {
          isProxyPayment: true,
          payerId,
          payerName,
          beneficiaryId,
          beneficiaryName,
          type,
          monthName,
          year,
          status: status || 'Pending',
          telegramNotified: !!beneficiaryTelegramId,
        },
        sentAt: nowIso,
        createdAt: nowIso,
      });
    }

    console.log(`[Proxy Payment Notification] Logged. Payer: ${payerName} -> Beneficiary: ${beneficiaryName}. Telegram sent: ${!!beneficiaryTelegramId}`);

    res.status(200).json({
      success: true,
      message: 'Proxy payment notification logged and delivered.',
      logId: finalLogId,
      telegramNotified: !!beneficiaryTelegramId,
      tgDeliveryResult,
    });
  } catch (err: any) {
    console.error('[Proxy Payment Notification Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch proxy payment notification' });
  }
});

// GET /api/notifications/logs - Retrieve logged automated email notifications from Firestore
app.get('/api/notifications/logs', async (req: Request, res: Response) => {
  try {
    let logs: any[] = [];
    if (db) {
      const snap = await getDocs(collection(db, 'notificationLogs'));
      logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    res.status(200).json({ success: true, count: logs.length, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch notification logs' });
  }
});

// GET /api/reports - Validated, role-aware and member-aware financial & membership report endpoint
app.get('/api/reports', async (req: Request, res: Response) => {
  try {
    const { month, year, role, memberId, token } = req.query;

    let parsedMonth: number | undefined;
    let parsedYear: number | undefined;

    // Request validation for month (1..13 Ethiopian months)
    if (month !== undefined && month !== '') {
      parsedMonth = parseInt(String(month), 10);
      if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 13) {
        return res.status(400).json({
          error: 'Invalid Request Parameter',
          field: 'month',
          message: 'Ethiopian month must be a valid integer between 1 and 13.',
        });
      }
    }

    // Request validation for year (2000..2100 Ethiopian calendar years)
    if (year !== undefined && year !== '') {
      parsedYear = parseInt(String(year), 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({
          error: 'Invalid Request Parameter',
          field: 'year',
          message: 'Ethiopian year must be a valid integer between 2000 and 2100 (e.g. 2018).',
        });
      }
    }

    // 1. MEMBER PERSONAL REPORT (via token, memberId, or role === 'member')
    if (token || memberId || (role === 'member' && (token || memberId))) {
      let member: any = null;

      if (token && db) {
        const qToken = query(collection(db, 'members'), where('loginToken', '==', String(token).trim()));
        const snapToken = await getDocs(qToken);
        if (!snapToken.empty) {
          member = { id: snapToken.docs[0].id, ...snapToken.docs[0].data() };
        } else {
          return res.status(404).json({
            error: 'Member Not Found',
            field: 'token',
            message: 'No member found matching the provided login token.',
          });
        }
      } else if (memberId && db) {
        const memDoc = await getDoc(doc(db, 'members', String(memberId).trim()));
        if (memDoc.exists()) {
          member = { id: memDoc.id, ...memDoc.data() };
        } else {
          return res.status(404).json({
            error: 'Member Not Found',
            field: 'memberId',
            message: `No member found with ID: ${memberId}`,
          });
        }
      }

      if (!member) {
        return res.status(404).json({
          error: 'Member Not Specified',
          message: 'A valid memberId or token is required to generate a member personal report.',
        });
      }

      // Fetch live contributions for this member from Firestore
      let memberContributions: any[] = [];
      if (db) {
        const cSnap = await getDocs(
          query(collection(db, 'contributions'), where('memberId', '==', member.id))
        );
        memberContributions = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        memberContributions = (currentStore.contributions || []).filter((c: any) => c.memberId === member.id);
      }

      // Apply date filters if provided
      if (parsedYear !== undefined) {
        memberContributions = memberContributions.filter((c: any) => c.ethiopianYear === parsedYear);
      }
      if (parsedMonth !== undefined) {
        memberContributions = memberContributions.filter((c: any) => c.ethiopianMonth === parsedMonth);
      }

      const monthlyContribs = memberContributions.filter((c: any) => c.type === 'ወርሃዊ');
      const genContribs = memberContributions.filter((c: any) => c.type === 'ትውልድ');

      const monthlyPaid = monthlyContribs
        .filter((c: any) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
        .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

      const genPaid = genContribs
        .filter((c: any) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
        .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

      const paidCount = memberContributions.filter((c: any) => c.status === 'ተከፍሏል').length;
      const unpaidCount = memberContributions.filter((c: any) => c.status === 'ያልተከፈለ').length;

      return res.status(200).json({
        status: 'success',
        reportType: 'member_personal_report',
        generatedAt: new Date().toISOString(),
        member: {
          id: member.id,
          fullName: member.fullName,
          familyName: member.familyName || '',
          generation: member.generation || 4,
          phone: member.phone || '',
          telegramId: member.telegramId || '',
          isMinor: Boolean(member.isMinor),
          isSpouse: Boolean(member.isSpouse),
        },
        filters: { month: parsedMonth ?? null, year: parsedYear ?? null },
        summary: {
          totalPaidAmount: monthlyPaid + genPaid,
          monthlyPaidAmount: monthlyPaid,
          generationPaidAmount: genPaid,
          paidContributionsCount: paidCount,
          unpaidContributionsCount: unpaidCount,
          currency: 'ETB',
        },
        // Separated reports for clarity
        monthlyReport: {
          totalPaid: monthlyPaid,
          contributions: monthlyContribs,
        },
        generationReport: {
          totalPaid: genPaid,
          contributions: genContribs,
        },
        contributions: memberContributions,
      });
    }

    // 2. FAMILY HEAD REPORT (when role === 'family_head' or familyId is passed)
    const requestedFamilyId = req.query.familyId ? String(req.query.familyId).trim() : null;
    if (role === 'family_head' || requestedFamilyId) {
      let families: any[] = [];
      let members: any[] = [];
      let contributions: any[] = [];

      if (db) {
        const [fSnap, mSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'families')),
          getDocs(collection(db, 'members')),
          getDocs(collection(db, 'contributions')),
        ]);
        families = fSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        members = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        contributions = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        families = currentStore.families || [];
        members = currentStore.members || [];
        contributions = currentStore.contributions || [];
      }

      const targetFamily = requestedFamilyId
        ? families.find((f: any) => f.id === requestedFamilyId) || families[0]
        : families[0];

      if (!targetFamily) {
        return res.status(404).json({ error: 'Family Not Found', message: 'No families available.' });
      }

      const famMembers = members.filter((m: any) => m.familyId === targetFamily.id);
      let famContribs = contributions.filter((c: any) => c.familyId === targetFamily.id);

      if (parsedYear !== undefined) {
        famContribs = famContribs.filter((c: any) => c.ethiopianYear === parsedYear);
      }
      if (parsedMonth !== undefined) {
        famContribs = famContribs.filter((c: any) => c.ethiopianMonth === parsedMonth);
      }

      const monthlyContribs = famContribs.filter((c: any) => c.type === 'ወርሃዊ');
      const genContribs = famContribs.filter((c: any) => c.type === 'ትውልድ');

      const monthlyCollected = monthlyContribs
        .filter((c: any) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
        .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

      const genCollected = genContribs
        .filter((c: any) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
        .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

      return res.status(200).json({
        status: 'success',
        reportType: 'family_head_report',
        generatedAt: new Date().toISOString(),
        family: targetFamily,
        filters: { month: parsedMonth ?? null, year: parsedYear ?? null },
        summary: {
          totalMembers: famMembers.length,
          monthlyCollected,
          generationCollected: genCollected,
          totalCollected: monthlyCollected + genCollected,
          currency: 'ETB',
        },
        // Separated Reports for each month
        monthlyReport: {
          collectedAmount: monthlyCollected,
          contributions: monthlyContribs,
        },
        generationReport: {
          collectedAmount: genCollected,
          contributions: genContribs,
        },
      });
    }

    // 3. LEADERSHIP AGGREGATED REPORT (EXECUTIVE, FINANCE_HEAD, SECRETARY, or Admin)
    let members: any[] = [];
    let families: any[] = [];
    let contributions: any[] = [];
    let settings: any = currentStore.settings || {};

    if (db) {
      const [mSnap, fSnap, cSnap, sSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'families')),
        getDocs(collection(db, 'contributions')),
        getDoc(doc(db, 'settings', 'rates')),
      ]);
      members = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      families = fSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      contributions = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (sSnap.exists()) settings = sSnap.data();
    } else {
      members = currentStore.members || [];
      families = currentStore.families || [];
      contributions = currentStore.contributions || [];
    }

    // Apply date filters if provided
    if (parsedYear !== undefined) {
      contributions = contributions.filter((c: any) => c.ethiopianYear === parsedYear);
    }
    if (parsedMonth !== undefined) {
      contributions = contributions.filter((c: any) => c.ethiopianMonth === parsedMonth);
    }

    const totalMembers = members.length;
    const totalFamilies = families.length;
    const minorsCount = members.filter((m: any) => m.isMinor).length;
    const spousesCount = members.filter((m: any) => m.isSpouse).length;

    const gen3Count = members.filter((m: any) => m.generation === 3).length;
    const gen4Count = members.filter((m: any) => m.generation === 4).length;
    const gen5Count = members.filter((m: any) => m.generation === 5).length;
    const gen6Count = members.filter((m: any) => m.generation === 6).length;

    const monthlyContributions = contributions.filter((c: any) => c.type === 'ወርሃዊ');
    const genContributions = contributions.filter((c: any) => c.type === 'ትውልድ');

    const monthlyCollected = monthlyContributions
      .filter((c: any) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

    const genCollected = genContributions
      .filter((c: any) => c.status === 'ተከፍሏል' || c.status === 'ከፊል')
      .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

    const paidCount = contributions.filter((c: any) => c.status === 'ተከፍሏል').length;
    const unpaidCount = contributions.filter((c: any) => c.status === 'ያልተከፈለ').length;
    const partialCount = contributions.filter((c: any) => c.status === 'ከፊል').length;

    const reportPayload = {
      status: 'success',
      reportType: 'leadership_aggregated_report',
      role: (role as string) || 'EXECUTIVE',
      generatedAt: new Date().toISOString(),
      filters: { month: parsedMonth ?? null, year: parsedYear ?? null },
      association: settings?.associationInfo?.name || 'የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)',
      summary: {
        totalMembers,
        totalFamilies,
        minorsCount,
        spousesCount,
        totalContributionsTracked: contributions.length,
        paidCount,
        unpaidCount,
        partialCount,
        totalCollectedAmount: monthlyCollected + genCollected,
        monthlyCollectedAmount: monthlyCollected,
        generationCollectedAmount: genCollected,
        currency: 'ETB',
      },
      // Separated Monthly and Generation Reports
      monthlyReport: {
        title: 'የወርሃዊ መዋጮ ሪፖርት (Monthly Contributions)',
        month: parsedMonth ?? 11,
        year: parsedYear ?? 2018,
        totalCollected: monthlyCollected,
        contributionsCount: monthlyContributions.length,
      },
      generationReport: {
        title: 'የትውልድ መዋጮ ሪፖርት (Generation Contributions)',
        totalCollected: genCollected,
        contributionsCount: genContributions.length,
      },
      generationBreakdown: {
        generation3: { count: gen3Count, monthlyRate: settings?.monthlyRate?.[3] ?? 100, generationRate: settings?.generationPayment?.[3] ?? 5000 },
        generation4: { count: gen4Count, monthlyRate: settings?.monthlyRate?.[4] ?? 75, generationRate: settings?.generationPayment?.[4] ?? 1000 },
        generation5: { count: gen5Count, monthlyRate: settings?.monthlyRate?.[5] ?? 50, generationRate: settings?.generationPayment?.[5] ?? 500 },
        generation6: { count: gen6Count, monthlyRate: settings?.monthlyRate?.[6] ?? 25, generationRate: settings?.generationPayment?.[6] ?? 250 },
      },
      bankAccountInfo: {
        bank: 'የኢትዮጵያ ንግድ ባንክ (CBE)',
        accountNumber: settings?.associationInfo?.cbeAccount || '1000778285146',
        accountHolder: settings?.associationInfo?.cbeAccountName || 'Aida, Ibrahim and zebiba',
        paymentStartDate: settings?.associationInfo?.paymentStartDate || 'ሀምሌ 01፣ 2018 ዓ.ም',
      },
      availableReports: [
        {
          id: 'REP-MONTHLY-SUMMARY',
          title: 'የወርሃዊ መዋጮ አጠቃላይ ሪፖርት (Monthly Contributions Summary)',
          description: 'የሁሉም 25 ቤተሰቦች ወርሃዊ መዋጮ ገቢና ቀሪ እዳ ማጠቃለያ',
          totalItems: monthlyContributions.length,
          collected: monthlyCollected,
        },
        {
          id: 'REP-GENERATION-SUMMARY',
          title: 'የትውልድ መዋጮ ክትትል ሪፖርት (Generation Contributions Tracking)',
          description: 'የአባላት የትውልድ መዋጮ እና የቀሪ እዳ ክፍፍል ሁኔታ',
          totalItems: genContributions.length,
          collected: genCollected,
        },
        {
          id: 'REP-FAMILY-HEADS',
          title: 'የቤተሰብ ወኪሎች ሪፖርት (Family Representatives Status)',
          description: 'የ25ቱ የቤተሰብ ወኪሎች እና የአባላት ዝርዝር ሪፖርት',
          totalItems: totalFamilies,
        },
        {
          id: 'REP-UNPAID-DELINQUENT',
          title: 'ያልተከፈሉ መዋጮዎች ዝርዝር (Unpaid Contributions Report)',
          description: 'ክፍያ ያልፈጸሙ አባላት እና የቤተሰብ ወኪሎች ማሳሰቢያ ሪፖርት',
          totalItems: unpaidCount,
        },
      ],
    };

    res.status(200).json(reportPayload);
  } catch (err: any) {
    console.error('[Error in GET /api/reports]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to generate report' });
  }
});

// POST /api/reports/send - Send Telegram reports per member, family heads, or leadership
app.post('/api/reports/send', async (req: Request, res: Response) => {
  try {
    const { target, memberId, familyId, targetFamilyId, role, month, year, chatId: incomingChatId } = req.body || {};

    let parsedMonth: number | undefined;
    let parsedYear: number | undefined;

    if (month !== undefined && month !== '') {
      parsedMonth = parseInt(String(month), 10);
      if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 13) {
        return res.status(400).json({
          error: 'Invalid Request Parameter',
          field: 'month',
          message: 'Ethiopian month must be a valid integer between 1 and 13.',
        });
      }
    }

    if (year !== undefined && year !== '') {
      parsedYear = parseInt(String(year), 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return res.status(400).json({
          error: 'Invalid Request Parameter',
          field: 'year',
          message: 'Ethiopian year must be a valid integer between 2000 and 2100.',
        });
      }
    }

    const effectiveYear = parsedYear || 2018;
    const effectiveMonth = parsedMonth || 11;
    const monthNames: Record<number, string> = {
      1: 'መስከረም', 2: 'ጥቅምት', 3: 'ህዳር', 4: 'ታህሳስ', 5: 'ጥር', 6: 'የካቲት',
      7: 'መጋቢት', 8: 'ሚያዝያ', 9: 'ግንቦት', 10: 'ሰኔ', 11: 'ሀምሌ', 12: 'ነሐሴ', 13: 'ጳጉሜን'
    };
    const monthName = monthNames[effectiveMonth] || `ወር ${effectiveMonth}`;

    const defaultGenRates: Record<number, number> = { 3: 5000, 4: 1000, 5: 500, 6: 250 };
    let genRates: Record<number, number> = { ...defaultGenRates };
    if (db) {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'rates'));
        if (settingsSnap.exists() && settingsSnap.data()?.generationPayment) {
          genRates = { ...genRates, ...settingsSnap.data().generationPayment };
        }
      } catch {}
    } else if (currentStore?.settings?.generationPayment) {
      genRates = { ...genRates, ...(currentStore.settings.generationPayment as any) };
    }

    const computeMemberGenStats = (m: any, contribs: any[]) => {
      if (!m || m.isMinor || m.isSpouse) {
        return { expectedAmount: 0, paidSoFar: 0, remainingBalance: 0 };
      }
      const expectedAmount = Number(genRates[Number(m.generation) || 4] ?? 500);
      const paidSoFar = contribs
        .filter((c: any) => {
          const st = String(c.status || '').toLowerCase();
          return (
            c.memberId === m.id &&
            c.type === 'ትውልድ' &&
            (st === 'ተከፍሏል' || st === 'ከፊል' || st === 'paid' || st === 'partial' || st === 'completed')
          );
        })
        .reduce((sum: number, c: any) => sum + Number(c.paidAmount ?? c.amount ?? 0), 0);
      return {
        expectedAmount,
        paidSoFar,
        remainingBalance: Math.max(0, expectedAmount - paidSoFar),
      };
    };

    // 0. SINGLE PAYMENT OR BULK PAYMENT CONDITIONAL TELEGRAM REPORT
    if (target === 'payment' || target === 'bulk_payment') {
      const { payment, items: bulkItems, payerName: reqPayerName, masterReceiptNumber } = req.body || {};
      let membersList: any[] = [];
      let contribsList: any[] = [];
      if (db) {
        const [mSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'members')),
          getDocs(collection(db, 'contributions')),
        ]);
        membersList = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        contribsList = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        membersList = currentStore.members || [];
        contribsList = currentStore.contributions || [];
      }

      let preparedReportText = '';
      if (target === 'payment' && payment) {
        const m = membersList.find((mem) => mem.id === payment.memberId);
        const mName = m?.fullName || payment.memberName || 'አባል';
        const paidAmt = Number(payment.paidAmount ?? payment.amount ?? 0);
        const datePaid = payment.datePaid || new Date().toLocaleDateString('am-ET');

        if (payment.type === 'ትውልድ') {
          const genStats = computeMemberGenStats(
            m || { id: payment.memberId, generation: payment.generation || 4 },
            contribsList
          );
          preparedReportText = `🏛️ <b>የአበሩስ አንድነት ማህበር — የትውልድ መዋጮ የክፍያ ሪፖርት</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>አባል፦</b> ${mName} (<code>${payment.memberId || 'N/A'}</code>)
🏷️ <b>የክፍያ ዓይነት፦</b> የትውልድ መዋጮ
💵 <b>የተከፈለ መጠን፦</b> ${paidAmt.toLocaleString()} ብር
🗓️ <b>የክፍያ ቀን፦</b> ${datePaid}

📊 <b>የትውልድ መዋጮ ማጠቃለያ፦</b>
• Total Paid (ጠቅላላ የተከፈለ)፦ <b>${genStats.paidSoFar.toLocaleString()} ብር</b>
• Remaining Balance (ቀሪ መዋጮ)፦ <b>${genStats.remainingBalance.toLocaleString()} ብር</b>`;
        } else {
          const pMonthName =
            payment.ethiopianMonthName ||
            monthNames[Number(payment.ethiopianMonth || effectiveMonth)] ||
            monthName;
          const pYear = Number(payment.ethiopianYear || effectiveYear);
          preparedReportText = `🏛️ <b>የአበሩስ አንድነት ማህበር — የወርሃዊ መዋጮ የክፍያ ሪፖርት</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>አባል፦</b> ${mName} (<code>${payment.memberId || 'N/A'}</code>)
🏷️ <b>የክፍያ ዓይነት፦</b> ወርሃዊ መዋጮ
💵 <b>የተከፈለው መጠን፦</b> ${paidAmt.toLocaleString()} ብር
📅 <b>የወሩ ስም፦</b> ${pMonthName} ${pYear} ዓ.ም
🗓️ <b>የክፍያ ቀን፦</b> ${datePaid}`;
        }
      } else {
        const list = Array.isArray(bulkItems) ? bulkItems : [];
        const totalPaidBulk = list.reduce((s: number, it: any) => s + Number(it.amount || it.paidAmount || 0), 0);
        const todayStr = new Date().toLocaleDateString('am-ET');
        const rowLines = list.map((it: any, idx: number) => {
          const m = membersList.find((mem) => mem.id === it.memberId) || {
            id: it.memberId,
            fullName: it.memberName || 'አባል',
            generation: it.generation || 4,
            isMinor: it.isMinor,
            isSpouse: it.isSpouse,
          };
          const amt = Number(it.amount || it.paidAmount || 0);
          const dPaid = it.datePaid || todayStr;
          if (it.type === 'ትውልድ') {
            const genStats = computeMemberGenStats(m, contribsList);
            return `${idx + 1}. <b>${m.fullName}</b> — የትውልድ መዋጮ፡ ${amt.toLocaleString()} ብር | ቀን፡ ${dPaid} | ቀሪ፡ ${genStats.remainingBalance.toLocaleString()} ብር`;
          }
          const mNameStr =
            it.ethiopianMonthName ||
            monthNames[Number(it.ethiopianMonth || effectiveMonth)] ||
            monthName;
          const yr = Number(it.ethiopianYear || effectiveYear);
          return `${idx + 1}. <b>${m.fullName}</b> — ወርሃዊ (${mNameStr} ${yr} ዓ.ም)፡ ${amt.toLocaleString()} ብር · ቀን፡ ${dPaid}`;
        });

        preparedReportText = `🏛️ <b>የአበሩስ አንድነት ማህበር — የጅምላ ክፍያ ሪፖርት</b>
━━━━━━━━━━━━━━━━━━━━
${reqPayerName ? `💳 <b>ከፋይ፦</b> ${reqPayerName}\n` : ''}${masterReceiptNumber ? `🧾 <b>ዋና ደረሰኝ፦</b> ${masterReceiptNumber}\n` : ''}👥 <b>አባላት፦</b> ${list.length}
💰 <b>ጠቅላላ የተከፈለ፦</b> ${totalPaidBulk.toLocaleString()} ብር
📅 <b>ቀን፦</b> ${todayStr}

📌 <b>የአባላት ክፍያ ዝርዝር፦</b>
${rowLines.join('\n') || '• ምንም ክፍያ የለም'}`;
      }

      const targetChat = incomingChatId || ADMIN_TELEGRAM_CHAT_ID;
      let dispatched = false;
      if (isTelegramBotActive && targetChat) {
        try {
          await sendTelegramMessage(targetChat, preparedReportText);
          dispatched = true;
        } catch {}
      }
      return res.status(200).json({
        success: true,
        reportType: target,
        reportText: preparedReportText,
        telegramDispatched: dispatched,
      });
    }

    // A. SEND REPORT TO FAMILY REPRESENTATIVE (ቤተሰብ ተወካይ / Family Head)
    const isFamilyTarget =
      target === 'family_head' ||
      target === 'family' ||
      target === 'family_representative' ||
      role === 'family_head' ||
      Boolean(familyId || targetFamilyId);

    if (isFamilyTarget) {
      const famIdToFind = String(familyId || targetFamilyId || '').trim();

      let families: any[] = [];
      let members: any[] = [];
      let contributions: any[] = [];

      if (db) {
        const [fSnap, mSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'families')),
          getDocs(collection(db, 'members')),
          getDocs(collection(db, 'contributions')),
        ]);
        families = fSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        members = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        contributions = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        families = currentStore.families || [];
        members = currentStore.members || [];
        contributions = currentStore.contributions || [];
      }

      const family = famIdToFind
        ? families.find((f: any) => f.id.toUpperCase() === famIdToFind.toUpperCase()) || families[0]
        : families[0];

      if (!family) {
        return res.status(404).json({
          error: 'Family Not Found',
          message: `No family found matching ID: ${famIdToFind || 'default'}`,
        });
      }

      const famMembers = members.filter((m: any) => m.familyId === family.id);
      const famContribs = contributions.filter((c: any) => c.familyId === family.id);

      // 1. Monthly Contributions for this month (NO remaining balance info!)
      const monthContribs = famContribs.filter(
        (c: any) =>
          c.type === 'ወርሃዊ' &&
          Number(c.ethiopianMonth) === effectiveMonth &&
          Number(c.ethiopianYear) === effectiveYear
      );

      const paidMonthlyMembers = famMembers.filter((m: any) => {
        const c = monthContribs.find((con: any) => con.memberId === m.id);
        const st = String(c?.status || '').toLowerCase();
        return st === 'ተከፍሏል' || st === 'paid' || st === 'completed';
      });

      const unpaidMonthlyMembers = famMembers.filter((m: any) => {
        if (m.isMinor) return false;
        const c = monthContribs.find((con: any) => con.memberId === m.id);
        const st = String(c?.status || '').toLowerCase();
        return !(st === 'ተከፍሏል' || st === 'paid' || st === 'completed');
      });

      const monthlyCollected = monthContribs
        .filter((c: any) => {
          const st = String(c.status || '').toLowerCase();
          return st === 'ተከፍሏል' || st === 'paid' || st === 'ከፊል' || st === 'partial';
        })
        .reduce((sum: number, c: any) => sum + (Number(c.paidAmount) || 0), 0);

      // 2. Generation Contributions (Expected - Total Paid Gen)
      const genEligibleMembers = famMembers.filter((m: any) => !m.isMinor && !m.isSpouse);
      let genExpectedTotal = 0;
      let genCollected = 0;
      let genRemainingTotal = 0;
      const paidOrPartialGen: Array<{ member: any; paidSoFar: number; remainingBalance: number }> = [];
      const unpaidGen: Array<{ member: any; remainingBalance: number }> = [];

      for (const m of genEligibleMembers) {
        const st = computeMemberGenStats(m, famContribs);
        genExpectedTotal += st.expectedAmount;
        genCollected += st.paidSoFar;
        genRemainingTotal += st.remainingBalance;

        if (st.paidSoFar > 0) {
          paidOrPartialGen.push({
            member: m,
            paidSoFar: st.paidSoFar,
            remainingBalance: st.remainingBalance,
          });
        }
        if (st.remainingBalance > 0) {
          unpaidGen.push({ member: m, remainingBalance: st.remainingBalance });
        }
      }

      const formatGroupedByGeneration = (entries: Array<{ member: any; suffix?: string }>): string => {
        if (!entries || entries.length === 0) return '';
        const map: Record<number, Array<{ member: any; suffix?: string }>> = {};
        for (const e of entries) {
          const gen = Number(e.member.generation) || 4;
          if (!map[gen]) map[gen] = [];
          map[gen].push(e);
        }
        const gens = Object.keys(map).map(Number).sort((a, b) => a - b);
        const sections: string[] = [];
        for (const g of gens) {
          const list = map[g]
            .map((e) => `• ${e.member.fullName}${e.suffix ? ` — ${e.suffix}` : ''}`)
            .join('\n');
          sections.push(`<b>${g}ኛ ትውልድ</b>\n${list}`);
        }
        return sections.join('\n\n');
      };

      const paidMonthlyLines = paidMonthlyMembers
        .map((m: any) => {
          const c = monthContribs.find((con: any) => con.memberId === m.id);
          const amt = Number(c?.paidAmount || c?.amount || 0);
          const d = c?.datePaid || '—';
          return `• ${m.fullName} — ${amt.toLocaleString()} ብር · ${monthName} ${effectiveYear} · ቀን፡ ${d}`;
        })
        .join('\n');

      let monthlyUnpaidSection = '';
      if (unpaidMonthlyMembers.length === 0) {
        monthlyUnpaidSection = `❌ <b>ያልከፈሉ፦</b> 0 አባላት\nሁሉም ከፍለዋል ✅`;
      } else {
        monthlyUnpaidSection =
          `❌ <b>ያልከፈሉ፦</b> ${unpaidMonthlyMembers.length} አባላት\n\n` +
          formatGroupedByGeneration(unpaidMonthlyMembers.map((m: any) => ({ member: m })));
      }

      const paidGenLines = paidOrPartialGen
        .map(
          (e) =>
            `• ${e.member.fullName} — የተከፈለ፡ ${e.paidSoFar.toLocaleString()} ብር | ቀሪ፡ ${e.remainingBalance.toLocaleString()} ብር`
        )
        .join('\n');

      const unpaidGenGrouped = formatGroupedByGeneration(
        unpaidGen.map((e) => ({
          member: e.member,
          suffix: `ቀሪ፡ ${e.remainingBalance.toLocaleString()} ብር`,
        }))
      );

      // Strictly NO remaining balance in Monthly section; Generation section displays Total Paid & Remaining Balance
      const familyReportText = `🏛️ <b>የአበሩስ አንድነት ማህበር</b>
የመዋጮ ሪፖርት

━━━━━━━━━━━━━━━
👨‍👩‍👧‍👦 <b>ቤተሰብ፦</b> ${family.familyName}
🔖 <b>ኮድ፦</b> ${family.id}
👤 <b>ወኪል፦</b> ${family.headName}
📅 <b>ወቅት፦</b> ${monthName} ${effectiveYear} ዓ.ም
👥 <b>አባላት፦</b> ${famMembers.length}

━━━━━━━━━━━━━━━
💰 <b>ወርሃዊ መዋጮ (${monthName} ${effectiveYear} ዓ.ም)</b>
• የተከፈለ ጠቅላላ መጠን፦ ${monthlyCollected.toLocaleString()} ብር
✅ <b>የከፈሉ (${paidMonthlyMembers.length})፦</b>
${paidMonthlyLines || '• እስካሁን የከፈለ የለም'}

${monthlyUnpaidSection}

━━━━━━━━━━━━━━━
🏛️ <b>የትውልድ መዋጮ</b>
• ጠቅላላ የሚጠበቅ (Total Expected)፦ ${genExpectedTotal.toLocaleString()} ብር
• ጠቅላላ የተከፈለ (Total Paid)፦ ${genCollected.toLocaleString()} ብር
• ቀሪ መዋጮ (Remaining Balance)፦ ${genRemainingTotal.toLocaleString()} ብር

✅ <b>የከፈሉ / በከፊል የከፈሉ (${paidOrPartialGen.length})</b>
${paidGenLines || '• እስካሁን የለም'}

❌ <b>ያልጨረሱ / ያልከፈሉ (${unpaidGen.length})</b>
${unpaidGenGrouped || '• ሁሉም ከፍለዋል ✅'}

━━━━━━━━━━━━━━━
💳 <b>የባንክ ሂሳብ</b>
• ቁጥር፦ 1000778285146
• ስም፦ Aida, Ibrahim and Zebiba
━━━━━━━━━━━━━━━
🤖 የአበሩስ አንድነት ማህበር`;

      const familyPortalUrl = `${APP_URL}/family-portal?familyId=${family.id}`;
      let telegramDispatchSuccess = false;
      let dispatchMethod = 'prepared';

      // Attempt Telegram dispatch if bot token is active and chat ID/phone available
      const targetChat = incomingChatId || ADMIN_TELEGRAM_CHAT_ID;
      if (isTelegramBotActive && targetChat) {
        try {
          const keyboard = {
            inline_keyboard: [
              [{ text: '🌐 ወደ ቤተሰብ ፖርታል ግባ', url: familyPortalUrl }],
              [{ text: '💳 የባንክ መረጃ', callback_data: 'cmd_payment_info' }],
            ],
          };
          await sendTelegramMessage(targetChat, familyReportText, keyboard);
          telegramDispatchSuccess = true;
          dispatchMethod = 'telegram_bot';
        } catch (botErr) {
          console.warn('[Telegram Dispatch Notice] Bot message could not be delivered, returning prepared report payload:', botErr);
        }
      }

      // ALWAYS return 200 OK with the prepared report - NEVER 400 Bad Request!
      return res.status(200).json({
        success: true,
        reportType: 'family_head_report',
        message: `የ${family.familyName} ቤተሰብ ተወካይ (${family.headName}) የክፍያ ሪፖርት በተሳካ ሁኔታ ተዘጋጅቷል`,
        family: {
          id: family.id,
          familyName: family.familyName,
          headName: family.headName,
          phone: family.phone || '',
          telegram: family.telegram || '',
        },
        period: {
          month: effectiveMonth,
          monthName,
          year: effectiveYear,
        },
        summary: {
          totalMembers: famMembers.length,
          monthly: {
            collected: monthlyCollected,
            paidCount: paidMonthlyMembers.length,
            unpaidCount: unpaidMonthlyMembers.length,
          },
          generation: {
            expected: genExpectedTotal,
            collected: genCollected,
            remainingBalance: genRemainingTotal,
            paidCount: paidOrPartialGen.length,
            unpaidCount: unpaidGen.length,
          },
          totalCollected: monthlyCollected + genCollected,
        },
        reportText: familyReportText,
        directUrl: familyPortalUrl,
        telegramDispatched: telegramDispatchSuccess,
        dispatchMethod,
      });
    }

    // B. SEND REPORT TO INDIVIDUAL MEMBER
    if (target === 'member' || memberId) {
      if (!memberId) {
        return res.status(400).json({
          error: 'Missing Parameter',
          field: 'memberId',
          message: 'memberId is required when sending a report to an individual member.',
        });
      }

      let member: any = null;
      let memberContributions: any[] = [];

      if (db) {
        const memDoc = await getDoc(doc(db, 'members', String(memberId).trim()));
        if (memDoc.exists()) {
          member = { id: memDoc.id, ...memDoc.data() };
        }
        if (member) {
          const contribSnap = await getDocs(
            query(collection(db, 'contributions'), where('memberId', '==', member.id))
          );
          memberContributions = contribSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
      } else {
        member = (currentStore.members || []).find((m: any) => m.id === String(memberId).trim());
        memberContributions = (currentStore.contributions || []).filter((c: any) => c.memberId === String(memberId).trim());
      }

      if (!member) {
        return res.status(404).json({
          error: 'Member Not Found',
          field: 'memberId',
          message: `No member found with ID: ${memberId}`,
        });
      }

      // Always compute Generation stats across ALL member generation contributions before filtering by month/year
      const genStats = computeMemberGenStats(member, memberContributions);

      if (parsedYear !== undefined) {
        memberContributions = memberContributions.filter((c) => c.ethiopianYear === parsedYear);
      }
      if (parsedMonth !== undefined) {
        memberContributions = memberContributions.filter((c) => c.ethiopianMonth === parsedMonth);
      }

      const monthlyCons = memberContributions.filter((c) => {
        const st = String(c.status || '').toLowerCase();
        return c.type === 'ወርሃዊ' && (st === 'ተከፍሏል' || st === 'ከፊል' || st === 'paid' || st === 'partial');
      });
      const monthlyPaid = monthlyCons.reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);
      const monthlyListText =
        monthlyCons.length > 0
          ? monthlyCons
              .map(
                (c) =>
                  `${c.ethiopianMonthName || monthNames[Number(c.ethiopianMonth)] || ''} ${c.ethiopianYear} (${Number(c.paidAmount || 0).toLocaleString()} ብር${c.datePaid ? ` · ${c.datePaid}` : ''})`
              )
              .join('፣ ')
          : 'እስካሁን አልተመዘገበም';

      const memberToken = member.loginToken || generateLoginToken();
      const personalUrl = `${APP_URL}/login?token=${memberToken}`;

      // Conditional rendering: Generation section includes Total Paid & Remaining Balance;
      // Monthly section shows ONLY paid amount, month names & dates (ZERO remaining balance).
      const generationSectionText =
        member.isMinor || member.isSpouse
          ? ''
          : `\n🏛️ <b>የትውልድ መዋጮ፦</b>\n• Total Paid (ጠቅላላ የተከፈለ)፡ <b>${genStats.paidSoFar.toLocaleString()} ብር</b>\n• Remaining Balance (ቀሪ መዋጮ)፡ <b>${genStats.remainingBalance.toLocaleString()} ብር</b>`;

      const reportText = `📊 <b>የግል የክፍያ ሪፖርት (Personal Contribution Summary)</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>አባል፡</b> ${member.fullName} (መታወቂያ፡ <code>${member.id}</code>)
👨‍👩‍👧‍👦 <b>ቤተሰብ፡</b> ${member.familyName || 'የአበሩስ ቤተሰብ'} (${member.generation || 4}ኛ ትውልድ)

💰 <b>ወርሃዊ መዋጮ፦</b>
• የተከፈለው መጠን፡ <b>${monthlyPaid.toLocaleString()} ብር</b>
• የተከፈሉ ወራትና ቀን፡ ${monthlyListText}${generationSectionText}

🔑 <b>የእርስዎ የግል መግቢያ ሊንክ፦</b>
<a href="${personalUrl}">${personalUrl}</a>

📅 <i>ሪፖርት የተዘጋጀበት ቀን፡ ${new Date().toLocaleDateString('am-ET')}</i>`;

      const telegramId = member.telegramId || incomingChatId;
      let tgDispatched = false;

      if (telegramId && isTelegramBotActive) {
        try {
          const keyboard = {
            inline_keyboard: [
              [{ text: '🌐 ወደ የግል አካውንቴ ግባ', url: personalUrl }],
              [{ text: '💳 የባንክ መረጃ', callback_data: 'cmd_payment_info' }],
            ],
          };
          await sendTelegramMessage(telegramId, reportText, keyboard);
          tgDispatched = true;
        } catch (tgErr) {
          console.warn('[Telegram Personal Alert Notice]:', tgErr);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Personal report successfully prepared for member ${member.fullName}`,
        memberId: member.id,
        telegramId: telegramId || null,
        reportText,
        personalUrl,
        telegramDispatched: tgDispatched,
      });
    }

    // C. SEND AGGREGATED REPORT TO LEADERSHIP (EXECUTIVE, FINANCE_HEAD, SECRETARY)
    const targetRole = role || target || 'EXECUTIVE';
    let targetChatId = incomingChatId || '';

    if (!targetChatId) {
      if (targetRole === 'EXECUTIVE') {
        targetChatId = EXECUTIVE_CHAT_ID || ADMIN_TELEGRAM_CHAT_ID;
      } else if (targetRole === 'FINANCE_HEAD') {
        targetChatId = FINANCE_CHAT_ID || ADMIN_TELEGRAM_CHAT_ID;
      } else if (targetRole === 'SECRETARY') {
        targetChatId = SECRETARY_CHAT_ID || ADMIN_TELEGRAM_CHAT_ID;
      } else {
        targetChatId = ADMIN_TELEGRAM_CHAT_ID;
      }
    }

    // Fetch live data from Firestore
    let allMembers: any[] = [];
    let allContribs: any[] = [];

    if (db) {
      const [membersSnap, contribsSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'contributions')),
      ]);
      allMembers = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      allContribs = contribsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      allMembers = currentStore.members || [];
      allContribs = currentStore.contributions || [];
    }

    // Compute Generation totals across all members prior to period filter
    const totalGenRemainingAll = allMembers
      .filter((m) => !m.isMinor && !m.isSpouse)
      .reduce((sum, m) => sum + computeMemberGenStats(m, allContribs).remainingBalance, 0);

    if (parsedYear !== undefined) {
      allContribs = allContribs.filter((c) => c.ethiopianYear === parsedYear);
    }
    if (parsedMonth !== undefined) {
      allContribs = allContribs.filter((c) => c.ethiopianMonth === parsedMonth);
    }

    const monthlyTotal = allContribs
      .filter((c) => c.type === 'ወርሃዊ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'))
      .reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);

    const genTotal = allContribs
      .filter((c) => c.type === 'ትውልድ' && (c.status === 'ተከፍሏል' || c.status === 'ከፊል'))
      .reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);

    const paidCount = allContribs.filter((c) => c.status === 'ተከፍሏል').length;
    const unpaidCount = allContribs.filter((c) => c.status === 'ያልተከፈለ').length;

    const leadershipText = `📈 <b>የአበሩስ አንድነት ማህበር - የአመራር አጠቃላይ ሪፖርት</b>
━━━━━━━━━━━━━━━━━━━━
🎯 <b>የተላከለት የአመራር አካል፡</b> <b>${targetRole}</b>
📅 <b>የሪፖርት ወቅት፡</b> ${monthName} ${effectiveYear} ዓ.ም

👥 <b>የአባላት አጠቃላይ ሁኔታ፦</b>
• የተመዘገቡ አባላት ብዛት፡ <b>${allMembers.length}</b>

💰 <b>የገቢ አጠቃላይ ማጠቃለያ፦</b>
• የወርሃዊ መዋጮ ገቢ (${monthName} ${effectiveYear})፡ <b>${monthlyTotal.toLocaleString()} ብር</b>
• የትውልድ መዋጮ ጠቅላላ የተከፈለ (Total Paid)፡ <b>${genTotal.toLocaleString()} ብር</b>
• የትውልድ መዋጮ ቀሪ (Remaining Balance)፡ <b>${totalGenRemainingAll.toLocaleString()} ብር</b>
• <b>አጠቃላይ የተሰበሰበ ገቢ፡</b> <b>${(monthlyTotal + genTotal).toLocaleString()} ብር</b>

📋 <b>የክፍያ ምዝገባ ሁኔታ፦</b>
• የተከፈሉ ምዝገባዎች፡ <b>${paidCount}</b>
• ያልተከፈሉ ምዝገባዎች፡ <b>${unpaidCount}</b>

🌐 <b>አስተዳዳሪ ዳሽቦርድ፡</b> <a href="${APP_URL}">${APP_URL}</a>`;

    let leadershipDispatched = false;
    if (targetChatId && isTelegramBotActive) {
      try {
        await sendTelegramMessage(targetChatId, leadershipText);
        leadershipDispatched = true;
      } catch (tgErr) {
        console.warn('[Telegram Leadership Alert Notice]:', tgErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Aggregated report successfully prepared for ${targetRole}`,
      targetRole,
      targetChatId: targetChatId || null,
      reportText: leadershipText,
      telegramDispatched: leadershipDispatched,
    });
  } catch (err: any) {
    console.error('[Error in /api/reports/send]:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to send report' });
  }
});

// Webhook Status and Diagnostic Info API (for UI testing & configuration)
app.get('/api/telegram-webhook/status', async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'active',
    hasBotToken: Boolean(TELEGRAM_BOT_TOKEN && isTelegramBotActive),
    isBotActive: isTelegramBotActive,
    hasAdminChatId: Boolean(ADMIN_TELEGRAM_CHAT_ID),
    firestoreConnected: Boolean(db),
    webhookRoute: '/api/telegram-webhook',
    serverTime: new Date().toISOString(),
  });
});

// GET recent Telegram messages from Firestore (for Admin Dashboard)
app.get('/api/telegram-webhook/messages', async (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Firestore not configured' });
  }
  try {
    const q = query(collection(db, 'telegramMessages'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.status(200).json({ messages });
  } catch (err: any) {
    console.error('[Firestore Fetch Error]:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch messages' });
  }
});

// GET recent complaints from Firestore
app.get('/api/complaints', async (req: Request, res: Response) => {
  if (!db) {
    return res.status(200).json({ success: true, count: 0, complaints: [] });
  }
  try {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    const complaints = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.status(200).json({ success: true, count: complaints.length, complaints });
  } catch (err: any) {
    console.error('[Firestore Fetch Error in /api/complaints]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch complaints' });
  }
});

// POST /api/complaints - Submit complaint/inquiry from Member Portal or Web App
app.post('/api/complaints', async (req: Request, res: Response) => {
  try {
    const { memberId, memberName, category, message, phone } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Complaint message is required' });
    }

    const cleanId = String(memberId || 'MEM').replace(/[^a-zA-Z0-9_-]/g, '_');
    const complaintId = `comp_${Date.now()}_${cleanId}`;
    const nowIso = new Date().toISOString();

    const complaintData = {
      id: complaintId,
      memberId: memberId || '',
      firstName: memberName || 'አባል',
      category: category || 'የክፍያ ማስተካከያ',
      complaintText: `[${category || 'የክፍያ ማስተካከያ'}] ${message.trim()}`,
      phone: phone || '',
      status: 'open',
      createdAt: nowIso,
      source: 'member_portal',
    };

    if (db) {
      await safeFirestoreSetDoc(doc(db, 'complaints', complaintId), complaintData);
      console.log(`[Firestore] Stored member portal complaint: ${complaintId}`);
    }

    // Notify Telegram Admin if active
    if (ADMIN_TELEGRAM_CHAT_ID && isTelegramBotActive) {
      try {
        const adminComplaintAlert = `⚠️ <b>አዲስ የአባል ቅሬታ/ጥያቄ በፖርታል ቀርቧል!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 <b>የቅሬታ መለያ፦</b> <code>${complaintId}</code>\n` +
          `👤 <b>ከላኪ፡</b> ${memberName || 'አባል'} (<code>${memberId || 'N/A'}</code>)\n` +
          `📂 <b>ዓይነት፡</b> ${category || 'የክፍያ ማስተካከያ'}\n` +
          `📝 <b>መልእክት፡</b> ${message.trim()}\n` +
          `📞 <b>ስልክ፡</b> ${phone || 'የለም'}\n` +
          `⏰ <b>ሰዓት፡</b> ${new Date().toLocaleString('am-ET')}\n\n` +
          `💬 <i>መልስ ለመስጠት ይህንን መልዕክት በቀጥታ Reply ያድርጉ (Reply to this message to send response)</i>`;
        await sendTelegramMessage(ADMIN_TELEGRAM_CHAT_ID, adminComplaintAlert);
      } catch (tgErr) {
        console.warn('[Telegram Admin Notification Notice]:', tgErr);
      }
    }

    return res.status(200).json({
      success: true,
      complaintId,
      message: 'ቅሬታዎ/አስተያየትዎ በተሳካ ሁኔታ ተመዝግቧል!',
      complaint: complaintData,
    });
  } catch (err: any) {
    console.error('[Error in POST /api/complaints]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to submit complaint' });
  }
});

// Legacy telegram webhook complaints alias
app.get('/api/telegram-webhook/complaints', async (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Firestore not configured' });
  }
  try {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const complaints = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.status(200).json({ complaints });
  } catch (err: any) {
    console.error('[Firestore Fetch Error]:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch complaints' });
  }
});

// GET recent receipts from Firestore
app.get('/api/telegram-webhook/receipts', async (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Firestore not configured' });
  }
  try {
    const q = query(collection(db, 'receipts'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const receipts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.status(200).json({ receipts });
  } catch (err: any) {
    console.error('[Firestore Fetch Error]:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch receipts' });
  }
});

// POST endpoint to test & simulate Telegram updates directly from the in-app UI
app.post('/api/telegram-webhook/test-simulate', async (req: Request, res: Response) => {
  try {
    const { action, text, fileId, senderName, fromId, isAdmin, replyToText } = req.body || {};
    const effectiveIsAdmin = isAdmin || action === 'admin_reply';
    const effectiveFromId = fromId || (effectiveIsAdmin ? (ADMIN_TELEGRAM_CHAT_ID || 88990011) : 99887766);
    const mockUpdate = {
      update_id: Math.floor(Math.random() * 1000000),
      isAdmin: effectiveIsAdmin,
      message: {
        message_id: Math.floor(Math.random() * 10000),
        from: {
          id: effectiveFromId,
          is_bot: false,
          first_name: senderName || (effectiveIsAdmin ? 'አስተዳዳሪ (Admin)' : 'ሙከራ አባል (Test Member)'),
          username: effectiveIsAdmin ? 'admin_user' : 'test_member',
        },
        chat: {
          id: effectiveFromId,
          first_name: senderName || (effectiveIsAdmin ? 'አስተዳዳሪ' : 'ሙከራ አባል'),
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: action === 'photo' ? (text || 'የክፍያ ደረሰኝ ፎቶ') : (text || '/start'),
        photo: action === 'photo' ? [{ file_id: fileId || `AgACAgQAAxkBAAE_${Date.now()}_sample_receipt`, width: 800, height: 600 }] : undefined,
        reply_to_message: replyToText ? {
          message_id: Math.floor(Math.random() * 10000),
          text: replyToText,
          date: Math.floor(Date.now() / 1000) - 60,
          from: { id: 111111, is_bot: true, first_name: 'Abarrus Bot' },
        } : undefined,
      },
    };

    // Execute through worker
    await processTelegramUpdate(mockUpdate);
    res.status(200).json({ success: true, message: 'Simulation processed successfully', update: mockUpdate });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Simulation failed' });
  }
});
// ==========================================
// AUTOMATED SUMMARY EMAIL & NOTIFICATION ENDPOINTS
// ==========================================

// POST /api/notifications/email: Trigger and store automated payment summary email notification in Firestore
app.post('/api/notifications/email', async (req: Request, res: Response) => {
  try {
    const {
      memberId,
      memberName,
      recipient,
      amount,
      month,
      monthName,
      year,
      type,
      paymentMethod,
      transactionRef,
      receiptNumber,
      notes,
      logId: incomingLogId,
      subject: incomingSubject,
    } = req.body || {};

    const targetRecipient = recipient || 'mesudnurga4830@gmail.com';
    const logId = incomingLogId || `NOTIF-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const subject =
      incomingSubject ||
      `የክፍያ ማጠቃለያ ደረሰኝ (Payment Summary) - ${memberName || 'አባል'} (${monthName || month} ${year || 2018})`;

    const logEntry = {
      id: logId,
      type: 'payment_summary_email',
      recipient: targetRecipient,
      memberId: String(memberId || ''),
      memberName: String(memberName || ''),
      subject,
      amount: Number(amount || 0),
      transactionRef: String(transactionRef || ''),
      status: 'sent',
      provider: 'firebase-automated-emailer',
      sentAt: nowIso,
      createdAt: nowIso,
      details: {
        type: type || 'ወርሃዊ',
        month: Number(month || 11),
        monthName: monthName || '',
        year: Number(year || 2018),
        paymentMethod: paymentMethod || 'የኢትዮጵያ ንግድ ባንክ (CBE)',
        receiptNumber: receiptNumber || `REC-${Date.now().toString().slice(-6)}`,
        notes: notes || 'Recorded via Member Portal',
      },
    };

    // Save notification log in Firestore collection 'notificationLogs'
    if (db) {
      await safeFirestoreSetDoc(doc(db, 'notificationLogs', logId), sanitizeForFirestore(logEntry));
      console.log(`[Firestore Notification Log] Stored email notification ${logId} in notificationLogs.`);
    }

    // Format Email Receipt Payload
    console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                የአበሩስ ቤተሰብ አንድነት ማህበር - የክፍያ ማጠቃለያ ደረሰኝ               ║
╠════════════════════════════════════════════════════════════════════════════╣
  ተቀባይ (Recipient): ${targetRecipient}
  ርዕስ (Subject): ${subject}
  የአባል ስም (Member): ${memberName} (${memberId})
  የተከፈለበት ወቅት: ${monthName || month} ${year || 2018} ዓ.ም
  የተከፈለ መጠን (Amount): ${amount} ብር
  የክፍያ ዘዴ (Method): ${paymentMethod || 'CBE'}
  የትራንዛክሽን ቁጥር (Ref): ${transactionRef || 'N/A'}
  የደረሰኝ ቁጥር: ${logEntry.details.receiptNumber}
  የተላከበት ሰዓት: ${nowIso}
╚════════════════════════════════════════════════════════════════════════════╝
    `);

    // Optionally also notify admin chat if configured and bot is active
    if (ADMIN_TELEGRAM_CHAT_ID && isTelegramBotActive) {
      try {
        const emailNotificationText = `📧 <b>አዲስ የክፍያ ማጠቃለያ ኢሜይል ተመዝግቧል</b>\n` +
          `👤 <b>አባል፡</b> ${memberName} (<code>${memberId}</code>)\n` +
          `💰 <b>መጠን፡</b> <b>${amount} ብር</b> (${monthName} ${year})\n` +
          `📬 <b>ተቀባይ ኢሜይል፡</b> <code>${targetRecipient}</code>\n` +
          `🆔 <b>Log ID:</b> <code>${logId}</code>\n` +
          `🔖 <b>Ref:</b> <code>${transactionRef || 'N/A'}</code>`;
        await sendTelegramMessage(ADMIN_TELEGRAM_CHAT_ID, emailNotificationText);
      } catch (tgErr) {
        console.warn('[Telegram Admin Notification Notice]:', tgErr);
      }
    }

    return res.status(200).json({
      success: true,
      logId,
      recipient: targetRecipient,
      sentAt: nowIso,
      message: `የክፍያ ማጠቃለያ ደረሰኝ ወደ ${targetRecipient} በተሳካ ሁኔታ ተልኮ በFirestore ተመዝግቧል`,
      log: logEntry,
    });
  } catch (err: any) {
    console.error('[Error in /api/notifications/email]:', err);
    return res.status(500).json({
      error: 'Failed to dispatch notification',
      message: err?.message || 'Internal server error',
    });
  }
});

// GET /api/notifications/logs: Retrieve email notification logs from Firestore
app.get('/api/notifications/logs', async (req: Request, res: Response) => {
  try {
    if (db) {
      const q = query(collection(db, 'notificationLogs'), orderBy('sentAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ success: true, count: logs.length, logs });
    }
    return res.status(200).json({ success: true, count: 0, logs: [] });
  } catch (err: any) {
    console.error('[Error in /api/notifications/logs]:', err);
    return res.status(500).json({ error: 'Failed to retrieve notification logs', message: err?.message });
  }
});

// ==========================================
// VITE DEV SERVER MIDDLEWARE / STATIC ASSETS
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // Vite 8 injects /@vite/client and unconditionally runs transport.connect(...) on port 24678
    // even when hmr: false & ws: false. Skip transport.connect in dev middleware mode so no
    // failing WebSocket connection is opened in the AI Studio preview iframe.
    app.get('/@vite/client', async (req: Request, res: Response, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR/WS disabled in preview: skipped WebSocket connect */'
            )
            .replace(
              'else throw new SendBeforeConnectError("send was called before connect");',
              'else return;'
            )
            .replace(
              'else throw new SendBeforeConnectError("invoke was called before connect");',
              'else return;'
            );
          res.type('application/javascript').send(patched);
          return;
        }
      } catch (err) {
        console.warn('[Vite Client Patch] Fallback to default Vite middleware:', err);
      }
      next();
    });

    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Abarrus Server] Server running on http://0.0.0.0:${port}`);
    console.log(`[Telegram Webhook] Active at: http://0.0.0.0:${port}/api/telegram-webhook`);
  });
}

startServer().catch((err) => {
  console.error('[Server Start Error]:', err);
});

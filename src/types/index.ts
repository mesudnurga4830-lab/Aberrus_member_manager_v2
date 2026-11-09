/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GenerationNumber = 3 | 4 | 5 | 6;

export type ContributionType = 'ወርሃዊ' | 'ትውልድ' | 'ልዩ'; // Monthly, Generation, Special

export type ContributionStatus = 'ተከፍሏል' | 'ያልተከፈለ' | 'ከፊል' | 'Pending' | 'Paid'; // Paid, Unpaid, Partial, Pending Admin Approval

export type PaymentMethod = 'የኢትዮጵያ ንግድ ባንክ (CBE)' | 'ጥሬ ገንዘብ (Cash)' | 'ሌላ' | 'ቴሌብር (Telebirr)' | 'አዋሽ ባንክ (Awash)';

export type UserRole = 'admin' | 'family_head' | 'member';

export interface Member {
  id: string; // e.g. MEM001
  fullName: string;
  generation: GenerationNumber;
  familyId: string; // e.g. FA001
  familyName: string;
  phone: string;
  phoneNumber?: string;
  isHead?: boolean;
  photo?: string;
  telegram?: string;
  joinedDate?: string;
  notes?: string;
  isMinor?: boolean; // 18 ዓመት ያልሞላቸው (ከወርሃዊም ከትውልድ ክፍያም ነጻ)
  isSpouse?: boolean; // የአባል የትዳር አጋር (የትውልድ ነጻ፣ ወርሃዊ 100 ብር)
  spouseOfMemberId?: string;
  loginToken?: string; // Unique secure token for member login
  telegramId?: string | number; // Telegram Chat/User ID for notifications
  authUid?: string; // Firebase Authentication UID
}

export interface Family {
  id: string; // e.g. FA001
  familyName: string;
  headName: string;
  headMemberId?: string;
  phone: string;
  telegram?: string;
  coHeadName?: string;
  coHeadPhone?: string;
  coHeadTelegram?: string;
  generationRoot?: GenerationNumber;
}

export interface Contribution {
  id: string; // Key e.g. CON-1001
  memberId: string; // Ref ወደ Members (points to beneficiaryId)
  memberName: string;
  familyId: string;
  familyName: string;
  generation: GenerationNumber;
  type: ContributionType;
  ethiopianMonth: number; // 1 = መስከረም ... 12 = ነሐሴ
  ethiopianMonthName: string;
  ethiopianYear: number; // e.g. 2018
  month?: number; // Strict 1-12 field for Firestore querying & aggregations
  year?: number; // Strict e.g. 2018 field for Firestore querying & aggregations
  amount: number;
  paidAmount: number;
  status: ContributionStatus;
  paymentMethod?: PaymentMethod;
  transactionRef?: string;
  datePaid?: string;
  recordedBy?: string;
  receiptNumber?: string;
  notes?: string;
  isInstallment?: boolean; // የትውልድ መዋጮ በከፊል/በየወሩ የሚከፈል
  remainingBalance?: number; // የቀረ የትውልድ ቀሪ እዳ
  // Proxy payment support
  payerId?: string; // The logged-in user's ID
  payerName?: string; // The logged-in user's full name
  beneficiaryId?: string; // The selected member's ID
  beneficiaryName?: string; // The selected member's full name
  isProxyPayment?: boolean; // Whether paid on behalf of someone else
  slipPhoto?: string | null; // Attached receipt image URL or base64
}

export interface LeadershipRoleAssignee {
  memberId?: string;
  name?: string;
  phone?: string;
  telegram?: string;
  fullName?: string;
  phoneNumber?: string;
  telegramUsername?: string;
  roleTitle?: string;
}

export interface AssociationLeadership {
  executive: LeadershipRoleAssignee; // የማህበሩ ስራ አስፈፃሚ
  secretary: LeadershipRoleAssignee; // የማህበሩ ጸሀፊ
  financeOfficer: LeadershipRoleAssignee; // የማህበሩ ፋይናንስ ሀላፊ
}

export interface SettingsRates {
  generationPayment: {
    3: number; // 5000
    4: number; // 1000
    5: number; // 500
    6: number; // 250
  };
  monthlyRate: {
    3: number; // 100
    4: number; // 75
    5: number; // 50
    6: number; // 25
  };
  spouseMonthlyRate: number; // 100 ብር
  associationInfo: {
    name: string;
    englishName: string;
    motto: string;
    phone: string;
    email: string;
    telegramChannel: string;
    cbeAccount: string;
    cbeAccountName: string;
    telebirrNumber: string;
    telebirrName: string;
    awashAccount: string;
    awashAccountName: string;
    paymentStartDate: string; // ሀምሌ 01፣ 2018 ዓ.ም
    generationPaymentNote: string;
  };
  leadership: AssociationLeadership;
  automationSettings: {
    reminderDay: number; // 5th of month
    reminderTime: string; // 09:00 AM
    enableTelegramAutoReminders: boolean;
    adminTelegramAlerts: boolean;
  };
  paymentStartDate?: string;
  generationPaymentNote?: string;
}

export interface EthiopianMonthInfo {
  number: number;
  amharic: string;
  english: string;
}

export interface NotificationLog {
  id: string;
  type: 'payment_summary_email' | 'payment_claim_alert' | 'general_notice';
  recipient: string;
  memberId: string;
  memberName: string;
  subject: string;
  amount: number;
  transactionRef?: string;
  status: 'sent' | 'pending' | 'failed';
  provider: string;
  sentAt: string;
  createdAt: string;
  details?: Record<string, any>;
}


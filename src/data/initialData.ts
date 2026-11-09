/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Family, Member, Contribution, SettingsRates } from '../types/index.ts';

export const initialSettings: SettingsRates = {
  generationPayment: {
    3: 5000,
    4: 1000,
    5: 500,
    6: 250,
  },
  monthlyRate: {
    3: 100,
    4: 75,
    5: 50,
    6: 25,
  },
  spouseMonthlyRate: 100,
  associationInfo: {
    name: 'የአበሩስ አንድነት ማህበር (አሲያ መስኡድ አፕ)',
    englishName: 'Abarrus Unity Association (Asya Mesud App)',
    motto: 'ትውልድን ማስተሳሰር እና ማህበረሰባዊ አብሮነትን ማጠናከር',
    phone: '',
    email: 'abarrus.association@gmail.com',
    telegramChannel: '@AbarrusFamily',
    cbeAccount: '1000778285146',
    cbeAccountName: 'Aida, Ibrahim and zebiba',
    telebirrNumber: '',
    telebirrName: '',
    awashAccount: '',
    awashAccountName: '',
    paymentStartDate: 'ሀምሌ 01፣ 2018 ዓ.ም',
    generationPaymentNote: 'የትውልድ መዋጮ አባሎች ከቻሉ በአንድ ጊዜ ካልሆነ የቻሉትን መጠን በየወሩ ከፋፍለው መክፈል ይችላሉ።',
  },
  leadership: {
    executive: {
      name: 'የማህበሩ ስራ አስፈፃሚ',
      phone: '',
      telegram: '@AbarrusExecutive',
    },
    secretary: {
      name: 'የማህበሩ ጸሀፊ',
      phone: '',
      telegram: '@AbarrusSecretary',
    },
    financeOfficer: {
      name: 'የማህበሩ ፋይናንስ ሀላፊ',
      phone: '',
      telegram: '@AbarrusFinance',
    },
  },
  automationSettings: {
    reminderDay: 5,
    reminderTime: '09:00',
    enableTelegramAutoReminders: true,
    adminTelegramAlerts: true,
  },
  paymentStartDate: 'ሀምሌ 01፣ 2018 ዓ.ም',
  generationPaymentNote: 'የትውልድ መዋጮ አባሎች ከቻሉ በአንድ ጊዜ ካልሆነ የቻሉትን መጠን በየወሩ ከፋፍለው መክፈል ይችላሉ።',
};

// No demo data or hardcoded members - all data is saved to and queried from live Firestore
export const initialFamilies: Family[] = [];
export const initialMembers: Member[] = [];
export const initialContributions: Contribution[] = [];

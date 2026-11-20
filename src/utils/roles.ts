/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRoleType, Member, PermissionKey, RoleAssignment, UserRole } from '../types';
import { MASTER_ADMIN } from './adminAuth';

export interface PermissionDefinition {
  key: PermissionKey;
  labelAm: string;
  labelEn: string;
  descriptionAm: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  {
    key: 'view_dashboard',
    labelAm: 'ዳሽቦርድ እና ሪፖርቶች',
    labelEn: 'Dashboard & Reports',
    descriptionAm: 'የገቢ ማጠቃለያ ዳሽቦርድን እና አጠቃላይ መረጃዎችን ማየት',
  },
  {
    key: 'record_payments',
    labelAm: 'ክፍያ መመዝገብ እና ማጽደቅ',
    labelEn: 'Record & Manage Payments',
    descriptionAm: 'ወርሃዊ/የትውልድ ክፍያ መመዝገብ፣ የጅምላ ደረሰኝ እና ክፍያ ማስተዳደር',
  },
  {
    key: 'manage_members',
    labelAm: 'አባላትን ማስተዳደር',
    labelEn: 'Manage Members',
    descriptionAm: 'አዲስ አባል መጨመር፣ መረጃ ማስተካከል እና የአባላት ማውጫ ማየት',
  },
  {
    key: 'view_payment_lists',
    labelAm: 'የከፈሉ/ያልከፈሉ ስም ዝርዝር እና PDF',
    labelEn: 'Payment Status Lists & PDF',
    descriptionAm: 'የከፈሉ፣ በከፊል እና ያልከፈሉ ስም ዝርዝር መመልከትና ሪፖርት ማውጣት',
  },
  {
    key: 'manage_complaints',
    labelAm: 'የአባላት ቅሬታዎች መመለስ',
    labelEn: 'Handle Complaints',
    descriptionAm: 'የአባላትን ቅሬታ ማንበብ፣ መልስ መስጠት እና አላስፈላጊ ቅሬታ መሰረዝ',
  },
  {
    key: 'manage_family_heads',
    labelAm: 'የቤተሰብ ወኪሎች ክፍል',
    labelEn: 'Family Representatives Portal',
    descriptionAm: 'የቤተሰብ ወኪሎች ገጽን እና የቤተሰብ መረጃን ማስተዳደር',
  },
  {
    key: 'manage_settings',
    labelAm: 'ተመኖች እና አመራር ማስተካከያ',
    labelEn: 'Settings & Leadership',
    descriptionAm: 'የመዋጮ ተመኖችን እና የማህበሩን አመራር ሹመቶች ማስተካከል',
  },
  {
    key: 'manage_roles',
    labelAm: 'ሚና እና ፍቃድ አስተዳደር',
    labelEn: 'Role & Permission Management',
    descriptionAm: 'ለሌሎች ሰዎች ሚና መስጠት፣ ማስተካከል እና መሰረዝ (Revoke)',
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSIONS.map((p) => p.key);

export interface RolePresetDefinition {
  role: AppRoleType;
  labelAm: string;
  labelEn: string;
  descriptionAm: string;
  defaultPermissions: PermissionKey[];
}

export const ROLE_PRESETS: RolePresetDefinition[] = [
  {
    role: 'co_admin',
    labelAm: 'ተባባሪ አስተዳዳሪ (Co-Admin)',
    labelEn: 'Co-Admin',
    descriptionAm: 'ከሚና አስተዳደር በስተቀር ሁሉንም የአስተዳዳሪ ስራዎች ያከናውናል',
    defaultPermissions: [
      'view_dashboard',
      'record_payments',
      'manage_members',
      'view_payment_lists',
      'manage_complaints',
      'manage_family_heads',
      'manage_settings',
    ],
  },
  {
    role: 'finance_officer',
    labelAm: 'የፋይናንስ ሀላፊ (Finance)',
    labelEn: 'Finance Officer',
    descriptionAm: 'ክፍያዎችን ይመዘግባል፣ ደረሰኞችን ያጸድቃል እና የከፈሉ/ያልከፈሉ ስም ዝርዝር ያያል',
    defaultPermissions: ['view_dashboard', 'record_payments', 'view_payment_lists'],
  },
  {
    role: 'secretary',
    labelAm: 'የማህበሩ ጸሀፊ (Secretary)',
    labelEn: 'Secretary',
    descriptionAm: 'የአባላት መዝገብ ያስተዳድራል፣ ቅሬታዎችን ይመልሳል እና ሪፖርቶችን ያያል',
    defaultPermissions: [
      'view_dashboard',
      'manage_members',
      'view_payment_lists',
      'manage_complaints',
    ],
  },
  {
    role: 'family_head',
    labelAm: 'የቤተሰብ ወኪል (Family Head)',
    labelEn: 'Family Head',
    descriptionAm: 'የቤተሰብ ወኪሎች ገጽን በመጠቀም የቤተሰብ አባላትን እና ክፍያን ይከታተላል',
    defaultPermissions: ['manage_family_heads', 'record_payments', 'view_payment_lists'],
  },
];

export function getRoleDisplayLabel(role: AppRoleType, lang: 'am' | 'en' = 'am'): string {
  switch (role) {
    case 'super_admin':
      return lang === 'en' ? 'Master Admin' : 'ዋና አስተዳዳሪ';
    case 'co_admin':
      return lang === 'en' ? 'Co-Admin' : 'ተባባሪ አስተዳዳሪ';
    case 'finance_officer':
      return lang === 'en' ? 'Finance Officer' : 'የፋይናንስ ሀላፊ';
    case 'secretary':
      return lang === 'en' ? 'Secretary' : 'ጸሀፊ';
    case 'family_head':
      return lang === 'en' ? 'Family Representative' : 'የቤተሰብ ወኪል';
    default:
      return lang === 'en' ? 'Member' : 'አባል';
  }
}

export interface EffectiveAccess {
  isMasterAdmin: boolean;
  appRole: AppRoleType;
  userRole: UserRole;
  permissions: PermissionKey[];
  assignment: RoleAssignment | null;
}

function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

export function resolveEffectiveAccess(params: {
  authEmail?: string | null;
  authUid?: string | null;
  matchedMember?: Member | null;
  roleAssignments: RoleAssignment[];
}): EffectiveAccess {
  const { authEmail, authUid, matchedMember, roleAssignments } = params;
  const cleanEmail = String(authEmail || '').trim().toLowerCase();

  // Master Admin check (immutable)
  if (cleanEmail && cleanEmail === MASTER_ADMIN.email.toLowerCase()) {
    return {
      isMasterAdmin: true,
      appRole: 'super_admin',
      userRole: 'admin',
      permissions: [...ALL_PERMISSION_KEYS],
      assignment: null,
    };
  }

  const matchedMemberPhoneTail = normalizePhoneDigits(matchedMember?.phone);

  // Find active RoleAssignment matching uid, email, authEmail, memberId, or phone tail
  const activeAssignment = roleAssignments.find((a) => {
    if (!a || a.status !== 'active' || a.role === 'member') return false;
    if (!Array.isArray(a.permissions) || a.permissions.length === 0) return false;

    if (authUid && a.authUid && a.authUid === authUid) return true;
    if (cleanEmail) {
      if (a.email && a.email.trim().toLowerCase() === cleanEmail) return true;
      if (a.authEmail && a.authEmail.trim().toLowerCase() === cleanEmail) return true;
    }
    if (matchedMember) {
      if (a.memberId && a.memberId === matchedMember.id) return true;
      const aPhoneTail = normalizePhoneDigits(a.phone);
      if (aPhoneTail && matchedMemberPhoneTail && aPhoneTail === matchedMemberPhoneTail) {
        return true;
      }
    }
    return false;
  });

  if (!activeAssignment) {
    return {
      isMasterAdmin: false,
      appRole: 'member',
      userRole: 'member',
      permissions: [],
      assignment: null,
    };
  }

  const perms = activeAssignment.permissions;
  const hasAdminSpacePerm = perms.some((p) =>
    [
      'view_dashboard',
      'record_payments',
      'manage_members',
      'view_payment_lists',
      'manage_complaints',
      'manage_settings',
      'manage_roles',
    ].includes(p)
  );

  const userRole: UserRole =
    activeAssignment.role === 'family_head' && !hasAdminSpacePerm
      ? 'family_head'
      : 'admin';

  return {
    isMasterAdmin: false,
    appRole: activeAssignment.role,
    userRole,
    permissions: perms,
    assignment: activeAssignment,
  };
}

export function hasAppPermission(
  permissions: PermissionKey[],
  key: PermissionKey,
  isMasterAdmin: boolean
): boolean {
  if (isMasterAdmin) return true;
  return permissions.includes(key);
}

export function getAllowedTabsForAccess(
  access: EffectiveAccess,
  hasMemberProfile: boolean
): string[] {
  if (access.isMasterAdmin) {
    return [
      'dashboard',
      'portal',
      'heads',
      'members',
      'tree',
      'contributions',
      'unpaid',
      'leadership',
      'corrections',
      'automations',
      'roles',
    ];
  }

  if (access.userRole === 'member' || access.permissions.length === 0) {
    return ['portal'];
  }

  const tabs = new Set<string>();
  const has = (k: PermissionKey) => access.permissions.includes(k);

  if (has('view_dashboard')) {
    tabs.add('dashboard');
    tabs.add('leadership');
  }
  if (has('manage_members')) {
    tabs.add('members');
    tabs.add('tree');
  }
  if (has('record_payments')) {
    tabs.add('contributions');
  }
  if (has('view_payment_lists')) {
    tabs.add('unpaid');
  }
  if (has('manage_family_heads')) {
    tabs.add('heads');
  }
  if (has('manage_roles')) {
    tabs.add('roles');
  }
  if (has('manage_complaints') && !tabs.has('dashboard')) {
    tabs.add('dashboard');
  }
  if (hasMemberProfile) {
    tabs.add('portal');
  }

  return Array.from(tabs);
}

export function getDefaultLandingTab(access: EffectiveAccess): string {
  if (access.isMasterAdmin) return 'dashboard';
  if (access.permissions.includes('view_dashboard') || access.permissions.includes('manage_complaints')) {
    return 'dashboard';
  }
  if (access.permissions.includes('record_payments')) return 'contributions';
  if (access.permissions.includes('manage_members')) return 'members';
  if (access.permissions.includes('view_payment_lists')) return 'unpaid';
  if (access.permissions.includes('manage_family_heads')) return 'heads';
  if (access.permissions.includes('manage_roles')) return 'roles';
  return 'portal';
}

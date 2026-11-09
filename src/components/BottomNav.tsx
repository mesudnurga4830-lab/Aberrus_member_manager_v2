/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, CreditCard, Receipt, User } from 'lucide-react';
import { UserRole } from '../types';

interface BottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  lang?: 'am' | 'en';
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  userRole,
  lang = 'am',
}) => {
  const isEn = lang === 'en';

  const items = [
    {
      id: userRole === 'member' ? 'portal' : userRole === 'family_head' ? 'heads' : 'dashboard',
      label: isEn ? 'Home' : 'መነሻ',
      icon: Home,
      match: ['dashboard', 'heads', 'portal'],
    },
    {
      id: userRole === 'member' ? 'portal' : 'contributions',
      subTab: 'payments',
      label: isEn ? 'Payments' : 'ክፍያዎች',
      icon: CreditCard,
      match: ['contributions'],
    },
    {
      id: userRole === 'member' ? 'portal' : 'unpaid',
      subTab: 'receipts',
      label: isEn ? 'Receipts' : 'ደረሰኞች',
      icon: Receipt,
      match: ['receipts', 'unpaid'],
    },
    {
      id: 'portal',
      label: isEn ? 'Profile' : 'መገለጫ',
      icon: User,
      match: ['portal', 'profile'],
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#E0E0E0] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] px-2 py-1 flex items-center justify-around no-print"
      aria-label="Mobile navigation"
    >
      {items.map((item, idx) => {
        const Icon = item.icon;
        const isActive =
          (idx === 0 && (currentTab === 'dashboard' || (userRole === 'member' && currentTab === 'portal') || (userRole === 'family_head' && currentTab === 'heads'))) ||
          (idx === 1 && currentTab === 'contributions') ||
          (idx === 2 && (currentTab === 'unpaid' || currentTab === 'receipts')) ||
          (idx === 3 && currentTab === 'portal');

        return (
          <button
            key={`${item.id}-${idx}`}
            onClick={() => {
              onSelectTab(item.id);
            }}
            className={`flex-1 py-1.5 px-2 flex flex-col items-center justify-center gap-1 transition-all relative ${
              isActive ? 'text-[#1B5E20] font-bold' : 'text-[#757575] hover:text-[#212121]'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[11px] leading-tight font-medium tracking-tight">
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 w-8 h-[3px] bg-[#FFD700] rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
};

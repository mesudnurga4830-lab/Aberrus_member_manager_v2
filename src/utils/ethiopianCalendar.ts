/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EthiopianMonthInfo } from '../types';

export const ETHIOPIAN_MONTHS: EthiopianMonthInfo[] = [
  { number: 1, amharic: 'መስከረም', english: 'Meskerem' },
  { number: 2, amharic: 'ጥቅምት', english: 'Tikimt' },
  { number: 3, amharic: 'ህዳር', english: 'Hidar' },
  { number: 4, amharic: 'ታህሳስ', english: 'Tahsas' },
  { number: 5, amharic: 'ጥር', english: 'Tir' },
  { number: 6, amharic: 'የካቲት', english: 'Yekatit' },
  { number: 7, amharic: 'መጋቢት', english: 'Megabit' },
  { number: 8, amharic: 'ሚያዝያ', english: 'Miazia' },
  { number: 9, amharic: 'ግንቦት', english: 'Ginbot' },
  { number: 10, amharic: 'ሰኔ', english: 'Sene' },
  { number: 11, amharic: 'ሀምሌ', english: 'Hamle' },
  { number: 12, amharic: 'ነሐሴ', english: 'Nehase' },
];

export function getEthiopianMonthName(monthNumber: number): string {
  const month = ETHIOPIAN_MONTHS.find((m) => m.number === monthNumber);
  return month ? month.amharic : `ወር ${monthNumber}`;
}

export function getCurrentEthiopianDate(): { year: number; month: number; day: number; formatted: string } {
  // Active Ethiopian date requested: ሀምሌ 01፣ 2018 ዓ.ም
  return {
    year: 2018,
    month: 11,
    day: 1,
    formatted: 'ሀምሌ 01፣ 2018 ዓ.ም',
  };
}

export function formatEthiopianCurrency(amount: number): string {
  return new Intl.NumberFormat('am-ET', {
    style: 'currency',
    currency: 'ETB',
    maximumFractionDigits: 0,
  }).format(amount).replace('ETB', 'ብር');
}

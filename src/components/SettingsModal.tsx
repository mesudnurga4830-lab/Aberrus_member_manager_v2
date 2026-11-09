/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Save,
  RotateCcw,
  Sliders,
  Shield,
  Building2,
  ShieldCheck,
  User,
  Mail,
  KeyRound,
  Users,
  Award,
  Phone,
  MessageSquare,
} from 'lucide-react';
import { SettingsRates, AssociationLeadership, Member } from '../types';
import { MASTER_ADMIN, getAdminPin, setAdminPin } from '../utils/adminAuth';

interface SettingsModalProps {
  settings: SettingsRates;
  members?: Member[];
  onSave: (settings: SettingsRates) => void;
  onReset: () => void;
  onClose: () => void;
  onOpenChangePin?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  members = [],
  onSave,
  onReset,
  onClose,
  onOpenChangePin,
}) => {
  const [formData, setFormData] = useState<SettingsRates>(() => {
    const clone: SettingsRates = JSON.parse(JSON.stringify(settings));
    if (!clone.spouseMonthlyRate) clone.spouseMonthlyRate = 100;
    if (!clone.leadership) {
      clone.leadership = {
        executive: { fullName: '', roleTitle: 'የማህበሩ ስራ አስፈፃሚ' },
        secretary: { fullName: '', roleTitle: 'የማህበሩ ጸሀፊ' },
        financeOfficer: { fullName: '', roleTitle: 'የማህበሩ ፋይናንስ ሀላፊ' },
      };
    }
    return clone;
  });

  const [adminPin, setLocalAdminPin] = useState(getAdminPin());
  const [savedNotice, setSavedNotice] = useState(false);

  React.useEffect(() => {
    const handlePinChanged = (e: any) => {
      if (e.detail?.pin) {
        setLocalAdminPin(e.detail.pin);
      }
    };
    window.addEventListener('abarrus_admin_pin_changed', handlePinChanged);
    return () => window.removeEventListener('abarrus_admin_pin_changed', handlePinChanged);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPin(adminPin);
    onSave(formData);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-neutral-200 animate-in fade-in zoom-in-95 duration-200 my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/20 text-amber-300">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-amber-200">የመዋጮ መጠኖች እና ማስተካከያዎች (Settings)</h3>
              <p className="text-xs text-emerald-200">የአበሩስ አንድነት ማህበር ተመንና አመራር ማዘጋጃ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-emerald-700/50 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {savedNotice && (
            <div className="p-3 bg-emerald-100 text-emerald-900 rounded-xl text-xs font-semibold">
              ማስተካከያዎቹ በተሳካ ሁኔታ ተቀምጠዋል!
            </div>
          )}

          {/* 1. Generation Payments (የትውልድ ቋሚ መዋጮ) */}
          <div className="space-y-3">
            <div className="border-b border-neutral-200 pb-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-900">
                1. የትውልድ ቋሚ መዋጮ (Generation Payment)
              </h4>
              <p className="text-[11px] text-neutral-500">ለእያንዳንዱ ትውልድ የሚከፈል የአንድ ጊዜ መዋጮ (በአንድ ጊዜ ወይም በከፊል)</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[3, 4, 5, 6].map((gen) => (
                <div key={gen} className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                  <label className="block text-xs font-bold text-neutral-700 mb-1">{gen}ኛ ትውልድ</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.generationPayment[gen as 3 | 4 | 5 | 6]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          generationPayment: {
                            ...formData.generationPayment,
                            [gen]: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full text-xs font-bold rounded-lg border border-neutral-300 px-2.5 py-1.5 font-mono tabular-nums bg-white"
                      required
                    />
                    <span className="absolute right-2 top-1.5 text-[10px] text-neutral-400">ብር</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
              💡 <strong>ማሳሰቢያ፡</strong> 18 ዓመት ያልሞላቸው ልጆች (39 ልጆች) እና የአባላት የትዳር አጋሮች ከትውልድ ክፍያ ነፃ (0 ብር) ናቸው።
            </p>
          </div>

          {/* 2. Monthly Rates (ወርሃዊ መዋጮ) */}
          <div className="space-y-3">
            <div className="border-b border-neutral-200 pb-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-900">
                2. ወርሃዊ መዋጮ ተመን (Monthly Rate)
              </h4>
              <p className="text-[11px] text-neutral-500">በየወሩ እስከ ቀን 5 የሚከፈል መዋጮ</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[3, 4, 5, 6].map((gen) => (
                <div key={gen} className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                  <label className="block text-xs font-bold text-neutral-700 mb-1">{gen}ኛ ትውልድ</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.monthlyRate[gen as 3 | 4 | 5 | 6]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          monthlyRate: {
                            ...formData.monthlyRate,
                            [gen]: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full text-xs font-bold rounded-lg border border-neutral-300 px-2.5 py-1.5 font-mono tabular-nums bg-white"
                      required
                    />
                    <span className="absolute right-2 top-1.5 text-[10px] text-neutral-400">ብር</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Spouse Monthly Rate */}
            <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200 flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-purple-950">💍 የአባላት የትዳር አጋሮች ወርሃዊ መዋጮ</label>
                <p className="text-[11px] text-purple-700">ለትዳር አጋሮች የተመደበ ወርሃዊ መዋጮ ተመን</p>
              </div>
              <div className="relative w-28">
                <input
                  type="number"
                  value={formData.spouseMonthlyRate || 100}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      spouseMonthlyRate: Number(e.target.value),
                    })
                  }
                  className="w-full text-xs font-bold rounded-lg border border-purple-300 px-2.5 py-1.5 font-mono tabular-nums bg-white"
                  required
                />
                <span className="absolute right-2 top-1.5 text-[10px] text-neutral-400">ብር</span>
              </div>
            </div>
          </div>

          {/* 3. Official CBE Bank Account */}
          <div className="space-y-3">
            <div className="border-b border-neutral-200 pb-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-900">
                3. ይፋዊ የባንክ ሂሳብ መረጃ (Commercial Bank of Ethiopia)
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">CBE የባንክ ሂሳብ ቁጥር</label>
                <input
                  type="text"
                  value={formData.associationInfo.cbeAccount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      associationInfo: { ...formData.associationInfo, cbeAccount: e.target.value },
                    })
                  }
                  className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 font-mono font-bold text-emerald-900 bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">የCBE ሂሳብ ስም (Account Name)</label>
                <input
                  type="text"
                  value={formData.associationInfo.cbeAccountName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      associationInfo: { ...formData.associationInfo, cbeAccountName: e.target.value },
                    })
                  }
                  className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 font-medium bg-white"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">የክፍያ መጀመሪያ ቀን</label>
                <input
                  type="text"
                  value={formData.paymentStartDate || 'ሀምሌ 01፣ 2018 ዓ.ም'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paymentStartDate: e.target.value,
                    })
                  }
                  className="w-full text-xs rounded-xl border border-neutral-300 px-3 py-2 font-medium bg-white"
                  placeholder="ሀምሌ 01፣ 2018 ዓ.ም"
                />
              </div>
            </div>
          </div>

          {/* 4. Leadership Section: Executive, Secretary, Finance Officer */}
          <div className="space-y-3 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <div className="flex items-center gap-2 border-b border-emerald-200/80 pb-2">
              <Award className="w-4 h-4 text-emerald-800" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-950">
                4. የማህበሩ አመራር አስተዳደር (Leadership Management)
              </h4>
            </div>
            <p className="text-[11px] text-neutral-600">
              የማህበሩን ስራ አስፈፃሚ፣ ጸሀፊ እና ፋይናንስ ሀላፊ ከነባር አባላት ውስጥ በመምረጥ ይመድቡ። የተመደቡበት መረጃ በራስ-ሰር ይሞላል እንዲሁም ሪፖርቶች በቴሌግራም ይላኩላቸዋል፦
            </p>

            {/* 1. Executive */}
            <div className="p-3.5 bg-white rounded-xl border border-emerald-200 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-600" />
                  <span>1. የማህበሩ ስራ አስፈፃሚ (Executive)</span>
                </span>
                {formData.leadership.executive.memberId && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    የተመደበ፡ {formData.leadership.executive.memberId}
                  </span>
                )}
              </div>

              {/* Member Selector Dropdown */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  👤 ከአባላት መዝገብ ምረጥ (Assign from Members)
                </label>
                <select
                  value={formData.leadership.executive.memberId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const mem = members.find((m) => m.id === selectedId);
                    if (mem) {
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          executive: {
                            ...formData.leadership.executive,
                            memberId: mem.id,
                            fullName: mem.fullName,
                            phoneNumber: mem.phone || '',
                            telegramUsername: mem.telegram || mem.phone || '',
                          },
                        },
                      });
                    }
                  }}
                  className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-800 focus:bg-white"
                >
                  <option value="">-- አባል ምረጥ (Choose member to assign) --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.fullName} ({m.generation}ኛ · {m.familyName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ሙሉ ስም</label>
                  <input
                    type="text"
                    value={formData.leadership.executive.fullName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          executive: { ...formData.leadership.executive, fullName: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs"
                    placeholder="ስም"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ስልክ ቁጥር</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.leadership.executive.phoneNumber || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          executive: { ...formData.leadership.executive, phoneNumber: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    placeholder="0911234567"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ቴሌግራም (@username)</label>
                  <input
                    type="text"
                    value={formData.leadership.executive.telegramUsername || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          executive: { ...formData.leadership.executive, telegramUsername: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    placeholder="@..."
                  />
                </div>
              </div>
            </div>

            {/* 2. Secretary */}
            <div className="p-3.5 bg-white rounded-xl border border-emerald-200 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-blue-600" />
                  <span>2. የማህበሩ ጸሀፊ (Secretary)</span>
                </span>
                {formData.leadership.secretary.memberId && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200">
                    የተመደበ፡ {formData.leadership.secretary.memberId}
                  </span>
                )}
              </div>

              {/* Member Selector Dropdown */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  👤 ከአባላት መዝገብ ምረጥ (Assign from Members)
                </label>
                <select
                  value={formData.leadership.secretary.memberId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const mem = members.find((m) => m.id === selectedId);
                    if (mem) {
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          secretary: {
                            ...formData.leadership.secretary,
                            memberId: mem.id,
                            fullName: mem.fullName,
                            phoneNumber: mem.phone || '',
                            telegramUsername: mem.telegram || mem.phone || '',
                          },
                        },
                      });
                    }
                  }}
                  className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-800 focus:bg-white"
                >
                  <option value="">-- አባል ምረጥ (Choose member to assign) --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.fullName} ({m.generation}ኛ · {m.familyName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ሙሉ ስም</label>
                  <input
                    type="text"
                    value={formData.leadership.secretary.fullName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          secretary: { ...formData.leadership.secretary, fullName: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs"
                    placeholder="ስም"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ስልክ ቁጥር</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.leadership.secretary.phoneNumber || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          secretary: { ...formData.leadership.secretary, phoneNumber: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    placeholder="0911234567"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ቴሌግራም (@username)</label>
                  <input
                    type="text"
                    value={formData.leadership.secretary.telegramUsername || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          secretary: { ...formData.leadership.secretary, telegramUsername: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    placeholder="@..."
                  />
                </div>
              </div>
            </div>

            {/* 3. Finance Officer */}
            <div className="p-3.5 bg-white rounded-xl border border-emerald-200 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  <span>3. የማህበሩ ፋይናንስ ሀላፊ (Finance Officer)</span>
                </span>
                {formData.leadership.financeOfficer.memberId && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    የተመደበ፡ {formData.leadership.financeOfficer.memberId}
                  </span>
                )}
              </div>

              {/* Member Selector Dropdown */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  👤 ከአባላት መዝገብ ምረጥ (Assign from Members)
                </label>
                <select
                  value={formData.leadership.financeOfficer.memberId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const mem = members.find((m) => m.id === selectedId);
                    if (mem) {
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          financeOfficer: {
                            ...formData.leadership.financeOfficer,
                            memberId: mem.id,
                            fullName: mem.fullName,
                            phoneNumber: mem.phone || '',
                            telegramUsername: mem.telegram || mem.phone || '',
                          },
                        },
                      });
                    }
                  }}
                  className="w-full p-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-800 focus:bg-white"
                >
                  <option value="">-- አባል ምረጥ (Choose member to assign) --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.fullName} ({m.generation}ኛ · {m.familyName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ሙሉ ስም</label>
                  <input
                    type="text"
                    value={formData.leadership.financeOfficer.fullName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          financeOfficer: { ...formData.leadership.financeOfficer, fullName: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs"
                    placeholder="ስም"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ስልክ ቁጥር</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.leadership.financeOfficer.phoneNumber || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          financeOfficer: { ...formData.leadership.financeOfficer, phoneNumber: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    placeholder="0911234567"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 block mb-0.5">ቴሌግራም (@username)</label>
                  <input
                    type="text"
                    value={formData.leadership.financeOfficer.telegramUsername || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadership: {
                          ...formData.leadership,
                          financeOfficer: { ...formData.leadership.financeOfficer, telegramUsername: e.target.value },
                        },
                      })
                    }
                    className="w-full p-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    placeholder="@..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 5. Admin Access & Device Security (No PIN hints) */}
          <div className="space-y-3 p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
            <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-800" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-amber-950">
                  5. የአስተዳዳሪ እና የመሳሪያ ደህንነት ፍቃድ (Admin Security)
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                የተፈቀደ ዋና መሳሪያ ✓
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-amber-200/80">
                <span className="text-[10px] text-neutral-400 block font-semibold">ዋና አስተዳዳሪ</span>
                <span className="font-bold text-neutral-900 flex items-center gap-1.5 mt-0.5">
                  <User className="w-3.5 h-3.5 text-emerald-700" />
                  {MASTER_ADMIN.name}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-amber-200/80">
                <span className="text-[10px] text-neutral-400 block font-semibold">የተፈቀደ ኢሜይል</span>
                <span className="font-mono text-xs font-semibold text-neutral-800 flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-amber-600" />
                  {MASTER_ADMIN.email}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-800" />
                  <span>የአስተዳዳሪ ደህንነት ፒን (Security PIN)</span>
                </label>
                {onOpenChangePin && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenChangePin();
                    }}
                    className="text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-xl border border-amber-300 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3 text-amber-700" />
                    <span>የፒን መቀየሪያ መስኮት ክፈት ↗</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setLocalAdminPin(e.target.value)}
                  maxLength={12}
                  className="w-full text-xs font-mono font-bold px-3 py-2 rounded-xl border border-neutral-300 bg-white focus:ring-2 focus:ring-emerald-700/40"
                  placeholder="የደህንነት ፒን"
                />
              </div>
            </div>
          </div>

          {/* Reset / Actions */}
          <div className="pt-4 flex items-center justify-between border-t border-neutral-200">
            <button
              type="button"
              onClick={() => {
                if (confirm('ሁሉንም መረጃ ወደ መጀመሪያው ሁኔታ መመለስ ይፈልጋሉ?')) {
                  onReset();
                  onClose();
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ዳታውን ዳግም ጀምር (Reset All)</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
              >
                ሰርዝ
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>አስቀምጥ (Save)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

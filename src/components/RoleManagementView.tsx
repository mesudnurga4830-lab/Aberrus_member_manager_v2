/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Ban,
  RotateCcw,
  Trash2,
  Crown,
  Users,
  Mail,
  Phone,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { AppRoleType, Member, PermissionKey, RoleAssignment } from '../types';
import {
  ALL_PERMISSIONS,
  ROLE_PRESETS,
  getRoleDisplayLabel,
} from '../utils/roles';
import {
  buildRoleAssignmentDocId,
  deleteRoleAssignmentFromFirestore,
  getDummyEmailFromPhone,
  normalizePhoneNumber,
  restoreRoleAssignmentInFirestore,
  revokeRoleAssignmentInFirestore,
  saveRoleAssignmentToFirestore,
  subscribeToAllRoleAssignments,
} from '../firebase';
import { MASTER_ADMIN } from '../utils/adminAuth';

interface RoleManagementViewProps {
  members: Member[];
  currentUserEmail?: string | null;
  currentUserName?: string | null;
  isMasterAdmin: boolean;
  lang?: 'am' | 'en';
}

export const RoleManagementView: React.FC<RoleManagementViewProps> = ({
  members,
  currentUserEmail,
  currentUserName,
  isMasterAdmin,
  lang = 'am',
}) => {
  const isEn = lang === 'en';
  const formRef = useRef<HTMLDivElement>(null);

  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [editingAssignment, setEditingAssignment] = useState<RoleAssignment | null>(null);
  const [targetSource, setTargetSource] = useState<'member' | 'email'>('member');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRoleType>('co_admin');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>([
    ...ROLE_PRESETS[0].defaultPermissions,
  ]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // List filters & inline confirmations
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [listSearch, setListSearch] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    const unsub = subscribeToAllRoleAssignments(
      (data) => {
        setAssignments(data);
        setIsLoading(false);
      },
      (err) => {
        console.warn('[RoleManagementView] subscribe error:', err);
        setLoadError(
          isEn
            ? 'Unable to load role assignments from server.'
            : 'የሚና መዝገቦችን ከሰርቨር ማንበብ አልተቻለም።'
        );
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [isEn]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [members]);

  const filteredMemberOptions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return sortedMembers.slice(0, 120);
    return sortedMembers
      .filter(
        (m) =>
          m.fullName.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (m.phone && m.phone.toLowerCase().includes(q)) ||
          (m.familyName && m.familyName.toLowerCase().includes(q))
      )
      .slice(0, 120);
  }, [sortedMembers, memberSearch]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  const activeCount = useMemo(
    () => assignments.filter((a) => a.status === 'active').length,
    [assignments]
  );
  const revokedCount = useMemo(
    () => assignments.filter((a) => a.status === 'revoked').length,
    [assignments]
  );

  const filteredAssignments = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return assignments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.memberName.toLowerCase().includes(q) ||
        (a.memberId && a.memberId.toLowerCase().includes(q)) ||
        (a.phone && a.phone.toLowerCase().includes(q)) ||
        (a.email && a.email.toLowerCase().includes(q)) ||
        getRoleDisplayLabel(a.role, 'am').toLowerCase().includes(q)
      );
    });
  }, [assignments, statusFilter, listSearch]);

  const handleSelectPreset = (role: AppRoleType) => {
    setSelectedRole(role);
    const preset = ROLE_PRESETS.find((p) => p.role === role);
    if (preset) {
      setSelectedPermissions(
        preset.defaultPermissions.filter((p) => isMasterAdmin || p !== 'manage_roles')
      );
    }
  };

  const handleTogglePermission = (perm: PermissionKey) => {
    if (perm === 'manage_roles' && !isMasterAdmin) return;
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const resetForm = () => {
    setEditingAssignment(null);
    setSelectedMemberId('');
    setMemberSearch('');
    setCustomName('');
    setCustomEmail('');
    setCustomPhone('');
    setSelectedRole('co_admin');
    setSelectedPermissions([...ROLE_PRESETS[0].defaultPermissions]);
    setNotes('');
  };

  const handleStartEdit = (assignment: RoleAssignment) => {
    setFormFeedback(null);
    setEditingAssignment(assignment);
    if (assignment.memberId) {
      setTargetSource('member');
      setSelectedMemberId(assignment.memberId);
      setCustomName(assignment.memberName);
      setCustomEmail(assignment.email || '');
      setCustomPhone(assignment.phone || '');
    } else {
      setTargetSource('email');
      setSelectedMemberId('');
      setCustomName(assignment.memberName);
      setCustomEmail(assignment.email || '');
      setCustomPhone(assignment.phone || '');
    }
    setSelectedRole(assignment.role === 'super_admin' ? 'co_admin' : assignment.role);
    setSelectedPermissions(assignment.permissions || []);
    setNotes(assignment.notes || '');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (selectedPermissions.length === 0) {
      setFormFeedback({
        type: 'error',
        text: isEn
          ? 'Please select at least one permission.'
          : 'እባክዎ ቢያንስ አንድ ፍቃድ (Permission) ይምረጡ።',
      });
      return;
    }

    let resolvedMemberId = '';
    let resolvedName = '';
    let resolvedPhone = '';
    let resolvedEmail = '';
    let resolvedAuthUid = editingAssignment?.authUid || '';

    if (targetSource === 'member') {
      const mem = selectedMember;
      if (!mem && !editingAssignment) {
        setFormFeedback({
          type: 'error',
          text: isEn
            ? 'Please choose a member from the list.'
            : 'እባክዎ ከዝርዝሩ ውስጥ አንድ አባል ይምረጡ።',
        });
        return;
      }
      resolvedMemberId = mem?.id || editingAssignment?.memberId || '';
      resolvedName = mem?.fullName || editingAssignment?.memberName || customName.trim();
      resolvedPhone = normalizePhoneNumber(mem?.phone || editingAssignment?.phone || '');
      resolvedEmail = customEmail.trim().toLowerCase();
      resolvedAuthUid = mem?.authUid || editingAssignment?.authUid || '';

      if (!resolvedPhone && !resolvedEmail) {
        setFormFeedback({
          type: 'error',
          text: isEn
            ? 'Selected member has no registered phone number. Enter an email address too.'
            : 'የተመረጠው አባል ስልክ ቁጥር የለውም። እባክዎ ስልክ በአባላት ዝርዝር ያስገቡ ወይም ኢሜይል ይጻፉ።',
        });
        return;
      }
    } else {
      resolvedName = customName.trim();
      resolvedEmail = customEmail.trim().toLowerCase();
      resolvedPhone = customPhone.trim() ? normalizePhoneNumber(customPhone.trim()) : '';

      if (!resolvedName) {
        setFormFeedback({
          type: 'error',
          text: isEn ? 'Full name is required.' : 'እባክዎ ሙሉ ስም ያስገቡ።',
        });
        return;
      }
      if (!resolvedEmail && !resolvedPhone) {
        setFormFeedback({
          type: 'error',
          text: isEn
            ? 'Enter a Google/Gmail email or phone number.'
            : 'እባክዎ የGoogle ኢሜይል ወይም ስልክ ቁጥር ያስገቡ።',
        });
        return;
      }
    }

    if (resolvedEmail === MASTER_ADMIN.email.toLowerCase()) {
      setFormFeedback({
        type: 'error',
        text: 'ዋናው አስተዳዳሪ (Master Admin) አስቀድሞ ሁሉንም ፍቃድ ስላለው መቀየር አያስፈልግም።',
      });
      return;
    }

    const sanitizedPerms = selectedPermissions.filter(
      (p) => isMasterAdmin || p !== 'manage_roles'
    );

    const docId =
      editingAssignment?.id ||
      buildRoleAssignmentDocId({
        memberId: resolvedMemberId || undefined,
        email: resolvedEmail || undefined,
        phone: resolvedPhone || undefined,
      });

    const authEmail = resolvedPhone
      ? getDummyEmailFromPhone(resolvedPhone).toLowerCase()
      : resolvedEmail;

    const payload: RoleAssignment = {
      id: docId,
      memberId: resolvedMemberId || undefined,
      memberName: resolvedName,
      phone: resolvedPhone || undefined,
      email: resolvedEmail || undefined,
      authEmail: authEmail || undefined,
      authUid: resolvedAuthUid || undefined,
      role: selectedRole,
      roleLabel: getRoleDisplayLabel(selectedRole, 'am'),
      permissions: sanitizedPerms,
      status: 'active',
      grantedByEmail:
        currentUserEmail || editingAssignment?.grantedByEmail || MASTER_ADMIN.email,
      grantedByName:
        currentUserName || editingAssignment?.grantedByName || MASTER_ADMIN.name,
      grantedAt: editingAssignment?.grantedAt || new Date().toISOString(),
      notes: notes.trim() || undefined,
    };

    setIsSaving(true);
    try {
      await saveRoleAssignmentToFirestore(payload);
      setFormFeedback({
        type: 'success',
        text: editingAssignment
          ? `የ ${resolvedName} ሚና እና ፍቃዶች በተሳካ ሁኔታ ተዘምነዋል።`
          : `ለ ${resolvedName} የ "${getRoleDisplayLabel(selectedRole, 'am')}" ፍቃድ በተሳካ ሁኔታ ተሰጥቷል።`,
      });
      resetForm();
    } catch (err: any) {
      console.error('[RoleManagementView] save error:', err);
      setFormFeedback({
        type: 'error',
        text:
          err?.message ||
          'ፍቃዱን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevoke = async (assignment: RoleAssignment) => {
    setBusyId(assignment.id);
    try {
      await revokeRoleAssignmentInFirestore(assignment, currentUserEmail || undefined);
      setConfirmRevokeId(null);
      setFormFeedback({
        type: 'success',
        text: `የ ${assignment.memberName} ፍቃድ ወዲያውኑ ተነስቷል።`,
      });
    } catch (err) {
      console.error('[RoleManagementView] revoke error:', err);
      setFormFeedback({
        type: 'error',
        text: 'ፍቃዱን ማንሳት አልተቻለም።',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (assignment: RoleAssignment) => {
    setBusyId(assignment.id);
    try {
      await restoreRoleAssignmentInFirestore(assignment);
      setFormFeedback({
        type: 'success',
        text: `የ ${assignment.memberName} ፍቃድ እንደገና ነቅቷል።`,
      });
    } catch (err) {
      console.error('[RoleManagementView] restore error:', err);
      setFormFeedback({
        type: 'error',
        text: 'ፍቃዱን መመለስ አልተቻለም።',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (assignment: RoleAssignment) => {
    setBusyId(assignment.id);
    try {
      await deleteRoleAssignmentFromFirestore(assignment);
      setConfirmDeleteId(null);
      if (editingAssignment?.id === assignment.id) {
        resetForm();
      }
      setFormFeedback({
        type: 'success',
        text: `የ ${assignment.memberName} የሚና መዝገብ ተሰርዟል።`,
      });
    } catch (err) {
      console.error('[RoleManagementView] delete error:', err);
      setFormFeedback({
        type: 'error',
        text: 'መዝገቡን መሰረዝ አልተቻለም።',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1B5E20] via-[#144818] to-[#1B5E20] text-white rounded-3xl p-6 sm:p-7 border-2 border-[#FFD700] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFD700] text-[#1B5E20] text-xs font-extrabold">
            <ShieldCheck className="w-4 h-4" />
            <span>የአባላት እና የአስተዳደር ሚና (Role Management)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            የተጠቃሚ ሚና እና ፍቃድ አስተዳደር (RBAC)
          </h2>
          <p className="text-xs sm:text-sm text-white/85 max-w-2xl leading-relaxed">
            ለተመረጡ አባላት ወይም የስራ ሀላፊዎች የክፍያ፣ የአባላት፣ የቅሬታ ወይም የተባባሪ አስተዳዳሪ ፍቃድ ይስጡ፤ በፈለጉት ሰዓትም በአንድ ንክኪ ያንሱ (Revoke)።
          </p>
        </div>

        {/* Protected Master Admin Card */}
        <div className="bg-black/25 border border-[#FFD700]/40 rounded-2xl p-4 min-w-[260px] space-y-1.5">
          <div className="flex items-center gap-2 text-[#FFD700] text-xs font-extrabold">
            <Crown className="w-4 h-4" />
            <span>ዋና አስተዳዳሪ (የተጠበቀ)</span>
          </div>
          <p className="text-sm font-bold text-white">{MASTER_ADMIN.name}</p>
          <p className="text-xs font-mono text-emerald-100">{MASTER_ADMIN.email}</p>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#FFD700]/90 font-semibold">
            <Lock className="w-3 h-3" />
            <span>ሁሉንም ፍቃድ ያለው · የማይነሳ</span>
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-emerald-900/15 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-neutral-500">ንቁ ፍቃድ ያላቸው</p>
            <p className="text-2xl font-extrabold text-[#1B5E20] font-mono tabular-nums mt-1">
              {activeCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-neutral-500">ፍቃዳቸው የተነሳ (Revoked)</p>
            <p className="text-2xl font-extrabold text-rose-700 font-mono tabular-nums mt-1">
              {revokedCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <Ban className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-neutral-500">ጠቅላላ የማህበሩ አባላት</p>
            <p className="text-2xl font-extrabold text-neutral-900 font-mono tabular-nums mt-1">
              {members.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* GRANT / EDIT ROLE FORM */}
      <div
        ref={formRef}
        className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-900/15 shadow-sm space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center shrink-0">
              {editingAssignment ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-neutral-900">
                {editingAssignment
                  ? `የ ${editingAssignment.memberName} ሚና እና ፍቃድ ማስተካከያ`
                  : 'አዲስ የሚና እና ፍቃድ መስጫ (Grant Role)'}
              </h3>
              <p className="text-xs text-neutral-500">
                ሰው ይምረጡ፣ ሚና ይወስኑ እና የሚፈቅዷቸውን ክፍሎች በቀላሉ ምልክት ያድርጉ።
              </p>
            </div>
          </div>

          {editingAssignment && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer self-start"
            >
              <X className="w-3.5 h-3.5" />
              <span>አርትዖት ተው (Cancel)</span>
            </button>
          )}
        </div>

        {formFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-2 ${
              formFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {formFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            )}
            <span>{formFeedback.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveRole} className="space-y-6">
          {/* Step 1: Select Person */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-neutral-800 uppercase tracking-wide">
                1. ተጠቃሚ ይምረጡ (Person to Authorize)
              </label>

              {!editingAssignment && (
                <div className="inline-flex p-1 rounded-xl bg-neutral-100 border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setTargetSource('member')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      targetSource === 'member'
                        ? 'bg-[#1B5E20] text-white shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    ከአባላት ዝርዝር
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetSource('email')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      targetSource === 'email'
                        ? 'bg-[#1B5E20] text-white shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    በGoogle ኢሜይል / አዲስ
                  </button>
                </div>
              )}
            </div>

            {targetSource === 'member' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-neutral-600 block">
                    አባል ፈልግ (በስም፣ ስልክ ወይም ID)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="ለምሳሌ፦ አህመድ፣ MEM-012፣ 0911..."
                      disabled={Boolean(editingAssignment)}
                      className="w-full text-xs bg-white border border-neutral-300 rounded-xl py-2.5 pl-9 pr-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30 disabled:opacity-60"
                    />
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-neutral-600 block">
                    አባሉን ይምረጡ ({filteredMemberOptions.length})
                  </label>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    disabled={Boolean(editingAssignment)}
                    className="w-full text-xs font-semibold bg-white border border-neutral-300 rounded-xl py-2.5 px-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30 disabled:opacity-60 cursor-pointer"
                  >
                    <option value="">-- አባል ይምረጡ --</option>
                    {filteredMemberOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} ({m.id}
                        {m.phone ? ` · ${m.phone}` : ' · ስልክ የለም'})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedMember && (
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-200 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-bold text-neutral-900">{selectedMember.fullName}</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-white border border-neutral-200 text-neutral-700">
                        {selectedMember.id}
                      </span>
                      <span className="inline-flex items-center gap-1 text-neutral-600 font-mono">
                        <Phone className="w-3.5 h-3.5 text-[#1B5E20]" />
                        {selectedMember.phone || 'ስልክ የለም'}
                      </span>
                    </div>
                    <div className="w-full sm:w-auto flex-1 max-w-xs">
                      <input
                        type="email"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        placeholder="አማራጭ Google/Gmail ኢሜይል (ካለ)"
                        className="w-full text-xs bg-white border border-neutral-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-neutral-600 block">
                    ሙሉ ስም *
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="ሙሉ ስም ያስገቡ"
                    className="w-full text-xs bg-white border border-neutral-300 rounded-xl py-2.5 px-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-neutral-600 block">
                    Google / Gmail ኢሜይል
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="example@gmail.com"
                      className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-xl py-2.5 pl-9 pr-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                    />
                    <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-neutral-600 block">
                    ስልክ ቁጥር (አማራጭ)
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="0912345678"
                      className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-xl py-2.5 pl-9 pr-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                    />
                    <Phone className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Choose Role Preset */}
          <div className="space-y-2.5">
            <label className="text-xs font-extrabold text-neutral-800 uppercase tracking-wide block">
              2. ሚና ይምረጡ (Role Preset)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ROLE_PRESETS.map((preset) => {
                const active = selectedRole === preset.role;
                return (
                  <button
                    key={preset.role}
                    type="button"
                    onClick={() => handleSelectPreset(preset.role)}
                    className={`text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer space-y-1 ${
                      active
                        ? 'border-[#1B5E20] bg-emerald-50/70 shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-extrabold ${
                          active ? 'text-[#1B5E20]' : 'text-neutral-900'
                        }`}
                      >
                        {preset.labelAm}
                      </span>
                      {active && (
                        <span className="w-5 h-5 rounded-full bg-[#1B5E20] text-[#FFD700] flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-snug">
                      {preset.descriptionAm}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Fine-Grained Permissions */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-neutral-800 uppercase tracking-wide">
                3. የሚፈቀዱ ፐርሚሽኖች (Granular Permissions)
              </label>
              <span className="text-[11px] font-bold text-[#1B5E20] bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                {selectedPermissions.length} / {ALL_PERMISSIONS.length} ተመርጠዋል
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_PERMISSIONS.map((perm) => {
                const checked = selectedPermissions.includes(perm.key);
                const disabled = perm.key === 'manage_roles' && !isMasterAdmin;
                return (
                  <label
                    key={perm.key}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      disabled
                        ? 'opacity-55 cursor-not-allowed bg-neutral-50 border-neutral-200'
                        : checked
                        ? 'bg-emerald-50/60 border-emerald-400 cursor-pointer'
                        : 'bg-white border-neutral-200 hover:border-neutral-300 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => handleTogglePermission(perm.key)}
                      className="mt-0.5 w-4 h-4 accent-[#1B5E20] rounded cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-900">{perm.labelAm}</p>
                      <p className="text-[11px] text-neutral-500 leading-snug mt-0.5">
                        {perm.descriptionAm}
                        {disabled && ' (በዋና አስተዳዳሪ ብቻ የሚሰጥ)'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes & Submit */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2 border-t border-neutral-100">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] font-bold text-neutral-600 block">
                ማስታወሻ (አማራጭ)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ለምሳሌ፦ የወርሃዊ ክፍያ መዝገብ እንዲያስተካክል የተፈቀደለት"
                className="w-full text-xs bg-neutral-50 border border-neutral-300 rounded-xl py-2.5 px-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl bg-[#1B5E20] hover:bg-[#144818] text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFD700]" />
              <span>
                {isSaving
                  ? 'በማስቀመጥ ላይ...'
                  : editingAssignment
                  ? 'ለውጡን አስቀምጥ (Update Role)'
                  : 'ፍቃድ ስጥ (Grant Role)'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* ROLE ASSIGNMENTS DIRECTORY */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-900/15 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-neutral-900">
              ፍቃድ የተሰጣቸው ሰዎች ዝርዝር ({filteredAssignments.length})
            </h3>
            <p className="text-xs text-neutral-500">
              ፍቃድ ሲያነሱ (Revoke) ወዲያውኑ የተጠቃሚው የአስተዳዳሪ ክፍሎች ይዘጋሉ።
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-neutral-100 border border-neutral-200 text-xs font-bold">
              {(
                [
                  { id: 'all', label: `ሁሉም (${assignments.length})` },
                  { id: 'active', label: `ንቁ (${activeCount})` },
                  { id: 'revoked', label: `የተነሱ (${revokedCount})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStatusFilter(t.id)}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === t.id
                      ? 'bg-[#1B5E20] text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="በስም፣ ስልክ ወይም ኢሜይል ፈልግ..."
                className="text-xs bg-neutral-50 border border-neutral-300 rounded-xl py-2 pl-8 pr-3 outline-none focus:ring-2 focus:ring-[#1B5E20]/30 w-56"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-10 text-center text-xs text-neutral-500">
            የሚና መዝገቦች በመጫን ላይ ናቸው...
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="py-12 text-center space-y-2 border-2 border-dashed border-neutral-200 rounded-2xl">
            <ShieldCheck className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="text-sm font-bold text-neutral-700">
              እስካሁን ፍቃድ የተሰጠው ሌላ ሰው የለም።
            </p>
            <p className="text-xs text-neutral-500">
              ከላይ ያለውን ቅጽ በመጠቀም ለአባላት ወይም ለአመራሮች ሚና መስጠት ይችላሉ።
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssignments.map((a) => {
              const isActive = a.status === 'active';
              const isBusy = busyId === a.id;
              return (
                <div
                  key={a.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3 ${
                    isActive
                      ? 'bg-white border-emerald-900/15 hover:border-emerald-300'
                      : 'bg-neutral-50/80 border-rose-200/80'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Person & Status */}
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl font-extrabold flex items-center justify-center text-sm shrink-0 ${
                          isActive
                            ? 'bg-[#1B5E20] text-[#FFD700]'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {a.memberName.charAt(0)}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-neutral-900">
                            {a.memberName}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isActive ? 'ንቁ (Active)' : 'ፍቃዱ ተነስቷል (Revoked)'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-950 text-[11px] font-bold">
                            {getRoleDisplayLabel(a.role, 'am')}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                          {a.memberId && (
                            <span className="font-mono font-semibold text-neutral-700">
                              ID: {a.memberId}
                            </span>
                          )}
                          {a.phone && (
                            <span className="font-mono inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {a.phone}
                            </span>
                          )}
                          {a.email && (
                            <span className="font-mono inline-flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {a.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStartEdit(a)}
                        className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>አስተካክል</span>
                      </button>

                      {isActive ? (
                        confirmRevokeId === a.id ? (
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
                            <span className="text-[11px] font-bold text-rose-900">
                              ይነሳ?
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRevoke(a)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? '...' : 'አዎ አንሳ'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeId(null)}
                              className="px-2 py-1 rounded-lg bg-white text-neutral-700 text-[11px] font-semibold cursor-pointer border border-neutral-200"
                            >
                              ተወው
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setConfirmRevokeId(a.id);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>ፍቃድ አንሳ (Revoke)</span>
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRestore(a)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>መልሰህ ፍቀድ</span>
                          </button>

                          {confirmDeleteId === a.id ? (
                            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
                              <span className="text-[11px] font-bold text-rose-900">
                                ይሰረዝ?
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDelete(a)}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                አዎ አጥፋ
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded-lg bg-white text-neutral-700 text-[11px] font-semibold cursor-pointer border border-neutral-200"
                              >
                                ተወው
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setConfirmRevokeId(null);
                                setConfirmDeleteId(a.id);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-neutral-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>አጥፋ</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Permission Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-neutral-100">
                    {a.permissions.map((permKey) => {
                      const def = ALL_PERMISSIONS.find((p) => p.key === permKey);
                      return (
                        <span
                          key={permKey}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            isActive
                              ? 'bg-emerald-50/70 text-emerald-900 border-emerald-200/80'
                              : 'bg-neutral-100 text-neutral-500 border-neutral-200 line-through'
                          }`}
                        >
                          {def ? def.labelAm : permKey}
                        </span>
                      );
                    })}
                  </div>

                  {/* Notes & Audit Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
                    <span>
                      የሰጠው፡ {a.grantedByName || a.grantedByEmail} ·{' '}
                      {a.grantedAt ? new Date(a.grantedAt).toLocaleDateString('am-ET') : ''}
                      {a.notes ? ` · ማስታወሻ፡ ${a.notes}` : ''}
                    </span>
                    {!isActive && a.revokedAt && (
                      <span className="text-rose-700 font-semibold">
                        የተነሳበት ቀን፡ {new Date(a.revokedAt).toLocaleString('am-ET')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

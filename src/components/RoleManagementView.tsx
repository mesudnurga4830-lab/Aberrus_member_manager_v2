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
      <div className="bg-gradient-to-r from-[#155544] via-[#517DA2] to-[#83257B] text-white rounded-3xl p-6 sm:p-7 border-2 border-[#5A8FBB] shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white text-[#155544] text-xs font-extrabold shadow-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>የአባላት እና የአስተዳደር ሚና (Role Management)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            የተጠቃሚ ሚና እና ፍቃድ አስተዳደር (RBAC)
          </h2>
          <p className="text-xs sm:text-sm text-white font-semibold max-w-2xl leading-relaxed">
            ለተመረጡ አባላት ወይም የስራ ሀላፊዎች የክፍያ፣ የአባላት፣ የቅሬታ ወይም የተባባሪ አስተዳዳሪ ፍቃድ ይስጡ፤ በፈለጉት ሰዓትም በአንድ ንክኪ ያንሱ (Revoke)።
          </p>
        </div>

        {/* Protected Master Admin Card */}
        <div className="bg-[#155544]/90 border-2 border-[#5A8FBB] rounded-2xl p-4 min-w-[260px] space-y-1.5 shadow-sm">
          <div className="flex items-center gap-2 text-[#1DAB61] text-xs font-extrabold">
            <Crown className="w-4 h-4" />
            <span>ዋና አስተዳዳሪ (የተጠበቀ)</span>
          </div>
          <p className="text-sm font-extrabold text-white">{MASTER_ADMIN.name}</p>
          <p className="text-xs font-mono font-bold text-white">{MASTER_ADMIN.email}</p>
          <span className="inline-flex items-center gap-1 text-[11px] text-white font-bold bg-[#83257B] px-2.5 py-0.5 rounded-md">
            <Lock className="w-3 h-3" />
            <span>ሁሉንም ፍቃድ ያለው · የማይነሳ</span>
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border-2 border-[#417E38]/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-[#155544]">ንቁ ፍቃድ ያላቸው</p>
            <p className="text-2xl font-extrabold text-[#155544] font-mono tabular-nums mt-1">
              {activeCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border-2 border-[#83257B]/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-[#83257B]">ፍቃዳቸው የተነሳ (Revoked)</p>
            <p className="text-2xl font-extrabold text-[#83257B] font-mono tabular-nums mt-1">
              {revokedCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <Ban className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border-2 border-[#517DA2]/45 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-[#517DA2]">ጠቅላላ የማህበሩ አባላት</p>
            <p className="text-2xl font-extrabold text-[#0F2438] font-mono tabular-nums mt-1">
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
        className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#5A8FBB]/50 shadow-sm space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-[#5A8FBB]/25">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center shrink-0">
              {editingAssignment ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-[#155544]">
                {editingAssignment
                  ? `የ ${editingAssignment.memberName} ሚና እና ፍቃድ ማስተካከያ`
                  : 'አዲስ የሚና እና ፍቃድ መስጫ (Grant Role)'}
              </h3>
              <p className="text-xs font-semibold text-neutral-800">
                ሰው ይምረጡ፣ ሚና ይወስኑ እና የሚፈቅዷቸውን ክፍሎች በቀላሉ ምልክት ያድርጉ።
              </p>
            </div>
          </div>

          {editingAssignment && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded-xl bg-[#83257B] hover:bg-[#6E1D67] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer self-start"
            >
              <X className="w-3.5 h-3.5" />
              <span>አርትዖት ተው (Cancel)</span>
            </button>
          )}
        </div>

        {formFeedback && (
          <div
            className={`p-3.5 rounded-2xl border-2 text-xs font-extrabold flex items-start gap-2 ${
              formFeedback.type === 'success'
                ? 'bg-[#1DAB61]/15 border-[#417E38] text-[#155544]'
                : 'bg-[#83257B]/10 border-[#83257B] text-[#83257B]'
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
              <label className="text-xs font-extrabold text-[#155544] uppercase tracking-wide">
                1. ተጠቃሚ ይምረጡ (Person to Authorize)
              </label>

              {!editingAssignment && (
                <div className="inline-flex p-1 rounded-xl bg-[#5A8FBB]/15 border border-[#5A8FBB]/40">
                  <button
                    type="button"
                    onClick={() => setTargetSource('member')}
                    className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      targetSource === 'member'
                        ? 'bg-[#155544] text-white shadow-2xs'
                        : 'text-[#0F2438] hover:text-[#155544]'
                    }`}
                  >
                    ከአባላት ዝርዝር
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetSource('email')}
                    className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      targetSource === 'email'
                        ? 'bg-[#517DA2] text-white shadow-2xs'
                        : 'text-[#0F2438] hover:text-[#517DA2]'
                    }`}
                  >
                    በGoogle ኢሜይል / አዲስ
                  </button>
                </div>
              )}
            </div>

            {targetSource === 'member' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl bg-[#5A8FBB]/10 border border-[#5A8FBB]/40">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-[#155544] block">
                    አባል ፈልግ (በስም፣ ስልክ ወይም ID)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="ለምሳሌ፦ አህመድ፣ MEM-012፣ 0911..."
                      disabled={Boolean(editingAssignment)}
                      className="w-full text-xs font-bold bg-white border border-[#517DA2]/50 rounded-xl py-2.5 pl-9 pr-3 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40 disabled:opacity-60"
                    />
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-[#155544] block">
                    አባሉን ይምረጡ ({filteredMemberOptions.length})
                  </label>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    disabled={Boolean(editingAssignment)}
                    className="w-full text-xs font-bold bg-white border border-[#517DA2]/50 rounded-xl py-2.5 px-3 text-neutral-900 outline-none focus:ring-2 focus:ring-[#1DAB61]/40 disabled:opacity-60 cursor-pointer"
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
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#5A8FBB]/35 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-extrabold text-neutral-950">{selectedMember.fullName}</span>
                      <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-[#155544] text-white">
                        {selectedMember.id}
                      </span>
                      <span className="inline-flex items-center gap-1 text-neutral-900 font-bold font-mono">
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
                        className="w-full text-xs font-semibold bg-white border border-[#517DA2]/50 rounded-lg px-3 py-1.5 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#5A8FBB]/10 border border-[#5A8FBB]/40">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-[#155544] block">
                    ሙሉ ስም *
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="ሙሉ ስም ያስገቡ"
                    className="w-full text-xs font-bold bg-white border border-[#517DA2]/50 rounded-xl py-2.5 px-3 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-[#155544] block">
                    Google / Gmail ኢሜይል
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="example@gmail.com"
                      className="w-full text-xs font-mono font-bold bg-white border border-[#517DA2]/50 rounded-xl py-2.5 pl-9 pr-3 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40"
                    />
                    <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-[#155544] block">
                    ስልክ ቁጥር (አማራጭ)
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="0912345678"
                      className="w-full text-xs font-mono font-bold bg-white border border-[#517DA2]/50 rounded-xl py-2.5 pl-9 pr-3 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40"
                    />
                    <Phone className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Choose Role Preset */}
          <div className="space-y-2.5">
            <label className="text-xs font-extrabold text-[#517DA2] uppercase tracking-wide block">
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
                        ? 'border-[#155544] bg-[#1DAB61]/15 shadow-xs'
                        : 'border-[#5A8FBB]/40 bg-white hover:border-[#517DA2]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-extrabold ${
                          active ? 'text-[#155544]' : 'text-neutral-950'
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
                    <p className="text-[11px] font-semibold text-neutral-800 leading-snug">
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
              <label className="text-xs font-extrabold text-[#83257B] uppercase tracking-wide">
                3. የሚፈቀዱ ፐርሚሽኖች (Granular Permissions)
              </label>
              <span className="text-[11px] font-extrabold text-white bg-[#417E38] px-2.5 py-0.5 rounded-lg">
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
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all ${
                      disabled
                        ? 'opacity-65 cursor-not-allowed bg-neutral-100 border-neutral-300'
                        : checked
                        ? 'bg-[#1DAB61]/12 border-[#417E38] cursor-pointer'
                        : 'bg-white border-[#5A8FBB]/40 hover:border-[#517DA2] cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => handleTogglePermission(perm.key)}
                      className="mt-0.5 w-4 h-4 accent-[#155544] rounded cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-neutral-950">{perm.labelAm}</p>
                      <p className="text-[11px] font-semibold text-neutral-800 leading-snug mt-0.5">
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
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-3 border-t-2 border-[#5A8FBB]/25">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] font-extrabold text-[#155544] block">
                ማስታወሻ (አማራጭ)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ለምሳሌ፦ የወርሃዊ ክፍያ መዝገብ እንዲያስተካክል የተፈቀደለት"
                className="w-full text-xs font-semibold bg-[#5A8FBB]/10 border border-[#517DA2]/45 rounded-xl py-2.5 px-3 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl bg-[#155544] hover:bg-[#417E38] text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
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
      <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#517DA2]/45 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b-2 border-[#517DA2]/25">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-[#155544]">
              ፍቃድ የተሰጣቸው ሰዎች ዝርዝር ({filteredAssignments.length})
            </h3>
            <p className="text-xs font-semibold text-neutral-800">
              ፍቃድ ሲያነሱ (Revoke) ወዲያውኑ የተጠቃሚው የአስተዳዳሪ ክፍሎች ይዘጋሉ።
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-[#5A8FBB]/15 border border-[#5A8FBB]/40 text-xs font-extrabold">
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
                      ? t.id === 'revoked'
                        ? 'bg-[#83257B] text-white shadow-2xs'
                        : 'bg-[#155544] text-white shadow-2xs'
                      : 'text-[#0F2438] hover:text-[#155544]'
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
                className="text-xs font-semibold bg-[#5A8FBB]/10 border border-[#517DA2]/50 rounded-xl py-2 pl-8 pr-3 text-neutral-900 placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-[#1DAB61]/40 w-56"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-[#83257B]/10 border-2 border-[#83257B] text-xs font-bold text-[#83257B] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-10 text-center text-xs font-bold text-[#155544]">
            የሚና መዝገቦች በመጫን ላይ ናቸው...
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="py-12 text-center space-y-2 border-2 border-dashed border-[#5A8FBB]/50 rounded-2xl bg-[#5A8FBB]/5">
            <ShieldCheck className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="text-sm font-extrabold text-[#155544]">
              እስካሁን ፍቃድ የተሰጠው ሌላ ሰው የለም።
            </p>
            <p className="text-xs font-semibold text-neutral-800">
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
                  className={`p-4 sm:p-5 rounded-2xl border-2 transition-all space-y-3 ${
                    isActive
                      ? 'bg-white border-[#417E38]/40 hover:border-[#1DAB61]'
                      : 'bg-[#83257B]/5 border-[#83257B]/40'
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
                          <span className="font-extrabold text-sm text-neutral-950">
                            {a.memberName}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                              isActive
                                ? 'bg-[#1DAB61]/20 text-[#155544] border border-[#417E38]/40'
                                : 'bg-[#83257B] text-white'
                            }`}
                          >
                            {isActive ? 'ንቁ (Active)' : 'ፍቃዱ ተነስቷል (Revoked)'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-[#517DA2] text-white text-[11px] font-extrabold">
                            {getRoleDisplayLabel(a.role, 'am')}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-neutral-800">
                          {a.memberId && (
                            <span className="font-mono font-extrabold text-[#155544]">
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
                        className="px-3 py-1.5 rounded-xl bg-[#5A8FBB]/20 hover:bg-[#517DA2] text-[#0F2438] hover:text-white border border-[#517DA2]/40 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>አስተካክል</span>
                      </button>

                      {isActive ? (
                        confirmRevokeId === a.id ? (
                          <div className="inline-flex items-center gap-1.5 bg-[#83257B]/10 border-2 border-[#83257B] px-2.5 py-1 rounded-xl">
                            <span className="text-[11px] font-extrabold text-[#83257B]">
                              ይነሳ?
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRevoke(a)}
                              className="px-2.5 py-1 rounded-lg bg-[#83257B] hover:bg-[#6E1D67] text-white text-[11px] font-extrabold cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? '...' : 'አዎ አንሳ'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeId(null)}
                              className="px-2 py-1 rounded-lg bg-white text-neutral-900 text-[11px] font-bold cursor-pointer border border-neutral-300"
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
                            className="px-3 py-1.5 rounded-xl bg-[#83257B]/10 hover:bg-[#83257B] text-[#83257B] hover:text-white border border-[#83257B]/40 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
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
                            className="px-3 py-1.5 rounded-xl bg-[#417E38] hover:bg-[#155544] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>መልሰህ ፍቀድ</span>
                          </button>

                          {confirmDeleteId === a.id ? (
                            <div className="inline-flex items-center gap-1.5 bg-[#83257B]/10 border-2 border-[#83257B] px-2.5 py-1 rounded-xl">
                              <span className="text-[11px] font-extrabold text-[#83257B]">
                                ይሰረዝ?
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDelete(a)}
                                className="px-2.5 py-1 rounded-lg bg-[#83257B] hover:bg-[#6E1D67] text-white text-[11px] font-extrabold cursor-pointer"
                              >
                                አዎ አጥፋ
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded-lg bg-white text-neutral-900 text-[11px] font-bold cursor-pointer border border-neutral-300"
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
                              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#83257B] text-[#83257B] hover:text-white border border-[#83257B]/40 text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors"
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
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#5A8FBB]/25">
                    {a.permissions.map((permKey) => {
                      const def = ALL_PERMISSIONS.find((p) => p.key === permKey);
                      return (
                        <span
                          key={permKey}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            isActive
                              ? 'bg-[#1DAB61]/15 text-[#155544] border-[#417E38]/40'
                              : 'bg-neutral-100 text-neutral-700 border-neutral-300 line-through'
                          }`}
                        >
                          {def ? def.labelAm : permKey}
                        </span>
                      );
                    })}
                  </div>

                  {/* Notes & Audit Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-neutral-800">
                    <span>
                      የሰጠው፡ <strong className="text-[#155544]">{a.grantedByName || a.grantedByEmail}</strong> ·{' '}
                      {a.grantedAt ? new Date(a.grantedAt).toLocaleDateString('am-ET') : ''}
                      {a.notes ? ` · ማስታወሻ፡ ${a.notes}` : ''}
                    </span>
                    {!isActive && a.revokedAt && (
                      <span className="text-[#83257B] font-extrabold">
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

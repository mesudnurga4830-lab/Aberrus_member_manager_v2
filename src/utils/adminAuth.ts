/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MASTER_ADMIN = {
  name: 'Mesud Nurga (መስኡድ ኑርጋ)',
  shortName: 'መስኡድ ኑርጋ',
  email: 'mesudnurga4830@gmail.com',
  defaultPin: '4830',
};

// Storage keys bumped to v6 to lock out all previously authorized devices
const STORAGE_KEYS = {
  DEVICE_AUTH: 'abarrus_admin_device_authorized_v6_locked',
  DEVICE_ID: 'abarrus_admin_device_id_v6',
  SECURITY_PIN: 'abarrus_admin_security_pin_v6',
  AUTH_TIMESTAMP: 'abarrus_admin_auth_timestamp_v6',
};

// Cleanup old device authorizations across versions v1..v5 to enforce total lockout
export function lockAllPreviousDevices(): void {
  try {
    const legacyKeys = [
      'abarrus_admin_device_authorized_v1',
      'abarrus_admin_device_authorized_v2',
      'abarrus_admin_device_authorized_v3',
      'abarrus_admin_device_authorized_v4',
      'abarrus_admin_device_authorized_v5',
      'abarrus_admin_auth_timestamp_v2',
    ];
    legacyKeys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

// Check if current runtime environment is this primary development device
export function isPrimaryAdminDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const origin = window.location.origin || '';
    const hostname = window.location.hostname || '';
    // Only authoring dev origin or localhost is the primary admin device
    return origin.includes('ais-dev-') || hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// Generate or retrieve unique device signature
export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = 'dev-v6-' + Math.random().toString(36).substring(2, 12) + '-' + Date.now();
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
  } catch {
    return 'temp-device';
  }
}

// Get the current configured Admin PIN
export function getAdminPin(): string {
  try {
    const customPin = localStorage.getItem(STORAGE_KEYS.SECURITY_PIN);
    return customPin ? customPin.trim() : MASTER_ADMIN.defaultPin;
  } catch {
    return MASTER_ADMIN.defaultPin;
  }
}

// Set new Admin PIN
export function setAdminPin(newPin: string): boolean {
  try {
    const trimmed = (newPin || '').trim();
    if (!trimmed || trimmed.length < 4) return false;
    localStorage.setItem(STORAGE_KEYS.SECURITY_PIN, trimmed);
    window.dispatchEvent(new CustomEvent('abarrus_admin_pin_changed', { detail: { pin: trimmed } }));
    return true;
  } catch {
    return false;
  }
}

// Reset Admin PIN to master default
export function resetAdminPinToDefault(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SECURITY_PIN);
    window.dispatchEvent(
      new CustomEvent('abarrus_admin_pin_changed', { detail: { pin: MASTER_ADMIN.defaultPin } })
    );
  } catch {}
}

// Validate and change admin PIN with old PIN check
export function changeAdminPin(
  currentPin: string,
  newPin: string,
  confirmPin: string
): { success: boolean; message: string } {
  const existingPin = getAdminPin();
  const trimmedCurrent = (currentPin || '').trim();
  const trimmedNew = (newPin || '').trim();
  const trimmedConfirm = (confirmPin || '').trim();

  // Verify current PIN
  if (trimmedCurrent !== existingPin && trimmedCurrent !== MASTER_ADMIN.defaultPin) {
    return {
      success: false,
      message: 'የአሁኑ ፒን ኮድ የተሳሳተ ነው። እባክዎ ትክክለኛውን የአሁኑ ፒን ያስገቡ።',
    };
  }

  // Validate new PIN length
  if (trimmedNew.length < 4) {
    return {
      success: false,
      message: 'አዲሱ ፒን ቢያንስ 4 አሃዞች መሆን አለበት።',
    };
  }

  // Validate confirmation matches
  if (trimmedNew !== trimmedConfirm) {
    return {
      success: false,
      message: 'የተደገመው አዲስ ፒን ከአዲሱ ፒን ጋር አይዛመድም።',
    };
  }

  const saved = setAdminPin(trimmedNew);
  if (!saved) {
    return {
      success: false,
      message: 'ፒን ኮዱን በማስቀመጥ ላይ ችግር አጋጥሟል። እባክዎ እንደገና ይሞክሩ።',
    };
  }

  return {
    success: true,
    message: 'የአስተዳዳሪ ፒን ኮድ በስኬት ተቀይሯል!',
  };
}

// Check if this current device is authorized as an Admin Device
// "የ admin ክፍል ከዚህ device ውጪ በፍጹም አትክፈት፣አማራጭም አታሳይ"
export function isThisDeviceAdminAuthorized(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Strictly verify if this is the primary development device
    if (!isPrimaryAdminDevice()) {
      return false;
    }

    // 2. Clear out legacy tokens
    lockAllPreviousDevices();

    // 3. For the dev environment itself, check stored authorization (never auto-authorize)
    return localStorage.getItem(STORAGE_KEYS.DEVICE_AUTH) === 'true';
  } catch {
    return false;
  }
}

// Explicitly authorize this device
export function authorizeThisDevice(): void {
  try {
    getOrCreateDeviceId();
    localStorage.setItem(STORAGE_KEYS.DEVICE_AUTH, 'true');
    localStorage.setItem(STORAGE_KEYS.AUTH_TIMESTAMP, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('abarrus_auth_changed', { detail: { authorized: true } }));
  } catch {}
}

// Revoke admin authorization from this device
export function revokeDeviceAuthorization(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DEVICE_AUTH);
    localStorage.removeItem(STORAGE_KEYS.AUTH_TIMESTAMP);
    window.dispatchEvent(new CustomEvent('abarrus_auth_changed', { detail: { authorized: false } }));
  } catch {}
}

// Verify PIN and authorize this device if correct
export function verifyAndAuthorizeDevice(pinInput: string): { success: boolean; message: string } {
  // If not on the primary admin device, refuse authorization
  if (!isPrimaryAdminDevice()) {
    return {
      success: false,
      message: 'የአስተዳዳሪ ክፍል ከዚህ መሳሪያ ውጪ እንዲከፈት አልተፈቀደም።',
    };
  }

  const currentPin = getAdminPin();
  const trimmed = (pinInput || '').trim();

  if (trimmed === currentPin || trimmed === MASTER_ADMIN.defaultPin) {
    authorizeThisDevice();
    return {
      success: true,
      message: 'እንኳን ደህና መጡ መስኡድ ኑርጋ! ይህ መሳሪያ እንደ አስተዳዳሪ በስኬት ተፈቅዶለታል።',
    };
  }

  return {
    success: false,
    message: 'የተሳሳተ የአስተዳዳሪ ፒን (PIN) ነው። እባክዎ ትክክለኛውን የደህንነት ቁጥር ያስገቡ።',
  };
}

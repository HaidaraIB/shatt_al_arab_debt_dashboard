import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, type UserProfile } from './firebase';

type ProfileSnapshot = {
  uid: string;
  profile: UserProfile | null;
};

export function useUserProfile(uid: string | undefined) {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);

  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setSnapshot({
          uid,
          profile: snap.exists() ? (snap.data() as UserProfile) : null,
        });
      },
      () => {
        setSnapshot({ uid, profile: null });
      }
    );

    return unsub;
  }, [uid]);

  const profile = uid && snapshot?.uid === uid ? snapshot.profile : null;
  const profileLoading = Boolean(uid) && snapshot?.uid !== uid;

  return { profile, profileLoading };
}

export function isProfileActive(profile: UserProfile | null): profile is UserProfile {
  return profile !== null && profile.active === true;
}

export function isAdmin(profile: UserProfile | null): boolean {
  return isProfileActive(profile) && profile.role === 'admin';
}

export function isLawyer(profile: UserProfile | null): boolean {
  return isProfileActive(profile) && profile.role === 'lawyer';
}

export function isSupervisor(profile: UserProfile | null): boolean {
  return isProfileActive(profile) && profile.role === 'supervisor';
}

export function canViewAllCustomers(profile: UserProfile | null): boolean {
  return isAdmin(profile) || isSupervisor(profile);
}

export function canManageCustomers(profile: UserProfile | null): boolean {
  return canViewAllCustomers(profile);
}

export function canDeleteCustomers(profile: UserProfile | null): boolean {
  return isAdmin(profile);
}

export function canRecordPayments(profile: UserProfile | null): boolean {
  return isAdmin(profile);
}

export function canManageSettings(profile: UserProfile | null): boolean {
  return isAdmin(profile);
}

export function canManageUsers(profile: UserProfile | null): boolean {
  return isAdmin(profile);
}

/** Read user list to populate lawyer names in customer forms (no user management). */
export function canViewLawyerDirectory(profile: UserProfile | null): boolean {
  return isAdmin(profile) || isSupervisor(profile);
}

export function canUpdateStatus(profile: UserProfile | null): boolean {
  return isAdmin(profile) || isSupervisor(profile) || isLawyer(profile);
}

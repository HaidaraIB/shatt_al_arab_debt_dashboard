import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { db, type UserProfile, type UserRole } from './firebase';

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string;
  role: UserRole;
  active: boolean;
}

export interface UpdateUserInput {
  displayName?: string;
  role: UserRole;
  active: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function emailAlreadyUsed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const q = query(collection(db, 'users'), where('email', '==', normalized));
  const snap = await getDocs(q);
  return !snap.empty;
}

/** Creates Firebase Auth user + Firestore profile without signing out the admin. */
export async function adminCreateUser(input: CreateUserInput): Promise<string> {
  const email = normalizeEmail(input.email);
  if (input.password.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  }
  if (input.role === 'lawyer' && !input.displayName?.trim()) {
    throw new Error('الاسم مطلوب لحساب المحامي');
  }
  if (await emailAlreadyUsed(email)) {
    throw new Error('البريد الإلكتروني مستخدم مسبقاً');
  }

  let secondaryApp: FirebaseApp | undefined;
  try {
    secondaryApp = initializeApp(firebaseConfig, `AdminCreateUser_${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      input.password
    );
    const uid = credential.user.uid;

    const name = input.displayName?.trim() || '';
    const profile: UserProfile = {
      role: input.role,
      email,
      displayName: name,
      lawyerName: input.role === 'lawyer' ? name : '',
      active: input.active,
      createdAt: serverTimestamp() as UserProfile['createdAt'],
    };

    await setDoc(doc(db, 'users', uid), profile);
    return uid;
  } finally {
    if (secondaryApp) {
      await deleteApp(secondaryApp);
    }
  }
}

export async function adminUpdateUser(
  uid: string,
  input: UpdateUserInput
): Promise<void> {
  if (input.role === 'lawyer' && !input.displayName?.trim()) {
    throw new Error('الاسم مطلوب لحساب المحامي');
  }

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    throw new Error('المستخدم غير موجود');
  }
  const current = snap.data() as UserProfile;

  const name = input.displayName?.trim() || '';
  await updateDoc(doc(db, 'users', uid), {
    role: input.role,
    displayName: name,
    lawyerName: input.role === 'lawyer' ? name : '',
    active: input.active,
    email: current.email,
    createdAt: current.createdAt,
  });
}

function mapIdentityToolkitError(message: string | undefined): string {
  if (!message) return 'فشل تحديث كلمة المرور';
  if (message.includes('WEAK_PASSWORD') || message.includes('PASSWORD')) {
    return 'كلمة المرور ضعيفة (6 أحرف على الأقل)';
  }
  if (message.includes('USER_NOT_FOUND')) {
    return 'المستخدم غير موجود في المصادقة';
  }
  return 'فشل تحديث كلمة المرور';
}

/** Sets a user's Auth password without signing out the admin (Identity Toolkit REST). */
export async function adminSetUserPassword(uid: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  }

  const apiKey = (firebaseConfig as { apiKey: string }).apiKey;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localId: uid,
        password: newPassword,
        returnSecureToken: false,
      }),
    }
  );

  const data = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(mapIdentityToolkitError(data.error?.message));
  }
}

export function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'البريد الإلكتروني غير صالح';
    case 'auth/user-disabled':
      return 'تم تعطيل هذا الحساب';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'البريد أو كلمة المرور غير صحيحة';
    case 'auth/email-already-in-use':
      return 'البريد الإلكتروني مستخدم مسبقاً';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة (6 أحرف على الأقل)';
    case 'auth/too-many-requests':
      return 'محاولات كثيرة، حاول لاحقاً';
    default:
      return 'فشل تسجيل الدخول';
  }
}

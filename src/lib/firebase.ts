import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  Timestamp,
  arrayUnion,
  setDoc,
  getDoc,
  arrayRemove,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export { arrayUnion, setDoc, getDoc, arrayRemove };

export type UserRole = 'admin' | 'lawyer';

export interface UserProfile {
  role: UserRole;
  email: string;
  displayName?: string;
  lawyerName?: string;
  active: boolean;
  createdAt?: Timestamp;
}

export type LegalStatus = 'none' | 'notified' | 'warned' | 'lawsuit';

export interface StatusHistoryEntry {
  status: LegalStatus;
  notes?: string;
  updatedBy: string;
  timestamp: string | Timestamp;
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  unitNumber: string;
  delayedInstallments: number;
  remainingBalance: number;
  lastInstallmentDate?: string;
  lastInstallmentAmount?: number;
  legalStatus: LegalStatus;
  lawyerName?: string;
  lastContactNotes?: string;
  statusHistory?: StatusHistoryEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Payment {
  id?: string;
  amount: number;
  paidAt: string;
  notes?: string;
  recordedBy: string;
  createdAt?: Timestamp;
}

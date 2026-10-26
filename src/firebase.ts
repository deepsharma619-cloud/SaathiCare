import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  disableNetwork,
  doc,
  getDocFromServer,
  getFirestore,
  setLogLevel,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { FirestoreErrorInfo, OperationType } from './types/domain';
import { maskPiiEmail } from './utils/bookingRules';

// Prevent internal @firebase/firestore connection/token-refresh retries from emitting uncaught console.error logs
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const BOOTSTRAPPED_ADMIN_EMAIL = 'deepsharma619@gmail.com';

let offlineFallbackMode = false;

export function isOfflineModeActive(): boolean {
  return offlineFallbackMode;
}

export function isTokenServiceDisabledError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('token-service-api') ||
    lower.includes('securetoken.googleapis.com') ||
    lower.includes('fetching auth token failed')
  );
}

export function markOfflineModeActive(error?: unknown): void {
  if (!offlineFallbackMode) {
    offlineFallbackMode = true;
    if (!error || isTokenServiceDisabledError(error)) {
      disableNetwork(db).catch(() => {
        // Ignore network disable errors when already offline
      });
    }
  }
}

export function isFirestoreOfflineOrTokenError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('the client is offline') ||
    lower.includes('client is offline') ||
    lower.includes('token-service-api') ||
    lower.includes('securetoken.googleapis.com') ||
    lower.includes('fetching auth token failed') ||
    lower.includes('could not reach cloud firestore backend') ||
    lower.includes('network-request-failed') ||
    lower.includes('unavailable') ||
    lower.includes('firestore_timeout')
  );
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isTokenServiceDisabledError(error)) {
      markOfflineModeActive(error);
    }
  }
}

testConnection();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isFirestoreOfflineOrTokenError(error)) {
    if (isTokenServiceDisabledError(error)) {
      markOfflineModeActive(error);
    }
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: maskPiiEmail(auth.currentUser?.email),
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: maskPiiEmail(provider.email),
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function withFirestoreWriteFallback<T>(
  operation: () => Promise<T>,
  operationType: OperationType,
  path: string
): Promise<boolean> {
  if (offlineFallbackMode) {
    return false;
  }
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 8000)
      ),
    ]);
    return true;
  } catch (err) {
    if (isFirestoreOfflineOrTokenError(err)) {
      if (isTokenServiceDisabledError(err)) {
        markOfflineModeActive(err);
      }
      return false;
    }
    handleFirestoreError(err, operationType, path);
    return false;
  }
}

export function formatTimestampField(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'seconds' in val &&
    typeof (val as { seconds: number }).seconds === 'number'
  ) {
    return new Date((val as { seconds: number }).seconds * 1000).toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}


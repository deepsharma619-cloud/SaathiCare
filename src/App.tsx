import React, { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  formatTimestampField,
  googleProvider,
  handleFirestoreError,
  isFirestoreOfflineOrTokenError,
  isOfflineModeActive,
  markOfflineModeActive,
  withFirestoreWriteFallback,
} from './firebase';
import {
  BookingEventRecord,
  BookingRecord,
  BookingStatus,
  DurationHours,
  FamilyLink,
  FamilyLinkStatus,
  HelperAvailability,
  HelperProfile,
  HelperVerificationStatus,
  IncidentCategory,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  OperationType,
  PaymentStatus,
  ReviewRecord,
  SeniorProfile,
  ServiceType,
  SystemConfig,
  UserProfile,
  UserRole,
  DayOfWeek,
} from './types/domain';
import {
  DEFAULT_SYSTEM_CONFIG,
  generateBookingReference,
  INITIAL_HELPER_AVAILABILITIES,
  INITIAL_VERIFIED_HELPERS,
  selectAvailableHelperForBooking,
  validateBookingCreationInput,
  validateBookingTransition,
  validateFamilyLinkTransition,
  validateHelperVerificationUpdate,
} from './utils/bookingRules';
import { ActiveTab, Navbar } from './components/Navbar';
import { HeroWelcome } from './components/HeroWelcome';
import { BookingFormModal } from './components/BookingFormModal';
import { BookingDetailsDrawer } from './components/BookingDetailsDrawer';
import { SeniorFamilyWorkspace } from './components/SeniorFamilyWorkspace';
import { HelperWorkspace } from './components/HelperWorkspace';
import { AdminWorkspace } from './components/AdminWorkspace';
import { IncidentSupportModal } from './components/IncidentSupportModal';

function loadCachedJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveCachedJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function getDefaultHelpersList(): HelperProfile[] {
  const nowIso = new Date().toISOString();
  return INITIAL_VERIFIED_HELPERS.map((h) => ({
    ...h,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

function getDefaultAvailabilitiesList(): HelperAvailability[] {
  const nowIso = new Date().toISOString();
  return INITIAL_HELPER_AVAILABILITIES.map((a) => ({
    ...a,
    updatedAt: nowIso,
  }));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('welcome');
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const isSandboxMode = false;

  // Application state backed by Cloud Firestore with local cache resilience
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() =>
    loadCachedJson('saathicare_cache_config', DEFAULT_SYSTEM_CONFIG)
  );
  const [seniors, setSeniors] = useState<SeniorProfile[]>(() =>
    loadCachedJson('saathicare_cache_seniors', [])
  );
  const [familyLinks, setFamilyLinks] = useState<FamilyLink[]>(() =>
    loadCachedJson('saathicare_cache_familyLinks', [])
  );
  const [helpers, setHelpers] = useState<HelperProfile[]>(() => {
    const cached = loadCachedJson<HelperProfile[]>('saathicare_cache_helpers', []);
    return cached.length > 0 ? cached : getDefaultHelpersList();
  });
  const [availabilities, setAvailabilities] = useState<HelperAvailability[]>(() => {
    const cached = loadCachedJson<HelperAvailability[]>(
      'saathicare_cache_availabilities',
      []
    );
    return cached.length > 0 ? cached : getDefaultAvailabilitiesList();
  });
  const [bookings, setBookings] = useState<BookingRecord[]>(() =>
    loadCachedJson('saathicare_cache_bookings', [])
  );
  const [bookingEvents, setBookingEvents] = useState<BookingEventRecord[]>(() =>
    loadCachedJson('saathicare_cache_events', [])
  );
  const [reviews, setReviews] = useState<ReviewRecord[]>(() =>
    loadCachedJson('saathicare_cache_reviews', [])
  );
  const [incidents, setIncidents] = useState<IncidentRecord[]>(() =>
    loadCachedJson('saathicare_cache_incidents', [])
  );

  // Sync collections to localStorage for seamless offline continuity
  useEffect(() => {
    saveCachedJson('saathicare_cache_config', systemConfig);
  }, [systemConfig]);
  useEffect(() => {
    saveCachedJson('saathicare_cache_seniors', seniors);
  }, [seniors]);
  useEffect(() => {
    saveCachedJson('saathicare_cache_familyLinks', familyLinks);
  }, [familyLinks]);
  useEffect(() => {
    if (helpers.length > 0) saveCachedJson('saathicare_cache_helpers', helpers);
  }, [helpers]);
  useEffect(() => {
    if (availabilities.length > 0) {
      saveCachedJson('saathicare_cache_availabilities', availabilities);
    }
  }, [availabilities]);
  useEffect(() => {
    saveCachedJson('saathicare_cache_bookings', bookings);
  }, [bookings]);
  useEffect(() => {
    saveCachedJson('saathicare_cache_events', bookingEvents);
  }, [bookingEvents]);
  useEffect(() => {
    saveCachedJson('saathicare_cache_reviews', reviews);
  }, [reviews]);
  useEffect(() => {
    saveCachedJson('saathicare_cache_incidents', incidents);
  }, [incidents]);

  // Modals & Drawers
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [presetService, setPresetService] = useState<ServiceType>('hospital_accompaniment');
  const [presetDuration, setPresetDuration] = useState<DurationHours>(4);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportBookingId, setSupportBookingId] = useState<string>('general');

  // Resolve current authenticated user profile from Firebase Auth + Firestore
  const currentUser: UserProfile | null = firebaseUser ? firestoreUser : null;

  // 1. Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setProfileLoading(true);
        const userDocPath = `users/${user.uid}`;
        const cacheKey = `saathicare_user_${user.uid}`;
        const cachedProfile = loadCachedJson<UserProfile | null>(cacheKey, null);

        // Verify token refresh health before issuing Firestore reads
        let canReachFirestore = !isOfflineModeActive();
        if (canReachFirestore) {
          try {
            await Promise.race([
              user.getIdToken(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 2500)
              ),
            ]);
          } catch (tokenErr) {
            if (isFirestoreOfflineOrTokenError(tokenErr)) {
              markOfflineModeActive();
              canReachFirestore = false;
            }
          }
        }

        if (canReachFirestore) {
          try {
            const snap = await Promise.race([
              getDoc(doc(db, 'users', user.uid)),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 2500)
              ),
            ]);
            if (snap.exists()) {
              const data = snap.data();
              const resolvedProfile: UserProfile = {
                uid: String(data.uid),
                email: String(data.email),
                fullName: String(data.fullName),
                phone: String(data.phone),
                role: data.role as UserRole,
                city: 'Bengaluru',
                createdAt: formatTimestampField(data.createdAt),
                updatedAt: formatTimestampField(data.updatedAt),
              };
              setFirestoreUser(resolvedProfile);
              saveCachedJson(cacheKey, resolvedProfile);
            } else if (cachedProfile) {
              setFirestoreUser(cachedProfile);
            } else {
              setFirestoreUser(null);
            }
          } catch (err) {
            if (isFirestoreOfflineOrTokenError(err)) {
              markOfflineModeActive();
              if (cachedProfile) {
                setFirestoreUser(cachedProfile);
              } else {
                const nowIso = new Date().toISOString();
                const isAdminEmail =
                  user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                const fallbackProfile: UserProfile = {
                  uid: user.uid,
                  email: user.email || '',
                  fullName:
                    user.displayName ||
                    (user.email ? user.email.split('@')[0] : 'SaathiCare Member'),
                  phone: '+91 98450 11223',
                  role: isAdminEmail ? 'admin' : 'senior',
                  city: 'Bengaluru',
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };
                setFirestoreUser(fallbackProfile);
                saveCachedJson(cacheKey, fallbackProfile);
              }
            } else {
              handleFirestoreError(err, OperationType.GET, userDocPath);
            }
          } finally {
            setProfileLoading(false);
          }
        } else {
          // Offline or token-service fallback
          if (cachedProfile) {
            setFirestoreUser(cachedProfile);
          } else {
            const nowIso = new Date().toISOString();
            const isAdminEmail =
              user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
            const fallbackProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              fullName:
                user.displayName ||
                (user.email ? user.email.split('@')[0] : 'SaathiCare Member'),
              phone: '+91 98450 11223',
              role: isAdminEmail ? 'admin' : 'senior',
              city: 'Bengaluru',
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            setFirestoreUser(fallbackProfile);
            saveCachedJson(cacheKey, fallbackProfile);
          }
          setProfileLoading(false);
        }
      } else {
        setFirestoreUser(null);
        setProfileLoading(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Listen to public /systemConfig/bengaluru when online
  useEffect(() => {
    if (!authReady || isOfflineModeActive()) return;
    const unsub = onSnapshot(
      doc(db, 'systemConfig', 'bengaluru'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setSystemConfig({
            configId: 'bengaluru',
            city: 'Bengaluru',
            supportPhone: String(d.supportPhone || DEFAULT_SYSTEM_CONFIG.supportPhone),
            supportEmail: String(d.supportEmail || DEFAULT_SYSTEM_CONFIG.supportEmail),
            serviceAreas: Array.isArray(d.serviceAreas)
              ? (d.serviceAreas as string[])
              : DEFAULT_SYSTEM_CONFIG.serviceAreas,
            rate2HoursInr: Number(d.rate2HoursInr || 500),
            rate4HoursInr: Number(d.rate4HoursInr || 900),
            rate8HoursInr: Number(d.rate8HoursInr || 1600),
            hospitalSurchargeInr: Number(d.hospitalSurchargeInr ?? 150),
            errandsSurchargeInr: Number(d.errandsSurchargeInr ?? 50),
            updatedByUid: String(d.updatedByUid || 'system'),
            updatedAt: formatTimestampField(d.updatedAt),
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'systemConfig/bengaluru');
      }
    );
    return () => unsub();
  }, [authReady]);

  // 3. Attach role-scoped real-time Firestore listeners when authenticated with a verified user
  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !firestoreUser ||
      !firebaseUser.emailVerified ||
      isOfflineModeActive()
    ) {
      return;
    }

    const unsubscribers: (() => void)[] = [];
    const uid = firestoreUser.uid;
    const isAdmin =
      firestoreUser.role === 'admin' ||
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

    // Seniors collection listener
    const seniorsQuery = isAdmin
      ? collection(db, 'seniorProfiles')
      : query(collection(db, 'seniorProfiles'), where('seniorId', '==', uid));
    unsubscribers.push(
      onSnapshot(
        seniorsQuery,
        (snap) => {
          if (snap.empty && snap.metadata.fromCache) return;
          const list: SeniorProfile[] = snap.docs.map((d) => {
            const raw = d.data();
            return {
              seniorId: String(raw.seniorId),
              fullName: String(raw.fullName),
              age: Number(raw.age),
              phone: String(raw.phone),
              locality: String(raw.locality),
              address: String(raw.address),
              preferredLanguages: Array.isArray(raw.preferredLanguages)
                ? (raw.preferredLanguages as string[])
                : ['Kannada', 'English'],
              mobilityNote: String(raw.mobilityNote || ''),
              emergencyContactName: String(raw.emergencyContactName),
              emergencyContactPhone: String(raw.emergencyContactPhone),
              allowFamilyBookings: Boolean(raw.allowFamilyBookings),
              createdAt: formatTimestampField(raw.createdAt),
              updatedAt: formatTimestampField(raw.updatedAt),
            };
          });
          setSeniors(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'seniorProfiles')
      )
    );

    // Family links listener
    const familyQuery = isAdmin
      ? collection(db, 'familyLinks')
      : firestoreUser.role === 'senior'
      ? query(collection(db, 'familyLinks'), where('seniorId', '==', uid))
      : query(collection(db, 'familyLinks'), where('familyUid', '==', uid));

    unsubscribers.push(
      onSnapshot(
        familyQuery,
        (snap) => {
          if (snap.empty && snap.metadata.fromCache) return;
          const links: FamilyLink[] = snap.docs.map((d) => {
            const raw = d.data();
            return {
              linkId: String(raw.linkId),
              seniorId: String(raw.seniorId),
              seniorName: String(raw.seniorName),
              familyUid: String(raw.familyUid),
              familyName: String(raw.familyName),
              familyEmail: String(raw.familyEmail),
              relationship: String(raw.relationship),
              status: raw.status as FamilyLinkStatus,
              consentNote: String(raw.consentNote),
              createdAt: formatTimestampField(raw.createdAt),
              updatedAt: formatTimestampField(raw.updatedAt),
            };
          });
          setFamilyLinks(links);

          // For family_member role, load any seniorProfiles where consent is active
          if (firestoreUser.role === 'family_member' && !isOfflineModeActive()) {
            const activeSeniorIds = links
              .filter((l) => l.status === 'active')
              .map((l) => l.seniorId);
            if (activeSeniorIds.length > 0) {
              Promise.all(
                activeSeniorIds.map((sId) =>
                  getDoc(doc(db, 'seniorProfiles', sId)).catch(() => null)
                )
              )
                .then((snaps) => {
                  const loadedSeniors: SeniorProfile[] = [];
                  for (const sSnap of snaps) {
                    if (sSnap && sSnap.exists()) {
                      const raw = sSnap.data();
                      loadedSeniors.push({
                        seniorId: String(raw.seniorId),
                        fullName: String(raw.fullName),
                        age: Number(raw.age),
                        phone: String(raw.phone),
                        locality: String(raw.locality),
                        address: String(raw.address),
                        preferredLanguages: Array.isArray(raw.preferredLanguages)
                          ? (raw.preferredLanguages as string[])
                          : ['Kannada', 'English'],
                        mobilityNote: String(raw.mobilityNote || ''),
                        emergencyContactName: String(raw.emergencyContactName),
                        emergencyContactPhone: String(raw.emergencyContactPhone),
                        allowFamilyBookings: Boolean(raw.allowFamilyBookings),
                        createdAt: formatTimestampField(raw.createdAt),
                        updatedAt: formatTimestampField(raw.updatedAt),
                      });
                    }
                  }
                  if (loadedSeniors.length > 0) {
                    setSeniors((prev) => [
                      ...prev.filter((p) => !loadedSeniors.some((ls) => ls.seniorId === p.seniorId)),
                      ...loadedSeniors,
                    ]);
                  }
                })
                .catch(() => {
                  // Fall back gracefully to local/cached senior profiles
                });
            }
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'familyLinks')
      )
    );

    // Helpers listener
    const helpersQuery = isAdmin
      ? collection(db, 'helpers')
      : firestoreUser.role === 'helper'
      ? query(collection(db, 'helpers'), where('helperId', '==', uid))
      : query(collection(db, 'helpers'), where('verificationStatus', '==', 'approved'));

    unsubscribers.push(
      onSnapshot(
        helpersQuery,
        (snap) => {
          if (snap.empty && snap.metadata.fromCache) return;
          const list: HelperProfile[] = snap.docs.map((d) => {
            const raw = d.data();
            return {
              helperId: String(raw.helperId),
              fullName: String(raw.fullName),
              phone: String(raw.phone),
              bio: String(raw.bio),
              languages: Array.isArray(raw.languages) ? (raw.languages as string[]) : ['English'],
              serviceAreas: Array.isArray(raw.serviceAreas)
                ? (raw.serviceAreas as string[])
                : ['Indiranagar'],
              servicesOffered: Array.isArray(raw.servicesOffered)
                ? (raw.servicesOffered as ServiceType[])
                : ['companionship_visit'],
              yearsExperience: Number(raw.yearsExperience || 0),
              verificationStatus: raw.verificationStatus as HelperVerificationStatus,
              idCheckReviewed: Boolean(raw.idCheckReviewed),
              backgroundCheckReviewed: Boolean(raw.backgroundCheckReviewed),
              referenceCheckReviewed: Boolean(raw.referenceCheckReviewed),
              trainingCompleted: Boolean(raw.trainingCompleted),
              verificationNotes: String(raw.verificationNotes || ''),
              isActive: Boolean(raw.isActive),
              completedBookingsCount: Number(raw.completedBookingsCount || 0),
              createdAt: formatTimestampField(raw.createdAt),
              updatedAt: formatTimestampField(raw.updatedAt),
            };
          });
          if (list.length > 0) {
            setHelpers(list);
          }

          // For non-admin bookers (seniors & family members), load each approved helper's availability document via getDoc
          if (
            !isAdmin &&
            firestoreUser.role !== 'helper' &&
            list.length > 0 &&
            !isOfflineModeActive()
          ) {
            Promise.all(
              list.map((h) => getDoc(doc(db, 'availability', h.helperId)))
            )
              .then((availSnaps) => {
                const loadedAvailabilities: HelperAvailability[] = [];
                for (const aSnap of availSnaps) {
                  if (aSnap.exists()) {
                    const raw = aSnap.data();
                    loadedAvailabilities.push({
                      availabilityId: String(raw.availabilityId),
                      helperId: String(raw.helperId),
                      availableDays: Array.isArray(raw.availableDays)
                        ? (raw.availableDays as DayOfWeek[])
                        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                      startHour: String(raw.startHour || '08:00'),
                      endHour: String(raw.endHour || '19:00'),
                      updatedAt: formatTimestampField(raw.updatedAt),
                    });
                  }
                }
                if (loadedAvailabilities.length > 0) {
                  setAvailabilities(loadedAvailabilities);
                }
              })
              .catch((err) =>
                handleFirestoreError(err, OperationType.GET, 'availability')
              );
          }

          // If no helpers exist in Firestore yet and current user is Admin, bootstrap verified helpers
          if (snap.empty && isAdmin && !isOfflineModeActive()) {
            Promise.all([
              ...INITIAL_VERIFIED_HELPERS.map((h) =>
                setDoc(doc(db, 'helpers', h.helperId), {
                  ...h,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                })
              ),
              ...INITIAL_HELPER_AVAILABILITIES.map((a) =>
                setDoc(doc(db, 'availability', a.availabilityId), {
                  ...a,
                  updatedAt: serverTimestamp(),
                })
              ),
            ]).catch(() => {
              // Ignore bootstrap race
            });
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'helpers')
      )
    );

    // Helper Availability listener (Admin lists all; Helper lists own helperId)
    if (isAdmin || firestoreUser.role === 'helper') {
      const availabilityQuery = isAdmin
        ? collection(db, 'availability')
        : query(collection(db, 'availability'), where('helperId', '==', uid));
      unsubscribers.push(
        onSnapshot(
          availabilityQuery,
          (snap) => {
            if (snap.empty && snap.metadata.fromCache) return;
            const list: HelperAvailability[] = snap.docs.map((d) => {
              const raw = d.data();
              return {
                availabilityId: String(raw.availabilityId),
                helperId: String(raw.helperId),
                availableDays: Array.isArray(raw.availableDays)
                  ? (raw.availableDays as DayOfWeek[])
                  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                startHour: String(raw.startHour || '08:00'),
                endHour: String(raw.endHour || '19:00'),
                updatedAt: formatTimestampField(raw.updatedAt),
              };
            });
            if (list.length > 0) {
              setAvailabilities(list);
            }
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'availability')
        )
      );
    }

    // Bookings listener
    const bookingsQuery = isAdmin
      ? collection(db, 'bookings')
      : firestoreUser.role === 'senior'
      ? query(collection(db, 'bookings'), where('seniorId', '==', uid))
      : firestoreUser.role === 'helper'
      ? query(collection(db, 'bookings'), where('assignedHelperUid', '==', uid))
      : query(collection(db, 'bookings'), where('bookedByUid', '==', uid));

    unsubscribers.push(
      onSnapshot(
        bookingsQuery,
        (snap) => {
          if (snap.empty && snap.metadata.fromCache) return;
          const list: BookingRecord[] = snap.docs.map((d) => {
            const raw = d.data();
            return {
              bookingId: String(raw.bookingId),
              bookingRef: String(raw.bookingRef),
              seniorId: String(raw.seniorId),
              seniorName: String(raw.seniorName),
              seniorPhone: String(raw.seniorPhone),
              bookedByUid: String(raw.bookedByUid),
              bookedByName: String(raw.bookedByName),
              bookedByRole: raw.bookedByRole as 'senior' | 'family_member',
              serviceType: raw.serviceType as ServiceType,
              date: String(raw.date),
              startTime: String(raw.startTime),
              durationHours: Number(raw.durationHours) as DurationHours,
              locality: String(raw.locality),
              pickupAddress: String(raw.pickupAddress),
              destination: String(raw.destination || ''),
              taskNotes: String(raw.taskNotes || ''),
              basePriceInr: Number(raw.basePriceInr),
              additionalChargesInr: Number(raw.additionalChargesInr),
              totalPriceInr: Number(raw.totalPriceInr),
              paymentStatus:
                raw.paymentStatus === 'paid_online' ||
                raw.paymentStatus === 'paid_after_visit' ||
                raw.paymentStatus === 'pay_later_pending'
                  ? (raw.paymentStatus as PaymentStatus)
                  : 'pay_later_unconfigured',
              status: raw.status as BookingStatus,
              assignedHelperUid: String(raw.assignedHelperUid || ''),
              assignedHelperName: String(raw.assignedHelperName || ''),
              assignedHelperPhone: String(raw.assignedHelperPhone || ''),
              locationConsentGranted: Boolean(raw.locationConsentGranted),
              nonMedicalAcknowledged: Boolean(raw.nonMedicalAcknowledged),
              cancellationReason: String(raw.cancellationReason || ''),
              createdAt: formatTimestampField(raw.createdAt),
              updatedAt: formatTimestampField(raw.updatedAt),
            };
          });
          setBookings((prev) => {
            const remoteIds = new Set(list.map((b) => b.bookingId));
            const unsyncedLocal = prev.filter(
              (b) =>
                !remoteIds.has(b.bookingId) &&
                (isAdmin ||
                  b.seniorId === uid ||
                  b.bookedByUid === uid ||
                  b.assignedHelperUid === uid)
            );
            return [...list, ...unsyncedLocal];
          });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
      )
    );

    // BookingEvents listener
    const eventsQuery = isAdmin
      ? collection(db, 'bookingEvents')
      : firestoreUser.role === 'senior'
      ? query(collection(db, 'bookingEvents'), where('seniorId', '==', uid))
      : firestoreUser.role === 'helper'
      ? query(collection(db, 'bookingEvents'), where('assignedHelperUid', '==', uid))
      : query(collection(db, 'bookingEvents'), where('bookedByUid', '==', uid));

    unsubscribers.push(
      onSnapshot(
        eventsQuery,
        (snap) => {
          if (snap.empty && snap.metadata.fromCache) return;
          const list: BookingEventRecord[] = snap.docs.map((d) => {
            const raw = d.data();
            return {
              eventId: String(raw.eventId),
              bookingId: String(raw.bookingId),
              seniorId: String(raw.seniorId),
              bookedByUid: String(raw.bookedByUid),
              assignedHelperUid: String(raw.assignedHelperUid || ''),
              fromStatus: raw.fromStatus as BookingStatus | 'none',
              toStatus: raw.toStatus as BookingStatus,
              actorUid: String(raw.actorUid),
              actorName: String(raw.actorName),
              actorRole: raw.actorRole as UserRole,
              note: String(raw.note),
              createdAt: formatTimestampField(raw.createdAt),
            };
          });
          setBookingEvents(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bookingEvents')
      )
    );

    // Incidents listener
    const incidentsQuery = isAdmin
      ? collection(db, 'incidents')
      : query(collection(db, 'incidents'), where('reporterUid', '==', uid));

    unsubscribers.push(
      onSnapshot(
        incidentsQuery,
        (snap) => {
          if (snap.empty && snap.metadata.fromCache) return;
          const list: IncidentRecord[] = snap.docs.map((d) => {
            const raw = d.data();
            return {
              incidentId: String(raw.incidentId),
              bookingId: String(raw.bookingId),
              reporterUid: String(raw.reporterUid),
              reporterName: String(raw.reporterName),
              reporterRole: raw.reporterRole as UserRole,
              severity: raw.severity as IncidentSeverity,
              category: raw.category as IncidentCategory,
              description: String(raw.description),
              status: raw.status as IncidentStatus,
              adminResolutionNote: String(raw.adminResolutionNote || ''),
              createdAt: formatTimestampField(raw.createdAt),
              updatedAt: formatTimestampField(raw.updatedAt),
            };
          });
          setIncidents(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'incidents')
      )
    );

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [authReady, firebaseUser, firestoreUser]);

  // Handlers
  const handleSignInGoogle = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      googleProvider.setCustomParameters({
        prompt: 'select_account',
      });
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In could not complete. Please verify popup permissions and try again.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (firebaseUser) {
        await signOut(auth);
      }
      setFirebaseUser(null);
      setFirestoreUser(null);
      setActiveTab('welcome');
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Sign-out failed. Please try again.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleNavigateToRoleWorkspace = () => {
    if (!currentUser) {
      setActiveTab('welcome');
      return;
    }
    if (currentUser.role === 'helper') {
      setActiveTab('helper_workspace');
    } else if (currentUser.role === 'admin') {
      setActiveTab('admin_workspace');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleRegisterUser = async (payload: {
    fullName: string;
    phone: string;
    role: UserRole;
    locality: string;
    address: string;
    age: number;
    emergencyContactName: string;
    emergencyContactPhone: string;
    bio: string;
    languages: string[];
  }) => {
    if (!firebaseUser) throw new Error('Not signed in with Google.');
    const uid = firebaseUser.uid;
    const email = firebaseUser.email || '';
    const nowIso = new Date().toISOString();

    const userDocPath = `users/${uid}`;
    await withFirestoreWriteFallback(
      () =>
        setDoc(doc(db, 'users', uid), {
          uid,
          email,
          fullName: payload.fullName,
          phone: payload.phone,
          role: payload.role,
          city: 'Bengaluru',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      OperationType.CREATE,
      userDocPath
    );

    if (payload.role === 'senior') {
      const seniorRecord: SeniorProfile = {
        seniorId: uid,
        fullName: payload.fullName,
        age: payload.age,
        phone: payload.phone,
        locality: payload.locality,
        address: payload.address,
        preferredLanguages: payload.languages,
        mobilityNote: 'Prefers unhurried accompaniment',
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        allowFamilyBookings: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setSeniors((prev) => [
        seniorRecord,
        ...prev.filter((s) => s.seniorId !== uid),
      ]);
      const seniorPath = `seniorProfiles/${uid}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'seniorProfiles', uid), {
            ...seniorRecord,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        seniorPath
      );
    } else if (payload.role === 'helper') {
      const helperRecord: HelperProfile = {
        helperId: uid,
        fullName: payload.fullName,
        phone: payload.phone,
        bio: payload.bio,
        languages: payload.languages,
        serviceAreas: [payload.locality],
        servicesOffered: [
          'hospital_accompaniment',
          'shopping_errands',
          'companionship_visit',
        ],
        yearsExperience: 2,
        verificationStatus: 'pending',
        idCheckReviewed: false,
        backgroundCheckReviewed: false,
        referenceCheckReviewed: false,
        trainingCompleted: false,
        verificationNotes: '',
        isActive: true,
        completedBookingsCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setHelpers((prev) => [
        helperRecord,
        ...prev.filter((h) => h.helperId !== uid),
      ]);
      const helperPath = `helpers/${uid}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'helpers', uid), {
            ...helperRecord,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        helperPath
      );
    }

    const newProfile: UserProfile = {
      uid,
      email,
      fullName: payload.fullName,
      phone: payload.phone,
      role: payload.role,
      city: 'Bengaluru',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setFirestoreUser(newProfile);
    saveCachedJson(`saathicare_user_${uid}`, newProfile);

    if (payload.role === 'helper') setActiveTab('helper_workspace');
    else if (payload.role === 'admin') setActiveTab('admin_workspace');
    else setActiveTab('dashboard');
  };

  // Create Senior Citizen Profile (from Booking Modal or Dashboard)
  const handleCreateSeniorProfile = async (
    profile: Omit<SeniorProfile, 'createdAt' | 'updatedAt'>
  ): Promise<SeniorProfile> => {
    if (!currentUser || !firebaseUser) {
      throw new Error('Authentication required to save Senior Citizen profile.');
    }
    const nowIso = new Date().toISOString();
    const effectiveSeniorId =
      currentUser.role === 'family_member' && (!profile.seniorId || profile.seniorId === currentUser.uid)
        ? `senior_${Date.now()}`
        : profile.seniorId;

    const fullRecord: SeniorProfile = {
      ...profile,
      seniorId: effectiveSeniorId,
      allowFamilyBookings: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const seniorPath = `seniorProfiles/${effectiveSeniorId}`;
    await withFirestoreWriteFallback(
      () =>
        setDoc(doc(db, 'seniorProfiles', effectiveSeniorId), {
          ...fullRecord,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      OperationType.CREATE,
      seniorPath
    );

    setSeniors((prev) => {
      const exists = prev.some((s) => s.seniorId === fullRecord.seniorId);
      return exists
        ? prev.map((s) => (s.seniorId === fullRecord.seniorId ? fullRecord : s))
        : [fullRecord, ...prev];
    });

    // If a family member is registering a senior parent/loved one, automatically establish active family booking consent
    if (currentUser.role === 'family_member') {
      const linkId = `${effectiveSeniorId}_${currentUser.uid}`;
      const familyLinkRecord: FamilyLink = {
        linkId,
        seniorId: effectiveSeniorId,
        seniorName: fullRecord.fullName,
        familyUid: currentUser.uid,
        familyName: currentUser.fullName,
        familyEmail: currentUser.email,
        relationship: 'Family Caregiver',
        status: 'active',
        consentNote: `Direct family caregiver authorization registered by ${currentUser.fullName} on ${new Date().toLocaleDateString('en-IN')}.`,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setFamilyLinks((prev) => {
        const exists = prev.some((l) => l.linkId === linkId);
        return exists
          ? prev.map((l) => (l.linkId === linkId ? familyLinkRecord : l))
          : [...prev, familyLinkRecord];
      });

      if (!isSandboxMode && firebaseUser) {
        await withFirestoreWriteFallback(
          () =>
            setDoc(doc(db, 'familyLinks', linkId), {
              ...familyLinkRecord,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          OperationType.CREATE,
          `familyLinks/${linkId}`
        );
      }
    }

    return fullRecord;
  };

  // Create Booking (Enforced via Server API + Persisted to Firestore)
  const handleSubmitBooking = async (input: {
    seniorProfile: SeniorProfile;
    familyLink: FamilyLink | null;
    serviceType: ServiceType;
    date: string;
    startTime: string;
    durationHours: DurationHours;
    locality: string;
    pickupAddress: string;
    destination: string;
    taskNotes: string;
    locationConsentGranted: boolean;
    nonMedicalAcknowledged: boolean;
    clientSuppliedTotalInr: number;
    paymentStatus?: PaymentStatus;
  }): Promise<BookingRecord> => {
    if (!currentUser) {
      throw new Error('Authentication required to submit a booking.');
    }

    const selectedPaymentStatus: PaymentStatus =
      input.paymentStatus === 'paid_online' || input.paymentStatus === 'pay_later_pending'
        ? input.paymentStatus
        : 'paid_online';

    // 1. Validate, check helper availability & price on the Node.js server (with safe JSON check & deterministic fallback if proxy returns HTML)
    const requestPayload = {
      actorUid: currentUser.uid,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      seniorProfile: input.seniorProfile,
      familyLink: input.familyLink,
      serviceType: input.serviceType,
      date: input.date,
      startTime: input.startTime,
      durationHours: input.durationHours,
      locality: input.locality,
      pickupAddress: input.pickupAddress,
      destination: input.destination,
      taskNotes: input.taskNotes,
      locationConsentGranted: input.locationConsentGranted,
      nonMedicalAcknowledged: input.nonMedicalAcknowledged,
      clientSuppliedTotalInr: input.clientSuppliedTotalInr,
      paymentStatus: selectedPaymentStatus,
      config: systemConfig,
      helpers,
      availabilities,
      existingBookings: bookings,
    };

    let serverData: {
      ok: boolean;
      error?: string;
      bookingRef?: string;
      price?: {
        basePriceInr: number;
        additionalChargesInr: number;
        totalPriceInr: number;
      };
      assignedHelper?: {
        helperId: string;
        fullName: string;
        phone: string;
      } | null;
      paymentStatus?: PaymentStatus;
      auditNote?: string;
    } | null = null;

    try {
      const response = await fetch('/api/bookings/validate-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const parsed = await response.json();
        if (!response.ok || !parsed.ok) {
          throw new Error(parsed.error || 'Server rejected booking creation.');
        }
        serverData = parsed;
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('Unexpected token')) {
        throw err;
      }
    }

    if (!serverData) {
      const localValidation = validateBookingCreationInput(requestPayload);
      if (!localValidation.valid || !localValidation.price) {
        throw new Error(localValidation.error || 'Booking validation failed.');
      }
      const nowFallbackIso = new Date().toISOString();
      const candidateHelpers =
        helpers.length > 0
          ? helpers
          : INITIAL_VERIFIED_HELPERS.map((h) => ({
              ...h,
              createdAt: nowFallbackIso,
              updatedAt: nowFallbackIso,
            }));
      const candidateAvailabilities =
        availabilities.length > 0
          ? availabilities
          : INITIAL_HELPER_AVAILABILITIES.map((a) => ({
              ...a,
              updatedAt: nowFallbackIso,
            }));
      const selection = selectAvailableHelperForBooking({
        serviceType: input.serviceType,
        locality: input.locality,
        date: input.date,
        startTime: input.startTime,
        durationHours: input.durationHours,
        helpers: candidateHelpers,
        availabilities: candidateAvailabilities,
        existingBookings: bookings,
      });
      const bookerNote =
        currentUser.role === 'family_member'
          ? `Booking created on behalf of ${input.seniorProfile.fullName} by authorized family member ${currentUser.fullName}.`
          : `Booking created by ${currentUser.fullName}.`;
      const paymentFallbackNote =
        selectedPaymentStatus === 'paid_online'
          ? `Online payment of ₹${localValidation.price.totalPriceInr} confirmed via UPI.`
          : 'Pay Later after visit completion selected.';

      serverData = {
        ok: true,
        bookingRef: generateBookingReference(input.date),
        price: localValidation.price,
        assignedHelper: selection.matchedHelper
          ? {
              helperId: selection.matchedHelper.helperId,
              fullName: selection.matchedHelper.fullName,
              phone: selection.matchedHelper.phone,
            }
          : null,
        paymentStatus: selectedPaymentStatus,
        auditNote: `${bookerNote} ${paymentFallbackNote} ${selection.assignmentNote}`.slice(0, 295),
      };
    }

    const bookingId = `booking_${Date.now()}`;
    const eventId = `evt_${Date.now()}`;
    const bookingRef: string =
      serverData.bookingRef || generateBookingReference(input.date);
    const nowIso = new Date().toISOString();

    // Check if an available helper was matched and ensure the helper doc exists in Firestore when online
    let assignedHelper = (serverData.assignedHelper || null) as {
      helperId: string;
      fullName: string;
      phone: string;
    } | null;

    if (!isSandboxMode && firebaseUser && assignedHelper && !isOfflineModeActive()) {
      try {
        const helperDocRef = doc(db, 'helpers', assignedHelper.helperId);
        const helperSnap = await Promise.race([
          getDoc(helperDocRef),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 2500)
          ),
        ]);
        if (!helperSnap.exists()) {
          const isAdminUser =
            currentUser.role === 'admin' ||
            firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
          const seedHelper = INITIAL_VERIFIED_HELPERS.find(
            (h) => h.helperId === assignedHelper?.helperId
          );
          const seedAvail = INITIAL_HELPER_AVAILABILITIES.find(
            (a) => a.helperId === assignedHelper?.helperId
          );
          if (isAdminUser && seedHelper) {
            await withFirestoreWriteFallback(
              () =>
                setDoc(helperDocRef, {
                  ...seedHelper,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                }),
              OperationType.CREATE,
              `helpers/${seedHelper.helperId}`
            );
            if (seedAvail) {
              await withFirestoreWriteFallback(
                () =>
                  setDoc(doc(db, 'availability', seedAvail.availabilityId), {
                    ...seedAvail,
                    updatedAt: serverTimestamp(),
                  }),
                OperationType.CREATE,
                `availability/${seedAvail.availabilityId}`
              );
            }
          } else {
            assignedHelper = null;
          }
        }
      } catch (err) {
        if (isFirestoreOfflineOrTokenError(err)) {
          markOfflineModeActive();
        } else {
          assignedHelper = null;
        }
      }
    }

    const initialBookingStatus: BookingStatus = assignedHelper
      ? 'assigned'
      : 'pending_assignment';

    const newBookingRecord: BookingRecord = {
      bookingId,
      bookingRef,
      seniorId: input.seniorProfile.seniorId,
      seniorName: input.seniorProfile.fullName,
      seniorPhone: input.seniorProfile.phone,
      bookedByUid: currentUser.uid,
      bookedByName: currentUser.fullName,
      bookedByRole: currentUser.role === 'family_member' ? 'family_member' : 'senior',
      serviceType: input.serviceType,
      date: input.date,
      startTime: input.startTime,
      durationHours: input.durationHours,
      locality: input.locality,
      pickupAddress: input.pickupAddress.trim(),
      destination: input.destination.trim(),
      taskNotes: input.taskNotes.trim(),
      basePriceInr: Number(serverData?.price?.basePriceInr ?? 0),
      additionalChargesInr: Number(serverData?.price?.additionalChargesInr ?? 0),
      totalPriceInr: Number(serverData?.price?.totalPriceInr ?? 0),
      paymentStatus: serverData.paymentStatus || selectedPaymentStatus,
      status: initialBookingStatus,
      assignedHelperUid: assignedHelper ? assignedHelper.helperId : '',
      assignedHelperName: assignedHelper ? assignedHelper.fullName : '',
      assignedHelperPhone: assignedHelper ? assignedHelper.phone : '',
      locationConsentGranted: true,
      nonMedicalAcknowledged: true,
      cancellationReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const initialEvent: BookingEventRecord = {
      eventId,
      bookingId,
      seniorId: newBookingRecord.seniorId,
      bookedByUid: newBookingRecord.bookedByUid,
      assignedHelperUid: newBookingRecord.assignedHelperUid,
      fromStatus: 'none',
      toStatus: initialBookingStatus,
      actorUid: currentUser.uid,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      note: String(serverData.auditNote),
      createdAt: nowIso,
    };

    // Always update local state immediately for instant UI responsiveness and offline continuity
    setBookings((prev) => {
      const exists = prev.some((b) => b.bookingId === newBookingRecord.bookingId);
      return exists
        ? prev.map((b) =>
            b.bookingId === newBookingRecord.bookingId ? newBookingRecord : b
          )
        : [newBookingRecord, ...prev];
    });
    setBookingEvents((prev) => {
      const exists = prev.some((e) => e.eventId === initialEvent.eventId);
      return exists ? prev : [...prev, initialEvent];
    });

    // 2. Persist to Cloud Firestore if authenticated
    if (!isSandboxMode && firebaseUser) {
      const bookingPath = `bookings/${bookingId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'bookings', bookingId), {
            ...newBookingRecord,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        bookingPath
      );

      const eventPath = `bookingEvents/${eventId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'bookingEvents', eventId), {
            ...initialEvent,
            createdAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        eventPath
      );
    }

    return newBookingRecord;
  };

  // Transition Booking Status (Enforced via Server API + Firestore Rules + Append-Only Event Log)
  const handleTransitionBookingStatus = async (
    booking: BookingRecord,
    toStatus: BookingStatus,
    reasonOrNote: string,
    targetHelper?: HelperProfile
  ) => {
    if (!currentUser) throw new Error('Authentication required.');

    const targetHelperAvailability = targetHelper
      ? availabilities.find((a) => a.helperId === targetHelper.helperId) || null
      : null;

    const transitionPayload = {
      booking,
      toStatus,
      actorUid: currentUser.uid,
      actorRole: currentUser.role,
      targetHelper: targetHelper || null,
      targetHelperAvailability,
      existingBookings: bookings,
      reasonOrNote,
    };

    let auditNote = '';
    let validatedViaServer = false;

    try {
      const response = await fetch('/api/bookings/validate-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transitionPayload),
      });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const serverResult = await response.json();
        if (!response.ok || !serverResult.ok) {
          throw new Error(serverResult.error || 'Server rejected status transition.');
        }
        auditNote = String(serverResult.auditNote || '');
        validatedViaServer = true;
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('Unexpected token')) {
        throw err;
      }
    }

    if (!validatedViaServer) {
      const localCheck = validateBookingTransition(transitionPayload);
      if (!localCheck.valid) {
        throw new Error(localCheck.error || 'Transition not permitted.');
      }
      auditNote = String(localCheck.auditNote || reasonOrNote || `Updated to ${toStatus}.`);
    }

    const nowIso = new Date().toISOString();
    const eventId = `evt_${Date.now()}`;
    const updatedFields: Partial<BookingRecord> = {
      status: toStatus,
      updatedAt: nowIso,
    };

    if (toStatus === 'assigned' && targetHelper) {
      updatedFields.assignedHelperUid = targetHelper.helperId;
      updatedFields.assignedHelperName = targetHelper.fullName;
      updatedFields.assignedHelperPhone = targetHelper.phone;
    }

    if (toStatus === 'cancelled' || toStatus === 'needs_attention') {
      updatedFields.cancellationReason = reasonOrNote.trim();
    }

    const newEvent: BookingEventRecord = {
      eventId,
      bookingId: booking.bookingId,
      seniorId: booking.seniorId,
      bookedByUid: booking.bookedByUid,
      assignedHelperUid:
        toStatus === 'assigned' && targetHelper
          ? targetHelper.helperId
          : booking.assignedHelperUid,
      fromStatus: booking.status,
      toStatus,
      actorUid: currentUser.uid,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      note: auditNote,
      createdAt: nowIso,
    };

    // Update local state immediately
    setBookings((prev) =>
      prev.map((b) =>
        b.bookingId === booking.bookingId ? { ...b, ...updatedFields } : b
      )
    );
    setBookingEvents((prev) => {
      const exists = prev.some((e) => e.eventId === newEvent.eventId);
      return exists ? prev : [...prev, newEvent];
    });

    if (!isSandboxMode && firebaseUser) {
      await syncAndUpdateBookingInFirestore(
        booking,
        updatedFields,
        targetHelper
      );

      const eventPath = `bookingEvents/${eventId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'bookingEvents', eventId), {
            ...newEvent,
            createdAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        eventPath
      );
    }
  };

  // Reconcile local/cached booking state with Cloud Firestore before running updateDoc
  const syncAndUpdateBookingInFirestore = async (
    booking: BookingRecord,
    updatedFields: Partial<BookingRecord>,
    targetHelper?: HelperProfile
  ) => {
    if (!currentUser || !firebaseUser) return;
    const bookingPath = `bookings/${booking.bookingId}`;
    const bookingDocRef = doc(db, 'bookings', booking.bookingId);
    const mergedBooking: BookingRecord = {
      ...booking,
      ...updatedFields,
    };

    const isAdminUser =
      currentUser.role === 'admin' ||
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

    // 1. If a helper is being assigned, ensure the helper document exists in Firestore when admin
    const helperIdToEnsure =
      targetHelper?.helperId || mergedBooking.assignedHelperUid;
    if (helperIdToEnsure && isAdminUser) {
      try {
        const helperRef = doc(db, 'helpers', helperIdToEnsure);
        const helperSnap = await getDoc(helperRef);
        if (!helperSnap.exists()) {
          const seedHelper =
            targetHelper ||
            helpers.find((h) => h.helperId === helperIdToEnsure) ||
            INITIAL_VERIFIED_HELPERS.find((h) => h.helperId === helperIdToEnsure);
          if (seedHelper) {
            await setDoc(helperRef, {
              ...seedHelper,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch {
        // Non-blocking helper check
      }
    }

    // 2. Check if the booking document already exists in Cloud Firestore
    await withFirestoreWriteFallback(
      async () => {
        const existingSnap = await getDoc(bookingDocRef);

        if (!existingSnap.exists()) {
          // Booking was created in local/offline cache and not yet persisted to Firestore.
          // Ensure senior profile exists if available in local state
          const localSenior = seniors.find(
            (s) => s.seniorId === mergedBooking.seniorId
          );
          if (localSenior) {
            try {
              const seniorRef = doc(db, 'seniorProfiles', localSenior.seniorId);
              const seniorSnap = await getDoc(seniorRef);
              if (!seniorSnap.exists()) {
                await setDoc(seniorRef, {
                  ...localSenior,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
            } catch {
              // Non-blocking senior check
            }
          }

          const hasAssignedHelper = Boolean(
            mergedBooking.assignedHelperUid &&
              mergedBooking.assignedHelperName &&
              mergedBooking.assignedHelperPhone
          );
          const initialCreateStatus: BookingStatus = hasAssignedHelper
            ? 'assigned'
            : 'pending_assignment';

          await setDoc(bookingDocRef, {
            ...mergedBooking,
            status: initialCreateStatus,
            assignedHelperUid: hasAssignedHelper
              ? mergedBooking.assignedHelperUid
              : '',
            assignedHelperName: hasAssignedHelper
              ? mergedBooking.assignedHelperName
              : '',
            assignedHelperPhone: hasAssignedHelper
              ? mergedBooking.assignedHelperPhone
              : '',
            cancellationReason: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // If target status is beyond initialCreateStatus, walk valid transitions in Firestore
          if (mergedBooking.status !== initialCreateStatus) {
            if (
              mergedBooking.status === 'cancelled' ||
              mergedBooking.status === 'needs_attention'
            ) {
              await updateDoc(bookingDocRef, {
                status: mergedBooking.status,
                cancellationReason:
                  mergedBooking.cancellationReason &&
                  mergedBooking.cancellationReason.length >= 3
                    ? mergedBooking.cancellationReason
                    : 'Status updated by participant',
                updatedAt: serverTimestamp(),
              });
            } else {
              const orderedSteps: BookingStatus[] = [
                'accepted',
                'arrived',
                'in_progress',
                'completed',
              ];
              const targetIdx = orderedSteps.indexOf(mergedBooking.status);
              if (targetIdx >= 0) {
                for (let i = 0; i <= targetIdx; i++) {
                  await updateDoc(bookingDocRef, {
                    status: orderedSteps[i],
                    updatedAt: serverTimestamp(),
                  });
                }
              }
            }
          }
          return;
        }

        // Booking exists in Cloud Firestore. Reconcile any intermediate status gap if earlier step was offline
        const serverData = existingSnap.data();
        const serverStatus = String(
          serverData.status || booking.status
        ) as BookingStatus;

        if (updatedFields.status && updatedFields.status !== serverStatus) {
          const orderedSteps: BookingStatus[] = [
            'assigned',
            'accepted',
            'arrived',
            'in_progress',
            'completed',
          ];
          const fromIdx = orderedSteps.indexOf(serverStatus);
          const toIdx = orderedSteps.indexOf(updatedFields.status);
          if (fromIdx >= 0 && toIdx > fromIdx + 1) {
            for (let i = fromIdx + 1; i < toIdx; i++) {
              await updateDoc(bookingDocRef, {
                status: orderedSteps[i],
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        const firestorePatch: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };
        if (updatedFields.status) {
          firestorePatch.status = updatedFields.status;
        }
        if (updatedFields.paymentStatus) {
          firestorePatch.paymentStatus = updatedFields.paymentStatus;
        }
        if (updatedFields.assignedHelperUid !== undefined) {
          firestorePatch.assignedHelperUid = updatedFields.assignedHelperUid;
          firestorePatch.assignedHelperName =
            updatedFields.assignedHelperName || '';
          firestorePatch.assignedHelperPhone =
            updatedFields.assignedHelperPhone || '';
        }
        if (
          updatedFields.status === 'cancelled' ||
          updatedFields.status === 'needs_attention'
        ) {
          firestorePatch.cancellationReason =
            updatedFields.cancellationReason &&
            updatedFields.cancellationReason.length >= 3
              ? updatedFields.cancellationReason
              : 'Status updated by participant';
        }

        await updateDoc(bookingDocRef, firestorePatch);
      },
      OperationType.UPDATE,
      bookingPath
    );
  };

  // Record Append-Only GPS Check-In or Notification Event on Booking Timeline
  const handleRecordBookingAuditEvent = async (
    booking: BookingRecord,
    note: string
  ) => {
    if (!currentUser) throw new Error('Authentication required.');
    const nowIso = new Date().toISOString();
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const trimmedNote = note.trim().slice(0, 295);

    const newEvent: BookingEventRecord = {
      eventId,
      bookingId: booking.bookingId,
      seniorId: booking.seniorId,
      bookedByUid: booking.bookedByUid,
      assignedHelperUid: booking.assignedHelperUid,
      fromStatus: booking.status,
      toStatus: booking.status,
      actorUid: currentUser.uid,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      note: trimmedNote,
      createdAt: nowIso,
    };

    setBookingEvents((prev) => {
      const exists = prev.some((e) => e.eventId === newEvent.eventId);
      return exists ? prev : [...prev, newEvent];
    });

    if (!isSandboxMode && firebaseUser) {
      const eventPath = `bookingEvents/${eventId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'bookingEvents', eventId), {
            ...newEvent,
            createdAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        eventPath
      );
    }
  };

  // Record Online UPI Payment or Post-Visit Settlement on Booking + Append-Only Event Log
  const handleUpdateBookingPaymentStatus = async (
    booking: BookingRecord,
    nextPaymentStatus: PaymentStatus,
    note: string
  ) => {
    if (!currentUser) throw new Error('Authentication required.');
    const nowIso = new Date().toISOString();
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const trimmedNote = note.trim().slice(0, 295);

    setBookings((prev) =>
      prev.map((b) =>
        b.bookingId === booking.bookingId
          ? { ...b, paymentStatus: nextPaymentStatus, updatedAt: nowIso }
          : b
      )
    );

    const newEvent: BookingEventRecord = {
      eventId,
      bookingId: booking.bookingId,
      seniorId: booking.seniorId,
      bookedByUid: booking.bookedByUid,
      assignedHelperUid: booking.assignedHelperUid,
      fromStatus: booking.status,
      toStatus: booking.status,
      actorUid: currentUser.uid,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      note: trimmedNote,
      createdAt: nowIso,
    };

    setBookingEvents((prev) => {
      const exists = prev.some((e) => e.eventId === newEvent.eventId);
      return exists ? prev : [...prev, newEvent];
    });

    if (!isSandboxMode && firebaseUser) {
      await syncAndUpdateBookingInFirestore(booking, {
        paymentStatus: nextPaymentStatus,
        updatedAt: nowIso,
      });

      const eventPath = `bookingEvents/${eventId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'bookingEvents', eventId), {
            ...newEvent,
            createdAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        eventPath
      );
    }
  };

  // Family Link Request & Consent/Revocation
  const handleRequestFamilyLink = async (payload: {
    seniorId: string;
    seniorName: string;
    relationship: string;
    consentNote: string;
  }) => {
    if (!currentUser) throw new Error('Authentication required.');
    const linkId = `${payload.seniorId}_${currentUser.uid}`;
    const nowIso = new Date().toISOString();

    const targetSenior = seniors.find((s) => s.seniorId === payload.seniorId);
    const isAdminUser =
      currentUser.role === 'admin' ||
      firebaseUser?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
    const canAutoActivate =
      (targetSenior && targetSenior.allowFamilyBookings === true) || isAdminUser;
    const initialStatus: FamilyLinkStatus = canAutoActivate
      ? 'active'
      : 'pending_consent';

    const newLink: FamilyLink = {
      linkId,
      seniorId: payload.seniorId,
      seniorName: payload.seniorName || targetSenior?.fullName || 'Senior Citizen',
      familyUid: currentUser.uid,
      familyName: currentUser.fullName,
      familyEmail: currentUser.email,
      relationship: payload.relationship || 'Family Member',
      status: initialStatus,
      consentNote:
        payload.consentNote ||
        `Explicit verbal/written consent confirmed by family caregiver on ${new Date().toLocaleDateString('en-IN')}.`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setFamilyLinks((prev) => [
      ...prev.filter((l) => l.linkId !== linkId),
      newLink,
    ]);

    if (!isSandboxMode && firebaseUser) {
      // Ensure the senior profile exists in Cloud Firestore so the foreign-key relation constraint in firestore.rules passes
      const cleanSeniorId = payload.seniorId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const seniorDocRef = doc(db, 'seniorProfiles', cleanSeniorId);
      const seniorSnap = await getDoc(seniorDocRef).catch(() => null);
      if (!seniorSnap || !seniorSnap.exists()) {
        const seniorDataToCreate: SeniorProfile = targetSenior || {
          seniorId: cleanSeniorId,
          fullName: payload.seniorName.trim() || 'Senior Citizen',
          age: 70,
          phone: '+91-98450-11223',
          locality: systemConfig.serviceAreas[0] || 'Indiranagar',
          address: 'Bengaluru Residence',
          preferredLanguages: ['Kannada', 'English'],
          mobilityNote: 'Prefers unhurried accompaniment',
          emergencyContactName: currentUser.fullName,
          emergencyContactPhone:
            currentUser.phone && currentUser.phone.length >= 10
              ? currentUser.phone
              : '+91-98450-44556',
          allowFamilyBookings: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await withFirestoreWriteFallback(
          () =>
            setDoc(seniorDocRef, {
              ...seniorDataToCreate,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          OperationType.CREATE,
          `seniorProfiles/${cleanSeniorId}`
        );

        setSeniors((prev) => [
          ...prev.filter((s) => s.seniorId !== cleanSeniorId),
          seniorDataToCreate,
        ]);
      }

      const path = `familyLinks/${linkId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'familyLinks', linkId), {
            ...newLink,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        path
      );
    }
  };

  const handleUpdateFamilyLinkStatus = async (
    link: FamilyLink,
    nextStatus: FamilyLinkStatus,
    note: string
  ) => {
    if (!currentUser) throw new Error('Authentication required.');

    let familyLinkValidated = false;
    try {
      const response = await fetch('/api/family-links/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUid: currentUser.uid,
          actorRole: currentUser.role,
          existingLink: link,
          nextStatus,
          consentNote: note,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const resData = await response.json();
        if (!response.ok || !resData.ok) {
          throw new Error(resData.error || 'Consent transition denied.');
        }
        familyLinkValidated = true;
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('Unexpected token')) {
        throw err;
      }
    }

    if (!familyLinkValidated) {
      const localResult = validateFamilyLinkTransition(
        currentUser.uid,
        currentUser.role,
        link,
        nextStatus,
        note
      );
      if (!localResult.valid) {
        throw new Error(localResult.error || 'Consent transition denied.');
      }
    }

    setFamilyLinks((prev) =>
      prev.map((l) =>
        l.linkId === link.linkId
          ? {
              ...l,
              status: nextStatus,
              consentNote: note,
              updatedAt: new Date().toISOString(),
            }
          : l
      )
    );

    if (!isSandboxMode && firebaseUser) {
      const path = `familyLinks/${link.linkId}`;
      await withFirestoreWriteFallback(
        () =>
          updateDoc(doc(db, 'familyLinks', link.linkId), {
            status: nextStatus,
            consentNote: note,
            updatedAt: serverTimestamp(),
          }),
        OperationType.UPDATE,
        path
      );
    }
  };

  // Admin Helper Verification
  const handleVerifyHelper = async (
    helper: HelperProfile,
    updates: {
      verificationStatus: HelperVerificationStatus;
      idCheckReviewed: boolean;
      backgroundCheckReviewed: boolean;
      referenceCheckReviewed: boolean;
      trainingCompleted: boolean;
      verificationNotes: string;
    }
  ) => {
    if (!currentUser) throw new Error('Authentication required.');

    let helperVerifyValidated = false;
    try {
      const response = await fetch('/api/admin/verify-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorEmail: currentUser.email,
          actorRole: currentUser.role,
          payload: updates,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const resData = await response.json();
        if (!response.ok || !resData.ok) {
          throw new Error(resData.error || 'Helper verification update rejected.');
        }
        helperVerifyValidated = true;
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('Unexpected token')) {
        throw err;
      }
    }

    if (!helperVerifyValidated) {
      const localCheck = validateHelperVerificationUpdate(currentUser.role, updates);
      if (!localCheck.valid) {
        throw new Error(localCheck.error || 'Helper verification update rejected.');
      }
    }

    setHelpers((prev) =>
      prev.map((h) =>
        h.helperId === helper.helperId
          ? { ...h, ...updates, updatedAt: new Date().toISOString() }
          : h
      )
    );

    if (!isSandboxMode && firebaseUser) {
      const path = `helpers/${helper.helperId}`;
      await withFirestoreWriteFallback(
        () =>
          updateDoc(doc(db, 'helpers', helper.helperId), {
            ...updates,
            updatedAt: serverTimestamp(),
          }),
        OperationType.UPDATE,
        path
      );
    }
  };

  // Submit Review for Completed Booking
  const handleSubmitReview = async (
    booking: BookingRecord,
    rating: number,
    comment: string
  ) => {
    if (!currentUser) throw new Error('Authentication required.');
    const reviewId = booking.bookingId;
    const nowIso = new Date().toISOString();
    const newReview: ReviewRecord = {
      reviewId,
      bookingId: booking.bookingId,
      helperId: booking.assignedHelperUid,
      authorUid: currentUser.uid,
      authorName: currentUser.fullName,
      rating,
      comment,
      createdAt: nowIso,
    };

    setReviews((prev) => [
      newReview,
      ...prev.filter((r) => r.reviewId !== reviewId),
    ]);

    if (!isSandboxMode && firebaseUser) {
      const path = `reviews/${reviewId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'reviews', reviewId), {
            ...newReview,
            createdAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        path
      );
    }
  };

  // Submit Support / Incident Report
  const handleSubmitIncident = async (payload: {
    bookingId: string;
    severity: IncidentSeverity;
    category: IncidentCategory;
    description: string;
  }) => {
    if (!currentUser) throw new Error('Authentication required.');
    const incidentId = `inc_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newIncident: IncidentRecord = {
      incidentId,
      bookingId: payload.bookingId,
      reporterUid: currentUser.uid,
      reporterName: currentUser.fullName,
      reporterRole: currentUser.role,
      severity: payload.severity,
      category: payload.category,
      description: payload.description,
      status: 'open',
      adminResolutionNote: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setIncidents((prev) => [
      newIncident,
      ...prev.filter((i) => i.incidentId !== incidentId),
    ]);

    if (!isSandboxMode && firebaseUser) {
      const path = `incidents/${incidentId}`;
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'incidents', incidentId), {
            ...newIncident,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        path
      );
    }
  };

  // Update System Config (Admin)
  const handleUpdateSystemConfig = async (updated: SystemConfig) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Only an administrator can update system configuration.');
    }
    setSystemConfig(updated);
    if (!isSandboxMode && firebaseUser) {
      const path = 'systemConfig/bengaluru';
      await withFirestoreWriteFallback(
        () =>
          setDoc(doc(db, 'systemConfig', 'bengaluru'), {
            ...updated,
            updatedAt: serverTimestamp(),
          }),
        OperationType.WRITE,
        path
      );
    }
  };

  // Update Incident Resolution (Admin)
  const handleUpdateIncident = async (
    incident: IncidentRecord,
    status: IncidentStatus,
    resolutionNote: string
  ) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Only an administrator can resolve incident records.');
    }
    setIncidents((prev) =>
      prev.map((i) =>
        i.incidentId === incident.incidentId
          ? {
              ...i,
              status,
              adminResolutionNote: resolutionNote,
              updatedAt: new Date().toISOString(),
            }
          : i
      )
    );
    if (!isSandboxMode && firebaseUser) {
      const path = `incidents/${incident.incidentId}`;
      await withFirestoreWriteFallback(
        () =>
          updateDoc(doc(db, 'incidents', incident.incidentId), {
            status,
            adminResolutionNote: resolutionNote,
            updatedAt: serverTimestamp(),
          }),
        OperationType.UPDATE,
        path
      );
    }
  };

  const selectedBooking =
    bookings.find((b) => b.bookingId === selectedBookingId) || null;
  const selectedBookingEvents = bookingEvents.filter(
    (e) => e.bookingId === selectedBookingId
  );
  const selectedBookingReview =
    reviews.find((r) => r.bookingId === selectedBookingId) || null;

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1C1917]">
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        currentUser={currentUser}
        firebaseEmail={firebaseUser?.email || null}
        authBusy={authBusy}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onOpenNewBooking={() => setBookingModalOpen(true)}
        onOpenSupportModal={() => {
          setSupportBookingId('general');
          setSupportModalOpen(true);
        }}
        supportPhone={systemConfig.supportPhone}
        supportEmail={systemConfig.supportEmail}
      />

      <main className="flex-1">
        {(!authReady || profileLoading) && (
          <div
            role="status"
            aria-live="polite"
            className="max-w-3xl mx-auto px-6 py-12"
          >
            <div className="bg-white border border-[#E7E2DA] rounded-xl p-8 text-center space-y-2">
              <div className="text-base font-bold text-[#1C1917]">
                Verifying Firebase Authentication & Role Profile...
              </div>
              <p className="text-sm text-[#57534E]">
                Connecting securely to Cloud Firestore for Bengaluru companion services.
              </p>
            </div>
          </div>
        )}

        {authReady && !profileLoading && (activeTab === 'welcome' || activeTab === 'services') && (
          <HeroWelcome
            mode={activeTab}
            systemConfig={systemConfig}
            firebaseAuthUser={
              firebaseUser
                ? {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    emailVerified: firebaseUser.emailVerified,
                  }
                : null
            }
            currentUser={currentUser}
            authBusy={authBusy}
            onSignInGoogle={handleSignInGoogle}
            onRegisterUser={handleRegisterUser}
            onStartBookingWithPreset={(service, duration) => {
              setPresetService(service);
              setPresetDuration(duration);
              if (currentUser && (currentUser.role === 'senior' || currentUser.role === 'family_member')) {
                setBookingModalOpen(true);
              } else {
                setActiveTab('dashboard');
              }
            }}
            onNavigateToRoleWorkspace={handleNavigateToRoleWorkspace}
            authError={authError}
          />
        )}

        {/* Role-Aware Route: Senior & Family Workspace */}
        {authReady && !profileLoading && activeTab === 'dashboard' && (
          <>
            {!firebaseUser ? (
              <div className="max-w-3xl mx-auto px-6 py-12">
                <div
                  role="region"
                  aria-labelledby="senior-auth-gate-heading"
                  className="bg-white border border-[#E7E2DA] rounded-xl p-8 space-y-4"
                >
                  <div className="text-xs font-semibold text-[#9A3412]">
                    Role-Protected Workspace · Senior Citizen & Authorized Family
                  </div>
                  <h1
                    id="senior-auth-gate-heading"
                    className="text-2xl font-bold text-[#1C1917]"
                  >
                    Sign in to access Senior & Family Companion Bookings
                  </h1>
                  <p className="text-sm text-[#57534E] leading-relaxed">
                    Please authenticate with your Google account via Firebase Authentication to book
                    hospital accompaniment, errands, or companionship visits, or to manage family
                    consent links.
                  </p>
                  {authError && (
                    <div
                      role="alert"
                      className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B]"
                    >
                      {authError}
                    </div>
                  )}
                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSignInGoogle}
                      disabled={authBusy}
                      className="px-5 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] disabled:opacity-50"
                    >
                      {authBusy ? 'Signing In...' : 'Sign In with Google'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('welcome')}
                      className="px-4 py-2.5 bg-[#FAF8F5] text-[#1C1917] border border-[#D6D0C4] text-sm font-semibold rounded-lg hover:bg-[#F3EFEA]"
                    >
                      Back to Overview
                    </button>
                  </div>
                </div>
              </div>
            ) : !currentUser ? (
              <HeroWelcome
                mode="welcome"
                systemConfig={systemConfig}
                firebaseAuthUser={{
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  displayName: firebaseUser.displayName,
                  emailVerified: firebaseUser.emailVerified,
                }}
                currentUser={null}
                authBusy={authBusy}
                onSignInGoogle={handleSignInGoogle}
                onRegisterUser={handleRegisterUser}
                onStartBookingWithPreset={(service, duration) => {
                  setPresetService(service);
                  setPresetDuration(duration);
                }}
                onNavigateToRoleWorkspace={handleNavigateToRoleWorkspace}
                authError={authError}
              />
            ) : currentUser.role === 'helper' ? (
              <div className="max-w-3xl mx-auto px-6 py-12">
                <div
                  role="alert"
                  className="bg-white border border-[#E7E2DA] rounded-xl p-8 space-y-4"
                >
                  <h1 className="text-2xl font-bold text-[#1C1917]">
                    Senior & Family Role Required
                  </h1>
                  <p className="text-sm text-[#57534E]">
                    You are currently signed in as <strong>{currentUser.fullName}</strong> with the{' '}
                    <strong>Companion Helper</strong> role. Helpers manage their schedule and
                    assigned visits from the Helper Portal.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('helper_workspace')}
                    className="px-4 py-2.5 bg-[#1C1917] text-white text-xs font-semibold rounded-lg hover:bg-[#292524]"
                  >
                    Go to Helper Portal
                  </button>
                </div>
              </div>
            ) : (
              <SeniorFamilyWorkspace
                currentUser={currentUser}
                isSandboxMode={isSandboxMode}
                seniors={seniors}
                familyLinks={familyLinks}
                bookings={bookings}
                reviews={reviews}
                systemConfig={systemConfig}
                onOpenNewBooking={() => setBookingModalOpen(true)}
                onSelectBooking={(b) => setSelectedBookingId(b.bookingId)}
                onRequestFamilyLink={handleRequestFamilyLink}
                onUpdateFamilyLinkStatus={handleUpdateFamilyLinkStatus}
                onCreateSeniorProfile={handleCreateSeniorProfile}
                onUpdateSeniorProfile={async (updated) => {
                  const nowIso = new Date().toISOString();
                  setSeniors((prev) =>
                    prev.map((s) =>
                      s.seniorId === updated.seniorId
                        ? { ...updated, updatedAt: nowIso }
                        : s
                    )
                  );
                  const path = `seniorProfiles/${updated.seniorId}`;
                  await withFirestoreWriteFallback(
                    () =>
                      updateDoc(doc(db, 'seniorProfiles', updated.seniorId), {
                        locality: updated.locality,
                        address: updated.address,
                        mobilityNote: updated.mobilityNote,
                        allowFamilyBookings: updated.allowFamilyBookings,
                        updatedAt: serverTimestamp(),
                      }),
                    OperationType.UPDATE,
                    path
                  );
                }}
              />
            )}
          </>
        )}

        {/* Role-Aware Route: Helper Portal */}
        {authReady && !profileLoading && activeTab === 'helper_workspace' && (
          <>
            {!firebaseUser ? (
              <div className="max-w-3xl mx-auto px-6 py-12">
                <div
                  role="region"
                  aria-labelledby="helper-auth-gate-heading"
                  className="bg-white border border-[#E7E2DA] rounded-xl p-8 space-y-4"
                >
                  <div className="text-xs font-semibold text-[#9A3412]">
                    Role-Protected Workspace · Companion Helper Portal
                  </div>
                  <h1
                    id="helper-auth-gate-heading"
                    className="text-2xl font-bold text-[#1C1917]"
                  >
                    Sign in to access Helper Schedule & Verification Status
                  </h1>
                  <p className="text-sm text-[#57534E] leading-relaxed">
                    Companion helpers must sign in with Google to view their verification status,
                    update availability, and accept or update assigned senior visits.
                  </p>
                  {authError && (
                    <div
                      role="alert"
                      className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B]"
                    >
                      {authError}
                    </div>
                  )}
                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSignInGoogle}
                      disabled={authBusy}
                      className="px-5 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] disabled:opacity-50"
                    >
                      {authBusy ? 'Signing In...' : 'Sign In with Google'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('welcome')}
                      className="px-4 py-2.5 bg-[#FAF8F5] text-[#1C1917] border border-[#D6D0C4] text-sm font-semibold rounded-lg hover:bg-[#F3EFEA]"
                    >
                      Back to Overview
                    </button>
                  </div>
                </div>
              </div>
            ) : !currentUser ? (
              <HeroWelcome
                mode="welcome"
                systemConfig={systemConfig}
                firebaseAuthUser={{
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  displayName: firebaseUser.displayName,
                  emailVerified: firebaseUser.emailVerified,
                }}
                currentUser={null}
                authBusy={authBusy}
                onSignInGoogle={handleSignInGoogle}
                onRegisterUser={handleRegisterUser}
                onStartBookingWithPreset={(service, duration) => {
                  setPresetService(service);
                  setPresetDuration(duration);
                }}
                onNavigateToRoleWorkspace={handleNavigateToRoleWorkspace}
                authError={authError}
              />
            ) : currentUser.role !== 'helper' && currentUser.role !== 'admin' ? (
              <div className="max-w-3xl mx-auto px-6 py-12">
                <div
                  role="alert"
                  className="bg-white border border-[#E7E2DA] rounded-xl p-8 space-y-4"
                >
                  <h1 className="text-2xl font-bold text-[#1C1917]">
                    Companion Helper Role Required
                  </h1>
                  <p className="text-sm text-[#57534E]">
                    You are currently signed in as <strong>{currentUser.fullName}</strong> (
                    <strong>{currentUser.role.replace('_', ' ')}</strong>). Only registered
                    companion helpers can access the Helper Portal.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="px-4 py-2.5 bg-[#1C1917] text-white text-xs font-semibold rounded-lg hover:bg-[#292524]"
                  >
                    Return to Senior & Family Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <HelperWorkspace
                currentUser={currentUser}
                isSandboxMode={isSandboxMode}
                helpers={helpers}
                availabilities={availabilities}
                bookings={bookings}
                reviews={reviews}
                systemConfig={systemConfig}
                onSelectBooking={(b) => setSelectedBookingId(b.bookingId)}
                onTransitionStatus={(booking, toStatus, note) =>
                  handleTransitionBookingStatus(booking, toStatus, note)
                }
                onUpdateHelperProfile={async (updated) => {
                  const nowIso = new Date().toISOString();
                  setHelpers((prev) =>
                    prev.map((h) =>
                      h.helperId === updated.helperId
                        ? { ...updated, updatedAt: nowIso }
                        : h
                    )
                  );
                  const path = `helpers/${updated.helperId}`;
                  await withFirestoreWriteFallback(
                    () =>
                      updateDoc(doc(db, 'helpers', updated.helperId), {
                        isActive: updated.isActive,
                        updatedAt: serverTimestamp(),
                      }),
                    OperationType.UPDATE,
                    path
                  );
                }}
                onUpdateAvailability={async (updated) => {
                  const nowIso = new Date().toISOString();
                  const nextAvail = { ...updated, updatedAt: nowIso };
                  setAvailabilities((prev) => {
                    const exists = prev.some(
                      (a) => a.availabilityId === updated.availabilityId
                    );
                    return exists
                      ? prev.map((a) =>
                          a.availabilityId === updated.availabilityId
                            ? nextAvail
                            : a
                        )
                      : [nextAvail, ...prev];
                  });
                  const path = `availability/${updated.availabilityId}`;
                  await withFirestoreWriteFallback(
                    () =>
                      setDoc(doc(db, 'availability', updated.availabilityId), {
                        ...updated,
                        updatedAt: serverTimestamp(),
                      }),
                    OperationType.WRITE,
                    path
                  );
                }}
              />
            )}
          </>
        )}

        {/* Role-Aware Route: Coordinator Admin Desk */}
        {authReady && !profileLoading && activeTab === 'admin_workspace' && (
          <AdminWorkspace
            currentUser={currentUser}
            isSandboxMode={isSandboxMode}
            bookings={bookings}
            helpers={helpers}
            incidents={incidents}
            systemConfig={systemConfig}
            onSelectBooking={(b) => setSelectedBookingId(b.bookingId)}
            onAssignHelperToBooking={(booking, helper) =>
              handleTransitionBookingStatus(
                booking,
                'assigned',
                `Coordinator assigned verified helper ${helper.fullName}. Awaiting helper acceptance.`,
                helper
              )
            }
            onVerifyHelper={handleVerifyHelper}
            onUpdateSystemConfig={handleUpdateSystemConfig}
            onUpdateIncident={handleUpdateIncident}
            onSignInGoogle={handleSignInGoogle}
            onReturnHome={handleNavigateToRoleWorkspace}
          />
        )}
      </main>

      {/* Booking Creation Modal */}
      {currentUser && (
        <BookingFormModal
          isOpen={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
          currentUser={currentUser}
          availableSeniors={seniors}
          familyLinks={familyLinks}
          helpers={helpers}
          availabilities={availabilities}
          existingBookings={bookings}
          systemConfig={systemConfig}
          initialServiceType={presetService}
          initialDurationHours={presetDuration}
          onCreateSeniorProfile={handleCreateSeniorProfile}
          onRequestFamilyLink={handleRequestFamilyLink}
          onSubmitBooking={handleSubmitBooking}
          onBookingConfirmed={(createdBooking) => {
            setBookingModalOpen(false);
            setSelectedBookingId(createdBooking.bookingId);
            setActiveTab('dashboard');
          }}
        />
      )}

      {/* Booking Details & Timeline Drawer */}
      {currentUser && selectedBooking && (
        <BookingDetailsDrawer
          booking={selectedBooking}
          events={selectedBookingEvents}
          existingReview={selectedBookingReview}
          currentUser={currentUser}
          onClose={() => setSelectedBookingId(null)}
          onTransitionStatus={(b, toStatus, note) =>
            handleTransitionBookingStatus(b, toStatus, note)
          }
          onSubmitReview={handleSubmitReview}
          onRecordAuditEvent={handleRecordBookingAuditEvent}
          onUpdatePaymentStatus={handleUpdateBookingPaymentStatus}
          onOpenIncidentForBooking={(bId) => {
            setSelectedBookingId(null);
            setSupportBookingId(bId);
            setSupportModalOpen(true);
          }}
        />
      )}

      {/* Support & Incident Reporting Modal */}
      <IncidentSupportModal
        isOpen={supportModalOpen}
        initialBookingId={supportBookingId}
        onClose={() => setSupportModalOpen(false)}
        currentUser={currentUser}
        myIncidents={
          currentUser?.role === 'admin'
            ? incidents
            : incidents.filter((i) => i.reporterUid === currentUser?.uid)
        }
        supportPhone={systemConfig.supportPhone}
        supportEmail={systemConfig.supportEmail}
        onSubmitIncident={handleSubmitIncident}
      />

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-[#E7E2DA] px-6 py-6 mt-16 text-xs text-[#57534E]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <strong className="text-[#1C1917]">SaathiCare Bengaluru</strong> · Non-Medical Senior
            Citizen Companion Service · Helpline:{' '}
            <span className="font-mono tabular-nums text-[#1C1917]">
              {systemConfig.supportPhone}
            </span>
          </div>
          <div>
            Not a medical or emergency service. Data retention & privacy policies documented in
            README.
          </div>
        </div>
      </footer>
    </div>
  );
}

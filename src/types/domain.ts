export type UserRole = 'senior' | 'family_member' | 'helper' | 'admin';

export type ServiceType =
  | 'hospital_accompaniment'
  | 'shopping_errands'
  | 'companionship_visit';

export type DurationHours = 2 | 4 | 8;

export type BookingStatus =
  | 'pending_assignment'
  | 'assigned'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'needs_attention';

export type HelperVerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type FamilyLinkStatus = 'pending_consent' | 'active' | 'revoked';

export type IncidentSeverity = 'low' | 'medium' | 'high';

export type IncidentCategory =
  | 'punctuality'
  | 'conduct'
  | 'safety_concern'
  | 'billing_question'
  | 'other';

export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  city: 'Bengaluru';
  createdAt: string;
  updatedAt: string;
}

export interface SeniorProfile {
  seniorId: string;
  fullName: string;
  age: number;
  phone: string;
  locality: string;
  address: string;
  preferredLanguages: string[];
  mobilityNote: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allowFamilyBookings: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyLink {
  linkId: string;
  seniorId: string;
  seniorName: string;
  familyUid: string;
  familyName: string;
  familyEmail: string;
  relationship: string;
  status: FamilyLinkStatus;
  consentNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface HelperProfile {
  helperId: string;
  fullName: string;
  phone: string;
  bio: string;
  languages: string[];
  serviceAreas: string[];
  servicesOffered: ServiceType[];
  yearsExperience: number;
  verificationStatus: HelperVerificationStatus;
  idCheckReviewed: boolean;
  backgroundCheckReviewed: boolean;
  referenceCheckReviewed: boolean;
  trainingCompleted: boolean;
  verificationNotes: string;
  isActive: boolean;
  completedBookingsCount: number;
  createdAt: string;
  updatedAt: string;
}

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface HelperAvailability {
  availabilityId: string;
  helperId: string;
  availableDays: DayOfWeek[];
  startHour: string;
  endHour: string;
  updatedAt: string;
}

export type PaymentStatus =
  | 'pay_later_unconfigured'
  | 'pay_later_pending'
  | 'paid_online'
  | 'paid_after_visit';

export interface BookingRecord {
  bookingId: string;
  bookingRef: string;
  seniorId: string;
  seniorName: string;
  seniorPhone: string;
  bookedByUid: string;
  bookedByName: string;
  bookedByRole: 'senior' | 'family_member';
  serviceType: ServiceType;
  date: string;
  startTime: string;
  durationHours: DurationHours;
  locality: string;
  pickupAddress: string;
  destination: string;
  taskNotes: string;
  basePriceInr: number;
  additionalChargesInr: number;
  totalPriceInr: number;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  assignedHelperUid: string;
  assignedHelperName: string;
  assignedHelperPhone: string;
  locationConsentGranted: boolean;
  nonMedicalAcknowledged: boolean;
  cancellationReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingEventRecord {
  eventId: string;
  bookingId: string;
  seniorId: string;
  bookedByUid: string;
  assignedHelperUid: string;
  fromStatus: BookingStatus | 'none';
  toStatus: BookingStatus;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  note: string;
  createdAt: string;
}

export interface ReviewRecord {
  reviewId: string;
  bookingId: string;
  helperId: string;
  authorUid: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface IncidentRecord {
  incidentId: string;
  bookingId: string;
  reporterUid: string;
  reporterName: string;
  reporterRole: UserRole;
  severity: IncidentSeverity;
  category: IncidentCategory;
  description: string;
  status: IncidentStatus;
  adminResolutionNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfig {
  configId: 'bengaluru';
  city: 'Bengaluru';
  supportPhone: string;
  supportEmail: string;
  serviceAreas: string[];
  rate2HoursInr: number;
  rate4HoursInr: number;
  rate8HoursInr: number;
  hospitalSurchargeInr: number;
  errandsSurchargeInr: number;
  updatedByUid: string;
  updatedAt: string;
}

export interface PriceCalculationResult {
  durationHours: DurationHours;
  serviceType: ServiceType;
  basePriceInr: number;
  additionalChargesInr: number;
  totalPriceInr: number;
  additionalChargeLabel: string;
  paymentNotice: string;
  cancellationPolicy: string;
}

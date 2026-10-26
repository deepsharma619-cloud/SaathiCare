import type {
  BookingEventRecord,
  BookingRecord,
  BookingStatus,
  DayOfWeek,
  DurationHours,
  FamilyLink,
  FamilyLinkStatus,
  HelperAvailability,
  HelperProfile,
  HelperVerificationStatus,
  PriceCalculationResult,
  SeniorProfile,
  ServiceType,
  SystemConfig,
  UserRole,
} from '../types/domain';

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  configId: 'bengaluru',
  city: 'Bengaluru',
  supportPhone: '+91-80-4123-9800',
  supportEmail: 'care.blr@saathicare.in',
  serviceAreas: [
    'Indiranagar',
    'Jayanagar',
    'Koramangala',
    'Malleshwaram',
    'JP Nagar',
    'Sadashivanagar',
    'HSR Layout',
    'Whitefield',
  ],
  rate2HoursInr: 500,
  rate4HoursInr: 900,
  rate8HoursInr: 1600,
  hospitalSurchargeInr: 150,
  errandsSurchargeInr: 50,
  updatedByUid: 'system',
  updatedAt: '2026-10-25T00:00:00.000Z',
};

export const SERVICE_CATALOG: Record<
  ServiceType,
  {
    title: string;
    shortLabel: string;
    description: string;
    includedTasks: string[];
    excludedNotice: string;
  }
> = {
  hospital_accompaniment: {
    title: 'Hospital or Clinic Accompaniment',
    shortLabel: 'Hospital / Clinic Visit',
    description:
      'Calm, attentive doorway-to-registration accompaniment for routine outpatient check-ups, diagnostic visits, and ophthalmology or dental appointments.',
    includedTasks: [
      'Doorstep pickup assistance and cab/auto coordination',
      'Outpatient registration desk & billing queue assistance',
      'Note-taking during non-emergency doctor consultations if requested',
      'Safe return home and family status check-in',
    ],
    excludedNotice:
      'Non-medical assistance only. Does not include nursing, clinical care, injections, wound dressing, or emergency ambulance response.',
  },
  shopping_errands: {
    title: 'Shopping and Errands',
    shortLabel: 'Shopping & Errands',
    description:
      'Patient assistance with neighborhood grocery shopping, bank or post office visits, pharmacy pickups, and household errands.',
    includedTasks: [
      'Carrying shopping bags and navigating local markets',
      'Bank passbook updates, pension life-certificate visits, or utility errands',
      'Reading product labels, expiry dates, and receipts clearly',
      'Unpacking groceries safely at home',
    ],
    excludedNotice:
      'Non-medical assistance only. Helpers do not handle large cash transactions, PINs, or prescription alterations.',
  },
  companionship_visit: {
    title: 'Companionship Visits',
    shortLabel: 'Companionship Visit',
    description:
      'Unhurried home or park visits for conversation, reading newspapers aloud, board games, gentle courtyard walks, and digital phone help.',
    includedTasks: [
      'Conversation in preferred Indian languages (Kannada, English, Hindi, Tamil, Telugu)',
      'Accompanied morning or evening walks in neighborhood parks',
      'Reading books, newspapers, or helping with family video calls',
      'Light tea-time preparation and reassuring presence',
    ],
    excludedNotice:
      'Non-medical companionship only. Does not include personal bathing, lifting, clinical caregiving, or medication administration.',
  },
};

export const BOOKING_STATUS_METADATA: Record<
  BookingStatus,
  {
    label: string;
    stepOrder: number;
    summary: string;
    badgeTone: 'amber' | 'blue' | 'indigo' | 'teal' | 'emerald' | 'slate' | 'rose';
  }
> = {
  pending_assignment: {
    label: 'Pending Assignment',
    stepOrder: 1,
    summary: 'Booking recorded. Waiting for an administrator to assign an eligible verified helper.',
    badgeTone: 'amber',
  },
  assigned: {
    label: 'Helper Assigned (Awaiting Acceptance)',
    stepOrder: 2,
    summary: 'An administrator selected a helper. Assignment is not confirmed until the helper accepts.',
    badgeTone: 'blue',
  },
  accepted: {
    label: 'Confirmed by Helper',
    stepOrder: 3,
    summary: 'The assigned helper has accepted the visit schedule and reviewed the pickup notes.',
    badgeTone: 'indigo',
  },
  arrived: {
    label: 'Helper Arrived at Pickup',
    stepOrder: 4,
    summary: 'The helper has arrived at the senior citizen pickup address.',
    badgeTone: 'teal',
  },
  in_progress: {
    label: 'Visit in Progress',
    stepOrder: 5,
    summary: 'Non-medical accompaniment is currently underway.',
    badgeTone: 'teal',
  },
  completed: {
    label: 'Visit Completed',
    stepOrder: 6,
    summary: 'Visit concluded safely. Eligible for post-visit feedback.',
    badgeTone: 'emerald',
  },
  cancelled: {
    label: 'Cancelled',
    stepOrder: 0,
    summary: 'Booking was cancelled before completion.',
    badgeTone: 'slate',
  },
  needs_attention: {
    label: 'Needs Coordinator Attention',
    stepOrder: 0,
    summary: 'Flagged for immediate review by the SaathiCare Bengaluru coordination desk.',
    badgeTone: 'rose',
  },
};

export function calculateBookingPrice(
  durationHours: DurationHours,
  serviceType: ServiceType,
  config: SystemConfig = DEFAULT_SYSTEM_CONFIG
): PriceCalculationResult {
  if (![2, 4, 8].includes(durationHours)) {
    throw new Error('Duration must be 2 hours, 4 hours, or 8 hours (Full Day).');
  }

  let basePriceInr = config.rate2HoursInr;
  if (durationHours === 4) {
    basePriceInr = config.rate4HoursInr;
  } else if (durationHours === 8) {
    basePriceInr = config.rate8HoursInr;
  }

  let additionalChargesInr = 0;
  let additionalChargeLabel = 'No additional service surcharge';

  if (serviceType === 'hospital_accompaniment') {
    additionalChargesInr = config.hospitalSurchargeInr;
    additionalChargeLabel = 'Hospital / clinic coordination & desk assistance fee';
  } else if (serviceType === 'shopping_errands') {
    additionalChargesInr = config.errandsSurchargeInr;
    additionalChargeLabel = 'Local errand & bag-assistance surcharge';
  } else if (serviceType !== 'companionship_visit') {
    throw new Error('Invalid service type.');
  }

  const totalPriceInr = basePriceInr + additionalChargesInr;

  return {
    durationHours,
    serviceType,
    basePriceInr,
    additionalChargesInr,
    totalPriceInr,
    additionalChargeLabel,
    paymentNotice:
      'Configured: Pay Online Instantly via UPI / Digital Payment or choose Pay Later after visit completion.',
    cancellationPolicy:
      'Free cancellation up to 4 hours before the scheduled start time. Cancellations within 4 hours of start time may incur a ₹150 coordinator dispatch fee.',
  };
}

export function generateBookingReference(dateStr: string, suffixSeed?: string): string {
  const compactDate = dateStr.replace(/[^0-9]/g, '').slice(0, 8) || '20261026';
  const rawSuffix =
    suffixSeed ||
    Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '7')
      .padEnd(4, '9');
  return `SC-BLR-${compactDate}-${rawSuffix.slice(0, 4).toUpperCase()}`;
}

export function parseTimeToMinutes(timeStr: string): number {
  const match = /^([0-9]{2}):([0-9]{2})$/.exec(timeStr.trim());
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM.`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Out-of-range time: ${timeStr}`);
  }
  return hours * 60 + minutes;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingBookingRef?: string;
  reason?: string;
}

export function checkHelperScheduleConflict(
  helperUid: string,
  targetDate: string,
  targetStartTime: string,
  targetDurationHours: DurationHours,
  existingBookings: BookingRecord[],
  excludeBookingId?: string
): ConflictCheckResult {
  const targetStart = parseTimeToMinutes(targetStartTime);
  const targetEnd = targetStart + targetDurationHours * 60;

  const activeStatuses: BookingStatus[] = ['assigned', 'accepted', 'arrived', 'in_progress'];

  for (const booking of existingBookings) {
    if (excludeBookingId && booking.bookingId === excludeBookingId) {
      continue;
    }
    if (booking.assignedHelperUid !== helperUid) {
      continue;
    }
    if (booking.date !== targetDate) {
      continue;
    }
    if (!activeStatuses.includes(booking.status)) {
      continue;
    }

    const existingStart = parseTimeToMinutes(booking.startTime);
    const existingEnd = existingStart + booking.durationHours * 60;

    // Two intervals [A, B) and [C, D) overlap iff A < D && C < B
    if (targetStart < existingEnd && existingStart < targetEnd) {
      return {
        hasConflict: true,
        conflictingBookingRef: booking.bookingRef,
        reason: `Schedule conflict with booking ${booking.bookingRef} (${booking.startTime} for ${booking.durationHours}h on ${booking.date}).`,
      };
    }
  }

  return { hasConflict: false };
}

export function getWeekdayCode(dateStr: string): DayOfWeek {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const utcDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const dayMap: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayMap[utcDate.getUTCDay()];
}

export function checkHelperAvailabilityWindow(
  targetDate: string,
  targetStartTime: string,
  targetDurationHours: DurationHours,
  availability?: HelperAvailability | null
): { available: boolean; reason?: string } {
  if (!availability) {
    return { available: true };
  }
  const dayCode = getWeekdayCode(targetDate);
  if (!availability.availableDays.includes(dayCode)) {
    return {
      available: false,
      reason: `Helper is not scheduled to work on ${dayCode} (available days: ${availability.availableDays.join(', ')}).`,
    };
  }
  const visitStart = parseTimeToMinutes(targetStartTime);
  const visitEnd = visitStart + targetDurationHours * 60;
  const shiftStart = parseTimeToMinutes(availability.startHour);
  const shiftEnd = parseTimeToMinutes(availability.endHour);

  if (visitStart < shiftStart || visitEnd > shiftEnd) {
    return {
      available: false,
      reason: `Visit window (${targetStartTime} for ${targetDurationHours}h) falls outside helper shift hours (${availability.startHour}–${availability.endHour}).`,
    };
  }
  return { available: true };
}

export interface ValidateBookingCreateInput {
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  seniorProfile: SeniorProfile;
  familyLink?: FamilyLink | null;
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
  clientSuppliedTotalInr?: number;
  config?: SystemConfig;
}

export function validateBookingCreationInput(input: ValidateBookingCreateInput): {
  valid: boolean;
  error?: string;
  price?: PriceCalculationResult;
} {
  const config = input.config || DEFAULT_SYSTEM_CONFIG;

  if (!input.actorUid || input.actorUid.trim().length === 0) {
    return { valid: false, error: 'Authentication required to create a booking.' };
  }

  if (
    input.actorRole !== 'senior' &&
    input.actorRole !== 'family_member' &&
    input.actorRole !== 'admin'
  ) {
    return {
      valid: false,
      error: 'Only a Senior Citizen, an authorized Family Member, or a Coordinator Admin can create a companion booking.',
    };
  }

  if (input.actorRole === 'senior') {
    if (input.seniorProfile.seniorId !== input.actorUid) {
      return {
        valid: false,
        error: 'A senior citizen can only create bookings for their own profile.',
      };
    }
  } else if (input.actorRole === 'family_member') {
    if (!input.seniorProfile.allowFamilyBookings) {
      return {
        valid: false,
        error: `${input.seniorProfile.fullName} has disabled family-initiated bookings on their profile.`,
      };
    }
    if (
      !input.familyLink ||
      input.familyLink.seniorId !== input.seniorProfile.seniorId ||
      input.familyLink.familyUid !== input.actorUid ||
      input.familyLink.status !== 'active'
    ) {
      return {
        valid: false,
        error:
          'Explicit active consent from the senior citizen is required before a family member can book on their behalf.',
      };
    }
  }

  if (!input.nonMedicalAcknowledged) {
    return {
      valid: false,
      error:
        'You must acknowledge that SaathiCare provides non-medical companion assistance only.',
    };
  }

  if (!input.locationConsentGranted) {
    return {
      valid: false,
      error:
        'Explicit consent to share the pickup address and visit check-in status with the assigned helper is required.',
    };
  }

  if (!config.serviceAreas.includes(input.locality)) {
    return {
      valid: false,
      error: `Locality "${input.locality}" is outside our active Bengaluru service areas (${config.serviceAreas.join(', ')}).`,
    };
  }

  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)) {
    return { valid: false, error: 'Please select a valid visit date (YYYY-MM-DD).' };
  }

  try {
    const minutes = parseTimeToMinutes(input.startTime);
    if (minutes < 6 * 60 || minutes > 20 * 60) {
      return {
        valid: false,
        error: 'Visit start time must be within standard companion hours (06:00 to 20:00).',
      };
    }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid start time.' };
  }

  if (!input.pickupAddress || input.pickupAddress.trim().length < 5) {
    return {
      valid: false,
      error: 'Please enter a complete pickup address in Bengaluru (minimum 5 characters).',
    };
  }

  if (input.pickupAddress.trim().length > 300) {
    return { valid: false, error: 'Pickup address cannot exceed 300 characters.' };
  }

  if (input.destination.trim().length > 200) {
    return { valid: false, error: 'Destination cannot exceed 200 characters.' };
  }

  if (input.taskNotes.trim().length > 500) {
    return { valid: false, error: 'Task notes cannot exceed 500 characters.' };
  }

  let price: PriceCalculationResult;
  try {
    price = calculateBookingPrice(input.durationHours, input.serviceType, config);
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid pricing parameters.' };
  }

  if (
    typeof input.clientSuppliedTotalInr === 'number' &&
    input.clientSuppliedTotalInr !== price.totalPriceInr
  ) {
    return {
      valid: false,
      error: `Client-supplied price (₹${input.clientSuppliedTotalInr}) does not match server-calculated price (₹${price.totalPriceInr}).`,
    };
  }

  return { valid: true, price };
}

export interface TransitionValidationInput {
  booking: BookingRecord;
  toStatus: BookingStatus;
  actorUid: string;
  actorRole: UserRole;
  targetHelper?: HelperProfile | null;
  targetHelperAvailability?: HelperAvailability | null;
  existingBookings?: BookingRecord[];
  reasonOrNote?: string;
}

export function validateBookingTransition(input: TransitionValidationInput): {
  valid: boolean;
  error?: string;
  auditNote?: string;
} {
  const {
    booking,
    toStatus,
    actorUid,
    actorRole,
    targetHelper,
    targetHelperAvailability = null,
    existingBookings = [],
    reasonOrNote = '',
  } = input;
  const fromStatus = booking.status;

  if (fromStatus === toStatus && toStatus !== 'assigned') {
    return { valid: false, error: `Booking is already in "${fromStatus}" status.` };
  }

  // Terminal State Locking: completed and cancelled bookings cannot be altered by non-admins
  if ((fromStatus === 'completed' || fromStatus === 'cancelled') && actorRole !== 'admin') {
    return {
      valid: false,
      error: `Booking ${booking.bookingRef} is in terminal state "${fromStatus}" and cannot be modified.`,
    };
  }

  // 1. Assignment: pending_assignment | needs_attention | assigned -> assigned (Admin only)
  if (toStatus === 'assigned') {
    if (actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only an authorized Administrator can assign a helper to a booking.',
      };
    }
    if (!['pending_assignment', 'needs_attention', 'assigned'].includes(fromStatus)) {
      return {
        valid: false,
        error: `Cannot assign a helper when booking is in "${fromStatus}" state.`,
      };
    }
    if (!targetHelper) {
      return { valid: false, error: 'A valid helper profile must be selected for assignment.' };
    }
    if (targetHelper.verificationStatus !== 'approved') {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} is "${targetHelper.verificationStatus}". Only "approved" helpers can be assigned.`,
      };
    }
    if (
      !targetHelper.idCheckReviewed ||
      !targetHelper.backgroundCheckReviewed ||
      !targetHelper.referenceCheckReviewed ||
      !targetHelper.trainingCompleted
    ) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} has incomplete verification checks.`,
      };
    }
    if (!targetHelper.isActive) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} is currently marked inactive.`,
      };
    }
    if (!targetHelper.serviceAreas.includes(booking.locality)) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} does not cover ${booking.locality} (covers: ${targetHelper.serviceAreas.join(', ')}).`,
      };
    }
    if (!targetHelper.servicesOffered.includes(booking.serviceType)) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} is not enrolled for service type "${booking.serviceType}".`,
      };
    }

    const availabilityWindow = checkHelperAvailabilityWindow(
      booking.date,
      booking.startTime,
      booking.durationHours,
      targetHelperAvailability
    );
    if (!availabilityWindow.available) {
      return {
        valid: false,
        error:
          availabilityWindow.reason ||
          'Helper is unavailable during the requested time window.',
      };
    }

    const conflict = checkHelperScheduleConflict(
      targetHelper.helperId,
      booking.date,
      booking.startTime,
      booking.durationHours,
      existingBookings,
      booking.bookingId
    );
    if (conflict.hasConflict) {
      return {
        valid: false,
        error: conflict.reason || 'Helper has a conflicting booking on this schedule.',
      };
    }

    return {
      valid: true,
      auditNote:
        reasonOrNote.trim() ||
        `Assigned verified helper ${targetHelper.fullName}. Awaiting helper acceptance.`,
    };
  }

  // 2. Helper Acceptance: assigned -> accepted (Assigned Helper or Coordinator Admin)
  if (toStatus === 'accepted') {
    if (fromStatus !== 'assigned') {
      return {
        valid: false,
        error: `Booking must be in "assigned" state before acceptance (current: "${fromStatus}").`,
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only the assigned helper can accept and confirm this booking assignment.',
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || 'Helper accepted the assignment and confirmed schedule.',
    };
  }

  // 3. Helper Arrived: accepted -> arrived (Assigned Helper only)
  if (toStatus === 'arrived') {
    if (fromStatus !== 'accepted') {
      return {
        valid: false,
        error: `Booking must be "accepted" before marking arrival (current: "${fromStatus}").`,
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only the assigned helper can mark arrival at the pickup address.',
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || 'Helper arrived at the senior citizen pickup address.',
    };
  }

  // 4. Visit In Progress: arrived -> in_progress (Assigned Helper only)
  if (toStatus === 'in_progress') {
    if (fromStatus !== 'arrived') {
      return {
        valid: false,
        error: `Helper must mark "arrived" before starting the visit (current: "${fromStatus}").`,
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only the assigned helper can transition the visit to in_progress.',
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || 'Companion accompaniment visit started.',
    };
  }

  // 5. Visit Completed: in_progress -> completed (Assigned Helper only)
  if (toStatus === 'completed') {
    if (fromStatus !== 'in_progress') {
      return {
        valid: false,
        error: `Visit must be "in_progress" before marking completed (current: "${fromStatus}").`,
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only the assigned helper can mark the visit completed.',
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || 'Companion visit completed safely.',
    };
  }

  // 6. Cancellation: pending_assignment | assigned | accepted -> cancelled
  if (toStatus === 'cancelled') {
    const isParticipantBooker =
      booking.seniorId === actorUid || booking.bookedByUid === actorUid;
    if (!isParticipantBooker && actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only the senior citizen, the booking creator, or an administrator can cancel a booking.',
      };
    }
    if (!['pending_assignment', 'assigned', 'accepted', 'needs_attention'].includes(fromStatus) && actorRole !== 'admin') {
      return {
        valid: false,
        error: `Cannot self-cancel once the helper has arrived or the visit is "${fromStatus}". Please flag Needs Attention or contact support.`,
      };
    }
    if (!reasonOrNote || reasonOrNote.trim().length < 3) {
      return {
        valid: false,
        error: 'Please provide a brief cancellation reason (minimum 3 characters).',
      };
    }
    return {
      valid: true,
      auditNote: `Cancelled: ${reasonOrNote.trim()}`,
    };
  }

  // 7. Needs Attention: assigned | accepted | arrived | in_progress -> needs_attention
  if (toStatus === 'needs_attention') {
    const isAuthorizedParticipant =
      booking.seniorId === actorUid ||
      booking.bookedByUid === actorUid ||
      booking.assignedHelperUid === actorUid ||
      actorRole === 'admin';
    if (!isAuthorizedParticipant) {
      return {
        valid: false,
        error: 'Only booking participants or administrators can flag a booking for coordinator attention.',
      };
    }
    if (!['assigned', 'accepted', 'arrived', 'in_progress'].includes(fromStatus) && actorRole !== 'admin') {
      return {
        valid: false,
        error: `Cannot flag "${fromStatus}" booking as needs_attention.`,
      };
    }
    if (!reasonOrNote || reasonOrNote.trim().length < 3) {
      return {
        valid: false,
        error: 'Please describe why coordinator attention is needed (minimum 3 characters).',
      };
    }
    return {
      valid: true,
      auditNote: `Flagged Needs Attention: ${reasonOrNote.trim()}`,
    };
  }

  return {
    valid: false,
    error: `Transition from "${fromStatus}" to "${toStatus}" is not allowed.`,
  };
}

export function validateHelperVerificationUpdate(
  actorRole: UserRole,
  payload: {
    verificationStatus: HelperVerificationStatus;
    idCheckReviewed: boolean;
    backgroundCheckReviewed: boolean;
    referenceCheckReviewed: boolean;
    trainingCompleted: boolean;
    verificationNotes: string;
  }
): { valid: boolean; error?: string } {
  if (actorRole !== 'admin') {
    return {
      valid: false,
      error: 'Unauthorized: Only an Administrator can update helper verification status.',
    };
  }
  if (!['pending', 'approved', 'rejected', 'suspended'].includes(payload.verificationStatus)) {
    return { valid: false, error: 'Invalid verification status.' };
  }
  if (payload.verificationStatus === 'approved') {
    if (
      !payload.idCheckReviewed ||
      !payload.backgroundCheckReviewed ||
      !payload.referenceCheckReviewed ||
      !payload.trainingCompleted
    ) {
      return {
        valid: false,
        error:
          'Cannot mark helper as Approved until all 4 required checks (Government ID, Police/Background Verification, 2 Local References, and Non-Medical Companion Orientation) are reviewed and checked.',
      };
    }
  }
  return { valid: true };
}

export function validateFamilyLinkTransition(
  actorUid: string,
  actorRole: UserRole,
  existingLink: FamilyLink,
  nextStatus: FamilyLinkStatus,
  consentNote: string
): { valid: boolean; error?: string } {
  if (!consentNote || consentNote.trim().length < 2) {
    return { valid: false, error: 'Please include a short consent or revocation note.' };
  }
  if (nextStatus === 'active') {
    if (existingLink.seniorId !== actorUid && actorRole !== 'admin') {
      return {
        valid: false,
        error: 'Only the Senior Citizen can grant explicit consent to activate a family booking link.',
      };
    }
    return { valid: true };
  }
  if (nextStatus === 'revoked') {
    if (
      existingLink.seniorId !== actorUid &&
      existingLink.familyUid !== actorUid &&
      actorRole !== 'admin'
    ) {
      return {
        valid: false,
        error: 'Only the Senior Citizen, the linked Family Member, or an Admin can revoke family access.',
      };
    }
    return { valid: true };
  }
  return { valid: false, error: `Invalid family link transition to "${nextStatus}".` };
}

export async function executeDatabaseBackedBookingCreate(
  input: ValidateBookingCreateInput,
  persistToDatabase: (
    bookingRecord: BookingRecord,
    initialEvent: BookingEventRecord
  ) => Promise<void>,
  options?: {
    bookingId?: string;
    eventId?: string;
    referenceSuffix?: string;
    nowIso?: string;
    availableHelpers?: HelperProfile[];
    helperAvailabilities?: HelperAvailability[];
    existingBookings?: BookingRecord[];
  }
): Promise<{ bookingRecord: BookingRecord; initialEvent: BookingEventRecord }> {
  const validation = validateBookingCreationInput(input);
  if (!validation.valid || !validation.price) {
    throw new Error(validation.error || 'Booking validation failed.');
  }

  const nowIso = options?.nowIso || new Date().toISOString();
  const bookingId = options?.bookingId || `booking_${Date.now()}`;
  const eventId = options?.eventId || `evt_${Date.now()}`;
  const bookingRef = generateBookingReference(input.date, options?.referenceSuffix);

  const selection =
    options?.availableHelpers && options.availableHelpers.length > 0
      ? selectAvailableHelperForBooking({
          serviceType: input.serviceType,
          locality: input.locality,
          date: input.date,
          startTime: input.startTime,
          durationHours: input.durationHours,
          helpers: options.availableHelpers,
          availabilities: options.helperAvailabilities || [],
          existingBookings: options.existingBookings || [],
        })
      : null;

  const matchedHelper = selection?.matchedHelper || null;
  const initialStatus = matchedHelper ? 'assigned' : 'pending_assignment';

  const bookingRecord: BookingRecord = {
    bookingId,
    bookingRef,
    seniorId: input.seniorProfile.seniorId,
    seniorName: input.seniorProfile.fullName,
    seniorPhone: input.seniorProfile.phone,
    bookedByUid: input.actorUid,
    bookedByName: input.actorName,
    bookedByRole: input.actorRole as 'senior' | 'family_member',
    serviceType: input.serviceType,
    date: input.date,
    startTime: input.startTime,
    durationHours: input.durationHours,
    locality: input.locality,
    pickupAddress: input.pickupAddress.trim(),
    destination: input.destination.trim(),
    taskNotes: input.taskNotes.trim(),
    basePriceInr: validation.price.basePriceInr,
    additionalChargesInr: validation.price.additionalChargesInr,
    totalPriceInr: validation.price.totalPriceInr,
    paymentStatus: 'pay_later_unconfigured',
    status: initialStatus,
    assignedHelperUid: matchedHelper ? matchedHelper.helperId : '',
    assignedHelperName: matchedHelper ? matchedHelper.fullName : '',
    assignedHelperPhone: matchedHelper ? matchedHelper.phone : '',
    locationConsentGranted: true,
    nonMedicalAcknowledged: true,
    cancellationReason: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const baseCreatorNote =
    input.actorRole === 'family_member'
      ? `Booking created on behalf of ${input.seniorProfile.fullName} by authorized family member ${input.actorName}.`
      : `Booking created by senior citizen ${input.actorName}.`;

  const initialEvent: BookingEventRecord = {
    eventId,
    bookingId,
    seniorId: bookingRecord.seniorId,
    bookedByUid: bookingRecord.bookedByUid,
    assignedHelperUid: bookingRecord.assignedHelperUid,
    fromStatus: 'none',
    toStatus: initialStatus,
    actorUid: input.actorUid,
    actorName: input.actorName,
    actorRole: input.actorRole,
    note: selection ? `${baseCreatorNote} ${selection.assignmentNote}` : baseCreatorNote,
    createdAt: nowIso,
  };

  // Never report success unless the database persistence operation completes without error
  await persistToDatabase(bookingRecord, initialEvent);

  return { bookingRecord, initialEvent };
}

export function redactBookingForRole(
  booking: BookingRecord,
  viewerUid: string,
  viewerRole: UserRole,
  hasActiveFamilyConsent = false
): BookingRecord {
  if (viewerRole === 'admin') {
    return booking;
  }
  if (viewerRole === 'senior' && booking.seniorId === viewerUid) {
    return booking;
  }
  if (
    viewerRole === 'family_member' &&
    (booking.bookedByUid === viewerUid || hasActiveFamilyConsent)
  ) {
    return booking;
  }
  if (viewerRole === 'helper' && booking.assignedHelperUid === viewerUid) {
    if (booking.status === 'cancelled') {
      return {
        ...booking,
        seniorPhone: 'Redacted (Cancelled Booking)',
        pickupAddress: `Redacted — ${booking.locality}, Bengaluru`,
      };
    }
    if (booking.status === 'assigned') {
      return {
        ...booking,
        seniorPhone: 'Visible after accepting assignment',
        pickupAddress: `${booking.locality}, Bengaluru (Full street address revealed upon acceptance)`,
      };
    }
    return booking;
  }
  throw new Error('Unauthorized: You do not have permission to view this booking record.');
}

export function canAccessIncidentRecord(
  incident: { reporterUid: string },
  viewerUid: string,
  viewerRole: UserRole
): boolean {
  if (!viewerUid) return false;
  return viewerRole === 'admin' || incident.reporterUid === viewerUid;
}

export function evaluateEmailNotificationBoundary(envConfig?: {
  emailEnabled?: boolean;
  providerVerified?: boolean;
}): {
  status: 'configured' | 'not_configured';
  delivered: boolean;
  notice: string;
} {
  if (envConfig?.emailEnabled && envConfig?.providerVerified) {
    return {
      status: 'configured',
      delivered: true,
      notice: 'Email notification dispatched via verified provider.',
    };
  }
  return {
    status: 'not_configured',
    delivered: false,
    notice:
      'Email & SMS notifications are not configured. No delivery was simulated; status is persisted in Cloud Firestore.',
  };
}

export function maskPiiEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '[redacted]';
  }
  const [localPart, domainPart] = email.trim().split('@');
  if (!localPart || !domainPart) return '[redacted]';
  const visiblePrefix = localPart.slice(0, 1);
  return `${visiblePrefix}***@${domainPart}`;
}

export function verifyAdminEndpointAuthorization(params: {
  actorRole?: unknown;
  actorEmail?: unknown;
  emailVerified?: unknown;
  bootstrappedAdminEmails: string[];
}): { authorized: boolean; error?: string } {
  if (params.actorRole !== 'admin') {
    return {
      authorized: false,
      error: 'Forbidden: Administrator role is required for this endpoint.',
    };
  }
  if (params.emailVerified === false) {
    return {
      authorized: false,
      error: 'Forbidden: Administrator email must be verified.',
    };
  }
  if (typeof params.actorEmail === 'string' && params.actorEmail.trim().length > 0) {
    const normalized = params.actorEmail.trim().toLowerCase();
    if (
      params.bootstrappedAdminEmails.length > 0 &&
      !params.bootstrappedAdminEmails.includes(normalized)
    ) {
      return {
        authorized: false,
        error: 'Forbidden: Actor email is not in the authorized administrator registry.',
      };
    }
  }
  return { authorized: true };
}

export interface HelperAvailabilityEvaluation {
  helper: HelperProfile;
  isApprovedAndActive: boolean;
  servesLocality: boolean;
  offersService: boolean;
  withinShiftWindow: boolean;
  shiftWindowLabel: string;
  shiftReason?: string;
  hasScheduleConflict: boolean;
  conflictReason?: string;
  eligibleAndAvailable: boolean;
  unavailableSummary?: string;
}

export interface AutomaticHelperSelectionResult {
  matchedHelper: HelperProfile | null;
  initialStatus: 'assigned' | 'pending_assignment';
  evaluations: HelperAvailabilityEvaluation[];
  assignmentNote: string;
}

export function selectAvailableHelperForBooking(params: {
  serviceType: ServiceType;
  locality: string;
  date: string;
  startTime: string;
  durationHours: DurationHours;
  helpers: HelperProfile[];
  availabilities: HelperAvailability[];
  existingBookings: BookingRecord[];
}): AutomaticHelperSelectionResult {
  const {
    serviceType,
    locality,
    date,
    startTime,
    durationHours,
    helpers,
    availabilities,
    existingBookings,
  } = params;

  const evaluations: HelperAvailabilityEvaluation[] = helpers.map((helper) => {
    const all4Checks =
      Boolean(helper.idCheckReviewed) &&
      Boolean(helper.backgroundCheckReviewed) &&
      Boolean(helper.referenceCheckReviewed) &&
      Boolean(helper.trainingCompleted);

    const isApprovedAndActive =
      helper.verificationStatus === 'approved' && Boolean(helper.isActive) && all4Checks;
    const servesLocality = Array.isArray(helper.serviceAreas)
      ? helper.serviceAreas.includes(locality)
      : false;
    const offersService = Array.isArray(helper.servicesOffered)
      ? helper.servicesOffered.includes(serviceType)
      : false;

    const availRecord =
      availabilities.find((a) => a.helperId === helper.helperId) || null;
    const shiftWindowLabel = availRecord
      ? `${availRecord.availableDays.join(', ')} · ${availRecord.startHour}–${availRecord.endHour}`
      : 'All days · 06:00–20:00';

    let withinShiftWindow = true;
    let shiftReason: string | undefined;
    try {
      const shiftCheck = checkHelperAvailabilityWindow(
        date,
        startTime,
        durationHours,
        availRecord
      );
      withinShiftWindow = shiftCheck.available;
      shiftReason = shiftCheck.reason;
    } catch (err) {
      withinShiftWindow = false;
      shiftReason = err instanceof Error ? err.message : 'Invalid schedule window.';
    }

    let hasScheduleConflict = false;
    let conflictReason: string | undefined;
    try {
      const conflictCheck = checkHelperScheduleConflict(
        helper.helperId,
        date,
        startTime,
        durationHours,
        existingBookings
      );
      hasScheduleConflict = conflictCheck.hasConflict;
      conflictReason = conflictCheck.reason;
    } catch (err) {
      hasScheduleConflict = true;
      conflictReason = err instanceof Error ? err.message : 'Schedule conflict check error.';
    }

    const eligibleAndAvailable =
      isApprovedAndActive &&
      servesLocality &&
      offersService &&
      withinShiftWindow &&
      !hasScheduleConflict;

    let unavailableSummary: string | undefined;
    if (!eligibleAndAvailable) {
      if (!isApprovedAndActive) {
        unavailableSummary = `Verification status is "${helper.verificationStatus}" or inactive.`;
      } else if (!servesLocality) {
        unavailableSummary = `Covers ${helper.serviceAreas.join(', ')} (does not cover ${locality}).`;
      } else if (!offersService) {
        unavailableSummary = `Does not offer ${SERVICE_CATALOG[serviceType]?.label || serviceType}.`;
      } else if (!withinShiftWindow) {
        unavailableSummary = shiftReason || 'Outside helper shift window.';
      } else if (hasScheduleConflict) {
        unavailableSummary = conflictReason || 'Overlapping booking conflict on this date/time.';
      }
    }

    return {
      helper,
      isApprovedAndActive,
      servesLocality,
      offersService,
      withinShiftWindow,
      shiftWindowLabel,
      shiftReason,
      hasScheduleConflict,
      conflictReason,
      eligibleAndAvailable,
      unavailableSummary,
    };
  });

  const availableCandidates = evaluations.filter((e) => e.eligibleAndAvailable);
  const matchedHelper = availableCandidates[0]?.helper || null;

  if (matchedHelper) {
    const matchedEval = availableCandidates[0];
    return {
      matchedHelper,
      initialStatus: 'assigned',
      evaluations,
      assignmentNote: `Verified companion helper ${matchedHelper.fullName} (${matchedHelper.phone}) was automatically assigned after passing locality (${locality}), shift-window (${matchedEval.shiftWindowLabel}), and schedule-conflict checks. Awaiting helper acceptance.`,
    };
  }

  return {
    matchedHelper: null,
    initialStatus: 'pending_assignment',
    evaluations,
    assignmentNote:
      'Helper availability checked across all registered companions; no verified helper was immediately available for this date/time/locality slot. Placed in Pending Assignment queue for coordinator dispatch.',
  };
}

export const INITIAL_VERIFIED_HELPERS: Omit<HelperProfile, 'createdAt' | 'updatedAt'>[] = [
  {
    helperId: 'helper_kavitha',
    fullName: 'Kavitha Murthy',
    phone: '+91-98801-23456',
    bio: '6 years of senior companion accompaniment in Bengaluru across Indiranagar, Koramangala, Jayanagar, Malleshwaram, and Whitefield.',
    languages: ['Kannada', 'English', 'Tamil', 'Hindi'],
    serviceAreas: [
      'Indiranagar',
      'Koramangala',
      'Jayanagar',
      'Malleshwaram',
      'HSR Layout',
      'JP Nagar',
      'Whitefield',
      'Sadashivanagar',
    ],
    servicesOffered: [
      'hospital_accompaniment',
      'shopping_errands',
      'companionship_visit',
    ],
    yearsExperience: 6,
    verificationStatus: 'approved',
    idCheckReviewed: true,
    backgroundCheckReviewed: true,
    referenceCheckReviewed: true,
    trainingCompleted: true,
    verificationNotes:
      'All 4 coordinator verification checks completed: Government ID, Bengaluru Police background verification, two senior family references, and non-medical accompaniment orientation.',
    isActive: true,
    completedBookingsCount: 18,
  },
  {
    helperId: 'helper_suresh',
    fullName: 'Suresh Gowda',
    phone: '+91-98802-65432',
    bio: '5 years assisting seniors with outpatient clinic registrations, pharmacy queues, and morning park walks in Bengaluru.',
    languages: ['Kannada', 'English', 'Telugu'],
    serviceAreas: [
      'Jayanagar',
      'JP Nagar',
      'Koramangala',
      'HSR Layout',
      'Indiranagar',
      'Malleshwaram',
    ],
    servicesOffered: [
      'hospital_accompaniment',
      'shopping_errands',
      'companionship_visit',
    ],
    yearsExperience: 5,
    verificationStatus: 'approved',
    idCheckReviewed: true,
    backgroundCheckReviewed: true,
    referenceCheckReviewed: true,
    trainingCompleted: true,
    verificationNotes:
      'All 4 verification checks reviewed and approved by Bengaluru Coordinator Desk.',
    isActive: true,
    completedBookingsCount: 12,
  },
];

export const INITIAL_HELPER_AVAILABILITIES: Omit<HelperAvailability, 'updatedAt'>[] = [
  {
    availabilityId: 'helper_kavitha',
    helperId: 'helper_kavitha',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    startHour: '07:00',
    endHour: '20:00',
  },
  {
    availabilityId: 'helper_suresh',
    helperId: 'helper_suresh',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    startHour: '08:00',
    endHour: '19:00',
  },
];



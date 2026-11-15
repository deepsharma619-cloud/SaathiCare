import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBookingPrice,
  canAccessIncidentRecord,
  checkHelperAvailabilityWindow,
  checkHelperScheduleConflict,
  DEFAULT_SYSTEM_CONFIG,
  evaluateEmailNotificationBoundary,
  executeDatabaseBackedBookingCreate,
  findBookingsReadyForAutomaticArrival,
  generateBookingReference,
  INITIAL_HELPER_AVAILABILITIES,
  INITIAL_VERIFIED_HELPERS,
  isBookingScheduledArrivalReached,
  maskPiiEmail,
  parseBookingScheduledStartMs,
  redactBookingForRole,
  selectAvailableHelperForBooking,
  validateBookingCreationInput,
  validateBookingTransition,
  validateFamilyLinkTransition,
  validateHelperVerificationUpdate,
  verifyAdminEndpointAuthorization,
} from './bookingRules';
import type {
  BookingRecord,
  FamilyLink,
  HelperAvailability,
  HelperProfile,
  SeniorProfile,
} from '../types/domain';

const sampleSenior: SeniorProfile = {
  seniorId: 'senior_rameshwar',
  fullName: 'Rameshwar Rao',
  age: 74,
  phone: '+91-98450-11223',
  locality: 'Indiranagar',
  address: '42, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru',
  preferredLanguages: ['Kannada', 'English'],
  mobilityNote: 'Walks comfortably with a walking stick',
  emergencyContactName: 'Ananya Rao',
  emergencyContactPhone: '+91-98450-44556',
  allowFamilyBookings: true,
  createdAt: '2026-10-20T08:00:00.000Z',
  updatedAt: '2026-10-20T08:00:00.000Z',
};

const activeFamilyLink: FamilyLink = {
  linkId: 'senior_rameshwar_family_ananya',
  seniorId: 'senior_rameshwar',
  seniorName: 'Rameshwar Rao',
  familyUid: 'family_ananya',
  familyName: 'Ananya Rao',
  familyEmail: 'ananya.rao@example.com',
  relationship: 'Daughter',
  status: 'active',
  consentNote: 'Approved by Rameshwar Rao for hospital and errand bookings.',
  createdAt: '2026-10-20T09:00:00.000Z',
  updatedAt: '2026-10-20T09:00:00.000Z',
};

const approvedHelper: HelperProfile = {
  helperId: 'helper_kavitha',
  fullName: 'Kavitha Murthy',
  phone: '+91-98801-23456',
  bio: '6 years of senior companion accompaniment in Bengaluru.',
  languages: ['Kannada', 'English', 'Tamil'],
  serviceAreas: ['Indiranagar', 'Koramangala', 'Jayanagar'],
  servicesOffered: ['hospital_accompaniment', 'shopping_errands', 'companionship_visit'],
  yearsExperience: 6,
  verificationStatus: 'approved',
  idCheckReviewed: true,
  backgroundCheckReviewed: true,
  referenceCheckReviewed: true,
  trainingCompleted: true,
  verificationNotes: 'All 4 checks verified by Bengaluru desk.',
  isActive: true,
  completedBookingsCount: 18,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

const sampleBooking: BookingRecord = {
  bookingId: 'booking_101',
  bookingRef: 'SC-BLR-20261028-A1B2',
  seniorId: 'senior_rameshwar',
  seniorName: 'Rameshwar Rao',
  seniorPhone: '+91-98450-11223',
  bookedByUid: 'senior_rameshwar',
  bookedByName: 'Rameshwar Rao',
  bookedByRole: 'senior',
  serviceType: 'hospital_accompaniment',
  date: '2026-10-28',
  startTime: '09:30',
  durationHours: 4,
  locality: 'Indiranagar',
  pickupAddress: '42, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru',
  destination: 'Manipal Hospital, Old Airport Road',
  taskNotes: 'Ophthalmology check-up at 10:15 AM.',
  basePriceInr: 900,
  additionalChargesInr: 150,
  totalPriceInr: 1050,
  paymentStatus: 'pay_later_unconfigured',
  status: 'pending_assignment',
  assignedHelperUid: '',
  assignedHelperName: '',
  assignedHelperPhone: '',
  locationConsentGranted: true,
  nonMedicalAcknowledged: true,
  cancellationReason: '',
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:00:00.000Z',
};

test('1. Booking creation & price calculation: calculates canonical rates and rejects tampered client prices', () => {
  const price = calculateBookingPrice(4, 'hospital_accompaniment', DEFAULT_SYSTEM_CONFIG);
  assert.equal(price.basePriceInr, 900);
  assert.equal(price.additionalChargesInr, 150);
  assert.equal(price.totalPriceInr, 1050);

  const validSelfBook = validateBookingCreationInput({
    actorUid: 'senior_rameshwar',
    actorName: 'Rameshwar Rao',
    actorRole: 'senior',
    seniorProfile: sampleSenior,
    serviceType: 'hospital_accompaniment',
    date: '2026-10-28',
    startTime: '09:30',
    durationHours: 4,
    locality: 'Indiranagar',
    pickupAddress: '42, 12th Main, Indiranagar, Bengaluru',
    destination: 'Manipal Hospital',
    taskNotes: 'Routine eye checkup',
    locationConsentGranted: true,
    nonMedicalAcknowledged: true,
    clientSuppliedTotalInr: 1050,
  });
  assert.equal(validSelfBook.valid, true);

  // Reject manipulated price
  const tamperedPriceBook = validateBookingCreationInput({
    actorUid: 'senior_rameshwar',
    actorName: 'Rameshwar Rao',
    actorRole: 'senior',
    seniorProfile: sampleSenior,
    serviceType: 'hospital_accompaniment',
    date: '2026-10-28',
    startTime: '09:30',
    durationHours: 4,
    locality: 'Indiranagar',
    pickupAddress: '42, 12th Main, Indiranagar, Bengaluru',
    destination: 'Manipal Hospital',
    taskNotes: 'Routine eye checkup',
    locationConsentGranted: true,
    nonMedicalAcknowledged: true,
    clientSuppliedTotalInr: 200,
  });
  assert.equal(tamperedPriceBook.valid, false);
  assert.match(tamperedPriceBook.error || '', /does not match server-calculated price/);
});

test('2. Access permissions & family consent workflow: blocks unconsented or revoked family bookings', () => {
  // Active family link succeeds
  const allowedFamilyBook = validateBookingCreationInput({
    actorUid: 'family_ananya',
    actorName: 'Ananya Rao',
    actorRole: 'family_member',
    seniorProfile: sampleSenior,
    familyLink: activeFamilyLink,
    serviceType: 'shopping_errands',
    date: '2026-10-29',
    startTime: '10:00',
    durationHours: 2,
    locality: 'Indiranagar',
    pickupAddress: sampleSenior.address,
    destination: 'Indiranagar 100ft Road Market',
    taskNotes: 'Weekly fruits and groceries',
    locationConsentGranted: true,
    nonMedicalAcknowledged: true,
  });
  assert.equal(allowedFamilyBook.valid, true);

  // Revoked link fails immediately
  const revokedLink: FamilyLink = { ...activeFamilyLink, status: 'revoked' };
  const blockedFamilyBook = validateBookingCreationInput({
    actorUid: 'family_ananya',
    actorName: 'Ananya Rao',
    actorRole: 'family_member',
    seniorProfile: sampleSenior,
    familyLink: revokedLink,
    serviceType: 'shopping_errands',
    date: '2026-10-29',
    startTime: '10:00',
    durationHours: 2,
    locality: 'Indiranagar',
    pickupAddress: sampleSenior.address,
    destination: 'Market',
    taskNotes: '',
    locationConsentGranted: true,
    nonMedicalAcknowledged: true,
  });
  assert.equal(blockedFamilyBook.valid, false);
  assert.match(blockedFamilyBook.error || '', /Explicit active consent/);

  // Family member cannot self-activate a pending_consent link
  const pendingLink: FamilyLink = { ...activeFamilyLink, status: 'pending_consent' };
  const selfActivateAttempt = validateFamilyLinkTransition(
    'family_ananya',
    'family_member',
    pendingLink,
    'active',
    'Trying to approve myself'
  );
  assert.equal(selfActivateAttempt.valid, false);
});

test('3. Invalid booking state transitions: enforces pending_assignment -> assigned -> accepted -> arrived -> in_progress -> completed', () => {
  // Helper cannot jump from assigned directly to completed
  const assignedBooking: BookingRecord = {
    ...sampleBooking,
    status: 'assigned',
    assignedHelperUid: 'helper_kavitha',
    assignedHelperName: 'Kavitha Murthy',
  };

  const skipStepAttempt = validateBookingTransition({
    booking: assignedBooking,
    toStatus: 'completed',
    actorUid: 'helper_kavitha',
    actorRole: 'helper',
  });
  assert.equal(skipStepAttempt.valid, false);
  assert.match(skipStepAttempt.error || '', /must be "in_progress"/);

  // Wrong helper cannot accept assignment
  const wrongHelperAccept = validateBookingTransition({
    booking: assignedBooking,
    toStatus: 'accepted',
    actorUid: 'helper_someone_else',
    actorRole: 'helper',
  });
  assert.equal(wrongHelperAccept.valid, false);

  // Assigned helper can accept (assigned -> accepted)
  const validAccept = validateBookingTransition({
    booking: assignedBooking,
    toStatus: 'accepted',
    actorUid: 'helper_kavitha',
    actorRole: 'helper',
  });
  assert.equal(validAccept.valid, true);

  // Terminal state locking: completed booking cannot be modified by helper or senior
  const completedBooking: BookingRecord = {
    ...assignedBooking,
    status: 'completed',
  };
  const mutateCompleted = validateBookingTransition({
    booking: completedBooking,
    toStatus: 'in_progress',
    actorUid: 'helper_kavitha',
    actorRole: 'helper',
  });
  assert.equal(mutateCompleted.valid, false);
  assert.match(mutateCompleted.error || '', /terminal state/);
});

test('4. Helper double-booking & schedule conflict prevention: blocks overlapping assignments on same date', () => {
  const existingAssigned: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_existing_1',
    bookingRef: 'SC-BLR-20261028-9999',
    status: 'accepted',
    assignedHelperUid: 'helper_kavitha',
    date: '2026-10-28',
    startTime: '09:00',
    durationHours: 4, // 09:00 to 13:00
  };

  // Overlapping booking on 2026-10-28 from 11:00 to 13:00
  const conflictCheck = checkHelperScheduleConflict(
    'helper_kavitha',
    '2026-10-28',
    '11:00',
    2,
    [existingAssigned]
  );
  assert.equal(conflictCheck.hasConflict, true);
  assert.match(conflictCheck.reason || '', /SC-BLR-20261028-9999/);

  // Non-overlapping booking on 2026-10-28 from 14:00 to 16:00
  const noConflictCheck = checkHelperScheduleConflict(
    'helper_kavitha',
    '2026-10-28',
    '14:00',
    2,
    [existingAssigned]
  );
  assert.equal(noConflictCheck.hasConflict, false);

  // Admin assignment fails when conflict exists
  const overlappingTargetBooking: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_new_2',
    date: '2026-10-28',
    startTime: '11:30',
    durationHours: 2,
  };
  const assignAttempt = validateBookingTransition({
    booking: overlappingTargetBooking,
    toStatus: 'assigned',
    actorUid: 'admin_1',
    actorRole: 'admin',
    targetHelper: approvedHelper,
    existingBookings: [existingAssigned],
  });
  assert.equal(assignAttempt.valid, false);
  assert.match(assignAttempt.error || '', /Schedule conflict/);
});

test('5. Unauthorized admin access & helper verification enforcement: blocks non-admins and incomplete checklists', () => {
  // Non-admin cannot assign helper
  const nonAdminAssign = validateBookingTransition({
    booking: sampleBooking,
    toStatus: 'assigned',
    actorUid: 'senior_rameshwar',
    actorRole: 'senior',
    targetHelper: approvedHelper,
  });
  assert.equal(nonAdminAssign.valid, false);
  assert.match(nonAdminAssign.error || '', /Only an authorized Administrator/);

  // Non-admin cannot verify helper
  const helperSelfVerify = validateHelperVerificationUpdate('helper', {
    verificationStatus: 'approved',
    idCheckReviewed: true,
    backgroundCheckReviewed: true,
    referenceCheckReviewed: true,
    trainingCompleted: true,
    verificationNotes: 'Self approved',
  });
  assert.equal(helperSelfVerify.valid, false);

  // Admin cannot approve helper when any of the 4 required checks is false
  const incompleteAdminVerify = validateHelperVerificationUpdate('admin', {
    verificationStatus: 'approved',
    idCheckReviewed: true,
    backgroundCheckReviewed: false,
    referenceCheckReviewed: true,
    trainingCompleted: true,
    verificationNotes: 'Missing background check',
  });
  assert.equal(incompleteAdminVerify.valid, false);
  assert.match(incompleteAdminVerify.error || '', /all 4 required checks/);

  // Unverified helper cannot be assigned to a booking even by an admin
  const pendingHelper: HelperProfile = {
    ...approvedHelper,
    verificationStatus: 'pending',
  };
  const assignPendingHelper = validateBookingTransition({
    booking: sampleBooking,
    toStatus: 'assigned',
    actorUid: 'admin_1',
    actorRole: 'admin',
    targetHelper: pendingHelper,
  });
  assert.equal(assignPendingHelper.valid, false);
  assert.match(assignPendingHelper.error || '', /Only "approved" helpers can be assigned/);
});

test('6. Failed validation / out-of-area & missing consent rejection: never allows invalid writes', () => {
  const outOfAreaBook = validateBookingCreationInput({
    actorUid: 'senior_rameshwar',
    actorName: 'Rameshwar Rao',
    actorRole: 'senior',
    seniorProfile: sampleSenior,
    serviceType: 'companionship_visit',
    date: '2026-10-28',
    startTime: '10:00',
    durationHours: 2,
    locality: 'Mysuru Road Outskirts',
    pickupAddress: '10, Mysuru Road',
    destination: '',
    taskNotes: '',
    locationConsentGranted: true,
    nonMedicalAcknowledged: true,
  });
  assert.equal(outOfAreaBook.valid, false);
  assert.match(outOfAreaBook.error || '', /outside our active Bengaluru service areas/);

  const ref = generateBookingReference('2026-10-28', 'k9p2');
  assert.equal(ref, 'SC-BLR-20261028-K9P2');
});

test('7. Helper availability window validation: blocks off-day and out-of-shift assignments', () => {
  const availability: HelperAvailability = {
    availabilityId: 'helper_kavitha',
    helperId: 'helper_kavitha',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], // Not available on Sunday
    startHour: '09:00',
    endHour: '17:00',
    updatedAt: '2026-10-25T10:00:00.000Z',
  };

  // 2026-10-25 is a Sunday -> should fail availability check
  const sundayCheck = checkHelperAvailabilityWindow('2026-10-25', '10:00', 2, availability);
  assert.equal(sundayCheck.available, false);
  assert.match(sundayCheck.reason || '', /not scheduled to work on Sun/);

  // 2026-10-28 is a Wednesday, but 15:00 + 4h = 19:00 exceeds 17:00 shift end
  const lateShiftCheck = checkHelperAvailabilityWindow('2026-10-28', '15:00', 4, availability);
  assert.equal(lateShiftCheck.available, false);
  assert.match(lateShiftCheck.reason || '', /falls outside helper shift hours/);

  // Admin assignment fails when helper availability window is violated
  const lateBooking: BookingRecord = {
    ...sampleBooking,
    date: '2026-10-28',
    startTime: '15:00',
    durationHours: 4,
  };
  const assignOutOfShift = validateBookingTransition({
    booking: lateBooking,
    toStatus: 'assigned',
    actorUid: 'admin_1',
    actorRole: 'admin',
    targetHelper: approvedHelper,
    targetHelperAvailability: availability,
    existingBookings: [],
  });
  assert.equal(assignOutOfShift.valid, false);
  assert.match(assignOutOfShift.error || '', /falls outside helper shift hours/);
});

test('8. Database write failure handling: never returns booking confirmation when Firestore persistence fails', async () => {
  let persistedCount = 0;

  await assert.rejects(
    async () => {
      await executeDatabaseBackedBookingCreate(
        {
          actorUid: 'senior_rameshwar',
          actorName: 'Rameshwar Rao',
          actorRole: 'senior',
          seniorProfile: sampleSenior,
          serviceType: 'hospital_accompaniment',
          date: '2026-10-28',
          startTime: '09:30',
          durationHours: 4,
          locality: 'Indiranagar',
          pickupAddress: sampleSenior.address,
          destination: 'Manipal Hospital',
          taskNotes: 'Routine ophthalmology visit',
          locationConsentGranted: true,
          nonMedicalAcknowledged: true,
          clientSuppliedTotalInr: 1050,
        },
        async () => {
          throw new Error('FirebaseError: [code=permission-denied]: Missing or insufficient permissions.');
        }
      );
      persistedCount += 1;
    },
    /Missing or insufficient permissions/
  );

  // Confirm execution was halted before any confirmation could be returned
  assert.equal(persistedCount, 0);

  // Confirm successful database write returns a real unique booking reference
  const confirmed = await executeDatabaseBackedBookingCreate(
    {
      actorUid: 'senior_rameshwar',
      actorName: 'Rameshwar Rao',
      actorRole: 'senior',
      seniorProfile: sampleSenior,
      serviceType: 'hospital_accompaniment',
      date: '2026-10-28',
      startTime: '09:30',
      durationHours: 4,
      locality: 'Indiranagar',
      pickupAddress: sampleSenior.address,
      destination: 'Manipal Hospital',
      taskNotes: 'Routine ophthalmology visit',
      locationConsentGranted: true,
      nonMedicalAcknowledged: true,
      clientSuppliedTotalInr: 1050,
    },
    async () => {
      persistedCount += 1;
    },
    { referenceSuffix: 'M2OK' }
  );

  assert.equal(persistedCount, 1);
  assert.equal(confirmed.bookingRecord.bookingRef, 'SC-BLR-20261028-M2OK');
  assert.equal(confirmed.bookingRecord.status, 'pending_assignment');
  assert.equal(confirmed.initialEvent.toStatus, 'pending_assignment');
});

test('9. Milestone 3 role-based PII restriction: helpers cannot view senior phone or street address until assignment is accepted', () => {
  const assignedBooking: BookingRecord = {
    ...sampleBooking,
    status: 'assigned',
    assignedHelperUid: 'helper_kavitha',
    assignedHelperName: 'Kavitha Murthy',
    assignedHelperPhone: '+91-98801-23456',
  };

  // Before helper accepts ('assigned'), senior phone and full address are redacted for the helper
  const preAcceptView = redactBookingForRole(assignedBooking, 'helper_kavitha', 'helper');
  assert.match(preAcceptView.seniorPhone, /Visible after accepting assignment/);
  assert.match(preAcceptView.pickupAddress, /Full street address revealed upon acceptance/);

  // Once helper accepts ('accepted'), full address and senior phone are visible to the assigned helper
  const acceptedBooking: BookingRecord = {
    ...assignedBooking,
    status: 'accepted',
  };
  const postAcceptView = redactBookingForRole(acceptedBooking, 'helper_kavitha', 'helper');
  assert.equal(postAcceptView.seniorPhone, sampleBooking.seniorPhone);
  assert.equal(postAcceptView.pickupAddress, sampleBooking.pickupAddress);

  // If booking is cancelled, helper view redacts senior phone and street address
  const cancelledBooking: BookingRecord = {
    ...assignedBooking,
    status: 'cancelled',
  };
  const cancelledHelperView = redactBookingForRole(cancelledBooking, 'helper_kavitha', 'helper');
  assert.match(cancelledHelperView.seniorPhone, /Redacted/);
  assert.match(cancelledHelperView.pickupAddress, /Redacted/);

  // Unassigned helper cannot view the booking at all -> throws Unauthorized
  assert.throws(
    () => redactBookingForRole(acceptedBooking, 'helper_other', 'helper'),
    /Unauthorized: You do not have permission to view this booking record/
  );

  // Senior and Admin always see full details
  const seniorView = redactBookingForRole(assignedBooking, 'senior_rameshwar', 'senior');
  assert.equal(seniorView.seniorPhone, sampleBooking.seniorPhone);
  const adminView = redactBookingForRole(assignedBooking, 'admin_1', 'admin');
  assert.equal(adminView.pickupAddress, sampleBooking.pickupAddress);
});

test('10. Milestone 3 invalid status transitions & incident access boundaries', () => {
  const assignedBooking: BookingRecord = {
    ...sampleBooking,
    status: 'assigned',
    assignedHelperUid: 'helper_kavitha',
  };

  // Helper cannot skip 'accepted' and jump directly from 'assigned' to 'arrived'
  const skipAccept = validateBookingTransition({
    booking: assignedBooking,
    toStatus: 'arrived',
    actorUid: 'helper_kavitha',
    actorRole: 'helper',
  });
  assert.equal(skipAccept.valid, false);
  assert.match(skipAccept.error || '', /Booking must be "accepted" before marking arrival/);

  // Helper cannot jump from 'accepted' directly to 'completed' without 'arrived' and 'in_progress'
  const acceptedBooking: BookingRecord = {
    ...assignedBooking,
    status: 'accepted',
  };
  const skipToComplete = validateBookingTransition({
    booking: acceptedBooking,
    toStatus: 'completed',
    actorUid: 'helper_kavitha',
    actorRole: 'helper',
  });
  assert.equal(skipToComplete.valid, false);
  assert.match(skipToComplete.error || '', /Visit must be "in_progress" before marking completed/);

  // Completed bookings cannot transition backward or be cancelled
  const completedBooking: BookingRecord = {
    ...assignedBooking,
    status: 'completed',
  };
  const cancelCompleted = validateBookingTransition({
    booking: completedBooking,
    toStatus: 'cancelled',
    actorUid: 'senior_rameshwar',
    actorRole: 'senior',
    reasonOrNote: 'Changed mind after visit',
  });
  assert.equal(cancelCompleted.valid, false);
  assert.match(cancelCompleted.error || '', /terminal state "completed" and cannot be modified/);

  // Incident access permission boundaries
  const incident = {
    reporterUid: 'senior_rameshwar',
    seniorId: 'senior_rameshwar',
  };
  assert.equal(canAccessIncidentRecord(incident, 'senior_rameshwar', 'senior'), true);
  assert.equal(canAccessIncidentRecord(incident, 'admin_1', 'admin'), true);
  assert.equal(canAccessIncidentRecord(incident, 'helper_kavitha', 'helper'), false);
  assert.equal(canAccessIncidentRecord(incident, 'family_ananya', 'family_member'), false);
});

test('11. Milestone 3 honest email notification boundary: reports not_configured unless real credentials are provided and verified', () => {
  const unconfigured = evaluateEmailNotificationBoundary({});
  assert.equal(unconfigured.status, 'not_configured');
  assert.equal(unconfigured.delivered, false);

  const unverified = evaluateEmailNotificationBoundary({
    emailEnabled: true,
    providerVerified: false,
  });
  assert.equal(unverified.status, 'not_configured');
  assert.equal(unverified.delivered, false);
});

test('12. Controlled pilot hardening: masks PII email in logs and enforces least-privilege admin endpoint authorization', () => {
  // PII Email masking never logs full user email addresses
  assert.equal(maskPiiEmail('rameshwar.rao@example.com'), 'r***@example.com');
  assert.equal(maskPiiEmail(null), '[redacted]');
  assert.equal(maskPiiEmail('invalid-email'), '[redacted]');

  // Least-privilege server admin endpoint authorization rejects non-admins, unverified emails, and unlisted emails
  const nonAdminAttempt = verifyAdminEndpointAuthorization({
    actorRole: 'helper',
    actorEmail: 'deepsharma619@gmail.com',
    emailVerified: true,
    bootstrappedAdminEmails: ['deepsharma619@gmail.com'],
  });
  assert.equal(nonAdminAttempt.authorized, false);
  assert.match(nonAdminAttempt.error || '', /Administrator role is required/);

  const spoofedEmailAttempt = verifyAdminEndpointAuthorization({
    actorRole: 'admin',
    actorEmail: 'deepsharma619@gmail.com',
    emailVerified: false,
    bootstrappedAdminEmails: ['deepsharma619@gmail.com'],
  });
  assert.equal(spoofedEmailAttempt.authorized, false);
  assert.match(spoofedEmailAttempt.error || '', /Administrator email must be verified/);

  const unauthorizedAdminEmailAttempt = verifyAdminEndpointAuthorization({
    actorRole: 'admin',
    actorEmail: 'random.user@example.com',
    emailVerified: true,
    bootstrappedAdminEmails: ['deepsharma619@gmail.com'],
  });
  assert.equal(unauthorizedAdminEmailAttempt.authorized, false);
  assert.match(
    unauthorizedAdminEmailAttempt.error || '',
    /not in the authorized administrator registry/
  );

  const validAdmin = verifyAdminEndpointAuthorization({
    actorRole: 'admin',
    actorEmail: 'deepsharma619@gmail.com',
    emailVerified: true,
    bootstrappedAdminEmails: ['deepsharma619@gmail.com'],
  });
  assert.equal(validAdmin.authorized, true);
});

test('13. Immediate helper availability & auto-assignment upon booking creation', async () => {
  // 2026-10-28 (Wednesday) at 09:30 for 4h in Indiranagar for hospital_accompaniment
  // Should immediately select an approved, active, shift-eligible helper without conflicts
  const immediateMatch = selectAvailableHelperForBooking({
    serviceType: 'hospital_accompaniment',
    locality: 'Indiranagar',
    date: '2026-10-28',
    startTime: '09:30',
    durationHours: 4,
    helpers: [approvedHelper],
    availabilities: [
      {
        availabilityId: approvedHelper.helperId,
        helperId: approvedHelper.helperId,
        availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        startHour: '08:00',
        endHour: '18:00',
        updatedAt: '2026-10-20T08:00:00.000Z',
      },
    ],
    existingBookings: [],
  });

  assert.ok(immediateMatch.matchedHelper);
  assert.equal(immediateMatch.matchedHelper.helperId, 'helper_kavitha');
  assert.equal(immediateMatch.initialStatus, 'accepted');
  assert.equal(immediateMatch.evaluations.length, 1);

  // If the helper already has an overlapping booking on 2026-10-28 from 10:00 for 2h,
  // selectAvailableHelperForBooking must detect the conflict and return null (pending_assignment)
  const conflictingBooking: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_conflict_1',
    bookingRef: 'SC-BLR-20261028-CONF',
    status: 'accepted',
    assignedHelperUid: 'helper_kavitha',
    date: '2026-10-28',
    startTime: '10:00',
    durationHours: 2,
  };

  const conflictResult = selectAvailableHelperForBooking({
    serviceType: 'hospital_accompaniment',
    locality: 'Indiranagar',
    date: '2026-10-28',
    startTime: '09:30',
    durationHours: 4,
    helpers: [approvedHelper],
    availabilities: [],
    existingBookings: [conflictingBooking],
  });

  assert.equal(conflictResult.matchedHelper, null);
  assert.equal(conflictResult.initialStatus, 'pending_assignment');
  assert.equal(conflictResult.evaluations.length, 1);
  assert.match(conflictResult.evaluations[0].unavailableSummary || '', /SC-BLR-20261028-CONF/);

  // Verify executeDatabaseBackedBookingCreate immediately confirms ('accepted') when an available helper is found
  const autoAssignedResult = await executeDatabaseBackedBookingCreate(
    {
      actorUid: 'senior_rameshwar',
      actorName: 'Rameshwar Rao',
      actorRole: 'senior',
      seniorProfile: sampleSenior,
      serviceType: 'hospital_accompaniment',
      date: '2026-10-28',
      startTime: '09:30',
      durationHours: 4,
      locality: 'Indiranagar',
      pickupAddress: sampleSenior.address,
      destination: 'Manipal Hospital',
      taskNotes: 'Routine ophthalmology visit',
      locationConsentGranted: true,
      nonMedicalAcknowledged: true,
      clientSuppliedTotalInr: 1050,
    },
    async () => {},
    {
      referenceSuffix: 'AUTO',
      availableHelpers: [approvedHelper],
    }
  );

  assert.equal(autoAssignedResult.bookingRecord.status, 'accepted');
  assert.equal(autoAssignedResult.bookingRecord.assignedHelperUid, 'helper_kavitha');
  assert.equal(autoAssignedResult.bookingRecord.assignedHelperName, 'Kavitha Murthy');
  assert.equal(autoAssignedResult.initialEvent.toStatus, 'accepted');
});

test('14. Customer controls for Visit In Progress and Visit Completed: permits senior or booking family member and blocks unrelated users', () => {
  const familyBookedArrived: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_cust_1',
    seniorId: 'senior_rameshwar',
    bookedByUid: 'family_ananya',
    bookedByName: 'Ananya Rao',
    bookedByRole: 'family_member',
    status: 'arrived',
    assignedHelperUid: 'helper_kavitha',
    assignedHelperName: 'Kavitha Murthy',
  };

  // Family member who booked can start the visit (arrived -> in_progress)
  const familyStart = validateBookingTransition({
    booking: familyBookedArrived,
    toStatus: 'in_progress',
    actorUid: 'family_ananya',
    actorRole: 'family_member',
  });
  assert.equal(familyStart.valid, true);

  // Senior on the booking can start the visit (arrived -> in_progress)
  const seniorStart = validateBookingTransition({
    booking: familyBookedArrived,
    toStatus: 'in_progress',
    actorUid: 'senior_rameshwar',
    actorRole: 'senior',
  });
  assert.equal(seniorStart.valid, true);

  // Unrelated family member cannot start someone else's visit
  const unrelatedStart = validateBookingTransition({
    booking: familyBookedArrived,
    toStatus: 'in_progress',
    actorUid: 'family_unrelated',
    actorRole: 'family_member',
  });
  assert.equal(unrelatedStart.valid, false);

  const familyBookedInProgress: BookingRecord = {
    ...familyBookedArrived,
    status: 'in_progress',
  };

  // Family member who booked can mark the visit completed (in_progress -> completed)
  const familyComplete = validateBookingTransition({
    booking: familyBookedInProgress,
    toStatus: 'completed',
    actorUid: 'family_ananya',
    actorRole: 'family_member',
  });
  assert.equal(familyComplete.valid, true);

  // Unrelated user cannot complete someone else's visit
  const unrelatedComplete = validateBookingTransition({
    booking: familyBookedInProgress,
    toStatus: 'completed',
    actorUid: 'family_unrelated',
    actorRole: 'family_member',
  });
  assert.equal(unrelatedComplete.valid, false);
});

test('15. Scheduled automatic arrival at pickup: transitions accepted bookings at or after scheduled local start time', () => {
  const scheduledStartMs = parseBookingScheduledStartMs('2026-11-14', '10:30');
  assert.ok(typeof scheduledStartMs === 'number');
  assert.equal(parseBookingScheduledStartMs('2026-02-31', '10:30'), null);

  const acceptedDue: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_due_now',
    status: 'accepted',
    assignedHelperUid: 'helper_kavitha',
    date: '2026-11-14',
    startTime: '10:30',
  };
  const acceptedFuture: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_future',
    status: 'accepted',
    assignedHelperUid: 'helper_kavitha',
    date: '2026-11-14',
    startTime: '14:00',
  };
  const pendingDue: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_pending_due',
    status: 'pending_assignment',
    assignedHelperUid: '',
    date: '2026-11-14',
    startTime: '09:00',
  };
  const alreadyArrived: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_already_arrived',
    status: 'arrived',
    assignedHelperUid: 'helper_kavitha',
    date: '2026-11-14',
    startTime: '09:00',
  };

  const beforeTime = new Date(2026, 10, 14, 10, 29, 0, 0);
  const exactTime = new Date(2026, 10, 14, 10, 30, 0, 0);
  const laterTime = new Date(2026, 10, 14, 11, 0, 0, 0);

  assert.equal(isBookingScheduledArrivalReached(acceptedDue, beforeTime), false);
  assert.equal(isBookingScheduledArrivalReached(acceptedDue, exactTime), true);
  assert.equal(isBookingScheduledArrivalReached(acceptedDue, laterTime), true);
  assert.equal(isBookingScheduledArrivalReached(pendingDue, laterTime), false);
  assert.equal(isBookingScheduledArrivalReached(alreadyArrived, laterTime), false);

  const ready = findBookingsReadyForAutomaticArrival(
    [acceptedDue, acceptedFuture, pendingDue, alreadyArrived],
    exactTime
  );
  assert.deepEqual(
    ready.map((b) => b.bookingId),
    ['booking_due_now']
  );
});

test('16. 24/7 helper pool coverage: 7 verified helpers cover all localities, overnight shifts, and cross-midnight conflicts', () => {
  assert.equal(INITIAL_VERIFIED_HELPERS.length, 7);
  assert.equal(INITIAL_HELPER_AVAILABILITIES.length, 7);

  const nowIso = '2026-11-15T00:00:00.000Z';
  const allHelpers: HelperProfile[] = INITIAL_VERIFIED_HELPERS.map((h) => ({
    ...h,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
  const allAvailabilities: HelperAvailability[] = INITIAL_HELPER_AVAILABILITIES.map((a) => ({
    ...a,
    updatedAt: nowIso,
  }));

  // 24/7 booking creation accepts late-night and pre-dawn start times
  for (const startTime of ['00:00', '02:30', '05:30', '09:30', '14:00', '21:30', '23:30']) {
    const validation = validateBookingCreationInput({
      actorUid: 'family_ananya',
      actorName: 'Ananya Rao',
      actorRole: 'family_member',
      seniorProfile: sampleSenior,
      familyLink: activeFamilyLink,
      serviceType: 'hospital_accompaniment',
      date: '2026-11-22', // Sunday
      startTime,
      durationHours: 4,
      locality: 'Whitefield',
      pickupAddress: sampleSenior.address,
      destination: 'Manipal Hospital Whitefield',
      taskNotes: '24/7 hospital accompaniment check',
      locationConsentGranted: true,
      nonMedicalAcknowledged: true,
      clientSuppliedTotalInr: 1050,
    });
    assert.equal(validation.valid, true, `Expected ${startTime} to pass booking creation validation`);

    const match = selectAvailableHelperForBooking({
      serviceType: 'hospital_accompaniment',
      locality: 'Whitefield',
      date: '2026-11-22',
      startTime,
      durationHours: 4,
      helpers: allHelpers,
      availabilities: allAvailabilities,
      existingBookings: [],
    });
    assert.ok(match.matchedHelper, `Expected an available helper on Sunday at ${startTime}`);
    assert.equal(match.initialStatus, 'accepted');
  }

  // Overnight shift helper (20:00-08:00) covers 22:00 (4h) and 04:00 (2h), excludes 12:00 (2h)
  const nightAvail = allAvailabilities.find((a) => a.helperId === 'helper_karthik')!;
  assert.equal(checkHelperAvailabilityWindow('2026-11-18', '22:00', 4, nightAvail).available, true);
  assert.equal(checkHelperAvailabilityWindow('2026-11-19', '04:00', 2, nightAvail).available, true);
  assert.equal(checkHelperAvailabilityWindow('2026-11-19', '12:00', 2, nightAvail).available, false);

  // Cross-midnight conflict: booking on 2026-11-18 22:00 for 4h (ends 02:00 on 2026-11-19)
  // conflicts with 2026-11-19 01:00 for 2h for helper_anita, so pool automatically picks next available 24/7 helper
  const anitaOvernightBooking: BookingRecord = {
    ...sampleBooking,
    bookingId: 'booking_overnight_anita',
    bookingRef: 'SC-BLR-20261118-N101',
    status: 'accepted',
    assignedHelperUid: 'helper_anita',
    date: '2026-11-18',
    startTime: '22:00',
    durationHours: 4,
  };
  const crossMidnightConflict = checkHelperScheduleConflict(
    'helper_anita',
    '2026-11-19',
    '01:00',
    2,
    [anitaOvernightBooking]
  );
  assert.equal(crossMidnightConflict.hasConflict, true);

  const fallbackMatch = selectAvailableHelperForBooking({
    serviceType: 'hospital_accompaniment',
    locality: 'Indiranagar',
    date: '2026-11-19',
    startTime: '01:00',
    durationHours: 2,
    helpers: allHelpers,
    availabilities: allAvailabilities,
    existingBookings: [anitaOvernightBooking],
  });
  assert.ok(fallbackMatch.matchedHelper);
  assert.notEqual(fallbackMatch.matchedHelper.helperId, 'helper_anita');
  assert.equal(fallbackMatch.initialStatus, 'accepted');
});


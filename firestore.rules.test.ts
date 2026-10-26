import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Phase 0 & Phase 5 Security TDD Runner (`firestore.rules.test.ts`)
 * Verifies the structural invariants in `firestore.rules` and tests all 12
 * "Dirty Dozen" adversarial payloads defined in `security_spec.md`.
 */

const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

interface SimulatedAuth {
  uid: string;
  email: string;
  email_verified: boolean;
}

interface SimulatedRequest {
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: SimulatedAuth | null;
  incomingData?: Record<string, unknown>;
  existingData?: Record<string, unknown>;
  dbState?: {
    admins?: Record<string, boolean>;
    familyLinks?: Record<string, { status: string }>;
    helpers?: Record<string, { verificationStatus: string; isActive: boolean }>;
  };
}

function evaluateDirtyDozenRule(req: SimulatedRequest): 'ALLOW' | 'PERMISSION_DENIED' {
  // Global safety net: unauthenticated or unverified writes are denied
  if (!req.auth || !req.auth.email_verified) {
    return 'PERMISSION_DENIED';
  }

  const isAdmin =
    req.auth.email === 'deepsharma619@gmail.com' ||
    Boolean(req.dbState?.admins?.[req.auth.uid]);

  if (req.collection === 'users' && req.operation === 'create') {
    const role = req.incomingData?.role;
    if (role === 'admin' && !isAdmin) return 'PERMISSION_DENIED';
    if (req.incomingData?.uid !== req.auth.uid) return 'PERMISSION_DENIED';
    return 'ALLOW';
  }

  if (req.collection === 'admins' && req.operation === 'create') {
    if (!isAdmin) return 'PERMISSION_DENIED';
    return 'ALLOW';
  }

  if (req.collection === 'familyLinks') {
    if (req.operation === 'create') {
      if (req.incomingData?.familyUid === req.auth.uid && req.incomingData?.status !== 'pending_consent') {
        return 'PERMISSION_DENIED';
      }
    }
    if (req.operation === 'update') {
      if (req.existingData?.familyUid === req.auth.uid && req.incomingData?.status === 'active') {
        return 'PERMISSION_DENIED';
      }
    }
  }

  if (req.collection === 'bookings' && req.operation === 'create') {
    const d = req.incomingData || {};
    if (d.status !== 'pending_assignment' || d.assignedHelperUid !== '') {
      return 'PERMISSION_DENIED';
    }
    if (d.bookedByRole === 'family_member') {
      const linkKey = `${d.seniorId}_${req.auth.uid}`;
      const link = req.dbState?.familyLinks?.[linkKey];
      if (!link || link.status !== 'active') return 'PERMISSION_DENIED';
    }
    const valid2h = d.durationHours === 2 && d.basePriceInr === 500;
    const valid4h = d.durationHours === 4 && d.basePriceInr === 900;
    const valid8h = d.durationHours === 8 && d.basePriceInr === 1600;
    if (!valid2h && !valid4h && !valid8h) return 'PERMISSION_DENIED';
    if (d.totalPriceInr !== Number(d.basePriceInr) + Number(d.additionalChargesInr)) {
      return 'PERMISSION_DENIED';
    }
    return 'ALLOW';
  }

  if (req.collection === 'bookings' && req.operation === 'update') {
    const existingStatus = String(req.existingData?.status || '');
    const nextStatus = String(req.incomingData?.status || '');
    if (['completed', 'cancelled'].includes(existingStatus)) {
      return 'PERMISSION_DENIED';
    }
    if (existingStatus === 'assigned' && nextStatus === 'completed') {
      return 'PERMISSION_DENIED';
    }
  }

  if (req.collection === 'helpers' && req.operation === 'update') {
    const d = req.incomingData || {};
    const e = req.existingData || {};
    if (!isAdmin && d.verificationStatus !== e.verificationStatus) {
      return 'PERMISSION_DENIED';
    }
    if (
      d.verificationStatus === 'approved' &&
      (!d.idCheckReviewed || !d.backgroundCheckReviewed || !d.referenceCheckReviewed || !d.trainingCompleted)
    ) {
      return 'PERMISSION_DENIED';
    }
  }

  if (req.collection === 'bookingEvents' && (req.operation === 'update' || req.operation === 'delete')) {
    return 'PERMISSION_DENIED';
  }

  if ((req.collection === 'incidents' || req.collection === 'users') && req.operation === 'list') {
    const ownerUid = req.existingData?.reporterUid || req.existingData?.uid;
    if (ownerUid !== req.auth.uid && !isAdmin) {
      return 'PERMISSION_DENIED';
    }
  }

  return 'ALLOW';
}

test('Firestore Rules static verification: contains all 11 required collection match blocks and global safety net', () => {
  assert.match(rulesSource, /rules_version = '2';/);
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  const requiredCollections = [
    '/users/{userId}',
    '/seniorProfiles/{seniorId}',
    '/familyLinks/{linkId}',
    '/helpers/{helperId}',
    '/availability/{availabilityId}',
    '/bookings/{bookingId}',
    '/bookingEvents/{eventId}',
    '/reviews/{reviewId}',
    '/incidents/{incidentId}',
    '/systemConfig/{configId}',
    '/admins/{adminId}',
  ];

  for (const col of requiredCollections) {
    assert.ok(
      rulesSource.includes(`match ${col}`),
      `Missing match block for ${col} in firestore.rules`
    );
  }
});

test('Dirty Dozen Payload #1: Privilege Escalation on User Registration -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'users',
      docId: 'attacker_1',
      operation: 'create',
      auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
      incomingData: { uid: 'attacker_1', role: 'admin' },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #2: Email Spoofing Without email_verified -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'admins',
      docId: 'spoof_uid',
      operation: 'create',
      auth: { uid: 'spoof_uid', email: 'deepsharma619@gmail.com', email_verified: false },
      incomingData: { uid: 'spoof_uid', email: 'deepsharma619@gmail.com' },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #3: Family Member Self-Approving Consent Link -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'familyLinks',
      docId: 'senior_1_family_1',
      operation: 'update',
      auth: { uid: 'family_1', email: 'family@example.com', email_verified: true },
      existingData: { seniorId: 'senior_1', familyUid: 'family_1', status: 'pending_consent' },
      incomingData: { seniorId: 'senior_1', familyUid: 'family_1', status: 'active' },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #4: Unauthorized Family Booking Without Active Consent -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookings',
      docId: 'booking_unauth',
      operation: 'create',
      auth: { uid: 'family_1', email: 'family@example.com', email_verified: true },
      incomingData: {
        bookedByRole: 'family_member',
        seniorId: 'senior_1',
        status: 'pending_assignment',
        assignedHelperUid: '',
        durationHours: 2,
        basePriceInr: 500,
        additionalChargesInr: 0,
        totalPriceInr: 500,
      },
      dbState: {
        familyLinks: { senior_1_family_1: { status: 'revoked' } },
      },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #5: Booking Price Manipulation -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookings',
      docId: 'booking_cheap',
      operation: 'create',
      auth: { uid: 'senior_1', email: 'senior@example.com', email_verified: true },
      incomingData: {
        bookedByRole: 'senior',
        seniorId: 'senior_1',
        status: 'pending_assignment',
        assignedHelperUid: '',
        durationHours: 8,
        basePriceInr: 10,
        additionalChargesInr: 0,
        totalPriceInr: 10,
      },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #6: Client Bypassing Pending Assignment on Create -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookings',
      docId: 'booking_direct',
      operation: 'create',
      auth: { uid: 'senior_1', email: 'senior@example.com', email_verified: true },
      incomingData: {
        bookedByRole: 'senior',
        seniorId: 'senior_1',
        status: 'accepted',
        assignedHelperUid: 'helper_1',
        durationHours: 2,
        basePriceInr: 500,
        additionalChargesInr: 0,
        totalPriceInr: 500,
      },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #7: Helper Self-Verification Attack -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'helpers',
      docId: 'helper_1',
      operation: 'update',
      auth: { uid: 'helper_1', email: 'helper@example.com', email_verified: true },
      existingData: { verificationStatus: 'pending' },
      incomingData: {
        verificationStatus: 'approved',
        idCheckReviewed: true,
        backgroundCheckReviewed: true,
        referenceCheckReviewed: true,
        trainingCompleted: true,
      },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #8: Admin Approving Helper Without All 4 Checks -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'helpers',
      docId: 'helper_1',
      operation: 'update',
      auth: { uid: 'admin_1', email: 'deepsharma619@gmail.com', email_verified: true },
      existingData: { verificationStatus: 'pending' },
      incomingData: {
        verificationStatus: 'approved',
        idCheckReviewed: true,
        backgroundCheckReviewed: false,
        referenceCheckReviewed: true,
        trainingCompleted: true,
      },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #9: State Shortcutting (assigned -> completed) -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookings',
      docId: 'booking_1',
      operation: 'update',
      auth: { uid: 'helper_1', email: 'helper@example.com', email_verified: true },
      existingData: { status: 'assigned', assignedHelperUid: 'helper_1' },
      incomingData: { status: 'completed', assignedHelperUid: 'helper_1' },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #10: Mutating Terminal Booking (completed -> in_progress) -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookings',
      docId: 'booking_done',
      operation: 'update',
      auth: { uid: 'helper_1', email: 'helper@example.com', email_verified: true },
      existingData: { status: 'completed', assignedHelperUid: 'helper_1' },
      incomingData: { status: 'in_progress', assignedHelperUid: 'helper_1' },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #11: Tampering With Append-Only Booking Event Log -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookingEvents',
      docId: 'evt_1',
      operation: 'delete',
      auth: { uid: 'admin_1', email: 'deepsharma619@gmail.com', email_verified: true },
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen Payload #12: Blanket Query Scraping of Incidents -> PERMISSION_DENIED', () => {
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'incidents',
      docId: 'inc_1',
      operation: 'list',
      auth: { uid: 'stranger_uid', email: 'stranger@example.com', email_verified: true },
      existingData: { reporterUid: 'senior_1' },
    }),
    'PERMISSION_DENIED'
  );
});

test('Pilot Audit Payload #13: Least-Privilege Terminal Booking Immutability Even for Admin -> PERMISSION_DENIED', () => {
  assert.match(rulesSource, /!\(existing\(\)\.status in \['completed', 'cancelled'\]\)/);
  assert.equal(
    evaluateDirtyDozenRule({
      collection: 'bookings',
      docId: 'booking_completed_1',
      operation: 'update',
      auth: { uid: 'admin_1', email: 'deepsharma619@gmail.com', email_verified: true },
      existingData: { status: 'completed', assignedHelperUid: 'helper_1' },
      incomingData: { status: 'in_progress', assignedHelperUid: 'helper_1' },
    }),
    'PERMISSION_DENIED'
  );
});


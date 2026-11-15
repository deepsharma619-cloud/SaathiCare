import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_ACCOUNTS,
  TEST_FAMILY_ACCOUNT,
  createInitialTestDataset,
  findTestAccountByUid,
} from './testAccounts.ts';
import {
  calculateBookingPrice,
  validateBookingCreationInput,
} from './bookingRules.ts';

test('TEST_ACCOUNTS exposes 4 family_member test logins with complete profiles', () => {
  assert.equal(TEST_ACCOUNTS.length, 4);
  for (const acc of TEST_ACCOUNTS) {
    assert.equal(acc.profile.role, 'family_member');
    assert.equal(acc.targetWorkspace, 'dashboard');
    assert.ok(acc.profile.email.includes('@test.saathicare.in'));
    assert.ok(acc.profile.phone.length >= 10);
  }

  assert.equal(TEST_ACCOUNTS[0].profile.uid, TEST_FAMILY_ACCOUNT.profile.uid);
  assert.ok(findTestAccountByUid('test_family_rohan'));
  assert.ok(findTestAccountByUid('test_family_ananya'));
  assert.ok(findTestAccountByUid('test_family_vikram'));
  assert.ok(findTestAccountByUid('test_family_priya'));
  assert.equal(findTestAccountByUid('test_senior_lakshmi'), null);
  assert.equal(findTestAccountByUid('helper_kavitha'), null);
  assert.equal(findTestAccountByUid('nonexistent'), null);
});

test('createInitialTestDataset seeds active consent links, 7 verified 24/7 helpers, hospital bookings, and events for all 4 family test accounts', () => {
  const dataset = createInitialTestDataset();

  assert.equal(dataset.helpers.length, 7);
  assert.equal(dataset.availabilities.length, 7);
  for (const helper of dataset.helpers) {
    assert.equal(helper.verificationStatus, 'approved');
    assert.equal(helper.isActive, true);
  }
  assert.ok(dataset.seniors.some((s) => s.seniorId === 'test_senior_srinivas'));

  // Verify every test booking adheres to canonical pricing rules and is a hospital visit
  for (const booking of dataset.bookings) {
    assert.equal(booking.serviceType, 'hospital_accompaniment');
    const expectedPrice = calculateBookingPrice(
      booking.durationHours,
      booking.serviceType,
      dataset.systemConfig
    );
    assert.equal(booking.basePriceInr, expectedPrice.basePriceInr);
    assert.equal(booking.additionalChargesInr, expectedPrice.additionalChargesInr);
    assert.equal(booking.totalPriceInr, expectedPrice.totalPriceInr);
    assert.notEqual(
      booking.status,
      'assigned',
      `Booking ${booking.bookingId} should be immediately confirmed ('accepted') or further progressed, not 'assigned'`
    );
    assert.ok(
      dataset.bookingEvents.some((evt) => evt.bookingId === booking.bookingId),
      `Expected bookingEvents for ${booking.bookingId}`
    );
  }

  // Verify each of the 4 family_member test logins has a linked senior, bookings, and passes validation for a new hospital visit
  for (const acc of TEST_ACCOUNTS) {
    const link = dataset.familyLinks.find(
      (l) => l.familyUid === acc.profile.uid && l.status === 'active'
    );
    assert.ok(link, `Expected active family link for ${acc.profile.uid}`);

    const senior = dataset.seniors.find((s) => s.seniorId === link.seniorId);
    assert.ok(senior, `Expected senior profile ${link.seniorId} for ${acc.profile.uid}`);

    const userBookings = dataset.bookings.filter((b) => b.bookedByUid === acc.profile.uid);
    assert.ok(userBookings.length >= 2, `Expected at least 2 bookings for ${acc.profile.uid}`);

    const validation = validateBookingCreationInput({
      actorUid: acc.profile.uid,
      actorName: acc.profile.fullName,
      actorRole: 'family_member',
      seniorProfile: senior,
      familyLink: link,
      serviceType: 'hospital_accompaniment',
      date: '2026-11-22',
      startTime: '10:00',
      durationHours: 4,
      locality: senior.locality,
      pickupAddress: senior.address,
      destination: 'Manipal Hospital Bengaluru',
      taskNotes: 'Follow-up outpatient consultation',
      locationConsentGranted: true,
      nonMedicalAcknowledged: true,
      clientSuppliedTotalInr: 1050,
      config: dataset.systemConfig,
    });
    assert.equal(validation.valid, true, `Expected valid booking creation for ${acc.profile.uid}`);
  }
});

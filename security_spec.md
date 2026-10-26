# SaathiCare — Security Architecture & Payload-First Security TDD (`security_spec.md`)

## 1. Data Invariants & Master Sources of Truth

1. **No Self-Granted Admin Privileges**:
   - Users registering in `/users/{userId}` can only choose `role in ['senior', 'family_member', 'helper']`, unless they are the verified bootstrapped administrator (`request.auth.token.email == 'deepsharma619@gmail.com' && request.auth.token.email_verified == true`) or already exist in `/admins/$(request.auth.uid)`.
   - `role`, `uid`, and `createdAt` in `/users/{userId}` are immutable for non-admin users.

2. **Explicit Family Authorization & Instant Revocation (`/familyLinks/{linkId}`)**:
   - Every family link has deterministic ID `{seniorId}_{familyUid}`.
   - A family member can request a link (`status == 'pending_consent'`), but ONLY the target senior (`request.auth.uid == existing().seniorId`) or `isAdmin()` can transition `status` to `'active'`.
   - Either the senior (`seniorId`) or the family member (`familyUid`) or `isAdmin()` can transition `status` to `'revoked'`.
   - A family member can create a booking on behalf of `seniorId` ONLY if `/familyLinks/$(incoming().seniorId + '_' + request.auth.uid)` exists and has `.data.status == 'active'` and `/seniorProfiles/$(incoming().seniorId).data.allowFamilyBookings == true`.

3. **Server-Enforced Booking Pricing & Initial State (`/bookings/{bookingId}`)**:
   - Client-supplied prices are never trusted blindly: on `create`, `status` MUST be `'pending_assignment'`, `assignedHelperUid` MUST be `''`, `paymentStatus` MUST be `'pay_later_unconfigured'`, `locationConsentGranted == true`, `nonMedicalAcknowledged == true`, and `totalPriceInr == basePriceInr + additionalChargesInr` matching the canonical duration and service rates.
   - Terminal states (`completed`, `cancelled`) are locked against further non-admin updates.

4. **Strict Role-Partitioned Booking State Transitions**:
   - `pending_assignment -> assigned`: **Admin only** (`isAdmin()`), and requires `assignedHelperUid` to exist in `/helpers/$(incoming().assignedHelperUid)` with `verificationStatus == 'approved'` and `isActive == true`.
   - `assigned -> accepted`: **Assigned Helper only** (`request.auth.uid == existing().assignedHelperUid`). Assignment is not confirmed until accepted.
   - `accepted -> arrived -> in_progress -> completed`: **Assigned Helper only** (or `isAdmin()`).
   - `pending_assignment | assigned | accepted -> cancelled`: Senior (`seniorId`), booking creator (`bookedByUid`), or `isAdmin()`.
   - `assigned | accepted | arrived | in_progress -> needs_attention`: Senior, booking creator, assigned helper, or `isAdmin()`.

5. **Helper Verification Integrity (`/helpers/{helperId}`)**:
   - Helpers can create their profile ONLY with `verificationStatus == 'pending'`, `idCheckReviewed == false`, `backgroundCheckReviewed == false`, `referenceCheckReviewed == false`, `trainingCompleted == false`, `completedBookingsCount == 0`.
   - Helpers can NEVER modify `verificationStatus` or verification boolean flags.
   - Even `isAdmin()` cannot set `verificationStatus == 'approved'` unless all 4 checks (`idCheckReviewed`, `backgroundCheckReviewed`, `referenceCheckReviewed`, `trainingCompleted`) are `true`.

6. **Append-Only Audit Trail (`/bookingEvents/{eventId}`)**:
   - `allow update, delete: if false;` (strictly immutable append-only log).
   - `actorUid` MUST equal `request.auth.uid` and `createdAt == request.time`.

7. **PII & Incident Isolation**:
   - `/users/{userId}` is readable only by `isOwner(userId)` or `isAdmin()`.
   - `/incidents/{incidentId}` is readable only by `resource.data.reporterUid == request.auth.uid` or `isAdmin()`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Privilege Escalation on User Registration**:
   - Path: `/users/attacker_1`
   - Action: `create` by `attacker_1` (`email: "attacker@example.com"`)
   - Payload: `{ "uid": "attacker_1", "role": "admin", ... }`
   - Expected Result: `PERMISSION_DENIED` (only `senior`, `family_member`, `helper` allowed for non-bootstrapped users).

2. **Payload 2 — Email Spoofing Without Verification**:
   - Path: `/admins/spoof_uid`
   - Action: `create` with `email: "deepsharma619@gmail.com"`, `email_verified: false`
   - Expected Result: `PERMISSION_DENIED` (`isVerifiedUser()` requires `request.auth.token.email_verified == true`).

3. **Payload 3 — Family Member Self-Approving Consent Link**:
   - Path: `/familyLinks/senior_1_family_1`
   - Action: `create` or `update` by `family_1` with `{ "status": "active" }`
   - Expected Result: `PERMISSION_DENIED` (family member can only create with `status == 'pending_consent'` or update to `'revoked'`).

4. **Payload 4 — Unauthorized Family Booking Without Active Consent**:
   - Path: `/bookings/booking_unauth`
   - Action: `create` by `family_1` for `seniorId: "senior_1"` when `/familyLinks/senior_1_family_1` is `pending_consent` or `revoked`.
   - Expected Result: `PERMISSION_DENIED` (`isAuthorizedFamilyForSenior` requires active link).

5. **Payload 5 — Booking Price Manipulation**:
   - Path: `/bookings/booking_cheap`
   - Action: `create` by `senior_1` with `durationHours: 8`, `basePriceInr: 10`, `totalPriceInr: 10`.
   - Expected Result: `PERMISSION_DENIED` (`isValidBookingPricing` rejects manipulated prices).

6. **Payload 6 — Client Bypassing Pending Assignment on Create**:
   - Path: `/bookings/booking_direct_assign`
   - Action: `create` by `senior_1` with `status: "accepted"`, `assignedHelperUid: "helper_1"`.
   - Expected Result: `PERMISSION_DENIED` (initial booking state must be `pending_assignment` with empty `assignedHelperUid`).

7. **Payload 7 — Helper Self-Verification Attack**:
   - Path: `/helpers/helper_1`
   - Action: `update` by `helper_1` setting `{ "verificationStatus": "approved", "idCheckReviewed": true }`.
   - Expected Result: `PERMISSION_DENIED` (`affectedKeys().hasOnly(...)` blocks helpers from touching verification fields).

8. **Payload 8 — Admin Approving Helper Without Completed Checks**:
   - Path: `/helpers/helper_1`
   - Action: `update` by `admin` setting `{ "verificationStatus": "approved", "idCheckReviewed": true, "backgroundCheckReviewed": false }`.
   - Expected Result: `PERMISSION_DENIED` (`isValidHelper` enforces that `verificationStatus == 'approved'` requires all 4 check booleans to be `true`).

9. **Payload 9 — State Shortcutting (`assigned -> completed`)**:
   - Path: `/bookings/booking_1`
   - Action: `update` by `helper_1` jumping directly from `assigned` to `completed`.
   - Expected Result: `PERMISSION_DENIED` (must transition `assigned -> accepted -> arrived -> in_progress -> completed`).

10. **Payload 10 — Mutating Terminal Booking (`completed -> in_progress`)**:
    - Path: `/bookings/booking_done`
    - Action: `update` by `helper_1` or `senior_1` after `status == 'completed'`.
    - Expected Result: `PERMISSION_DENIED` (terminal state lock).

11. **Payload 11 — Tampering With Append-Only Booking Event Log**:
    - Path: `/bookingEvents/evt_1`
    - Action: `update` or `delete` by any user.
    - Expected Result: `PERMISSION_DENIED` (`allow update, delete: if false`).

12. **Payload 12 — Blanket Query Scraping of Incidents or Users**:
    - Path: `/incidents` or `/users`
    - Action: `list` by non-owner `user_2`.
    - Expected Result: `PERMISSION_DENIED` (`allow list` enforces `resource.data.reporterUid == request.auth.uid || isAdmin()`).

---

## 3. Phase 5 Red Team Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource / ID Poisoning | Value / Shadow Field Poisoning | PII / Query Leak | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/users/{userId}` | Blocked (`uid == userId == request.auth.uid`) | Role locked (`incoming().role == existing().role`) | Blocked (`isValidId(userId)`) | Blocked (`hasOnly` + `isValidUser`) | Isolated to owner & admin | PASS |
| `/seniorProfiles/{seniorId}` | Blocked (`seniorId == request.auth.uid`) | N/A | Blocked (`isValidId(seniorId)`) | Blocked (`hasOnly` + `isValidSeniorProfile`) | Restricted to owner, active family link, admin | PASS |
| `/familyLinks/{linkId}` | Blocked (`linkId == seniorId + '_' + familyUid`) | Only senior can set `active` | Blocked (`isValidId(linkId)`) | Blocked (`hasOnly` + `isValidFamilyLink`) | Restricted to `seniorId`, `familyUid`, admin | PASS |
| `/helpers/{helperId}` | Blocked (`helperId == request.auth.uid`) | Only admin can verify when 4 checks = true | Blocked (`isValidId(helperId)`) | Blocked (`hasOnly` + `isValidHelper`) | No raw ID numbers stored | PASS |
| `/availability/{availabilityId}` | Blocked (`helperId == request.auth.uid`) | N/A | Blocked (`isValidId`) | Blocked (`hasOnly` + `isValidAvailability`) | Authenticated read for scheduling | PASS |
| `/bookings/{bookingId}` | Blocked (`bookedByUid == request.auth.uid`) | Enforced step-by-step state machine | Blocked (`isValidId(bookingId)`) | Blocked (`hasOnly` + `isValidBooking`) | Restricted to senior, booker, assigned helper, admin | PASS |
| `/bookingEvents/{eventId}` | Blocked (`actorUid == request.auth.uid`) | Immutable (`update, delete: false`) | Blocked (`isValidId(eventId)`) | Blocked (`hasOnly` + `isValidBookingEvent`) | Restricted to booking participants & admin | PASS |
| `/reviews/{reviewId}` | Blocked (`authorUid == request.auth.uid`) | Requires completed booking (`get().data.status == 'completed'`) | Blocked (`isValidId(reviewId)`) | Blocked (`hasOnly` + `isValidReview`) | Authentic completed-booking reviews only | PASS |
| `/incidents/{incidentId}` | Blocked (`reporterUid == request.auth.uid`) | Only admin can change status | Blocked (`isValidId(incidentId)`) | Blocked (`hasOnly` + `isValidIncident`) | Isolated to reporter & admin | PASS |
| `/systemConfig/{configId}` | Admin-only write | N/A | `configId == 'bengaluru'` | Blocked (`hasOnly` + `isValidSystemConfig`) | Public read for transparent pricing & helpline | PASS |

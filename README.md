# SaathiCare — Controlled Pilot Readiness & Operations Guide (Bengaluru)

SaathiCare is a full-stack web application for **non-medical** senior citizen companion booking in **Bengaluru**. Built with React 19, TypeScript, Tailwind CSS, an Express + Vite Node.js server (`server.ts`), Firebase Authentication, and Cloud Firestore with audited zero-trust Firestore Security Rules (`firestore.rules`).

> **Controlled Pilot Status (Not Claiming Full Production Readiness)**:
> This codebase has been hardened, audited for least-privilege access, stripped of development demo data, and verified against 26 automated unit and security-rule tests for a **controlled pilot in Bengaluru**. However, **we do not claim full production readiness** until the unresolved manual setup, legal/privacy counsel review, background-verification SOPs, and external integration items in **Section 7** are completed by human operators.

> **Non-Medical Scope & Safety Notice**: SaathiCare provides **non-medical companion assistance only** (Hospital or Clinic Accompaniment, Shopping and Errands, and Companionship Visits). It does **not** provide nursing, clinical care, medication administration, physiotherapy, ambulance transport, or emergency medical response.

---

## 1. Least-Privilege Security Audit (Routes, Server Endpoints & Firestore Rules)

### 1.1 Client Routes & Role Workspaces (`src/App.tsx`)
- **Overview & Services (`welcome`, `services`)**: Publicly readable service catalog, canonical Bengaluru rates, and Google Sign-In entry point.
- **Senior & Family Workspace (`dashboard`)**: Protected by Firebase Auth + verified email + Firestore `/users/{uid}` role check (`senior`, `family_member`, or `admin`). Helpers are blocked from viewing senior/family booking management.
- **Helper Portal (`helper_workspace`)**: Protected by Firebase Auth + role check (`helper` or `admin`). Displays only bookings where `assignedHelperUid == currentUser.uid`.
  - **Pre-Acceptance & Post-Cancellation PII Redaction (`redactBookingForRole`)**: While a booking is in `assigned` status (awaiting helper acceptance) or `cancelled`, the senior's phone number and full street address are redacted in the helper's view. Full pickup address and phone are revealed only after the helper accepts the assignment (`accepted`, `arrived`, `in_progress`, `completed`).
- **Coordinator & Administrator Console (`admin_workspace`)**: Protected by strict role check (`currentUser.role === 'admin'`). No public admin setup route, no hardcoded admin password, and no self-escalation UI exists.
- **Development Demo Data Removed**: Fictional demo datasets (`devSeedData.ts`) and demo seed buttons have been removed from the codebase so pilot and production builds never bundle or seed synthetic records.

### 1.2 Server API Endpoints (`server.ts`)
- **Security Headers & Rate Limiting**:
  - `app.disable('x-powered-by')`
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cache-Control: no-store` on all `/api/*` routes so booking/validation responses are never cached.
  - Per-IP rate limiting (`90 requests / minute`) with `64kb` JSON body size cap.
- **Least-Privilege Endpoint Inventory**:
  - `GET /api/system/status`: Returns city, non-medical boundary flag, `bootstrappedAdminConfigured` boolean (never exposes administrator email addresses), and honest `configured` / `not_configured` status for payment, SMS, email, and GPS integrations.
  - `POST /api/pricing/calculate`: Computes canonical server-side pricing from duration and service type.
  - `POST /api/bookings/validate-create`: Enforces canonical pricing, active Bengaluru locality, senior/family consent link (`status === 'active'`), location consent, and non-medical acknowledgement.
  - `POST /api/bookings/validate-transition`: Enforces role-partitioned state transitions (`pending_assignment -> assigned -> accepted -> arrived -> in_progress -> completed`, plus `cancelled` and `needs_attention`), helper approval & 4-check completeness, weekly availability shift windows, and overlapping schedule conflict prevention.
  - `POST /api/admin/verify-helper`: Enforces `verifyAdminEndpointAuthorization` (requires `actorRole === 'admin'`, `emailVerified !== false`, and membership in `SAATHICARE_BOOTSTRAPPED_ADMIN_EMAILS`) plus all 4 verification checks before `approved`.
  - `POST /api/family-links/validate`: Enforces senior-only consent approval (`pending_consent -> active`) and immediate revocation (`revoked`).

### 1.3 Firestore Security Rules (`firestore.rules`)
- **Default-Deny Catch-All**: `match /{document=**} { allow read, write: if false; }`
- **Verified Identity**: Every read/write requires `request.auth != null && request.auth.token.email_verified == true`.
- **Collection Least-Privilege Summary**:
  - `/users/{userId}`: Owner or Admin read only (`PII isolation`). Self-assigned `admin` role blocked on create; `role` immutable on update for non-admins.
  - `/seniorProfiles/{seniorId}`: Readable only by the senior owner, family members with an **active** `/familyLinks/{seniorId}_{familyUid}` document, or Admin.
  - `/familyLinks/{linkId}`: Deterministic key `{seniorId}_{familyUid}`. Family members can only create in `pending_consent` or transition to `revoked`. Only the senior (or Admin) can transition to `active`.
  - `/helpers/{helperId}`: Helpers can create their profile only in `pending` state with all 4 check booleans `false`. Only Admin can update verification fields, and `verificationStatus == 'approved'` is rejected at the rule level unless `idCheckReviewed`, `backgroundCheckReviewed`, `referenceCheckReviewed`, and `trainingCompleted` are all `true`.
  - `/availability/{availabilityId}`: Scoped to helper owner or Admin.
  - `/bookings/{bookingId}`: Validates server-aligned pricing against `/systemConfig/bengaluru`, locks terminal states (`!(existing().status in ['completed', 'cancelled'])` for all actors including Admin), and scopes Admin overrides strictly to `cancelled` or `needs_attention` with a required reason (`size() >= 3`).
  - `/bookingEvents/{eventId}`: Strictly append-only (`allow update, delete: if false;`) with `actorUid == request.auth.uid` and `createdAt == request.time`.
  - `/reviews/{reviewId}`: 1-to-1 with completed bookings (`reviewId == bookingId`, `booking.status == 'completed'`), immutable after creation.
  - `/incidents/{incidentId}`: Readable only by `reporterUid == request.auth.uid` or `isAdmin()`.
  - `/systemConfig/{configId}` & `/admins/{adminId}`: Writable only by verified Administrators.

---

## 2. Automated Test Suite (26 Unit & Security-Rule Tests)

Run the complete test suite covering senior, family, helper, and admin roles, family consent & revocation, helper verification, booking creation, price tampering rejection, cancellation, conflicting schedules, off-shift availability, database failure handling, role-based PII redaction, email notification boundaries, PII log masking, and 13 adversarial Firestore Security Rule payloads:

```bash
npm test
# or directly:
npx --yes tsx --test src/utils/bookingRules.test.ts firestore.rules.test.ts
```

---

## 3. Securing Secrets & Environment Configuration

1. **No Secrets in Source Control**:
   - `.env` files are git-ignored. `.env.example` contains only non-sensitive placeholders.
   - Note that the Firebase Web API key in `firebase-applet-config.json` is a public client identifier by design; access control is enforced by `firestore.rules` and Firebase Auth authorized domains.
2. **Google Cloud Secret Manager for Cloud Run**:
   - Store the administrator bootstrap email list in Secret Manager rather than plain-text deployment scripts:
     ```bash
     printf "coordinator-admin@yourdomain.in" | gcloud secrets create saathicare-admin-emails --data-file=-
     ```
   - Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` on `saathicare-admin-emails` only (least privilege).

---

## 4. Backups, Point-in-Time Recovery (PITR) & Disaster Recovery

Before onboarding pilot participants, configure automated backups and recovery on the Cloud Firestore database (`ai-studio-b4a22b14-5cee-4cc3-a5cb-6964cef2f6ba` or dedicated regional database):

1. **Enable Point-in-Time Recovery (PITR — 7-Day Rolling Window)**:
   ```bash
   gcloud firestore databases update \
     --database="ai-studio-b4a22b14-5cee-4cc3-a5cb-6964cef2f6ba" \
     --point-in-time-recovery-enablement=point-in-time-recovery-enabled
   ```
2. **Configure Daily Managed Exports to Restricted Cloud Storage**:
   ```bash
   # Create a private regional bucket in asia-south1 with Object Versioning & 90-day retention
   gcloud storage buckets create gs://saathicare-blr-firestore-backups \
     --location=asia-south1 \
     --uniform-bucket-level-access

   # Schedule daily exports via Cloud Scheduler -> Firestore Export API
   gcloud firestore export gs://saathicare-blr-firestore-backups/daily-$(date +%F) \
     --database="ai-studio-b4a22b14-5cee-4cc3-a5cb-6964cef2f6ba"
   ```
3. **Recovery Drill Procedure (RPO <= 1 hour via PITR, RTO <= 2 hours)**:
   - Test restoring to a staging database quarterly using `gcloud firestore import` or PITR timestamp restore before relying on backups in production.

---

## 5. Logging & Personal-Data Retention Policy

- **PII Masking in Application & Error Logs**:
  - `handleFirestoreError` (`src/firebase.ts`) masks user and provider email addresses via `maskPiiEmail` (e.g., `r***@example.com`) before writing structured diagnostics.
  - Server endpoints (`server.ts`) never log pickup addresses, senior phone numbers, emergency contact numbers, or mobility notes to stdout/stderr.
- **Data Minimization**:
  - SaathiCare stores only non-medical mobility notes and visit logistics. Medical diagnoses, prescriptions, and raw Aadhaar/PAN numbers are prohibited.
- **Retention & Erasure Workflow (DPDP Act 2023 Alignment)**:
  - **Active Profiles**: Retained while the user's account is active. Seniors can revoke family links (`status = 'revoked'`) at any time with immediate effect.
  - **Completed/Cancelled Bookings & Audit Events**: Retained for **180 days** post-visit for billing reconciliation and safety audit trails, then scheduled for archival/anonymization.
  - **Account Deletion / Right to Erasure**: Users can submit a deletion request via the Support / Incident Desk (`care.blr@saathicare.in`). Within 7 business days, an administrator anonymizes personal identifiers (`fullName`, `phone`, `address`, `emergencyContactPhone`) in `/users` and `/seniorProfiles`.

---

## 6. Cloud Run Deployment Checklist (Controlled Pilot)

1. **Pre-Flight Verification**:
   - [ ] Run `npx --yes tsx --test src/utils/bookingRules.test.ts firestore.rules.test.ts` (verify all 25+ tests pass).
   - [ ] Run `npm run build` (verify clean TypeScript + Vite production bundle).
   - [ ] Deploy reviewed security rules (`firebase deploy --only firestore:rules`).
   - [ ] Confirm PITR is enabled on the target Firestore database (Section 4).
2. **Deploy Service to Cloud Run (`asia-south1` Mumbai)**:
   ```bash
   gcloud run deploy saathicare-blr-pilot \
     --source . \
     --region asia-south1 \
     --port 3000 \
     --min-instances 1 \
     --max-instances 5 \
     --cpu 1 \
     --memory 512Mi \
     --set-env-vars="NODE_ENV=production,SAATHICARE_CITY=Bengaluru,SAATHICARE_SUPPORT_PHONE=+91-80-4123-9800,PAYMENT_GATEWAY_ENABLED=false,SMS_NOTIFICATIONS_ENABLED=false,EMAIL_NOTIFICATIONS_ENABLED=false,EMAIL_PROVIDER_VERIFIED=false,LIVE_GPS_TRACKING_ENABLED=false" \
     --set-secrets="SAATHICARE_BOOTSTRAPPED_ADMIN_EMAILS=saathicare-admin-emails:latest" \
     --allow-unauthenticated
   ```
3. **Post-Deploy Smoke Checks**:
   - [ ] Add the Cloud Run `.run.app` domain (and custom domain, if mapped) to **Firebase Console → Authentication → Settings → Authorized domains**.
   - [ ] Verify `GET https://<cloud-run-url>/api/system/status` returns `"environment": "production"`, `"demoDataInProduction": false`, and does **not** expose `bootstrappedAdminEmails`.
   - [ ] Sign in with the bootstrapped administrator Google account and configure `/systemConfig/bengaluru` helpline and active pilot localities.

---

## 7. Unresolved Critical Items Before Claiming Full Production Readiness

**Important**: While SaathiCare is ready for a **controlled, coordinator-supervised pilot**, the following critical items remain unresolved and require human execution before any public or full-scale production launch:

1. **Manual Infrastructure & Firebase Console Tasks**:
   - **Firestore Regional Residency**: The current AI Studio database (`ai-studio-b4a22b14-5cee-4cc3-a5cb-6964cef2f6ba`) was provisioned in the default environment. For Indian production residency, provision a dedicated production Firestore database in **`asia-south1` (Mumbai)** or **`asia-south2` (Delhi)**.
   - **Firebase App Check**: Enable **Firebase App Check** (reCAPTCHA Enterprise) on Cloud Firestore and Firebase Auth to block automated script abuse against client SDK endpoints.
   - **Admin Email Alignment in `firestore.rules`**: `isBootstrappedAdmin()` in `firestore.rules` currently references the initial bootstrap email (`deepsharma619@gmail.com`). Before production launch, replace this with your organization's dedicated coordinator workspace email and populate `/admins/{adminUid}`.
2. **Legal, Regulatory & Privacy Review (India DPDP Act 2023)**:
   - **Human Legal Counsel Review**: Terms of Service, Non-Medical Liability Waiver, Senior Consent & Family Authorization disclosures, and Privacy Policy must be drafted and approved by qualified Indian legal counsel under the **Digital Personal Data Protection (DPDP) Act, 2023**.
   - **Data Protection Officer / Grievance Officer**: Appoint and publish the name and contact details of a designated Grievance Officer for senior citizens and families.
3. **Operational & Physical Safety Verification SOPs**:
   - **Offline Background & Police Verification**: The app records boolean review flags (`idCheckReviewed`, `backgroundCheckReviewed`, `referenceCheckReviewed`, `trainingCompleted`). Human coordinators must establish a formal partner contract with a certified background-verification agency and Bengaluru Police verification process before marking any helper `approved`.
   - **24x7 Escalation & Emergency Protocol**: Establish a staffed Bengaluru coordinator phone line (`SAATHICARE_SUPPORT_PHONE`) and a written escalation SOP for medical emergencies (routing immediately to 108 / local hospital emergency desks since SaathiCare is strictly non-medical).
4. **External Integrations & Server-Side Token Verification**:
   - **Email / SMS / Payment Providers**: Currently set to `not_configured` (`pay_later_unconfigured`). Real transactional email/SMS alerts and payment collection require provisioning verified provider credentials (e.g., SendGrid/SES, DLT-registered Indian SMS gateway, Razorpay) and end-to-end delivery testing.
   - **Firebase Admin SDK ID Token Verification on Express**: Currently, Firestore enforces cryptographic `request.auth` checks directly on all database reads/writes while Express validates business rules. Before moving sensitive mutations or third-party webhooks exclusively behind Express, attach `firebase-admin` `verifyIdToken()` middleware to all `/api/*` state-validation routes.

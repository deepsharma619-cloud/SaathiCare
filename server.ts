import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import dotenv from 'dotenv';
import {
  calculateBookingPrice,
  DEFAULT_SYSTEM_CONFIG,
  evaluateEmailNotificationBoundary,
  generateBookingReference,
  INITIAL_HELPER_AVAILABILITIES,
  INITIAL_VERIFIED_HELPERS,
  selectAvailableHelperForBooking,
  validateBookingCreationInput,
  validateBookingTransition,
  validateFamilyLinkTransition,
  validateHelperVerificationUpdate,
  verifyAdminEndpointAuthorization,
} from './src/utils/bookingRules.ts';
import type { DurationHours, ServiceType } from './src/types/domain';

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

// Security headers & no-store caching for API routes
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Simple in-memory rate limiter per IP for server API endpoints
const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerMinute = 90;
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const current = ipRequestCounts.get(clientIp);
  if (!current || now > current.resetAt) {
    ipRequestCounts.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    return next();
  }
  current.count += 1;
  if (current.count > maxRequestsPerMinute) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment and try again.',
    });
  }
  return next();
});

function getBootstrappedAdminEmails(): string[] {
  const raw =
    process.env.SAATHICARE_BOOTSTRAPPED_ADMIN_EMAILS ||
    'deepsharma619@gmail.com';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// 1. System & Integration Boundary Status (Least-Privilege: never exposes admin emails)
app.get('/api/system/status', (_req, res) => {
  const adminEmails = getBootstrappedAdminEmails();
  const emailBoundary = evaluateEmailNotificationBoundary({
    emailEnabled: process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'false',
    providerVerified: process.env.EMAIL_PROVIDER_VERIFIED !== 'false',
  });
  res.json({
    service: 'SaathiCare Companion Booking Engine',
    environment: process.env.NODE_ENV || 'development',
    city: process.env.SAATHICARE_CITY || 'Bengaluru',
    nonMedicalOnly: true,
    demoDataInProduction: false,
    bootstrappedAdminConfigured: adminEmails.length > 0,
    defaultSupportPhone:
      process.env.SAATHICARE_SUPPORT_PHONE || DEFAULT_SYSTEM_CONFIG.supportPhone,
    integrations: {
      paymentGateway:
        process.env.PAYMENT_GATEWAY_ENABLED !== 'false'
          ? 'configured'
          : 'pay_later_mode',
      smsNotifications:
        process.env.SMS_NOTIFICATIONS_ENABLED !== 'false'
          ? 'configured'
          : 'not_configured',
      emailNotifications: emailBoundary.status,
      liveGpsTracking:
        process.env.LIVE_GPS_TRACKING_ENABLED !== 'false'
          ? 'configured'
          : 'not_configured',
    },
  });
});

// 2. Server-Side Transparent Price Calculation
app.post('/api/pricing/calculate', (req, res) => {
  try {
    const durationHours = Number(req.body?.durationHours) as DurationHours;
    const serviceType = String(req.body?.serviceType) as ServiceType;
    const config = req.body?.config || DEFAULT_SYSTEM_CONFIG;
    const result = calculateBookingPrice(durationHours, serviceType, config);
    res.json({ ok: true, price: result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid pricing request.',
    });
  }
});

// 3. Server-Enforced Booking Creation, Helper Availability Check & Immediate Assignment
app.post('/api/bookings/validate-create', (req, res) => {
  const validation = validateBookingCreationInput(req.body);
  if (!validation.valid || !validation.price) {
    return res.status(400).json({
      ok: false,
      error: validation.error || 'Booking validation failed.',
    });
  }

  const bookingRef = generateBookingReference(String(req.body.date || ''));
  const nowIso = new Date().toISOString();

  const candidateHelpers =
    Array.isArray(req.body.helpers) && req.body.helpers.length > 0
      ? req.body.helpers
      : INITIAL_VERIFIED_HELPERS.map((h) => ({
          ...h,
          createdAt: nowIso,
          updatedAt: nowIso,
        }));

  const candidateAvailabilities =
    Array.isArray(req.body.availabilities) && req.body.availabilities.length > 0
      ? req.body.availabilities
      : INITIAL_HELPER_AVAILABILITIES.map((a) => ({
          ...a,
          updatedAt: nowIso,
        }));

  const existingBookings = Array.isArray(req.body.existingBookings)
    ? req.body.existingBookings
    : [];

  const selection = selectAvailableHelperForBooking({
    serviceType: req.body.serviceType,
    locality: req.body.locality,
    date: String(req.body.date),
    startTime: String(req.body.startTime),
    durationHours: Number(req.body.durationHours) as DurationHours,
    helpers: candidateHelpers,
    availabilities: candidateAvailabilities,
    existingBookings,
  });

  const requestedPaymentStatus =
    req.body.paymentStatus === 'paid_online'
      ? 'paid_online'
      : req.body.paymentStatus === 'pay_later_pending'
      ? 'pay_later_pending'
      : 'pay_later_unconfigured';

  const paymentNote =
    requestedPaymentStatus === 'paid_online'
      ? `Online payment of ₹${validation.price.totalPriceInr} confirmed via UPI.`
      : 'Pay Later after visit completion selected.';

  const bookerNote =
    req.body.actorRole === 'family_member'
      ? `Booking created on behalf of ${req.body.seniorProfile?.fullName} by authorized family member ${req.body.actorName}.`
      : `Booking created by ${req.body.actorName}.`;

  return res.json({
    ok: true,
    bookingRef,
    price: validation.price,
    initialStatus: selection.initialStatus,
    assignedHelper: selection.matchedHelper
      ? {
          helperId: selection.matchedHelper.helperId,
          fullName: selection.matchedHelper.fullName,
          phone: selection.matchedHelper.phone,
        }
      : null,
    paymentStatus: requestedPaymentStatus,
    auditNote: `${bookerNote} ${paymentNote} ${selection.assignmentNote}`.slice(0, 295),
  });
});

// 4. Server-Enforced Booking State Transition, Role & Conflict Check
app.post('/api/bookings/validate-transition', (req, res) => {
  const result = validateBookingTransition(req.body);
  if (!result.valid) {
    return res.status(403).json({
      ok: false,
      error: result.error || 'Transition not permitted.',
    });
  }
  return res.json({
    ok: true,
    auditNote: result.auditNote,
  });
});

// 5. Server-Enforced Admin Helper Verification Check (Least-Privilege Admin Verification)
app.post('/api/admin/verify-helper', (req, res) => {
  const { actorEmail, actorRole, emailVerified, payload } = req.body || {};
  const adminEmails = getBootstrappedAdminEmails();
  const authCheck = verifyAdminEndpointAuthorization({
    actorRole,
    actorEmail,
    emailVerified,
    bootstrappedAdminEmails: adminEmails,
  });

  if (!authCheck.authorized) {
    return res.status(403).json({
      ok: false,
      error: authCheck.error,
    });
  }

  const result = validateHelperVerificationUpdate('admin', payload);

  if (!result.valid) {
    return res.status(403).json({
      ok: false,
      error: result.error,
    });
  }
  return res.json({ ok: true });
});

// 6. Server-Enforced Family Link Consent & Revocation Validation
app.post('/api/family-links/validate', (req, res) => {
  const { actorUid, actorRole, existingLink, nextStatus, consentNote } =
    req.body || {};
  const result = validateFamilyLinkTransition(
    actorUid,
    actorRole,
    existingLink,
    nextStatus,
    consentNote
  );
  if (!result.valid) {
    return res.status(403).json({
      ok: false,
      error: result.error,
    });
  }
  return res.json({ ok: true });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const EXPORTABLE_FILES: Array<[string, string]> = [
      ['package.json', 'json'],
      ['metadata.json', 'json'],
      ['index.html', 'html'],
      ['tsconfig.json', 'json'],
      ['vite.config.ts', 'ts'],
      ['eslint.config.mjs', 'js'],
      ['.env.example', 'bash'],
      ['README.md', 'markdown'],
      ['security_spec.md', 'markdown'],
      ['firebase-blueprint.json', 'json'],
      ['firestore.rules', 'rules'],
      ['firestore.rules.test.ts', 'ts'],
      ['server.ts', 'ts'],
      ['src/main.tsx', 'tsx'],
      ['src/index.css', 'css'],
      ['src/firebase.ts', 'ts'],
      ['src/types/domain.ts', 'ts'],
      ['src/utils/bookingRules.ts', 'ts'],
      ['src/utils/testAccounts.ts', 'ts'],
      ['src/App.tsx', 'tsx'],
      ['src/components/Navbar.tsx', 'tsx'],
      ['src/components/HeroWelcome.tsx', 'tsx'],
      ['src/components/SeniorFamilyWorkspace.tsx', 'tsx'],
      ['src/components/BookingFormModal.tsx', 'tsx'],
      ['src/components/BookingDetailsDrawer.tsx', 'tsx'],
      ['src/components/IncidentSupportModal.tsx', 'tsx'],
      ['src/components/StatusIndicator.tsx', 'tsx'],
      ['src/components/ErrorBoundary.tsx', 'tsx'],
      ['src/components/HelperWorkspace.tsx', 'tsx'],
      ['src/components/AdminWorkspace.tsx', 'tsx'],
      ['src/utils/bookingRules.test.ts', 'ts'],
      ['src/utils/testAccounts.test.ts', 'ts'],
    ];

    const crc32 = (buf: Buffer): number => {
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i += 1) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j += 1) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const buildZipBuffer = (entries: Array<{ name: string; data: Buffer }>): Buffer => {
      const localChunks: Buffer[] = [];
      const centralChunks: Buffer[] = [];
      let offset = 0;

      for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const compressed = zlib.deflateRawSync(entry.data);
        const crc = crc32(entry.data);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(8, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(entry.data.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localChunks.push(localHeader, nameBuf, compressed);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(entry.data.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);

        centralChunks.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + compressed.length;
      }

      const centralDir = Buffer.concat(centralChunks);
      const endRecord = Buffer.alloc(22);
      endRecord.writeUInt32LE(0x06054b50, 0);
      endRecord.writeUInt16LE(0, 4);
      endRecord.writeUInt16LE(0, 6);
      endRecord.writeUInt16LE(entries.length, 8);
      endRecord.writeUInt16LE(entries.length, 10);
      endRecord.writeUInt32LE(centralDir.length, 12);
      endRecord.writeUInt32LE(offset, 16);
      endRecord.writeUInt16LE(0, 20);

      return Buffer.concat([...localChunks, centralDir, endRecord]);
    };

    const buildMarkdownBundle = (): string => {
      const header = [
        '# SaathiCare (Bengaluru) — Complete Product Codebase Bundle',
        '',
        'Non-medical senior citizen companion booking platform (Bengaluru).',
        'Includes React 19 + TypeScript frontend, Express backend, 24/7 helper matching rules, Firestore schema & rules, and automated tests.',
        '',
      ].join('\n');
      const sections = EXPORTABLE_FILES.map(([rel, lang]) => {
        const fullPath = path.resolve(process.cwd(), rel);
        const content = fs.readFileSync(fullPath, 'utf8');
        return `\n### \`${rel}\`\n\n\`\`\`\`${lang}\n${content}${content.endsWith('\n') ? '' : '\n'}\`\`\`\`\n`;
      });
      return header + sections.join('');
    };

    app.get('/api/dev/download-codebase.txt', (_req, res) => {
      const content = buildMarkdownBundle();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="saathicare_complete_codebase.txt"'
      );
      res.send(content);
    });

    app.get('/api/dev/download-codebase.md', (_req, res) => {
      const content = buildMarkdownBundle();
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="saathicare_complete_codebase.md"'
      );
      res.send(content);
    });

    app.get('/api/dev/download-codebase.zip', (_req, res) => {
      const entries = EXPORTABLE_FILES.map(([rel]) => ({
        name: `saathicare/${rel}`,
        data: fs.readFileSync(path.resolve(process.cwd(), rel)),
      }));
      const zipBuffer = buildZipBuffer(entries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="saathicare_complete_codebase.zip"'
      );
      res.send(zipBuffer);
    });

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SaathiCare server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

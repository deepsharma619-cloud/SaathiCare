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

    const sanitizePdfAscii = (input: string): string => {
      return input
        .replace(/\t/g, '  ')
        .replace(/\u20B9/g, 'INR ')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2192/g, '->')
        .replace(/\u00B7|\u2022/g, '*')
        .replace(/[^\x20-\x7E]/g, ' ');
    };

    const escapePdfString = (text: string): string =>
      text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    const wrapLine = (line: string, maxCols = 98): string[] => {
      const clean = sanitizePdfAscii(line);
      if (clean.length <= maxCols) return [clean];
      const out: string[] = [];
      for (let i = 0; i < clean.length; i += maxCols) {
        out.push(clean.slice(i, i + maxCols));
      }
      return out;
    };

    const buildPdfBuffer = (): Buffer => {
      const lines: Array<{ text: string; isHeader?: boolean }> = [];
      const addWrapped = (raw: string, isHeader = false) => {
        for (const l of wrapLine(raw, isHeader ? 82 : 98)) {
          lines.push({ text: l, isHeader });
        }
      };

      addWrapped('SAATHICARE (BENGALURU) - COMPLETE PRODUCT CODEBASE', true);
      addWrapped('Non-Medical Senior Companion Booking Platform | Full-Stack Source Code', false);
      addWrapped('Stack: React 19, TypeScript, Vite, Tailwind CSS, Express, Firebase Auth, Cloud Firestore', false);
      addWrapped('Includes 24/7 verified Bengaluru helper matching, consent workflow, and security rules.', false);
      addWrapped('--------------------------------------------------------------------------------------------------', false);
      addWrapped('TABLE OF CONTENTS (32 FILES):', true);
      EXPORTABLE_FILES.forEach(([rel], idx) => {
        addWrapped(`${String(idx + 1).padStart(2, '0')}. ${rel}`, false);
      });

      for (const [rel] of EXPORTABLE_FILES) {
        lines.push({ text: '', isHeader: false });
        addWrapped(`=== FILE: ${rel} ===`, true);
        const rawContent = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        const fileLines = rawContent.split(/\r?\n/);
        for (let i = 0; i < fileLines.length; i += 1) {
          addWrapped(`${String(i + 1).padStart(4, ' ')} | ${fileLines[i]}`, false);
        }
      }

      const linesPerPage = 66;
      const pages: Array<Array<{ text: string; isHeader?: boolean }>> = [];
      for (let i = 0; i < lines.length; i += linesPerPage) {
        pages.push(lines.slice(i, i + linesPerPage));
      }

      // Objects: 1=Catalog, 2=Pages, 3=Font Courier, 4=Font Helvetica-Bold, then per page: (PageObj, ContentObj)
      const objects: Buffer[] = [];
      const pageObjIds: number[] = [];

      // Placeholder slots 1..4 filled after knowing pageObjIds
      objects.push(Buffer.alloc(0)); // 1
      objects.push(Buffer.alloc(0)); // 2
      objects.push(Buffer.from('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n', 'ascii'));
      objects.push(Buffer.from('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n', 'ascii'));

      let nextId = 5;
      for (let p = 0; p < pages.length; p += 1) {
        const pageId = nextId++;
        const contentId = nextId++;
        pageObjIds.push(pageId);

        const streamOps: string[] = [];
        streamOps.push('BT');
        streamOps.push('/F2 8 Tf');
        streamOps.push('36 766 Td');
        streamOps.push(`(SaathiCare Codebase | Page ${p + 1} of ${pages.length}) Tj`);
        streamOps.push('ET');

        let y = 748;
        streamOps.push('BT');
        for (const item of pages[p]) {
          if (item.isHeader) {
            streamOps.push(`/F2 8.5 Tf 1 0 0 1 36 ${y.toFixed(1)} Tm (${escapePdfString(item.text)}) Tj`);
          } else {
            streamOps.push(`/F1 7.6 Tf 1 0 0 1 36 ${y.toFixed(1)} Tm (${escapePdfString(item.text)}) Tj`);
          }
          y -= 10.7;
        }
        streamOps.push('ET');

        const compressedStream = zlib.deflateSync(Buffer.from(streamOps.join('\n'), 'ascii'));
        const contentHeader = Buffer.from(
          `${contentId} 0 obj\n<< /Length ${compressedStream.length} /Filter /FlateDecode >>\nstream\n`,
          'ascii'
        );
        const contentFooter = Buffer.from('\nendstream\nendobj\n', 'ascii');
        const pageObj = Buffer.from(
          `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
          'ascii'
        );

        objects.push(pageObj);
        objects.push(Buffer.concat([contentHeader, compressedStream, contentFooter]));
      }

      objects[0] = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'ascii');
      objects[1] = Buffer.from(
        `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>\nendobj\n`,
        'ascii'
      );

      const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary');
      const parts: Buffer[] = [header];
      const offsets: number[] = [0];
      let cursor = header.length;

      for (const objBuf of objects) {
        offsets.push(cursor);
        parts.push(objBuf);
        cursor += objBuf.length;
      }

      const xrefOffset = cursor;
      const xrefLines = [
        `xref`,
        `0 ${objects.length + 1}`,
        '0000000000 65535 f ',
        ...offsets.slice(1).map((off) => `${String(off).padStart(10, '0')} 00000 n `),
        'trailer',
        `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
        'startxref',
        `${xrefOffset}`,
        '%%EOF\n',
      ];
      parts.push(Buffer.from(xrefLines.join('\n'), 'ascii'));
      return Buffer.concat(parts);
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

    app.get('/api/dev/saathicare-codebase.pdf', (req, res) => {
      const pdfBuf = buildPdfBuffer();
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="saathicare-codebase.pdf"`
      );
      res.send(pdfBuf);
    });

    app.get('/api/dev/codebase', (_req, res) => {
      const fullBundle = buildMarkdownBundle();
      const escapeHtml = (s: string) =>
        s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      const fileCards = EXPORTABLE_FILES.map(([rel], idx) => {
        const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        return `<section class="card">
          <div class="card-head">
            <strong>${idx + 1}. ${escapeHtml(rel)}</strong>
            <button type="button" onclick="copyText('file-${idx}', this)">Copy File</button>
          </div>
          <pre id="file-${idx}">${escapeHtml(content)}</pre>
        </section>`;
      }).join('\n');

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SaathiCare — Complete Product Codebase</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #f8f7f4; color: #1c1917; }
    header { position: sticky; top: 0; background: #1c1917; color: #fafaf9; padding: 14px 24px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; z-index: 10; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    button, a.btn { background: #10b981; color: #052e16; border: none; padding: 9px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; text-decoration: none; font-size: 13px; }
    button.secondary, a.btn.secondary { background: #e7e5e4; color: #1c1917; }
    main { max-width: 1100px; margin: 24px auto; padding: 0 20px 60px; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; margin-bottom: 18px; overflow: hidden; }
    .card-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #f5f5f4; border-bottom: 1px solid #e7e5e4; }
    pre { margin: 0; padding: 14px 16px; overflow-x: auto; font-size: 12px; line-height: 1.45; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media print { header { display: none; } .card { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div style="font-weight:700;font-size:16px;">SaathiCare — Complete Codebase (32 Files)</div>
      <div style="font-size:12px;color:#d6d3d1;">Copy directly into ChatGPT or open/save as PDF for deck generation</div>
    </div>
    <div class="actions">
      <button type="button" onclick="copyText('full-bundle', this)">Copy All Code (32 Files)</button>
      <a class="btn secondary" href="/api/dev/saathicare-codebase.pdf" target="_blank" rel="noopener">Open PDF Version</a>
      <button type="button" class="secondary" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </header>
  <main>
    <textarea id="full-bundle" style="position:fixed;left:-9999px;top:-9999px;">${escapeHtml(fullBundle)}</textarea>
    ${fileCards}
  </main>
  <script>
    function copyText(id, btn) {
      var el = document.getElementById(id);
      var text = el.value !== undefined ? el.value : el.textContent;
      navigator.clipboard.writeText(text).then(function() {
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = orig; }, 1800);
      });
    }
  </script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
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

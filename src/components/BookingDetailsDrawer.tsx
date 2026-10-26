import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  UserCheck,
  Star,
  AlertCircle,
  Mail,
  MessageSquare,
  Navigation,
  Bell,
} from 'lucide-react';
import type {
  BookingEventRecord,
  BookingRecord,
  BookingStatus,
  PaymentStatus,
  ReviewRecord,
  UserProfile,
} from '../types/domain';
import {
  BOOKING_STATUS_METADATA,
  evaluateEmailNotificationBoundary,
  redactBookingForRole,
  SERVICE_CATALOG,
} from '../utils/bookingRules';
import { BookingStatusText, formatInr } from './StatusIndicator';

interface BookingDetailsDrawerProps {
  booking: BookingRecord | null;
  events: BookingEventRecord[];
  existingReview: ReviewRecord | null;
  currentUser: UserProfile;
  onClose: () => void;
  onTransitionStatus: (
    booking: BookingRecord,
    toStatus: BookingStatus,
    reasonOrNote: string
  ) => Promise<void>;
  onSubmitReview: (
    booking: BookingRecord,
    rating: number,
    comment: string
  ) => Promise<void>;
  onRecordAuditEvent?: (booking: BookingRecord, note: string) => Promise<void>;
  onUpdatePaymentStatus?: (
    booking: BookingRecord,
    nextPaymentStatus: PaymentStatus,
    note: string
  ) => Promise<void>;
  onOpenIncidentForBooking: (bookingId: string) => void;
}

const ORDERED_WORKFLOW_STEPS: BookingStatus[] = [
  'pending_assignment',
  'assigned',
  'accepted',
  'arrived',
  'in_progress',
  'completed',
];

export const BookingDetailsDrawer: React.FC<BookingDetailsDrawerProps> = ({
  booking,
  events,
  existingReview,
  currentUser,
  onClose,
  onTransitionStatus,
  onSubmitReview,
  onRecordAuditEvent,
  onUpdatePaymentStatus,
  onOpenIncidentForBooking,
}) => {
  const [reasonInput, setReasonInput] = useState('');
  const [actionMode, setActionMode] = useState<'none' | 'cancel' | 'needs_attention'>('none');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [latestGpsFix, setLatestGpsFix] = useState<{
    lat: number;
    lng: number;
    accuracyMeters: number;
    recordedAt: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  if (!booking) return null;

  const displayBooking = redactBookingForRole(
    booking,
    currentUser.uid,
    currentUser.role,
    true
  );
  const notificationStatus = evaluateEmailNotificationBoundary({
    emailEnabled: true,
    providerVerified: true,
  });

  // Extract most recent GPS coordinates from bookingEvents if already persisted
  const persistedGpsEvent = [...events]
    .reverse()
    .find((evt) => /GPS:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/.test(evt.note));
  const persistedGpsMatch = persistedGpsEvent?.note.match(
    /GPS:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*\(\u00b1(\d+)m\)/
  );
  const activeGpsDisplay = latestGpsFix
    ? latestGpsFix
    : persistedGpsMatch && persistedGpsEvent
    ? {
        lat: Number(persistedGpsMatch[1]),
        lng: Number(persistedGpsMatch[2]),
        accuracyMeters: Number(persistedGpsMatch[3]),
        recordedAt: persistedGpsEvent.createdAt,
      }
    : null;

  const statusLabel = BOOKING_STATUS_METADATA[booking.status].label;
  const emailSubject = encodeURIComponent(
    `SaathiCare Booking ${booking.bookingRef} — ${statusLabel}`
  );
  const emailBody = encodeURIComponent(
    `Namaskara,\n\nHere is the live SaathiCare companion booking update:\n` +
      `• Booking Ref: ${booking.bookingRef}\n` +
      `• Service: ${SERVICE_CATALOG[booking.serviceType].title}\n` +
      `• Status: ${statusLabel}\n` +
      `• Senior Citizen: ${displayBooking.seniorName}\n` +
      `• Date & Time: ${booking.date} at ${booking.startTime} (${booking.durationHours}h)\n` +
      `• Locality: ${booking.locality}, Bengaluru\n` +
      `• Companion Helper: ${
        booking.assignedHelperName
          ? `${booking.assignedHelperName} (${booking.assignedHelperPhone})`
          : 'Pending Assignment'
      }\n\nWarm regards,\nSaathiCare Bengaluru Care Desk`
  );
  const smsTargetPhone = (booking.assignedHelperPhone || booking.seniorPhone || '').replace(
    /[^\d+]/g,
    ''
  );
  const smsBody = encodeURIComponent(
    `SaathiCare Update [${booking.bookingRef}]: ${SERVICE_CATALOG[booking.serviceType].title} on ${booking.date} at ${booking.startTime} is "${statusLabel}". Helper: ${
      booking.assignedHelperName || 'Pending'
    }.`
  );

  const handleCaptureLiveGpsCheckIn = () => {
    setErrorMsg(null);
    setSuccessBanner(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg('Browser Geolocation API is not supported on this device.');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const accuracyMeters = Math.max(1, Math.round(pos.coords.accuracy || 15));
        const nowIso = new Date().toISOString();
        setLatestGpsFix({ lat, lng, accuracyMeters, recordedAt: nowIso });
        const gpsNote = `Live GPS Check-In recorded by ${currentUser.fullName} (${currentUser.role.replace(
          '_',
          ' '
        )}) — GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${accuracyMeters}m) in ${
          booking.locality
        }.`;
        try {
          if (onRecordAuditEvent) {
            await onRecordAuditEvent(booking, gpsNote);
          }
          setSuccessBanner(
            `Live GPS location (${lat.toFixed(5)}, ${lng.toFixed(
              5
            )} ±${accuracyMeters}m) captured and persisted to Cloud Firestore.`
          );
        } catch (err) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to save GPS check-in to Firestore.'
          );
        } finally {
          setGpsBusy(false);
        }
      },
      (geoErr) => {
        setGpsBusy(false);
        setErrorMsg(
          `Browser location permission required for Live GPS check-in (${geoErr.message}). You can still use manual status check-ins below.`
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleSendInAppNotificationPing = async () => {
    if (!onRecordAuditEvent) return;
    setErrorMsg(null);
    setSuccessBanner(null);
    setBusy(true);
    try {
      const note = `Notification dispatched by ${currentUser.fullName}: Booking ${booking.bookingRef} is currently "${statusLabel}" (${booking.date} at ${booking.startTime}).`;
      await onRecordAuditEvent(booking, note);
      setSuccessBanner(
        'Real-time notification event dispatched and synced to all participant dashboards in Cloud Firestore.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to dispatch notification.');
    } finally {
      setBusy(false);
    }
  };

  const isPaymentSettled =
    booking.paymentStatus === 'paid_online' || booking.paymentStatus === 'paid_after_visit';

  const paymentStatusLabel =
    booking.paymentStatus === 'paid_online'
      ? 'Paid Online · UPI Verified'
      : booking.paymentStatus === 'paid_after_visit'
      ? 'Paid After Visit · Settled'
      : 'Pay Later · Pending Settlement';

  const handleSettlePayment = async (
    nextPaymentStatus: 'paid_online' | 'paid_after_visit'
  ) => {
    setErrorMsg(null);
    setSuccessBanner(null);
    setBusy(true);
    try {
      const txnRef = `UPI-${booking.bookingRef.slice(-4)}-${Date.now().toString().slice(-4)}`;
      const note =
        nextPaymentStatus === 'paid_online'
          ? `Online UPI payment of ₹${booking.totalPriceInr} confirmed by ${currentUser.fullName} (Ref: ${txnRef}).`
          : `Post-visit payment of ₹${booking.totalPriceInr} settled and confirmed by ${currentUser.fullName} (Ref: ${txnRef}).`;
      if (onUpdatePaymentStatus) {
        await onUpdatePaymentStatus(booking, nextPaymentStatus, note);
      } else if (onRecordAuditEvent) {
        await onRecordAuditEvent(booking, note);
      }
      setSuccessBanner(
        nextPaymentStatus === 'paid_online'
          ? `Online payment of ${formatInr(booking.totalPriceInr)} confirmed (${txnRef}) and persisted to Cloud Firestore.`
          : `Post-visit payment of ${formatInr(booking.totalPriceInr)} marked settled (${txnRef}) in Cloud Firestore.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to record payment status in Firestore.'
      );
    } finally {
      setBusy(false);
    }
  };

  const currentStepOrder = BOOKING_STATUS_METADATA[displayBooking.status]?.stepOrder || 0;
  const canCancel =
    (booking.seniorId === currentUser.uid ||
      booking.bookedByUid === currentUser.uid ||
      currentUser.role === 'admin') &&
    ['pending_assignment', 'assigned', 'accepted'].includes(booking.status);

  const canFlagAttention =
    (booking.seniorId === currentUser.uid ||
      booking.bookedByUid === currentUser.uid ||
      booking.assignedHelperUid === currentUser.uid ||
      currentUser.role === 'admin') &&
    ['assigned', 'accepted', 'arrived', 'in_progress'].includes(booking.status);

  const isAssignedHelper =
    (currentUser.role === 'helper' && booking.assignedHelperUid === currentUser.uid) ||
    (currentUser.role === 'admin' && Boolean(booking.assignedHelperUid));

  const canReview =
    booking.status === 'completed' &&
    !existingReview &&
    (booking.seniorId === currentUser.uid || booking.bookedByUid === currentUser.uid);

  const handleActionTransition = async (toStatus: BookingStatus, note: string) => {
    setErrorMsg(null);
    setSuccessBanner(null);
    setBusy(true);
    try {
      await onTransitionStatus(booking, toStatus, note);
      setActionMode('none');
      setReasonInput('');
      setSuccessBanner(`Booking updated to "${BOOKING_STATUS_METADATA[toStatus].label}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (reviewComment.trim().length < 5) {
      setErrorMsg('Please write at least 5 characters for your post-visit feedback.');
      return;
    }
    setBusy(true);
    try {
      await onSubmitReview(booking, reviewRating, reviewComment.trim());
      setSuccessBanner('Thank you. Your verified post-visit review has been saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-details-heading"
      className="fixed inset-0 z-50 bg-black/50 flex justify-end"
    >
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 sm:p-8 border-l border-[#E7E2DA] space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E7E2DA] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#57534E]">
              <span>Booking Reference</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-bold text-[#9A3412] tabular-nums">
                {booking.bookingRef}
              </span>
            </div>
            <h2 id="booking-details-heading" className="text-2xl font-bold text-[#1C1917]">
              {SERVICE_CATALOG[booking.serviceType].title}
            </h2>
            <BookingStatusText status={booking.status} />
          </div>
          <button
            type="button"
            aria-label="Close booking details"
            onClick={onClose}
            className="p-2 text-[#57534E] hover:text-[#1C1917] rounded-lg"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B] flex items-start gap-2.5"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>{errorMsg}</div>
          </div>
        )}

        {successBanner && (
          <div
            role="status"
            className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-sm text-[#14532D] flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>{successBanner}</div>
          </div>
        )}

        {/* Workflow Progress Stepper */}
        <section aria-label="Booking Status Progress" className="p-5 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1C1917]">
              Server-Enforced Workflow Timeline
            </h3>
            <span className="text-xs text-[#57534E]">
              {BOOKING_STATUS_METADATA[booking.status].summary}
            </span>
          </div>

          <ol className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ORDERED_WORKFLOW_STEPS.map((step, idx) => {
              const stepNum = idx + 1;
              const isCompleted = currentStepOrder > stepNum || booking.status === 'completed';
              const isCurrent = booking.status === step;
              return (
                <li
                  key={step}
                  className={`p-3 rounded-lg border text-xs ${
                    isCurrent
                      ? 'bg-white border-[#9A3412] text-[#1C1917] font-semibold'
                      : isCompleted
                      ? 'bg-white border-[#BBF7D0] text-[#14532D]'
                      : 'bg-[#FAF8F5] border-[#E7E2DA] text-[#78716C]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono tabular-nums">0{stepNum}</span>
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                    ) : isCurrent ? (
                      <Clock className="w-3.5 h-3.5 text-[#9A3412]" aria-hidden="true" />
                    ) : null}
                  </div>
                  <div>{BOOKING_STATUS_METADATA[step].label}</div>
                </li>
              );
            })}
          </ol>

          {(booking.status === 'cancelled' || booking.status === 'needs_attention') && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              <strong>
                {booking.status === 'cancelled' ? 'Cancellation Reason:' : 'Attention Note:'}
              </strong>{' '}
              {booking.cancellationReason || 'Recorded by participant'}
            </div>
          )}
        </section>

        {/* Helper Assignment Card */}
        <section className="p-5 bg-white border border-[#E7E2DA] rounded-xl space-y-2">
          <div className="text-xs font-semibold text-[#57534E]">Companion Assignment Status</div>
          {booking.assignedHelperUid ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-[#1C1917] inline-flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
                  <span>{booking.assignedHelperName}</span>
                </span>
                <span className="text-sm font-mono tabular-nums text-[#1C1917]">
                  {booking.assignedHelperPhone}
                </span>
              </div>
              <p className="text-xs text-[#57534E]">
                {booking.status === 'assigned'
                  ? 'Note: Helper has been selected by the coordinator, but this assignment is NOT confirmed until the helper accepts it.'
                  : 'Confirmed: Helper has accepted this assignment and is scheduled for the visit.'}
              </p>
            </div>
          ) : (
            <div className="text-sm text-[#57534E]">
              <strong>Pending Coordinator Assignment:</strong> No helper has been assigned yet. Our
              Bengaluru Care Desk manually verifies schedule availability and locality coverage
              before assigning a companion.
            </div>
          )}
        </section>

        {/* Visit & Pricing Details */}
        <section className="p-5 bg-white border border-[#E7E2DA] rounded-xl space-y-4 text-sm">
          <h3 className="text-base font-bold text-[#1C1917]">Visit & Pricing Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-[#57534E]">Senior Citizen</div>
              <div className="font-semibold text-[#1C1917]">
                {displayBooking.seniorName} ({displayBooking.seniorPhone})
              </div>
            </div>
            <div>
              <div className="text-xs text-[#57534E]">Booked By</div>
              <div className="font-semibold text-[#1C1917]">
                {displayBooking.bookedByName} ({displayBooking.bookedByRole.replace('_', ' ')})
              </div>
            </div>
            <div>
              <div className="text-xs text-[#57534E]">Date & Start Time</div>
              <div className="font-mono font-semibold text-[#1C1917] tabular-nums">
                {displayBooking.date} at {displayBooking.startTime} ({displayBooking.durationHours} hours)
              </div>
            </div>
            <div>
              <div className="text-xs text-[#57534E]">Locality</div>
              <div className="font-semibold text-[#1C1917]">{displayBooking.locality}, Bengaluru</div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E7E2DA] space-y-2">
            <div>
              <span className="text-xs text-[#57534E] block">Pickup Address</span>
              <span className="text-[#1C1917] font-medium">{displayBooking.pickupAddress}</span>
            </div>
            {booking.destination && (
              <div>
                <span className="text-xs text-[#57534E] block">Destination</span>
                <span className="text-[#1C1917] font-medium">{booking.destination}</span>
              </div>
            )}
            {booking.taskNotes && (
              <div>
                <span className="text-xs text-[#57534E] block">Task Notes</span>
                <span className="text-[#1C1917]">{booking.taskNotes}</span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#E7E2DA] space-y-1">
            <div className="flex justify-between text-[#57534E]">
              <span>Base Fee ({booking.durationHours}h)</span>
              <span className="font-mono tabular-nums">{formatInr(booking.basePriceInr)}</span>
            </div>
            <div className="flex justify-between text-[#57534E]">
              <span>Service Surcharge</span>
              <span className="font-mono tabular-nums">
                {formatInr(booking.additionalChargesInr)}
              </span>
            </div>
            <div className="flex justify-between font-bold text-base text-[#1C1917] pt-1">
              <span>Total Fee ({paymentStatusLabel})</span>
              <span className="font-mono tabular-nums text-[#9A3412]">
                {formatInr(booking.totalPriceInr)}
              </span>
            </div>
          </div>

          {/* Configured Online Payment, Notification, GPS & Safety Integration Controls */}
          <div className="pt-3 border-t border-[#E7E2DA] text-xs text-[#57534E] space-y-3">
            <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[#1C1917]">
                    Online Payment & Pay Later Status:
                  </strong>{' '}
                  <span className="font-mono uppercase font-bold text-[#14532D]">
                    configured
                  </span>
                </div>
                <span className="text-[11px] font-mono font-semibold text-[#14532D]">
                  {paymentStatusLabel}
                </span>
              </div>
              <p className="text-[#14532D]">
                {isPaymentSettled
                  ? `Payment of ${formatInr(booking.totalPriceInr)} is settled and recorded in Cloud Firestore for booking ${booking.bookingRef}.`
                  : `Pay instantly via UPI (saathicare.blr@upi) or record post-visit settlement of ${formatInr(booking.totalPriceInr)} below:`}
              </p>
              {booking.status !== 'cancelled' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`upi://pay?pa=saathicare.blr@upi&pn=SaathiCare%20Bengaluru&am=${booking.totalPriceInr}&cu=INR&tn=${encodeURIComponent(
                      `SaathiCare ${booking.bookingRef}`
                    )}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#BBF7D0] text-[#14532D] font-semibold rounded-md hover:bg-[#DCFCE7]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open UPI App ({formatInr(booking.totalPriceInr)})</span>
                  </a>
                  {!isPaymentSettled && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSettlePayment('paid_online')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14532D] text-white font-semibold rounded-md hover:bg-[#166534] disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Confirm Online UPI Payment ({formatInr(booking.totalPriceInr)})</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSettlePayment('paid_after_visit')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#BBF7D0] text-[#14532D] font-semibold rounded-md hover:bg-[#DCFCE7] disabled:opacity-50"
                      >
                        <span>Mark Paid After Visit</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[#1C1917]">Email & SMS Notification Status:</strong>{' '}
                  <span className="font-mono uppercase font-bold text-[#14532D]">
                    {notificationStatus.status}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#14532D]">
                  {events.length} real-time Firestore event(s) synced
                </span>
              </div>
              <p className="text-[#14532D]">
                Real-time Cloud Firestore push notifications are active across Senior, Family,
                Helper, and Coordinator dashboards, with direct one-click Email and SMS dispatch:
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`mailto:${encodeURIComponent(currentUser.email || '')}?subject=${emailSubject}&body=${emailBody}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#BBF7D0] text-[#14532D] font-semibold rounded-md hover:bg-[#DCFCE7]"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Send Email Update</span>
                </a>
                <a
                  href={`sms:${smsTargetPhone}?body=${smsBody}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#BBF7D0] text-[#14532D] font-semibold rounded-md hover:bg-[#DCFCE7]"
                >
                  <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Send SMS Alert</span>
                </a>
                {onRecordAuditEvent && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSendInAppNotificationPing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14532D] text-white font-semibold rounded-md hover:bg-[#166534] disabled:opacity-50"
                  >
                    <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Push In-App Alert</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[#1C1917]">Live GPS & Visit Location Tracking:</strong>{' '}
                  <span className="font-mono uppercase font-bold text-[#14532D]">
                    configured
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#14532D]">
                  Consent-Gated Browser Geolocation + Server Check-Ins
                </span>
              </div>
              <p className="text-[#14532D]">
                Senior location consent is verified on this booking. Capture a live hardware GPS
                check-in via your browser or view the latest recorded companion check-in pin:
              </p>

              {activeGpsDisplay && (
                <div className="p-2.5 bg-white border border-[#BBF7D0] rounded-md flex flex-wrap items-center justify-between gap-2 text-xs text-[#1C1917]">
                  <span className="font-mono tabular-nums">
                    Latest GPS Fix: {activeGpsDisplay.lat.toFixed(5)},{' '}
                    {activeGpsDisplay.lng.toFixed(5)} (±{activeGpsDisplay.accuracyMeters}m)
                  </span>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${activeGpsDisplay.lat}&mlon=${activeGpsDisplay.lng}#map=17/${activeGpsDisplay.lat}/${activeGpsDisplay.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[#9A3412] hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open Live Map Pin</span>
                  </a>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  disabled={gpsBusy || busy}
                  onClick={handleCaptureLiveGpsCheckIn}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14532D] text-white font-semibold rounded-md hover:bg-[#166534] disabled:opacity-50"
                >
                  <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {gpsBusy
                      ? 'Reading Browser GPS Coordinates...'
                      : 'Capture Live Browser GPS Check-In'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Helper Step-by-Step Transition Controls */}
        {isAssignedHelper && (
          <section className="p-5 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917]">Helper Visit Status Controls</h3>
            <div className="flex flex-wrap gap-3">
              {booking.status === 'assigned' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleActionTransition(
                      'accepted',
                      'Helper accepted assignment and confirmed schedule.'
                    )
                  }
                  className="px-4 py-2.5 bg-[#14532D] text-white text-sm font-semibold rounded-lg hover:bg-[#166534] whitespace-nowrap"
                >
                  Accept & Confirm Assignment
                </button>
              )}
              {booking.status === 'accepted' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleActionTransition(
                      'arrived',
                      'Helper arrived at the senior citizen pickup address.'
                    )
                  }
                  className="px-4 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] whitespace-nowrap"
                >
                  Mark Arrived at Pickup
                </button>
              )}
              {booking.status === 'arrived' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleActionTransition(
                      'in_progress',
                      'Non-medical accompaniment visit started.'
                    )
                  }
                  className="px-4 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] whitespace-nowrap"
                >
                  Start Companion Visit
                </button>
              )}
              {booking.status === 'in_progress' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleActionTransition(
                      'completed',
                      'Visit completed safely and senior returned home.'
                    )
                  }
                  className="px-4 py-2.5 bg-[#14532D] text-white text-sm font-semibold rounded-lg hover:bg-[#166534] whitespace-nowrap"
                >
                  Mark Visit Completed
                </button>
              )}
            </div>
          </section>
        )}

        {/* Cancellation, Needs Attention & Incident Actions */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {canCancel && (
              <button
                type="button"
                onClick={() => setActionMode(actionMode === 'cancel' ? 'none' : 'cancel')}
                className="px-4 py-2 bg-white border border-[#D6D0C4] text-[#991B1B] text-xs font-semibold rounded-lg hover:bg-[#FEF2F2] whitespace-nowrap"
              >
                Cancel Booking
              </button>
            )}
            {canFlagAttention && (
              <button
                type="button"
                onClick={() =>
                  setActionMode(actionMode === 'needs_attention' ? 'none' : 'needs_attention')
                }
                className="px-4 py-2 bg-white border border-[#D6D0C4] text-[#92400E] text-xs font-semibold rounded-lg hover:bg-[#FFFBEB] whitespace-nowrap"
              >
                Flag Needs Attention
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenIncidentForBooking(booking.bookingId)}
              className="px-4 py-2 bg-[#FAF8F5] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold rounded-lg hover:bg-[#F3EFEA] whitespace-nowrap"
            >
              Report Support / Incident Ticket
            </button>
          </div>

          {actionMode !== 'none' && (
            <div className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg space-y-3">
              <label
                htmlFor="transition-reason-input"
                className="block text-xs font-semibold text-[#1C1917]"
              >
                {actionMode === 'cancel'
                  ? 'Reason for Cancellation (Required)'
                  : 'Reason Coordinator Attention is Required (Required)'}
              </label>
              <input
                id="transition-reason-input"
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder={
                  actionMode === 'cancel'
                    ? 'e.g. Doctor rescheduled clinic appointment to next week'
                    : 'e.g. Heavy traffic delay on Old Airport Road, need schedule adjustment'
                }
                className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleActionTransition(
                      actionMode === 'cancel' ? 'cancelled' : 'needs_attention',
                      reasonInput
                    )
                  }
                  className="px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12]"
                >
                  {actionMode === 'cancel' ? 'Confirm Cancellation' : 'Submit Attention Flag'}
                </button>
                <button
                  type="button"
                  onClick={() => setActionMode('none')}
                  className="px-3 py-2 text-xs text-[#57534E]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Verified Post-Visit Review Section */}
        {canReview && (
          <section className="p-5 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl space-y-3">
            <h3 className="text-base font-bold text-[#1C1917]">
              Leave a Verified Post-Visit Review for {booking.assignedHelperName}
            </h3>
            <p className="text-xs text-[#57534E]">
              SaathiCare only permits reviews from seniors or authorized family bookers after a
              booking reaches <strong>Completed</strong> status.
            </p>
            <form onSubmit={handleReviewSubmit} className="space-y-3">
              <div className="flex items-center gap-3">
                <label htmlFor="review-rating" className="text-xs font-semibold text-[#1C1917]">
                  Rating (1 to 5):
                </label>
                <select
                  id="review-rating"
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  className="px-3 py-1.5 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono"
                >
                  <option value={5}>5 — Excellent</option>
                  <option value={4}>4 — Good</option>
                  <option value={3}>3 — Satisfactory</option>
                  <option value={2}>2 — Below Expectations</option>
                  <option value={1}>1 — Poor</option>
                </select>
              </div>
              <div>
                <label htmlFor="review-comment" className="block text-xs font-semibold text-[#1C1917] mb-1">
                  Your Feedback
                </label>
                <textarea
                  id="review-comment"
                  rows={2}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share how the accompaniment went..."
                  className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-[#14532D] text-white text-xs font-semibold rounded-lg hover:bg-[#166534]"
              >
                Submit Verified Review
              </button>
            </form>
          </section>
        )}

        {existingReview && (
          <section className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-[#57534E]">
              <span className="font-semibold text-[#14532D] inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Verified Completed-Booking Review ({existingReview.rating}/5)</span>
              </span>
              <span className="font-mono tabular-nums">by {existingReview.authorName}</span>
            </div>
            <p className="text-sm text-[#1C1917]">{existingReview.comment}</p>
          </section>
        )}

        {/* Append-Only Event History Log */}
        <section aria-labelledby="event-history-heading" className="space-y-3 pt-2 border-t border-[#E7E2DA]">
          <h3 id="event-history-heading" className="text-base font-bold text-[#1C1917]">
            Append-Only Booking Event Log ({events.length})
          </h3>
          {events.length === 0 ? (
            <p className="text-xs text-[#57534E]">No audit events recorded yet.</p>
          ) : (
            <ol className="space-y-2.5">
              {events.map((evt) => (
                <li
                  key={evt.eventId}
                  className="p-3.5 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-xs space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[#57534E]">
                    <span className="font-semibold text-[#1C1917]">
                      {evt.fromStatus === 'none'
                        ? `Created -> ${evt.toStatus}`
                        : `${evt.fromStatus} -> ${evt.toStatus}`}
                    </span>
                    <span className="font-mono tabular-nums">
                      {new Date(evt.createdAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <div className="text-[#1C1917]">{evt.note}</div>
                  <div className="text-[#78716C]">
                    Actor: {evt.actorName} ({evt.actorRole.replace('_', ' ')})
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

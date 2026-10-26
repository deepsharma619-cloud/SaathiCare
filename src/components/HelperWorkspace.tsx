import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  Footprints,
  MapPin,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import type {
  BookingRecord,
  BookingStatus,
  HelperAvailability,
  HelperProfile,
  ReviewRecord,
  SystemConfig,
  UserProfile,
} from '../types/domain';
import { redactBookingForRole, SERVICE_CATALOG } from '../utils/bookingRules';
import {
  BookingStatusText,
  formatInr,
  HelperVerificationText,
} from './StatusIndicator';

interface HelperWorkspaceProps {
  currentUser: UserProfile;
  isSandboxMode: boolean;
  helpers: HelperProfile[];
  availabilities: HelperAvailability[];
  bookings: BookingRecord[];
  reviews: ReviewRecord[];
  systemConfig: SystemConfig;
  onSelectBooking: (booking: BookingRecord) => void;
  onTransitionStatus: (
    booking: BookingRecord,
    toStatus: BookingStatus,
    note: string
  ) => Promise<void>;
  onUpdateHelperProfile: (updated: HelperProfile) => Promise<void>;
  onUpdateAvailability: (updated: HelperAvailability) => Promise<void>;
}

const ALL_DAYS: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun')[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

export const HelperWorkspace: React.FC<HelperWorkspaceProps> = ({
  currentUser,
  isSandboxMode,
  helpers,
  availabilities,
  bookings,
  reviews,
  systemConfig,
  onSelectBooking,
  onTransitionStatus,
  onUpdateHelperProfile,
  onUpdateAvailability,
}) => {
  const myHelper =
    helpers.find((h) => h.helperId === currentUser.uid) || helpers[0] || null;
  const myAvailability =
    availabilities.find((a) => a.helperId === myHelper?.helperId) ||
    availabilities[0] || {
      availabilityId: myHelper?.helperId || currentUser.uid,
      helperId: myHelper?.helperId || currentUser.uid,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as (
        | 'Mon'
        | 'Tue'
        | 'Wed'
        | 'Thu'
        | 'Fri'
        | 'Sat'
        | 'Sun'
      )[],
      startHour: '08:00',
      endHour: '19:00',
      updatedAt: new Date().toISOString(),
    };

  const [selectedHelperViewId, setSelectedHelperViewId] = useState<string>(
    myHelper?.helperId || 'helper_kavitha'
  );

  const activeHelper =
    helpers.find((h) => h.helperId === selectedHelperViewId) || myHelper;

  const [startHour, setStartHour] = useState(myAvailability.startHour);
  const [endHour, setEndHour] = useState(myAvailability.endHour);
  const [days, setDays] = useState(myAvailability.availableDays);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!activeHelper) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white border border-[#E7E2DA] rounded-xl p-8">
          <h1 className="text-2xl font-bold text-[#1C1917]">Helper Profile Not Found</h1>
          <p className="text-sm text-[#57534E] mt-2">
            Register as a Companion Helper to set up your verification profile and schedule.
          </p>
        </div>
      </div>
    );
  }

  const assignedBookings = bookings.filter(
    (b) => b.assignedHelperUid === activeHelper.helperId
  );

  const awaitingAcceptance = assignedBookings.filter((b) => b.status === 'assigned');
  const activeConfirmedJobs = assignedBookings.filter((b) =>
    ['accepted', 'arrived', 'in_progress'].includes(b.status)
  );
  const completedJobs = assignedBookings.filter((b) => b.status === 'completed');
  const helperReviews = reviews.filter((r) => r.helperId === activeHelper.helperId);

  const handleQuickStep = async (booking: BookingRecord, toStatus: BookingStatus, note: string) => {
    setErrorMsg(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await onTransitionStatus(booking, toStatus, note);
      setStatusMessage(
        `Updated booking ${booking.bookingRef} to "${toStatus.replace('_', ' ')}". Recorded in append-only event log.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transition failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun') => {
    if (days.includes(day)) {
      if (days.length > 1) {
        setDays(days.filter((d) => d !== day));
      }
    } else {
      setDays([...days, day]);
    }
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await onUpdateAvailability({
        availabilityId: activeHelper.helperId,
        helperId: activeHelper.helperId,
        availableDays: days,
        startHour,
        endHour,
        updatedAt: new Date().toISOString(),
      });
      setStatusMessage('Weekly availability schedule updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update availability.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async () => {
    setErrorMsg(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await onUpdateHelperProfile({
        ...activeHelper,
        isActive: !activeHelper.isActive,
        updatedAt: new Date().toISOString(),
      });
      setStatusMessage(
        `Availability status set to ${!activeHelper.isActive ? 'Active for Dispatch' : 'Paused'}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E2DA] pb-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#9A3412]">
            Companion Helper Portal · {systemConfig.city}
            {isSandboxMode ? ' · [DEVELOPMENT DEMO MODE]' : ''}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1C1917]">
            {activeHelper.fullName}
          </h1>
          <HelperVerificationText status={activeHelper.verificationStatus} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isSandboxMode && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="sandbox-helper-switcher"
                className="text-xs font-semibold text-[#57534E]"
              >
                Inspect Helper State:
              </label>
              <select
                id="sandbox-helper-switcher"
                value={activeHelper.helperId}
                onChange={(e) => setSelectedHelperViewId(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-xs font-semibold text-[#1C1917]"
              >
                {helpers.map((h) => (
                  <option key={h.helperId} value={h.helperId}>
                    {h.fullName} ({h.verificationStatus.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={handleToggleActive}
            className="px-4 py-2 bg-white border border-[#D6D0C4] rounded-lg text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] whitespace-nowrap"
          >
            Dispatch Status: {activeHelper.isActive ? 'Active (Click to Pause)' : 'Paused (Click to Activate)'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B] flex items-start gap-2"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-sm text-[#14532D] flex items-start gap-2"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Section 1: Pending Helper Acceptance Queue */}
      <section aria-labelledby="awaiting-acceptance-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="awaiting-acceptance-heading" className="text-xl font-bold text-[#1C1917]">
              New Assignments Awaiting Your Acceptance ({awaitingAcceptance.length})
            </h2>
            <p className="text-xs text-[#57534E]">
              An admin assignment is not confirmed until you review the senior&apos;s locality,
              schedule, and task notes and click Accept Assignment.
            </p>
          </div>
        </div>

        {awaitingAcceptance.length === 0 ? (
          <div className="p-6 bg-white border border-[#E7E2DA] rounded-xl text-sm text-[#57534E]">
            No pending assignments awaiting acceptance right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {awaitingAcceptance.map((rawJob) => {
              const job = redactBookingForRole(rawJob, activeHelper.helperId, 'helper');
              return (
              <div
                key={job.bookingId}
                className="bg-white border border-[#9A3412] rounded-xl p-6 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs font-bold text-[#9A3412] tabular-nums">
                      {job.bookingRef}
                    </div>
                    <h3 className="text-lg font-bold text-[#1C1917]">
                      {SERVICE_CATALOG[job.serviceType].title}
                    </h3>
                  </div>
                  <BookingStatusText status={job.status} />
                </div>

                <div className="text-sm text-[#57534E] space-y-1">
                  <div>
                    <strong className="text-[#1C1917]">Senior Citizen:</strong> {job.seniorName} (
                    {job.seniorPhone})
                  </div>
                  <div className="font-mono text-xs text-[#1C1917] tabular-nums">
                    <strong>Schedule:</strong> {job.date} at {job.startTime} ({job.durationHours}{' '}
                    hours) · Fee: {formatInr(job.totalPriceInr)}
                  </div>
                  <div>
                    <strong className="text-[#1C1917]">Pickup ({job.locality}):</strong>{' '}
                    {job.pickupAddress}
                  </div>
                  {job.destination && (
                    <div>
                      <strong className="text-[#1C1917]">Destination:</strong> {job.destination}
                    </div>
                  )}
                  {job.taskNotes && (
                    <div>
                      <strong className="text-[#1C1917]">Task Notes:</strong> {job.taskNotes}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#E7E2DA]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      handleQuickStep(
                        job,
                        'accepted',
                        `Helper ${activeHelper.fullName} accepted the assignment and confirmed schedule.`
                      )
                    }
                    className="px-4 py-2 bg-[#14532D] text-white text-xs font-semibold rounded-lg hover:bg-[#166534] whitespace-nowrap"
                  >
                    Accept & Confirm Assignment
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectBooking(job)}
                    className="px-3.5 py-2 bg-[#FAF8F5] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold rounded-lg hover:bg-[#F3EFEA] whitespace-nowrap"
                  >
                    Inspect Full Timeline
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Confirmed & Active Visits */}
      <section aria-labelledby="active-jobs-heading" className="space-y-4">
        <h2 id="active-jobs-heading" className="text-xl font-bold text-[#1C1917]">
          Confirmed & In-Progress Visits ({activeConfirmedJobs.length})
        </h2>

        {activeConfirmedJobs.length === 0 ? (
          <div className="p-6 bg-white border border-[#E7E2DA] rounded-xl text-sm text-[#57534E]">
            No active confirmed visits at this moment. Accept an assigned job above to begin.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activeConfirmedJobs.map((job) => (
              <div
                key={job.bookingId}
                className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs font-bold text-[#9A3412] tabular-nums">
                      {job.bookingRef}
                    </div>
                    <h3 className="text-lg font-bold text-[#1C1917]">
                      {SERVICE_CATALOG[job.serviceType].title}
                    </h3>
                  </div>
                  <BookingStatusText status={job.status} />
                </div>

                <div className="text-sm text-[#57534E] space-y-1">
                  <div>
                    <strong className="text-[#1C1917]">Senior:</strong> {job.seniorName} ·{' '}
                    <span className="font-mono tabular-nums">{job.seniorPhone}</span>
                  </div>
                  <div className="font-mono text-xs text-[#1C1917] tabular-nums">
                    {job.date} at {job.startTime} ({job.durationHours}h) · {job.locality}
                  </div>
                  <div>{job.pickupAddress}</div>
                </div>

                {/* Step-by-step Helper Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#E7E2DA]">
                  {job.status === 'accepted' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleQuickStep(
                          job,
                          'arrived',
                          `Helper ${activeHelper.fullName} arrived at pickup address.`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12] whitespace-nowrap"
                    >
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Mark Arrived at Pickup</span>
                    </button>
                  )}

                  {job.status === 'arrived' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleQuickStep(
                          job,
                          'in_progress',
                          `Helper ${activeHelper.fullName} started accompaniment visit.`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12] whitespace-nowrap"
                    >
                      <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Start Companion Visit</span>
                    </button>
                  )}

                  {job.status === 'in_progress' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleQuickStep(
                          job,
                          'completed',
                          `Helper ${activeHelper.fullName} completed the accompaniment visit safely.`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#14532D] text-white text-xs font-semibold rounded-lg hover:bg-[#166534] whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Mark Visit Completed</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectBooking(job)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FAF8F5] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold rounded-lg hover:bg-[#F3EFEA] whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Details & Event Log</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Helper Verification Checklist & Weekly Schedule Configuration */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Verification Checklist Record (Read-Only for Helper, Enforced by Admin) */}
        <div className="lg:col-span-6 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-4">
          <div className="border-b border-[#E7E2DA] pb-3">
            <p className="text-xs font-semibold text-[#9A3412]">
              Admin-Managed Verification Audit (Read-Only for Helpers)
            </p>
            <h2 className="text-xl font-bold text-[#1C1917]">
              Mandatory 4-Point Verification Checklist
            </h2>
          </div>

          <p className="text-xs text-[#57534E]">
            Only an authorized SaathiCare administrator can mark verification complete after
            reviewing physical documents offline. Raw identity document numbers are never stored or
            exposed in client profiles.
          </p>

          <ul className="space-y-2.5 text-sm">
            {[
              {
                label: '1. Government Identity Document Reviewed Offline',
                done: activeHelper.idCheckReviewed,
              },
              {
                label: '2. Police / Background Verification Certificate Reviewed',
                done: activeHelper.backgroundCheckReviewed,
              },
              {
                label: '3. Two Neighbourhood / Former Employer References Verified',
                done: activeHelper.referenceCheckReviewed,
              },
              {
                label: '4. Non-Medical Senior Etiquette & Boundaries Orientation Completed',
                done: activeHelper.trainingCompleted,
              },
            ].map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg"
              >
                <span className="font-medium text-[#1C1917]">{item.label}</span>
                {item.done ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#14532D]">
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    Reviewed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#92400E]">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    Pending
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="text-xs text-[#57534E] pt-2">
            <strong>Coordinator Audit Note:</strong>{' '}
            {activeHelper.verificationNotes || 'Awaiting coordinator review.'}
          </div>
        </div>

        {/* Helper Availability & Completed History */}
        <div className="lg:col-span-6 bg-white border border-[#E7E2DA] rounded-xl p-7 flex flex-col justify-between space-y-6">
          <form onSubmit={handleSaveAvailability} className="space-y-4">
            <div className="border-b border-[#E7E2DA] pb-3">
              <p className="text-xs font-semibold text-[#9A3412]">Schedule & Service Areas</p>
              <h2 className="text-xl font-bold text-[#1C1917]">
                Weekly Availability & Localities
              </h2>
            </div>

            <div className="text-xs text-[#57534E]">
              <strong>Enrolled Bengaluru Localities:</strong>{' '}
              {activeHelper.serviceAreas.join(' · ')}
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#1C1917] mb-2">
                Available Days of the Week
              </span>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((day) => {
                  const selected = days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        selected
                          ? 'bg-[#1C1917] text-white border-[#1C1917]'
                          : 'bg-[#FAF8F5] text-[#57534E] border-[#D6D0C4]'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="avail-start"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Shift Start Hour
                </label>
                <input
                  id="avail-start"
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="avail-end"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Shift End Hour
                </label>
                <input
                  id="avail-end"
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12]"
            >
              Save Weekly Availability
            </button>
          </form>

          {/* Completed Visits & Authentic Reviews */}
          <div className="pt-4 border-t border-[#E7E2DA] space-y-2">
            <div className="flex items-center justify-between text-xs text-[#57534E]">
              <span className="font-bold text-[#1C1917]">
                Completed Visits: {completedJobs.length}
              </span>
              <span>Verified Reviews: {helperReviews.length}</span>
            </div>
            {helperReviews.map((r) => (
              <div
                key={r.reviewId}
                className="p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-xs"
              >
                <div className="font-semibold text-[#14532D]">
                  {r.rating}/5 Stars · {r.authorName} ({r.bookingId})
                </div>
                <p className="text-[#1C1917] mt-0.5">{r.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

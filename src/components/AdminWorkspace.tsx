import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Lock,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Database,
} from 'lucide-react';
import type {
  BookingRecord,
  HelperProfile,
  HelperVerificationStatus,
  IncidentRecord,
  IncidentStatus,
  SystemConfig,
  UserProfile,
} from '../types/domain';
import {
  checkHelperScheduleConflict,
  SERVICE_CATALOG,
} from '../utils/bookingRules';
import {
  BookingStatusText,
  formatInr,
  HelperVerificationText,
} from './StatusIndicator';

interface AdminWorkspaceProps {
  currentUser: UserProfile | null;
  isSandboxMode: boolean;
  bookings: BookingRecord[];
  helpers: HelperProfile[];
  incidents: IncidentRecord[];
  systemConfig: SystemConfig;
  onSelectBooking: (booking: BookingRecord) => void;
  onAssignHelperToBooking: (
    booking: BookingRecord,
    helper: HelperProfile
  ) => Promise<void>;
  onVerifyHelper: (
    helper: HelperProfile,
    updates: {
      verificationStatus: HelperVerificationStatus;
      idCheckReviewed: boolean;
      backgroundCheckReviewed: boolean;
      referenceCheckReviewed: boolean;
      trainingCompleted: boolean;
      verificationNotes: string;
    }
  ) => Promise<void>;
  onUpdateSystemConfig: (updated: SystemConfig) => Promise<void>;
  onUpdateIncident: (
    incident: IncidentRecord,
    status: IncidentStatus,
    resolutionNote: string
  ) => Promise<void>;
  onSignInGoogle: () => void;
  onReturnHome: () => void;
}

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  currentUser,
  isSandboxMode,
  bookings,
  helpers,
  incidents,
  systemConfig,
  onSelectBooking,
  onAssignHelperToBooking,
  onVerifyHelper,
  onUpdateSystemConfig,
  onUpdateIncident,
  onSignInGoogle,
  onReturnHome,
}) => {
  const [adminSubTab, setAdminSubTab] = useState<
    'dispatch' | 'verification' | 'pricing_areas' | 'incidents'
  >('dispatch');

  const [selectedHelperByBooking, setSelectedHelperByBooking] = useState<
    Record<string, string>
  >({});

  // Pricing & service area state
  const [supportPhone, setSupportPhone] = useState(systemConfig.supportPhone);
  const [supportEmail, setSupportEmail] = useState(systemConfig.supportEmail);
  const [rate2h, setRate2h] = useState(systemConfig.rate2HoursInr);
  const [rate4h, setRate4h] = useState(systemConfig.rate4HoursInr);
  const [rate8h, setRate8h] = useState(systemConfig.rate8HoursInr);
  const [hospFee, setHospFee] = useState(systemConfig.hospitalSurchargeInr);
  const [errandsFee, setErrandsFee] = useState(systemConfig.errandsSurchargeInr);
  const [areasList, setAreasList] = useState<string[]>(systemConfig.serviceAreas);
  const [newLocalityInput, setNewLocalityInput] = useState('');

  const [busy, setBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Strict server/role gate: Non-admins cannot access Admin Workspace
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div
          role="alert"
          className="bg-white border border-[#E7E2DA] rounded-xl p-8 space-y-4"
        >
          <div className="flex items-center gap-2.5 text-[#991B1B]">
            <Lock className="w-6 h-6 shrink-0" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-[#1C1917]">
              Coordinator Administrator Access Required
            </h1>
          </div>
          <p className="text-sm text-[#57534E] leading-relaxed">
            Your current role is{' '}
            <strong className="text-[#1C1917]">
              {currentUser ? currentUser.role.replace('_', ' ') : 'Unauthenticated Guest'}
            </strong>
            . For security, SaathiCare never allows users to grant themselves administrator access
            or use a public admin setup route.
          </p>
          <div className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-xs text-[#57534E] space-y-1">
            <div className="font-semibold text-[#1C1917]">
              How Administrator Access is Bootstrapped:
            </div>
            <p>
              The initial administrator is verified against the server-configured{' '}
              <code>SAATHICARE_BOOTSTRAPPED_ADMIN_EMAILS</code> environment variable and enforced in{' '}
              <code>firestore.rules</code> via verified email token and <code>/admins/&#123;uid&#125;</code>.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap gap-3">
            {!currentUser ? (
              <button
                type="button"
                onClick={onSignInGoogle}
                className="px-4 py-2.5 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12]"
              >
                Sign In with Google Account
              </button>
            ) : (
              <button
                type="button"
                onClick={onReturnHome}
                className="px-4 py-2.5 bg-[#1C1917] text-white text-xs font-semibold rounded-lg hover:bg-[#292524]"
              >
                Return to My Authorized Workspace
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pendingBookings = bookings.filter((b) =>
    ['pending_assignment', 'needs_attention'].includes(b.status)
  );
  const activeBookings = bookings.filter((b) =>
    ['assigned', 'accepted', 'arrived', 'in_progress'].includes(b.status)
  );
  const approvedHelpersCount = helpers.filter(
    (h) => h.verificationStatus === 'approved' && h.isActive
  ).length;
  const pendingHelpersCount = helpers.filter(
    (h) => h.verificationStatus === 'pending'
  ).length;
  const openIncidentsCount = incidents.filter((i) => i.status !== 'resolved').length;

  const handleAssignSubmit = async (booking: BookingRecord) => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    const chosenId = selectedHelperByBooking[booking.bookingId];
    const helper = helpers.find((h) => h.helperId === chosenId);
    if (!helper) {
      setErrorMsg('Please select an eligible approved helper from the list first.');
      return;
    }

    setBusy(true);
    try {
      await onAssignHelperToBooking(booking, helper);
      setFeedbackMsg(
        `Assigned ${helper.fullName} to booking ${booking.bookingRef}. Status is now "Assigned (Awaiting Helper Acceptance)".`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Assignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusy(true);
    try {
      await onUpdateSystemConfig({
        configId: 'bengaluru',
        city: 'Bengaluru',
        supportPhone: supportPhone.trim(),
        supportEmail: supportEmail.trim(),
        serviceAreas: areasList,
        rate2HoursInr: Number(rate2h),
        rate4HoursInr: Number(rate4h),
        rate8HoursInr: Number(rate8h),
        hospitalSurchargeInr: Number(hospFee),
        errandsSurchargeInr: Number(errandsFee),
        updatedByUid: currentUser.uid,
        updatedAt: new Date().toISOString(),
      });
      setFeedbackMsg(
        'Bengaluru service areas, transparent pricing rates, and persistent support helpline updated.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update configuration.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddLocality = () => {
    const trimmed = newLocalityInput.trim();
    if (!trimmed) return;
    if (areasList.includes(trimmed)) {
      setErrorMsg(`Locality "${trimmed}" is already in the active service areas list.`);
      return;
    }
    if (areasList.length >= 15) {
      setErrorMsg('Maximum 15 active localities supported per city configuration.');
      return;
    }
    setAreasList([...areasList, trimmed]);
    setNewLocalityInput('');
  };

  const handleRemoveLocality = (area: string) => {
    if (areasList.length <= 1) {
      setErrorMsg('At least one active Bengaluru locality must remain configured.');
      return;
    }
    setAreasList(areasList.filter((a) => a !== area));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E2DA] pb-6">
        <div>
          <p className="text-xs font-semibold text-[#9A3412]">
            Bengaluru Coordinator & Administrator Console
            {isSandboxMode ? ' · [DEVELOPMENT DEMO MODE]' : ''}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1C1917]">
            Dispatch, Verification & Service Governance
          </h1>
          <p className="text-sm text-[#57534E]">
            Signed in as authorized administrator: <span className="font-mono">{currentUser.email}</span>
          </p>
        </div>
      </div>

      {/* 4-Column Basic Metrics Strip (Tabular Numerals) */}
      <section aria-label="Coordinator Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-[#E7E2DA] rounded-xl p-5 space-y-1">
          <div className="text-xs font-semibold text-[#57534E]">
            Unassigned / Needs Attention Bookings
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#9A3412]">
            {pendingBookings.length}
          </div>
          <div className="text-xs text-[#57534E]">
            Awaiting manual helper assignment
          </div>
        </div>

        <div className="bg-white border border-[#E7E2DA] rounded-xl p-5 space-y-1">
          <div className="text-xs font-semibold text-[#57534E]">
            Active Dispatched Visits
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#1C1917]">
            {activeBookings.length}
          </div>
          <div className="text-xs text-[#57534E]">
            Assigned, Accepted, Arrived or In Progress
          </div>
        </div>

        <div className="bg-white border border-[#E7E2DA] rounded-xl p-5 space-y-1">
          <div className="text-xs font-semibold text-[#57534E]">
            Approved Active Helpers
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#14532D]">
            {approvedHelpersCount}
          </div>
          <div className="text-xs text-[#57534E]">
            {pendingHelpersCount} helper(s) pending verification review
          </div>
        </div>

        <div className="bg-white border border-[#E7E2DA] rounded-xl p-5 space-y-1">
          <div className="text-xs font-semibold text-[#57534E]">
            Open Support / Incident Reports
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#1C1917]">
            {openIncidentsCount}
          </div>
          <div className="text-xs text-[#57534E]">
            Restricted to reporter & admins
          </div>
        </div>
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B] flex items-start gap-2"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {feedbackMsg && (
        <div
          role="status"
          className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-sm text-[#14532D] flex items-start gap-2"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div
        role="tablist"
        aria-label="Admin Console Sections"
        className="flex flex-wrap items-center gap-2 border-b border-[#E7E2DA] pb-3"
      >
        {(
          [
            {
              id: 'dispatch',
              label: `1. Booking Assignment & Dispatch (${bookings.length})`,
            },
            {
              id: 'verification',
              label: `2. Helper Verification Queue (${helpers.length})`,
            },
            {
              id: 'pricing_areas',
              label: '3. Service Areas, Pricing & Helpline',
            },
            {
              id: 'incidents',
              label: `4. Incidents & Integration Status (${incidents.length})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={adminSubTab === tab.id}
            type="button"
            onClick={() => setAdminSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              adminSubTab === tab.id
                ? 'bg-[#1C1917] text-white'
                : 'bg-white border border-[#E7E2DA] text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Manual Helper Assignment & Booking Management */}
      {adminSubTab === 'dispatch' && (
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[#1C1917]">
              Manual Helper Assignment & Schedule Conflict Guard
            </h2>
            <p className="text-xs text-[#57534E]">
              Only helpers who are <strong>Approved (4/4 Checks)</strong>, <strong>Active</strong>,
              cover the booking&apos;s Bengaluru locality, and have <strong>zero overlapping bookings</strong>{' '}
              on that date/time window can be assigned. An assignment remains unconfirmed until the
              helper accepts it.
            </p>
          </div>

          <div className="space-y-4">
            {bookings.map((booking) => {
              const needsAssignment = ['pending_assignment', 'needs_attention', 'assigned'].includes(
                booking.status
              );

              // Evaluate all helpers for this booking
              const evaluatedHelpers = helpers.map((h) => {
                const isApproved =
                  h.verificationStatus === 'approved' &&
                  h.idCheckReviewed &&
                  h.backgroundCheckReviewed &&
                  h.referenceCheckReviewed &&
                  h.trainingCompleted;
                const coversArea = h.serviceAreas.includes(booking.locality);
                const offersService = h.servicesOffered.includes(booking.serviceType);
                const conflict = checkHelperScheduleConflict(
                  h.helperId,
                  booking.date,
                  booking.startTime,
                  booking.durationHours,
                  bookings,
                  booking.bookingId
                );

                const eligible =
                  isApproved && h.isActive && coversArea && offersService && !conflict.hasConflict;

                let reason = 'Eligible & Available';
                if (!isApproved) reason = `Ineligible (${h.verificationStatus})`;
                else if (!h.isActive) reason = 'Ineligible (Inactive)';
                else if (!coversArea) reason = `Does not cover ${booking.locality}`;
                else if (!offersService) reason = 'Service type not offered';
                else if (conflict.hasConflict)
                  reason = `Schedule conflict (${conflict.conflictingBookingRef})`;

                return { helper: h, eligible, reason };
              });

              const eligibleCount = evaluatedHelpers.filter((e) => e.eligible).length;

              return (
                <div
                  key={booking.bookingId}
                  className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-[#57534E]">
                        <span className="font-mono font-bold text-[#9A3412] tabular-nums">
                          {booking.bookingRef}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{SERVICE_CATALOG[booking.serviceType].title}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatInr(booking.totalPriceInr)}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-[#1C1917]">
                        Senior: {booking.seniorName} · {booking.locality}
                      </h3>
                      <div className="text-xs text-[#57534E] font-mono tabular-nums">
                        Date: {booking.date} at {booking.startTime} ({booking.durationHours}h) ·
                        Pickup: {booking.pickupAddress}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <BookingStatusText status={booking.status} />
                      <button
                        type="button"
                        onClick={() => onSelectBooking(booking)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFEA]"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Timeline & Audit</span>
                      </button>
                    </div>
                  </div>

                  {needsAssignment && (
                    <div className="pt-3 border-t border-[#E7E2DA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor={`assign-select-${booking.bookingId}`}
                          className="block text-xs font-semibold text-[#1C1917] mb-1"
                        >
                          Select Verified Companion ({eligibleCount} eligible for {booking.locality}{' '}
                          at {booking.startTime}):
                        </label>
                        <select
                          id={`assign-select-${booking.bookingId}`}
                          value={selectedHelperByBooking[booking.bookingId] || ''}
                          onChange={(e) =>
                            setSelectedHelperByBooking({
                              ...selectedHelperByBooking,
                              [booking.bookingId]: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs text-[#1C1917]"
                        >
                          <option value="">-- Choose Helper to Assign --</option>
                          {evaluatedHelpers.map(({ helper, eligible, reason }) => (
                            <option
                              key={helper.helperId}
                              value={helper.helperId}
                              disabled={!eligible}
                            >
                              {helper.fullName} — {reason} (Areas: {helper.serviceAreas.join(', ')})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="shrink-0 sm:pt-5">
                        {eligibleCount === 0 ? (
                          <span className="text-xs font-semibold text-[#92400E]">
                            No Eligible Helper Available — Remains Pending Assignment
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy || !selectedHelperByBooking[booking.bookingId]}
                            onClick={() => handleAssignSubmit(booking)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12] disabled:opacity-50 whitespace-nowrap"
                          >
                            <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Assign Helper (Requires Helper Acceptance)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tab 2: Helper Verification Queue */}
      {adminSubTab === 'verification' && (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-[#1C1917]">
              Helper Verification Queue & Eligibility Audit
            </h2>
            <p className="text-xs text-[#57534E]">
              Server and Firestore rules prohibit marking a helper as <strong>Approved</strong>{' '}
              unless all 4 verification checks are reviewed and checked. Never use fabricated badges.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {helpers.map((helper) => (
              <HelperVerificationCard
                key={helper.helperId}
                helper={helper}
                busy={busy}
                onSave={async (updates) => {
                  setErrorMsg(null);
                  setFeedbackMsg(null);
                  setBusy(true);
                  try {
                    await onVerifyHelper(helper, updates);
                    setFeedbackMsg(
                      `Updated verification record for ${helper.fullName} to "${updates.verificationStatus}".`
                    );
                  } catch (err) {
                    setErrorMsg(
                      err instanceof Error ? err.message : 'Verification update rejected.'
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tab 3: Service Areas, Pricing & Persistent Support Contact Configuration */}
      {adminSubTab === 'pricing_areas' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSaveConfig}
            className="lg:col-span-7 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-5"
          >
            <div className="border-b border-[#E7E2DA] pb-3">
              <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#9A3412]" aria-hidden="true" />
                <span>Transparent Price & Support Helpline Configuration</span>
              </h2>
              <p className="text-xs text-[#57534E] mt-1">
                Changes saved here persist to <code>/systemConfig/bengaluru</code> and update live
                pricing calculations and the persistent support header bar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-support-phone"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Persistent Support Helpline Phone
                </label>
                <input
                  id="cfg-support-phone"
                  type="text"
                  required
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-support-email"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Support Desk Email
                </label>
                <input
                  id="cfg-support-email"
                  type="email"
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#E7E2DA]">
              <div>
                <label
                  htmlFor="cfg-rate-2h"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  2 Hours Base Fee (INR)
                </label>
                <input
                  id="cfg-rate-2h"
                  type="number"
                  min={100}
                  max={5000}
                  value={rate2h}
                  onChange={(e) => setRate2h(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-rate-4h"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  4 Hours Base Fee (INR)
                </label>
                <input
                  id="cfg-rate-4h"
                  type="number"
                  min={200}
                  max={10000}
                  value={rate4h}
                  onChange={(e) => setRate4h(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-rate-8h"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Full Day · 8h Fee (INR)
                </label>
                <input
                  id="cfg-rate-8h"
                  type="number"
                  min={400}
                  max={20000}
                  value={rate8h}
                  onChange={(e) => setRate8h(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-hosp-surcharge"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Hospital / Clinic Accompaniment Surcharge (INR)
                </label>
                <input
                  id="cfg-hosp-surcharge"
                  type="number"
                  min={0}
                  max={2000}
                  value={hospFee}
                  onChange={(e) => setHospFee(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-errands-surcharge"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Shopping & Errands Surcharge (INR)
                </label>
                <input
                  id="cfg-errands-surcharge"
                  type="number"
                  min={0}
                  max={2000}
                  value={errandsFee}
                  onChange={(e) => setErrandsFee(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12]"
            >
              Save Pricing, Service Areas & Support Helpline
            </button>
          </form>

          {/* Service Area Manager */}
          <div className="lg:col-span-5 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-4">
            <h2 className="text-xl font-bold text-[#1C1917]">
              Configurable Bengaluru Service Areas ({areasList.length}/15)
            </h2>
            <p className="text-xs text-[#57534E]">
              Bookings outside these configured localities are automatically rejected by the booking
              validator.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="New Bengaluru locality name"
                value={newLocalityInput}
                onChange={(e) => setNewLocalityInput(e.target.value)}
                placeholder="e.g. Basavanagudi"
                className="flex-1 px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={handleAddLocality}
                className="px-4 py-2 bg-[#1C1917] text-white text-xs font-semibold rounded-lg whitespace-nowrap"
              >
                Add Locality
              </button>
            </div>

            <ul className="divide-y divide-[#E7E2DA] border border-[#E7E2DA] rounded-lg">
              {areasList.map((area) => (
                <li
                  key={area}
                  className="flex items-center justify-between px-3.5 py-2 text-sm text-[#1C1917]"
                >
                  <span>{area}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveLocality(area)}
                    className="text-xs text-[#991B1B] font-semibold hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Tab 4: Incidents & External Integration Boundaries */}
      {adminSubTab === 'incidents' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-xl font-bold text-[#1C1917]">
              Support & Incident Resolution Queue ({incidents.length})
            </h2>
            {incidents.length === 0 ? (
              <div className="p-6 bg-white border border-[#E7E2DA] rounded-xl text-sm text-[#57534E]">
                No incident reports filed.
              </div>
            ) : (
              incidents.map((inc) => (
                <IncidentResolutionCard
                  key={inc.incidentId}
                  incident={inc}
                  busy={busy}
                  onResolve={async (nextStatus, note) => {
                    setBusy(true);
                    setErrorMsg(null);
                    try {
                      await onUpdateIncident(inc, nextStatus, note);
                      setFeedbackMsg(`Updated incident ${inc.incidentId} to "${nextStatus}".`);
                    } catch (err) {
                      setErrorMsg(err instanceof Error ? err.message : 'Incident update failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ))
            )}
          </div>

          {/* Safe Integration Boundary Status */}
          <div className="lg:col-span-5 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-4 h-fit">
            <h2 className="text-xl font-bold text-[#1C1917]">
              Integration & Notification Configuration
            </h2>
            <p className="text-xs text-[#57534E]">
              Real-time Cloud Firestore event notifications, direct Email/SMS dispatch links, and
              consent-gated W3C Browser Geolocation check-ins are active across all booking drawers.
            </p>
            <ul className="space-y-2.5 text-xs">
              <li className="p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg flex justify-between">
                <span className="font-semibold text-[#1C1917]">Cloud Firestore & Auth</span>
                <span className="text-[#14532D] font-semibold">Configured & Active</span>
              </li>
              <li className="p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg flex justify-between">
                <span className="font-semibold text-[#1C1917]">Email & SMS Notification Service</span>
                <span className="text-[#14532D] font-semibold">
                  Configured (Firestore Push + Direct Email/SMS)
                </span>
              </li>
              <li className="p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg flex justify-between">
                <span className="font-semibold text-[#1C1917]">Live GPS & Visit Check-Ins</span>
                <span className="text-[#14532D] font-semibold">
                  Configured (Browser Geolocation API + Audit Log)
                </span>
              </li>
              <li className="p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg flex justify-between">
                <span className="font-semibold text-[#1C1917]">Payment Collection Mode</span>
                <span className="text-[#14532D] font-semibold">
                  Configured (Online UPI + Pay-After-Visit Settlement)
                </span>
              </li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

const HelperVerificationCard: React.FC<{
  helper: HelperProfile;
  busy: boolean;
  onSave: (updates: {
    verificationStatus: HelperVerificationStatus;
    idCheckReviewed: boolean;
    backgroundCheckReviewed: boolean;
    referenceCheckReviewed: boolean;
    trainingCompleted: boolean;
    verificationNotes: string;
  }) => Promise<void>;
}> = ({ helper, busy, onSave }) => {
  const [idCheck, setIdCheck] = useState(helper.idCheckReviewed);
  const [bgCheck, setBgCheck] = useState(helper.backgroundCheckReviewed);
  const [refCheck, setRefCheck] = useState(helper.referenceCheckReviewed);
  const [training, setTraining] = useState(helper.trainingCompleted);
  const [status, setStatus] = useState<HelperVerificationStatus>(helper.verificationStatus);
  const [notes, setNotes] = useState(helper.verificationNotes);

  return (
    <div className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-[#E7E2DA] pb-3">
        <div>
          <h3 className="text-lg font-bold text-[#1C1917]">{helper.fullName}</h3>
          <div className="text-xs text-[#57534E]">
            {helper.phone} · {helper.yearsExperience} yrs experience · Areas:{' '}
            {helper.serviceAreas.join(', ')}
          </div>
        </div>
        <HelperVerificationText status={helper.verificationStatus} />
      </div>

      <p className="text-xs text-[#57534E]">{helper.bio}</p>

      <div className="space-y-2 text-xs">
        <div className="font-semibold text-[#1C1917]">
          Required Offline Verification Checks:
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={idCheck}
            onChange={(e) => setIdCheck(e.target.checked)}
            className="w-4 h-4 accent-[#9A3412]"
          />
          <span>1. Government Identity Reviewed Offline (No ID numbers stored online)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={bgCheck}
            onChange={(e) => setBgCheck(e.target.checked)}
            className="w-4 h-4 accent-[#9A3412]"
          />
          <span>2. Police / Background Verification Reviewed</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={refCheck}
            onChange={(e) => setRefCheck(e.target.checked)}
            className="w-4 h-4 accent-[#9A3412]"
          />
          <span>3. Two Local References Contacted & Verified</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={training}
            onChange={(e) => setTraining(e.target.checked)}
            className="w-4 h-4 accent-[#9A3412]"
          />
          <span>4. Non-Medical Senior Etiquette & Boundaries Training Completed</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <div>
          <label
            htmlFor={`verify-status-${helper.helperId}`}
            className="block text-xs font-semibold text-[#1C1917] mb-1"
          >
            Verification Status Decision
          </label>
          <select
            id={`verify-status-${helper.helperId}`}
            value={status}
            onChange={(e) => setStatus(e.target.value as HelperVerificationStatus)}
            className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-semibold"
          >
            <option value="pending">Pending Review</option>
            <option value="approved">Approved (Requires All 4 Checks)</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`verify-notes-${helper.helperId}`}
            className="block text-xs font-semibold text-[#1C1917] mb-1"
          >
            Audit Note
          </label>
          <input
            id={`verify-notes-${helper.helperId}`}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
          />
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            verificationStatus: status,
            idCheckReviewed: idCheck,
            backgroundCheckReviewed: bgCheck,
            referenceCheckReviewed: refCheck,
            trainingCompleted: training,
            verificationNotes: notes,
          })
        }
        className="px-4 py-2 bg-[#1C1917] text-white text-xs font-semibold rounded-lg hover:bg-[#292524]"
      >
        Save Helper Verification Decision
      </button>
    </div>
  );
};

const IncidentResolutionCard: React.FC<{
  incident: IncidentRecord;
  busy: boolean;
  onResolve: (status: IncidentStatus, note: string) => Promise<void>;
}> = ({ incident, busy, onResolve }) => {
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [note, setNote] = useState(incident.adminResolutionNote);

  return (
    <div className="bg-white border border-[#E7E2DA] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between text-xs text-[#57534E]">
        <span className="font-semibold text-[#1C1917]">
          {incident.category.replace('_', ' ')} · Severity: {incident.severity} · Reported by{' '}
          {incident.reporterName} ({incident.reporterRole})
        </span>
        <span className="font-mono tabular-nums">Booking: {incident.bookingId}</span>
      </div>
      <p className="text-sm text-[#1C1917]">{incident.description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <select
          aria-label={`Status for incident ${incident.incidentId}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentStatus)}
          className="px-3 py-1.5 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-semibold"
        >
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
        <input
          type="text"
          aria-label={`Resolution note for incident ${incident.incidentId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Coordinator resolution note..."
          className="sm:col-span-2 px-3 py-1.5 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
        />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onResolve(status, note)}
        className="px-3.5 py-1.5 bg-[#9A3412] text-white text-xs font-semibold rounded-lg"
      >
        Update Incident Record
      </button>
    </div>
  );
};

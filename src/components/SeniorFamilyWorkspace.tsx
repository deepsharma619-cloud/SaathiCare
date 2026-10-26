import React, { useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  ShieldCheck,
  UserPlus,
  XCircle,
  Search,
  Eye,
  AlertCircle,
} from 'lucide-react';
import type {
  BookingRecord,
  FamilyLink,
  FamilyLinkStatus,
  ReviewRecord,
  SeniorProfile,
  SystemConfig,
  UserProfile,
} from '../types/domain';
import { SERVICE_CATALOG } from '../utils/bookingRules';
import {
  BookingStatusText,
  FamilyLinkStatusText,
  formatInr,
} from './StatusIndicator';

interface SeniorFamilyWorkspaceProps {
  currentUser: UserProfile;
  isSandboxMode: boolean;
  seniors: SeniorProfile[];
  familyLinks: FamilyLink[];
  bookings: BookingRecord[];
  reviews: ReviewRecord[];
  systemConfig: SystemConfig;
  onOpenNewBooking: () => void;
  onSelectBooking: (booking: BookingRecord) => void;
  onRequestFamilyLink: (payload: {
    seniorId: string;
    seniorName: string;
    relationship: string;
    consentNote: string;
  }) => Promise<void>;
  onUpdateFamilyLinkStatus: (
    link: FamilyLink,
    nextStatus: FamilyLinkStatus,
    note: string
  ) => Promise<void>;
  onCreateSeniorProfile: (
    profile: Omit<SeniorProfile, 'createdAt' | 'updatedAt'>
  ) => Promise<SeniorProfile>;
  onUpdateSeniorProfile: (updated: SeniorProfile) => Promise<void>;
}

export const SeniorFamilyWorkspace: React.FC<SeniorFamilyWorkspaceProps> = ({
  currentUser,
  isSandboxMode,
  seniors,
  familyLinks,
  bookings,
  reviews,
  systemConfig,
  onOpenNewBooking,
  onSelectBooking,
  onRequestFamilyLink,
  onUpdateFamilyLinkStatus,
  onCreateSeniorProfile,
  onUpdateSeniorProfile,
}) => {
  const [bookingFilter, setBookingFilter] = useState<
    'all' | 'active' | 'completed' | 'cancelled'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Family link request state (for Family Member role)
  const [targetSeniorId, setTargetSeniorId] = useState('senior_lakshmi');
  const [targetSeniorName, setTargetSeniorName] = useState('Lakshmi Narasimhan');
  const [relationship, setRelationship] = useState('Daughter / Son');
  const [consentRequestNote, setConsentRequestNote] = useState(
    'Requesting authorization to schedule outpatient clinic and grocery visits.'
  );

  // Senior profile edit state (for Senior role)
  const mySeniorProfile =
    seniors.find((s) => s.seniorId === currentUser.uid) || seniors[0] || null;

  const [editingProfile, setEditingProfile] = useState(false);
  const [editAddress, setEditAddress] = useState(mySeniorProfile?.address || '');
  const [editLocality, setEditLocality] = useState(
    mySeniorProfile?.locality || systemConfig.serviceAreas[0]
  );
  const [editMobility, setEditMobility] = useState(mySeniorProfile?.mobilityNote || '');
  const [editAllowFamily, setEditAllowFamily] = useState(
    mySeniorProfile?.allowFamilyBookings ?? true
  );

  // Create Senior Profile state when mySeniorProfile is null
  const [newFullName, setNewFullName] = useState(currentUser.fullName || '');
  const [newAge, setNewAge] = useState(70);
  const [newPhone, setNewPhone] = useState(
    currentUser.phone && currentUser.phone.length >= 10 ? currentUser.phone : '+91-98450-11223'
  );
  const [newLocality, setNewLocality] = useState(systemConfig.serviceAreas[0] || 'Indiranagar');
  const [newAddress, setNewAddress] = useState('');
  const [newMobility, setNewMobility] = useState('Prefers unhurried accompaniment');
  const [newEmergencyName, setNewEmergencyName] = useState('');
  const [newEmergencyPhone, setNewEmergencyPhone] = useState('+91-98450-44556');

  const [busy, setBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const relevantBookings = bookings.filter((b) => {
    if (currentUser.role === 'senior') {
      return b.seniorId === currentUser.uid;
    }
    if (currentUser.role === 'family_member') {
      const hasLink = familyLinks.some(
        (l) => l.seniorId === b.seniorId && l.familyUid === currentUser.uid
      );
      return b.bookedByUid === currentUser.uid || hasLink;
    }
    return true;
  });

  const filteredBookings = relevantBookings.filter((b) => {
    if (bookingFilter === 'active') {
      if (['completed', 'cancelled'].includes(b.status)) return false;
    } else if (bookingFilter === 'completed') {
      if (b.status !== 'completed') return false;
    } else if (bookingFilter === 'cancelled') {
      if (!['cancelled', 'needs_attention'].includes(b.status)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        b.bookingRef.toLowerCase().includes(q) ||
        b.seniorName.toLowerCase().includes(q) ||
        b.destination.toLowerCase().includes(q) ||
        b.locality.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const relevantLinks = familyLinks.filter((l) =>
    currentUser.role === 'senior'
      ? l.seniorId === currentUser.uid
      : currentUser.role === 'family_member'
      ? l.familyUid === currentUser.uid
      : true
  );

  const handleRequestLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusy(true);
    try {
      await onRequestFamilyLink({
        seniorId: targetSeniorId.trim(),
        seniorName: targetSeniorName.trim(),
        relationship: relationship.trim(),
        consentNote: consentRequestNote.trim(),
      });
      setFeedbackMsg(
        `Consent request sent to ${targetSeniorName}. You can book once the senior approves your request.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send consent request.');
    } finally {
      setBusy(false);
    }
  };

  const handleConsentAction = async (
    link: FamilyLink,
    nextStatus: FamilyLinkStatus,
    note: string
  ) => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusy(true);
    try {
      await onUpdateFamilyLinkStatus(link, nextStatus, note);
      setFeedbackMsg(
        nextStatus === 'active'
          ? `Granted active booking consent to ${link.familyName}.`
          : `Revoked family booking access for ${link.familyName}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Consent update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSeniorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mySeniorProfile) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    setBusy(true);
    try {
      await onUpdateSeniorProfile({
        ...mySeniorProfile,
        locality: editLocality,
        address: editAddress.trim(),
        mobilityNote: editMobility.trim(),
        allowFamilyBookings: editAllowFamily,
        updatedAt: new Date().toISOString(),
      });
      setEditingProfile(false);
      setFeedbackMsg('Senior Citizen profile and family booking preferences saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSeniorProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);
    if (newFullName.trim().length < 2) {
      setErrorMsg('Please enter your full name (minimum 2 characters).');
      return;
    }
    if (newAddress.trim().length < 5) {
      setErrorMsg('Please enter your complete pickup street address in Bengaluru.');
      return;
    }
    if (newEmergencyName.trim().length < 2) {
      setErrorMsg('Please enter an emergency contact name.');
      return;
    }
    setBusy(true);
    try {
      await onCreateSeniorProfile({
        seniorId: currentUser.uid,
        fullName: newFullName.trim(),
        age: Math.min(115, Math.max(55, Number(newAge) || 70)),
        phone: newPhone.trim(),
        locality: newLocality,
        address: newAddress.trim(),
        preferredLanguages: ['Kannada', 'English'],
        mobilityNote: newMobility.trim() || 'Prefers unhurried accompaniment',
        emergencyContactName: newEmergencyName.trim(),
        emergencyContactPhone: newEmergencyPhone.trim(),
        allowFamilyBookings: true,
      });
      setFeedbackMsg('Senior Citizen profile created! You can now schedule companion bookings.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create Senior Citizen profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E2DA] pb-6">
        <div>
          <p className="text-xs font-semibold text-[#9A3412]">
            {currentUser.role === 'family_member'
              ? 'Authorized Family Member Workspace · Bengaluru'
              : 'Senior Citizen Companion Workspace · Bengaluru'}
            {isSandboxMode ? ' · [DEVELOPMENT DEMO MODE]' : ''}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1C1917]">
            Namaskara, {currentUser.fullName}
          </h1>
          <p className="text-sm text-[#57534E]">
            {currentUser.role === 'family_member'
              ? 'Manage explicit senior consent authorizations and schedule non-medical companion visits on behalf of your loved ones.'
              : 'Schedule non-medical companion visits, track helper arrival, and control which family members are authorized to book for you.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenNewBooking}
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap shrink-0"
        >
          <CalendarPlus className="w-4 h-4" aria-hidden="true" />
          <span>Schedule New Companion Visit</span>
        </button>
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

      {feedbackMsg && (
        <div
          role="status"
          className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-sm text-[#14532D] flex items-start gap-2"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Bookings Section */}
      <section aria-labelledby="bookings-list-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 id="bookings-list-heading" className="text-xl font-bold text-[#1C1917]">
            Companion Bookings ({filteredBookings.length})
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search input */}
            <div className="relative">
              <Search
                className="w-4 h-4 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search bookings by reference or destination"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ref or destination..."
                className="pl-9 pr-3 py-1.5 bg-white border border-[#D6D0C4] rounded-lg text-xs text-[#1C1917]"
              />
            </div>

            {/* Interactive Segmented Filter Controls */}
            <div
              role="group"
              aria-label="Filter bookings by status"
              className="flex items-center gap-1 p-1 bg-[#F3EFEA] border border-[#E7E2DA] rounded-lg"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Active' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'cancelled', label: 'Cancelled / Attention' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBookingFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    bookingFilter === tab.id
                      ? 'bg-white text-[#1C1917]'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="bg-white border border-[#E7E2DA] rounded-xl p-8 text-center space-y-3">
            <h3 className="text-base font-bold text-[#1C1917]">
              No bookings match your current filter
            </h3>
            <p className="text-sm text-[#57534E] max-w-md mx-auto">
              Schedule a hospital accompaniment, shopping errand, or companionship visit in
              Bengaluru.
            </p>
            <button
              type="button"
              onClick={onOpenNewBooking}
              className="px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12]"
            >
              Create First Booking
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#E7E2DA] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E2DA] bg-[#FAF8F5] text-xs font-semibold text-[#57534E]">
                    <th className="py-3.5 px-4">Reference & Service</th>
                    <th className="py-3.5 px-4">Senior & Locality</th>
                    <th className="py-3.5 px-4">Schedule</th>
                    <th className="py-3.5 px-4">Workflow Status</th>
                    <th className="py-3.5 px-4">Assigned Companion</th>
                    <th className="py-3.5 px-4 text-right">Fee</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E2DA] text-sm">
                  {filteredBookings.map((booking) => (
                    <tr
                      key={booking.bookingId}
                      className="hover:bg-[#FAF8F5] transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-xs text-[#9A3412] tabular-nums">
                          {booking.bookingRef}
                        </div>
                        <div className="font-semibold text-[#1C1917]">
                          {SERVICE_CATALOG[booking.serviceType].shortLabel}
                        </div>
                        {booking.destination && (
                          <div className="text-xs text-[#57534E] truncate max-w-xs">
                            To: {booking.destination}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#1C1917]">{booking.seniorName}</div>
                        <div className="text-xs text-[#57534E]">
                          {booking.locality} · Booked by {booking.bookedByName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-[#1C1917] tabular-nums whitespace-nowrap">
                        <div>{booking.date}</div>
                        <div className="text-[#57534E]">
                          {booking.startTime} · {booking.durationHours}h
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <BookingStatusText status={booking.status} />
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {booking.assignedHelperUid ? (
                          <div>
                            <div className="font-semibold text-[#1C1917]">
                              {booking.assignedHelperName}
                            </div>
                            <div className="text-[#57534E]">
                              {booking.status === 'assigned'
                                ? 'Awaiting helper acceptance'
                                : 'Confirmed by helper'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#78716C]">Pending coordinator assignment</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#1C1917] tabular-nums whitespace-nowrap">
                        {formatInr(booking.totalPriceInr)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectBooking(booking)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFEA] whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Details & Timeline</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Family Consent & Authorization Workflow + Senior Profile Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Family Access Consent & Revocation */}
        <div className="lg:col-span-7 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-5">
          <div className="border-b border-[#E7E2DA] pb-4">
            <p className="text-xs font-semibold text-[#9A3412]">
              Privacy & Explicit Consent Enforcement
            </p>
            <h2 className="text-xl font-bold text-[#1C1917]">
              Family Member Booking Authorization & Revocation
            </h2>
            <p className="text-xs text-[#57534E] mt-1">
              Family members can book on behalf of a senior citizen only when the link status is{' '}
              <strong>Active</strong>. Revoking consent immediately blocks future bookings and
              private profile access.
            </p>
          </div>

          <div className="space-y-3">
            {relevantLinks.length === 0 ? (
              <p className="text-sm text-[#57534E]">
                No family authorization links configured yet.
              </p>
            ) : (
              relevantLinks.map((link) => (
                <div
                  key={link.linkId}
                  className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-[#1C1917]">
                        {link.familyName} ({link.relationship})
                      </span>
                      <span className="text-xs text-[#57534E] ml-2">
                        for Senior: <strong>{link.seniorName}</strong>
                      </span>
                    </div>
                    <FamilyLinkStatusText status={link.status} />
                  </div>

                  <p className="text-xs text-[#57534E]">{link.consentNote}</p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* Senior or Admin can approve pending_consent -> active */}
                    {(currentUser.role === 'senior' || currentUser.role === 'admin') &&
                      link.status !== 'active' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleConsentAction(
                              link,
                              'active',
                              `Explicit consent approved by ${currentUser.fullName} on ${new Date().toLocaleDateString('en-IN')}.`
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14532D] text-white text-xs font-semibold rounded-lg hover:bg-[#166534] whitespace-nowrap"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Grant Explicit Consent</span>
                        </button>
                      )}

                    {/* Either Senior or Family Member can revoke access at any time */}
                    {link.status !== 'revoked' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleConsentAction(
                            link,
                            'revoked',
                            `Authorization revoked by ${currentUser.fullName} (${currentUser.role}).`
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#FECACA] text-[#991B1B] text-xs font-semibold rounded-lg hover:bg-[#FEF2F2] whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Revoke Family Access</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* If Family Member, allow requesting a new consent link */}
          {currentUser.role === 'family_member' && (
            <form
              onSubmit={handleRequestLinkSubmit}
              className="pt-4 border-t border-[#E7E2DA] space-y-3"
            >
              <h3 className="text-sm font-bold text-[#1C1917] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#9A3412]" aria-hidden="true" />
                <span>Request Authorization Link from a Senior Citizen</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="req-senior-id"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Senior Share ID
                  </label>
                  <input
                    id="req-senior-id"
                    type="text"
                    required
                    value={targetSeniorId}
                    onChange={(e) => setTargetSeniorId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="req-senior-name"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Senior Full Name
                  </label>
                  <input
                    id="req-senior-name"
                    type="text"
                    required
                    value={targetSeniorName}
                    onChange={(e) => setTargetSeniorName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="req-relationship"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Your Relationship
                  </label>
                  <input
                    id="req-relationship"
                    type="text"
                    required
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="req-consent-note"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Purpose Note for Senior Review
                </label>
                <input
                  id="req-consent-note"
                  type="text"
                  required
                  value={consentRequestNote}
                  onChange={(e) => setConsentRequestNote(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-[#1C1917] text-white text-xs font-semibold rounded-lg hover:bg-[#292524]"
              >
                Send Consent Request (Starts as Pending Consent)
              </button>
            </form>
          )}
        </div>

        {/* Right: Senior Profile & Preferences Card */}
        <div className="lg:col-span-5 bg-white border border-[#E7E2DA] rounded-xl p-7 flex flex-col justify-between space-y-5">
          {mySeniorProfile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E7E2DA] pb-3">
                <div>
                  <p className="text-xs font-semibold text-[#9A3412]">Senior Profile Record</p>
                  <h2 className="text-xl font-bold text-[#1C1917]">{mySeniorProfile.fullName}</h2>
                </div>
                {currentUser.role === 'senior' && (
                  <button
                    type="button"
                    onClick={() => setEditingProfile(!editingProfile)}
                    className="px-3 py-1.5 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-semibold text-[#1C1917]"
                  >
                    {editingProfile ? 'Cancel Edit' : 'Edit Profile'}
                  </button>
                )}
              </div>

              {!editingProfile ? (
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Senior Share ID:</span>
                    <span className="font-mono font-semibold text-[#1C1917]">
                      {mySeniorProfile.seniorId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Age & Locality:</span>
                    <span className="font-semibold text-[#1C1917]">
                      {mySeniorProfile.age} yrs · {mySeniorProfile.locality}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[#57534E] block">Pickup Address:</span>
                    <span className="text-[#1C1917] font-medium">{mySeniorProfile.address}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[#57534E] block">
                      Non-Medical Mobility / Pace Note:
                    </span>
                    <span className="text-[#1C1917]">{mySeniorProfile.mobilityNote}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[#57534E] block">Emergency Contact:</span>
                    <span className="text-[#1C1917] font-medium">
                      {mySeniorProfile.emergencyContactName} ({mySeniorProfile.emergencyContactPhone})
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#E7E2DA] flex items-center justify-between">
                    <span className="text-xs text-[#57534E]">Family Booking Permission:</span>
                    <span className="text-xs font-semibold text-[#14532D]">
                      {mySeniorProfile.allowFamilyBookings
                        ? 'Allowed for Active Consented Links'
                        : 'Disabled by Senior'}
                    </span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveSeniorProfile} className="space-y-3 text-sm">
                  <div>
                    <label
                      htmlFor="edit-senior-locality"
                      className="block text-xs font-semibold text-[#1C1917] mb-1"
                    >
                      Bengaluru Locality
                    </label>
                    <select
                      id="edit-senior-locality"
                      value={editLocality}
                      onChange={(e) => setEditLocality(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm"
                    >
                      {systemConfig.serviceAreas.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-senior-address"
                      className="block text-xs font-semibold text-[#1C1917] mb-1"
                    >
                      Pickup Address
                    </label>
                    <input
                      id="edit-senior-address"
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-senior-mobility"
                      className="block text-xs font-semibold text-[#1C1917] mb-1"
                    >
                      Non-Medical Walking / Pace Preference
                    </label>
                    <input
                      id="edit-senior-mobility"
                      type="text"
                      value={editMobility}
                      onChange={(e) => setEditMobility(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#1C1917] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAllowFamily}
                      onChange={(e) => setEditAllowFamily(e.target.checked)}
                      className="w-4 h-4 accent-[#9A3412]"
                    />
                    <span>Allow explicitly consented family members to book on my behalf</span>
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 bg-[#9A3412] text-white text-xs font-semibold rounded-lg"
                  >
                    Save Senior Profile
                  </button>
                </form>
              )}
            </div>
          ) : currentUser.role === 'family_member' ? (
            <div className="space-y-2 text-sm text-[#57534E]">
              <p className="text-xs font-semibold text-[#9A3412]">Linked Senior Profile</p>
              <p>
                No Senior Profile is linked with active consent yet. Send a consent request using
                the form on the left and ask the senior citizen to approve it.
              </p>
            </div>
          ) : (
            <form onSubmit={handleCreateSeniorProfileSubmit} className="space-y-3 text-sm">
              <div className="border-b border-[#E7E2DA] pb-2">
                <p className="text-xs font-semibold text-[#9A3412]">Complete Senior Profile</p>
                <h2 className="text-lg font-bold text-[#1C1917]">
                  Set Up Senior Citizen Profile for Booking
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="create-senior-name"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Senior Full Name
                  </label>
                  <input
                    id="create-senior-name"
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-senior-age"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Age (55–115 yrs)
                  </label>
                  <input
                    id="create-senior-age"
                    type="number"
                    min={55}
                    max={115}
                    required
                    value={newAge}
                    onChange={(e) => setNewAge(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="create-senior-phone"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Phone Number
                  </label>
                  <input
                    id="create-senior-phone"
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-senior-locality"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Bengaluru Locality
                  </label>
                  <select
                    id="create-senior-locality"
                    value={newLocality}
                    onChange={(e) => setNewLocality(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                  >
                    {systemConfig.serviceAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label
                  htmlFor="create-senior-address"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Pickup Street Address (Bengaluru)
                </label>
                <input
                  id="create-senior-address"
                  type="text"
                  required
                  placeholder="e.g., 42, 12th Main, HAL 2nd Stage, Indiranagar"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="create-senior-emergency-name"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Emergency Contact Name
                  </label>
                  <input
                    id="create-senior-emergency-name"
                    type="text"
                    required
                    placeholder="e.g., Ananya Rao"
                    value={newEmergencyName}
                    onChange={(e) => setNewEmergencyName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-senior-emergency-phone"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Emergency Contact Phone
                  </label>
                  <input
                    id="create-senior-emergency-phone"
                    type="tel"
                    required
                    value={newEmergencyPhone}
                    onChange={(e) => setNewEmergencyPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="create-senior-mobility"
                  className="block text-xs font-semibold text-[#1C1917] mb-1"
                >
                  Non-Medical Mobility / Pace Preference
                </label>
                <input
                  id="create-senior-mobility"
                  type="text"
                  value={newMobility}
                  onChange={(e) => setNewMobility(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full px-4 py-2.5 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12] disabled:opacity-50"
              >
                {busy ? 'Saving Profile...' : 'Save Senior Citizen Profile'}
              </button>
            </form>
          )}

          {/* Authentic Completed-Booking Reviews Summary */}
          <div className="pt-4 border-t border-[#E7E2DA] space-y-2">
            <h3 className="text-sm font-bold text-[#1C1917]">
              Verified Post-Visit Reviews ({reviews.length})
            </h3>
            {reviews.slice(0, 2).map((rev) => (
              <div
                key={rev.reviewId}
                className="p-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-xs space-y-1"
              >
                <div className="flex justify-between text-[#57534E]">
                  <span className="font-semibold text-[#1C1917]">
                    Rating: {rev.rating}/5 · {rev.authorName}
                  </span>
                  <span className="font-mono tabular-nums">{rev.bookingId}</span>
                </div>
                <p className="text-[#1C1917]">{rev.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type {
  BookingRecord,
  DurationHours,
  FamilyLink,
  HelperAvailability,
  HelperProfile,
  PaymentStatus,
  SeniorProfile,
  ServiceType,
  SystemConfig,
  UserProfile,
} from '../types/domain';
import {
  calculateBookingPrice,
  INITIAL_HELPER_AVAILABILITIES,
  INITIAL_VERIFIED_HELPERS,
  selectAvailableHelperForBooking,
  SERVICE_CATALOG,
} from '../utils/bookingRules';
import { formatInr } from './StatusIndicator';

interface BookingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  availableSeniors: SeniorProfile[];
  familyLinks: FamilyLink[];
  helpers: HelperProfile[];
  availabilities: HelperAvailability[];
  existingBookings: BookingRecord[];
  systemConfig: SystemConfig;
  initialServiceType?: ServiceType;
  initialDurationHours?: DurationHours;
  onCreateSeniorProfile: (profile: Omit<SeniorProfile, 'createdAt' | 'updatedAt'>) => Promise<SeniorProfile>;
  onSubmitBooking: (input: {
    seniorProfile: SeniorProfile;
    familyLink: FamilyLink | null;
    serviceType: ServiceType;
    date: string;
    startTime: string;
    durationHours: DurationHours;
    locality: string;
    pickupAddress: string;
    destination: string;
    taskNotes: string;
    locationConsentGranted: boolean;
    nonMedicalAcknowledged: boolean;
    clientSuppliedTotalInr: number;
    paymentStatus?: PaymentStatus;
  }) => Promise<BookingRecord>;
  onBookingConfirmed: (booking: BookingRecord) => void;
}

export const BookingFormModal: React.FC<BookingFormModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  availableSeniors,
  familyLinks,
  helpers,
  availabilities,
  existingBookings,
  systemConfig,
  initialServiceType = 'hospital_accompaniment',
  initialDurationHours = 4,
  onCreateSeniorProfile,
  onSubmitBooking,
  onBookingConfirmed,
}) => {
  const eligibleSeniors =
    currentUser.role === 'senior'
      ? availableSeniors.filter((s) => s.seniorId === currentUser.uid)
      : currentUser.role === 'admin'
      ? availableSeniors
      : availableSeniors.filter((s) =>
          familyLinks.some(
            (link) =>
              link.seniorId === s.seniorId &&
              link.familyUid === currentUser.uid &&
              link.status === 'active'
          )
        );

  const [selectedSeniorId, setSelectedSeniorId] = useState<string>(
    eligibleSeniors[0]?.seniorId || ''
  );
  const [serviceType, setServiceType] = useState<ServiceType>(initialServiceType);
  const [durationHours, setDurationHours] = useState<DurationHours>(initialDurationHours);
  const [date, setDate] = useState<string>('2026-10-29');
  const [startTime, setStartTime] = useState<string>('09:30');
  const [locality, setLocality] = useState<string>(
    eligibleSeniors[0]?.locality || systemConfig.serviceAreas[0] || 'Indiranagar'
  );
  const [pickupAddress, setPickupAddress] = useState<string>(
    eligibleSeniors[0]?.address || ''
  );
  const [destination, setDestination] = useState<string>('');
  const [taskNotes, setTaskNotes] = useState<string>('');
  const [locationConsentGranted, setLocationConsentGranted] = useState<boolean>(false);
  const [nonMedicalAcknowledged, setNonMedicalAcknowledged] = useState<boolean>(false);
  const [paymentSelection, setPaymentSelection] = useState<'paid_online' | 'pay_later_pending'>(
    'paid_online'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Inline Senior Profile creation state when user has no seniorProfile yet
  const [profileFullName, setProfileFullName] = useState<string>(currentUser.fullName || '');
  const [profileAge, setProfileAge] = useState<number>(70);
  const [profilePhone, setProfilePhone] = useState<string>(
    currentUser.phone && currentUser.phone.length >= 10 ? currentUser.phone : '+91-98450-11223'
  );
  const [profileLocality, setProfileLocality] = useState<string>(
    systemConfig.serviceAreas[0] || 'Indiranagar'
  );
  const [profileAddress, setProfileAddress] = useState<string>('');
  const [profileMobility, setProfileMobility] = useState<string>(
    'Prefers unhurried accompaniment'
  );
  const [profileEmergencyName, setProfileEmergencyName] = useState<string>('');
  const [profileEmergencyPhone, setProfileEmergencyPhone] = useState<string>('+91-98450-44556');
  const [profileCreating, setProfileCreating] = useState<boolean>(false);

  useEffect(() => {
    setServiceType(initialServiceType);
    setDurationHours(initialDurationHours);
  }, [initialServiceType, initialDurationHours]);

  useEffect(() => {
    setProfileFullName(currentUser.fullName || '');
    if (currentUser.phone && currentUser.phone.length >= 10) {
      setProfilePhone(currentUser.phone);
    }
  }, [currentUser.fullName, currentUser.phone]);

  useEffect(() => {
    const firstSenior = eligibleSeniors.find((s) => s.seniorId === selectedSeniorId) || eligibleSeniors[0];
    if (firstSenior) {
      setSelectedSeniorId(firstSenior.seniorId);
      setLocality(firstSenior.locality);
      setPickupAddress(firstSenior.address);
    }
  }, [isOpen, currentUser.uid, availableSeniors.length, familyLinks.length]);

  if (!isOpen) return null;

  const selectedSenior = eligibleSeniors.find((s) => s.seniorId === selectedSeniorId) || null;
  const activeFamilyLink =
    currentUser.role === 'family_member' && selectedSenior
      ? familyLinks.find(
          (l) =>
            l.seniorId === selectedSenior.seniorId &&
            l.familyUid === currentUser.uid &&
            l.status === 'active'
        ) || null
      : null;

  const priceSummary = calculateBookingPrice(durationHours, serviceType, systemConfig);

  const effectiveHelpers: HelperProfile[] =
    helpers.length > 0
      ? helpers
      : INITIAL_VERIFIED_HELPERS.map((h) => ({
          ...h,
          createdAt: '',
          updatedAt: '',
        }));
  const effectiveAvailabilities: HelperAvailability[] =
    availabilities.length > 0
      ? availabilities
      : INITIAL_HELPER_AVAILABILITIES.map((a) => ({
          ...a,
          updatedAt: '',
        }));

  const liveAvailabilitySelection = selectAvailableHelperForBooking({
    serviceType,
    locality,
    date,
    startTime,
    durationHours,
    helpers: effectiveHelpers,
    availabilities: effectiveAvailabilities,
    existingBookings,
  });

  const handleSeniorChange = (newSeniorId: string) => {
    setSelectedSeniorId(newSeniorId);
    const found = eligibleSeniors.find((s) => s.seniorId === newSeniorId);
    if (found) {
      setLocality(found.locality);
      setPickupAddress(found.address);
    }
  };

  const handleInlineCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (profileFullName.trim().length < 2) {
      setFormError('Please enter the senior citizen full name (minimum 2 characters).');
      return;
    }
    if (profilePhone.trim().length < 10) {
      setFormError('Please enter a valid 10-digit phone number.');
      return;
    }
    if (profileAddress.trim().length < 5) {
      setFormError('Please enter a complete pickup address in Bengaluru (minimum 5 characters).');
      return;
    }
    if (profileEmergencyName.trim().length < 2) {
      setFormError('Please enter an emergency contact name.');
      return;
    }
    if (profileEmergencyPhone.trim().length < 10) {
      setFormError('Please enter a valid emergency contact phone number.');
      return;
    }

    setProfileCreating(true);
    try {
      const created = await onCreateSeniorProfile({
        seniorId: currentUser.uid,
        fullName: profileFullName.trim(),
        age: Math.min(115, Math.max(55, Number(profileAge) || 70)),
        phone: profilePhone.trim(),
        locality: profileLocality,
        address: profileAddress.trim(),
        preferredLanguages: ['Kannada', 'English'],
        mobilityNote: profileMobility.trim() || 'Prefers unhurried accompaniment',
        emergencyContactName: profileEmergencyName.trim(),
        emergencyContactPhone: profileEmergencyPhone.trim(),
        allowFamilyBookings: true,
      });
      setSelectedSeniorId(created.seniorId);
      setLocality(created.locality);
      setPickupAddress(created.address);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not save Senior Citizen profile.'
      );
    } finally {
      setProfileCreating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedSenior) {
      setFormError(
        currentUser.role === 'family_member'
          ? 'No senior with active family booking consent is selected. Request and obtain consent from the senior first.'
          : 'Please complete your Senior Profile before booking.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const createdBooking = await onSubmitBooking({
        seniorProfile: selectedSenior,
        familyLink: activeFamilyLink,
        serviceType,
        date,
        startTime,
        durationHours,
        locality,
        pickupAddress,
        destination,
        taskNotes,
        locationConsentGranted,
        nonMedicalAcknowledged,
        clientSuppliedTotalInr: priceSummary.totalPriceInr,
        paymentStatus: paymentSelection,
      });
      onBookingConfirmed(createdBooking);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Database operation failed. Booking was not saved.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E7E2DA] rounded-xl max-w-3xl w-full p-6 sm:p-8 my-8 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-[#E7E2DA] pb-4 mb-6">
          <div>
            <p className="text-xs font-semibold text-[#9A3412]">
              New Companion Booking · {systemConfig.city}
            </p>
            <h2 id="booking-modal-title" className="text-2xl font-bold text-[#1C1917]">
              Schedule Non-Medical Senior Accompaniment
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close booking form"
            onClick={onClose}
            className="p-2 text-[#57534E] hover:text-[#1C1917] rounded-lg"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-6 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B] flex items-start gap-2.5"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>{formError}</div>
          </div>
        )}

        {eligibleSeniors.length === 0 ? (
          currentUser.role === 'family_member' ? (
            <div className="p-6 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-base font-semibold text-[#991B1B]">
                <ShieldAlert className="w-5 h-5" aria-hidden="true" />
                <span>Explicit Senior Consent Required for Family Bookings</span>
              </div>
              <p className="text-sm text-[#57534E]">
                Family access requires explicit consent from the senior citizen. Please request
                authorization using the Senior Share ID in your dashboard and wait for the senior
                to approve it.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#1C1917] text-white text-sm font-semibold rounded-lg"
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleInlineCreateProfile}
              className="p-6 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl space-y-5"
            >
              <div>
                <p className="text-xs font-semibold text-[#9A3412]">
                  Step 1 of 2 · One-Time Senior Citizen Profile Setup
                </p>
                <h3 className="text-lg font-bold text-[#1C1917] mt-0.5">
                  Complete Your Senior Citizen Profile to Continue Booking
                </h3>
                <p className="text-xs text-[#57534E] mt-1">
                  SaathiCare stores your Bengaluru locality, pickup address, and emergency contact
                  in Cloud Firestore before scheduling your companion visit.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="inline-senior-name"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Senior Full Name
                  </label>
                  <input
                    id="inline-senior-name"
                    type="text"
                    required
                    value={profileFullName}
                    onChange={(e) => setProfileFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inline-senior-age"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Age (55–115 yrs)
                  </label>
                  <input
                    id="inline-senior-age"
                    type="number"
                    min={55}
                    max={115}
                    required
                    value={profileAge}
                    onChange={(e) => setProfileAge(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inline-senior-phone"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Senior Phone Number
                  </label>
                  <input
                    id="inline-senior-phone"
                    type="tel"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="inline-senior-locality"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Bengaluru Locality
                  </label>
                  <select
                    id="inline-senior-locality"
                    value={profileLocality}
                    onChange={(e) => setProfileLocality(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
                  >
                    {systemConfig.serviceAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="inline-senior-address"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Complete Pickup Street Address (Bengaluru)
                  </label>
                  <input
                    id="inline-senior-address"
                    type="text"
                    required
                    placeholder="e.g., Flat 204, Shanthi Residency, 12th Main, Indiranagar"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="inline-senior-emergency-name"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Emergency Contact Name
                  </label>
                  <input
                    id="inline-senior-emergency-name"
                    type="text"
                    required
                    placeholder="e.g., Ananya Rao (Daughter)"
                    value={profileEmergencyName}
                    onChange={(e) => setProfileEmergencyName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inline-senior-emergency-phone"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Emergency Contact Phone
                  </label>
                  <input
                    id="inline-senior-emergency-phone"
                    type="tel"
                    required
                    value={profileEmergencyPhone}
                    onChange={(e) => setProfileEmergencyPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inline-senior-mobility"
                    className="block text-xs font-semibold text-[#1C1917] mb-1"
                  >
                    Non-Medical Pace / Mobility Note
                  </label>
                  <input
                    id="inline-senior-mobility"
                    type="text"
                    value={profileMobility}
                    onChange={(e) => setProfileMobility(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#E7E2DA]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileCreating}
                  className="px-5 py-2.5 bg-[#9A3412] text-white text-xs font-semibold rounded-lg hover:bg-[#7C2D12] disabled:opacity-50"
                >
                  {profileCreating
                    ? 'Saving Senior Profile...'
                    : 'Save Senior Profile & Continue to Booking'}
                </button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Senior Citizen & Service Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="booking-senior-select"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Senior Citizen Receiving Accompaniment
                </label>
                <select
                  id="booking-senior-select"
                  value={selectedSeniorId}
                  onChange={(e) => handleSeniorChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                >
                  {eligibleSeniors.map((senior) => (
                    <option key={senior.seniorId} value={senior.seniorId}>
                      {senior.fullName} (Age {senior.age} · {senior.locality})
                    </option>
                  ))}
                </select>
                {activeFamilyLink && (
                  <p className="text-xs text-[#14532D] mt-1">
                    Booking as authorized {activeFamilyLink.relationship} ({activeFamilyLink.familyName})
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="booking-service-select"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Non-Medical Service Type
                </label>
                <select
                  id="booking-service-select"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as ServiceType)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                >
                  <option value="hospital_accompaniment">Hospital or Clinic Accompaniment</option>
                  <option value="shopping_errands">Shopping and Errands</option>
                  <option value="companionship_visit">Companionship Visits</option>
                </select>
                <p className="text-xs text-[#57534E] mt-1">
                  {SERVICE_CATALOG[serviceType].excludedNotice}
                </p>
              </div>
            </div>

            {/* Step 2: Date, Start Time, Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="booking-date"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Visit Date
                </label>
                <input
                  id="booking-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono text-[#1C1917]"
                />
              </div>

              <div>
                <label
                  htmlFor="booking-start-time"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Start Time (06:00–20:00)
                </label>
                <input
                  id="booking-start-time"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono text-[#1C1917]"
                />
              </div>

              <div>
                <label
                  htmlFor="booking-duration"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Duration
                </label>
                <select
                  id="booking-duration"
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value) as DurationHours)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                >
                  <option value={2}>2 Hours ({formatInr(systemConfig.rate2HoursInr)})</option>
                  <option value={4}>4 Hours ({formatInr(systemConfig.rate4HoursInr)})</option>
                  <option value={8}>Full Day · 8 Hours ({formatInr(systemConfig.rate8HoursInr)})</option>
                </select>
              </div>
            </div>

            {/* Step 3: Locality, Pickup Address, Optional Destination & Task Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="booking-locality"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Bengaluru Locality
                </label>
                <select
                  id="booking-locality"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                >
                  {systemConfig.serviceAreas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="booking-pickup-address"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Pickup Address
                </label>
                <input
                  id="booking-pickup-address"
                  type="text"
                  required
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="House/Flat No., Street, Landmark, Bengaluru"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="booking-destination"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Destination (Optional Clinic, Market, or Park)
                </label>
                <input
                  id="booking-destination"
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Manipal Hospital Old Airport Road"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label
                  htmlFor="booking-task-notes"
                  className="block text-sm font-semibold text-[#1C1917] mb-1.5"
                >
                  Task & Accompaniment Notes
                </label>
                <input
                  id="booking-task-notes"
                  type="text"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="e.g. Assist with OPD registration counter and cab boarding"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                />
              </div>
            </div>

            {/* Step 3.5: Real-Time Helper Availability Check & Immediate Assignment */}
            <div className="p-5 bg-white border border-[#D6D0C4] rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E2DA] pb-3">
                <div>
                  <p className="text-xs font-semibold text-[#9A3412]">
                    Live Helper Availability & Schedule Conflict Check
                  </p>
                  <h3 className="text-base font-bold text-[#1C1917]">
                    {liveAvailabilitySelection.matchedHelper
                      ? `Immediate Helper Assignment: ${liveAvailabilitySelection.matchedHelper.fullName}`
                      : 'No Helper Immediately Available for Selected Slot'}
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold ${
                    liveAvailabilitySelection.matchedHelper
                      ? 'bg-[#F0FDF4] text-[#14532D] border border-[#BBF7D0]'
                      : 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {liveAvailabilitySelection.matchedHelper
                      ? 'Available · Assigned Immediately on Submit'
                      : 'Will Queue as Pending Assignment'}
                  </span>
                </span>
              </div>

              {liveAvailabilitySelection.matchedHelper ? (
                <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs text-[#14532D] space-y-1">
                  <div className="font-bold text-sm">
                    {liveAvailabilitySelection.matchedHelper.fullName} (
                    {liveAvailabilitySelection.matchedHelper.yearsExperience} yrs experience ·{' '}
                    {liveAvailabilitySelection.matchedHelper.languages.join(', ')})
                  </div>
                  <p>
                    Verified 4-Point Check Complete · Covers <strong>{locality}</strong> · Available
                    for <strong>{date}</strong> at <strong>{startTime}</strong> ({durationHours}h)
                    with <strong>0 schedule conflicts</strong>.
                  </p>
                  <p className="text-[#166534]">
                    This companion helper will be assigned immediately when you submit the booking.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E] space-y-1">
                  <div className="font-bold">
                    Why no helper is immediately available for {date} at {startTime} ({durationHours}h):
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {liveAvailabilitySelection.evaluations.map((ev) => (
                      <li key={ev.helper.helperId}>
                        <strong>{ev.helper.fullName}:</strong>{' '}
                        {ev.unavailableSummary || 'Unavailable for this slot.'}
                      </li>
                    ))}
                  </ul>
                  <p className="pt-1">
                    Tip: Adjust the start time (e.g., 09:00–15:00) or locality, or submit to place
                    in the Coordinator Dispatch queue.
                  </p>
                </div>
              )}
            </div>

            {/* Step 4: Price Summary, Configured Online Payment & Cancellation Policy */}
            <div className="p-5 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[#1C1917]">
                  Price Summary, Payment & Cancellation Policy
                </h3>
                <span className="text-xs font-mono font-semibold text-[#14532D] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-1 rounded-md">
                  Configured · Online UPI & Pay Later Enabled
                </span>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-[#57534E]">
                  <span>
                    Base Companion Fee ({durationHours === 8 ? 'Full Day · 8 Hours' : `${durationHours} Hours`})
                  </span>
                  <span className="font-mono tabular-nums text-[#1C1917]">
                    {formatInr(priceSummary.basePriceInr)}
                  </span>
                </div>
                <div className="flex justify-between text-[#57534E]">
                  <span>{priceSummary.additionalChargeLabel}</span>
                  <span className="font-mono tabular-nums text-[#1C1917]">
                    {formatInr(priceSummary.additionalChargesInr)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#E7E2DA] flex justify-between text-base font-bold text-[#1C1917]">
                  <span>Total Calculated Fee</span>
                  <span className="font-mono tabular-nums text-[#9A3412]">
                    {formatInr(priceSummary.totalPriceInr)}
                  </span>
                </div>
              </div>

              {/* Configured Payment Mode Selector */}
              <div className="pt-3 border-t border-[#E7E2DA] space-y-2.5">
                <div className="text-xs font-semibold text-[#1C1917]">
                  Select Payment Method
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentSelection('paid_online')}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      paymentSelection === 'paid_online'
                        ? 'bg-[#F0FDF4] border-[#14532D] text-[#1C1917]'
                        : 'bg-white border-[#D6D0C4] text-[#57534E] hover:border-[#A8A29E]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1C1917]">
                        Pay Online Now (UPI / Instant)
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-[#14532D]">
                        {formatInr(priceSummary.totalPriceInr)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#57534E] mt-1">
                      Instant digital payment via UPI (saathicare.blr@upi) recorded in Cloud Firestore.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentSelection('pay_later_pending')}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      paymentSelection === 'pay_later_pending'
                        ? 'bg-white border-[#9A3412] text-[#1C1917]'
                        : 'bg-white border-[#D6D0C4] text-[#57534E] hover:border-[#A8A29E]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1C1917]">
                        Pay Later After Visit
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-[#9A3412]">
                        Post-Visit
                      </span>
                    </div>
                    <p className="text-[11px] text-[#57534E] mt-1">
                      Settle online or via UPI after the companion visit is completed.
                    </p>
                  </button>
                </div>

                {paymentSelection === 'paid_online' && (
                  <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-[#14532D]">
                    <div>
                      <strong>Verified UPI Merchant ID:</strong>{' '}
                      <span className="font-mono">saathicare.blr@upi</span> · Amount:{' '}
                      <span className="font-mono font-bold">
                        {formatInr(priceSummary.totalPriceInr)}
                      </span>
                    </div>
                    <a
                      href={`upi://pay?pa=saathicare.blr@upi&pn=SaathiCare%20Bengaluru&am=${priceSummary.totalPriceInr}&cu=INR&tn=${encodeURIComponent(
                        `SaathiCare ${SERVICE_CATALOG[serviceType].shortLabel}`
                      )}`}
                      className="px-2.5 py-1 bg-white border border-[#BBF7D0] text-[#14532D] font-semibold rounded hover:bg-[#DCFCE7]"
                    >
                      Open UPI App
                    </a>
                  </div>
                )}
              </div>

              <div className="text-xs text-[#57534E] space-y-1 pt-2 border-t border-[#E7E2DA]">
                <p>
                  <strong>Payment Status:</strong>{' '}
                  {paymentSelection === 'paid_online'
                    ? `Online UPI payment of ${formatInr(priceSummary.totalPriceInr)} selected — booking will be marked Paid Online.`
                    : `Pay Later selected — ${formatInr(priceSummary.totalPriceInr)} can be settled online in the booking drawer at any time.`}
                </p>
                <p>
                  <strong>Cancellation Policy:</strong> {priceSummary.cancellationPolicy}
                </p>
                <p>
                  <strong>Immediate Helper Assignment:</strong>{' '}
                  {liveAvailabilitySelection.matchedHelper
                    ? `Verified helper ${liveAvailabilitySelection.matchedHelper.fullName} is available and will be assigned immediately upon booking submission.`
                    : 'No helper is currently free for this exact window; submitting places the booking in Pending Assignment for coordinator dispatch.'}
                </p>
              </div>
            </div>

            {/* Step 5: Explicit Consent Checkboxes */}
            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm text-[#1C1917] cursor-pointer">
                <input
                  type="checkbox"
                  checked={nonMedicalAcknowledged}
                  onChange={(e) => setNonMedicalAcknowledged(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-[#9A3412]"
                />
                <span>
                  I understand that SaathiCare provides <strong>non-medical companion assistance only</strong> and does not include nursing, clinical care, medication administration, or emergency response.
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm text-[#1C1917] cursor-pointer">
                <input
                  type="checkbox"
                  checked={locationConsentGranted}
                  onChange={(e) => setLocationConsentGranted(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-[#9A3412]"
                />
                <span>
                  I explicitly consent to sharing the pickup address, destination, and visit status
                  check-ins with the assigned verified helper and the Bengaluru Care Desk.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E7E2DA]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-[#57534E] hover:text-[#1C1917]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Verifying & Storing Booking...'
                    : `Submit Booking (${formatInr(priceSummary.totalPriceInr)})`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  HeartHandshake,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import type {
  DurationHours,
  ServiceType,
  SystemConfig,
  UserProfile,
  UserRole,
} from '../types/domain';
import { calculateBookingPrice, SERVICE_CATALOG } from '../utils/bookingRules';
import { formatInr } from './StatusIndicator';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../firebase';

interface HeroWelcomeProps {
  mode: 'welcome' | 'services';
  systemConfig: SystemConfig;
  firebaseAuthUser: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
  } | null;
  currentUser: UserProfile | null;
  authBusy: boolean;
  onSignInGoogle: () => void;
  onRegisterUser: (payload: {
    fullName: string;
    phone: string;
    role: UserRole;
    locality: string;
    address: string;
    age: number;
    emergencyContactName: string;
    emergencyContactPhone: string;
    bio: string;
    languages: string[];
  }) => Promise<void>;
  onStartBookingWithPreset: (serviceType: ServiceType, durationHours: DurationHours) => void;
  onNavigateToRoleWorkspace: () => void;
  authError: string | null;
}

export const HeroWelcome: React.FC<HeroWelcomeProps> = ({
  mode,
  systemConfig,
  firebaseAuthUser,
  currentUser,
  authBusy,
  onSignInGoogle,
  onRegisterUser,
  onStartBookingWithPreset,
  onNavigateToRoleWorkspace,
  authError,
}) => {
  const [calcService, setCalcService] = useState<ServiceType>('hospital_accompaniment');
  const [calcDuration, setCalcDuration] = useState<DurationHours>(4);
  const [selectedLocality, setSelectedLocality] = useState<string>(
    systemConfig.serviceAreas[0] || 'Indiranagar'
  );

  // Registration state for newly signed-in Firebase users without a /users/{uid} record
  const isBootstrappedAdminCandidate =
    firebaseAuthUser?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
    firebaseAuthUser?.emailVerified;

  const [regRole, setRegRole] = useState<UserRole>(
    isBootstrappedAdminCandidate ? 'admin' : 'senior'
  );
  const [regName, setRegName] = useState(firebaseAuthUser?.displayName || '');
  const [regPhone, setRegPhone] = useState('+91-98450-');
  const [regLocality, setRegLocality] = useState(systemConfig.serviceAreas[0] || 'Indiranagar');
  const [regAddress, setRegAddress] = useState('');
  const [regAge, setRegAge] = useState(70);
  const [regEmergencyName, setRegEmergencyName] = useState('');
  const [regEmergencyPhone, setRegEmergencyPhone] = useState('+91-98450-');
  const [regBio, setRegBio] = useState(
    'Patient, respectful companion experienced in senior accompaniment in Bengaluru.'
  );
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const estimatedPrice = calculateBookingPrice(calcDuration, calcService, systemConfig);

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    if (regName.trim().length < 2) {
      setRegError('Please enter your full name (minimum 2 characters).');
      return;
    }
    if (regPhone.trim().length < 10) {
      setRegError('Please enter a valid 10-digit Indian phone number.');
      return;
    }
    if (regRole === 'senior' && regAddress.trim().length < 5) {
      setRegError('Please enter your pickup address in Bengaluru.');
      return;
    }
    if (regRole === 'senior' && regEmergencyName.trim().length < 2) {
      setRegError('Please provide an emergency family or neighbour contact name.');
      return;
    }

    setRegSubmitting(true);
    try {
      await onRegisterUser({
        fullName: regName.trim(),
        phone: regPhone.trim(),
        role: regRole,
        locality: regLocality,
        address: regAddress.trim() || `${regLocality}, Bengaluru`,
        age: Number(regAge) || 70,
        emergencyContactName: regEmergencyName.trim() || 'Family Contact',
        emergencyContactPhone: regEmergencyPhone.trim() || regPhone.trim(),
        bio: regBio.trim(),
        languages: ['Kannada', 'English', 'Hindi'],
      });
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-14">
      {/* If user is authenticated via Firebase Auth but has not completed role registration */}
      {firebaseAuthUser && !currentUser && (
        <section
          aria-labelledby="registration-heading"
          className="bg-white border border-[#E7E2DA] rounded-xl p-8"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[#9A3412] mb-2">
              Account Setup · Bengaluru City Network
            </p>
            <h2 id="registration-heading" className="text-2xl font-bold text-[#1C1917] mb-2">
              Complete your SaathiCare registration
            </h2>
            <p className="text-sm text-[#57534E] mb-6">
              Signed in as <span className="font-mono text-[#1C1917]">{firebaseAuthUser.email}</span>
              . Choose your role to set up your database profile. Administrator access cannot be
              self-assigned by public users.
            </p>

            {regError && (
              <div
                role="alert"
                className="mb-6 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B]"
              >
                {regError}
              </div>
            )}

            <form onSubmit={handleRegistrationSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1C1917] mb-2">
                  Select Your Role
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        role: 'senior',
                        title: 'Senior Citizen',
                        desc: 'Book companions for yourself & manage family consent',
                      },
                      {
                        role: 'family_member',
                        title: 'Family Member',
                        desc: 'Book on behalf of a consenting parent or relative',
                      },
                      {
                        role: 'helper',
                        title: 'Companion Helper',
                        desc: 'Apply for admin verification & accept assigned visits',
                      },
                    ] as { role: UserRole; title: string; desc: string }[]
                  ).map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => setRegRole(item.role)}
                      className={`text-left p-4 rounded-lg border transition-colors ${
                        regRole === item.role
                          ? 'bg-[#FAF8F5] border-[#9A3412] text-[#1C1917]'
                          : 'bg-white border-[#E7E2DA] text-[#57534E] hover:border-[#A8A29E]'
                      }`}
                    >
                      <div className="font-semibold text-sm text-[#1C1917]">{item.title}</div>
                      <div className="text-xs text-[#57534E] mt-1">{item.desc}</div>
                    </button>
                  ))}
                </div>
                {isBootstrappedAdminCandidate && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setRegRole('admin')}
                      className={`text-left p-3 rounded-lg border text-xs font-semibold ${
                        regRole === 'admin'
                          ? 'bg-[#FAF8F5] border-[#9A3412] text-[#9A3412]'
                          : 'bg-white border-[#E7E2DA] text-[#57534E]'
                      }`}
                    >
                      Bootstrapped Administrator Account Detected ({firebaseAuthUser.email}) — Click
                      to register as Coordinator Admin
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="reg-fullname"
                    className="block text-sm font-medium text-[#1C1917] mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="reg-fullname"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-phone"
                    className="block text-sm font-medium text-[#1C1917] mb-1"
                  >
                    Phone Number (Bengaluru / India)
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono text-[#1C1917]"
                  />
                </div>
              </div>

              {regRole === 'senior' && (
                <div className="space-y-4 pt-2 border-t border-[#E7E2DA]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="reg-age"
                        className="block text-sm font-medium text-[#1C1917] mb-1"
                      >
                        Age (Years)
                      </label>
                      <input
                        id="reg-age"
                        type="number"
                        min={55}
                        max={115}
                        value={regAge}
                        onChange={(e) => setRegAge(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono text-[#1C1917]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="reg-locality"
                        className="block text-sm font-medium text-[#1C1917] mb-1"
                      >
                        Bengaluru Neighbourhood
                      </label>
                      <select
                        id="reg-locality"
                        value={regLocality}
                        onChange={(e) => setRegLocality(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
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
                      htmlFor="reg-address"
                      className="block text-sm font-medium text-[#1C1917] mb-1"
                    >
                      Home Pickup Address in Bengaluru
                    </label>
                    <input
                      id="reg-address"
                      type="text"
                      required
                      placeholder="House / Flat No., Main Road, Cross, Locality"
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="reg-em-name"
                        className="block text-sm font-medium text-[#1C1917] mb-1"
                      >
                        Emergency Family Contact Name
                      </label>
                      <input
                        id="reg-em-name"
                        type="text"
                        required
                        value={regEmergencyName}
                        onChange={(e) => setRegEmergencyName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="reg-em-phone"
                        className="block text-sm font-medium text-[#1C1917] mb-1"
                      >
                        Emergency Contact Phone
                      </label>
                      <input
                        id="reg-em-phone"
                        type="tel"
                        required
                        value={regEmergencyPhone}
                        onChange={(e) => setRegEmergencyPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono text-[#1C1917]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {regRole === 'helper' && (
                <div className="space-y-4 pt-2 border-t border-[#E7E2DA]">
                  <div>
                    <label
                      htmlFor="reg-helper-bio"
                      className="block text-sm font-medium text-[#1C1917] mb-1"
                    >
                      Experience Summary (Non-Medical Senior Accompaniment)
                    </label>
                    <textarea
                      id="reg-helper-bio"
                      rows={3}
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                    />
                  </div>
                  <p className="text-xs text-[#57534E]">
                    Note: Helper profiles start in <strong>Pending Verification</strong> status. You
                    cannot be assigned to any senior visit until an administrator reviews your ID,
                    police verification, two references, and orientation training.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={regSubmitting}
                className="px-6 py-3 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {regSubmitting ? 'Saving Profile to Firestore...' : 'Complete Registration'}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Hero 2-Column Split (Desktop 1440px presence, items-stretch balance) */}
      {mode === 'welcome' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Brand Value Proposition & Primary Actions */}
          <div className="lg:col-span-7 bg-white border border-[#E7E2DA] rounded-xl p-8 sm:p-10 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="text-xs font-semibold text-[#9A3412]">
                Bengaluru Senior Citizen Companion Service · Non-Medical Assistance Only
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold text-[#1C1917] leading-[1.15] tracking-tight">
                Unhurried, respectful companionship for every doorstep and clinic visit.
              </h1>
              <p className="text-base sm:text-lg text-[#57534E] max-w-2xl leading-relaxed">
                SaathiCare pairs older adults in Bengaluru with background-reviewed companions for
                outpatient hospital accompaniment, neighborhood shopping errands, and calm home or
                park visits. Seniors book directly, or authorized family members book with explicit,
                revocable consent.
              </p>

              {authError && (
                <div
                  role="alert"
                  className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#991B1B] flex items-start gap-2.5"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>{authError}</div>
                </div>
              )}
            </div>

            <div className="pt-8 space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onStartBookingWithPreset('hospital_accompaniment', 4)}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#9A3412] text-white text-base font-semibold rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap"
                >
                  <span>Book a Companion Visit</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
                {!currentUser ? (
                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    disabled={authBusy}
                    className="inline-flex items-center gap-2 px-5 py-3.5 bg-[#FAF8F5] text-[#1C1917] border border-[#D6D0C4] text-base font-semibold rounded-lg hover:bg-[#F3EFEA] transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {authBusy ? 'Connecting to Google...' : 'Sign In with Google Account'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onNavigateToRoleWorkspace}
                    className="inline-flex items-center gap-2 px-5 py-3.5 bg-[#FAF8F5] text-[#1C1917] border border-[#D6D0C4] text-base font-semibold rounded-lg hover:bg-[#F3EFEA] transition-colors whitespace-nowrap"
                  >
                    Open My {currentUser.role.replace('_', ' ')} Workspace
                  </button>
                )}
              </div>

              {/* Non-Medical Scope Boundary Statement */}
              <div className="pt-5 border-t border-[#E7E2DA] text-xs text-[#57534E] space-y-1">
                <div className="font-semibold text-[#1C1917]">
                  Clear Scope Guarantee: Non-Medical Companion Care Only
                </div>
                <p>
                  SaathiCare does <strong>not</strong> provide nursing, clinical care, physiotherapy,
                  medication administration, injections, or emergency ambulance response.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Warm Editorial Illustration & Live Quick Estimator */}
          <div className="lg:col-span-5 bg-white border border-[#E7E2DA] rounded-xl p-8 flex flex-col justify-between">
            {/* Bespoke Editorial SVG Illustration (Zero-Broken-Image Policy) */}
            <div
              role="img"
              aria-label="Illustration of a respectful companion walking alongside an older Indian adult in a sunlit Bengaluru courtyard"
              className="w-full h-56 rounded-lg bg-[#FAF5EE] border border-[#E7E2DA] p-5 flex flex-col justify-between relative overflow-hidden mb-6"
            >
              <svg
                viewBox="0 0 420 190"
                className="w-full h-full"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Warm morning sun and courtyard arch */}
                <circle cx="345" cy="48" r="34" fill="#FDE68A" fillOpacity="0.65" />
                <path
                  d="M20 175 H400"
                  stroke="#D6D0C4"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Courtyard pillars & foliage */}
                <rect x="38" y="45" width="14" height="130" rx="3" fill="#E7E2DA" />
                <rect x="115" y="45" width="14" height="130" rx="3" fill="#E7E2DA" />
                <path
                  d="M38 48 Q83 18 129 48"
                  stroke="#D6D0C4"
                  strokeWidth="4"
                  fill="none"
                />
                {/* Companion figure (left) & Senior citizen with walking stick (right) */}
                <circle cx="195" cy="68" r="14" fill="#9A3412" />
                <path
                  d="M175 168 L183 92 Q195 85 207 92 L215 168"
                  fill="#C2410C"
                  fillOpacity="0.85"
                />
                <circle cx="252" cy="72" r="14" fill="#57534E" />
                <path
                  d="M234 168 L240 96 Q252 90 264 96 L270 168"
                  fill="#14532D"
                  fillOpacity="0.85"
                />
                {/* Walking stick */}
                <line
                  x1="274"
                  y1="114"
                  x2="282"
                  y2="173"
                  stroke="#78350F"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Appointment folder */}
                <rect x="166" y="106" width="18" height="24" rx="2" fill="#FEF3C7" stroke="#9A3412" strokeWidth="1.5" />
              </svg>
              <div className="flex items-center justify-between text-xs text-[#57534E] pt-2 border-t border-[#E7E2DA]/80">
                <span>Doorstep-to-Doorstep Accompaniment</span>
                <span className="font-mono tabular-nums">{systemConfig.city}</span>
              </div>
            </div>

            {/* Live Transparent Fee Estimator */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#1C1917]">Transparent Fee Calculator</h2>
                <span className="text-xs text-[#57534E]">Server-validated rates</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="hero-calc-service"
                    className="block text-xs font-semibold text-[#57534E] mb-1"
                  >
                    Service Type
                  </label>
                  <select
                    id="hero-calc-service"
                    value={calcService}
                    onChange={(e) => setCalcService(e.target.value as ServiceType)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                  >
                    <option value="hospital_accompaniment">Hospital / Clinic Visit</option>
                    <option value="shopping_errands">Shopping & Errands</option>
                    <option value="companionship_visit">Companionship Visit</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="hero-calc-duration"
                    className="block text-xs font-semibold text-[#57534E] mb-1"
                  >
                    Visit Duration
                  </label>
                  <select
                    id="hero-calc-duration"
                    value={calcDuration}
                    onChange={(e) => setCalcDuration(Number(e.target.value) as DurationHours)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
                  >
                    <option value={2}>2 Hours ({formatInr(systemConfig.rate2HoursInr)})</option>
                    <option value={4}>4 Hours ({formatInr(systemConfig.rate4HoursInr)})</option>
                    <option value={8}>Full Day · 8 Hours ({formatInr(systemConfig.rate8HoursInr)})</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg space-y-1.5 text-sm">
                <div className="flex justify-between text-[#57534E]">
                  <span>Base Duration ({calcDuration} hours)</span>
                  <span className="font-mono tabular-nums text-[#1C1917]">
                    {formatInr(estimatedPrice.basePriceInr)}
                  </span>
                </div>
                <div className="flex justify-between text-[#57534E]">
                  <span>{estimatedPrice.additionalChargeLabel}</span>
                  <span className="font-mono tabular-nums text-[#1C1917]">
                    {formatInr(estimatedPrice.additionalChargesInr)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#E7E2DA] flex justify-between font-bold text-base text-[#1C1917]">
                  <span>Total Visit Fee</span>
                  <span className="font-mono tabular-nums text-[#9A3412]">
                    {formatInr(estimatedPrice.totalPriceInr)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onStartBookingWithPreset(calcService, calcDuration)}
                className="w-full py-2.5 px-4 bg-[#1C1917] text-white text-sm font-semibold rounded-lg hover:bg-[#292524] transition-colors whitespace-nowrap"
              >
                Continue with {SERVICE_CATALOG[calcService].shortLabel} ({calcDuration}h)
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Full-Width 4-Column Workflow & Trust Strip Below Hero */}
      <section aria-label="How SaathiCare Works" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-2">
          <div className="text-xs font-mono font-semibold text-[#9A3412] tabular-nums">
            01. Explicit Consent
          </div>
          <h3 className="text-lg font-bold text-[#1C1917]">Senior or Authorized Family</h3>
          <p className="text-sm text-[#57534E]">
            Seniors book directly or approve family members via a revocable consent link. Revoking
            consent blocks family booking access immediately.
          </p>
        </div>

        <div className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-2">
          <div className="text-xs font-mono font-semibold text-[#9A3412] tabular-nums">
            02. Four-Check Verification
          </div>
          <h3 className="text-lg font-bold text-[#1C1917]">Admin-Reviewed Helpers</h3>
          <p className="text-sm text-[#57534E]">
            Only administrators can approve helpers after reviewing government ID, police check, two
            local references, and non-medical orientation.
          </p>
        </div>

        <div className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-2">
          <div className="text-xs font-mono font-semibold text-[#9A3412] tabular-nums">
            03. Honest Assignment
          </div>
          <h3 className="text-lg font-bold text-[#1C1917]">Confirmed Only on Acceptance</h3>
          <p className="text-sm text-[#57534E]">
            Coordinators assign an available helper with zero schedule overlap. An assignment is
            confirmed only after the helper accepts it.
          </p>
        </div>

        <div className="bg-white border border-[#E7E2DA] rounded-xl p-6 space-y-2">
          <div className="text-xs font-mono font-semibold text-[#9A3412] tabular-nums">
            04. Audited Timeline
          </div>
          <h3 className="text-lg font-bold text-[#1C1917]">Append-Only Event History</h3>
          <p className="text-sm text-[#57534E]">
            Every transition from Pending Assignment through Arrived, In Progress, and Completed is
            logged with actor identity and server timestamp.
          </p>
        </div>
      </section>

      {/* Services & Pricing Detailed Catalog */}
      <section aria-labelledby="services-catalog-heading" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E7E2DA] pb-4">
          <div>
            <p className="text-xs font-semibold text-[#9A3412] mb-1">
              Non-Medical Companion Services · Bengaluru
            </p>
            <h2 id="services-catalog-heading" className="text-2xl sm:text-3xl font-bold text-[#1C1917]">
              Three focused services designed for senior comfort
            </h2>
          </div>
          <div className="text-sm text-[#57534E]">
            Active Localities: <span className="font-semibold text-[#1C1917]">{systemConfig.serviceAreas.length} Bengaluru neighbourhoods</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {(
            [
              {
                type: 'hospital_accompaniment' as ServiceType,
                icon: <Building2 className="w-5 h-5 text-[#9A3412]" aria-hidden="true" />,
                surcharge: systemConfig.hospitalSurchargeInr,
                defaultHours: 4 as DurationHours,
              },
              {
                type: 'shopping_errands' as ServiceType,
                icon: <ShoppingBag className="w-5 h-5 text-[#9A3412]" aria-hidden="true" />,
                surcharge: systemConfig.errandsSurchargeInr,
                defaultHours: 2 as DurationHours,
              },
              {
                type: 'companionship_visit' as ServiceType,
                icon: <HeartHandshake className="w-5 h-5 text-[#9A3412]" aria-hidden="true" />,
                surcharge: 0,
                defaultHours: 2 as DurationHours,
              },
            ]
          ).map((item) => {
            const spec = SERVICE_CATALOG[item.type];
            return (
              <div
                key={item.type}
                className="bg-white border border-[#E7E2DA] rounded-xl p-7 flex flex-col justify-between space-y-6"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-[#57534E]">
                    <span className="inline-flex items-center gap-2 font-semibold text-[#1C1917]">
                      {item.icon}
                      <span>Non-Medical Service</span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {item.surcharge > 0 ? `+${formatInr(item.surcharge)} surcharge` : 'No surcharge'}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-[#1C1917]">{spec.title}</h3>
                  <p className="text-sm text-[#57534E] leading-relaxed">{spec.description}</p>

                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-[#1C1917]">What is included:</div>
                    <ul className="space-y-1.5 text-sm text-[#57534E]">
                      {spec.includedTasks.map((task) => (
                        <li key={task} className="flex items-start gap-2">
                          <CheckCircle2
                            className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>{task}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-[#E7E2DA]">
                  <p className="text-xs text-[#78716C]">{spec.excludedNotice}</p>
                  <button
                    type="button"
                    onClick={() => onStartBookingWithPreset(item.type, item.defaultHours)}
                    className="w-full py-2.5 px-4 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap"
                  >
                    Select {spec.shortLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Bengaluru Neighbourhood Eligibility & Interactive Demo Sandbox Notice */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-4">
          <h3 className="text-xl font-bold text-[#1C1917]">
            Bengaluru Service Area Eligibility Checker
          </h3>
          <p className="text-sm text-[#57534E]">
            SaathiCare currently operates across verified Bengaluru residential localities configured
            by our coordination desk.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="locality-check-select" className="text-sm font-semibold text-[#1C1917]">
              Inspect Locality:
            </label>
            <select
              id="locality-check-select"
              value={selectedLocality}
              onChange={(e) => setSelectedLocality(e.target.value)}
              className="px-3.5 py-2 bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg text-sm text-[#1C1917]"
            >
              {systemConfig.serviceAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <span className="text-sm font-semibold text-[#14532D] inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              Active for 2h, 4h & Full-Day Visits
            </span>
          </div>
          <div className="text-xs text-[#57534E] pt-2">
            All supported localities: {systemConfig.serviceAreas.join(' · ')}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-[#E7E2DA] rounded-xl p-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#1C1917]">
              Role-Based Access & Security Enforcement
            </h3>
            <span className="text-xs font-mono text-[#14532D]">Firebase Auth + Firestore ABAC</span>
          </div>
          <p className="text-sm text-[#57534E]">
            SaathiCare enforces strict role separation across four user types: Senior Citizen,
            Authorized Family Member, Companion Helper, and Coordinator Administrator. Public users
            can never self-assign administrator privileges.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            {!currentUser ? (
              <button
                type="button"
                onClick={onSignInGoogle}
                disabled={authBusy}
                className="px-4 py-2.5 bg-[#9A3412] text-white rounded-lg text-xs font-semibold hover:bg-[#7C2D12] whitespace-nowrap disabled:opacity-50"
              >
                {authBusy ? 'Signing In...' : 'Sign In with Google to Access Your Role'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNavigateToRoleWorkspace}
                className="px-4 py-2.5 bg-[#1C1917] text-white rounded-lg text-xs font-semibold hover:bg-[#292524] whitespace-nowrap"
              >
                Open {currentUser.fullName}&apos;s Workspace
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

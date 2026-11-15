import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LifeBuoy, LogOut, ShieldCheck, UserCheck } from 'lucide-react';
import type { UserProfile } from '../types/domain';
import { TEST_ACCOUNTS } from '../utils/testAccounts';

export type ActiveTab =
  | 'welcome'
  | 'dashboard'
  | 'services'
  | 'helper_workspace'
  | 'admin_workspace';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentUser: UserProfile | null;
  firebaseEmail: string | null;
  activeTestAccountUid?: string | null;
  authBusy: boolean;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  onSelectTestAccount?: (uid: string) => void;
  onResetTestDataset?: () => void;
  onExitTestMode?: () => void;
  onOpenNewBooking: () => void;
  onOpenSupportModal: () => void;
  supportPhone: string;
  supportEmail: string;
}

const ROLE_LABELS: Record<UserProfile['role'], string> = {
  senior: 'Senior Citizen',
  family_member: 'Family Member',
  helper: 'Companion Helper',
  admin: 'Coordinator Admin',
};

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  firebaseEmail,
  activeTestAccountUid,
  authBusy,
  onSignInGoogle,
  onSignOut,
  onSelectTestAccount,
  onResetTestDataset,
  onExitTestMode,
  onOpenNewBooking,
  onOpenSupportModal,
  supportPhone,
  supportEmail,
}) => {
  const [testMenuOpen, setTestMenuOpen] = useState(false);
  const testMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!testMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (testMenuRef.current && !testMenuRef.current.contains(event.target as Node)) {
        setTestMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTestMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [testMenuOpen]);
  const navItems: {
    id: ActiveTab;
    label: string;
    roles?: UserProfile['role'][];
  }[] = [
    { id: 'welcome', label: 'Overview' },
    { id: 'services', label: 'Services & Pricing' },
    { id: 'dashboard', label: 'Family Dashboard' },
  ];

  return (
    <div>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex flex-wrap md:flex-nowrap items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-4 bg-white border-b border-[#E7E2DA]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab(currentUser ? 'dashboard' : 'welcome');
          }}
          className="text-xl font-bold tracking-tight text-[#1C1917] font-display whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
        >
          SaathiCare
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-[#57534E]"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412] ${
                  isActive
                    ? 'text-[#1C1917] underline decoration-[#9A3412] decoration-2 underline-offset-8 font-semibold'
                    : ''
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Test Accounts Dropdown & Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {onSelectTestAccount && (
            <div ref={testMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={testMenuOpen}
                aria-haspopup="true"
                onClick={() => setTestMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-[#1C1917] bg-[#FAF8F5] border border-[#D6D0C4] rounded-lg hover:bg-[#F3EFEA] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
              >
                <UserCheck className="w-4 h-4 text-[#9A3412]" aria-hidden="true" />
                <span>Test Accounts ({TEST_ACCOUNTS.length})</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#57534E] transition-transform ${
                    testMenuOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {testMenuOpen && (
                <div
                  role="region"
                  aria-label="Family Member Test Accounts"
                  className="fixed left-4 right-4 top-16 sm:top-auto sm:left-auto sm:absolute sm:right-0 sm:mt-2 sm:w-[420px] max-w-[calc(100vw-2rem)] bg-white border border-[#D6D0C4] rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#FAF8F5] border-b border-[#E7E2DA]">
                    <div className="text-xs font-bold text-[#9A3412] uppercase tracking-wide">
                      Family Member Test Logins
                    </div>
                    <p className="text-xs text-[#57534E] mt-0.5">
                      Select an account below to view its linked senior &amp; request hospital visits.
                    </p>
                  </div>

                  <div className="divide-y divide-[#E7E2DA] max-h-[65vh] overflow-y-auto">
                    {TEST_ACCOUNTS.map((account) => {
                      const isSelected = activeTestAccountUid === account.profile.uid;
                      return (
                        <div
                          key={account.profile.uid}
                          className={`p-3.5 space-y-1.5 ${
                            isSelected ? 'bg-[#FAF5EE]' : 'bg-white hover:bg-[#FAF8F5]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-[#1C1917]">
                                {account.profile.fullName}
                              </div>
                              <div className="text-[11px] font-semibold text-[#9A3412]">
                                {account.badgeLabel}
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label={
                                isSelected
                                  ? `${account.profile.fullName} Active`
                                  : `Use ${account.profile.fullName}`
                              }
                              onClick={() => {
                                onSelectTestAccount(account.profile.uid);
                                setTestMenuOpen(false);
                              }}
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                                isSelected
                                  ? 'bg-[#9A3412] text-white'
                                  : 'bg-[#1C1917] text-white hover:bg-[#292524]'
                              }`}
                            >
                              {isSelected ? 'Active' : 'Use Account'}
                            </button>
                          </div>

                          <div className="text-[11px] font-mono text-[#57534E] flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>{account.profile.email}</span>
                            <span>{account.profile.phone}</span>
                          </div>

                          <p className="text-xs text-[#57534E] leading-snug">
                            {account.summary}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {activeTestAccountUid && (onResetTestDataset || onExitTestMode) && (
                    <div className="px-4 py-2.5 bg-[#FAF8F5] border-t border-[#E7E2DA] flex items-center justify-between gap-2">
                      {onResetTestDataset && (
                        <button
                          type="button"
                          onClick={() => {
                            onResetTestDataset();
                            setTestMenuOpen(false);
                          }}
                          className="text-xs font-semibold text-[#1C1917] hover:underline"
                        >
                          Reset Test Data
                        </button>
                      )}
                      {onExitTestMode && (
                        <button
                          type="button"
                          onClick={() => {
                            onExitTestMode();
                            setTestMenuOpen(false);
                          }}
                          className="text-xs font-semibold text-[#9A3412] hover:underline ml-auto"
                        >
                          Exit Test Mode
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentUser ? (
            <button
              type="button"
              onClick={onOpenNewBooking}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
            >
              Request Hospital Visit
            </button>
          ) : firebaseEmail ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={authBusy}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-[#1C1917] bg-[#F3EFEA] border border-[#E7E2DA] rounded-lg hover:bg-[#E7E2DA] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              disabled={authBusy}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
            >
              {authBusy ? 'Connecting...' : 'Sign In with Google'}
            </button>
          )}
        </div>
      </header>

      {/* Secondary Workspace Utility Bar: Persistent Configurable Support Helpline, Active Auth Status & Mobile Nav */}
      <div className="bg-[#F3EFEA] border-b border-[#E7E2DA] px-6 py-2.5 text-xs text-[#57534E]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Persistent Support Contact & Non-Medical Notice */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#1C1917]">
              Bengaluru Care Desk:
            </span>
            <a
              href={`tel:${supportPhone}`}
              className="font-mono font-medium text-[#1C1917] tabular-nums hover:underline"
            >
              {supportPhone}
            </a>
            <span aria-hidden="true">·</span>
            <a
              href={`mailto:${supportEmail}`}
              className="hover:underline text-[#1C1917]"
            >
              {supportEmail}
            </a>
            <span aria-hidden="true">·</span>
            <span>
              Non-Medical Companion Service Only (For medical emergencies dial
              108 / 112)
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenSupportModal}
              className="inline-flex items-center gap-1 font-semibold text-[#9A3412] hover:underline whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
            >
              <LifeBuoy className="w-3.5 h-3.5" aria-hidden="true" />
              Report Issue / Support
            </button>
          </div>

          {/* Authenticated Session Indicator */}
          <div className="flex flex-wrap items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 text-[#1C1917] font-medium">
                  <ShieldCheck
                    className="w-3.5 h-3.5 text-[#14532D]"
                    aria-hidden="true"
                  />
                  <span>{currentUser.fullName}</span>
                  <span className="text-[#57534E]">
                    ({ROLE_LABELS[currentUser.role]})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1 text-[#9A3412] font-semibold hover:underline whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            ) : firebaseEmail ? (
              <div className="flex items-center gap-2.5">
                <span className="text-[#1C1917] font-medium">
                  Signed in as {firebaseEmail} (Profile registration required)
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1 text-[#9A3412] font-semibold hover:underline whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            ) : (
              <span className="text-[#57534E]">
                Not signed in · Sign in with Google or use Family Member Test Mode
              </span>
            )}
          </div>
        </div>

        {/* Mobile Responsive Navigation Links */}
        <nav
          aria-label="Mobile Navigation"
          className="flex md:hidden items-center gap-4 overflow-x-auto pt-2.5 mt-2 border-t border-[#E7E2DA]"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 ${
                  isActive
                    ? 'text-[#9A3412] font-bold underline underline-offset-4'
                    : 'text-[#57534E]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

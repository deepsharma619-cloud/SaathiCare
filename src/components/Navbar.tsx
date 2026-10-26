import React from 'react';
import { LifeBuoy, LogOut, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../types/domain';

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
  authBusy: boolean;
  onSignInGoogle: () => void;
  onSignOut: () => void;
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
  authBusy,
  onSignInGoogle,
  onSignOut,
  onOpenNewBooking,
  onOpenSupportModal,
  supportPhone,
  supportEmail,
}) => {
  const navItems: {
    id: ActiveTab;
    label: string;
    roles?: UserProfile['role'][];
  }[] = [
    { id: 'welcome', label: 'Overview' },
    { id: 'services', label: 'Services & Pricing' },
    {
      id: 'dashboard',
      label:
        currentUser?.role === 'family_member'
          ? 'Family Dashboard'
          : 'Senior & Family',
    },
    { id: 'helper_workspace', label: 'Helper Portal' },
    { id: 'admin_workspace', label: 'Coordinator Desk' },
  ];

  return (
    <div>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-[#E7E2DA]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (!currentUser) {
              onSelectTab('welcome');
            } else if (currentUser.role === 'helper') {
              onSelectTab('helper_workspace');
            } else if (currentUser.role === 'admin') {
              onSelectTab('admin_workspace');
            } else {
              onSelectTab('dashboard');
            }
          }}
          className="text-xl font-bold tracking-tight text-[#1C1917] font-display whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
        >
          SaathiCare
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
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

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {currentUser &&
          (currentUser.role === 'senior' ||
            currentUser.role === 'family_member') ? (
            <button
              type="button"
              onClick={onOpenNewBooking}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
            >
              Book Companion
            </button>
          ) : currentUser || firebaseEmail ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={authBusy}
              className="px-4 py-2.5 text-sm font-semibold text-[#1C1917] bg-[#F3EFEA] border border-[#E7E2DA] rounded-lg hover:bg-[#E7E2DA] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              disabled={authBusy}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-[#9A3412] rounded-lg hover:bg-[#7C2D12] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412]"
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
                Not signed in · Authenticate with Google to access role
                workspaces
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

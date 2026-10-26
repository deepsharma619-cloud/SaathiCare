import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Footprints,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type {
  BookingStatus,
  FamilyLinkStatus,
  HelperVerificationStatus,
  ServiceType,
} from '../types/domain';
import { BOOKING_STATUS_METADATA, SERVICE_CATALOG } from '../utils/bookingRules';

export function BookingStatusText({ status }: { status: BookingStatus }) {
  const meta = BOOKING_STATUS_METADATA[status];

  const iconMap: Record<BookingStatus, React.ReactNode> = {
    pending_assignment: <Clock className="w-4 h-4 text-[#B45309] shrink-0" aria-hidden="true" />,
    assigned: <UserCheck className="w-4 h-4 text-[#1D4ED8] shrink-0" aria-hidden="true" />,
    accepted: <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" aria-hidden="true" />,
    arrived: <MapPin className="w-4 h-4 text-[#0F766E] shrink-0" aria-hidden="true" />,
    in_progress: <Footprints className="w-4 h-4 text-[#0F766E] shrink-0" aria-hidden="true" />,
    completed: <CheckCircle2 className="w-4 h-4 text-[#14532D] shrink-0" aria-hidden="true" />,
    cancelled: <XCircle className="w-4 h-4 text-[#57534E] shrink-0" aria-hidden="true" />,
    needs_attention: <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0" aria-hidden="true" />,
  };

  const colorMap: Record<BookingStatus, string> = {
    pending_assignment: 'text-[#92400E]',
    assigned: 'text-[#1E40AF]',
    accepted: 'text-[#166534]',
    arrived: 'text-[#115E59]',
    in_progress: 'text-[#115E59]',
    completed: 'text-[#14532D]',
    cancelled: 'text-[#57534E]',
    needs_attention: 'text-[#991B1B]',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-sm ${colorMap[status]}`}>
      {iconMap[status]}
      <span>{meta.label}</span>
    </span>
  );
}

export function HelperVerificationText({
  status,
}: {
  status: HelperVerificationStatus;
}) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#14532D]">
        <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Verified & Approved Companion (4/4 Checks)</span>
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#92400E]">
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Verification Pending Admin Review (Ineligible for Assignment)</span>
      </span>
    );
  }
  if (status === 'suspended') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#991B1B]">
        <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Suspended (Ineligible for Assignment)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#78716C]">
      <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Verification Rejected (Ineligible for Assignment)</span>
    </span>
  );
}

export function FamilyLinkStatusText({ status }: { status: FamilyLinkStatus }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#14532D]">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Active Senior Consent Granted</span>
      </span>
    );
  }
  if (status === 'pending_consent') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#92400E]">
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Awaiting Explicit Senior Consent</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#991B1B]">
      <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Consent Revoked (Booking Access Blocked)</span>
    </span>
  );
}

export function ServiceLabelText({ serviceType }: { serviceType: ServiceType }) {
  return <span>{SERVICE_CATALOG[serviceType]?.title || serviceType}</span>;
}

export function formatInr(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

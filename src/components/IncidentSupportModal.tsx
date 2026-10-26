import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle2, LifeBuoy } from 'lucide-react';
import type {
  IncidentCategory,
  IncidentRecord,
  IncidentSeverity,
  UserProfile,
} from '../types/domain';

interface IncidentSupportModalProps {
  isOpen: boolean;
  initialBookingId?: string;
  onClose: () => void;
  currentUser: UserProfile | null;
  myIncidents: IncidentRecord[];
  supportPhone: string;
  supportEmail: string;
  onSubmitIncident: (payload: {
    bookingId: string;
    severity: IncidentSeverity;
    category: IncidentCategory;
    description: string;
  }) => Promise<void>;
}

export const IncidentSupportModal: React.FC<IncidentSupportModalProps> = ({
  isOpen,
  initialBookingId = 'general',
  onClose,
  currentUser,
  myIncidents,
  supportPhone,
  supportEmail,
  onSubmitIncident,
}) => {
  const [bookingId, setBookingId] = useState(initialBookingId || 'general');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [category, setCategory] = useState<IncidentCategory>('punctuality');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!currentUser) {
      setErrorMsg('Please sign in or select a role to submit an incident report.');
      return;
    }
    if (description.trim().length < 10) {
      setErrorMsg('Please describe the issue in at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitIncident({
        bookingId: bookingId.trim() || 'general',
        severity,
        category,
        description: description.trim(),
      });
      setDescription('');
      setSuccessMsg(
        'Your report has been logged privately for the Bengaluru Care Coordinator Desk.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit incident report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-heading"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E7E2DA] rounded-xl max-w-2xl w-full p-6 sm:p-8 my-8 max-h-[90vh] overflow-y-auto space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-[#E7E2DA] pb-4">
          <div>
            <p className="text-xs font-semibold text-[#9A3412]">
              Support & Incident Reporting · Restricted Confidentiality
            </p>
            <h2 id="support-modal-heading" className="text-2xl font-bold text-[#1C1917]">
              Contact Bengaluru Care Desk or Report an Incident
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close support dialog"
            onClick={onClose}
            className="p-2 text-[#57534E] hover:text-[#1C1917] rounded-lg"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-sm space-y-1">
          <div className="font-semibold text-[#1C1917] flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-[#9A3412]" aria-hidden="true" />
            <span>Direct Bengaluru Coordinator Helpline: {supportPhone}</span>
          </div>
          <p className="text-xs text-[#57534E]">
            Email: {supportEmail} · Note: SaathiCare is a non-medical companion service. For
            medical emergencies, immediately dial <strong>108</strong> or <strong>112</strong>.
          </p>
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

        {successMsg && (
          <div
            role="status"
            className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-sm text-[#14532D] flex items-start gap-2"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="inc-booking-id"
                className="block text-xs font-semibold text-[#1C1917] mb-1"
              >
                Related Booking ID
              </label>
              <input
                id="inc-booking-id"
                type="text"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="inc-category"
                className="block text-xs font-semibold text-[#1C1917] mb-1"
              >
                Issue Category
              </label>
              <select
                id="inc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
              >
                <option value="punctuality">Punctuality / Delay</option>
                <option value="conduct">Helper or Participant Conduct</option>
                <option value="safety_concern">Safety Concern</option>
                <option value="billing_question">Fee / Billing Question</option>
                <option value="other">General Support</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="inc-severity"
                className="block text-xs font-semibold text-[#1C1917] mb-1"
              >
                Severity
              </label>
              <select
                id="inc-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full px-3 py-2 bg-white border border-[#D6D0C4] rounded-lg text-sm"
              >
                <option value="low">Low — Routine Question</option>
                <option value="medium">Medium — Needs Coordinator Follow-up</option>
                <option value="high">High — Urgent Escalation</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="inc-description"
              className="block text-xs font-semibold text-[#1C1917] mb-1"
            >
              Incident / Support Details (Restricted to You and Authorized Administrators)
            </label>
            <textarea
              id="inc-description"
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened so our Bengaluru coordinator can assist..."
              className="w-full px-3.5 py-2.5 bg-white border border-[#D6D0C4] rounded-lg text-sm"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#57534E]"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-[#9A3412] text-white text-sm font-semibold rounded-lg hover:bg-[#7C2D12] disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Confidential Report'}
            </button>
          </div>
        </form>

        {/* Reporter's Own Submitted Incidents */}
        <div className="pt-4 border-t border-[#E7E2DA] space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">
            Your Submitted Support & Incident Reports ({myIncidents.length})
          </h3>
          {myIncidents.length === 0 ? (
            <p className="text-xs text-[#57534E]">No support or incident tickets submitted.</p>
          ) : (
            <div className="space-y-2.5">
              {myIncidents.map((inc) => (
                <div
                  key={inc.incidentId}
                  className="p-3.5 bg-[#FAF8F5] border border-[#E7E2DA] rounded-lg text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[#57534E]">
                    <span className="font-semibold text-[#1C1917]">
                      {inc.category.replace('_', ' ')} · Severity: {inc.severity} · Status:{' '}
                      {inc.status}
                    </span>
                    <span className="font-mono tabular-nums">{inc.bookingId}</span>
                  </div>
                  <p className="text-[#1C1917]">{inc.description}</p>
                  {inc.adminResolutionNote && (
                    <p className="text-[#14532D] font-medium">
                      Coordinator Note: {inc.adminResolutionNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

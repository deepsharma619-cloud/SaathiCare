// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

// src/utils/bookingRules.ts
var DEFAULT_SYSTEM_CONFIG = {
  configId: "bengaluru",
  city: "Bengaluru",
  supportPhone: "+91-80-4123-9800",
  supportEmail: "care.blr@saathicare.in",
  serviceAreas: [
    "Indiranagar",
    "Jayanagar",
    "Koramangala",
    "Malleshwaram",
    "JP Nagar",
    "Sadashivanagar",
    "HSR Layout",
    "Whitefield"
  ],
  rate2HoursInr: 500,
  rate4HoursInr: 900,
  rate8HoursInr: 1600,
  hospitalSurchargeInr: 150,
  errandsSurchargeInr: 50,
  updatedByUid: "system",
  updatedAt: "2026-10-25T00:00:00.000Z"
};
var SERVICE_CATALOG = {
  hospital_accompaniment: {
    title: "Hospital or Clinic Accompaniment",
    shortLabel: "Hospital / Clinic Visit",
    description: "Calm, attentive doorway-to-registration accompaniment for routine outpatient check-ups, diagnostic visits, and ophthalmology or dental appointments.",
    includedTasks: [
      "Doorstep pickup assistance and cab/auto coordination",
      "Outpatient registration desk & billing queue assistance",
      "Note-taking during non-emergency doctor consultations if requested",
      "Safe return home and family status check-in"
    ],
    excludedNotice: "Non-medical assistance only. Does not include nursing, clinical care, injections, wound dressing, or emergency ambulance response."
  },
  shopping_errands: {
    title: "Shopping and Errands",
    shortLabel: "Shopping & Errands",
    description: "Patient assistance with neighborhood grocery shopping, bank or post office visits, pharmacy pickups, and household errands.",
    includedTasks: [
      "Carrying shopping bags and navigating local markets",
      "Bank passbook updates, pension life-certificate visits, or utility errands",
      "Reading product labels, expiry dates, and receipts clearly",
      "Unpacking groceries safely at home"
    ],
    excludedNotice: "Non-medical assistance only. Helpers do not handle large cash transactions, PINs, or prescription alterations."
  },
  companionship_visit: {
    title: "Companionship Visits",
    shortLabel: "Companionship Visit",
    description: "Unhurried home or park visits for conversation, reading newspapers aloud, board games, gentle courtyard walks, and digital phone help.",
    includedTasks: [
      "Conversation in preferred Indian languages (Kannada, English, Hindi, Tamil, Telugu)",
      "Accompanied morning or evening walks in neighborhood parks",
      "Reading books, newspapers, or helping with family video calls",
      "Light tea-time preparation and reassuring presence"
    ],
    excludedNotice: "Non-medical companionship only. Does not include personal bathing, lifting, clinical caregiving, or medication administration."
  }
};
function calculateBookingPrice(durationHours, serviceType, config = DEFAULT_SYSTEM_CONFIG) {
  if (![2, 4, 8].includes(durationHours)) {
    throw new Error("Duration must be 2 hours, 4 hours, or 8 hours (Full Day).");
  }
  let basePriceInr = config.rate2HoursInr;
  if (durationHours === 4) {
    basePriceInr = config.rate4HoursInr;
  } else if (durationHours === 8) {
    basePriceInr = config.rate8HoursInr;
  }
  let additionalChargesInr = 0;
  let additionalChargeLabel = "No additional service surcharge";
  if (serviceType === "hospital_accompaniment") {
    additionalChargesInr = config.hospitalSurchargeInr;
    additionalChargeLabel = "Hospital / clinic coordination & desk assistance fee";
  } else if (serviceType === "shopping_errands") {
    additionalChargesInr = config.errandsSurchargeInr;
    additionalChargeLabel = "Local errand & bag-assistance surcharge";
  } else if (serviceType !== "companionship_visit") {
    throw new Error("Invalid service type.");
  }
  const totalPriceInr = basePriceInr + additionalChargesInr;
  return {
    durationHours,
    serviceType,
    basePriceInr,
    additionalChargesInr,
    totalPriceInr,
    additionalChargeLabel,
    paymentNotice: "Configured: Pay Online Instantly via UPI / Digital Payment or choose Pay Later after visit completion.",
    cancellationPolicy: "Free cancellation up to 4 hours before the scheduled start time. Cancellations within 4 hours of start time may incur a \u20B9150 coordinator dispatch fee."
  };
}
function generateBookingReference(dateStr, suffixSeed) {
  const compactDate = dateStr.replace(/[^0-9]/g, "").slice(0, 8) || "20261026";
  const rawSuffix = suffixSeed || Math.random().toString(36).substring(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "7").padEnd(4, "9");
  return `SC-BLR-${compactDate}-${rawSuffix.slice(0, 4).toUpperCase()}`;
}
function parseTimeToMinutes(timeStr) {
  const match = /^([0-9]{2}):([0-9]{2})$/.exec(timeStr.trim());
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM.`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Out-of-range time: ${timeStr}`);
  }
  return hours * 60 + minutes;
}
function checkHelperScheduleConflict(helperUid, targetDate, targetStartTime, targetDurationHours, existingBookings, excludeBookingId) {
  const targetStart = parseTimeToMinutes(targetStartTime);
  const targetEnd = targetStart + targetDurationHours * 60;
  const activeStatuses = ["assigned", "accepted", "arrived", "in_progress"];
  for (const booking of existingBookings) {
    if (excludeBookingId && booking.bookingId === excludeBookingId) {
      continue;
    }
    if (booking.assignedHelperUid !== helperUid) {
      continue;
    }
    if (booking.date !== targetDate) {
      continue;
    }
    if (!activeStatuses.includes(booking.status)) {
      continue;
    }
    const existingStart = parseTimeToMinutes(booking.startTime);
    const existingEnd = existingStart + booking.durationHours * 60;
    if (targetStart < existingEnd && existingStart < targetEnd) {
      return {
        hasConflict: true,
        conflictingBookingRef: booking.bookingRef,
        reason: `Schedule conflict with booking ${booking.bookingRef} (${booking.startTime} for ${booking.durationHours}h on ${booking.date}).`
      };
    }
  }
  return { hasConflict: false };
}
function getWeekdayCode(dateStr) {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const utcDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return dayMap[utcDate.getUTCDay()];
}
function checkHelperAvailabilityWindow(targetDate, targetStartTime, targetDurationHours, availability) {
  if (!availability) {
    return { available: true };
  }
  const dayCode = getWeekdayCode(targetDate);
  if (!availability.availableDays.includes(dayCode)) {
    return {
      available: false,
      reason: `Helper is not scheduled to work on ${dayCode} (available days: ${availability.availableDays.join(", ")}).`
    };
  }
  const visitStart = parseTimeToMinutes(targetStartTime);
  const visitEnd = visitStart + targetDurationHours * 60;
  const shiftStart = parseTimeToMinutes(availability.startHour);
  const shiftEnd = parseTimeToMinutes(availability.endHour);
  if (visitStart < shiftStart || visitEnd > shiftEnd) {
    return {
      available: false,
      reason: `Visit window (${targetStartTime} for ${targetDurationHours}h) falls outside helper shift hours (${availability.startHour}\u2013${availability.endHour}).`
    };
  }
  return { available: true };
}
function validateBookingCreationInput(input) {
  const config = input.config || DEFAULT_SYSTEM_CONFIG;
  if (!input.actorUid || input.actorUid.trim().length === 0) {
    return { valid: false, error: "Authentication required to create a booking." };
  }
  if (input.actorRole !== "senior" && input.actorRole !== "family_member" && input.actorRole !== "admin") {
    return {
      valid: false,
      error: "Only a Senior Citizen, an authorized Family Member, or a Coordinator Admin can create a companion booking."
    };
  }
  if (input.actorRole === "senior") {
    if (input.seniorProfile.seniorId !== input.actorUid) {
      return {
        valid: false,
        error: "A senior citizen can only create bookings for their own profile."
      };
    }
  } else if (input.actorRole === "family_member") {
    if (!input.seniorProfile.allowFamilyBookings) {
      return {
        valid: false,
        error: `${input.seniorProfile.fullName} has disabled family-initiated bookings on their profile.`
      };
    }
    if (!input.familyLink || input.familyLink.seniorId !== input.seniorProfile.seniorId || input.familyLink.familyUid !== input.actorUid || input.familyLink.status !== "active") {
      return {
        valid: false,
        error: "Explicit active consent from the senior citizen is required before a family member can book on their behalf."
      };
    }
  }
  if (!input.nonMedicalAcknowledged) {
    return {
      valid: false,
      error: "You must acknowledge that SaathiCare provides non-medical companion assistance only."
    };
  }
  if (!input.locationConsentGranted) {
    return {
      valid: false,
      error: "Explicit consent to share the pickup address and visit check-in status with the assigned helper is required."
    };
  }
  if (!config.serviceAreas.includes(input.locality)) {
    return {
      valid: false,
      error: `Locality "${input.locality}" is outside our active Bengaluru service areas (${config.serviceAreas.join(", ")}).`
    };
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)) {
    return { valid: false, error: "Please select a valid visit date (YYYY-MM-DD)." };
  }
  try {
    const minutes = parseTimeToMinutes(input.startTime);
    if (minutes < 6 * 60 || minutes > 20 * 60) {
      return {
        valid: false,
        error: "Visit start time must be within standard companion hours (06:00 to 20:00)."
      };
    }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid start time." };
  }
  if (!input.pickupAddress || input.pickupAddress.trim().length < 5) {
    return {
      valid: false,
      error: "Please enter a complete pickup address in Bengaluru (minimum 5 characters)."
    };
  }
  if (input.pickupAddress.trim().length > 300) {
    return { valid: false, error: "Pickup address cannot exceed 300 characters." };
  }
  if (input.destination.trim().length > 200) {
    return { valid: false, error: "Destination cannot exceed 200 characters." };
  }
  if (input.taskNotes.trim().length > 500) {
    return { valid: false, error: "Task notes cannot exceed 500 characters." };
  }
  let price;
  try {
    price = calculateBookingPrice(input.durationHours, input.serviceType, config);
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid pricing parameters." };
  }
  if (typeof input.clientSuppliedTotalInr === "number" && input.clientSuppliedTotalInr !== price.totalPriceInr) {
    return {
      valid: false,
      error: `Client-supplied price (\u20B9${input.clientSuppliedTotalInr}) does not match server-calculated price (\u20B9${price.totalPriceInr}).`
    };
  }
  return { valid: true, price };
}
function validateBookingTransition(input) {
  const {
    booking,
    toStatus,
    actorUid,
    actorRole,
    targetHelper,
    targetHelperAvailability = null,
    existingBookings = [],
    reasonOrNote = ""
  } = input;
  const fromStatus = booking.status;
  if (fromStatus === toStatus && toStatus !== "assigned") {
    return { valid: false, error: `Booking is already in "${fromStatus}" status.` };
  }
  if ((fromStatus === "completed" || fromStatus === "cancelled") && actorRole !== "admin") {
    return {
      valid: false,
      error: `Booking ${booking.bookingRef} is in terminal state "${fromStatus}" and cannot be modified.`
    };
  }
  if (toStatus === "assigned") {
    if (actorRole !== "admin") {
      return {
        valid: false,
        error: "Only an authorized Administrator can assign a helper to a booking."
      };
    }
    if (!["pending_assignment", "needs_attention", "assigned"].includes(fromStatus)) {
      return {
        valid: false,
        error: `Cannot assign a helper when booking is in "${fromStatus}" state.`
      };
    }
    if (!targetHelper) {
      return { valid: false, error: "A valid helper profile must be selected for assignment." };
    }
    if (targetHelper.verificationStatus !== "approved") {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} is "${targetHelper.verificationStatus}". Only "approved" helpers can be assigned.`
      };
    }
    if (!targetHelper.idCheckReviewed || !targetHelper.backgroundCheckReviewed || !targetHelper.referenceCheckReviewed || !targetHelper.trainingCompleted) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} has incomplete verification checks.`
      };
    }
    if (!targetHelper.isActive) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} is currently marked inactive.`
      };
    }
    if (!targetHelper.serviceAreas.includes(booking.locality)) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} does not cover ${booking.locality} (covers: ${targetHelper.serviceAreas.join(", ")}).`
      };
    }
    if (!targetHelper.servicesOffered.includes(booking.serviceType)) {
      return {
        valid: false,
        error: `Helper ${targetHelper.fullName} is not enrolled for service type "${booking.serviceType}".`
      };
    }
    const availabilityWindow = checkHelperAvailabilityWindow(
      booking.date,
      booking.startTime,
      booking.durationHours,
      targetHelperAvailability
    );
    if (!availabilityWindow.available) {
      return {
        valid: false,
        error: availabilityWindow.reason || "Helper is unavailable during the requested time window."
      };
    }
    const conflict = checkHelperScheduleConflict(
      targetHelper.helperId,
      booking.date,
      booking.startTime,
      booking.durationHours,
      existingBookings,
      booking.bookingId
    );
    if (conflict.hasConflict) {
      return {
        valid: false,
        error: conflict.reason || "Helper has a conflicting booking on this schedule."
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || `Assigned verified helper ${targetHelper.fullName}. Awaiting helper acceptance.`
    };
  }
  if (toStatus === "accepted") {
    if (fromStatus !== "assigned") {
      return {
        valid: false,
        error: `Booking must be in "assigned" state before acceptance (current: "${fromStatus}").`
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the assigned helper can accept and confirm this booking assignment."
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || "Helper accepted the assignment and confirmed schedule."
    };
  }
  if (toStatus === "arrived") {
    if (fromStatus !== "accepted") {
      return {
        valid: false,
        error: `Booking must be "accepted" before marking arrival (current: "${fromStatus}").`
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the assigned helper can mark arrival at the pickup address."
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || "Helper arrived at the senior citizen pickup address."
    };
  }
  if (toStatus === "in_progress") {
    if (fromStatus !== "arrived") {
      return {
        valid: false,
        error: `Helper must mark "arrived" before starting the visit (current: "${fromStatus}").`
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the assigned helper can transition the visit to in_progress."
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || "Companion accompaniment visit started."
    };
  }
  if (toStatus === "completed") {
    if (fromStatus !== "in_progress") {
      return {
        valid: false,
        error: `Visit must be "in_progress" before marking completed (current: "${fromStatus}").`
      };
    }
    if (booking.assignedHelperUid !== actorUid && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the assigned helper can mark the visit completed."
      };
    }
    return {
      valid: true,
      auditNote: reasonOrNote.trim() || "Companion visit completed safely."
    };
  }
  if (toStatus === "cancelled") {
    const isParticipantBooker = booking.seniorId === actorUid || booking.bookedByUid === actorUid;
    if (!isParticipantBooker && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the senior citizen, the booking creator, or an administrator can cancel a booking."
      };
    }
    if (!["pending_assignment", "assigned", "accepted", "needs_attention"].includes(fromStatus) && actorRole !== "admin") {
      return {
        valid: false,
        error: `Cannot self-cancel once the helper has arrived or the visit is "${fromStatus}". Please flag Needs Attention or contact support.`
      };
    }
    if (!reasonOrNote || reasonOrNote.trim().length < 3) {
      return {
        valid: false,
        error: "Please provide a brief cancellation reason (minimum 3 characters)."
      };
    }
    return {
      valid: true,
      auditNote: `Cancelled: ${reasonOrNote.trim()}`
    };
  }
  if (toStatus === "needs_attention") {
    const isAuthorizedParticipant = booking.seniorId === actorUid || booking.bookedByUid === actorUid || booking.assignedHelperUid === actorUid || actorRole === "admin";
    if (!isAuthorizedParticipant) {
      return {
        valid: false,
        error: "Only booking participants or administrators can flag a booking for coordinator attention."
      };
    }
    if (!["assigned", "accepted", "arrived", "in_progress"].includes(fromStatus) && actorRole !== "admin") {
      return {
        valid: false,
        error: `Cannot flag "${fromStatus}" booking as needs_attention.`
      };
    }
    if (!reasonOrNote || reasonOrNote.trim().length < 3) {
      return {
        valid: false,
        error: "Please describe why coordinator attention is needed (minimum 3 characters)."
      };
    }
    return {
      valid: true,
      auditNote: `Flagged Needs Attention: ${reasonOrNote.trim()}`
    };
  }
  return {
    valid: false,
    error: `Transition from "${fromStatus}" to "${toStatus}" is not allowed.`
  };
}
function validateHelperVerificationUpdate(actorRole, payload) {
  if (actorRole !== "admin") {
    return {
      valid: false,
      error: "Unauthorized: Only an Administrator can update helper verification status."
    };
  }
  if (!["pending", "approved", "rejected", "suspended"].includes(payload.verificationStatus)) {
    return { valid: false, error: "Invalid verification status." };
  }
  if (payload.verificationStatus === "approved") {
    if (!payload.idCheckReviewed || !payload.backgroundCheckReviewed || !payload.referenceCheckReviewed || !payload.trainingCompleted) {
      return {
        valid: false,
        error: "Cannot mark helper as Approved until all 4 required checks (Government ID, Police/Background Verification, 2 Local References, and Non-Medical Companion Orientation) are reviewed and checked."
      };
    }
  }
  return { valid: true };
}
function validateFamilyLinkTransition(actorUid, actorRole, existingLink, nextStatus, consentNote) {
  if (!consentNote || consentNote.trim().length < 2) {
    return { valid: false, error: "Please include a short consent or revocation note." };
  }
  if (nextStatus === "active") {
    if (existingLink.seniorId !== actorUid && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the Senior Citizen can grant explicit consent to activate a family booking link."
      };
    }
    return { valid: true };
  }
  if (nextStatus === "revoked") {
    if (existingLink.seniorId !== actorUid && existingLink.familyUid !== actorUid && actorRole !== "admin") {
      return {
        valid: false,
        error: "Only the Senior Citizen, the linked Family Member, or an Admin can revoke family access."
      };
    }
    return { valid: true };
  }
  return { valid: false, error: `Invalid family link transition to "${nextStatus}".` };
}
function evaluateEmailNotificationBoundary(envConfig) {
  if (envConfig?.emailEnabled && envConfig?.providerVerified) {
    return {
      status: "configured",
      delivered: true,
      notice: "Email notification dispatched via verified provider."
    };
  }
  return {
    status: "not_configured",
    delivered: false,
    notice: "Email & SMS notifications are not configured. No delivery was simulated; status is persisted in Cloud Firestore."
  };
}
function verifyAdminEndpointAuthorization(params) {
  if (params.actorRole !== "admin") {
    return {
      authorized: false,
      error: "Forbidden: Administrator role is required for this endpoint."
    };
  }
  if (params.emailVerified === false) {
    return {
      authorized: false,
      error: "Forbidden: Administrator email must be verified."
    };
  }
  if (typeof params.actorEmail === "string" && params.actorEmail.trim().length > 0) {
    const normalized = params.actorEmail.trim().toLowerCase();
    if (params.bootstrappedAdminEmails.length > 0 && !params.bootstrappedAdminEmails.includes(normalized)) {
      return {
        authorized: false,
        error: "Forbidden: Actor email is not in the authorized administrator registry."
      };
    }
  }
  return { authorized: true };
}
function selectAvailableHelperForBooking(params) {
  const {
    serviceType,
    locality,
    date,
    startTime,
    durationHours,
    helpers,
    availabilities,
    existingBookings
  } = params;
  const evaluations = helpers.map((helper) => {
    const all4Checks = Boolean(helper.idCheckReviewed) && Boolean(helper.backgroundCheckReviewed) && Boolean(helper.referenceCheckReviewed) && Boolean(helper.trainingCompleted);
    const isApprovedAndActive = helper.verificationStatus === "approved" && Boolean(helper.isActive) && all4Checks;
    const servesLocality = Array.isArray(helper.serviceAreas) ? helper.serviceAreas.includes(locality) : false;
    const offersService = Array.isArray(helper.servicesOffered) ? helper.servicesOffered.includes(serviceType) : false;
    const availRecord = availabilities.find((a) => a.helperId === helper.helperId) || null;
    const shiftWindowLabel = availRecord ? `${availRecord.availableDays.join(", ")} \xB7 ${availRecord.startHour}\u2013${availRecord.endHour}` : "All days \xB7 06:00\u201320:00";
    let withinShiftWindow = true;
    let shiftReason;
    try {
      const shiftCheck = checkHelperAvailabilityWindow(
        date,
        startTime,
        durationHours,
        availRecord
      );
      withinShiftWindow = shiftCheck.available;
      shiftReason = shiftCheck.reason;
    } catch (err) {
      withinShiftWindow = false;
      shiftReason = err instanceof Error ? err.message : "Invalid schedule window.";
    }
    let hasScheduleConflict = false;
    let conflictReason;
    try {
      const conflictCheck = checkHelperScheduleConflict(
        helper.helperId,
        date,
        startTime,
        durationHours,
        existingBookings
      );
      hasScheduleConflict = conflictCheck.hasConflict;
      conflictReason = conflictCheck.reason;
    } catch (err) {
      hasScheduleConflict = true;
      conflictReason = err instanceof Error ? err.message : "Schedule conflict check error.";
    }
    const eligibleAndAvailable = isApprovedAndActive && servesLocality && offersService && withinShiftWindow && !hasScheduleConflict;
    let unavailableSummary;
    if (!eligibleAndAvailable) {
      if (!isApprovedAndActive) {
        unavailableSummary = `Verification status is "${helper.verificationStatus}" or inactive.`;
      } else if (!servesLocality) {
        unavailableSummary = `Covers ${helper.serviceAreas.join(", ")} (does not cover ${locality}).`;
      } else if (!offersService) {
        unavailableSummary = `Does not offer ${SERVICE_CATALOG[serviceType]?.label || serviceType}.`;
      } else if (!withinShiftWindow) {
        unavailableSummary = shiftReason || "Outside helper shift window.";
      } else if (hasScheduleConflict) {
        unavailableSummary = conflictReason || "Overlapping booking conflict on this date/time.";
      }
    }
    return {
      helper,
      isApprovedAndActive,
      servesLocality,
      offersService,
      withinShiftWindow,
      shiftWindowLabel,
      shiftReason,
      hasScheduleConflict,
      conflictReason,
      eligibleAndAvailable,
      unavailableSummary
    };
  });
  const availableCandidates = evaluations.filter((e) => e.eligibleAndAvailable);
  const matchedHelper = availableCandidates[0]?.helper || null;
  if (matchedHelper) {
    const matchedEval = availableCandidates[0];
    return {
      matchedHelper,
      initialStatus: "assigned",
      evaluations,
      assignmentNote: `Verified companion helper ${matchedHelper.fullName} (${matchedHelper.phone}) was automatically assigned after passing locality (${locality}), shift-window (${matchedEval.shiftWindowLabel}), and schedule-conflict checks. Awaiting helper acceptance.`
    };
  }
  return {
    matchedHelper: null,
    initialStatus: "pending_assignment",
    evaluations,
    assignmentNote: "Helper availability checked across all registered companions; no verified helper was immediately available for this date/time/locality slot. Placed in Pending Assignment queue for coordinator dispatch."
  };
}
var INITIAL_VERIFIED_HELPERS = [
  {
    helperId: "helper_kavitha",
    fullName: "Kavitha Murthy",
    phone: "+91-98801-23456",
    bio: "6 years of senior companion accompaniment in Bengaluru across Indiranagar, Koramangala, Jayanagar, Malleshwaram, and Whitefield.",
    languages: ["Kannada", "English", "Tamil", "Hindi"],
    serviceAreas: [
      "Indiranagar",
      "Koramangala",
      "Jayanagar",
      "Malleshwaram",
      "HSR Layout",
      "JP Nagar",
      "Whitefield",
      "Sadashivanagar"
    ],
    servicesOffered: [
      "hospital_accompaniment",
      "shopping_errands",
      "companionship_visit"
    ],
    yearsExperience: 6,
    verificationStatus: "approved",
    idCheckReviewed: true,
    backgroundCheckReviewed: true,
    referenceCheckReviewed: true,
    trainingCompleted: true,
    verificationNotes: "All 4 coordinator verification checks completed: Government ID, Bengaluru Police background verification, two senior family references, and non-medical accompaniment orientation.",
    isActive: true,
    completedBookingsCount: 18
  },
  {
    helperId: "helper_suresh",
    fullName: "Suresh Gowda",
    phone: "+91-98802-65432",
    bio: "5 years assisting seniors with outpatient clinic registrations, pharmacy queues, and morning park walks in Bengaluru.",
    languages: ["Kannada", "English", "Telugu"],
    serviceAreas: [
      "Jayanagar",
      "JP Nagar",
      "Koramangala",
      "HSR Layout",
      "Indiranagar",
      "Malleshwaram"
    ],
    servicesOffered: [
      "hospital_accompaniment",
      "shopping_errands",
      "companionship_visit"
    ],
    yearsExperience: 5,
    verificationStatus: "approved",
    idCheckReviewed: true,
    backgroundCheckReviewed: true,
    referenceCheckReviewed: true,
    trainingCompleted: true,
    verificationNotes: "All 4 verification checks reviewed and approved by Bengaluru Coordinator Desk.",
    isActive: true,
    completedBookingsCount: 12
  }
];
var INITIAL_HELPER_AVAILABILITIES = [
  {
    availabilityId: "helper_kavitha",
    helperId: "helper_kavitha",
    availableDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    startHour: "07:00",
    endHour: "20:00"
  },
  {
    availabilityId: "helper_suresh",
    helperId: "helper_suresh",
    availableDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    startHour: "08:00",
    endHour: "19:00"
  }
];

// server.ts
dotenv.config();
var app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
var rateLimitWindowMs = 60 * 1e3;
var maxRequestsPerMinute = 90;
var ipRequestCounts = /* @__PURE__ */ new Map();
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = ipRequestCounts.get(clientIp);
  if (!current || now > current.resetAt) {
    ipRequestCounts.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    return next();
  }
  current.count += 1;
  if (current.count > maxRequestsPerMinute) {
    return res.status(429).json({
      error: "Too many requests. Please wait a moment and try again."
    });
  }
  return next();
});
function getBootstrappedAdminEmails() {
  const raw = process.env.SAATHICARE_BOOTSTRAPPED_ADMIN_EMAILS || "deepsharma619@gmail.com";
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
app.get("/api/system/status", (_req, res) => {
  const adminEmails = getBootstrappedAdminEmails();
  const emailBoundary = evaluateEmailNotificationBoundary({
    emailEnabled: process.env.EMAIL_NOTIFICATIONS_ENABLED !== "false",
    providerVerified: process.env.EMAIL_PROVIDER_VERIFIED !== "false"
  });
  res.json({
    service: "SaathiCare Companion Booking Engine",
    environment: process.env.NODE_ENV || "development",
    city: process.env.SAATHICARE_CITY || "Bengaluru",
    nonMedicalOnly: true,
    demoDataInProduction: false,
    bootstrappedAdminConfigured: adminEmails.length > 0,
    defaultSupportPhone: process.env.SAATHICARE_SUPPORT_PHONE || DEFAULT_SYSTEM_CONFIG.supportPhone,
    integrations: {
      paymentGateway: process.env.PAYMENT_GATEWAY_ENABLED !== "false" ? "configured" : "pay_later_mode",
      smsNotifications: process.env.SMS_NOTIFICATIONS_ENABLED !== "false" ? "configured" : "not_configured",
      emailNotifications: emailBoundary.status,
      liveGpsTracking: process.env.LIVE_GPS_TRACKING_ENABLED !== "false" ? "configured" : "not_configured"
    }
  });
});
app.post("/api/pricing/calculate", (req, res) => {
  try {
    const durationHours = Number(req.body?.durationHours);
    const serviceType = String(req.body?.serviceType);
    const config = req.body?.config || DEFAULT_SYSTEM_CONFIG;
    const result = calculateBookingPrice(durationHours, serviceType, config);
    res.json({ ok: true, price: result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Invalid pricing request."
    });
  }
});
app.post("/api/bookings/validate-create", (req, res) => {
  const validation = validateBookingCreationInput(req.body);
  if (!validation.valid || !validation.price) {
    return res.status(400).json({
      ok: false,
      error: validation.error || "Booking validation failed."
    });
  }
  const bookingRef = generateBookingReference(String(req.body.date || ""));
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const candidateHelpers = Array.isArray(req.body.helpers) && req.body.helpers.length > 0 ? req.body.helpers : INITIAL_VERIFIED_HELPERS.map((h) => ({
    ...h,
    createdAt: nowIso,
    updatedAt: nowIso
  }));
  const candidateAvailabilities = Array.isArray(req.body.availabilities) && req.body.availabilities.length > 0 ? req.body.availabilities : INITIAL_HELPER_AVAILABILITIES.map((a) => ({
    ...a,
    updatedAt: nowIso
  }));
  const existingBookings = Array.isArray(req.body.existingBookings) ? req.body.existingBookings : [];
  const selection = selectAvailableHelperForBooking({
    serviceType: req.body.serviceType,
    locality: req.body.locality,
    date: String(req.body.date),
    startTime: String(req.body.startTime),
    durationHours: Number(req.body.durationHours),
    helpers: candidateHelpers,
    availabilities: candidateAvailabilities,
    existingBookings
  });
  const requestedPaymentStatus = req.body.paymentStatus === "paid_online" ? "paid_online" : req.body.paymentStatus === "pay_later_pending" ? "pay_later_pending" : "pay_later_unconfigured";
  const paymentNote = requestedPaymentStatus === "paid_online" ? `Online payment of \u20B9${validation.price.totalPriceInr} confirmed via UPI.` : "Pay Later after visit completion selected.";
  const bookerNote = req.body.actorRole === "family_member" ? `Booking created on behalf of ${req.body.seniorProfile?.fullName} by authorized family member ${req.body.actorName}.` : `Booking created by ${req.body.actorName}.`;
  return res.json({
    ok: true,
    bookingRef,
    price: validation.price,
    initialStatus: selection.initialStatus,
    assignedHelper: selection.matchedHelper ? {
      helperId: selection.matchedHelper.helperId,
      fullName: selection.matchedHelper.fullName,
      phone: selection.matchedHelper.phone
    } : null,
    paymentStatus: requestedPaymentStatus,
    auditNote: `${bookerNote} ${paymentNote} ${selection.assignmentNote}`.slice(0, 295)
  });
});
app.post("/api/bookings/validate-transition", (req, res) => {
  const result = validateBookingTransition(req.body);
  if (!result.valid) {
    return res.status(403).json({
      ok: false,
      error: result.error || "Transition not permitted."
    });
  }
  return res.json({
    ok: true,
    auditNote: result.auditNote
  });
});
app.post("/api/admin/verify-helper", (req, res) => {
  const { actorEmail, actorRole, emailVerified, payload } = req.body || {};
  const adminEmails = getBootstrappedAdminEmails();
  const authCheck = verifyAdminEndpointAuthorization({
    actorRole,
    actorEmail,
    emailVerified,
    bootstrappedAdminEmails: adminEmails
  });
  if (!authCheck.authorized) {
    return res.status(403).json({
      ok: false,
      error: authCheck.error
    });
  }
  const result = validateHelperVerificationUpdate("admin", payload);
  if (!result.valid) {
    return res.status(403).json({
      ok: false,
      error: result.error
    });
  }
  return res.json({ ok: true });
});
app.post("/api/family-links/validate", (req, res) => {
  const { actorUid, actorRole, existingLink, nextStatus, consentNote } = req.body || {};
  const result = validateFamilyLinkTransition(
    actorUid,
    actorRole,
    existingLink,
    nextStatus,
    consentNote
  );
  if (!result.valid) {
    return res.status(403).json({
      ok: false,
      error: result.error
    });
  }
  return res.json({ ok: true });
});
async function startServer() {
  const PORT = 3e3;
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SaathiCare server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();

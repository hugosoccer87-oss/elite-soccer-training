import { getTrainingGroup, type BookingRecord } from "@/lib/booking-data";
import {
  createBookingCalendarEvent,
  recordCalendarEventCreationFailure,
  type CalendarBookingResult
} from "@/lib/google-calendar";
import {
  confirmPaidLaunchPassPurchase,
  getBookingEmailDeliverySummary,
  getPassPurchaseById,
  listCreditRedemptionsForPass,
  logEmailStatus,
  markBookingPaidAndSaveWaiver,
  redeemLaunchPassCreditAndSaveWaiver,
  saveBookingCalendarSyncStatus,
  saveCalendarEventRecord
} from "@/lib/supabase-db";
import type { PassPurchaseRow } from "@/lib/supabase-db";
import {
  sendBookingTransactionalEmails,
  sendLaunchPassTransactionalEmails
} from "@/lib/transactional-email";
import {
  sendBookingAdminPushoverAlert,
  sendLaunchPassAdminPushoverAlert
} from "@/lib/pushover";

export async function finalizeConfirmedBooking(
  booking: BookingRecord,
  options: {
    sendEmails?: boolean;
    forceEmails?: boolean;
    syncCalendar?: boolean;
    sendAdminAlert?: boolean;
    adminAlertSource?: string;
  } = {}
) {
  console.info("[EST Booking] Confirmed booking finalization started", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    sessionDateIso: booking.sessionDateIso,
    sessionDate: booking.sessionDate,
    sessionTime: booking.sessionTime,
    paymentStatus: booking.paymentStatus,
    paymentType: booking.paymentType || "single_session"
  });

  let calendarResult: CalendarBookingResult = {
    status: "Ready",
    message: "Calendar sync not attempted."
  };

  if (options.syncCalendar !== false) {
    try {
      calendarResult = await createBookingCalendarEvent(booking);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Calendar event creation failed.";
      console.error("[EST Calendar] Calendar event creation failed", {
        bookingId: booking.id,
        reason: message
      });
      recordCalendarEventCreationFailure(booking.id, message);
      calendarResult = {
        status: "Failed",
        message
      };
    }

    if (calendarResult.status !== "Created") {
      console.error("[EST Booking] Paid booking calendar confirmation failed", {
        bookingId: booking.id,
        calendarStatus: calendarResult.status,
        calendarMessage: calendarResult.message
      });
    }

    try {
      await saveBookingCalendarSyncStatus({
        bookingId: booking.id,
        status: calendarResult.status,
        message: calendarResult.message,
        eventId: calendarResult.eventId
      });
    } catch (error) {
      console.error("[EST Calendar] Calendar sync status could not be saved", {
        bookingId: booking.id,
        error: error instanceof Error ? error.message : String(error)
      });
      try {
        await saveCalendarEventRecord(booking.id, calendarResult.eventId);
      } catch (fallbackError) {
        console.error("[EST Calendar] Calendar event ID could not be saved", {
          bookingId: booking.id,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }
  }

  const confirmedBooking: BookingRecord = {
    ...booking,
    calendarStatus: calendarResult.status,
    calendarMessage: calendarResult.message,
    calendarEventId: calendarResult.eventId,
    calendarEventUrl: calendarResult.eventUrl,
    paymentStatus: "Paid"
  };

  console.info("[EST Stripe] Booking confirmed", {
    bookingId: booking.id,
    calendarEventId: calendarResult.eventId,
    calendarStatus: calendarResult.status,
    calendarAlreadyExists: Boolean(calendarResult.alreadyExists)
  });

  const shouldSendEmails = options.sendEmails !== false;
  const emailDeliverySummary = shouldSendEmails ? await getBookingEmailDeliverySummary(booking.id) : null;
  const emailsAlreadySent = Boolean(emailDeliverySummary?.customerSent && emailDeliverySummary.adminSent);
  const emailResult = !shouldSendEmails || (emailsAlreadySent && !options.forceEmails)
    ? null
    : await (async () => {
        console.info("[EST Stripe] Starting email notifications", {
          bookingId: booking.id,
          forceEmails: Boolean(options.forceEmails)
        });
        const result = await sendBookingTransactionalEmails(confirmedBooking);
        await Promise.allSettled([
          logEmailStatus({
            bookingId: booking.id,
            emailType: "customer",
            recipient: confirmedBooking.email,
            status: result.customerSent ? "sent" : "failed",
            errorMessage: result.customerSent ? undefined : result.message
          }),
          logEmailStatus({
            bookingId: booking.id,
            emailType: "admin",
            recipient: "info@elitesoccertrainingcv.com",
            status: result.adminSent ? "sent" : "failed",
            errorMessage: result.adminSent ? undefined : result.message
          })
        ]);
        console.info("[EST Stripe] Email notifications complete", {
          bookingId: booking.id,
          sent: result.sent,
          customerSent: result.customerSent,
          adminSent: result.adminSent,
          message: result.message
        });
        return result;
      })();

  if (!shouldSendEmails) {
    console.info("[EST Stripe] Email notifications complete", {
      bookingId: booking.id,
      skipped: true,
      reason: "Admin chose not to send confirmation email"
    });
  } else if (emailsAlreadySent && !options.forceEmails) {
    console.info("[EST Stripe] Email notifications complete", {
      bookingId: booking.id,
      skipped: true,
      reason: "Customer and admin confirmation emails already show sent in email logs"
    });
  }

  const shouldSendAdminAlert = options.sendAdminAlert !== false;
  const pushoverResult = shouldSendAdminAlert
    ? await sendBookingAdminPushoverAlert(confirmedBooking, {
        source: options.adminAlertSource
      }).catch((error) => {
        console.error("[EST Pushover] Booking admin alert failed unexpectedly", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          sent: false,
          skipped: false,
          message: error instanceof Error ? error.message : "Pushover alert failed."
        };
      })
    : null;

  if (!shouldSendAdminAlert) {
    console.info("[EST Pushover] Booking admin alert skipped by options", {
      bookingId: booking.id
    });
  }

  return {
    booking: {
      ...confirmedBooking,
      notificationStatus: emailResult?.sent
        ? "Sent"
        : emailResult
          ? emailResult.message?.includes("email configuration is missing")
            ? "Email service not configured"
            : "Email delivery needs attention"
          : confirmedBooking.notificationStatus
    },
    calendarResult,
    emailResult,
    pushoverResult
  };
}

export async function confirmPaidBooking(
  booking: BookingRecord,
  payment: {
    checkoutSessionId?: string;
    paymentIntentId?: string;
    amountPaid?: number;
  } = {},
  options: {
    sendAdminAlert?: boolean;
    adminAlertSource?: string;
  } = {}
) {
  console.info("[EST Booking] Paid booking confirmation started", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    sessionDateIso: booking.sessionDateIso,
    sessionDate: booking.sessionDate,
    sessionTime: booking.sessionTime,
    paymentStatus: booking.paymentStatus
  });

  await markBookingPaidAndSaveWaiver(booking, payment);

  return finalizeConfirmedBooking({
    ...booking,
    paymentType: "single_session",
    paymentStatus: "Paid"
  }, {
    sendAdminAlert: options.sendAdminAlert,
    adminAlertSource: options.adminAlertSource
  });
}

export async function confirmLaunchPassCreditBooking(booking: BookingRecord) {
  console.info("[EST Booking] Training credit booking confirmation started", {
    bookingId: booking.id,
    passPurchaseId: booking.passPurchaseId,
    creditRedemptionId: booking.creditRedemptionId,
    remainingCreditsAfter: booking.remainingCreditsAfter
  });

  return finalizeConfirmedBooking({
    ...booking,
    paymentType: "launch_pass_credit",
    paymentStatus: "Paid"
  });
}

function launchPassSelectedSessionBooking(pass: PassPurchaseRow, sessionId: string): BookingRecord {
  const details = pass.booking_details ?? {};
  const signedAt = details.waiverAcceptedAt || new Date().toISOString();
  const group = getTrainingGroup(pass.training_group);

  return {
    id: `PASS-${pass.id.replaceAll("-", "").slice(-8).toUpperCase()}-${Date.now().toString().slice(-5)}`,
    createdAt: signedAt,
    parentName: pass.parent_name,
    playerName: pass.player_name,
    playerAge: pass.player_age,
    phone: pass.parent_phone,
    email: pass.parent_email,
    players: "1",
    notes: details.notes || "",
    medicalNotes: details.medicalNotes || "",
    emergencyName: details.emergencyName || "",
    emergencyPhone: details.emergencyPhone || "",
    guardianSignature: details.guardianSignature || pass.parent_name,
    waiverAccepted: Boolean(details.waiverAccepted),
    waiverAcceptedAt: signedAt,
    waiverVersion: details.waiverVersion || "",
    ipAddress: details.ipAddress || "",
    mediaConsent: details.mediaConsent === "Declined" ? "Declined" : "Granted",
    programId: pass.training_group,
    programName: group.name,
    sessionId,
    sessionDateIso: "",
    sessionDate: "",
    sessionTime: "",
    sessionDurationMinutes: 60,
    paymentStatus: "Paid",
    notificationStatus: "Ready",
    calendarStatus: "Ready",
    paymentType: "launch_pass_credit",
    passPurchaseId: pass.id
  };
}

async function redeemSelectedLaunchPassSessions(pass: PassPurchaseRow) {
  const selectedSessionIds = Array.from(new Set(pass.selected_session_ids ?? []));

  if (selectedSessionIds.length === 0) {
    return [];
  }

  console.info("[EST Pass] Redeeming sessions selected at Training Package purchase", {
    passPurchaseId: pass.id,
    selectedSessionCount: selectedSessionIds.length
  });

  const existingRedemptions = await listCreditRedemptionsForPass(pass.id);
  const alreadyRedeemedSessionIds = new Set(existingRedemptions.map((redemption) => redemption.session_id));
  const results: Array<{
    sessionId: string;
    bookingId?: string;
    status: "confirmed" | "skipped" | "failed";
    message?: string;
  }> = [];

  for (const sessionId of selectedSessionIds) {
    if (alreadyRedeemedSessionIds.has(sessionId)) {
      results.push({
        sessionId,
        status: "skipped",
        message: "Session was already redeemed for this Training Package."
      });
      continue;
    }

    try {
      const booking = await redeemLaunchPassCreditAndSaveWaiver(
        launchPassSelectedSessionBooking(pass, sessionId),
        pass.id,
        pass.booking_details?.ipAddress || ""
      );
      const confirmation = await confirmLaunchPassCreditBooking(booking);

      results.push({
        sessionId,
        bookingId: confirmation.booking.id,
        status: "confirmed"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.error("[EST Pass] Selected Training Package session could not be booked", {
        passPurchaseId: pass.id,
        sessionId,
        error: message
      });
      results.push({
        sessionId,
        status: "failed",
        message
      });
    }
  }

  console.info("[EST Pass] Selected Training Package session redemption complete", {
    passPurchaseId: pass.id,
    confirmed: results.filter((result) => result.status === "confirmed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length
  });

  return results;
}

export async function confirmLaunchPassPurchase(input: {
  passPurchaseId: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  amountPaid?: number;
}) {
  console.info("[EST Stripe] Confirming Training Package purchase", {
    passPurchaseId: input.passPurchaseId,
    checkoutSessionId: input.checkoutSessionId
  });
  const pass = await confirmPaidLaunchPassPurchase(input);
  const selectedSessionResults = await redeemSelectedLaunchPassSessions(pass);
  const updatedPass = selectedSessionResults.length > 0 ? (await getPassPurchaseById(pass.id)) ?? pass : pass;

  try {
    console.info("[EST Stripe] Starting Training Package email notifications", {
      passPurchaseId: updatedPass.id
    });
    const result = await sendLaunchPassTransactionalEmails(updatedPass);
    console.info("[EST Stripe] Training Package email notifications complete", {
      passPurchaseId: updatedPass.id,
      sent: result.sent,
      customerSent: result.customerSent,
      adminSent: result.adminSent,
      message: result.message
    });

    const pushoverResult = await sendLaunchPassAdminPushoverAlert(updatedPass).catch((error) => {
      console.error("[EST Pushover] Training Package admin alert failed unexpectedly", {
        passPurchaseId: updatedPass.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        sent: false,
        skipped: false,
        message: error instanceof Error ? error.message : "Pushover alert failed."
      };
    });

    return {
      pass: updatedPass,
      selectedSessionResults,
      emailResult: result,
      pushoverResult
    };
  } catch (error) {
    console.error("[EST Email] Training Package email flow failed:", {
      passPurchaseId: updatedPass.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      pass: updatedPass,
      selectedSessionResults,
      emailResult: {
        sent: false,
        customerSent: false,
        adminSent: false,
        message: error instanceof Error ? error.message : "Training Package emails failed."
      },
      pushoverResult: await sendLaunchPassAdminPushoverAlert(updatedPass).catch((pushoverError) => ({
        sent: false,
        skipped: false,
        message: pushoverError instanceof Error ? pushoverError.message : "Pushover alert failed."
      }))
    };
  }
}

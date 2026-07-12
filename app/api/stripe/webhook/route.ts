import { NextResponse } from "next/server";
import { confirmLaunchPassPurchase, confirmPaidBooking } from "@/lib/booking-confirmation";
import { setLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import {
  bookingFromStripeMetadata,
  customPaymentLinkIdFromStripeMetadata,
  directPaymentIdFromStripeMetadata,
  getStripeEnvironmentDiagnostics,
  isStripePaymentVerified,
  passPurchaseIdFromStripeMetadata,
  verifyStripeWebhookSignature
} from "@/lib/stripe";
import {
  bookPrivateSessionAvailability,
  confirmCustomPaymentLinkPaid,
  getBookingRecordForConfirmation,
  getCustomPaymentLinkById,
  markDirectPaymentPaid,
  updatePrivateSessionAvailability
} from "@/lib/supabase-db";
import {
  sendCustomPaymentLinkTransactionalEmails,
  sendDirectPaymentTransactionalEmails,
  sendPrivateSessionAvailabilityTransactionalEmails
} from "@/lib/transactional-email";
import { sendCustomPaymentLinkAdminPushoverAlert, sendPrivateSessionAvailabilityAdminPushoverAlert } from "@/lib/pushover";
import { syncBookedPrivateSessionCalendarEvent } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const event = verifyStripeWebhookSignature(payload, signature);
    const stripeDiagnostics = getStripeEnvironmentDiagnostics();

    console.info("[EST Stripe] Webhook received", {
      eventId: event.id,
      eventType: event.type,
      stripeMode: stripeDiagnostics.stripeMode
    });

    if (event.type === "checkout.session.completed") {
      console.info("[EST Stripe] checkout.session.completed received", {
        eventId: event.id,
        sessionId: event.data.object.id
      });

      const session = event.data.object;
      const directPaymentId = directPaymentIdFromStripeMetadata(session.metadata);

      if (directPaymentId) {
        if (!isStripePaymentVerified(session)) {
          console.warn("[EST Stripe] Payment not verified", {
            eventId: event.id,
            sessionId: session.id,
            directPaymentId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status
          });
          setLastPaymentVerificationResult({
            source: "webhook",
            verified: false,
            sessionId: session.id,
            bookingId: directPaymentId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status,
            message: "Direct payment Checkout session was not paid and complete."
          });
          return NextResponse.json({ received: true });
        }

        const directPayment = await markDirectPaymentPaid({
          directPaymentId,
          checkoutSessionId: session.id,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
        });

        console.info("[EST Stripe] Direct payment confirmed", {
          eventId: event.id,
          sessionId: session.id,
          directPaymentId,
          status: directPayment.status,
          wasAlreadyPaid: directPayment.wasAlreadyPaid
        });
        const emailResult = directPayment.wasAlreadyPaid
          ? {
              sent: false,
              customerSent: false,
              adminSent: false,
              message: "Direct payment emails were already handled for this paid record."
            }
          : await sendDirectPaymentTransactionalEmails(directPayment);

        console.info("[EST Stripe] Direct payment email notifications complete", {
          eventId: event.id,
          sessionId: session.id,
          directPaymentId,
          emailSent: emailResult.sent,
          skippedDuplicate: directPayment.wasAlreadyPaid
        });
        setLastPaymentVerificationResult({
          source: "webhook",
          verified: true,
          sessionId: session.id,
          bookingId: directPaymentId,
          sessionStatus: session.status,
          paymentStatus: session.payment_status,
          message: "Direct Pay + Waiver payment verified."
        });

        return NextResponse.json({ received: true });
      }

      const customPaymentLinkId = customPaymentLinkIdFromStripeMetadata(session.metadata);

      if (customPaymentLinkId) {
        if (!isStripePaymentVerified(session)) {
          console.warn("[EST Stripe] Payment not verified", {
            eventId: event.id,
            sessionId: session.id,
            customPaymentLinkId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status
          });
          setLastPaymentVerificationResult({
            source: "webhook",
            verified: false,
            sessionId: session.id,
            bookingId: customPaymentLinkId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status,
            message: "Custom payment link Checkout session was not paid and complete."
          });
          return NextResponse.json({ received: true });
        }

        console.info("[EST Stripe] Payment verified", {
          eventId: event.id,
          sessionId: session.id,
          customPaymentLinkId,
          purchaseType: "custom_payment_link"
        });

        const metadata = session.metadata ?? {};
        const customDetails = await getCustomPaymentLinkById(customPaymentLinkId);

        if (!customDetails) {
          throw new Error(`Custom payment link ${customPaymentLinkId} was not found.`);
        }

        if (
          customDetails.link.link_mode === "payment_plus_choose_private_sessions" &&
          customDetails.link.selected_private_session_ids.length > 0
        ) {
          const bookedPrivateSessions = [];
          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : undefined;
          const amountPerPrivateSession = Math.round(
            (typeof session.amount_total === "number" ? session.amount_total : customDetails.link.amount_cents) /
              Math.max(1, customDetails.link.selected_private_session_ids.length)
          );

          for (const privateSessionId of customDetails.link.selected_private_session_ids) {
            const bookedPrivateSession = await bookPrivateSessionAvailability({
              privateSessionId,
              customPaymentLinkId,
              playerName: customDetails.link.player_name,
              playerAge: customDetails.link.player_age,
              parentName: customDetails.link.parent_name,
              parentEmail: customDetails.link.parent_email,
              parentPhone: customDetails.link.parent_phone,
              paymentMethod: "card",
              paymentStatus: "paid",
              checkoutSessionId: session.id,
              paymentIntentId,
              amountPaid: amountPerPrivateSession,
              waiverSigned: Boolean(customDetails.link.waiver_signed),
              typedSignature: customDetails.link.typed_signature || "",
              signedAt: customDetails.link.signed_at || new Date().toISOString(),
              waiverVersion: customDetails.link.waiver_version || undefined,
              mediaConsent: customDetails.link.media_consent || undefined,
              emergencyName: customDetails.link.emergency_name || "",
              emergencyPhone: customDetails.link.emergency_phone || "",
              medicalNotes: customDetails.link.medical_notes || "",
              ipAddress: customDetails.link.ip_address || ""
            });

            const calendarResult = await syncBookedPrivateSessionCalendarEvent(bookedPrivateSession);
            const withCalendarStatus = await updatePrivateSessionAvailability(bookedPrivateSession.id, {
              google_calendar_event_id: calendarResult.eventId || bookedPrivateSession.google_calendar_event_id || null,
              calendar_status: calendarResult.status,
              calendar_message: calendarResult.message || null
            }) ?? bookedPrivateSession;
            const emailResult = await sendPrivateSessionAvailabilityTransactionalEmails(withCalendarStatus);
            const withEmailStatus = await updatePrivateSessionAvailability(withCalendarStatus.id, {
              email_status: emailResult.sent ? "sent" : "failed",
              email_message: emailResult.message || null
            }) ?? withCalendarStatus;
            const pushoverResult = await sendPrivateSessionAvailabilityAdminPushoverAlert(withEmailStatus);
            const finalPrivateSession = await updatePrivateSessionAvailability(withEmailStatus.id, {
              pushover_status: pushoverResult.sent ? "sent" : pushoverResult.skipped ? "skipped" : "failed",
              pushover_message: pushoverResult.message || null
            }) ?? withEmailStatus;

            bookedPrivateSessions.push(finalPrivateSession);
          }

          await confirmCustomPaymentLinkPaid({
            customPaymentLinkId,
            checkoutSessionId: session.id,
            paymentIntentId,
            paymentStatus: "paid",
            selectedPrivateSessionIds: bookedPrivateSessions.map((item) => item.id),
            creditsUsed: bookedPrivateSessions.length,
            creditsRemaining: Math.max(0, Number(customDetails.link.total_credits || 0) - bookedPrivateSessions.length)
          });

          console.info("[EST Stripe] Custom private session payment notifications complete", {
            eventId: event.id,
            sessionId: session.id,
            customPaymentLinkId,
            privateSessionsBooked: bookedPrivateSessions.length
          });

          return NextResponse.json({ received: true });
        }

        const customPassPurchaseId = metadata.passPurchaseId;
        const customBookingId = metadata.bookingId;

        if (customPassPurchaseId) {
          const result = await confirmLaunchPassPurchase({
            passPurchaseId: customPassPurchaseId,
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
            amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
          });
          const confirmedBookingIds = result.selectedSessionResults
            .map((item) => item.bookingId)
            .filter((id): id is string => Boolean(id));

          await confirmCustomPaymentLinkPaid({
            customPaymentLinkId,
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
            paymentStatus: "paid",
            passPurchaseId: result.pass.id,
            bookingIds: confirmedBookingIds,
            selectedSessionIds: customDetails.link.selected_session_ids,
            creditsUsed: Math.max(0, Number(result.pass.total_credits) - Number(result.pass.remaining_credits)),
            creditsRemaining: result.pass.remaining_credits
          });

          console.info("[EST Stripe] Custom payment link Training Package confirmed", {
            eventId: event.id,
            sessionId: session.id,
            customPaymentLinkId,
            passPurchaseId: result.pass.id,
            selectedBookings: confirmedBookingIds.length
          });
          return NextResponse.json({ received: true });
        }

        if (customBookingId) {
          const booking = await getBookingRecordForConfirmation(customBookingId);
          const result = await confirmPaidBooking(
            booking,
            {
              checkoutSessionId: session.id,
              paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
              amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
            },
            {
              adminAlertSource: "custom_payment_link_single_session"
            }
          );

          await confirmCustomPaymentLinkPaid({
            customPaymentLinkId,
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
            paymentStatus: "paid",
            bookingIds: [customBookingId],
            selectedSessionIds: customDetails.link.selected_session_ids,
            creditsUsed: 1,
            creditsRemaining: 0
          });

          console.info("[EST Stripe] Custom payment link single booking confirmed", {
            eventId: event.id,
            sessionId: session.id,
            customPaymentLinkId,
            bookingId: customBookingId,
            calendarStatus: result.calendarResult.status
          });
          return NextResponse.json({ received: true });
        }

        const updatedLink = await confirmCustomPaymentLinkPaid({
          customPaymentLinkId,
          checkoutSessionId: session.id,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          paymentStatus: "paid",
          creditsUsed: 0,
          creditsRemaining: customDetails.link.total_credits
        });

        if (updatedLink) {
          const [emailResult, pushoverResult] = await Promise.allSettled([
            sendCustomPaymentLinkTransactionalEmails(updatedLink),
            sendCustomPaymentLinkAdminPushoverAlert(updatedLink)
          ]);

          console.info("[EST Stripe] Custom payment link notifications complete", {
            eventId: event.id,
            sessionId: session.id,
            customPaymentLinkId,
            emailSent: emailResult.status === "fulfilled" ? emailResult.value.sent : false,
            pushoverSent: pushoverResult.status === "fulfilled" ? pushoverResult.value.sent : false
          });
        }

        return NextResponse.json({ received: true });
      }

      const passPurchaseId = passPurchaseIdFromStripeMetadata(session.metadata);

      if (passPurchaseId) {
        if (!isStripePaymentVerified(session)) {
          console.warn("[EST Stripe] Payment not verified", {
            eventId: event.id,
            sessionId: session.id,
            passPurchaseId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status
          });
          setLastPaymentVerificationResult({
            source: "webhook",
            verified: false,
            sessionId: session.id,
            bookingId: passPurchaseId,
            sessionStatus: session.status,
            paymentStatus: session.payment_status,
            message: "Training Package Checkout session was not paid and complete."
          });
          return NextResponse.json({ received: true });
        }

        console.info("[EST Stripe] Payment verified", {
          eventId: event.id,
          sessionId: session.id,
          passPurchaseId,
          purchaseType: "launch_pass"
        });
        setLastPaymentVerificationResult({
          source: "webhook",
          verified: true,
          sessionId: session.id,
          bookingId: passPurchaseId,
          sessionStatus: session.status,
          paymentStatus: session.payment_status,
          message: "Training Package payment verified."
        });

        const result = await confirmLaunchPassPurchase({
          passPurchaseId,
          checkoutSessionId: session.id,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
        });

        console.info("[EST Stripe] Training Package purchase confirmed", {
          eventId: event.id,
          sessionId: session.id,
          passPurchaseId,
          emailSent: result.emailResult.sent
        });

        return NextResponse.json({ received: true });
      }

      const booking = bookingFromStripeMetadata(session.metadata);

      if (!booking) {
        console.warn("[EST Stripe] Payment not verified", {
          eventId: event.id,
          sessionId: session.id,
          reason: "Missing booking metadata"
        });
        setLastPaymentVerificationResult({
          source: "webhook",
          verified: false,
          sessionId: session.id,
          sessionStatus: session.status,
          paymentStatus: session.payment_status,
          message: "Missing booking metadata"
        });
        console.error("[EST Stripe] Checkout completed without booking metadata", {
          eventId: event.id,
          sessionId: session.id
        });
        return NextResponse.json({ received: true });
      }

      if (!isStripePaymentVerified(session)) {
        console.warn("[EST Stripe] Payment not verified", {
          eventId: event.id,
          sessionId: session.id,
          bookingId: booking.id,
          sessionStatus: session.status,
          paymentStatus: session.payment_status
        });
        setLastPaymentVerificationResult({
          source: "webhook",
          verified: false,
          sessionId: session.id,
          bookingId: booking.id,
          sessionStatus: session.status,
          paymentStatus: session.payment_status,
          message: "Checkout session was not paid and complete."
        });
        return NextResponse.json({ received: true });
      }

      console.info("[EST Stripe] Payment verified", {
        eventId: event.id,
        sessionId: session.id,
        bookingId: booking.id
      });
      setLastPaymentVerificationResult({
        source: "webhook",
        verified: true,
        sessionId: session.id,
        bookingId: booking.id,
        sessionStatus: session.status,
        paymentStatus: session.payment_status
      });

      const result = await confirmPaidBooking(booking, {
        checkoutSessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
        amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
      });

      console.info("[EST Stripe] Booking confirmed", {
        eventId: event.id,
        sessionId: session.id,
        bookingId: booking.id,
        calendarStatus: result.calendarResult.status,
        calendarEventId: result.calendarResult.eventId
      });

      console.info("[EST Stripe] Paid booking processed", {
        eventId: event.id,
        sessionId: session.id,
        bookingId: booking.id,
        calendarStatus: result.calendarResult.status,
        calendarEventId: result.calendarResult.eventId,
        emailSent: result.emailResult?.sent ?? false
      });
    }

    if (event.type === "checkout.session.expired") {
      console.warn("[EST Stripe] Payment not verified", {
        eventId: event.id,
        sessionId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId,
        reason: "Checkout session expired"
      });
      setLastPaymentVerificationResult({
        source: "webhook",
        verified: false,
        sessionId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId,
        sessionStatus: event.data.object.status,
        paymentStatus: event.data.object.payment_status,
        message: "Checkout session expired."
      });
      console.warn("[EST Stripe] Checkout session expired", {
        eventId: event.id,
        sessionId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId
      });
    }

    if (event.type === "payment_intent.payment_failed") {
      console.warn("[EST Stripe] Payment not verified", {
        eventId: event.id,
        paymentIntentId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId,
        reason: "Payment intent failed"
      });
      setLastPaymentVerificationResult({
        source: "webhook",
        verified: false,
        sessionId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId,
        sessionStatus: event.data.object.status,
        paymentStatus: event.data.object.payment_status,
        message: "Payment intent failed."
      });
      console.error("[EST Stripe] Payment failed", {
        eventId: event.id,
        paymentIntentId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("confirm_paid_booking") || message.includes("schema cache")) {
      console.error("[EST Stripe] Supabase confirm_paid_booking RPC failed", {
        error: message,
        fix: "Run supabase/fix-confirm-paid-booking.sql in Supabase SQL Editor, then resend checkout.session.completed from Stripe."
      });

      return NextResponse.json(
        {
          error: "Supabase confirm_paid_booking RPC is missing or unavailable.",
          details: message
        },
        { status: 500 }
      );
    }

    console.error("[EST Stripe] Webhook processing failed", {
      error: message
    });

    return NextResponse.json({ error: "Webhook processing failed." }, { status: 400 });
  }
}

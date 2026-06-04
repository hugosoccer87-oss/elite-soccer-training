const availabilityKey = "est-availability-v3";
const blockedDaysKey = "est-blocked-days-v3";
const bookingsKey = "est-bookings-v1";
const adminAccessKey = "est-admin-access";
const bookingNotificationEmail = "info@elitesoccertrainingcv.com";
const slotCapacity = 6;
const trainingGroups = [
  {
    id: "future-elite",
    name: "Future Elite",
    ages: "Ages 9-12",
    minAge: 9,
    maxAge: 12,
    focus: ["Technical foundation", "First touch", "Ball mastery", "Passing and receiving", "Coordination", "Confidence on the ball"]
  },
  {
    id: "elite-performance",
    name: "Elite Performance",
    ages: "Ages 13-18",
    minAge: 13,
    maxAge: 18,
    focus: ["Speed of play", "Finishing", "Decision making", "Intensity", "Agility", "Game-realistic development"]
  }
];
const defaultSlots = [];
const bookingState = {
  step: "program",
  selectedGroupId: trainingGroups[0].id,
  selectedDate: "",
  selectedSlotId: "",
  confirmedSlot: null,
  confirmedBooking: null,
  notificationStatus: "Ready",
  code: "",
  error: "",
  fields: {
    parentName: "",
    playerName: "",
    playerAge: "",
    phone: "",
    email: "",
    players: "1",
    notes: "",
    medicalNotes: "",
    emergencyName: "",
    emergencyPhone: "",
    waiverAgreement: false,
    guardianSignature: "",
    cardName: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    postalCode: ""
  }
};
const steps = ["program", "session", "details", "waiver", "payment", "confirmed"];
const stepLabels = ["Program", "Session", "Details", "Waiver", "Payment", "Confirmed"];

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function normalizeSlot(slot) {
  const capacity = typeof slot.capacity === "number" && Number.isFinite(slot.capacity) ? Math.min(slot.capacity, slotCapacity) : slotCapacity;
  const rawBookedPlayers = Number.isFinite(slot.bookedPlayers) ? Number(slot.bookedPlayers) : slot.status === "booked" ? capacity : 0;
  const bookedPlayers = Math.min(capacity, Math.max(0, rawBookedPlayers));
  const status = slot.status === "blocked" ? "blocked" : bookedPlayers >= capacity ? "booked" : slot.status;
  const groupId = trainingGroups.some((group) => group.id === slot.groupId) ? slot.groupId : trainingGroups[0].id;
  return { ...slot, groupId, duration: slot.duration || "60 min", capacity, bookedPlayers, status };
}

function getTrainingGroup(groupId) {
  return trainingGroups.find((group) => group.id === groupId) || trainingGroups[0];
}

function ageFitsGroup(age, groupId) {
  const group = getTrainingGroup(groupId);
  return age >= group.minAge && age <= group.maxAge;
}

function remainingSpots(slot) {
  return Math.max(0, slot.capacity - slot.bookedPlayers);
}

function spotsLabel(count) {
  return `${count} ${count === 1 ? "spot" : "spots"} remaining`;
}

function isSlotAvailable(slot, blocked) {
  return slot.status === "open" && !blocked.includes(slot.dateIso) && remainingSpots(slot) > 0;
}

function loadSlots() {
  try {
    const stored = localStorage.getItem(availabilityKey);
    if (stored) {
      const normalized = JSON.parse(stored).map(normalizeSlot);
      localStorage.setItem(availabilityKey, JSON.stringify(normalized));
      return normalized;
    }
  } catch {}
  localStorage.setItem(availabilityKey, JSON.stringify(defaultSlots));
  return defaultSlots;
}

function saveSlots(slots) {
  localStorage.setItem(availabilityKey, JSON.stringify(slots.map(normalizeSlot)));
}

function loadBlockedDays() {
  try {
    return JSON.parse(localStorage.getItem(blockedDaysKey) || "[]");
  } catch {
    return [];
  }
}

function saveBlockedDays(days) {
  localStorage.setItem(blockedDaysKey, JSON.stringify(days));
}

function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(bookingsKey) || "[]");
  } catch {
    return [];
  }
}

function saveBooking(booking) {
  const bookings = [booking, ...loadBookings()];
  localStorage.setItem(bookingsKey, JSON.stringify(bookings));
  return bookings;
}

function openSlots() {
  const blocked = loadBlockedDays();
  return loadSlots().filter((slot) => slot.groupId === bookingState.selectedGroupId && isSlotAvailable(slot, blocked));
}

function selectedSlot() {
  return openSlots().find((slot) => slot.id === bookingState.selectedSlotId);
}

function uniqueDates(slots) {
  const dates = new Map();
  slots.forEach((slot) => {
    if (!dates.has(slot.dateIso)) dates.set(slot.dateIso, slot);
  });
  return [...dates.values()];
}

function setStep(step) {
  bookingState.step = step;
  bookingState.error = "";
  renderBooking();
}

function showError(message) {
  bookingState.error = message;
  renderBooking();
}

function syncFields(panel) {
  panel.querySelectorAll("[data-field]").forEach((field) => {
    const update = (event) => {
      const key = event.currentTarget.dataset.field;
      bookingState.fields[key] = event.currentTarget.type === "checkbox" ? event.currentTarget.checked : event.currentTarget.value;
    };
    field.addEventListener("input", update);
    field.addEventListener("change", update);
  });
}

function detailsComplete() {
  const fields = bookingState.fields;
  const slot = selectedSlot();
  const playerCount = Number(fields.players);
  const playerAge = Number(fields.playerAge);
  return (
    [fields.parentName, fields.playerName, fields.playerAge, fields.phone, fields.email, fields.players].every((value) => String(value).trim()) &&
    slot &&
    Number.isInteger(playerCount) &&
    playerCount >= 1 &&
    playerCount <= remainingSpots(slot) &&
    Number.isInteger(playerAge) &&
    ageFitsGroup(playerAge, bookingState.selectedGroupId)
  );
}

function waiverComplete() {
  const fields = bookingState.fields;
  return fields.emergencyName.trim() && fields.emergencyPhone.trim() && fields.guardianSignature.trim() && fields.waiverAgreement;
}

function renderBooking() {
  const root = document.querySelector("[data-booking-flow]");
  if (!root) return;
  const slots = openSlots();
  const dates = uniqueDates(slots);
  if (!bookingState.selectedDate && dates[0]) bookingState.selectedDate = dates[0].dateIso;
  if (!dates.some((slot) => slot.dateIso === bookingState.selectedDate) && dates[0]) bookingState.selectedDate = dates[0].dateIso;
  const activeIndex = steps.indexOf(bookingState.step);
  const slot = bookingState.step === "confirmed" ? bookingState.confirmedSlot : selectedSlot();
  const group = getTrainingGroup(bookingState.selectedGroupId);
  root.querySelector("[data-selected-slot]").textContent = slot ? `${group.name}: ${slot.dateLabel} at ${slot.time}` : `${group.name} - ${group.ages}`;
  root.querySelector("[data-booking-steps]").innerHTML = stepLabels.map((label, index) => `<span class="${index <= activeIndex ? "active" : ""}">${String(index + 1).padStart(2, "0")} ${label}</span>`).join("");
  const alert = root.querySelector("[data-booking-alert]");
  alert.hidden = !bookingState.error;
  alert.textContent = bookingState.error;
  const panel = root.querySelector("[data-booking-panel]");
  panel.innerHTML = renderPanel();
  wirePanel(panel);
}

function renderPanel() {
  if (bookingState.step === "program") return renderProgramPanel();
  if (bookingState.step === "session") return renderSchedulePanel();
  if (bookingState.step === "details") return renderDetailsPanel();
  if (bookingState.step === "waiver") return renderWaiverPanel();
  if (bookingState.step === "payment") return renderPaymentPanel();
  return renderConfirmedPanel();
}

function renderProgramPanel() {
  return `
    <div class="flow-section">
      <p class="eyebrow">Program</p>
      <h4>Choose the right age group</h4>
      <div class="program-grid">
        ${trainingGroups.map((group) => `
          <button class="${bookingState.selectedGroupId === group.id ? "selected" : ""}" type="button" data-group="${group.id}">
            <small>${group.ages}</small>
            <strong>${group.name}</strong>
            <span>${group.focus.map(escapeHtml).join("</span><span>")}</span>
          </button>
        `).join("")}
      </div>
      <button class="primary-button" type="button" data-next-session>Continue To Sessions</button>
    </div>`;
}

function renderSchedulePanel() {
  const slots = openSlots();
  const dates = uniqueDates(slots);
  const times = slots.filter((slot) => slot.dateIso === bookingState.selectedDate);
  const group = getTrainingGroup(bookingState.selectedGroupId);
  if (!dates.length) {
    return `<div class="empty-state"><strong>No open training slots are currently available.</strong><p>Check back soon or call <a href="tel:3236848024">323-684-8024</a> for schedule help.</p></div>`;
  }
  return `
    <div class="flow-section">
      <p class="eyebrow">Availability</p>
      <h4>${group.name}</h4>
      <p>${group.ages}</p>
      <div class="date-grid">
        ${dates.map((slot) => `<button class="${bookingState.selectedDate === slot.dateIso ? "selected" : ""}" type="button" data-date="${slot.dateIso}"><small>${slot.dayLabel}</small><strong>${slot.dateLabel}</strong></button>`).join("")}
      </div>
      <div class="time-grid">
        ${times.map((slot) => `<button class="${bookingState.selectedSlotId === slot.id ? "selected" : ""}" type="button" data-slot="${slot.id}"><strong>${slot.time}</strong><span>${slot.duration} session</span><span class="spots-badge">${spotsLabel(remainingSpots(slot))}</span></button>`).join("")}
      </div>
      <button class="primary-button" type="button" data-next-details>Continue To Details</button>
      <button class="ghost-button" type="button" data-back-program>Back To Programs</button>
    </div>`;
}

function renderDetailsPanel() {
  const fields = bookingState.fields;
  const slot = selectedSlot();
  const maxPlayers = slot ? Math.max(1, Math.min(slotCapacity, remainingSpots(slot))) : slotCapacity;
  const playerOptions = Array.from({ length: maxPlayers }, (_, index) => index + 1);
  return `
    <div class="flow-form">
      <label>Parent/Guardian Name <input data-field="parentName" value="${escapeHtml(fields.parentName)}" /></label>
      <label>Player Name <input data-field="playerName" value="${escapeHtml(fields.playerName)}" /></label>
      <label>Player Age <input data-field="playerAge" inputmode="numeric" value="${escapeHtml(fields.playerAge)}" /></label>
      <label>Phone Number <input data-field="phone" type="tel" value="${escapeHtml(fields.phone)}" /></label>
      <label>Email <input data-field="email" type="email" value="${escapeHtml(fields.email)}" /></label>
      <label>Number of Players Attending <select data-field="players">${playerOptions.map((count) => `<option value="${count}" ${fields.players === String(count) ? "selected" : ""}>${count}</option>`).join("")}</select></label>
      ${slot ? `<p class="spot-note full">${spotsLabel(remainingSpots(slot))} for ${slot.dateLabel} at ${slot.time}.</p>` : ""}
      <label class="full">Notes <textarea data-field="notes" placeholder="Share player goals, scheduling details, or anything helpful for Coach Hugo">${escapeHtml(fields.notes)}</textarea></label>
      <label class="full">Medical Notes/Injuries <textarea data-field="medicalNotes">${escapeHtml(fields.medicalNotes)}</textarea></label>
      <div class="flow-actions full"><button class="ghost-button" type="button" data-back-schedule>Back</button><button class="primary-button" type="button" data-next-waiver>Continue To Waiver</button></div>
    </div>`;
}

function renderWaiverPanel() {
  const fields = bookingState.fields;
  return `
    <div class="flow-section">
      <div class="waiver-box"><strong>Waiver Required</strong><p>Parent/guardian agreement, emergency contact information, and digital signature are required before payment.</p></div>
      <div class="flow-form">
        <label>Emergency Contact Name <input data-field="emergencyName" value="${escapeHtml(fields.emergencyName)}" /></label>
        <label>Emergency Contact Phone <input data-field="emergencyPhone" type="tel" value="${escapeHtml(fields.emergencyPhone)}" /></label>
        <label class="check-label full"><input data-field="waiverAgreement" type="checkbox" ${fields.waiverAgreement ? "checked" : ""} />I agree to the Elite Soccer Training CV waiver terms and understand participation includes physical activity, soccer movements, equipment, and risk of injury.</label>
        <label class="full">Parent/Guardian Digital Signature <input data-field="guardianSignature" value="${escapeHtml(fields.guardianSignature)}" placeholder="Type parent/guardian full legal name" /></label>
        <div class="flow-actions full"><button class="ghost-button" type="button" data-back-details>Back</button><button class="primary-button" type="button" data-next-payment>Continue To Payment</button></div>
      </div>
    </div>`;
}

function renderPaymentPanel() {
  const fields = bookingState.fields;
  const slot = selectedSlot();
  const group = getTrainingGroup(bookingState.selectedGroupId);
  return `
    <div class="payment-flow-grid">
      <aside class="waiver-box"><strong>Stripe Ready</strong><p>Credit/debit card, Apple Pay, and Google Pay are ready for online checkout.</p>${slot ? `<p><b>${slot.dateLabel} at ${slot.time}</b><br />${fields.players} player(s) attending<br />${escapeHtml(group.name)}</p>` : ""}</aside>
      <div class="stripe-card" data-stripe-ready="true">
        <button class="wallet-button apple" type="button">Pay with Apple Pay</button>
        <button class="wallet-button google" type="button">Pay with Google Pay</button>
        <label>Name on Card <input data-field="cardName" value="${escapeHtml(fields.cardName)}" /></label>
        <label>Card Number <input data-field="cardNumber" inputmode="numeric" value="${escapeHtml(fields.cardNumber)}" placeholder="4242 4242 4242 4242" /></label>
        <div class="mini-card-grid"><label>Expiration <input data-field="cardExpiry" value="${escapeHtml(fields.cardExpiry)}" placeholder="MM/YY" /></label><label>CVC <input data-field="cardCvc" inputmode="numeric" value="${escapeHtml(fields.cardCvc)}" /></label></div>
        <label>ZIP / Postal Code <input data-field="postalCode" value="${escapeHtml(fields.postalCode)}" /></label>
        <div class="flow-actions"><button class="ghost-button" type="button" data-back-waiver>Back</button><button class="primary-button" type="button" data-confirm-payment>Pay And Confirm Session</button></div>
      </div>
    </div>`;
}

function renderConfirmedPanel() {
  const slot = bookingState.confirmedSlot;
  const booking = bookingState.confirmedBooking;
  const notificationStatus = bookingState.notificationStatus;
  const parentStatus =
    notificationStatus === "Sent"
      ? `Parent confirmation sent to ${bookingState.fields.email || "parent email"}`
      : `Parent confirmation ready for ${bookingState.fields.email || "parent email"}`;
  const coachStatus =
    notificationStatus === "Sent"
      ? `Coach notification sent to ${bookingNotificationEmail}`
      : `Coach notification ready for ${bookingNotificationEmail}`;
  const statusLabel = notificationStatus === "Email service not configured" ? "Email Setup Needed" : "Complete";
  return `
    <div class="confirmed-panel">
      <p class="eyebrow">Session Confirmed</p>
      <h4>Your small group session is confirmed.</h4>
      <p>Confirmation code: <strong>${bookingState.code}</strong></p>
      ${slot ? `<p>${slot.dateLabel} at ${slot.time} in Coachella Valley, CA</p>` : ""}
      <div class="confirmation-grid">
        <span>Payment successful<small>Complete</small></span>
        <span>Google Calendar ready<small>Calendar Setup Needed</small></span>
        <span>${escapeHtml(parentStatus)}<small>${statusLabel}</small></span>
        <span>${escapeHtml(coachStatus)}<small>${statusLabel}</small></span>
      </div>
      ${booking ? `<div class="email-preview"><strong>Confirmation Email UI</strong><p>${escapeHtml(booking.parentName)}, your ${escapeHtml(booking.programName)} session for ${escapeHtml(booking.playerName)} is confirmed for ${escapeHtml(booking.sessionDate)} at ${escapeHtml(booking.sessionTime)}. Payment status: ${escapeHtml(booking.paymentStatus)}.</p><p>Reminder notification scheduled.</p></div>` : ""}
      <button class="primary-button" type="button" data-new-booking>Book Another Session</button>
    </div>`;
}

function wirePanel(panel) {
  syncFields(panel);
  panel.querySelectorAll("[data-group]").forEach((button) => button.addEventListener("click", () => {
    bookingState.selectedGroupId = button.dataset.group;
    bookingState.selectedSlotId = "";
    const firstSlot = openSlots()[0];
    bookingState.selectedDate = firstSlot ? firstSlot.dateIso : "";
    renderBooking();
  }));
  panel.querySelector("[data-next-session]")?.addEventListener("click", () => setStep("session"));
  panel.querySelector("[data-back-program]")?.addEventListener("click", () => setStep("program"));
  panel.querySelectorAll("[data-date]").forEach((button) => button.addEventListener("click", () => {
    bookingState.selectedDate = button.dataset.date;
    bookingState.selectedSlotId = "";
    renderBooking();
  }));
  panel.querySelectorAll("[data-slot]").forEach((button) => button.addEventListener("click", () => {
    bookingState.selectedSlotId = button.dataset.slot;
    const slot = selectedSlot();
    if (slot) {
      bookingState.fields.players = String(Math.min(Number(bookingState.fields.players) || 1, remainingSpots(slot)));
    }
    renderBooking();
  }));
  panel.querySelector("[data-next-details]")?.addEventListener("click", () => selectedSlot() ? setStep("details") : showError("Choose an available training slot before continuing."));
  panel.querySelector("[data-back-schedule]")?.addEventListener("click", () => setStep("session"));
  panel.querySelector("[data-next-waiver]")?.addEventListener("click", () => detailsComplete() ? setStep("waiver") : showError(`${getTrainingGroup(bookingState.selectedGroupId).name} is for ${getTrainingGroup(bookingState.selectedGroupId).ages}. Check the player age and details before continuing.`));
  panel.querySelector("[data-back-details]")?.addEventListener("click", () => setStep("details"));
  panel.querySelector("[data-next-payment]")?.addEventListener("click", () => waiverComplete() ? setStep("payment") : showError("Complete waiver agreement, emergency contact, and signature before payment."));
  panel.querySelector("[data-back-waiver]")?.addEventListener("click", () => setStep("waiver"));
  panel.querySelector("[data-confirm-payment]")?.addEventListener("click", confirmBooking);
  panel.querySelector("[data-new-booking]")?.addEventListener("click", () => {
    bookingState.step = "program";
    bookingState.selectedSlotId = "";
    bookingState.confirmedSlot = null;
    bookingState.confirmedBooking = null;
    bookingState.notificationStatus = "Ready";
    bookingState.code = "";
    renderBooking();
  });
}

function confirmBooking() {
  const slot = selectedSlot();
  if (!slot) return showError("That slot is no longer available. Please choose another time.");
  const blocked = loadBlockedDays();
  const latestSlots = loadSlots();
  const latest = latestSlots.find((item) => item.id === slot.id);
  const requestedPlayers = Number(bookingState.fields.players);
  const latestRemaining = latest ? remainingSpots(latest) : 0;
  if (!latest || latest.groupId !== bookingState.selectedGroupId || !isSlotAvailable(latest, blocked) || !Number.isInteger(requestedPlayers) || requestedPlayers < 1 || requestedPlayers > latestRemaining) {
    return showError("That session no longer has enough spots. Please choose another available time.");
  }
  const updatedSlot = {
    ...latest,
    bookedPlayers: latest.bookedPlayers + requestedPlayers,
    status: latest.bookedPlayers + requestedPlayers >= latest.capacity ? "booked" : "open"
  };
  const group = getTrainingGroup(bookingState.selectedGroupId);
  const booking = {
    id: `EST-${slot.id.replaceAll("-", "").slice(-8).toUpperCase()}-${Date.now().toString().slice(-5)}`,
    createdAt: new Date().toISOString(),
    parentName: bookingState.fields.parentName,
    playerName: bookingState.fields.playerName,
    playerAge: bookingState.fields.playerAge,
    phone: bookingState.fields.phone,
    email: bookingState.fields.email,
    players: bookingState.fields.players,
    notes: bookingState.fields.notes,
    medicalNotes: bookingState.fields.medicalNotes,
    emergencyName: bookingState.fields.emergencyName,
    emergencyPhone: bookingState.fields.emergencyPhone,
    guardianSignature: bookingState.fields.guardianSignature,
    programId: bookingState.selectedGroupId,
    programName: group.name,
    sessionId: slot.id,
    sessionDateIso: latest.dateIso,
    sessionDate: latest.dateLabel,
    sessionTime: latest.time,
    sessionDurationMinutes: 60,
    sessionCalendarEventId: latest.calendarEventId,
    paymentStatus: "Paid",
    notificationStatus: "Ready",
    calendarStatus: "Ready"
  };
  saveSlots(latestSlots.map((item) => (item.id === slot.id ? updatedSlot : item)));
  saveBooking(booking);
  bookingState.confirmedSlot = updatedSlot;
  bookingState.confirmedBooking = booking;
  bookingState.notificationStatus = booking.notificationStatus;
  bookingState.code = booking.id;
  setStep("confirmed");
  renderAdmin();
}

function dateLabels(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  return {
    dateLabel: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    dayLabel: date.toLocaleDateString("en-US", { weekday: "long" })
  };
}

function timeLabel(time) {
  const [hourValue, minuteValue] = time.split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

function renderAdmin(message = "") {
  const root = document.querySelector("[data-admin-panel]");
  if (!root) return;
  const slots = loadSlots();
  const blocked = loadBlockedDays();
  const bookings = loadBookings();
  const openCount = slots.filter((slot) => isSlotAvailable(slot, blocked)).length;
  const bookedCount = slots.filter((slot) => slot.status !== "blocked" && !blocked.includes(slot.dateIso) && remainingSpots(slot) === 0).length;
  const blockedCount = slots.filter((slot) => slot.status === "blocked" || blocked.includes(slot.dateIso)).length;
  root.innerHTML = `
    <div class="admin-summary">${[["Open", openCount], ["Booked", bookedCount], ["Blocked", blockedCount], ["Bookings", bookings.length]].map(([label, count]) => `<span><b>${count}</b>${label}</span>`).join("")}</div>
    ${message ? `<p class="admin-notice">${message}</p>` : ""}
    <div class="admin-tools">
      <div class="card"><h3>Add Available Slot</h3><label>Program <select data-admin-group>${trainingGroups.map((group) => `<option value="${group.id}">${group.name} (${group.ages})</option>`).join("")}</select></label><label>Date <input type="date" data-admin-date value="2026-06-16" /></label><label>Time <input type="time" data-admin-time value="17:00" /></label><label>Capacity <input type="number" min="1" max="6" data-admin-capacity value="6" /></label><label>Duration <input type="number" min="60" max="60" data-admin-duration value="60" readonly /></label><button class="primary-button" type="button" data-admin-add>Add Slot</button></div>
      <div class="card"><h3>Block Unavailable Day</h3><label>Date <input type="date" data-admin-block-date value="2026-06-18" /></label><button class="secondary-admin-button" type="button" data-admin-block>Block Day</button><button class="secondary-admin-button" type="button" data-admin-clean>Remove Booked Slots</button><button class="secondary-admin-button" type="button" data-admin-reset>Clear Schedule</button></div>
    </div>
    ${blocked.length ? `<div class="admin-blocked"><h3>Blocked Days</h3>${blocked.map((day) => `<button type="button" data-admin-unblock="${day}">${dateLabels(day).dateLabel} - Reopen</button>`).join("")}</div>` : ""}
    <div class="slot-list">${slots.map((slot) => {
      const remaining = remainingSpots(slot);
      const statusLabel = blocked.includes(slot.dateIso) ? "blocked day" : remaining === 0 ? "full" : spotsLabel(remaining);
      return `<div class="slot-row"><div><small>${getTrainingGroup(slot.groupId).name}</small><strong>${slot.dateLabel} at ${slot.time}</strong><span>${slot.duration} - ${slot.bookedPlayers}/${slot.capacity} players booked - ${statusLabel}</span></div><div><button type="button" data-admin-open="${slot.id}">Open</button><button type="button" data-admin-slot-block="${slot.id}">Block</button><button type="button" data-admin-remove="${slot.id}">Remove</button></div></div>`;
    }).join("")}</div>
    <div class="booking-dashboard">
      <div class="booking-dashboard-head">
        <div><h3>Bookings Dashboard</h3><p>Owner notifications are prepared for ${bookingNotificationEmail}.</p></div>
        <button class="secondary-admin-button" type="button" data-admin-refresh>Refresh</button>
      </div>
      ${bookings.length ? bookings.map((booking) => `
        <article class="booking-row">
          <div>
            <small>${escapeHtml(booking.programName)}</small>
            <strong>${escapeHtml(booking.playerName)}</strong>
            <span>${escapeHtml(booking.sessionDate)} at ${escapeHtml(booking.sessionTime)} - ${escapeHtml(booking.players)} player(s)</span>
            <span>Payment: ${escapeHtml(booking.paymentStatus)}</span>
          </div>
          <div>
            <span><b>Parent:</b> ${escapeHtml(booking.parentName)}</span>
            <span><b>Phone:</b> ${escapeHtml(booking.phone)}</span>
            <span><b>Email:</b> ${escapeHtml(booking.email)}</span>
            <span><b>Emergency:</b> ${escapeHtml(booking.emergencyName)} - ${escapeHtml(booking.emergencyPhone)}</span>
            <span><b>Notes:</b> ${escapeHtml(booking.notes || "None")}</span>
            <span><b>Medical:</b> ${escapeHtml(booking.medicalNotes || "None")}</span>
            <span><b>Email Status:</b> ${escapeHtml(booking.notificationStatus)}</span>
            <span><b>Calendar:</b> ${escapeHtml(booking.calendarStatus || "Ready")}</span>
          </div>
        </article>
      `).join("") : `<p class="empty-state"><strong>No bookings yet.</strong></p>`}
    </div>`;
  wireAdmin(root);
}

function renderAdminGate() {
  const gate = document.querySelector("[data-admin-gate]");
  if (!gate) return;

  if (localStorage.getItem(adminAccessKey) === "unlocked") {
    gate.innerHTML = `<div data-admin-panel></div>`;
    renderAdmin();
    return;
  }

  gate.innerHTML = `
    <div class="admin-login-card">
      <p class="eyebrow">Owner Access</p>
      <h3>Admin schedule tools</h3>
      <p>This page is hidden from public navigation. Enter the owner passcode to continue.</p>
      <label>Passcode <input type="password" data-admin-passcode /></label>
      <p class="admin-login-error" hidden></p>
      <button class="primary-button" type="button" data-admin-unlock>Unlock Admin</button>
    </div>`;
  const input = gate.querySelector("[data-admin-passcode]");
  const error = gate.querySelector(".admin-login-error");
  const unlock = () => {
    error.hidden = false;
    error.textContent = "Admin access is checked by ADMIN_PASSCODE on the deployed Next.js site.";
  };
  gate.querySelector("[data-admin-unlock]")?.addEventListener("click", unlock);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlock();
  });
}

function wireAdmin(root) {
  root.querySelector("[data-admin-add]")?.addEventListener("click", () => {
    const groupId = root.querySelector("[data-admin-group]").value;
    const date = root.querySelector("[data-admin-date]").value;
    const time = root.querySelector("[data-admin-time]").value;
    const capacity = Math.min(slotCapacity, Math.max(1, Number(root.querySelector("[data-admin-capacity]").value) || slotCapacity));
    const id = `${groupId}-${date}-${time.replace(":", "")}`;
    const current = loadSlots();
    if (current.some((slot) => slot.id === id)) return renderAdmin("That date and time already exists.");
    const labels = dateLabels(date);
    saveSlots([...current, { id, groupId, dateIso: date, dateLabel: labels.dateLabel, dayLabel: labels.dayLabel, time: timeLabel(time), duration: "60 min", capacity, bookedPlayers: 0, status: "open" }]);
    renderAdmin("Availability added and visible on the booking calendar.");
    renderBooking();
  });
  root.querySelector("[data-admin-block]")?.addEventListener("click", () => {
    const date = root.querySelector("[data-admin-block-date]").value;
    saveBlockedDays([...new Set([...loadBlockedDays(), date])]);
    saveSlots(loadSlots().map((slot) => (slot.dateIso === date ? { ...slot, status: "blocked" } : slot)));
    renderAdmin("Unavailable day blocked and hidden from parent booking.");
    renderBooking();
  });
  root.querySelector("[data-admin-clean]")?.addEventListener("click", () => {
    saveSlots(loadSlots().filter((slot) => slot.status !== "booked" && remainingSpots(slot) > 0));
    renderAdmin("Full sessions removed from the admin list.");
    renderBooking();
  });
  root.querySelector("[data-admin-reset]")?.addEventListener("click", () => {
    saveSlots(defaultSlots);
    saveBlockedDays([]);
    renderAdmin("Schedule cleared. Add new time blocks to publish availability.");
    renderBooking();
  });
  root.querySelector("[data-admin-refresh]")?.addEventListener("click", () => renderAdmin("Bookings refreshed."));
  root.querySelectorAll("[data-admin-unblock]").forEach((button) => button.addEventListener("click", () => {
    const day = button.dataset.adminUnblock;
    saveBlockedDays(loadBlockedDays().filter((blockedDay) => blockedDay !== day));
    saveSlots(loadSlots().map((slot) => (slot.dateIso === day && slot.status === "blocked" ? { ...slot, status: remainingSpots(slot) === 0 ? "booked" : "open" } : slot)));
    renderAdmin("Day reopened.");
    renderBooking();
  }));
  root.querySelectorAll("[data-admin-open]").forEach((button) => button.addEventListener("click", () => {
    saveSlots(loadSlots().map((slot) => (slot.id === button.dataset.adminOpen ? { ...slot, status: "open", bookedPlayers: remainingSpots(slot) === 0 ? 0 : slot.bookedPlayers } : slot)));
    renderAdmin("Slot reopened.");
    renderBooking();
  }));
  root.querySelectorAll("[data-admin-slot-block]").forEach((button) => button.addEventListener("click", () => {
    saveSlots(loadSlots().map((slot) => (slot.id === button.dataset.adminSlotBlock ? { ...slot, status: "blocked" } : slot)));
    renderAdmin("Slot blocked.");
    renderBooking();
  }));
  root.querySelectorAll("[data-admin-remove]").forEach((button) => button.addEventListener("click", () => {
    saveSlots(loadSlots().filter((slot) => slot.id !== button.dataset.adminRemove));
    renderAdmin("Slot removed.");
    renderBooking();
  }));
}

document.querySelectorAll("[data-local-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = form.querySelector(".form-status");
    if (status) status.textContent = "Captured locally. Add a form endpoint when the site is ready to go live.";
  });
});

const canvas = document.querySelector("#signature-canvas");
const clearButton = document.querySelector("#clear-signature");

if (canvas instanceof HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  let drawing = false;

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#06152b";
    }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
  canvas.addEventListener("pointerdown", (event) => {
    if (!context) return;
    event.preventDefault();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!context || !drawing) return;
    event.preventDefault();
    const point = pointerPosition(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    canvas.addEventListener(eventName, () => {
      drawing = false;
    });
  });
  clearButton?.addEventListener("click", () => {
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    sizeCanvas();
  });
}

renderBooking();
renderAdminGate();

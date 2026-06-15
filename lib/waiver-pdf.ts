import { type BookingRecord } from "@/lib/booking-data";
import { waiverRecordFooter, waiverSections } from "@/lib/waiver-content";

type PdfLine = {
  text: string;
  size: number;
  font: "F1" | "F2";
  gapAfter: number;
};

const pageWidth = 612;
const pageHeight = 792;
const marginX = 48;
const topY = 744;
const bottomY = 54;
const usableWidth = pageWidth - marginX * 2;

function sanitizePdfText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\r", "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "'");
}

function formatWaiverTimestamp(value: string) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  });
}

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Player";
}

export function signedWaiverPdfFileName(booking: BookingRecord) {
  return `EST-CV-Waiver-${safeFilePart(booking.playerName)}-${safeFilePart(booking.id)}.pdf`;
}

function wrapText(text: string, size: number) {
  const maxChars = Math.max(32, Math.floor(usableWidth / (size * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      return;
    }

    current = next;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function waiverLines(booking: BookingRecord): PdfLine[] {
  const rows: Array<[string, string]> = [
    ["Business Name", "Elite Soccer Training CV"],
    ["Booking ID", booking.id],
    ["Session Date/Time", `${booking.sessionDate} at ${booking.sessionTime}`],
    ["Training Group", booking.programName],
    ["Player Name", booking.playerName],
    ["Player Age", booking.playerAge],
    ["Parent/Guardian Name", booking.parentName],
    ["Parent Email", booking.email],
    ["Parent Phone", booking.phone],
    ["Payment Status", booking.paymentType === "launch_pass_credit" ? "Paid using Launch Pass credit" : "Paid"],
    ["Waiver Signed", booking.waiverAccepted ? "Yes" : "Not recorded"],
    ["Typed Signature", booking.guardianSignature || "Not recorded"],
    ["Signed Date/Time", formatWaiverTimestamp(booking.waiverAcceptedAt)],
    ["Media Consent", booking.mediaConsent || "Not recorded"],
    ["Emergency Contact", `${booking.emergencyName || "Not recorded"} - ${booking.emergencyPhone || "Not recorded"}`],
    ["Emergency/Medical Notes", booking.medicalNotes || "None"],
    ["IP Address", booking.ipAddress || "Not collected"]
  ];
  const lines: PdfLine[] = [
    { text: "Elite Soccer Training CV - Signed Waiver Record", size: 17, font: "F2", gapAfter: 12 },
    { text: "Electronic waiver record for a paid Elite Soccer Training CV booking.", size: 10, font: "F1", gapAfter: 16 },
    { text: "Booking & Participant Information", size: 12, font: "F2", gapAfter: 6 }
  ];

  rows.forEach(([label, value]) => {
    lines.push({ text: `${label}: ${value}`, size: 10, font: "F1", gapAfter: 4 });
  });

  lines.push({ text: "Full Waiver Legal Text Agreed To By Parent/Guardian", size: 12, font: "F2", gapAfter: 8 });
  waiverSections.forEach((section) => {
    lines.push({ text: section.title, size: 11, font: "F2", gapAfter: 4 });
    wrapText(section.copy, 10).forEach((line) => {
      lines.push({ text: line, size: 10, font: "F1", gapAfter: 2 });
    });
    lines.push({ text: "", size: 10, font: "F1", gapAfter: 7 });
  });
  lines.push({ text: waiverRecordFooter, size: 9, font: "F2", gapAfter: 0 });

  return lines;
}

function makeContentStream(lines: PdfLine[]) {
  const pages: string[] = [];
  let content = "";
  let y = topY;

  function startPage() {
    content = "";
    y = topY;
  }

  function finishPage() {
    pages.push(content);
  }

  startPage();

  lines.forEach((item) => {
    const lineHeight = Math.ceil(item.size * 1.35);

    if (y - lineHeight < bottomY) {
      finishPage();
      startPage();
    }

    content += `BT /${item.font} ${item.size} Tf ${marginX} ${y} Td (${sanitizePdfText(item.text)}) Tj ET\n`;
    y -= lineHeight + item.gapAfter;
  });

  finishPage();

  return pages;
}

export function buildSignedWaiverPdf(booking: BookingRecord) {
  const pageStreams = makeContentStream(waiverLines(booking));
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pageStreams.forEach((stream) => {
    const contentId = objects.length;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}endstream`;
    const pageId = objects.length;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageObjectIds.push(pageId);
  });

  objects[2] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "binary");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;

  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}

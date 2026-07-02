import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleApprovalConfirm } from "@/components/ScheduleApprovalConfirm";
import { getSessionFocusLabel } from "@/lib/session-focus";
import { business } from "@/lib/site-data";
import { getScheduleApprovalByToken } from "@/lib/supabase-db";

export const metadata: Metadata = {
  title: "Schedule Confirmation",
  description: "Confirm your proposed Elite Soccer Training CV schedule."
};

export const dynamic = "force-dynamic";

type ScheduleConfirmationPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function formatSessionDate(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatSessionTime(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function trainingGroupLabel(group: string) {
  return group === "future-elite" ? "Future Elite" : "Elite Performance";
}

export default async function ScheduleConfirmationPage({ params }: ScheduleConfirmationPageProps) {
  const { token } = await params;
  const details = await getScheduleApprovalByToken(token);

  if (!details) {
    return (
      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-black uppercase text-electric">Schedule Confirmation</p>
            <h1 className="mt-3 text-3xl font-black text-navy">Link not found.</h1>
            <p className="mt-4 leading-7 text-slate-600">
              This private schedule confirmation link is not available. Please contact Coach Hugo for help.
            </p>
            <Link href="/contact" className="mt-6 inline-flex rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white">
              Contact EST CV
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const disabled = details.approval.status !== "pending";

  return (
    <section className="bg-mist py-16 sm:py-20">
      <div className="section-shell max-w-4xl">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-black uppercase text-electric">Private Schedule Confirmation</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-navy">
            Please confirm this schedule.
          </h1>
          <p className="mt-4 leading-7 text-slate-600">
            Review the proposed EST CV sessions below for {details.approval.player_name}. Confirming will reserve these
            sessions using the already-paid 6-Session Launch Pass credits.
          </p>

          <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm leading-6 text-slate-700 sm:grid-cols-2">
            <p><span className="font-black text-navy">Player:</span> {details.approval.player_name}</p>
            <p><span className="font-black text-navy">Training group:</span> {trainingGroupLabel(details.approval.training_group)}</p>
            <p><span className="font-black text-navy">Plan:</span> 6-Session Launch Pass</p>
            <p><span className="font-black text-navy">Location:</span> {business.location}</p>
          </div>

          {details.approval.status !== "pending" ? (
            <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
              This schedule is already {details.approval.status}.
            </p>
          ) : null}

          <div className="mt-8 grid gap-3">
            {details.sessions.map((session, index) => (
              <article key={session.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase text-electric">Session {index + 1}</p>
                    <h2 className="mt-1 text-lg font-black text-navy">{getSessionFocusLabel(session.training_focus)}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {formatSessionDate(session.start_datetime, session.timezone)} at{" "}
                      {formatSessionTime(session.start_datetime, session.timezone)}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-mist px-3 py-1 text-xs font-black uppercase text-navy">
                    {trainingGroupLabel(session.training_group)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{session.location || business.location}</p>
              </article>
            ))}
          </div>

          <div className="mt-8">
            <ScheduleApprovalConfirm token={token} disabled={disabled} />
          </div>
        </div>
      </div>
    </section>
  );
}

import { getSupabaseAvailability, getSupabaseAvailabilityDebug } from "@/lib/supabase-db";
import { type CalendarSyncStatus, type TrainingGroupId } from "@/lib/booking-data";

export type PublicAvailableSession = {
  id: string;
  date: string;
  dateLabel: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  isoDateTime: string;
  timeZone: string;
  trainingGroupId: TrainingGroupId;
  trainingGroup: string;
  trainingGroupAges: string;
  trainingFocusValue?: string;
  trainingFocus?: string;
  trainingFocusDescription?: string;
  capacity: number;
  bookedCount: number;
  remainingSpots: number;
  location: string;
  duration: string;
  calendarEventId?: string;
};

export type PublicAvailabilityResponse = {
  status: CalendarSyncStatus;
  sessions: PublicAvailableSession[];
  generatedAt: string;
  timeZone: string;
  message?: string;
};

export type PublicAvailabilityDebugResponse = PublicAvailabilityResponse & {
  supabaseConfigured?: boolean;
  summary?: {
    allSessionsLoaded: number;
    openFutureSessions: number;
    sessionsWithRemainingSpots: number;
    finalSessionsReturned: number;
  };
  loadedSessions: Array<{
    id: string;
    date: string;
    time: string;
    trainingGroup: string;
    trainingFocusValue?: string;
    trainingFocus?: string;
    status: string;
    capacity: number;
    bookedCount: number;
    remainingSpots: number;
    checks: {
      activeEnabled: boolean;
      futureDate: boolean;
      capacity: boolean;
      remainingSpots: boolean;
    };
    included: boolean;
    removedReasons: string[];
  }>;
};

export async function getServerAvailableSessions(): Promise<PublicAvailabilityResponse> {
  return getSupabaseAvailability();
}

export async function getServerAvailabilityDebug(): Promise<PublicAvailabilityDebugResponse> {
  return getSupabaseAvailabilityDebug();
}

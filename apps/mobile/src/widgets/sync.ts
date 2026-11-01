import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { buildSnapshot } from "@shared/widget-snapshot";
import { fetchLibrary, type Library } from "../data/library";
import { db } from "@/lib/supabase";
import { clearSnapshot, setSnapshot } from "../../modules/widget-bridge";

export const WIDGET_REFRESH_TASK = "codeinsta-widget-refresh";

/** WorkManager and BGTaskScheduler both enforce 15 minutes as the floor; the OS decides the real cadence. */
const MIN_INTERVAL_MINUTES = 15;

// expo-background-task's result codes (BackgroundTaskResult), inlined so the task body stays free of enum imports.
const RESULT_SUCCESS = 1;
const RESULT_FAILED = 2;

/** Builds the snapshot from an already loaded library and writes it for the widgets. Never throws. */
export function syncWidgetSnapshot(library: Library, streak: number): void {
  try {
    const snapshot = buildSnapshot(library.reels, library.creators, library.categories, streak, new Date());
    setSnapshot(JSON.stringify(snapshot));
  } catch {
    // Widgets are best effort; a bad build or bridge failure must not reach the feed.
  }
}

/** Sign-out and lost-membership path: widgets fall back to "Open CodeInsta to get started". Never throws. */
export function clearWidgetSnapshot(): void {
  try {
    clearSnapshot();
  } catch {
    // Best effort.
  }
}

/** Same RPC as the feed session; 0 on any failure so a missing streak never blocks a snapshot. */
export async function fetchStreak(): Promise<number> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const { data, error } = await db.rpc("learning_streak", { tz });
    if (error || typeof data !== "number" || !Number.isFinite(data)) return 0;
    return data;
  } catch {
    return 0;
  }
}

/** Call after every successful library load: fetches the streak, then writes the snapshot. Never throws. */
export async function syncWidgetAfterLoad(library: Library): Promise<void> {
  syncWidgetSnapshot(library, await fetchStreak());
}

/** Body of the background task: refresh from the network with the stored session, or clear when signed out. */
export async function refreshWidgetSnapshotInBackground(): Promise<number> {
  try {
    const { data } = await db.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      clearWidgetSnapshot();
      return RESULT_SUCCESS;
    }
    const library = await fetchLibrary(user.id);
    syncWidgetSnapshot(library, await fetchStreak());
    return RESULT_SUCCESS;
  } catch {
    return RESULT_FAILED;
  }
}

// Tasks must be defined at module scope so the OS can run them in a headless JS context.
TaskManager.defineTask(WIDGET_REFRESH_TASK, refreshWidgetSnapshotInBackground);

/** Registers the periodic refresh. Safe to call on every launch; unsupported platforms resolve quietly. */
export async function registerWidgetRefresh(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(WIDGET_REFRESH_TASK)) return;
    await BackgroundTask.registerTaskAsync(WIDGET_REFRESH_TASK, { minimumInterval: MIN_INTERVAL_MINUTES });
  } catch {
    // Expo Go, simulators and restricted devices cannot run background tasks; the widget just refreshes on app open.
  }
}

/**
 * Client for the scheduler backend API.
 *
 * By default this targets the built-in same-origin Netlify function at
 * `/.netlify/functions/scheduler`. When self-hosting, the base URL can be
 * overridden via `setSchedulerBaseUrl(url)` (wired to AppConfig in
 * SchedulerBackendSync), allowing the app to point at any backend that
 * implements the same simple API.
 */

interface ScheduleRequest {
  signedEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
  publishAt: number;
  relays?: string[];
}

interface ScheduleResponse {
  ok: boolean;
  id: string;
  publishAt: number;
  status: string;
}

interface StatusResponse {
  id: string;
  status: 'pending' | 'published' | 'failed';
  publishAt: number;
  publishedAt: number | null;
  results: { relay: string; ok: boolean; message?: string; error?: string }[] | null;
}

export interface HealthResponse {
  ok: boolean;
  service?: string;
  storage?: string;
  method?: string;
}

/** The built-in default backend (same-origin Netlify function). */
export const DEFAULT_SCHEDULER_PATH = '/.netlify/functions/scheduler';

/**
 * Module-level base URL. Empty string means "use the default path".
 * Updated at runtime by SchedulerBackendSync from AppConfig.
 */
let baseUrl = '';

/**
 * Set the scheduler backend base URL.
 *
 * @param url A full origin/URL (e.g. `https://scheduler.example.com`) or an
 *   empty string to fall back to the default same-origin Netlify function.
 */
export function setSchedulerBaseUrl(url: string): void {
  baseUrl = (url || '').trim().replace(/\/+$/, '');
}

/** Get the currently configured scheduler base URL (empty = default). */
export function getSchedulerBaseUrl(): string {
  return baseUrl;
}

/**
 * Resolve the endpoint to call.
 *
 * - If a custom base URL is configured, use it directly (the self-hosted
 *   backend is expected to be mounted at the root of that URL).
 * - Otherwise, use the default same-origin Netlify function path.
 */
function getApiUrl(query = ''): string {
  const base = baseUrl || DEFAULT_SCHEDULER_PATH;
  return `${base}${query}`;
}

/**
 * Schedule a pre-signed event for future publishing.
 * The server stores it and publishes to relays at the specified time.
 */
export async function scheduleEvent(request: ScheduleRequest): Promise<ScheduleResponse> {
  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check the status of a scheduled event.
 */
export async function checkEventStatus(eventId: string): Promise<StatusResponse> {
  const response = await fetch(getApiUrl(`?id=${encodeURIComponent(eventId)}`), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Cancel a scheduled event that hasn't been published yet.
 */
export async function cancelScheduledEvent(eventId: string): Promise<{ ok: boolean }> {
  const response = await fetch(getApiUrl(`?id=${encodeURIComponent(eventId)}`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if the scheduler API is available (deployed and reachable).
 * Returns a boolean for quick availability checks.
 */
export async function isSchedulerApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(), {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

/**
 * Fetch the health-check payload from the backend.
 *
 * Optionally accepts a `url` override so the Settings page can test a
 * candidate backend URL before saving it. Throws on network failure or a
 * non-OK response.
 */
export async function checkSchedulerHealth(url?: string): Promise<HealthResponse> {
  const base = typeof url === 'string'
    ? (url.trim().replace(/\/+$/, '') || DEFAULT_SCHEDULER_PATH)
    : (baseUrl || DEFAULT_SCHEDULER_PATH);

  const response = await fetch(base, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

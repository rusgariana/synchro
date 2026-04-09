import { CalendarEvent } from './calendar';

/**
 * Fetch confirmed Luma RSVPs for a given email address.
 * These are fetched dynamically from the user's saved ICS URL.
 */
export async function fetchLumaEvents(icsUrl: string, email?: string, name?: string): Promise<CalendarEvent[]> {
  const url = new URL('/api/events', window.location.origin);
  url.searchParams.set('url', icsUrl);
  if (email) url.searchParams.set('email', email);
  if (name) url.searchParams.set('name', name);

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 } // Always fresh
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Luma events: ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.events || [];
}

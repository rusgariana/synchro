import { CalendarEvent } from './calendar';

/**
 * Fetch upcoming events from the user's primary Google Calendar.
 * Includes extendedProperties so we can read existing private notes.
 */
export async function fetchGoogleCalendarEvents(accessToken: string): Promise<CalendarEvent[]> {
    const now = new Date().toISOString();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', now);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    // Request extendedProperties so private notes come back in the fetch
    url.searchParams.set(
        'fields',
        'items(id,iCalUID,summary,start,end,description,location,htmlLink,extendedProperties)'
    );

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google Calendar API error ${res.status}: ${err}`);
    }

    const data = await res.json();

    return (data.items ?? [])
        .filter((item: any) => item.start) // skip all-day events without dateTime if needed
        .map((item: any): CalendarEvent => ({
            uid: item.iCalUID ?? item.id,
            title: item.summary ?? '(No Title)',
            start: item.start?.dateTime ?? item.start?.date ?? '',
            end: item.end?.dateTime ?? item.end?.date ?? '',
            description: item.description,
            location: item.location,
            url: item.htmlLink,
            // Google-specific fields
            googleEventId: item.id,
            privateNote: item.extendedProperties?.private?.synchro_note ?? undefined,
        }))
        .filter((e: CalendarEvent) => e.start && e.end);
}

/**
 * Save a private note to a Google Calendar event using extendedProperties.private.
 * These notes are invisible to other users and to Google Calendar itself.
 */
export async function savePrivateNote(
    accessToken: string,
    googleEventId: string,
    note: string
): Promise<void> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`;

    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            extendedProperties: {
                private: {
                    synchro_note: note,
                },
            },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to save note: ${res.status}: ${err}`);
    }
}

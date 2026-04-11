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

    // 1. Fetch the existing event to get its current description
    const getRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!getRes.ok) throw new Error('Failed to fetch event to update note');
    
    const event = await getRes.json();
    const currentDesc = event.description || '';
    
    // 2. Build the new post-separator section preserving both system and user notes
    const separator = '\n\n-------------------------------\n';
    const isSystemNote = /^(🤝|🚫)/.test(note);
    const isUserNote = /^🟣/.test(note) || (!isSystemNote && note.trim() !== '');

    let preSection = currentDesc; // everything before the separator
    let systemLine = '';          // 🤝 / 🚫 line
    let userSection = '';         // 🟣 Private Note via Synchro + text

    if (currentDesc.includes('-------------------------------')) {
        const parts = currentDesc.split('-------------------------------');
        preSection = parts[0].trimEnd();
        const afterSep = (parts.slice(1).join('-------------------------------')).trimStart();

        // Parse existing system and user lines from afterSep
        const lines = afterSep.split('\n');
        for (const line of lines) {
            if (/^(🤝|🚫)/.test(line)) systemLine = line;
            else if (line.startsWith('🟣')) userSection = lines.slice(lines.indexOf(line)).join('\n');
        }
    }

    // Update whichever section this note belongs to
    if (isSystemNote) {
        systemLine = note;
    } else if (note) {
        userSection = `🟣 Private Note via Synchro\n${note}`;
    }

    // Reconstruct
    const postSection = [systemLine, userSection].filter(Boolean).join('\n');
    let newDesc = preSection;
    if (postSection) newDesc += separator + postSection;

    // 3. Patch the new description and extendedProperties
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            description: newDesc,
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

/**
 * Create a new event in the user's primary Google Calendar.
 * Includes a private note using extendedProperties.private.
 */
export async function createGoogleCalendarEvent(
    accessToken: string,
    event: CalendarEvent,
    note?: string
): Promise<string> {
    // 1. PRE-FLIGHT CHECK: Avoid duplicating events that already exist on the user's calendar
    // (e.g. via automatic Gmail parsing or native Luma calendar subscription)
    const searchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    searchUrl.searchParams.set('q', event.title);
    
    // Bound the search +/- 24 hours to be safe but prevent cross-year false positives
    const min = new Date(event.start);
    min.setHours(min.getHours() - 24);
    const max = new Date(event.start);
    max.setHours(max.getHours() + 24);
    
    searchUrl.searchParams.set('timeMin', min.toISOString());
    searchUrl.searchParams.set('timeMax', max.toISOString());
    searchUrl.searchParams.set('singleEvents', 'true');

    try {
        const searchRes = await fetch(searchUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            // Look for an exact title match within the time window
            const existing = searchData.items?.find((i: any) => i.summary === event.title);
            if (existing) {
                // Event already exists! Just append the private note to it instead of duplicating.
                if (note) {
                    await savePrivateNote(accessToken, existing.id, note);
                }
                return existing.id;
            }
        }
    } catch (e) {
        console.warn('Pre-flight duplication check failed, proceeding to create...', e);
    }

    // 2. Event does not exist, create a fresh copy
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            summary: event.title,
            start: { dateTime: new Date(event.start).toISOString() },
            end: { dateTime: new Date(event.end).toISOString() },
            location: event.location,
            description: note ? `${event.description || ''}\n\n-------------------------------\n\n${note}` : event.description,
            extendedProperties: {
                private: {
                    synchro_note: note || '',
                },
            },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to create Google Calendar event: ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.id;
}


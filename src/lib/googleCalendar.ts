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
 * Check whether a Google Calendar event still exists (not deleted).
 * Returns true if the event exists, false if 404/gone.
 */
export async function checkGoogleEventExists(
    accessToken: string,
    googleEventId: string
): Promise<boolean> {
    try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status === 404 || res.status === 410) return false;
        if (!res.ok) return true; // assume exists on other errors
        const data = await res.json();
        return data.status !== 'cancelled';
    } catch {
        return true; // on network error, assume exists
    }
}

/**
 * Save a private note to a Google Calendar event.
 * 
 * All user notes are stored under ONE header:
 *   🟣 Private Notes via Synchro
 *   ──────────────────
 *   • My Events: some note text
 *   • w/ Ivan: another note text
 *   • w/ Andrej: yet another note
 * 
 * `sourceTag` identifies which bullet to create/overwrite.
 *   - "My Events" for notes made in My Events tab
 *   - "w/ Ivan" for notes made in a session with Ivan
 * Each sourceTag gets its own bullet line. Saving a note with the same
 * sourceTag overwrites only that bullet, leaving others intact.
 */
export async function savePrivateNote(
    accessToken: string,
    googleEventId: string,
    note: string,
    sourceTag = 'My Events'
): Promise<void> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`;

    // 1. Fetch the existing event to get its current description
    const getRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!getRes.ok) throw new Error('Failed to fetch event to update note');
    
    const event = await getRes.json();
    const currentDesc = event.description || '';

    const separator = '\n\n-------------------------------\n';
    const isSystemNote = /^(🤝|🚫)/.test(note);

    // Parse existing post-separator content
    let preSection = currentDesc;
    let systemLines: string[] = [];
    // bullets: array of { tag: string, text: string } representing each "• tag: text" line
    let bullets: { tag: string; text: string }[] = [];

    if (currentDesc.includes('-------------------------------')) {
        const parts = currentDesc.split('-------------------------------');
        preSection = parts[0].trimEnd();
        const afterSep = (parts.slice(1).join('-------------------------------')).trimStart();

        const lines = afterSep.split('\n');
        for (const line of lines) {
            if (/^(🤝|🚫)/.test(line)) {
                systemLines.push(line);
            } else if (line.startsWith('• ')) {
                // Parse bullet: "• My Events: note text here"
                const colonIdx = line.indexOf(': ', 2);
                if (colonIdx > 2) {
                    bullets.push({ tag: line.substring(2, colonIdx), text: line.substring(colonIdx + 2) });
                } else {
                    // Legacy bullet without tag — keep as-is under "My Events"
                    bullets.push({ tag: 'My Events', text: line.substring(2) });
                }
            }
            // Skip header lines (🟣 ...) and separator lines (──...) — they are reconstructed
        }
    }

    // 2. Update the right section
    if (isSystemNote) {
        if (note.startsWith('🚫')) {
            const peerMatch = note.match(/w\/ (.+?)$/);
            const peer = peerMatch?.[1]?.trim();
            systemLines = systemLines.filter(l => !(l.startsWith('🤝') && peer && l.includes(peer)));
            systemLines.push(note);
        } else {
            if (!systemLines.includes(note)) systemLines.push(note);
        }
    } else if (note !== undefined) {
        const existingIdx = bullets.findIndex(b => b.tag === sourceTag);
        if (note === '') {
            // Empty note = delete that bullet
            if (existingIdx >= 0) bullets.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
            bullets[existingIdx].text = note;
        } else {
            bullets.push({ tag: sourceTag, text: note });
        }
    }

    // 3. Reconstruct post-separator content
    const parts: string[] = [];
    if (systemLines.length > 0) {
        parts.push(...systemLines);
    }
    if (bullets.length > 0) {
        parts.push('🟣 Private Notes via Synchro');
        parts.push('──────────────────');
        for (const b of bullets) {
            parts.push(`• ${b.tag}: ${b.text}`);
        }
    }

    let newDesc = preSection;
    if (parts.length > 0) newDesc += separator + parts.join('\n');

    // 4. Patch — store the note for THIS source in synchro_note for Synchro UI to read back
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
                    ...(!isSystemNote ? { synchro_note: note } : {}),
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

    // 1a. Search by iCalUID first — most reliable match
    try {
        const uidUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        uidUrl.searchParams.set('iCalUID', event.uid);
        uidUrl.searchParams.set('singleEvents', 'true');
        const uidRes = await fetch(uidUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (uidRes.ok) {
            const uidData = await uidRes.json();
            const existing = uidData.items?.[0];
            if (existing) {
                if (note) await savePrivateNote(accessToken, existing.id, note);
                return existing.id;
            }
        }
    } catch (e) {
        console.warn('iCalUID pre-flight failed, trying title search...', e);
    }

    // 1b. Fallback: search by title + time window
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
    const createUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    const res = await fetch(createUrl, {
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
                    ...((note && !/^(🤝|🚫)/.test(note)) ? { synchro_note: note } : {}),
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

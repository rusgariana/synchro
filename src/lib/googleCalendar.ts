import { CalendarEvent } from './calendar';

const NOTE_KEY_STORAGE = 'synchro_note_key';
const ENC_PREFIX = 'enc:';

async function getNoteKey(): Promise<CryptoKey> {
    const stored = localStorage.getItem(NOTE_KEY_STORAGE);
    if (stored) {
        const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
        return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const exported = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(NOTE_KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(exported))));
    return key;
}

async function encryptNoteText(text: string): Promise<string> {
    const key = await getNoteKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);
    return ENC_PREFIX + btoa(String.fromCharCode(...combined));
}

async function decryptNoteText(stored: string): Promise<string> {
    if (!stored.startsWith(ENC_PREFIX)) return stored + ' (legacy)';
    try {
        const key = await getNoteKey();
        const combined = Uint8Array.from(atob(stored.slice(ENC_PREFIX.length)), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    } catch {
        return stored + ' (decryption failed)';
    }
}

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

    const items = (data.items ?? []).filter((item: any) => item.start);

    const events = await Promise.all(
        items.map(async (item: any): Promise<CalendarEvent> => {
            const rawNote = item.extendedProperties?.private?.synchro_note;
            return {
                uid: item.iCalUID ?? item.id,
                title: item.summary ?? '(No Title)',
                start: item.start?.dateTime ?? item.start?.date ?? '',
                end: item.end?.dateTime ?? item.end?.date ?? '',
                description: item.description,
                location: item.location,
                url: item.htmlLink,
                googleEventId: item.id,
                privateNote: rawNote ? await decryptNoteText(rawNote) : undefined,
            };
        })
    );

    return events.filter(e => e.start && e.end);
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

    const encryptedNote = await encryptNoteText(note);

    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            extendedProperties: {
                private: {
                    synchro_note: encryptedNote,
                },
            },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to save note: ${res.status}: ${err}`);
    }
}

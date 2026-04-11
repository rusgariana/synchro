import ICAL from 'ical.js';

export interface CalendarEvent {
    uid: string;
    title: string;
    start: string; // ISO string
    end: string; // ISO string
    description?: string;
    location?: string;
    url?: string;
    // Google Calendar specific (populated when using Google Calendar API)
    googleEventId?: string;
    privateNote?: string; // from extendedProperties.private.synchro_note
}

export function parseICS(icsContent: string): CalendarEvent[] {
    try {
        const jcalData = ICAL.parse(icsContent);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        const now = new Date();

        return vevents
            .map((vevent) => {
                const event = new ICAL.Event(vevent);
                const rawUrl: string | undefined = vevent.getFirstPropertyValue('url');
                const pkMatch = event.description?.match(/https?:\/\/(?:lu\.ma|luma\.com)\/[^\s\\]+\?pk=[A-Za-z0-9\-_]+/i);
                const descUrl = pkMatch ? pkMatch[0] : undefined;
                // Fallback: any bare lu.ma/slug URL in the description (for hosted events with no pk link)
                const bareMatch = !descUrl && event.description?.match(/https?:\/\/(?:lu\.ma|luma\.com)\/[A-Za-z0-9\-_]+(?=[\s\\<]|$)/i);
                const bareUrl = bareMatch ? bareMatch[0] : undefined;

                return {
                    uid: event.uid,
                    title: event.summary,
                    start: event.startDate.toString(),
                    end: event.endDate.toString(),
                    description: event.description,
                    location: event.location,
                    url: rawUrl || descUrl || bareUrl,
                };
            })
            .filter((event) => {
                // Only include upcoming events (events that haven't ended yet)
                const eventEnd = new Date(event.end);
                if (eventEnd <= now) return false;

                // Filter out clearly virtual/online-only events.
                // Only exclude if the location IS a raw URL (Zoom/Meet link)
                // or starts with an explicit virtual keyword.
                // We do NOT exclude events with no location — the organizer may not have filled it in.
                const loc = (event.location || '').trim();
                if (loc) {
                    const isRawUrl = /^https?:\/\//i.test(loc);
                    const startsWithVirtualKeyword = /^(online|virtual|zoom meeting|google meet|microsoft teams|webinar)\b/i.test(loc);
                    if (isRawUrl || startsWithVirtualKeyword) return false;
                }

                return true;
            });
    } catch (e) {
        console.error("Failed to parse ICS", e);
        return [];
    }
}

export async function fetchCalendar(url: string): Promise<string> {
    // Use our own proxy to avoid CORS
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("Failed to fetch calendar");
    return res.text();
}

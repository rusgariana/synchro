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
                return {
                    uid: event.uid,
                    title: event.summary,
                    start: event.startDate.toString(),
                    end: event.endDate.toString(),
                    description: event.description,
                    location: event.location,
                    // @ts-ignore - ical.js types might be incomplete
                    url: vevent.getFirstPropertyValue('url'),
                };
            })
            .filter((event) => {
                // Only include upcoming events (events that haven't ended yet)
                const eventEnd = new Date(event.end);
                return eventEnd > now;
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

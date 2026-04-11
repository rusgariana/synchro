import { SavedSession } from './sessionStorage';

const METADATA_EVENT_SUMMARY = '_synchro_metadata_do_not_delete';

/**
 * Fetch session history stored in the user's Google Calendar.
 */
export async function fetchGoogleSessionHistory(accessToken: string): Promise<SavedSession[]> {
  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('q', METADATA_EVENT_SUMMARY);
    url.searchParams.set('fields', 'items(id,extendedProperties)');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const metaEvent = data.items?.find((item: any) => item.extendedProperties?.private?.synchro_history);

    if (metaEvent) {
      const historyStr = metaEvent.extendedProperties.private.synchro_history;
      return JSON.parse(historyStr);
    }
  } catch (e) {
    console.error('Failed to fetch Google session history', e);
  }
  return [];
}

/**
 * Save session history to the user's Google Calendar.
 * Uses a single hidden event to store the history JSON.
 */
export async function saveGoogleSessionHistory(accessToken: string, history: SavedSession[]): Promise<void> {
  try {
    // 1. Find existing metadata event
    const searchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    searchUrl.searchParams.set('q', METADATA_EVENT_SUMMARY);
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const searchData = await searchRes.json();
    const existingEvent = searchData.items?.find((item: any) => item.extendedProperties?.private?.synchro_history);

    // Strip heavy fields (event descriptions, etc.) before storing to GCal.
    // GCal extended properties have a hard 1024-byte limit per key.
    // Full Luma descriptions easily exceed this, causing silent truncation/corruption.
    // Lightweight fields are sufficient for cross-browser restoration.
    const minimalHistory = history.map(s => ({
      ...s,
      matches: (s.matches || []).map(m => ({
        uid: m.uid,
        title: m.title,
        start: m.start,
        end: m.end,
        location: m.location,
        url: m.url,
        // description intentionally omitted — too large
      })),
    }));
    const historyStr = JSON.stringify(minimalHistory);

    if (existingEvent) {
      // Update existing
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extendedProperties: {
            private: {
              synchro_history: historyStr,
            },
          },
        }),
      });
    } else {
      // Create new hidden event
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: METADATA_EVENT_SUMMARY,
          description: 'Synchro internal metadata. Do not delete.',
          start: { date: '1970-01-01' },
          end: { date: '1970-01-01' },
          transparency: 'transparent',
          visibility: 'private',
          extendedProperties: {
            private: {
              synchro_history: historyStr,
            },
          },
        }),
      });
    }
  } catch (e) {
    console.error('Failed to save Google session history', e);
  }
}
/**
 * Fetch the user's config (Luma ICS URL) from Google Calendar.
 */
export async function fetchGoogleConfig(accessToken: string): Promise<string | null> {
  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('q', METADATA_EVENT_SUMMARY);
    url.searchParams.set('fields', 'items(id,extendedProperties)');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const metaEvent = data.items?.find((item: any) => item.extendedProperties?.private?.synchro_config);

    if (metaEvent) {
      return metaEvent.extendedProperties.private.synchro_config;
    }
  } catch (e) {
    console.error('Failed to fetch Google config', e);
  }
  return null;
}

/**
 * Save the user's config (Luma ICS URL) to Google Calendar.
 */
export async function saveGoogleConfig(accessToken: string, lumaUrl: string): Promise<void> {
  try {
    // 1. Find existing metadata event
    const searchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    searchUrl.searchParams.set('q', METADATA_EVENT_SUMMARY);
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const searchData = await searchRes.json();
    const existingEvent = searchData.items?.find((item: any) => item.extendedProperties?.private);

    if (existingEvent) {
      // Update existing
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extendedProperties: {
            private: {
              synchro_config: lumaUrl,
            },
          },
        }),
      });
    } else {
      // Create new hidden event
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: METADATA_EVENT_SUMMARY,
          description: 'Synchro internal metadata. Do not delete.',
          start: { date: '1970-01-01' },
          end: { date: '1970-01-01' },
          transparency: 'transparent',
          visibility: 'private',
          extendedProperties: {
            private: {
              synchro_config: lumaUrl,
            },
          },
        }),
      });
    }
  } catch (e) {
    console.error('Failed to save Google config', e);
  }
}
/**
 * Fetch the user's custom profile (name and avatar URL) from Google Calendar.
 */
export async function fetchGoogleProfile(accessToken: string): Promise<{ name: string | null; avatar: string | null }> {
  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('q', METADATA_EVENT_SUMMARY);
    url.searchParams.set('fields', 'items(id,extendedProperties)');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return { name: null, avatar: null };

    const data = await res.json();
    const metaEvent = data.items?.find((item: any) => item.extendedProperties?.private);

    if (metaEvent?.extendedProperties?.private) {
      return {
        name: metaEvent.extendedProperties.private.synchro_profile_name || null,
        avatar: metaEvent.extendedProperties.private.synchro_profile_avatar || null,
      };
    }
  } catch (e) {
    console.error('Failed to fetch Google profile', e);
  }
  return { name: null, avatar: null };
}

/**
 * Save the user's custom profile (name and avatar URL) to Google Calendar.
 */
export async function saveGoogleProfile(accessToken: string, name: string | null, avatar: string | null): Promise<void> {
  try {
    // 1. Find existing metadata event
    const searchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    searchUrl.searchParams.set('q', METADATA_EVENT_SUMMARY);
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const searchData = await searchRes.json();
    const existingEvent = searchData.items?.find((item: any) => item.summary === METADATA_EVENT_SUMMARY);

    const profileData: any = {};
    if (name !== undefined) profileData.synchro_profile_name = name || '';
    if (avatar !== undefined) profileData.synchro_profile_avatar = avatar || '';

    if (existingEvent) {
      // Update existing
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extendedProperties: {
            private: profileData,
          },
        }),
      });
    } else {
      // Create new hidden event
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: METADATA_EVENT_SUMMARY,
          description: 'Synchro internal metadata. Do not delete.',
          start: { date: '1970-01-01' },
          end: { date: '1970-01-01' },
          transparency: 'transparent',
          visibility: 'private',
          extendedProperties: {
            private: profileData,
          },
        }),
      });
    }
  } catch (e) {
    console.error('Failed to save Google profile', e);
  }
}

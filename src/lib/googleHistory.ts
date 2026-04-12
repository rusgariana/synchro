import { SavedSession } from './sessionStorage';

const METADATA_EVENT_SUMMARY = '_synchro_metadata_do_not_delete';

/**
 * Fetch session history stored in the user's Google Calendar.
 * Reads chunked storage (synchro_history_0, _1, ...) to reassemble the full JSON.
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
    const metaEvent = data.items?.find((item: any) =>
      item.extendedProperties?.private?.synchro_history ||
      item.extendedProperties?.private?.synchro_history_count
    );

    if (!metaEvent) return [];

    const props = metaEvent.extendedProperties?.private || {};

    // Legacy: single key (old format)
    if (props.synchro_history && !props.synchro_history_count) {
      try { return JSON.parse(props.synchro_history); } catch { return []; }
    }

    // Chunked format
    const count = parseInt(props.synchro_history_count || '0', 10);
    if (count === 0) return [];
    let json = '';
    for (let i = 0; i < count; i++) {
      json += props[`synchro_history_${i}`] || '';
    }
    return JSON.parse(json);
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
    const existingEvent = searchData.items?.find((item: any) => item.extendedProperties?.private?.synchro_history || item.extendedProperties?.private?.synchro_history_count);

    // 2. Strip heavy fields to keep JSON small (GCal limit: 1024 bytes per key)
    const minimalHistory = history.map(s => ({
      ...s,
      matches: (s.matches || []).map(m => ({
        uid: m.uid,
        title: m.title,
        start: m.start,
        end: m.end,
        location: m.location,
        url: m.url,
      })),
    }));
    const json = JSON.stringify(minimalHistory);

    // 3. Split into 900-byte chunks (safely under the 1024-byte per-key limit)
    const CHUNK = 900;
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));

    // 4. Build extendedProperties payload
    const privateProps: Record<string, string> = {
      synchro_history_count: chunks.length.toString(),
      synchro_history: '', // clear legacy key
    };
    chunks.forEach((chunk, idx) => { privateProps[`synchro_history_${idx}`] = chunk; });

    const body = JSON.stringify({ extendedProperties: { private: privateProps } });

    if (existingEvent) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body,
      });
    } else {
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: METADATA_EVENT_SUMMARY,
          description: 'Synchro internal metadata. Do not delete.',
          start: { date: '1970-01-01' },
          end: { date: '1970-01-01' },
          transparency: 'transparent',
          visibility: 'private',
          extendedProperties: { private: privateProps },
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

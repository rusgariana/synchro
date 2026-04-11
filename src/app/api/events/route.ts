import { NextResponse } from 'next/server';
import { parseICS } from '@/lib/calendar';

/**
 * Fetch Upcoming Luma Events for a User dynamically from their ICS URL
 * 
 * GET /api/events?url=...&email=user@example.com
 * 
 * Security: Ownership is verified via personalized ?pk= ticket pages.
 * Rate-limiting: 3 failed verification attempts per email = 15 min lockout.
 */

const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const email = searchParams.get('email');

    if (!url) {
      return NextResponse.json({ error: 'Luma ICS URL is required' }, { status: 400 });
    }

    if (email) {
      const record = failedAttempts.get(email.toLowerCase());
      if (record && record.count >= MAX_ATTEMPTS) {
        const elapsed = Date.now() - record.lastAttempt;
        if (elapsed < LOCKOUT_MS) {
          const minutesLeft = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
          return NextResponse.json({ error: `Too many failed verification attempts. Please wait ${minutesLeft} minute(s).` }, { status: 429 });
        } else {
          failedAttempts.delete(email.toLowerCase());
        }
      }
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Synchro/1.0' },
      next: { revalidate: 0 }
    });
    if (!res.ok) throw new Error(`Failed to fetch ICS: ${res.statusText}`);

    const icsText = await res.text();
    const rawEvents = parseICS(icsText);

    let ownershipVerified = !email;
    let ownershipRejected = false;

    // Helper: fetch an event page and return its html
    const fetchPage = async (pageUrl: string): Promise<string | null> => {
      try {
        const r = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          next: { revalidate: 3600 }
        });
        return r.ok ? await r.text() : null;
      } catch { return null; }
    };

    // Helper: check if html indicates host/organizer role
    const isHostPage = (html: string): boolean =>
      /"is_host":\s*true/i.test(html) ||
      /"role":\s*"host"/i.test(html) ||
      /"role":\s*"organizer"/i.test(html) ||
      /"host_status"/i.test(html);

    // Helper: check owner email in html
    const checkOwnership = (html: string) => {
      if (!email || ownershipVerified) return;
      const match = html.match(/"email"\s*:\s*"([^"]+@[^"]+)"/i);
      if (match) {
        if (match[1].toLowerCase() === email.toLowerCase()) {
          ownershipVerified = true;
        } else {
          ownershipRejected = true;
          console.warn(`Synchro Security: HIJACK BLOCKED. Signed in: ${email}. Page email: ${match[1]}.`);
        }
      }
    };

    // --- PASS 1: Events with a personalised ?pk= ticket URL ---
    // These are standard RSVPs. Process these first so ownershipVerified is set
    // before we evaluate hosted events (which have no pk link).
    const ticketEvents = rawEvents.filter(e => e.description?.match(/https?:\/\/(?:lu\.ma|luma\.com)\/[^\s\\]+\?pk=[A-Za-z0-9\-_]+/i));
    const noTicketEvents = rawEvents.filter(e => !e.description?.match(/https?:\/\/(?:lu\.ma|luma\.com)\/[^\s\\]+\?pk=[A-Za-z0-9\-_]+/i));

    const ticketResults = await Promise.all(
      ticketEvents.map(async (event) => {
        const pkMatch = event.description!.match(/https?:\/\/(?:lu\.ma|luma\.com)\/[^\s\\]+\?pk=[A-Za-z0-9\-_]+/i)!;
        const html = await fetchPage(pkMatch[0]);
        if (!html) return null;

        checkOwnership(html);

        const statusMatch = html.match(/"approval_status":"([^"]+)"/);
        const status = statusMatch?.[1] ?? null;
        const hasTicket = /"event_tickets":\[\{/.test(html);
        const isHost = isHostPage(html);

        console.log(`[Synchro pk] "${event.title}" status=${status} hasTicket=${hasTicket} isHost=${isHost}`);

        return (status === 'approved' && hasTicket) || isHost ? event : null;
      })
    );

    // Security gate after pass 1
    if (ownershipRejected && !ownershipVerified) {
      if (email) {
        const key = email.toLowerCase();
        const record = failedAttempts.get(key) || { count: 0, lastAttempt: 0 };
        record.count += 1;
        record.lastAttempt = Date.now();
        failedAttempts.set(key, record);
      }
      return NextResponse.json({ error: `Verification Fail: This Luma calendar does not belong to ${email}.` }, { status: 403 });
    }

    // --- PASS 2: Events without a ?pk= link (hosted events, organiser-only entries) ---
    // If ownership was verified in pass 1, we trust the ICS source and check the public
    // event page for host signals. If ownership hasn't been verified yet, we still check
    // but cannot include if it's not a host page (could be anything).
    const noTicketResults = await Promise.all(
      noTicketEvents.map(async (event) => {
        const pageUrl = event.url;
        if (!pageUrl) return null;

        const html = await fetchPage(pageUrl);
        if (!html) {
          // If we can't fetch the page but ownership is already verified, include the event
          // (it passed the IRL location filter and is in the user's own ICS)
          if (ownershipVerified) {
            console.log(`[Synchro no-pk] "${event.title}" page unfetchable but ownership verified — including`);
            return event;
          }
          return null;
        }

        checkOwnership(html);

        const statusMatch = html.match(/"approval_status":"([^"]+)"/);
        const status = statusMatch?.[1] ?? null;
        const hasTicket = /"event_tickets":\[\{/.test(html);
        const isHost = isHostPage(html);

        console.log(`[Synchro no-pk] "${event.title}" status=${status} hasTicket=${hasTicket} isHost=${isHost} ownershipVerified=${ownershipVerified}`);

        // Accept if: host, OR approved guest ticket, OR ownership verified from another event
        if (isHost || (status === 'approved' && hasTicket) || ownershipVerified) {
          return event;
        }
        return null;
      })
    );

    if (email && ownershipVerified) failedAttempts.delete(email.toLowerCase());

    const approvedEvents = [...ticketResults, ...noTicketResults].filter(Boolean);
    return NextResponse.json({ events: approvedEvents });

  } catch (error: any) {
    console.error('Fetch Events Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

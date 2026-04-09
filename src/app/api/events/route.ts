import { NextResponse } from 'next/server';
import { parseICS } from '@/lib/calendar';

/**
 * Fetch Upcoming Luma Events for a User dynamically from their ICS URL
 * 
 * GET /api/events?url=...&email=user@example.com
 * 
 * Security: We verify ownership by extracting the guest email from Luma's 
 * personalized ticket pages. The ICS contains `?pk=` links that are unique 
 * to the calendar owner. When fetched, those pages embed the real guest 
 * email in the HTML. We compare that to the signed-in Google account.
 * 
 * Rate-limiting: 3 failed verification attempts per email = 15 min lockout.
 */

// In-memory rate limiter for verification failures
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const email = searchParams.get('email');

    if (!url) {
      return NextResponse.json({ error: 'Luma ICS URL is required' }, { status: 400 });
    }

    // Rate-limit check
    if (email) {
      const record = failedAttempts.get(email.toLowerCase());
      if (record && record.count >= MAX_ATTEMPTS) {
        const elapsed = Date.now() - record.lastAttempt;
        if (elapsed < LOCKOUT_MS) {
          const minutesLeft = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
          return NextResponse.json({ 
            error: `Too many failed verification attempts. Please wait ${minutesLeft} minute(s) before trying again.` 
          }, { status: 429 });
        } else {
          // Lockout expired, reset
          failedAttempts.delete(email.toLowerCase());
        }
      }
    }

    // Fetch the live ICS file from Luma directly using the URL passed from client
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Synchro/1.0',
      },
      next: { revalidate: 0 } // Always fetch fresh
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ICS from Luma: ${res.statusText}`);
    }

    const icsText = await res.text();
    const rawEvents = parseICS(icsText);

    // Track whether we've verified ownership via a ticket page
    let ownershipVerified = !email; // If no email provided, skip verification
    let ownershipRejected = false;

    // Concurrently fetch the exact RSVP status for each upcoming event using its unique passkey URL
    const verifiedEvents = await Promise.all(
      rawEvents.map(async (event) => {
        try {
          // Extract the personalized Luma ticket link (which contains the ?pk=g-... passkey)
          const pkMatch = event.description?.match(/https?:\/\/(?:lu\.ma|luma\.com)\/[^\s\\]+\?pk=[A-Za-z0-9\-_]+/i);
          const ticketUrl = pkMatch ? pkMatch[0] : null;

          if (!ticketUrl) return null;

          // Fetch the live event page bypassing basic bot protections
          const htmlRes = await fetch(ticketUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            next: { revalidate: 3600 } // Cache HTML fetch for 1hr to prevent rate limits
          });

          if (!htmlRes.ok) return null;

          const html = await htmlRes.text();
          
          // --- OWNERSHIP VERIFICATION ---
          // The ticket page HTML contains the guest's real email in the __NEXT_DATA__ payload.
          // We extract it and compare to the signed-in Google email.
          // We only need ONE successful match to verify the entire ICS belongs to this user.
          if (email && !ownershipVerified) {
            // Look for the guest email in various forms Luma embeds it
            const guestEmailMatch = html.match(/"email"\s*:\s*"([^"]+@[^"]+)"/i);
            if (guestEmailMatch) {
              const guestEmail = guestEmailMatch[1].toLowerCase();
              const signedInEmail = email.toLowerCase();
              if (guestEmail === signedInEmail) {
                ownershipVerified = true;
                console.log(`Synchro Security: Ownership verified for ${email} via ticket page.`);
              } else {
                // Found a different email — this ICS belongs to someone else
                ownershipRejected = true;
                console.warn(`Synchro Security: HIJACK BLOCKED. Signed in: ${email}. Ticket page guest: ${guestEmail}.`);
              }
            }
          }

          // Use regex to find the embedded approval_status in the Next.js __NEXT_DATA__ payload
          const statusMatch = html.match(/"approval_status":"([^"]+)"/);
          const status = statusMatch ? statusMatch[1] : null;

          // Check if the guest has an actual ticket (non-empty event_tickets array).
          // Confirmed "going" guests have approval_status="approved" AND a ticket entry.
          // Pending invites have approval_status="invited" with event_tickets=[].
          const hasTicket = /"event_tickets":\[\{/.test(html);

          if (status === 'approved' && hasTicket) {
            return event;
          }
          
          return null; // Ignore pending invites, waitlisted, declined, etc.
        } catch (e) {
          console.error(`Failed to verify status for ${event.title}`, e);
          return null;
        }
      })
    );

    // SECURITY GATE: If we found a different email on any ticket page, block everything.
    if (ownershipRejected && !ownershipVerified) {
      // Increment rate limiter
      if (email) {
        const key = email.toLowerCase();
        const record = failedAttempts.get(key) || { count: 0, lastAttempt: 0 };
        record.count += 1;
        record.lastAttempt = Date.now();
        failedAttempts.set(key, record);
        console.warn(`Synchro Security: Failed attempt ${record.count}/${MAX_ATTEMPTS} for ${email}.`);
      }

      return NextResponse.json({ 
        error: `Verification Fail: This Luma calendar does not belong to ${email}. The ticket pages contain a different account's email. Please sign in with the Google account you use for Luma.` 
      }, { status: 403 });
    }

    // On success, clear any previous failed attempts
    if (email && ownershipVerified) {
      failedAttempts.delete(email.toLowerCase());
    }

    // Filter out nulls (unapproved or failed fetches)
    const approvedEvents = verifiedEvents.filter((e) => e !== null);

    return NextResponse.json({ events: approvedEvents });

  } catch (error: any) {
    console.error('Fetch Events Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

interface Session {
    id: string;
    createdAt: number;
    messages: unknown[];
}

// In-memory store (resets on server restart — use Redis in production)
const sessions: Record<string, Session> = {};

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 100;
const MAX_MESSAGES_PER_SESSION = 500;
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB
const CLEANUP_INTERVAL_MS = 60 * 1000; // run at most once per minute

let lastCleanup = 0;

function cleanupSessions() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    for (const id of Object.keys(sessions)) {
        if (now - sessions[id].createdAt > SESSION_TTL_MS) {
            delete sessions[id];
        }
    }
}

function checkOrigin(request: NextRequest): NextResponse | null {
    const origin = request.headers.get('origin');
    if (origin === null) return null; // same-origin or server-to-server — allow
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        `${request.headers.get('x-forwarded-proto') ?? 'https'}://${request.headers.get('host')}`;
    if (origin !== appUrl) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
}

function requireSession(id: string): NextResponse | null {
    return sessions[id] ? null : NextResponse.json({ error: 'Session not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
    const corsError = checkOrigin(request);
    if (corsError) return corsError;

    cleanupSessions();

    const body = await request.json();
    const { action, sessionId, payload } = body;

    if (action === 'create') {
        if (Object.keys(sessions).length >= MAX_SESSIONS) {
            return NextResponse.json({ error: 'Too many active sessions' }, { status: 429 });
        }
        const newSessionId = randomBytes(16).toString('hex');
        sessions[newSessionId] = {
            id: newSessionId,
            createdAt: Date.now(),
            messages: [],
        };
        return NextResponse.json({ sessionId: newSessionId });
    } else if (action === 'join') {
        const err = requireSession(sessionId);
        if (err) return err;
        return NextResponse.json({ success: true });
    } else if (action === 'send') {
        const err = requireSession(sessionId);
        if (err) return err;
        if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
            return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
        }
        if (sessions[sessionId].messages.length >= MAX_MESSAGES_PER_SESSION) {
            return NextResponse.json({ error: 'Session message limit reached' }, { status: 429 });
        }
        sessions[sessionId].messages.push(payload);
        return NextResponse.json({ success: true });
    } else if (action === 'poll') {
        const err = requireSession(sessionId);
        if (err) return err;
        return NextResponse.json({ messages: sessions[sessionId].messages });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

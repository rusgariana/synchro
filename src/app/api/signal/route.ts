import { NextRequest, NextResponse } from 'next/server';

// Pin to a single region so all users hit the same serverless instance
export const preferredRegion = 'iad1';

// Force long-running serverless function to stay warm longer
export const maxDuration = 60;

// Persist sessions across invocations in the same warm instance.
const globalStore = globalThis as any;
if (!globalStore.__synchro_sessions) {
    globalStore.__synchro_sessions = {} as Record<string, any>;
}
const sessions: Record<string, any> = globalStore.__synchro_sessions;

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Cleanup expired sessions on each request
function cleanupSessions() {
    const now = Date.now();
    for (const id of Object.keys(sessions)) {
        if (now - sessions[id].created > SESSION_TTL_MS) {
            delete sessions[id];
        }
    }
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { action, sessionId, payload } = body;

    // Garbage-collect stale sessions
    cleanupSessions();

    if (action === 'create') {
        const newSessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
        sessions[newSessionId] = {
            id: newSessionId,
            created: Date.now(),
            messages: [],
        };
        return NextResponse.json({ sessionId: newSessionId });
    }

    if (action === 'join') {
        if (!sessions[sessionId]) {
            return NextResponse.json({ error: 'Session not found or expired. Ask your peer to create a new one.' }, { status: 404 });
        }
        // Reject if someone already joined this session (code already used)
        const hasJoiner = sessions[sessionId].messages.some((m: any) => m.type === 'JOIN');
        if (hasJoiner) {
            return NextResponse.json({ error: 'This session code has already been used.' }, { status: 409 });
        }
        return NextResponse.json({ success: true });
    }

    if (action === 'send') {
        // If the session was lost (cold start), auto-recreate it so the message isn't lost.
        // This ensures proposals sent minutes after matching still get through.
        if (!sessions[sessionId]) {
            sessions[sessionId] = {
                id: sessionId,
                created: Date.now(),
                messages: [],
            };
        }
        sessions[sessionId].messages.push(payload);
        return NextResponse.json({ success: true });
    }

    if (action === 'poll') {
        if (!sessions[sessionId]) {
            // Session doesn't exist on this instance — return empty messages instead of error.
            // The peer's next 'send' will auto-create the session.
            return NextResponse.json({ messages: [] });
        }
        // Return all messages for now. Client filters what it has seen.
        return NextResponse.json({ messages: sessions[sessionId].messages });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

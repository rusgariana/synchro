import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
    'calendar.google.com',
    'outlook.live.com',
    'outlook.office365.com',
    'icloud.com',
    'caldav.icloud.com',
]);

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
    const rawUrl = request.nextUrl.searchParams.get('url');

    if (!rawUrl) {
        return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'Only https URLs are allowed' }, { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }

    try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`Upstream error: ${res.statusText}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_BODY_BYTES) {
                reader.cancel();
                return NextResponse.json({ error: 'Response too large' }, { status: 502 });
            }
            chunks.push(value);
        }

        const merged = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }

        return new NextResponse(new TextDecoder().decode(merged), {
            headers: { 'Content-Type': 'text/calendar' },
        });
    } catch {
        return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
    }
}

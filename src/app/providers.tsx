'use client';

import { type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GoogleAuthProvider } from '@/lib/googleAuth';

export function Providers({ children }: { children: ReactNode }) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
        return <div style={{ padding: 24, color: 'red' }}>Error: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set. Copy .env.example to .env.local and fill in your Google OAuth client ID.</div>;
    }

    return (
        <GoogleOAuthProvider clientId={clientId}>
            <GoogleAuthProvider>
                {children}
            </GoogleAuthProvider>
        </GoogleOAuthProvider>
    );
}

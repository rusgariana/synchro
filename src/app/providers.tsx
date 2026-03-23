'use client';

import { type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GoogleAuthProvider } from '@/lib/googleAuth';

export function Providers({ children }: { children: ReactNode }) {
    // We expect NEXT_PUBLIC_GOOGLE_CLIENT_ID to be provided by the user in .env.local
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'MISSING_CLIENT_ID';

    return (
        <GoogleOAuthProvider clientId={clientId}>
            <GoogleAuthProvider>
                {children}
            </GoogleAuthProvider>
        </GoogleOAuthProvider>
    );
}

'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';

export interface GoogleUser {
    email: string;
    name: string;
    picture: string;
}

interface GoogleAuthContextType {
    user: GoogleUser | null;
    accessToken: string | null;
    isLoading: boolean;
    signIn: () => void;
    signOut: () => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextType>({
    user: null,
    accessToken: null,
    isLoading: false,
    signIn: () => {},
    signOut: () => {},
});

/**
 * Inner provider — must live inside GoogleOAuthProvider (from @react-oauth/google).
 * Exposes user info + access token for Google Calendar API calls.
 */
export function GoogleAuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<GoogleUser | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const login = useGoogleLogin({
        // calendar.events scope allows read + write (PATCH extendedProperties)
        scope: 'https://www.googleapis.com/auth/calendar.events',
        prompt: 'consent', // Force consent screen so they can check the box
        onSuccess: async (tokenResponse) => {
            // Check if the user actually granted the requested calendar scope
            if (!tokenResponse.scope.includes('calendar.events')) {
                alert('You must check the box to allow Synchro to access your calendar! Please sign out and sign back in.');
                setIsLoading(false);
                return;
            }

            try {
                // Fetch basic user profile using the access token
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const info = await res.json();
                setUser({ email: info.email, name: info.name, picture: info.picture });
                setAccessToken(tokenResponse.access_token);
            } catch (e) {
                console.error('Failed to fetch Google user info', e);
            } finally {
                setIsLoading(false);
            }
        },
        onError: (err) => {
            console.error('Google login error', err);
            setIsLoading(false);
        },
    });

    const signIn = () => {
        setIsLoading(true);
        login();
    };

    const signOut = () => {
        googleLogout();
        setUser(null);
        setAccessToken(null);
    };

    return (
        <GoogleAuthContext.Provider value={{ user, accessToken, isLoading, signIn, signOut }}>
            {children}
        </GoogleAuthContext.Provider>
    );
}

export function useGoogleAuth() {
    return useContext(GoogleAuthContext);
}

'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { fetchGoogleProfile, saveGoogleProfile } from './googleHistory';

export interface GoogleUser {
    email: string;
    name: string;
    picture: string;
}

interface GoogleAuthContextType {
    user: GoogleUser | null;
    accessToken: string | null;
    isLoading: boolean;
    isTokenExpired: boolean;  // true when the in-memory token is expired/nearly expired
    customName: string | null;
    customAvatar: string | null;
    setCustomProfile: (name: string | null, avatar: string | null) => void;
    signIn: () => void;
    signOut: () => void;
    expireSession: () => void;
}

/** Standalone helper — can be called before any API call to gate on token validity */
export function checkTokenExpiry(): boolean {
    try {
        const expiresAt = localStorage.getItem('synchro_token_expires_at');
        if (!expiresAt) return true; // No expiry stored — treat as expired
        return Date.now() > Number(expiresAt);
    } catch {
        return true;
    }
}

const GoogleAuthContext = createContext<GoogleAuthContextType>({
    user: null,
    accessToken: null,
    isLoading: false,
    isTokenExpired: false,
    customName: null,
    customAvatar: null,
    setCustomProfile: () => {},
    signIn: () => {},
    signOut: () => {},
    expireSession: () => {},
});

/**
 * Inner provider — must live inside GoogleOAuthProvider (from @react-oauth/google).
 * Exposes user info + access token for Google Calendar API calls.
 */
export function GoogleAuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<GoogleUser | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTokenExpired, setIsTokenExpired] = useState(false);
    
    // Custom Profile Overrides
    const [customName, setCustomName] = useState<string | null>(null);
    const [customAvatar, setCustomAvatar] = useState<string | null>(null);

    const handleTokenResponse = async (tokenResponse: { access_token: string; expires_in?: number; scope: string }) => {
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
            const userInfo = { email: info.email, name: info.name, picture: info.picture };
            
            // Calculate token expiry: Google tokens last 3600s by default
            const expiresIn = tokenResponse.expires_in ?? 3600;
            const expiresAt = Date.now() + expiresIn * 1000;

            // Update state
            setUser(userInfo);
            setAccessToken(tokenResponse.access_token);
            
            // Persist token with expiry timestamp
            localStorage.setItem('synchro_user', JSON.stringify(userInfo));
            localStorage.setItem('synchro_token', tokenResponse.access_token);
            localStorage.setItem('synchro_token_expires_at', String(expiresAt));
            setIsTokenExpired(false); // Clear any previous expiry flag

            // FETCH CUSTOM PROFILE FROM GOOGLE CALENDAR
            try {
                const profile = await fetchGoogleProfile(tokenResponse.access_token);
                if (profile.name) {
                    setCustomName(profile.name);
                    localStorage.setItem('synchro_custom_name', profile.name);
                }
                if (profile.avatar) {
                    setCustomAvatar(profile.avatar);
                    localStorage.setItem('synchro_custom_avatar', profile.avatar);
                }
            } catch (e) {
                console.error('Failed to restore custom profile from Google', e);
            }
        } catch (e) {
            console.error('Failed to fetch Google user info', e);
        } finally {
            setIsLoading(false);
        }
    };

    // Load persisted session on mount
    useEffect(() => {
        try {
            const storedUser = localStorage.getItem('synchro_user');
            const storedToken = localStorage.getItem('synchro_token');
            const storedExpiresAt = localStorage.getItem('synchro_token_expires_at');

            const isExpired = storedExpiresAt && Date.now() > Number(storedExpiresAt);

            if (isExpired) {
                // Token has expired — clear it so the user is prompted to re-login
                console.warn('Synchro: stored access token has expired, clearing session.');
                localStorage.removeItem('synchro_token');
                localStorage.removeItem('synchro_token_expires_at');
                // Keep the user profile so the UI shows their name, but nullify the token
                if (storedUser) setUser(JSON.parse(storedUser));
                setIsTokenExpired(true);
            } else if (storedUser && storedToken) {
                setUser(JSON.parse(storedUser));
                setAccessToken(storedToken);

                // RE-FETCH PROFILE ON MOUNT TO ENSURE FRESHNESS
                fetchGoogleProfile(storedToken).then(profile => {
                    if (profile.name) {
                        setCustomName(profile.name);
                        localStorage.setItem('synchro_custom_name', profile.name);
                    }
                    if (profile.avatar) {
                        setCustomAvatar(profile.avatar);
                        localStorage.setItem('synchro_custom_avatar', profile.avatar);
                    }
                }).catch(e => console.error('Failed to sync profile on mount', e));
            }

            const storedName = localStorage.getItem('synchro_custom_name');
            const storedAvatar = localStorage.getItem('synchro_custom_avatar');
            if (storedName) setCustomName(storedName);
            if (storedAvatar) setCustomAvatar(storedAvatar);
        } catch (e) {
            console.error('Failed to load Google session', e);
        }
    }, []);

    // Check for token in URL hash (Redirect Flow)
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.substring(1));
            const access_token = params.get('access_token');
            const expires_in = params.get('expires_in');
            const scope = params.get('scope');

            if (access_token) {
                setIsLoading(true);
                handleTokenResponse({
                    access_token,
                    expires_in: expires_in ? Number(expires_in) : undefined,
                    scope: scope || ''
                }).then(() => {
                    // Clear the hash without reloading the page
                    window.history.replaceState(null, '', window.location.pathname);
                });
            }
        }
    }, []);

    // Watch for in-session token expiry — check every 30s, warn 60s before expiry
    useEffect(() => {
        if (!accessToken) return;
        const checkExpiry = () => {
            const expiresAt = localStorage.getItem('synchro_token_expires_at');
            if (!expiresAt) return;
            const msRemaining = Number(expiresAt) - Date.now();
            if (msRemaining < 60_000) { // Less than 60s left
                setIsTokenExpired(true);
                setAccessToken(null); // Stop using the expired token
                localStorage.removeItem('synchro_token');
                localStorage.removeItem('synchro_token_expires_at');
                console.warn('Synchro: access token expired during session.');
            }
        };
        const timer = setInterval(checkExpiry, 30_000);
        return () => clearInterval(timer);
    }, [accessToken]);

    const signIn = () => {
        setIsLoading(true);
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.error('Google Client ID is missing');
            alert('Debug: Google Client ID is missing in Vercel. Please check Project Settings > Environment Variables.');
            setIsLoading(false);
            return;
        }

        const scope = 'openid profile email https://www.googleapis.com/auth/calendar.events';
        const redirectUri = window.location.origin;
        
        // Manual OAuth2 Redirect Flow (Implicit)
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
            `client_id=${encodeURIComponent(clientId)}&` +
            `response_type=token&` +
            `scope=${encodeURIComponent(scope)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `prompt=consent&` +
            `include_granted_scopes=true`;

        window.location.assign(authUrl);
    };

    const signOut = () => {
        googleLogout();
        setUser(null);
        setAccessToken(null);
        setIsTokenExpired(false);
        localStorage.removeItem('synchro_user');
        localStorage.removeItem('synchro_token');
        localStorage.removeItem('synchro_token_expires_at');
        localStorage.removeItem('synchro_custom_name');
        localStorage.removeItem('synchro_custom_avatar');
        setCustomName(null);
        setCustomAvatar(null);
    };

    const setCustomProfile = async (name: string | null, avatar: string | null) => {
        setCustomName(name);
        setCustomAvatar(avatar);
        
        // Persist locally
        if (name) localStorage.setItem('synchro_custom_name', name);
        else localStorage.removeItem('synchro_custom_name');
        if (avatar) localStorage.setItem('synchro_custom_avatar', avatar);
        else localStorage.removeItem('synchro_custom_avatar');

        // Persist to Google Calendar (Cloud)
        if (accessToken) {
            try {
                await saveGoogleProfile(accessToken, name, avatar);
            } catch (e) {
                console.error('Failed to save profile to Google Calendar', e);
            }
        }
    };

    const expireSession = () => {
        setIsTokenExpired(true);
        setAccessToken(null);
        localStorage.removeItem('synchro_token');
        localStorage.removeItem('synchro_token_expires_at');
        console.warn('Synchro: session expired programmatically.');
    };

    return (
        <GoogleAuthContext.Provider value={{ user, accessToken, isLoading, isTokenExpired, customName, customAvatar, setCustomProfile, signIn, signOut, expireSession }}>
            {children}
        </GoogleAuthContext.Provider>
    );
}

export function useGoogleAuth() {
    return useContext(GoogleAuthContext);
}

import { CalendarEvent } from './calendar';

export interface SavedSession {
    id: string; // the sessionId or a new UID if it's not available
    role: string;
    date: string; // ISO string
    matches: CalendarEvent[];
    notes: Record<string, string>; // the decrypted peer notes keyed by event UID
}

const STORAGE_KEY = 'synchro_saved_sessions';

export function getSavedSessions(): SavedSession[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored) as SavedSession[];
    } catch (e) {
        console.error('Failed to parse saved sessions', e);
        return [];
    }
}

export function saveSession(session: SavedSession): void {
    if (typeof window === 'undefined') return;
    try {
        const current = getSavedSessions();
        const existingIndex = current.findIndex(s => s.id === session.id);
        
        if (existingIndex >= 0) {
            // Update existing
            current[existingIndex] = session;
        } else {
            // Add new
            current.unshift(session);
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
        console.error('Failed to save session', e);
    }
}

export function deleteSession(id: string): void {
    if (typeof window === 'undefined') return;
    try {
        const current = getSavedSessions();
        const filtered = current.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
        console.error('Failed to delete session', e);
    }
}

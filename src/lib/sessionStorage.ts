import { CalendarEvent } from './calendar';
import { makeLocalStorageAES } from './aesLocalStorage';

export interface SavedSession {
    id: string;
    role: 'INITIATOR' | 'JOINER';
    date: string; // ISO string
    matches: CalendarEvent[];
    notes: Record<string, string>; // decrypted peer notes keyed by event UID
}

const STORAGE_KEY = 'synchro_saved_sessions';

const sessionAES = makeLocalStorageAES('synchro_sessions_key');

export async function getSavedSessions(): Promise<SavedSession[]> {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        // null = legacy plaintext (pre-encryption migration) — parse as-is
        const decrypted = await sessionAES.decrypt(stored) ?? stored;
        return JSON.parse(decrypted) as SavedSession[];
    } catch {
        return [];
    }
}

export async function saveSession(session: SavedSession): Promise<SavedSession[]> {
    if (typeof window === 'undefined') return [];
    let current: SavedSession[] = [];
    try {
        current = await getSavedSessions();
        const existingIndex = current.findIndex(s => s.id === session.id);
        if (existingIndex >= 0) {
            current[existingIndex] = session;
        } else {
            current.unshift(session);
        }
        const encrypted = await sessionAES.encrypt(JSON.stringify(current));
        localStorage.setItem(STORAGE_KEY, encrypted);
        return current;
    } catch (e) {
        console.error('Failed to save session', e);
        return current;
    }
}

export async function deleteSession(id: string): Promise<SavedSession[]> {
    if (typeof window === 'undefined') return [];
    let current: SavedSession[] = [];
    try {
        current = await getSavedSessions();
        const filtered = current.filter(s => s.id !== id);
        const encrypted = await sessionAES.encrypt(JSON.stringify(filtered));
        localStorage.setItem(STORAGE_KEY, encrypted);
        return filtered;
    } catch (e) {
        console.error('Failed to delete session', e);
        return current;
    }
}

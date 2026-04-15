/**
 * AES-GCM-over-localStorage helper.
 * Key is stored alongside the ciphertext in localStorage.
 * Protects against offline file-copy attacks; does NOT protect against XSS
 * or extensions that can read localStorage directly.
 */

const ENC_PREFIX = 'enc:';

function toBase64(bytes: Uint8Array): string {
    return btoa(Array.from(bytes, c => String.fromCharCode(c)).join(''));
}

function fromBase64(str: string): Uint8Array {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

/**
 * Returns an { encrypt, decrypt } pair backed by a named localStorage key.
 * The CryptoKey is cached as a promise so concurrent calls never double-import.
 */
export function makeLocalStorageAES(keyStorageName: string) {
    let keyPromise: Promise<CryptoKey> | null = null;

    function getKey(): Promise<CryptoKey> {
        if (keyPromise) return keyPromise;
        keyPromise = (async () => {
            const stored = localStorage.getItem(keyStorageName);
            if (stored) {
                const raw = fromBase64(stored);
                return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
            }
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
            );
            const exported = await crypto.subtle.exportKey('raw', key);
            localStorage.setItem(keyStorageName, toBase64(new Uint8Array(exported)));
            return key;
        })();
        return keyPromise;
    }

    async function encrypt(plaintext: string): Promise<string> {
        const key = await getKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        const combined = new Uint8Array(12 + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), 12);
        return ENC_PREFIX + toBase64(combined);
    }

    /**
     * Returns the decrypted plaintext, or null if the value is not in our
     * format (legacy plaintext) or decryption fails.
     */
    async function decrypt(stored: string): Promise<string | null> {
        if (!stored.startsWith(ENC_PREFIX)) return null;
        try {
            const key = await getKey();
            const combined = fromBase64(stored.slice(ENC_PREFIX.length));
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            return new TextDecoder().decode(decrypted);
        } catch {
            return null;
        }
    }

    return { encrypt, decrypt };
}

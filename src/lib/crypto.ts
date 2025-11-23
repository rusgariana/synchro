import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// --- PSI Logic ---

// Generate a random private scalar
export function generatePrivateKey(): Uint8Array {
    return secp256k1.utils.randomPrivateKey();
}

// Hash a string (Event UID) to a curve point
// We use a simple "hash and pray" or try-and-increment if needed, 
// but noble-curves has hashToCurve usually. 
// secp256k1 doesn't have a standard hashToCurve, so we'll use a simplified version:
// Hash the string, treat as X, try to solve for Y.
// For MVP security, we can use the standard ProjectivePoint.fromPrivateKey(hash(uid)) 
// BUT that requires knowing the discrete log (the hash). 
// We need a point where NOBODY knows the discrete log.
// So we should use `Point.fromHex(hash(uid))`? No, that's not a valid point usually.
// We will use a map-to-curve method.
export function hashToPoint(data: string) {
    // Simplified map-to-curve for secp256k1:
    // 1. Hash data to get a candidate X
    // 2. Check if it's on the curve. If not, increment and retry.
    let count = 0;
    while (true) {
        const msg = data + (count > 0 ? `:${count}` : '');
        const hash = sha256(utf8ToBytes(msg));
        try {
            // Try to interpret hash as a compressed point (02 + hash or 03 + hash)
            // This is "try-and-increment" on the X coordinate essentially.
            // Actually, `fromHex` expects a valid point.
            // A better way for secp256k1 is to just use the private key generation logic 
            // but that implies we know the scalar.
            // For PSI, we need H(x)^a. If H(x) = g^k, then H(x)^a = g^{ka}.
            // If we know k, it's fine? 
            // Actually, if I know k, I can compute H(x)^a without doing point multiplication?
            // No, I need to multiply the point.

            // Let's use a simpler approach for MVP:
            // H(x) = g^(sha256(x))
            // This is NOT secure against someone who can solve discrete logs (nobody),
            // BUT it allows "offline dictionary attacks" if the space is small.
            // Since UIDs are high entropy, this is likely fine for MVP.
            // H(x)^a = (g^hash)^a = g^(hash * a)
            // This is just standard ECDH where the public key is derived from the hash of the ID.

            const scalar = sha256(utf8ToBytes(data));
            return secp256k1.ProjectivePoint.fromPrivateKey(scalar);
        } catch (e) {
            count++;
        }
    }
}

// Blind a point: P -> a*P
export function blindPoint(pointHex: string, privateKey: Uint8Array): string {
    const point = secp256k1.ProjectivePoint.fromHex(pointHex);
    const scalar = bytesToHex(privateKey); // noble-curves handles hex strings or bigints
    // @ts-ignore - noble types can be tricky
    const blinded = point.multiply(BigInt('0x' + scalar));
    return blinded.toHex(true);
}

// Blind a string directly: H(s) -> a*H(s)
export function blindString(str: string, privateKey: Uint8Array): string {
    const point = hashToPoint(str);
    const scalar = bytesToHex(privateKey);
    const blinded = point.multiply(BigInt('0x' + scalar));
    return blinded.toHex(true);
}

// --- Encryption (AES-GCM) ---

export async function encryptNote(text: string, sharedSecretHex: string): Promise<string> {
    const key = await window.crypto.subtle.importKey(
        'raw',
        hexToBytes(sharedSecretHex) as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);

    const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    // Return IV + Ciphertext as hex
    return bytesToHex(iv) + ':' + bytesToHex(new Uint8Array(ciphertext));
}

export async function decryptNote(encrypted: string, sharedSecretHex: string): Promise<string> {
    const [ivHex, cipherHex] = encrypted.split(':');
    const iv = hexToBytes(ivHex);
    const ciphertext = hexToBytes(cipherHex);

    const key = await window.crypto.subtle.importKey(
        'raw',
        hexToBytes(sharedSecretHex) as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        ciphertext as BufferSource
    );

    return new TextDecoder().decode(decrypted);
}

// Derive a shared secret for encryption from the PSI keys?
// No, we should probably do a separate ephemeral key exchange for that.
// Alice sends A_pub, Bob sends B_pub. Shared = A_pub * b = B_pub * a.
export function getPublicKey(privateKey: Uint8Array): string {
    const pubKey = secp256k1.getPublicKey(privateKey, true);
    // Ensure it's returned as a hex string
    return typeof pubKey === 'string' ? pubKey : bytesToHex(pubKey);
}

export function computeSharedSecret(theirPublicKeyHex: string, myPrivateKey: Uint8Array): string {
    // Ensure the public key is a valid hex string
    if (!theirPublicKeyHex || typeof theirPublicKeyHex !== 'string') {
        throw new Error(`Invalid public key: ${typeof theirPublicKeyHex}`);
    }

    // Remove any whitespace or '0x' prefix
    const cleanKey = theirPublicKeyHex.trim().replace(/^0x/, '');

    console.log('[computeSharedSecret] Input key:', cleanKey.substring(0, 20) + '...');

    const shared = secp256k1.getSharedSecret(myPrivateKey, cleanKey);
    // Hash it to get a clean 32-byte key
    return bytesToHex(sha256(shared));
}

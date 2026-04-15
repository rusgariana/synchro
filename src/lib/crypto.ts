import { secp256k1, hashToCurve } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// --- PSI Logic ---

// Generate a random private scalar
export function generatePrivateKey(): Uint8Array {
    return secp256k1.utils.randomPrivateKey();
}

// Hash a string to a curve point with no known discrete log (RFC 9380 hash-to-curve)
export function hashToPoint(data: string) {
    return hashToCurve(utf8ToBytes(data));
}

// Blind a point: P -> a*P
export function blindPoint(pointHex: string, privateKey: Uint8Array): string {
    const point = secp256k1.ProjectivePoint.fromHex(pointHex);
    const scalar = BigInt('0x' + bytesToHex(privateKey));
    const blinded = point.multiply(scalar);
    return blinded.toHex(true);
}

// Blind a string directly: H(s) -> a*H(s)
export function blindString(str: string, privateKey: Uint8Array): string {
    const point = hashToCurve(utf8ToBytes(str));
    const scalar = BigInt('0x' + bytesToHex(privateKey));
    // H2CPoint type doesn't expose toHex but the underlying secp256k1 point does
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (point.multiply(scalar) as any).toHex(true);
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

export function getPublicKey(privateKey: Uint8Array): string {
    const pubKey = secp256k1.getPublicKey(privateKey, true);
    return typeof pubKey === 'string' ? pubKey : bytesToHex(pubKey);
}

// Derive a shared secret using ECDH + HKDF-SHA256
export function computeSharedSecret(theirPublicKeyHex: string, myPrivateKey: Uint8Array): string {
    if (!theirPublicKeyHex || typeof theirPublicKeyHex !== 'string') {
        throw new Error(`Invalid public key: ${typeof theirPublicKeyHex}`);
    }

    const cleanKey = theirPublicKeyHex.trim().replace(/^0x/, '');
    const shared = secp256k1.getSharedSecret(myPrivateKey, cleanKey);
    // HKDF-SHA256: derive 32-byte key with domain-separated info label
    const derived = hkdf(sha256, shared, undefined, utf8ToBytes('synchro-note-encryption-v1'), 32);
    return bytesToHex(derived);
}

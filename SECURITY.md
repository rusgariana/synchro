# Security Model

## What Synchro protects

Synchro uses **Private Set Intersection (PSI)** so two users can find their shared calendar events without either party — or the relay server — learning anything beyond the intersection itself.

- The relay server sees only blinded elliptic-curve points. It cannot reconstruct calendar events or identify which events matched.
- Notes exchanged after matching are end-to-end encrypted with AES-GCM using a key derived via ECDH + HKDF-SHA256.
- Calendar data and session history stored locally are AES-GCM encrypted with a device-bound key.

## Trust model

Synchro converts **social trust** into **cryptographic privacy**.

The session code is a 128-bit CSPRNG value shared over a pre-existing trusted channel (iMessage, WhatsApp, in-person). The security of the handshake depends on that channel: an attacker who can intercept and control the code-sharing channel can perform a man-in-the-middle attack on the ECDH exchange.

### Relay trust assumption

The signal relay is a rendezvous server, not a trusted party. It routes messages but does not authenticate peers. A compromised relay could substitute ECDH public keys during the handshake.

**Threat requires all of:**
1. The relay is actively compromised (not just logging)
2. The attacker intercepts the out-of-band channel to obtain the session code
3. The attacker actively relays both connections in real time

This is accepted as a residual risk given the stated use case (social contacts sharing codes over trusted channels).

### Session fingerprint

After matching completes, both screens display a **session fingerprint** — a short code derived from the ECDH shared secret (e.g. `4821 3077`). Both peers derive the same value independently; the relay never sees it.

Users who want to verify the handshake was not tampered with can compare fingerprints over the same channel they shared the session code on. This is equivalent to Signal's Safety Numbers — opt-in, informational, never a blocker.

## What Synchro does not protect against

- **Malicious relay operator** performing active MITM (see above)
- **XSS or malicious browser extensions** that can read localStorage directly — the AES-GCM encryption protects against offline file-copy attacks, not in-browser compromise
- **Compromised Google OAuth tokens** — revocation happens on sign-out, but a stolen token before revocation grants calendar access

## Reporting vulnerabilities

Please open a GitHub issue marked **[Security]** or contact the maintainers directly.

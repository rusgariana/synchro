# Synchro 🔒

**Privacy-preserving calendar matching powered by cryptography**

Synchro allows two people to discover mutual events from their Lu.ma calendars without revealing their full schedules. Built with Privacy-Preserving Private Set Intersection (PSI) using Commutative Elliptic Curve Diffie-Hellman and a 100% database-less architecture.

🔗 **Live:** [https://synchro.wtf](https://synchro.wtf)
🔗 **Testing:** [https://synchro-git-testing-rusgarians-projects.vercel.app](https://synchro-git-testing-rusgarians-projects.vercel.app)

## Features

- 🔐 **Privacy-First**: Only mutual events are revealed using ECDH-based PSI — non-matching events remain computationally hidden
- 🔑 **Google Sign-In**: Securely link your Google account to verify ownership
- 📅 **Lu.ma Ownership Verification**: Automatically verifies you own the Luma feed you import
- 🔒 **End-to-End Encrypted Notes**: Add private notes to matched events (stored only in your Google Calendar)
- 🤝 **Meeting Proposals**: Propose, accept, reject, or cancel meetings with real-time sync to Google Calendar
- ⚡ **Zero-Database**: No sensitive data is stored on any server. Everything is client-side or in-memory.
- 🔔 **Session Notifications**: Badge indicators for pending actions across sessions
- 📤 **Auto GCal Export**: Accepted meetings are automatically exported with meeting markers (*𝘷𝘪𝘢 𝘚𝘺𝘯𝘤𝘩𝘳𝘰*)
- 📝 **Stacked Private Notes**: Per-event notes from My Events and each session are stored as separate bullets in GCal
- 🎨 **Modern UI**: Landing page with glassmorphism design and smooth transitions

## How It Works

### The PSI Protocol

Synchro uses a **Commutative ECDH-based Private Set Intersection** protocol:

1. **Alice** blinds her event UIDs: `{aH(x₁), aH(x₂), ...}`
2. **Bob** double-blinds Alice's set and sends his own: `{abH(x₁), ...}` and `{bH(y₁), ...}`
3. **Alice** double-blinds Bob's set: `{abH(y₁), ...}`
4. Both parties compare `abH(xᵢ) = abH(yⱼ)` to find matches

**Security**: Based on the hardness of the Discrete Log Problem on secp256k1 (same curve as Bitcoin/Ethereum)

### Zero-Database Architecture

- ✅ **No Database**: No PostgreSQL, MongoDB, Prisma, or any persistent server-side storage.
- ✅ **Ownership Verification**: Luma feed ownership verified by checking guest emails in Luma ticket pages against your signed-in Google email.
- ✅ **Local History**: Matching history stored in your own Google Calendar metadata or browser localStorage.
- ✅ **Ephemeral Signaling**: Temporary sessions use in-memory signaling with gossip-based recovery, wiped automatically after 4 hours.
- ✅ **Session Merging**: Duplicate sessions with the same peer (by email) are automatically detected and merged.

### Signal Delivery

The signaling API uses a gossip protocol for cold-start recovery:
- Each client tracks all messages it sends
- On every poll, the client includes its sent-message history
- The server merges messages with deduplication
- This ensures proposals are never lost even if the Vercel instance recycles

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Authentication**: Google OAuth 2.0
- **Cryptography**: @noble/curves (secp256k1), @noble/hashes (SHA-256)
- **Calendar**: ical.js
- **Deployment**: Vercel (pinned to `iad1` region)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Google Client ID (see DEPLOYMENT.md)

### Installation

```bash
# Clone the repository
git clone https://github.com/rusgariana/synchro.git
cd synchro

# Install dependencies
npm install

# Run the development server
npm run dev
```

### Usage

1. **Sign In**: Click "Sign In" to connect your Google account.
2. **Load Calendar**:
   - Go to Lu.ma → Settings → Calendar Syncing → Add iCal Subscription
   - Copy the ICS URL and paste it into Synchro.
3. **Verification**: Synchro will verify that the feed belongs to your email.
4. **Create/Join Session**:
   - **User A**: Click "Start Session" and share the Session ID.
   - **User B**: Enter the Session ID and click "Join."
5. **View Matches**: Mutual events are discovered using the PSI protocol.
6. **Propose Meetings**: Use the action buttons to propose, accept, reject, or cancel meetings.
7. **Notes**: Add private notes per event from My Events or within individual sessions — each is stored separately.

## Project Structure

```
synchro/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── events/           # Luma fetch & ownership verification
│   │   │   └── signal/           # In-memory signaling with gossip recovery
│   │   ├── layout.tsx            # Root layout with providers
│   │   └── page.tsx              # Main app (Match, My Events, Sessions tabs)
│   ├── components/
│   │   ├── MatchingSession.tsx   # PSI protocol, matching, proposals, notes
│   │   └── GoogleSignIn.tsx      # OAuth integration
│   └── lib/
│       ├── calendar.ts           # ICS parsing utilities
│       ├── crypto.ts             # PSI & encryption (secp256k1, AES-GCM)
│       ├── googleAuth.tsx        # Auth context & token management
│       ├── googleCalendar.ts     # GCal export, notes, event verification
│       ├── googleHistory.ts      # Session history sync via GCal metadata
│       ├── lumaEvents.ts         # Luma event fetching & parsing
│       └── sessionStorage.ts     # Local session storage management
├── public/                       # Static assets (logo, fonts)
└── package.json
```

## Security Considerations

- ✅ Client-side PSI prevents revealing non-matching events.
- ✅ Ownership verification prevents "feed hijacking."
- ✅ Zero server-side persistence of PII or calendar data.
- ✅ Private notes are isolated per source (My Events vs. each session).
- ✅ Session merging uses email-only matching — never display names.
- ✅ Used session codes are rejected with a clear error message.

## License

MIT License

## Contact

GitHub: [@rusgariana](https://github.com/rusgariana)
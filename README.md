# Synchro 🔒

**Privacy-preserving calendar matching powered by cryptography**

Synchro allows two people to discover mutual events from their Lu.ma calendars without revealing their full schedules. Built with Zero-Knowledge Private Set Intersection (PSI) and end-to-end encryption.

🔗 **Live Demo:** [https://synchro-social.vercel.app/](https://synchro-social.vercel.app/)

## Features

- 🔐 **Privacy-First**: Only mutual events are revealed using ECDH-based PSI
- 🌐 **ENS Integration**: Connect with your Ethereum wallet and ENS name
- 📅 **Lu.ma Calendar Support**: Import events from your Lu.ma ICS feed
- 🔒 **End-to-End Encrypted Notes**: Add private notes to matched events
- ⚡ **Client-Side Processing**: All sensitive operations happen in your browser
- 🎨 **Modern UI**: Beautiful dark mode with glassmorphism design

## How It Works

### The PSI Protocol

Synchro uses an **ECDH-based Private Set Intersection** protocol:

1. **Alice** blinds her event UIDs: `{aH(x₁), aH(x₂), ...}`
2. **Bob** double-blinds Alice's set and sends his own: `{abH(x₁), ...}` and `{bH(y₁), ...}`
3. **Alice** double-blinds Bob's set: `{abH(y₁), ...}`
4. Both parties compare `abH(xᵢ) = abH(yⱼ)` to find matches

**Security**: Based on the hardness of the Discrete Log Problem on secp256k1 (same curve as Bitcoin/Ethereum)

### Privacy Guarantees

- ✅ Neither party learns about non-matching events
- ✅ No third party can learn anything (all processing is client-side)
- ✅ Calendar data never leaves your browser
- ✅ Notes are encrypted with AES-GCM using ECDH-derived keys

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Web3**: Wagmi + Viem + RainbowKit
- **Cryptography**: @noble/curves (secp256k1), @noble/hashes
- **Calendar**: ical.js

## Getting Started

### Prerequisites

- Node.js 18+ (tested with v24.11.1)
- npm or yarn
- A Web3 wallet (MetaMask, Brave Wallet, etc.)

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

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. **Connect Wallet**: Click "Connect Wallet" and connect your Ethereum wallet
2. **Load Calendar**: 
   - Go to Lu.ma → Settings → Calendar Syncing → Add iCal Subscription
   - Copy the ICS URL
   - Paste it into Synchro
3. **Create/Join Session**:
   - **User A**: Click "Start Session" and share the Session ID
   - **User B**: Enter the Session ID and click "Join"
4. **View Matches**: The app automatically finds mutual events
5. **Add Notes**: Click the lock icon on any matched event to add encrypted notes

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to Vercel.

**Quick Deploy:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/rusgariana/synchro)

## Project Structure

```
synchro/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── proxy/         # CORS proxy for ICS feeds
│   │   │   └── signal/        # Signaling API for PSI handshake
│   │   ├── layout.tsx         # Root layout with providers
│   │   └── page.tsx           # Main landing page
│   ├── components/
│   │   ├── CalendarInput.tsx  # ICS URL input component
│   │   ├── ConnectWallet.tsx  # Wallet connection with ENS
│   │   └── MatchingSession.tsx # PSI protocol & matching logic
│   └── lib/
│       ├── calendar.ts        # ICS parsing utilities
│       ├── crypto.ts          # PSI & encryption functions
│       └── wagmi.ts           # Web3 configuration
├── public/                    # Static assets
└── package.json
```

## Security Considerations

### Current Implementation (MVP)

- ✅ Client-side PSI prevents revealing non-matching events
- ✅ E2E encryption for notes
- ✅ No server-side storage of calendar data
- ⚠️ Sessions use in-memory storage (ephemeral)
- ⚠️ Hash-to-curve uses simplified approach (suitable for high-entropy UIDs)

### For Production

Consider adding:
- Persistent session storage (Redis/Database)
- Rate limiting on API routes
- More robust hash-to-curve implementation
- Formal security audit

## Known Limitations

- **Session Persistence**: Sessions are lost on server restart (fine for MVP)
- **Scalability**: In-memory signaling doesn't scale horizontally
- **Calendar Support**: Currently only Lu.ma ICS feeds (can be extended)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Cryptography powered by [@noble/curves](https://github.com/paulmillr/noble-curves)
- Web3 integration via [Wagmi](https://wagmi.sh/)

## Contact

- GitHub: [@rusgariana](https://github.com/rusgariana)
- Repository: [synchro](https://github.com/rusgariana/synchro)

---

**Privacy-first calendar matching. No compromises.** 🔒
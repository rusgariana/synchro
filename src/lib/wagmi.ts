import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
    chains: [mainnet, sepolia],
    connectors: [
        injected(),
        walletConnect({
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
        }),
    ],
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
    },
});

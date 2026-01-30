import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
    appName: 'Synchro',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    chains: [mainnet, sepolia],
    ssr: true, // If your dApp uses server side rendering (SSR)
});

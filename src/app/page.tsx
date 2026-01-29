'use client';

import { useState, useEffect } from 'react';
import { ConnectWallet } from '@/components/ConnectWallet';
import { CalendarInput } from '@/components/CalendarInput';
import { MatchingSession } from '@/components/MatchingSession';
import { CalendarEvent } from '@/lib/calendar';
import { useAccount } from 'wagmi';

export default function Home() {
    const { isConnected } = useAccount();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <main className="flex min-h-screen flex-col items-center p-8 relative overflow-hidden bg-background text-foreground">
            {/* Header */}
            <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex mb-12">
                <p className="fixed left-0 top-0 flex w-full justify-center border-b border-zinc-800 bg-zinc-950/50 pb-6 pt-8 backdrop-blur-2xl lg:static lg:w-auto lg:rounded-xl lg:border lg:p-4">
                    Synchro &nbsp;
                    <code className="font-mono font-bold text-primary">Privacy-First Matching</code>
                    <a
                        href="https://github.com/rusgariana/synchro"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 text-zinc-400 hover:text-white transition-colors"
                        title="View on GitHub"
                    >
                        <svg className="w-5 h-5 inline" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                        </svg>
                    </a>
                </p>
                <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-black via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
                    <ConnectWallet />
                </div>
            </div>

            {/* Background Effects */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/20 rounded-full blur-[120px] -z-10 opacity-50" />
            <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-accent/10 rounded-full blur-[120px] -z-10 opacity-30" />

            {/* Main Content */}
            <div className="w-full max-w-3xl flex flex-col items-center gap-12 z-0">
                {!mounted || !isConnected ? (
                    <div className="text-center space-y-6 mt-20">
                        <img
                            src="/logo.png"
                            alt="Synchro Logo"
                            className="w-24 h-24 mx-auto mb-4 animate-in zoom-in-95 duration-700"
                        />
                        <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-400 to-accent">
                            Sync Calendars.<br />Keep Privacy.
                        </h1>
                        <p className="text-xl text-zinc-400 max-w-lg mx-auto">
                            Discover overlapping events with peers without exposing your full schedule.
                            Powered by Private Set Intersection and ENS.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl mx-auto mt-16 text-sm text-zinc-500">
                            <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800">
                                <strong className="text-zinc-300 block mb-1">Client-Side Only</strong>
                                Your calendar is parsed locally. We never store your events.
                            </div>
                            <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800">
                                <strong className="text-zinc-300 block mb-1">Private Matching</strong>
                                Matching happens via blinded keys. No data leakage.
                            </div>
                            <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800">
                                <strong className="text-zinc-300 block mb-1">Encrypted Messages</strong>
                                Add end-to-end encrypted notes to matched events.
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {events.length === 0 ? (
                            <div className="w-full flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <div className="text-center space-y-2">
                                    <h2 className="text-3xl font-bold">Load Your Calendar</h2>
                                </div>
                                <CalendarInput onCalendarLoaded={setEvents} />
                            </div>
                        ) : (
                            <div className="w-full animate-in fade-in zoom-in-95 duration-500">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-2xl font-bold">Matching Session</h2>
                                    <button
                                        onClick={() => setEvents([])}
                                        className="text-sm text-zinc-500 hover:text-zinc-300"
                                    >
                                        Reset Calendar
                                    </button>
                                </div>
                                <MatchingSession events={events} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}

'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function Home() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        
        setStatus('loading');
        
        try {
            const FORMSPREE_ID = 'xbdzvynp'; // User's Formspree ID
            
            const response = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    email: email, 
                    message: "Synchro Early Access Request" 
                })
            });

            if (response.ok) {
                setStatus('success');
                setEmail('');
            } else {
                const data = await response.json();
                console.error('Formspree Error:', data);
                setStatus('idle');
                alert('Formspree setup incomplete. Please ensure you have a valid Form ID.');
            }
        } catch (error) {
            console.error(error);
            setStatus('idle');
            alert('Failed to send. Please check your connection.');
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center px-8 pt-0 pb-0 relative overflow-hidden bg-[#09090b] text-white">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[#09090b] -z-20" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-purple-600/15 rounded-full blur-[120px] -z-10 opacity-50" />
            <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-600/8 rounded-full blur-[120px] -z-10 opacity-30" />

            {/* Main Content — vertically centered, single viewport */}
            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl z-0">
                <div className="text-center space-y-4">
                    {/* Logo */}
                    <div className="relative inline-block mb-0">
                        <div className="absolute inset-0 bg-purple-600/20 blur-[80px] rounded-full scale-[1.5] z-0 translate-y-6" />
                        <img
                            src="/logo_transparent.png"
                            alt="Synchro Logo"
                            className="relative w-36 h-36 md:w-44 md:h-44 mx-auto z-10 opacity-90 translate-y-6"
                        />
                    </div>
                    
                    {/* Hero */}
                    <div>
                        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[1.1]">
                            <span className="text-white">Sync Calendars</span><br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-purple-500 to-blue-400 drop-shadow-[0_0_30px_rgba(139,92,246,0.2)]">Keep Privacy</span>
                        </h1>
                    </div>

                    {/* Subtitle */}
                    <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto font-light tracking-widest italic opacity-70">
                        Discover overlapping events with peers without exposing your personal data
                    </p>
                    
                    {/* Feature Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mx-auto text-center pt-4">
                        {/* Sync Card */}
                        <div className="relative group transition-all duration-500 hover:-translate-y-2 max-w-[280px] mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-blue-400/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                            <div className="p-5 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-purple-400/10 to-blue-400/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <strong className="text-white text-xl block mb-1.5 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:to-purple-400 transition-all duration-500">Sync</strong>
                                <p className="text-zinc-400 leading-relaxed font-light text-xs">
                                    Link your Luma securely with zero-database sync to automatically fetch your confirmed events.
                                </p>
                            </div>
                        </div>

                        {/* Match Card */}
                        <div className="relative group transition-all duration-500 hover:-translate-y-2 delay-100 max-w-[280px] mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-blue-400/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                            <div className="p-5 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-purple-400/10 to-blue-400/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <strong className="text-white text-xl block mb-1.5 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-blue-400 transition-all duration-500">Match</strong>
                                <p className="text-zinc-400 leading-relaxed font-light text-xs">
                                    Identify shared events with true blind matching that reveals nothing but your mutual plans.
                                </p>
                            </div>
                        </div>

                        {/* Meet Card */}
                        <div className="relative group transition-all duration-500 hover:-translate-y-2 delay-200 max-w-[280px] mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-blue-400/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                            <div className="p-5 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-purple-400/10 to-blue-400/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <strong className="text-white text-xl block mb-1.5 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:via-purple-400 group-hover:to-blue-400 transition-all duration-500">Meet</strong>
                                <p className="text-zinc-400 leading-relaxed font-light text-xs">
                                    Schedule meetings in one click, create private notes, and export to your calendar.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Early Access Form — compact */}
                    <div className="w-full max-w-sm mx-auto pt-4">
                        <div className="bg-zinc-900/40 px-4 py-3 rounded-xl border border-zinc-800/50 backdrop-blur-xl">
                            {status === 'success' ? (
                                <div className="flex flex-col items-center gap-2 text-green-400 py-2">
                                    <CheckCircle2 className="w-8 h-8" />
                                    <div className="space-y-0.5 text-center">
                                        <h3 className="text-sm font-bold text-white">You're on the list!</h3>
                                        <p className="text-zinc-400 text-xs">We'll notify you as soon as we're ready.</p>
                                    </div>
                                    <button 
                                        onClick={() => setStatus('idle')}
                                        className="text-xs text-zinc-500 hover:text-zinc-300 underline mt-1"
                                    >
                                        Register another email
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <h3 className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 mb-2 text-center">Get early access</h3>
                                    <form onSubmit={handleSubmit} className="flex gap-2">
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="name@example.com"
                                            required
                                            className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-black placeholder-zinc-500 font-medium"
                                        />
                                        <button
                                            type="submit"
                                            disabled={status === 'loading'}
                                            className="bg-purple-600 text-white hover:bg-purple-500 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap uppercase tracking-wider"
                                        >
                                            {status === 'loading' ? '...' : 'SEND'}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="w-full max-w-5xl pt-4 pb-4 flex flex-col md:flex-row items-center justify-between text-zinc-600 text-sm z-10 gap-4 border-t border-zinc-900/50">
                <div className="flex items-center gap-6">
                    <a href="https://github.com/rusgariana/synchro" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" title="View Source">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                        </svg>
                    </a>
                    <a href="https://x.com/synchrowtf" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" title="Follow on X">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    </a>
                </div>
                <div className="flex items-center gap-1 font-light tracking-wide italic">
                    <a href="mailto:hello@synchro.wtf" className="text-zinc-500 hover:text-white transition-colors ml-1 font-normal not-italic">hello@synchro.wtf</a>
                </div>
            </footer>
        </main>
    );
}

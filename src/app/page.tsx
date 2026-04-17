'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

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
        <main className="flex min-h-screen flex-col items-center justify-between p-8 relative overflow-hidden bg-black text-white selection:bg-purple-500/30">
            {/* Background Effects */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] -z-10 animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -z-10" />

            <div className="flex-1 flex flex-col items-center justify-center w-full mt-4">
                {/* Content Container */}
                <div className="w-full max-w-3xl flex flex-col items-center gap-4 z-0 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    
                    {/* Logo */}
                    <div className="flex flex-col items-center mb-6 mt-2">
                        <img
                            src="/logo_transparent.png"
                            alt="Synchro Logo"
                            className="w-48 h-48 md:w-56 md:h-56 mx-auto drop-shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                        />
                    </div>

                    {/* Hero Headings */}
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-100 to-purple-400 max-w-3xl leading-tight">
                        Sync Calendars<br />Keep Privacy
                    </h1>
                    
                    <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl font-light mt-2">
                        Discover overlapping events with peers without exposing your personal data
                    </p>

                    {/* Feature Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 w-full max-w-3xl">
                        {/* Sync Card */}
                        <div className="relative group transition-all duration-500 hover:-translate-y-2 max-w-[280px] mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-blue-400/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                            <div className="p-6 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-purple-400/10 to-blue-400/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <strong className="text-white text-2xl block mb-2 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:to-purple-400 transition-all duration-500">Sync</strong>
                                <p className="text-zinc-400 leading-relaxed font-light text-sm">
                                    Link your Luma securely with zero-database sync to automatically fetch your confirmed events.
                                </p>
                            </div>
                        </div>

                        {/* Match Card */}
                        <div className="relative group transition-all duration-500 hover:-translate-y-2 delay-100 max-w-[280px] mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-blue-400/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                            <div className="p-6 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-purple-400/10 to-blue-400/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <strong className="text-white text-2xl block mb-2 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-blue-400 transition-all duration-500">Match</strong>
                                <p className="text-zinc-400 leading-relaxed font-light text-sm">
                                    Identify shared events with true blind matching that reveals nothing but your mutual plans.
                                </p>
                            </div>
                        </div>

                        {/* Meet Card */}
                        <div className="relative group transition-all duration-500 hover:-translate-y-2 delay-200 max-w-[280px] mx-auto">
                            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-blue-400/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                            <div className="p-6 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-purple-400/10 to-blue-400/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                <strong className="text-white text-2xl block mb-2 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:via-purple-400 group-hover:to-blue-400 transition-all duration-500">Meet</strong>
                                <p className="text-zinc-400 leading-relaxed font-light text-sm">
                                    Schedule meetings in one click, create private notes, and export to your calendar.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Email Signup Form */}
                    <div className="mt-8 w-full max-w-md bg-zinc-900/40 p-2 rounded-2xl border border-zinc-800/50 backdrop-blur-xl shadow-2xl">
                        <div className="px-4 pt-4 pb-3 flex flex-col items-center min-h-[140px] justify-center text-center">
                            {status === 'success' ? (
                                <div className="flex flex-col items-center gap-3 text-green-400 animate-in zoom-in-95 duration-500 py-4">
                                    <CheckCircle2 className="w-12 h-12" />
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold text-white">You're on the list!</h3>
                                        <p className="text-zinc-400 text-sm">We'll notify you as soon as we're ready.</p>
                                    </div>
                                    <button 
                                        onClick={() => setStatus('idle')}
                                        className="text-xs text-zinc-500 hover:text-zinc-300 underline mt-2"
                                    >
                                        Register another email
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <h3 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 mb-4">Get early access</h3>
                                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="name@example.com"
                                        required
                                        className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-black placeholder-zinc-500 font-medium"
                                    />
                                    <button
                                        type="submit"
                                        disabled={status === 'loading'}
                                        className="bg-purple-600 text-white hover:bg-purple-500 rounded-xl px-6 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap uppercase tracking-wider"
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
            <footer className="w-full max-w-5xl mt-auto pt-6 pb-6 flex flex-col md:flex-row items-center justify-between text-zinc-600 text-sm z-10 gap-4 border-t border-zinc-900/50">
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

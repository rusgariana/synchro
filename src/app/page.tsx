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
            <div className="mt-auto pt-8 text-center text-xs text-zinc-500">
                Contact us: <a href="mailto:hello@synchro.wtf" className="text-zinc-400 hover:text-white transition-colors">hello@synchro.wtf</a>
            </div>
        </main>
    );
}

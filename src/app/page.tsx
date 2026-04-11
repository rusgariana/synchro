'use client';

import { useState, useEffect } from 'react';
import { GoogleSignIn } from '@/components/GoogleSignIn';
import { MatchingSession } from '@/components/MatchingSession';
import { CalendarEvent } from '@/lib/calendar';
import { useGoogleAuth } from '@/lib/googleAuth';
import { fetchLumaEvents } from '@/lib/lumaEvents';
import { fetchGoogleConfig, saveGoogleConfig } from '@/lib/googleHistory';
import { createGoogleCalendarEvent, savePrivateNote } from '@/lib/googleCalendar';
import { Loader2, Calendar, Link as LinkIcon, ArrowRight, ShieldCheck, RefreshCw, ChevronDown, ChevronUp, MapPin, ExternalLink, CalendarPlus, StickyNote, Check, Lock } from 'lucide-react';

function EventsList({ events, accessToken, onRefresh, isRefreshing }: { events: CalendarEvent[], accessToken?: string, onRefresh?: () => void, isRefreshing?: boolean }) {
    const [open, setOpen] = useState(true);
    const { expireSession } = useGoogleAuth();

    // Export State
    const [exportingEventId, setExportingEventId] = useState<string | null>(null);
    const [exportedEvents, setExportedEvents] = useState<Record<string, string>>({}); // uid -> googleEventId

    // Private Notes State
    const [activePrivateNoteId, setActivePrivateNoteId] = useState<string | null>(null);
    const [privateNotes, setPrivateNotes] = useState<Record<string, string>>({});
    const [privateNoteText, setPrivateNoteText] = useState('');
    const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

    const handleExportToGoogle = async (event: CalendarEvent) => {
        if (!accessToken) return alert('Please sign in to Google to export events.');
        setExportingEventId(event.uid);
        try {
            const combinedNote = privateNotes[event.uid] ? `🟣 <b>PRIVATE NOTE</b> <i>via Synchro</i>\n${privateNotes[event.uid]}` : '';
            const gId = await createGoogleCalendarEvent(accessToken, event, combinedNote);
            setExportedEvents(prev => ({ ...prev, [event.uid]: gId }));
        } catch (e: any) {
            console.error('Failed to export to Google Calendar', e);
            if (e.message.includes('401')) {
                expireSession();
            } else {
                alert('Failed to export event. Please try again.');
            }
        } finally {
            setExportingEventId(null);
        }
    };

    const handleSavePrivateNote = async (eventUid: string) => {
        setPrivateNotes(prev => ({ ...prev, [eventUid]: privateNoteText }));
        setActivePrivateNoteId(null);

        const googleEventId = exportedEvents[eventUid];
        if (googleEventId && accessToken) {
            setSavingNoteId(eventUid);
            try {
                await savePrivateNote(accessToken, googleEventId, privateNoteText);
            } catch (e: any) {
                console.error('Failed to update private note on Google Calendar', e);
                if (e.message.includes('401')) {
                    expireSession();
                } else {
                    alert('Saved locally, but failed to sync to Google Calendar. popup blockers?');
                }
            } finally {
                setSavingNoteId(null);
            }
        }
        setPrivateNoteText('');
    };

    return (
        <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl backdrop-blur-xl p-6 shadow-xl relative overflow-hidden">
            <h3 className="text-xl font-bold mb-6 flex items-center justify-between pb-4 border-b border-zinc-800/80">
                <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-zinc-400" />
                    Upcoming Events
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400 font-normal">
                        {events.length}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                    {onRefresh && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                            className={`p-1.5 hover:text-white transition-colors rounded-lg hover:bg-zinc-800 text-zinc-400 ${isRefreshing ? 'opacity-50' : ''}`}
                            title="Refresh events"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </h3>

            <div className="grid gap-2 mt-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                {events.map(event => (
                    <div
                        key={event.uid}
                        className={`group py-4 px-4 rounded-xl border border-transparent transition-all duration-200 hover:border-violet-500/50 hover:bg-violet-950/20 hover:shadow-[0_0_28px_4px_rgba(139,92,246,0.12)]`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-zinc-400">
                                        {new Date(event.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                    <span className="text-xs text-zinc-500">•</span>
                                    <span className="text-xs text-zinc-500">
                                        {new Date(event.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                    {event.url && (
                                        <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors ml-1" />
                                    )}
                                </div>
                                {event.url ? (
                                    <a
                                        href={event.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="font-bold text-lg text-white truncate block hover:text-violet-300 transition-colors"
                                    >
                                        {event.title}
                                    </a>
                                ) : (
                                    <p className="font-bold text-lg text-white truncate block">{event.title}</p>
                                )}
                                {event.location && (
                                    <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 break-words line-clamp-2 group-hover:text-zinc-400 transition-colors">
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        {event.location}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <button
                                    onClick={() => handleExportToGoogle(event)}
                                    disabled={exportingEventId === event.uid || !!exportedEvents[event.uid]}
                                    className={`p-2 rounded-lg transition-colors ${exportedEvents[event.uid] ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                                    title={exportedEvents[event.uid] ? "Saved to Google" : "Export to Google Calendar"}
                                >
                                    {exportingEventId === event.uid ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                        exportedEvents[event.uid] ? <Check className="w-4 h-4" /> : <CalendarPlus className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => {
                                        if (activePrivateNoteId === event.uid) {
                                            setActivePrivateNoteId(null);
                                        } else {
                                            setActivePrivateNoteId(event.uid);
                                            setPrivateNoteText(privateNotes[event.uid] || '');
                                        }
                                    }}
                                    className="p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 transition-colors"
                                    title="Add personal private note"
                                >
                                    <StickyNote className={`w-4 h-4 ${privateNotes[event.uid] ? 'text-amber-400 fill-amber-400/20' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Private Notes — stopPropagation prevents clicking input from triggering Luma link */}
                        {(activePrivateNoteId === event.uid || privateNotes[event.uid]) && (
                            <div className="mt-4 pt-4 border-t border-zinc-700/50" onClick={e => e.stopPropagation()}>
                                {privateNotes[event.uid] && activePrivateNoteId !== event.uid && (
                                    <div className="mb-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-sm">
                                        <div className="flex items-center gap-1 mb-1 text-xs text-amber-500/70">
                                            <Lock className="w-3 h-3" /> Private Note {exportedEvents[event.uid] ? '(Synced to Google)' : '(Local Only)'}:
                                        </div>
                                        <div className="text-amber-100">{privateNotes[event.uid]}</div>
                                    </div>
                                )}

                                {activePrivateNoteId === event.uid && (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Add a private note (exports to Google Calendar)..."
                                            value={privateNoteText}
                                            onChange={(e) => setPrivateNoteText(e.target.value)}
                                            className="flex-1 bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none text-white"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSavePrivateNote(event.uid);
                                            }}
                                        />
                                        <button
                                            onClick={() => handleSavePrivateNote(event.uid)}
                                            disabled={savingNoteId === event.uid || !privateNoteText.trim()}
                                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center min-w-[80px]"
                                        >
                                            {savingNoteId === event.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Home() {
    const { user, accessToken, customName, isTokenExpired, signIn, expireSession } = useGoogleAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);

    // Tab state
    const [activeTab, setActiveTabState] = useState<'match' | 'schedule' | 'history'>('match');

    // On mount: if no session flag exists, land on Match tab.
    // sessionStorage clears when the tab closes, so first load of a new session always lands on Match.
    // Refreshes within the same session keep the tab from localStorage.
    useEffect(() => {
        const alreadyLanded = sessionStorage.getItem('synchro_tab_landed');
        if (!alreadyLanded) {
            setActiveTabState('match');
            localStorage.setItem('synchro_activeTab', 'match');
            sessionStorage.setItem('synchro_tab_landed', '1');
        } else {
            const savedTab = localStorage.getItem('synchro_activeTab');
            if (savedTab === 'match' || savedTab === 'schedule' || savedTab === 'history') {
                setActiveTabState(savedTab);
            }
        }
    }, []);

    const setActiveTab = (tab: 'match' | 'schedule' | 'history') => {
        setActiveTabState(tab);
        localStorage.setItem('synchro_activeTab', tab);
    };
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVerificationError, setIsVerificationError] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [syncCount, setSyncCount] = useState(0);

    // Onboarding State
    const [checkingProfile, setCheckingProfile] = useState(false);
    const [requiresOnboarding, setRequiresOnboarding] = useState(false);
    const [icsUrlInput, setIcsUrlInput] = useState('');
    const [savingUrl, setSavingUrl] = useState(false);

    const syncEvents = () => setSyncCount(c => c + 1);

    // Auto-sync Luma every 5 minutes while the app is active.
    // Skipped during an active matching handshake to prevent event list divergence.
    const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
    useEffect(() => {
        if (!user?.email) return; // Only sync when signed in
        const timer = setInterval(() => {
            if (!activeSessionId) { // Don't sync mid-handshake
                syncEvents();
            }
        }, AUTO_SYNC_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [user?.email, activeSessionId]);

    // Also sync immediately when the tab becomes visible again (returning user)
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible' && user?.email && !activeSessionId) {
                syncEvents();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [user?.email, activeSessionId]);


    useEffect(() => {
        setMounted(true);
    }, []);

    const fetchEvents = (icsUrl: string) => {
        setLoadingEvents(true);
        setError(null);
        setIsVerificationError(false);
        fetchLumaEvents(icsUrl, user?.email || undefined, user?.name || undefined)
            .then((fetchedEvents) => {
                setEvents(fetchedEvents);
            })
            .catch((err) => {
                console.error(err);
                if (err.message.includes('403')) {
                    // Clear the bad URL so user can re-enter
                    localStorage.removeItem('synchro_luma_url');
                    setIsVerificationError(true);
                    setError('Verification Fail: This Luma calendar does not belong to your signed-in Google account. Please use the same email for both Google and Luma.');
                } else {
                    setError('Failed to fetch Luma confirmed events. Check your URL.');
                }
            })
            .finally(() => {
                setLoadingEvents(false);
                setCheckingProfile(false);
            });
    };

    // Auto-fetch profile/events when user signs in
    useEffect(() => {
        if (mounted) {
            const checkProfile = async () => {
                setCheckingProfile(true);
                setRequiresOnboarding(false);

                // 1. Try local storage first (instant)
                let lumaUrl = localStorage.getItem('synchro_luma_url');

                // 2. Fallback to Google Calendar Sync if we have an access token but no local URL
                if (!lumaUrl && accessToken) {

                    const syncedUrl = await fetchGoogleConfig(accessToken);
                    if (syncedUrl) {
                        lumaUrl = syncedUrl;
                        localStorage.setItem('synchro_luma_url', syncedUrl);
                    }
                }

                if (lumaUrl) {
                    if (user?.email) {
                        fetchEvents(lumaUrl);
                    } else {
                        setCheckingProfile(false);
                    }
                } else {
                    setRequiresOnboarding(true);
                    setCheckingProfile(false);
                }
            };

            checkProfile();
        }
    }, [user?.email, accessToken, syncCount, mounted]);

    const handleSaveIcsUrl = async () => {
        if (!icsUrlInput.trim()) return;

        setSavingUrl(true);
        try {
            const url = icsUrlInput.trim();
            // 1. Save to browser storage
            localStorage.setItem('synchro_luma_url', url);

            // 2. Sync to Google Calendar (Zero-Database Sync)
            if (accessToken) {
                await saveGoogleConfig(accessToken, url);
            }

            setRequiresOnboarding(false);
            if (user?.email) {
                fetchEvents(url);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to save Luma URL.');
        } finally {
            setSavingUrl(false);
        }
    };

    const isLoggedIn = mounted && !!user;

    return (
        <main className="flex min-h-screen flex-col items-center px-8 pt-0 pb-0 relative overflow-hidden bg-background text-foreground">
            {/* Header */}
            <div className="z-10 w-full flex items-center justify-between font-mono text-sm mb-0 py-4 px-4 sm:px-8 h-[72px]">
                <div className="relative inline-flex items-center group">
                    <img 
                        src="/branding_text.png" 
                        alt="Synchro" 
                        className="h-6 w-auto opacity-90 group-hover:opacity-100 transition-opacity object-contain relative z-10" 
                    />
                    {/* Gradient colour overlay — multiply keeps the black bg transparent */}
                    <div className="absolute inset-0 z-20 bg-gradient-to-r from-purple-300 via-primary to-accent mix-blend-multiply opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>

                <div className="flex items-center justify-end">
                    <GoogleSignIn />
                </div>
            </div>

            {/* Background Effects (Only for logged in) */}
            {isLoggedIn && (
                <>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/20 rounded-full blur-[120px] -z-10 opacity-50" />
                    <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-accent/10 rounded-full blur-[120px] -z-10 opacity-30" />
                </>
            )}

            {/* Main Content */}
            <div className={`w-full max-w-5xl flex flex-col items-center gap-6 z-0`}>
                {!isLoggedIn ? (
                    <div className="text-center space-y-6 -mt-16 sm:-mt-24">
                        <div className="relative inline-block mb-0">
                            <div className="absolute inset-0 bg-primary/20 blur-[80px] rounded-full scale-[1.5] z-0 translate-y-8" />
                            <img
                                src="/logo_transparent.png"
                                alt="Synchro Logo"
                                className="relative w-48 h-48 md:w-56 md:h-56 mx-auto animate-in zoom-in-95 duration-700 z-10 opacity-90 translate-y-8"
                            />
                        </div>
                        
        <div>
                            <h1 className="text-6xl sm:text-7xl font-bold tracking-tighter leading-[1.1] animate-in fade-in slide-in-from-top-12 duration-1000">
                                <span className="text-white">Sync Calendars</span><br />
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-primary to-accent drop-shadow-[0_0_30px_rgba(139,92,246,0.2)]">Keep Privacy</span>
                            </h1>
                        </div>

                        <div className="pt-4"> {/* Breathing space before cards section */}
                            <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto mb-10 font-light tracking-widest italic opacity-70 animate-in fade-in duration-1000 delay-300">
                                Discover overlapping events with peers without exposing your personal data
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mx-auto text-center animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500">
                                {/* Sync Card */}
                                <div className="relative group transition-all duration-500 hover:-translate-y-2 max-w-[280px] mx-auto">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-primary/40 to-accent/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                                    <div className="p-6 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-primary/10 to-accent/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                        <strong className="text-white text-2xl block mb-2 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:to-primary transition-all duration-500">Sync</strong>
                                        <p className="text-zinc-400 leading-relaxed font-light text-sm">
                                            Link your Luma securely with zero-database sync to automatically fetch your confirmed events.
                                        </p>
                                    </div>
                                </div>

                                {/* Match Card */}
                                <div className="relative group transition-all duration-500 hover:-translate-y-2 delay-100 max-w-[280px] mx-auto">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-primary/40 to-accent/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                                    <div className="p-6 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-primary/10 to-accent/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                        <strong className="text-white text-2xl block mb-2 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent transition-all duration-500">Match</strong>
                                        <p className="text-zinc-400 leading-relaxed font-light text-sm">
                                            Identify shared events with true blind matching that reveals nothing but your mutual plans.
                                        </p>
                                    </div>
                                </div>

                                {/* Meet Card */}
                                <div className="relative group transition-all duration-500 hover:-translate-y-2 delay-200 max-w-[280px] mx-auto">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-primary/40 to-accent/40 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700 -z-10" />
                                    <div className="p-6 h-full rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md transition-colors duration-500 hover:bg-zinc-900/70 hover:border-zinc-700/50 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 via-primary/10 to-accent/10 rounded-full blur-3xl -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                        <strong className="text-white text-2xl block mb-2 font-bold tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:via-primary group-hover:to-accent transition-all duration-500">Meet</strong>
                                        <p className="text-zinc-400 leading-relaxed font-light text-sm">
                                            Schedule meetings in one click, create private notes, and export to your calendar.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-zinc-500 mt-6">
                                Sign in with your Luma Gmail login above to get started.
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Session expired banner — shown when token has expired mid-session */}
                        {isTokenExpired && (
                            <div className="w-full mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4 animate-in fade-in duration-300">
                                <div className="flex items-center gap-2 text-sm text-amber-300">
                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                    <span>Your session has expired. Re-sign in to continue syncing with Google Calendar.</span>
                                </div>
                                <button
                                    onClick={signIn}
                                    className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors"
                                >
                                    Sign in again
                                </button>
                            </div>
                        )}
                        {checkingProfile ? (
                            <div className="flex flex-col items-center gap-4 py-20 animate-in fade-in zoom-in-95 duration-500">
                                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                                <h2 className="text-2xl font-bold">Checking profile...</h2>
                            </div>
                        ) : requiresOnboarding ? (
                            <div className="w-full flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <div className="text-center mb-10">
                                    <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                                        Connect Your Luma
                                    </h2>
                                    <p className="text-lg text-zinc-400">
                                        You only have to do this once. Your events will sync magically forever.
                                    </p>
                                </div>

                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10" />

                                    {/* Visual Guide */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-center text-sm relative">
                                        <div className="hidden md:block absolute top-[28px] left-[16%] w-[68%] h-[2px] bg-gradient-to-r from-primary/50 to-accent/50 opacity-20" />

                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-primary/30 flex items-center justify-center text-xl font-bold font-mono text-primary shadow-lg shadow-primary/20 z-10">
                                                1
                                            </div>
                                            <p className="text-zinc-300 font-medium tracking-wide">Go to your Luma <span className="text-white">Calendar Settings</span></p>
                                        </div>

                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-primary/30 flex items-center justify-center text-xl font-bold font-mono text-primary shadow-lg shadow-primary/20 z-10">
                                                2
                                            </div>
                                            <p className="text-zinc-300 font-medium tracking-wide">Under <span className="text-white">Account Syncing</span> click on <span className="text-white">Add iCal Subscription</span></p>
                                        </div>

                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-accent/30 flex items-center justify-center text-xl font-bold font-mono text-accent shadow-lg shadow-accent/20 z-10">
                                                3
                                            </div>
                                            <p className="text-zinc-300 font-medium tracking-wide"><span className="text-white">Copy URL</span> to Clipboard</p>
                                        </div>
                                    </div>

                                    {/* Input Section */}
                                    <div className="mt-10 p-6 bg-zinc-950/50 rounded-xl border border-zinc-800">
                                        <label className="block text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                                            <LinkIcon className="w-4 h-4 text-primary" />
                                            Paste your Luma Personal Sync URL
                                        </label>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <input
                                                type="url"
                                                value={icsUrlInput}
                                                onChange={(e) => setIcsUrlInput(e.target.value)}
                                                placeholder="https://lu.ma/calendar/personal/..."
                                                className="flex-1 bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/50 outline-none transition-all placeholder:text-zinc-600 font-mono text-sm"
                                            />
                                            <button
                                                onClick={handleSaveIcsUrl}
                                                disabled={!icsUrlInput || savingUrl}
                                                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                                {savingUrl ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                                    <>Finish Setup <ArrowRight className="w-5 h-5" /></>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-4 text-center flex flex-col gap-2">
                                            <span className="flex items-center justify-center gap-1">
                                                <ShieldCheck className="w-4 h-4 text-green-500" />
                                                <strong>Absolute Privacy:</strong> Synchro stores zero data on our servers.
                                            </span>
                                            <span className="text-zinc-600 italic">
                                                Your Luma link and history are synced exclusively through private,
                                                hidden metadata inside your own Google Calendar account.
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : loadingEvents ? (
                            <div className="flex flex-col items-center gap-4 py-20 animate-in fade-in zoom-in-95 duration-500">
                                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                                <h2 className="text-2xl font-bold">Syncing Luma events...</h2>
                                <p className="text-zinc-400 text-sm">Fetching your live schedule from Luma</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center gap-4 py-20 text-center max-w-md">
                                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500 text-red-400 mb-2">
                                    {error}
                                </div>
                                {isVerificationError ? (
                                    <button
                                        onClick={() => {
                                            setError(null);
                                            setIsVerificationError(false);
                                            setIcsUrlInput('');
                                            setRequiresOnboarding(true);
                                        }}
                                        className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-all"
                                    >
                                        Enter a different Luma link
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={syncEvents}
                                            className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                                        >
                                            Try again
                                        </button>
                                        <button
                                            onClick={() => {
                                                setError(null);
                                                setIcsUrlInput('');
                                                setRequiresOnboarding(true);
                                            }}
                                            className="text-sm text-zinc-400 hover:text-zinc-200 underline"
                                        >
                                            Change Luma URL
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full flex flex-col gap-6 items-center animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-full flex justify-start overflow-x-auto">
                                    <nav className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 flex-nowrap min-w-max">
                                        {(['match', 'schedule', 'history'] as const).map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveTab(tab)}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                                            >
                                                {tab === 'match' ? 'Match' : tab === 'schedule' ? 'My Events' : 'History'}
                                            </button>
                                        ))}
                                    </nav>
                                </div>
                                <div className="w-full flex justify-center">
                                    {activeTab === 'match' && (
                                        events.length === 0 ? (
                                            <div className="flex flex-col items-center gap-4 py-16 text-center animate-in fade-in duration-500">
                                                <div className="w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600">
                                                    <Calendar className="w-7 h-7" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold mb-1">No IRL events to match on</h3>
                                                    <p className="text-zinc-400 text-sm max-w-xs">Only in-person events appear here. RSVP to an event on Luma, get approved, then sync.</p>
                                                </div>
                                                <button onClick={syncEvents} className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors flex items-center gap-2">
                                                    <RefreshCw className="w-3.5 h-3.5" /> Refresh to Sync
                                                </button>
                                            </div>
                                        ) : (
                                            <MatchingSession events={events} accessToken={accessToken!} userName={customName || user?.name || 'Anonymous'} viewMode="IDLE" activeSessionId={activeSessionId} onSessionChange={setActiveSessionId} />
                                        )
                                    )}
                                    {activeTab === 'schedule' && (
                                        events.length === 0 ? (
                                            <div className="flex flex-col items-center gap-4 py-16 text-center animate-in fade-in duration-500">
                                                <div className="w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600">
                                                    <Calendar className="w-7 h-7" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold mb-1">No confirmed Luma events found</h3>
                                                    <p className="text-zinc-400 text-sm max-w-xs">We couldn't find any upcoming confirmed IRL RSVPs in your synced Luma calendar.</p>
                                                </div>
                                                <div className="text-xs text-zinc-600 bg-zinc-900/50 px-4 py-3 rounded-xl border border-zinc-800 max-w-xs">
                                                    Register for an in-person event on Luma, wait for host approval, then sync.
                                                </div>
                                                <button onClick={syncEvents} className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors flex items-center gap-2">
                                                    <RefreshCw className="w-3.5 h-3.5" /> Refresh to Sync
                                                </button>
                                            </div>
                                        ) : (
                                            <EventsList events={events} accessToken={accessToken!} onRefresh={syncEvents} isRefreshing={loadingEvents} />
                                        )
                                    )}
                                    {activeTab === 'history' && (
                                        <MatchingSession events={events} accessToken={accessToken!} userName={customName || user?.name || 'Anonymous'} viewMode="HISTORY" activeSessionId={activeSessionId} onSessionChange={setActiveSessionId} />
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
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

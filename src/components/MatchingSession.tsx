'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/lib/calendar';
import {
    generatePrivateKey,
    blindString,
    blindPoint,
    encryptNote,
    decryptNote,
    computeSharedSecret,
    getPublicKey
} from '@/lib/crypto';
import { savePrivateNote } from '@/lib/googleCalendar';
import { Loader2, Copy, Check, MessageSquare, Lock, Trash2, ArrowLeft } from 'lucide-react';
import { getSavedSessions, saveSession, deleteSession, SavedSession } from '@/lib/sessionStorage';

interface Props {
    events: CalendarEvent[];
    accessToken: string;
}

type State = 'IDLE' | 'CREATED' | 'JOINING' | 'EXCHANGING' | 'COMPUTING' | 'RESULTS';

// Typed message payloads — validated before use (ALP-191)
interface JoinPayload { publicKey: string }
interface Step1Payload { blinded: string[]; publicKey: string }
interface Step2Payload { doubleBlinded: string[]; blinded: string[] }
interface NotePayload { uid: string; encrypted: string; seq: number }

type TypedMessage =
    | { type: 'JOIN';   sender: string; payload: JoinPayload }
    | { type: 'STEP_1'; sender: string; payload: Step1Payload }
    | { type: 'STEP_2'; sender: string; payload: Step2Payload }
    | { type: 'STEP_3'; sender: string; payload: string[] }
    | { type: 'NOTE';   sender: string; payload: NotePayload };

function isString(v: unknown): v is string { return typeof v === 'string'; }
function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every(isString);
}
function parseMessage(raw: unknown): TypedMessage | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    if (!isString(m.type) || !isString(m.sender)) return null;
    const p = m.payload;
    switch (m.type) {
        case 'JOIN':
            if (typeof p === 'object' && p !== null && isString((p as JoinPayload).publicKey))
                return { type: 'JOIN', sender: m.sender, payload: p as JoinPayload };
            break;
        case 'STEP_1':
            if (typeof p === 'object' && p !== null
                && isStringArray((p as Step1Payload).blinded)
                && isString((p as Step1Payload).publicKey))
                return { type: 'STEP_1', sender: m.sender, payload: p as Step1Payload };
            break;
        case 'STEP_2':
            if (typeof p === 'object' && p !== null
                && isStringArray((p as Step2Payload).doubleBlinded)
                && isStringArray((p as Step2Payload).blinded))
                return { type: 'STEP_2', sender: m.sender, payload: p as Step2Payload };
            break;
        case 'STEP_3':
            if (isStringArray(p))
                return { type: 'STEP_3', sender: m.sender, payload: p };
            break;
        case 'NOTE':
            if (typeof p === 'object' && p !== null
                && isString((p as NotePayload).uid)
                && isString((p as NotePayload).encrypted)
                && Number.isFinite((p as NotePayload).seq)
                && (p as NotePayload).seq >= 0)
                return { type: 'NOTE', sender: m.sender, payload: p as NotePayload };
            break;
    }
    return null;
}

export function MatchingSession({ events, accessToken }: Props) {
    const [state, setState] = useState<State>('IDLE');
    const [sessionId, setSessionId] = useState('');
    const [inputSessionId, setInputSessionId] = useState('');
    const [role, setRole] = useState<'INITIATOR' | 'JOINER' | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [matches, setMatches] = useState<CalendarEvent[]>([]);

    // Crypto State — separate keys for PSI blinding and ECDH to prevent key reuse
    const [psiKey] = useState(() => generatePrivateKey());
    const [ecdhKey] = useState(() => generatePrivateKey());
    const [sharedSecret, setSharedSecret] = useState<string | null>(null);

    // Refs for stable handleMessages callback (avoids stale closure / interval churn)
    const stateRef = useRef(state);
    const roleRef = useRef(role);
    const sharedSecretRef = useRef(sharedSecret);
    const joinerDoubleBlindedARef = useRef<string[]>([]);
    const noteSendSeqRef = useRef(0);   // monotonically increasing send counter
    const noteLastSeqRef = useRef(-1);  // last accepted receive seq from peer
    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { roleRef.current = role; }, [role]);
    useEffect(() => { sharedSecretRef.current = sharedSecret; }, [sharedSecret]);

    // Notes State
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [notes, setNotes] = useState<Record<string, string>>({}); // uid -> decrypted text

    // Google Private Notes State
    const [privateNotes, setPrivateNotes] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        events.forEach(e => {
            if (e.privateNote && e.googleEventId) {
                initial[e.googleEventId] = e.privateNote;
            }
        });
        return initial;
    });
    const [activePrivateNoteId, setActivePrivateNoteId] = useState<string | null>(null);
    const [privateNoteText, setPrivateNoteText] = useState('');
    const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

    const handleSavePrivateNote = async (googleEventId: string) => {
        setSavingNoteId(googleEventId);
        try {
            await savePrivateNote(accessToken, googleEventId, privateNoteText);
            setPrivateNotes(prev => ({ ...prev, [googleEventId]: privateNoteText }));
            setActivePrivateNoteId(null);
            setPrivateNoteText('');
        } catch (e) {
            console.error('Failed to save private note to Google Calendar', e);
            alert('Failed to save private note. Ensure popup blockers are disabled and try again.');
        } finally {
            setSavingNoteId(null);
        }
    };

    // Saved Sessions State
    const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

    useEffect(() => {
        getSavedSessions().then(setSavedSessions);
    }, []);

    // Effect to auto-save current active session
    useEffect(() => {
        if (state === 'RESULTS' && sessionId && role) {
            saveSession({ id: sessionId, role, date: new Date().toISOString(), matches, notes })
                .then(setSavedSessions);
        }
    }, [state, sessionId, role, matches, notes]);

    const loadSavedSession = (s: SavedSession) => {
        setSessionId(s.id);
        setRole(s.role);
        setMatches(s.matches);
        setNotes(s.notes);
        setState('RESULTS');
    };

    const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this saved session?')) {
            deleteSession(id).then(setSavedSessions);
        }
    };

    const addLog = (msg: string) => setLogs((prev: string[]) => [...prev, msg]);

    const handleMessages = useCallback(async (rawMessages: unknown[]) => {
        const myId = roleRef.current;
        const currentState = stateRef.current;
        if (!myId) return;

        // Validate and type-narrow all messages at the boundary
        const messages = rawMessages.flatMap(m => {
            const parsed = parseMessage(m);
            return parsed ? [parsed] : [];
        });

        const relevant = messages.filter(m => m.sender !== myId);
        if (relevant.length === 0) return;

        const lastMsg = relevant[relevant.length - 1];

        if (currentState === 'CREATED' && lastMsg.type === 'JOIN') {
            setState('EXCHANGING');
            addLog('Peer joined. Starting handshake...');
            const secret = computeSharedSecret(lastMsg.payload.publicKey, ecdhKey);
            setSharedSecret(secret);
            sharedSecretRef.current = secret;
            addLog('Encryption channel established.');
            await startPsiStep1();
        }

        if (currentState === 'EXCHANGING') {
            if (myId === 'JOINER' && lastMsg.type === 'STEP_1') {
                addLog('Received Step 1 from Initiator.');
                const secret = computeSharedSecret(lastMsg.payload.publicKey, ecdhKey);
                setSharedSecret(secret);
                sharedSecretRef.current = secret;
                addLog('Encryption channel established.');
                await runPsiStep2(lastMsg.payload.blinded);
            }
            if (myId === 'INITIATOR' && lastMsg.type === 'STEP_2') {
                addLog('Received Step 2 from Joiner.');
                await runPsiStep3(lastMsg.payload);
            }
            if (myId === 'JOINER' && lastMsg.type === 'STEP_3') {
                addLog('Received Step 3 from Initiator.');
                await finalizeJoiner(lastMsg.payload);
            }
        }

        // Handle Notes — active in RESULTS state; seq enforced for replay protection
        if (currentState === 'RESULTS') {
            for (const msg of relevant) {
                if (msg.type === 'NOTE') {
                    const { uid, encrypted, seq } = msg.payload;
                    if (seq <= noteLastSeqRef.current) continue; // replay — discard
                    noteLastSeqRef.current = seq; // claim seq before await to close race window
                    const secret = sharedSecretRef.current;
                    if (secret) {
                        try {
                            const decrypted = await decryptNote(encrypted, secret);
                            setNotes(prev => ({ ...prev, [uid]: decrypted }));
                        } catch (e) {
                            console.error('Failed to decrypt note', e);
                        }
                    }
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Polling — continues through RESULTS so NOTE messages can be received
    useEffect(() => {
        if (!sessionId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/signal', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'poll', sessionId }),
                });
                const data = await res.json();
                if (data.messages) {
                    handleMessages(data.messages);
                }
            } catch (e) {
                console.error(e);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [sessionId, state, handleMessages]);

    const createSession = async () => {
        try {
            const res = await fetch('/api/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create' }),
            });
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();
            setSessionId(data.sessionId);
            setRole('INITIATOR');
            setState('CREATED');
            addLog(`Session created: ${data.sessionId}`);
        } catch (e) {
            alert(`Failed to create session: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    };

    const joinSession = async () => {
        if (!inputSessionId) return;
        try {
            const res = await fetch('/api/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join', sessionId: inputSessionId }),
            });
            if (res.ok) {
                setSessionId(inputSessionId);
                setRole('JOINER');
                setState('EXCHANGING');
                addLog(`Joined session: ${inputSessionId}`);
                const myPub = getPublicKey(ecdhKey);
                await sendMessage('JOIN', { publicKey: myPub }, inputSessionId);
            } else {
                alert('Session not found');
            }
        } catch (e) {
            alert(`Failed to join session: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    };

    const sendMessage = async (type: string, payload: unknown, sid?: string) => {
        const targetSessionId = sid || sessionId;
        try {
            await fetch('/api/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send',
                    sessionId: targetSessionId,
                    payload: { type, sender: role, payload }
                }),
            });
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    // --- PSI Protocol ---

    const startPsiStep1 = async () => {
        addLog('Computing blinded set...');
        const blinded = events.map(e => blindString(e.uid, psiKey));

        const myPub = getPublicKey(ecdhKey);

        await sendMessage('STEP_1', { blinded, publicKey: myPub });
        addLog('Sent blinded set to peer.');
    };

    const runPsiStep2 = async (theirBlinded: string[]) => {
        addLog('Processing peer\'s set...');

        const doubleBlinded = theirBlinded.map(val => blindPoint(val, psiKey));
        joinerDoubleBlindedARef.current = doubleBlinded;

        const myBlinded = events.map(e => blindString(e.uid, psiKey));

        await sendMessage('STEP_2', { doubleBlinded, blinded: myBlinded });

        addLog('Sent double-blinded values. Waiting for results...');
    };

    const runPsiStep3 = async (payload: { doubleBlinded: string[], blinded: string[] }) => {
        const { doubleBlinded: theirDoubleBlindedA, blinded: theirBlindedB } = payload;

        addLog('Computing intersection...');

        const myDoubleBlindedB = theirBlindedB.map(val => blindPoint(val, psiKey));

        // Map from double-blinded Initiator value → Initiator event
        const initiatorMap = new Map<string, CalendarEvent>(
            theirDoubleBlindedA.map((val, i) => [val, events[i]])
        );
        const matchedEvents: CalendarEvent[] = [];
        for (const val of myDoubleBlindedB) {
            const event = initiatorMap.get(val);
            if (event) matchedEvents.push(event);
        }

        setMatches(matchedEvents);
        addLog(`Found ${matchedEvents.length} matches!`);

        await sendMessage('STEP_3', myDoubleBlindedB);
        setState('RESULTS'); // after send — Joiner won't get stuck if network fails
    };

    const finalizeJoiner = async (theirDoubleBlindedB: string[]) => {
        addLog('Computing final intersection...');

        // setA = {ab * H(uid_A[i])} — Initiator's events double-blinded
        const setA = new Set(joinerDoubleBlindedARef.current);
        const matchedEvents: CalendarEvent[] = [];

        // Map from ab*H(uid_B[j]) → Joiner event at j
        const joinerMap = new Map<string, CalendarEvent>(
            theirDoubleBlindedB.map((val, i) => [val, events[i]])
        );
        // Find Joiner events whose double-blinded value appears in Initiator's set
        for (const [val, event] of joinerMap) {
            if (setA.has(val) && event) matchedEvents.push(event);
        }

        setMatches(matchedEvents);
        setState('RESULTS');
        addLog(`Found ${matchedEvents.length} matches!`);
    };

    const sendNote = async (uid: string) => {
        if (!sharedSecret || !noteText) return;
        const seq = noteSendSeqRef.current++;
        const encrypted = await encryptNote(noteText, sharedSecret);
        await sendMessage('NOTE', { uid, encrypted, seq } satisfies NotePayload);

        // Update local notes
        setNotes((prev: Record<string, string>) => ({ ...prev, [uid]: noteText }));
        setActiveNoteId(null);
        setNoteText('');
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl backdrop-blur-xl">
            {state === 'IDLE' && (
                <div className="grid grid-cols-2 gap-6">
                    <button
                        onClick={createSession}
                        className="flex flex-col items-center justify-center p-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-all border border-zinc-700 hover:border-primary/50 group"
                    >
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Check className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Start Session</h3>
                        <p className="text-sm text-zinc-400 text-center">Create a new matching room and invite a friend.</p>
                    </button>

                    <div className="flex flex-col p-8 rounded-xl bg-zinc-800 border border-zinc-700">
                        <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-4">
                            <Copy className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-xl font-bold mb-4">Join Session</h3>
                        <input
                            type="text"
                            placeholder="Enter Session ID"
                            value={inputSessionId}
                            onChange={(e) => setInputSessionId(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-accent/50 outline-none"
                        />
                        <button
                            onClick={joinSession}
                            disabled={!inputSessionId}
                            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-2 rounded-lg disabled:opacity-50"
                        >
                            Join
                        </button>
                    </div>
                </div>
            )}

            {/* Saved Sessions List */}
            {state === 'IDLE' && savedSessions.length > 0 && (
                <div className="mt-12 pt-8 border-t border-zinc-800/50">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        Saved Sessions
                        <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400 font-normal">
                            {savedSessions.length}
                        </span>
                    </h3>
                    <div className="grid gap-3">
                        {savedSessions.map(s => (
                            <div 
                                key={s.id}
                                onClick={() => loadSavedSession(s)}
                                className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800 border border-zinc-700/30 hover:border-zinc-700 cursor-pointer transition-colors group"
                            >
                                <div>
                                    <div className="font-medium text-white group-hover:text-primary transition-colors">
                                        Matching Session ({s.role.toLowerCase()})
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1 flex gap-3">
                                        <span>{new Date(s.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</span>
                                        <span>•</span>
                                        <span>{s.matches.length} matches</span>
                                        {Object.keys(s.notes).length > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="text-green-400">{Object.keys(s.notes).length} peer notes</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => handleDeleteSession(s.id, e)}
                                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Delete session"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {state === 'CREATED' && (
                <div className="text-center py-12">
                    <h3 className="text-2xl font-bold mb-4">Waiting for Peer...</h3>
                    <div className="flex items-center justify-center gap-4 mb-8">
                        <div className="text-4xl font-mono font-bold tracking-wider bg-zinc-950 px-6 py-3 rounded-lg border border-zinc-800">
                            {sessionId}
                        </div>
                        <button
                            onClick={() => navigator.clipboard.writeText(sessionId)}
                            className="p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                            <Copy className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-zinc-400">
                        <Loader2 className="animate-spin w-4 h-4" />
                        <span>Share this code with your friend</span>
                    </div>
                </div>
            )}

            {(state === 'EXCHANGING' || state === 'COMPUTING') && (
                <div className="py-12">
                    <div className="flex flex-col items-center justify-center mb-8">
                        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                        <h3 className="text-xl font-bold">Matching in progress...</h3>
                    </div>
                    <div className="max-h-48 overflow-y-auto bg-zinc-950 p-4 rounded-lg font-mono text-xs text-zinc-400 space-y-1">
                        {logs.map((log, i) => (
                            <div key={i}>&gt; {log}</div>
                        ))}
                    </div>
                </div>
            )}

            {state === 'RESULTS' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between mb-8">
                        <button
                            onClick={() => {
                                setState('IDLE');
                                setMatches([]);
                                setNotes({});
                                setSessionId('');
                                setRole(null);
                            }}
                            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to History
                        </button>
                    </div>
                    
                    <h3 className="text-2xl font-bold text-center">
                        Found {matches.length} Mutual Events
                    </h3>
                    <div className="grid gap-4">
                        {matches.map(event => (
                            <div key={event.uid} className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 flex flex-col gap-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-lg">{event.title}</h4>
                                        <p className="text-sm text-zinc-400">
                                            {new Date(event.start).toLocaleString()}
                                        </p>
                                        {event.location && (
                                            <p className="text-xs text-zinc-500 mt-1">{event.location}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                if (activePrivateNoteId === event.uid) {
                                                    setActivePrivateNoteId(null);
                                                } else {
                                                    setActivePrivateNoteId(event.uid);
                                                    setPrivateNoteText(event.googleEventId && privateNotes[event.googleEventId] ? privateNotes[event.googleEventId] : '');
                                                }
                                                setActiveNoteId(null);
                                            }}
                                            className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors"
                                            title="Add private Google note"
                                        >
                                            <Lock className={`w-4 h-4 ${event.googleEventId && privateNotes[event.googleEventId] ? 'text-amber-400 fill-amber-400' : ''}`} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setActiveNoteId(activeNoteId === event.uid ? null : event.uid);
                                                setActivePrivateNoteId(null);
                                            }}
                                            className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors"
                                            title={notes[event.uid] ? "View/edit peer note" : "Add peer note"}
                                        >
                                            <MessageSquare className={`w-4 h-4 ${notes[event.uid] ? 'text-green-400 fill-green-400' : ''}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Notes Section */}
                                {(activeNoteId === event.uid || notes[event.uid]) && (
                                    <div className="pt-4 border-t border-zinc-700/50">
                                        {notes[event.uid] && (
                                            <div className="mb-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-700 text-sm">
                                                <span className="text-xs text-zinc-500 block mb-1">Shared Note:</span>
                                                {notes[event.uid]}
                                            </div>
                                        )}

                                        {activeNoteId === event.uid && (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Add an encrypted note for your peer..."
                                                    value={noteText}
                                                    onChange={(e) => setNoteText(e.target.value)}
                                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                                                />
                                                <button
                                                    onClick={() => sendNote(event.uid)}
                                                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90"
                                                >
                                                    Send
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Google Calendar Private Notes Section */}
                                {(activePrivateNoteId === event.uid || (event.googleEventId && privateNotes[event.googleEventId])) && (
                                    <div className="pt-4 border-t border-zinc-700/50">
                                        {event.googleEventId && privateNotes[event.googleEventId] && activePrivateNoteId !== event.uid && (
                                            <div className="mb-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-sm">
                                                <span className="text-xs text-amber-500/70 block mb-1 flex items-center gap-1">
                                                    <Lock className="w-3 h-3" /> Private Google Note:
                                                </span>
                                                <span className="text-amber-100">{privateNotes[event.googleEventId]}</span>
                                            </div>
                                        )}

                                        {activePrivateNoteId === event.uid && event.googleEventId && (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Add a private note to this event in Google Calendar..."
                                                    value={privateNoteText}
                                                    onChange={(e) => setPrivateNoteText(e.target.value)}
                                                    className="flex-1 bg-zinc-900 border border-amber-500/50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                    disabled={savingNoteId === event.googleEventId}
                                                />
                                                <button
                                                    onClick={() => handleSavePrivateNote(event.googleEventId!)}
                                                    disabled={savingNoteId === event.googleEventId}
                                                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center"
                                                >
                                                    {savingNoteId === event.googleEventId ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {matches.length === 0 && (
                            <p className="text-center text-zinc-500">No overlaps found.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

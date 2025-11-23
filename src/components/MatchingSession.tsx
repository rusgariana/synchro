'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarEvent } from '@/lib/calendar';
import {
    generatePrivateKey,
    blindString,
    hashToPoint,
    blindPoint,
    encryptNote,
    decryptNote,
    computeSharedSecret,
    getPublicKey
} from '@/lib/crypto';
import { Loader2, Copy, Check, MessageSquare } from 'lucide-react';

interface Props {
    events: CalendarEvent[];
}

type State = 'IDLE' | 'CREATED' | 'JOINING' | 'EXCHANGING' | 'COMPUTING' | 'RESULTS';

interface Message {
    type: 'JOIN' | 'STEP_1' | 'STEP_2' | 'STEP_3' | 'NOTE';
    sender: string;
    payload: any;
}

export function MatchingSession({ events }: Props) {
    const [state, setState] = useState<State>('IDLE');
    const [sessionId, setSessionId] = useState('');
    const [inputSessionId, setInputSessionId] = useState('');
    const [role, setRole] = useState<'INITIATOR' | 'JOINER' | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [matches, setMatches] = useState<CalendarEvent[]>([]);

    // Crypto State
    const [privateKey] = useState(() => generatePrivateKey());
    const [sharedSecret, setSharedSecret] = useState<string | null>(null);

    // Notes State
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [notes, setNotes] = useState<Record<string, string>>({}); // uid -> decrypted text



    const addLog = (msg: string) => setLogs((prev: string[]) => [...prev, msg]);

    const [joinerDoubleBlindedA, setJoinerDoubleBlindedA] = useState<string[]>([]);

    const handleMessages = useCallback(async (messages: Message[]) => {
        console.log('[handleMessages] Called with', messages.length, 'messages');
        console.log('[handleMessages] Current state:', state, 'role:', role);

        const myId = role;
        if (!myId) {
            console.log('[handleMessages] No role set, returning');
            return;
        }

        const relevant = messages.filter(m => m.sender !== myId);
        console.log('[handleMessages] Relevant messages:', relevant.length);
        if (relevant.length === 0) return;

        // Process all new messages? Or just the last one?
        // For notes, we might receive multiple.
        // For handshake, state machine handles it.
        // Let's iterate.

        // We need to track processed messages to avoid re-processing.
        // Simplified: Just look at the last one for state transitions.
        // For notes, we need to scan all.

        const lastMsg = relevant[relevant.length - 1];
        console.log('[handleMessages] Processing message type:', lastMsg.type);

        if (state === 'CREATED' && lastMsg.type === 'JOIN') {
            console.log('[handleMessages] INITIATOR: Peer joined, starting PSI');
            setState('EXCHANGING');
            addLog('Peer joined. Starting handshake...');

            // Derive shared secret from peer's public key
            if (lastMsg.payload.publicKey) {
                const secret = computeSharedSecret(lastMsg.payload.publicKey, privateKey);
                setSharedSecret(secret);
                addLog('Encryption channel established.');
            }

            console.log('[handleMessages] About to call startPsiStep1, function exists:', typeof startPsiStep1);
            await startPsiStep1();
        }

        if (state === 'EXCHANGING') {
            if (role === 'JOINER' && lastMsg.type === 'STEP_1') {
                addLog('Received Step 1 from Initiator.');

                if (lastMsg.payload.publicKey) {
                    const secret = computeSharedSecret(lastMsg.payload.publicKey, privateKey);
                    setSharedSecret(secret);
                    addLog('Encryption channel established.');
                }

                await runPsiStep2(lastMsg.payload.blinded);
            }
            if (role === 'INITIATOR' && lastMsg.type === 'STEP_2') {
                addLog('Received Step 2 from Joiner.');
                await runPsiStep3(lastMsg.payload);
            }
            if (role === 'JOINER' && lastMsg.type === 'STEP_3') {
                addLog('Received Step 3 from Initiator.');
                await finalizeJoiner(lastMsg.payload);
            }
        }

        // Handle Notes (any state after results)
        if (state === 'RESULTS') {
            // Check for NOTE messages
            for (const msg of relevant) {
                if (msg.type === 'NOTE') {
                    const { uid, encrypted } = msg.payload;
                    if (sharedSecret) {
                        try {
                            const decrypted = await decryptNote(encrypted, sharedSecret);
                            // Always update with the latest note from the peer
                            setNotes(prev => ({ ...prev, [uid]: decrypted }));
                        } catch (e) {
                            console.error('Failed to decrypt note', e);
                        }
                    }
                }
            }
        }
    }, [role, state, events, privateKey, joinerDoubleBlindedA, sharedSecret, notes]);

    // Polling - moved here after handleMessages is defined
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
    }, [sessionId, handleMessages]);

    const createSession = async () => {
        const res = await fetch('/api/signal', {
            method: 'POST',
            body: JSON.stringify({ action: 'create' }),
        });
        const data = await res.json();
        setSessionId(data.sessionId);
        setRole('INITIATOR');
        setState('CREATED');
        addLog(`Session created: ${data.sessionId}`);
    };

    const joinSession = async () => {
        if (!inputSessionId) return;
        const res = await fetch('/api/signal', {
            method: 'POST',
            body: JSON.stringify({
                action: 'join',
                sessionId: inputSessionId,
            }),
        });
        if (res.ok) {
            setSessionId(inputSessionId);
            setRole('JOINER');
            setState('EXCHANGING'); // Wait for Step 1
            addLog(`Joined session: ${inputSessionId}`);
            // Notify initiator with my Public Key
            const myPub = getPublicKey(privateKey);
            await sendMessage('JOIN', { publicKey: myPub }, inputSessionId);
        } else {
            alert('Session not found');
        }
    };

    const sendMessage = async (type: string, payload: any, sid?: string) => {
        const targetSessionId = sid || sessionId;
        console.log('[sendMessage] Sending', type, 'to session', targetSessionId);
        try {
            const res = await fetch('/api/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send',
                    sessionId: targetSessionId,
                    payload: { type, sender: role, payload }
                }),
            });

            if (!res.ok) {
                console.error('[sendMessage] Failed:', res.status, res.statusText);
                const errorData = await res.json().catch(() => ({}));
                console.error('[sendMessage] Error data:', errorData);
            } else {
                console.log('[sendMessage] Success:', type);
            }
        } catch (error) {
            console.error('[sendMessage] Exception:', error);
        }
    };

    // --- PSI Protocol ---

    const startPsiStep1 = async () => {
        addLog('Computing blinded set...');
        const blinded = events.map(e => ({
            uid: e.uid,
            val: blindString(e.uid, privateKey)
        }));

        const myPub = getPublicKey(privateKey);

        // Send blinded values + Public Key
        await sendMessage('STEP_1', {
            blinded: blinded.map(b => b.val),
            publicKey: myPub
        });
        addLog('Sent blinded set to peer.');
    };

    const runPsiStep2 = async (theirBlinded: string[]) => {
        addLog('Processing peer\'s set...');

        const doubleBlinded = theirBlinded.map(val => blindPoint(val, privateKey));
        setJoinerDoubleBlindedA(doubleBlinded); // Store for later comparison

        const myBlinded = events.map(e => ({
            event: e,
            val: blindString(e.uid, privateKey)
        }));

        await sendMessage('STEP_2', {
            doubleBlinded,
            blinded: myBlinded.map(b => b.val)
        });

        addLog('Sent double-blinded values. Waiting for results...');
    };

    const runPsiStep3 = async (payload: { doubleBlinded: string[], blinded: string[] }) => {
        const { doubleBlinded: theirDoubleBlindedA, blinded: theirBlindedB } = payload;

        addLog('Computing intersection...');

        const myDoubleBlindedB = theirBlindedB.map(val => blindPoint(val, privateKey));

        const matchedEvents: CalendarEvent[] = [];
        const setB = new Set(myDoubleBlindedB);

        theirDoubleBlindedA.forEach((val, idx) => {
            if (setB.has(val)) {
                matchedEvents.push(events[idx]);
            }
        });

        setMatches(matchedEvents);
        setState('RESULTS');
        addLog(`Found ${matchedEvents.length} matches!`);

        await sendMessage('STEP_3', myDoubleBlindedB);
    };

    const finalizeJoiner = async (theirDoubleBlindedB: string[]) => {
        addLog('Computing final intersection...');

        const setA = new Set(joinerDoubleBlindedA);
        const matchedEvents: CalendarEvent[] = [];

        theirDoubleBlindedB.forEach((val, idx) => {
            if (setA.has(val)) {
                matchedEvents.push(events[idx]);
            }
        });

        setMatches(matchedEvents);
        setState('RESULTS');
        addLog(`Found ${matchedEvents.length} matches!`);
    };

    const sendNote = async (uid: string) => {
        if (!sharedSecret || !noteText) return;
        const encrypted = await encryptNote(noteText, sharedSecret);
        await sendMessage('NOTE', { uid, encrypted });

        // Update local notes
        setNotes((prev: Record<string, string>) => ({ ...prev, [uid]: noteText })); // Show what we sent
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
                                    <button
                                        onClick={() => setActiveNoteId(activeNoteId === event.uid ? null : event.uid)}
                                        className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors"
                                        title={notes[event.uid] ? "View/edit note" : "Add note"}
                                    >
                                        <MessageSquare className={`w-4 h-4 ${notes[event.uid] ? 'text-green-400 fill-green-400' : ''}`} />
                                    </button>
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
                                                    placeholder="Add an encrypted note..."
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

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/lib/calendar';
import {
    generatePrivateKey,
    blindString,
    hashToPoint,
    blindPoint,
    computeSharedSecret,
    getPublicKey
} from '@/lib/crypto';
import { savePrivateNote, createGoogleCalendarEvent, checkGoogleEventExists } from '@/lib/googleCalendar';
import { fetchGoogleSessionHistory, saveGoogleSessionHistory } from '@/lib/googleHistory';
import { Loader2, Copy, Check, Lock, StickyNote, Trash2, ArrowLeft, ExternalLink, CalendarPlus, RefreshCw, Edit3, MapPin, CalendarCheck, X, Ban } from 'lucide-react';
import { useGoogleAuth } from '@/lib/googleAuth';
import { getSavedSessions, saveSession, deleteSession, SavedSession, ProposalState, ProposalStatus } from '@/lib/sessionStorage';

interface Props {
    events: CalendarEvent[];
    accessToken: string;
    userName: string;
    userEmail: string;
    viewMode?: 'IDLE' | 'HISTORY';
    activeSessionId?: string | null;
    onSessionChange?: (id: string | null) => void;
}

type State = 'IDLE' | 'CREATED' | 'JOINING' | 'EXCHANGING' | 'COMPUTING' | 'RESULTS';

interface Message {
    type: 'JOIN' | 'STEP_1' | 'STEP_2' | 'STEP_3' | 'PROPOSAL' | 'PROPOSAL_ACCEPT' | 'PROPOSAL_REJECT' | 'PROPOSAL_CANCEL';
    sender: string;
    payload: any;
}

export function MatchingSession({ events, accessToken, userName, userEmail, viewMode = 'IDLE', activeSessionId, onSessionChange }: Props) {
    const [state, setState] = useState<State>('IDLE');
    const [displayMode, setDisplayMode] = useState<'list' | 'calendar'>('list');
    const [sessionId, setSessionId] = useState('');
    const [inputSessionId, setInputSessionId] = useState('');
    const [role, setRole] = useState<'INITIATOR' | 'JOINER' | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [matches, setMatches] = useState<CalendarEvent[]>([]);
    const [sessionLabel, setSessionLabel] = useState<string>('');
    const [isEditingLabel, setIsEditingLabel] = useState<boolean>(false);
    const [peerName, setPeerName] = useState<string>('');
    const [peerEmail, setPeerEmail] = useState<string>('');
    // Tracks the LIVE session for polling — NOT changed by loadSavedSession
    const liveSessionIdRef = useRef<string>('');
    // Tracks recently received proposal signals for visual notification flashes
    const [flashedEvents, setFlashedEvents] = useState<Record<string, 'positive' | 'negative'>>({});

    const { expireSession } = useGoogleAuth();

    // Crypto State (for PSI matching only — peer messaging removed)
    const [privateKey] = useState(() => generatePrivateKey());
    const [sharedSecret, setSharedSecret] = useState<string | null>(null);

    // Meeting Proposal State
    const [proposals, setProposals] = useState<Record<string, ProposalState>>({});
    const [proposingEventId, setProposingEventId] = useState<string | null>(null);

    // Google Private Notes State
    const [privateNotes, setPrivateNotes] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        events.forEach(e => {
            if (e.privateNote) {
                initial[e.uid] = e.privateNote;
            }
        });
        return initial;
    });
    const [activePrivateNoteId, setActivePrivateNoteId] = useState<string | null>(null);
    const [privateNoteText, setPrivateNoteText] = useState('');
    const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

    // Export State
    const [exportingEventId, setExportingEventId] = useState<string | null>(null);
    const [exportedEvents, setExportedEvents] = useState<Record<string, string>>({}); // uid -> googleEventId

    // Sync exported event to synchro_my_exported so My Events shows green tick too
    const syncExportToMyEvents = (uid: string, gId: string) => {
        try {
            const stored = JSON.parse(localStorage.getItem('synchro_my_exported') || '{}');
            stored[uid] = gId;
            localStorage.setItem('synchro_my_exported', JSON.stringify(stored));
        } catch { /* silent */ }
    };

    // Bug 2: Restore active session after refresh
    useEffect(() => {
        if (viewMode !== 'IDLE') return;
        try {
            const raw = localStorage.getItem('synchro_active_session');
            if (!raw) return;
            const active = JSON.parse(raw);
            if (active.sessionId && active.role && active.state && active.state !== 'RESULTS') {
                setSessionId(active.sessionId);
                liveSessionIdRef.current = active.sessionId;
                setRole(active.role);
                setState(active.state);
                onSessionChange?.(active.sessionId);
                addLog(`Restored session ${active.sessionId}. Waiting for peer...`);
            }
        } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleExportToGoogle = async (event: CalendarEvent) => {
        setExportingEventId(event.uid);
        try {
            // Enrich event with description from current calendar if missing (saved sessions may lose it)
            const enrichedEvent = { ...event };
            if (!enrichedEvent.description) {
                const fresh = events.find(e => e.uid === event.uid);
                if (fresh?.description) enrichedEvent.description = fresh.description;
            }
            const combinedNote = privateNotes[event.uid] ? privateNotes[event.uid] : '';

            const gId = await createGoogleCalendarEvent(accessToken, enrichedEvent, combinedNote);
            setExportedEvents(prev => ({ ...prev, [event.uid]: gId }));
            syncExportToMyEvents(event.uid, gId);
        } catch (e: any) {
            console.error('Failed to export to Google Calendar', e);
            if (e.message?.includes('401')) {
                expireSession();
            } else {
                alert('Failed to export event. Please try again.');
            }
        } finally {
            setExportingEventId(null);
        }
    };

    const handleSavePrivateNote = async (eventUid: string) => {
        const noteText = privateNoteText;
        // Save locally and persist to the session in localStorage
        setPrivateNotes(prev => {
            const next = { ...prev, [eventUid]: noteText };
            // Also update the saved session so note survives refresh
            if (sessionId) {
                const { getSavedSessions, saveSession } = require('@/lib/sessionStorage');
                const sessions = getSavedSessions();
                const idx = sessions.findIndex((s: any) => s.id === sessionId);
                if (idx >= 0) {
                    sessions[idx].privateNotes = next;
                    saveSession(sessions[idx]);
                }
            }
            return next;
        });
        setActivePrivateNoteId(null);

        // Look for a GCal event ID from either exportedEvents or the proposal record
        const googleEventId = exportedEvents[eventUid] || proposals[eventUid]?.googleEventId;
        if (googleEventId && accessToken) {
            setSavingNoteId(eventUid);
            try {
                // Resolve peer name — prefer peerName state, fall back to session label
                const resolvedPeer = peerName || sessionLabel.replace(/^Synchro w\/ /i, '').trim() || 'Peer';
                await savePrivateNote(accessToken, googleEventId, noteText, `w/ ${resolvedPeer}`);
            } catch (e: any) {
                console.error('Failed to update private note on Google Calendar', e);
                if (e.message?.includes('401')) expireSession();
            } finally {
                setSavingNoteId(null);
            }
        }
        setPrivateNoteText('');
    };

    // Saved Sessions State
    const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
    const [isSyncingHistory, setIsSyncingHistory] = useState(false);

    // Initial Load & Sync
    useEffect(() => {
        const local = getSavedSessions();
        setSavedSessions(local);

        if (accessToken) {
            setIsSyncingHistory(true);
            fetchGoogleSessionHistory(accessToken).then(googleSessions => {
                if (googleSessions.length > 0) {
                    const merged = [...local];
                    googleSessions.forEach(gs => {
                        const localIdx = merged.findIndex(s => s.id === gs.id);
                        if (localIdx === -1) {
                            merged.push(gs);
                        } else {
                            // Local wins for proposal status to prevent remote stale data
                            // overwriting a locally-confirmed cancellation
                            const localSession = merged[localIdx];
                            const mergedProposals = { ...gs.proposals };
                            Object.keys(mergedProposals).forEach(uid => {
                                const localStatus = localSession.proposals?.[uid]?.status;
                                if (localStatus === 'cancelled' || localStatus === 'rejected_by_me') {
                                    mergedProposals[uid] = localSession.proposals![uid];
                                }
                            });
                            merged[localIdx] = { ...gs, proposals: mergedProposals, privateNotes: localSession.privateNotes || gs.privateNotes };
                        }
                    });
                    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setSavedSessions(merged);
                    // Sync local storage with merged results
                    merged.forEach(s => saveSession(s));
                }
            }).catch(console.error).finally(() => setIsSyncingHistory(false));
        }
    }, [accessToken]);

     // Auto-save: merge into existing same-peer session to avoid duplicate entries
    useEffect(() => {
        if (state === 'RESULTS' && sessionId && role && matches.length > 0) {
            const label = sessionLabel || 'Synchro w/ Peer';
            const all = getSavedSessions();
            // Match ONLY by peerEmail — never by display name/label
            const existingIdx = all.findIndex(s => {
                if (s.id === sessionId) return false;
                if (peerEmail && s.peerEmail) return s.peerEmail === peerEmail;
                return false; // no email = no merge
            });

            if (existingIdx >= 0) {
                // Merge current proposals/matches into the existing session
                const existing = all[existingIdx];
                const mergedMatches = [...existing.matches];
                for (const m of matches) {
                    if (!mergedMatches.find(e => e.uid === m.uid)) mergedMatches.push(m);
                }
                const mergedProposals = { ...existing.proposals };
                for (const [uid, p] of Object.entries(proposals)) {
                    const existingStatus = mergedProposals[uid]?.status;
                    if (!existingStatus || existingStatus === 'none' || p.status !== 'none') {
                        mergedProposals[uid] = p;
                    }
                }
                // Update label to current peer name, keep peerEmail, preserve original date
                const merged = { ...existing, matches: mergedMatches, proposals: mergedProposals, label, peerEmail: peerEmail || existing.peerEmail };
                saveSession(merged);
            } else {
                // Check if this session already exists by ID (e.g. loaded from history)
                const existingById = all.find(s => s.id === sessionId);
                const date = existingById ? existingById.date : new Date().toISOString();
                saveSession({ id: sessionId, role, date, matches, notes: {}, privateNotes: privateNotes || {}, proposals, label, peerEmail: peerEmail || undefined });
            }

            const updated = getSavedSessions();
            setSavedSessions(updated);
            if (accessToken) saveGoogleSessionHistory(accessToken, updated.slice(0, 10));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, sessionId, role, matches, proposals, sessionLabel, accessToken]);

    const loadSavedSession = (s: SavedSession) => {
        setSessionId(s.id);
        setRole(s.role as any);
        setMatches(s.matches);
        setProposals(s.proposals || {});
        setPrivateNotes(s.privateNotes || {});
        setSessionLabel(s.label || '');
        setState('RESULTS');

        // Populate exportedEvents from saved proposals so GCal export state is restored
        const exported: Record<string, string> = {};
        Object.entries(s.proposals || {}).forEach(([uid, p]) => {
            if ((p as any).googleEventId) exported[uid] = (p as any).googleEventId;
        });
        setExportedEvents(exported);

        // Restore peerEmail if stored
        if (s.peerEmail) setPeerEmail(s.peerEmail);

        // Async: verify exported events still exist in GCal
        if (accessToken && Object.keys(exported).length > 0) {
            Object.entries(exported).forEach(async ([uid, gId]) => {
                try {
                    const exists = await checkGoogleEventExists(accessToken, gId);
                    if (!exists) {
                        // Event was deleted from GCal — clear export status
                        setExportedEvents(prev => { const n = {...prev}; delete n[uid]; return n; });
                    }
                } catch { /* silent */ }
            });
        }
    };

    const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this saved session?')) {
            deleteSession(id);
            const updated = getSavedSessions();
            setSavedSessions(updated);
            
            // Sync to Google
            if (accessToken) {
                await saveGoogleSessionHistory(accessToken, updated.slice(0, 10));
            }
        }
    };

    const addLog = (msg: string) => setLogs((prev: string[]) => [...prev, msg]);

    const [joinerDoubleBlindedA, setJoinerDoubleBlindedA] = useState<string[]>([]);

    // Track how many messages we've already processed so we never re-process old ones
    const processedCountRef = useRef(0);

    const handleMessages = useCallback(async (messages: Message[]) => {

        // Only process messages we haven't seen yet
        const newMessages = messages.slice(processedCountRef.current);
        if (newMessages.length > 0) {
            processedCountRef.current = messages.length;
        }

        const myId = role;
        if (!myId) return;

        const relevant = newMessages.filter(m => m.sender !== myId);

        if (relevant.length === 0) return;

        // Process all new messages? Or just the last one?
        // For notes, we might receive multiple.
        // For handshake, state machine handles it.
        // Let's iterate.

        // We need to track processed messages to avoid re-processing.
        // Simplified: Just look at the last one for state transitions.
        // For notes, we need to scan all.

        const lastMsg = relevant[relevant.length - 1];


        if (state === 'CREATED' && lastMsg.type === 'JOIN') {

            setState('EXCHANGING');

            // Extract peer's display name and email
            if (lastMsg.payload.name) {
                setPeerName(lastMsg.payload.name);
                setSessionLabel(`Synchro w/ ${lastMsg.payload.name}`);
                addLog(`${lastMsg.payload.name} joined. Starting handshake...`);
            } else {
                addLog('Peer joined. Starting handshake...');
            }
            if (lastMsg.payload.email) setPeerEmail(lastMsg.payload.email);

            // Derive shared secret from peer's public key
            if (lastMsg.payload.publicKey) {
                const secret = computeSharedSecret(lastMsg.payload.publicKey, privateKey);
                setSharedSecret(secret);
                addLog('Encryption channel established.');
            }


            await startPsiStep1();
        }

        if (state === 'EXCHANGING') {
            if (role === 'JOINER' && lastMsg.type === 'STEP_1') {
                // Extract peer's display name and email from STEP_1
                if (lastMsg.payload.name) {
                    setPeerName(lastMsg.payload.name);
                    setSessionLabel(`Synchro w/ ${lastMsg.payload.name}`);
                    addLog(`Received Step 1 from ${lastMsg.payload.name}.`);
                } else {
                    addLog('Received Step 1 from Initiator.');
                }
                if (lastMsg.payload.email) setPeerEmail(lastMsg.payload.email);

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

        // Handle Meeting Proposals (after RESULTS)
        if (state === 'RESULTS') {
            for (const msg of relevant) {
                if (msg.type === 'PROPOSAL') {
                    const { uid, proposerName: pName } = msg.payload;
                    setFlashedEvents(prev => ({ ...prev, [uid]: 'positive' }));
                    setTimeout(() => setFlashedEvents(prev => { const n = {...prev}; delete n[uid]; return n; }), 3000);
                    // Only block new proposals if meeting was already accepted (truly final)
                    // Allow re-proposals after rejection or cancellation
                    setProposals(prev => {
                        const existing = prev[uid];
                        if (existing && existing.status === 'accepted') {
                            return prev; // meeting already confirmed, ignore
                        }
                        return { ...prev, [uid]: { status: 'proposed', proposedBy: 'peer', proposerName: pName } };
                    });
                }
                if (msg.type === 'PROPOSAL_ACCEPT') {
                    const { uid, acceptorName } = msg.payload;
                    setFlashedEvents(prev => ({ ...prev, [uid]: 'positive' }));
                    setTimeout(() => setFlashedEvents(prev => { const n = {...prev}; delete n[uid]; return n; }), 3000);
                    // Peer accepted our proposal — create the event on our calendar
                    // Use acceptorName from the signal payload to avoid stale closure issue
                    const resolvedPeerName = acceptorName || peerName || 'Peer';
                    setProposals(prev => ({
                        ...prev,
                        [uid]: { ...prev[uid], status: 'accepted' }
                    }));
                    // Find the event and create it in our calendar
                    const event = matches.find(e => e.uid === uid);
                    if (event && accessToken) {
                        createGoogleCalendarEvent(accessToken, event, `🤝 Meeting ${resolvedPeerName} 𝘷𝘪𝘢 𝘚𝘺𝘯𝘤𝘩𝘳𝘰`)
                            .then(gId => {
                                setProposals(prev => ({
                                    ...prev,
                                    [uid]: { ...prev[uid], status: 'accepted', googleEventId: gId }
                                }));
                                setExportedEvents(prev => ({ ...prev, [uid]: gId }));
                                syncExportToMyEvents(uid, gId);
                            })
                            .catch(e => {
                                console.error('Failed to create calendar event after acceptance', e);
                                if (e.message.includes('401')) expireSession();
                            });
                    }
                }
                if (msg.type === 'PROPOSAL_REJECT') {
                    const { uid } = msg.payload;
                    setFlashedEvents(prev => ({ ...prev, [uid]: 'negative' }));
                    setTimeout(() => setFlashedEvents(prev => { const n = {...prev}; delete n[uid]; return n; }), 3000);
                    setProposals(prev => ({
                        ...prev,
                        [uid]: { ...prev[uid], status: 'rejected_by_peer' }
                    }));
                }
                if (msg.type === 'PROPOSAL_CANCEL') {
                    const { uid, cancellerName } = msg.payload;
                    setFlashedEvents(prev => ({ ...prev, [uid]: 'negative' }));
                    setTimeout(() => setFlashedEvents(prev => { const n = {...prev}; delete n[uid]; return n; }), 3000);
                    setProposals(prev => ({
                        ...prev,
                        [uid]: { ...prev[uid], status: 'cancelled', cancelledByName: cancellerName }
                    }));
                    // Update GCal if we exported this event
                    const gId = exportedEvents[uid];
                    if (gId && accessToken) {
                        savePrivateNote(accessToken, gId, `🚫 Canceled meeting w/ ${cancellerName}`)
                            .catch(e => console.warn('Failed to update GCal for cancellation', e));
                    }
                }
            }
        }
    }, [role, state, events, privateKey, joinerDoubleBlindedA, sharedSecret, proposals, matches, peerName, accessToken, exportedEvents]);

    // Polling — uses liveSessionIdRef so it continues on the LIVE session even when history is loaded
    useEffect(() => {
        const pollId = liveSessionIdRef.current || sessionId;
        if (!pollId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'poll', sessionId: pollId }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (data.messages) {
                    handleMessages(data.messages);
                }
            } catch (e) {
                console.warn('[poll] fetch failed (transient):', e);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [sessionId, handleMessages]);

    const [duplicateWarning, setDuplicateWarning] = useState<{ label: string; session: SavedSession } | null>(null);

    // When a live match result arrives, check if we already have a session with this peer
    useEffect(() => {
        if (state === 'RESULTS' && peerName && viewMode !== 'HISTORY') {
            const existing = savedSessions.find(s => {
                if (s.id === sessionId) return false;
                // Match ONLY by email — never by display name
                if (peerEmail && s.peerEmail) return s.peerEmail === peerEmail;
                return false;
            });
            if (existing) {
                setDuplicateWarning({ label: peerName, session: existing });
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, peerName]);

    const createSession = async () => {
        const res = await fetch('/api/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create' }),
        });
        const data = await res.json();
        liveSessionIdRef.current = data.sessionId; // fix Bug 7: keep polling live session
        setSessionId(data.sessionId);
        setRole('INITIATOR');
        setState('CREATED');
        // Persist so session survives refresh
        localStorage.setItem('synchro_active_session', JSON.stringify({ sessionId: data.sessionId, role: 'INITIATOR', state: 'CREATED' }));
        onSessionChange?.(data.sessionId);
        addLog(`Session created: ${data.sessionId}`);
    };

    const joinSession = async () => {
        if (!inputSessionId) return;

        // Check for a recent session with the same code — duplicate guard
        const existingById = savedSessions.find(s => s.id === inputSessionId);
        if (existingById) {
            setDuplicateWarning({ label: existingById.label || 'this peer', session: existingById });
            return;
        }

        const res = await fetch('/api/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'join',
                sessionId: inputSessionId,
            }),
        });
        if (res.ok) {
            liveSessionIdRef.current = inputSessionId; // fix Bug 7
            setSessionId(inputSessionId);
            setRole('JOINER');
            setState('EXCHANGING'); // Wait for Step 1
            // Persist so session survives refresh
            localStorage.setItem('synchro_active_session', JSON.stringify({ sessionId: inputSessionId, role: 'JOINER', state: 'EXCHANGING' }));
            onSessionChange?.(inputSessionId);
            addLog(`Joined session: ${inputSessionId}`);
            // Notify initiator with my Public Key
            const myPub = getPublicKey(privateKey);
            await sendMessage('JOIN', { publicKey: myPub, name: userName, email: userEmail }, inputSessionId);
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Invalid code. Try again or start a new session.');
        }
    };

    const sendMessage = async (type: string, payload: any, sid?: string) => {
        const targetSessionId = sid || sessionId;
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
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

                if (res.ok) return; // success — exit

                console.error(`[sendMessage] Attempt ${attempt + 1} failed:`, res.status, res.statusText);
                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
                }
            } catch (error) {
                console.error(`[sendMessage] Attempt ${attempt + 1} exception:`, error);
                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
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

        // Send blinded values + Public Key + Name
        await sendMessage('STEP_1', {
            blinded: blinded.map(b => b.val),
            publicKey: myPub,
            name: userName,
            email: userEmail
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
        // Clear active session persist — session is now saved in history
        localStorage.removeItem('synchro_active_session');
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
        // Clear active session persist
        localStorage.removeItem('synchro_active_session');
        addLog(`Found ${matchedEvents.length} matches!`);
    };

    // --- Meeting Proposal Handlers ---

    const handlePropose = async (event: CalendarEvent) => {
        setProposingEventId(event.uid);
        const newState: ProposalState = { status: 'proposed', proposedBy: 'me', proposerName: userName };
        setProposals(prev => ({ ...prev, [event.uid]: newState }));
        await sendMessage('PROPOSAL', { uid: event.uid, title: event.title, start: event.start, end: event.end, proposerName: userName });
        setProposingEventId(null);
    };

    const handleAccept = async (event: CalendarEvent) => {
        // Update local state immediately
        setProposals(prev => ({ ...prev, [event.uid]: { ...prev[event.uid], status: 'accepted' } }));
        // Signal the proposer — include our name so they can use it in the calendar event title
        await sendMessage('PROPOSAL_ACCEPT', { uid: event.uid, acceptorName: userName });
        // Create on our own calendar
        if (accessToken) {
            try {
                const gId = await createGoogleCalendarEvent(
                    accessToken, event,
                    `🤝 Meeting ${proposals[event.uid]?.proposerName || 'Peer'} 𝘷𝘪𝘢 𝘚𝘺𝘯𝘤𝘩𝘳𝘰`
                );
                setProposals(prev => ({ ...prev, [event.uid]: { ...prev[event.uid], status: 'accepted', googleEventId: gId } }));
                setExportedEvents(prev => ({ ...prev, [event.uid]: gId }));
                syncExportToMyEvents(event.uid, gId);
            } catch (e: any) {
                console.error('Failed to create calendar event on accept', e);
                if (e.message?.includes('401')) expireSession();
            }
        }
    };

    const handleReject = async (uid: string) => {
        setProposals(prev => ({ ...prev, [uid]: { ...prev[uid], status: 'rejected_by_me' } }));
        await sendMessage('PROPOSAL_REJECT', { uid });
    };

    const handleCancel = async (uid: string) => {
        setProposals(prev => ({ ...prev, [uid]: { ...prev[uid], status: 'cancelled', cancelledByName: userName } }));
        await sendMessage('PROPOSAL_CANCEL', { uid, cancellerName: userName });
        // Update GCal if we exported this event (either via proposal accept or manual export)
        const gId = proposals[uid]?.googleEventId || exportedEvents[uid];
        if (gId && accessToken) {
            try {
                const resolvedPeer = peerName || sessionLabel.replace(/^Synchro w\/ /i, '').trim() || 'Peer';
                await savePrivateNote(accessToken, gId, `🚫 Canceled meeting w/ ${resolvedPeer}`);
            } catch (e: any) {
                console.warn('Failed to update GCal for cancellation', e);
                if (e.message?.includes('401')) expireSession();
            }
        }
    };

    // Offline catch-up: user opens a saved session and sees a pending accepted proposal
    const handleAddToMyCalendar = async (event: CalendarEvent) => {
        if (!accessToken) return;
        const p = proposals[event.uid];
        try {
            const gId = await createGoogleCalendarEvent(
                accessToken, event,
                `🤝 Meeting ${p?.proposerName || peerName || 'Peer'} 𝘷𝘪𝘢 𝘚𝘺𝘯𝘤𝘩𝘳𝘰`
            );
            setProposals(prev => ({ ...prev, [event.uid]: { ...prev[event.uid], pendingCalendarAdd: false, googleEventId: gId } }));
            setExportedEvents(prev => ({ ...prev, [event.uid]: gId }));
            syncExportToMyEvents(event.uid, gId);
        } catch (e: any) {
            console.error('Failed to add event to calendar', e);
            if (e.message.includes('401')) {
                expireSession();
            } else {
                alert('Failed to add to Google Calendar. Please try again.');
            }
        }
    };


    return (
        <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl backdrop-blur-xl p-6 shadow-xl relative overflow-hidden">
            {state === 'IDLE' && viewMode === 'IDLE' && (
                <>
                <div className="grid md:grid-cols-2 gap-6 p-2">
                    <button
                        onClick={createSession}
                        className="flex flex-col items-center justify-center p-8 min-h-[200px] rounded-3xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/50 hover:border-primary/50 group text-center transition-all shadow-xl hover:shadow-primary/20 backdrop-blur-md"
                    >
                        <h3 className="text-2xl font-bold mb-4 group-hover:text-primary transition-colors">Start Room</h3>
                        <p className="text-sm text-zinc-400 font-medium">Host a new secure matching room</p>
                    </button>

                    <div className="flex flex-col items-center justify-center p-8 min-h-[200px] rounded-3xl bg-zinc-800/40 border border-zinc-700/50 text-center shadow-xl backdrop-blur-md">
                        <h3 className="text-2xl font-bold mb-4">Join Room</h3>
                        <div className="w-full max-w-[280px]">
                            <div className="flex items-center gap-2 justify-center w-full">
                                <input
                                    type="text"
                                    placeholder="Enter Code"
                                    value={inputSessionId}
                                    onChange={(e) => { setInputSessionId(e.target.value); setDuplicateWarning(null); }}
                                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-accent/50 outline-none text-center text-sm"
                                />
                                <button
                                    onClick={joinSession}
                                    disabled={!inputSessionId}
                                    className="bg-accent hover:bg-accent/90 text-white font-bold py-2.5 px-5 text-sm rounded-lg disabled:opacity-50 whitespace-nowrap transition-colors"
                                >
                                    Join
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {duplicateWarning && (
                    <div className="mt-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
                        <span>Previous session with <strong>{duplicateWarning.label}</strong> exists — proposals merged.</span>
                    </div>
                )}

                </>
            )}


            {/* Saved Sessions List Context */}
            {state === 'IDLE' && viewMode === 'HISTORY' && (
                <div className="w-full text-zinc-100">
                    <h3 className="text-xl font-bold mb-6 flex items-center justify-between pb-4 border-b border-zinc-800/80">
                        <div className="flex items-center gap-2">
                            Saved Sessions
                            <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400 font-normal">
                                {savedSessions.length}
                            </span>
                        </div>
                        {isSyncingHistory && (
                            <div className="flex items-center gap-2 text-xs text-zinc-500 italic">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Syncing...
                            </div>
                        )}
                    </h3>
                    {savedSessions.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500 text-sm italic border border-zinc-800/30 rounded-xl bg-zinc-900/20">
                            No saved matching sessions yet.
                        </div>
                    ) : (
                        <div className="grid gap-2 mt-2">
                            {[...savedSessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(s => (
                                <div 
                                    key={s.id}
                                    onClick={() => loadSavedSession(s)}
                                    className="flex items-center justify-between py-4 border-b last:border-0 border-zinc-800/50 hover:bg-zinc-800/40 cursor-pointer transition-colors group px-4 rounded-xl"
                                >
                                    <div className="flex-1 text-left">
                                        <div className="font-bold text-zinc-200 group-hover:text-primary transition-colors">
                                            {s.label?.includes('Session with Peer') ? 'Synchro w/ Peer' : (s.label || 'Synchro w/ Peer')}
                                        </div>
                                        <div className="text-xs text-zinc-500 mt-1.5 flex items-center gap-3">
                                            <span>{new Date(s.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</span>
                                            <span>•</span>
                                            <span className="font-medium text-zinc-400">{s.matches.length} matches</span>
                                            {Object.keys(s.notes || {}).length > 0 && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-zinc-400 font-medium">{Object.keys(s.notes).length} messages</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => handleDeleteSession(s.id, e)}
                                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="Delete session"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
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
                    <div className="flex flex-col items-center justify-center gap-2 text-zinc-400">
                        <div className="flex items-center gap-2">
                            <Loader2 className="animate-spin w-4 h-4" />
                            <span>Share this code with your friend.</span>
                        </div>
                        <span className="text-xs text-zinc-600">This code is valid for 2 hours.</span>
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
                    {/* Top Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => {
                                    setState('IDLE');
                                    localStorage.removeItem('synchro_active_session');
                                    setMatches([]);
                                    setProposals({});
                                    setSessionId('');
                                    setRole(null);
                                    setIsEditingLabel(false);
                                    onSessionChange?.(null);
                                }}
                                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors p-2 -ml-2 rounded-lg hover:bg-zinc-800"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                            
                            {/* Editable Session Label Header */}
                            <div className="flex items-center gap-2 group relative">
                                {isEditingLabel && viewMode !== 'HISTORY' ? (
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="text"
                                            value={sessionLabel}
                                            onChange={(e) => setSessionLabel(e.target.value)}
                                            placeholder="Synchro w/ Peer"
                                            className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary/50 outline-none transition-all text-white font-bold text-lg w-64"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    setIsEditingLabel(false);
                                                }
                                            }}
                                            onBlur={() => setIsEditingLabel(false)}
                                        />
                                    </div>
                                ) : (
                                    <h2 className="text-xl font-bold flex items-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-400 to-accent">
                                        {sessionLabel || (viewMode === 'HISTORY' ? 'Synchro w/ Peer' : `Synchro w/ ${peerName || 'Peer'}`)}
                                        {viewMode !== 'HISTORY' && (
                                            <button
                                                onClick={() => setIsEditingLabel(true)}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                title="Edit Session Name"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </h2>
                                )}
                            </div>
                        </div>

                        {/* Top Right Actions */}
                        {viewMode === 'HISTORY' && (
                            <button 
                                onClick={(e) => {
                                    handleDeleteSession(sessionId, e);
                                    setState('IDLE');
                                    localStorage.removeItem('synchro_active_session');
                                    setMatches([]);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between mt-8 mb-4">
                        <div className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{matches.length} Matches Found</div>
                    </div>

                    {/* Duplicate peer warning — shown when a session with this peer already exists */}
                    {duplicateWarning && viewMode !== 'HISTORY' && (
                        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
                            <span>Previous session with <strong>{duplicateWarning.label}</strong> found — proposals merged into existing record.</span>
                        </div>
                    )}

                    <div className="grid gap-4">
                        {displayMode === 'list' ? matches.map(event => (
                            <div
                                key={event.uid}
                                className={`rounded-xl border bg-zinc-900/80 backdrop-blur-sm transition-all duration-300 overflow-hidden
                                    ${ flashedEvents[event.uid] === 'positive' ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                                      : flashedEvents[event.uid] === 'negative' ? 'border-amber-500 ring-2 ring-amber-500/40'
                                      : proposals[event.uid]?.status === 'accepted' ? 'border-emerald-700/50' : 'border-zinc-700/50' }`}
                            >
                                {/* Event header */}
                                <div className="flex justify-between items-start gap-3 p-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-zinc-400">
                                                {new Date(event.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="text-xs text-zinc-500">•</span>
                                            <span className="text-xs text-zinc-500">
                                                {new Date(event.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {event.url ? (
                                            <a
                                                href={event.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className="font-bold text-lg text-white truncate block hover:text-violet-300 transition-colors cursor-pointer"
                                            >
                                                {event.title}
                                            </a>
                                        ) : (
                                            <p className="font-bold text-lg text-white truncate block">{event.title}</p>
                                        )}
                                        {event.location && (
                                            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 group-hover:text-zinc-400 transition-colors">
                                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                {event.location}
                                            </p>
                                        )}
                                    </div>
                                    {/* Quick export / private note buttons — stop propagation so they don't open Luma */}
                                    <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => handleExportToGoogle(event)}
                                            disabled={exportingEventId === event.uid || !!exportedEvents[event.uid]}
                                            className={`p-2 rounded-lg transition-colors ${exportedEvents[event.uid] ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'}`}
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
                                            className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors"
                                            title="Add personal private note"
                                        >
                                            <StickyNote className={`w-4 h-4 ${privateNotes[event.uid] ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Card body — padding separate from header so the flash ring doesn't clip content */}
                                <div className="px-4 pb-4 flex flex-col gap-3">

                                {/* Meeting Proposal Status Banner */}
                                {proposals[event.uid]?.status === 'proposed' && proposals[event.uid]?.proposedBy === 'peer' && (
                                    <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm text-primary font-medium flex items-center gap-2">
                                        <CalendarCheck className="w-4 h-4 shrink-0" />
                                        <span>{proposals[event.uid]?.proposerName || peerName || 'Your peer'} wants to meet at this event</span>
                                    </div>
                                )}
                                {proposals[event.uid]?.status === 'proposed' && proposals[event.uid]?.proposedBy === 'me' && (
                                    <div className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                        <span>Awaiting response from {peerName || 'peer'}…</span>
                                    </div>
                                )}
                                {proposals[event.uid]?.status === 'accepted' && (
                                    <div className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-sm text-emerald-400 font-medium flex items-center gap-2">
                                        <Check className="w-4 h-4 shrink-0" />
                                        <span>Meeting confirmed — added to both calendars</span>
                                    </div>
                                )}
                                {proposals[event.uid]?.status === 'rejected_by_peer' && (
                                    <div className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700/50 text-sm text-zinc-500 flex items-center gap-2">
                                        <X className="w-4 h-4 shrink-0" />
                                        <span>{peerName || 'Peer'} declined your proposal</span>
                                    </div>
                                )}
                                {proposals[event.uid]?.status === 'rejected_by_me' && (
                                    <div className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700/50 text-sm text-zinc-500 flex items-center gap-2">
                                        <X className="w-4 h-4 shrink-0" />
                                        <span>You declined this proposal</span>
                                    </div>
                                )}
                                {proposals[event.uid]?.status === 'cancelled' && (() => {
                                    const p = proposals[event.uid]!;
                                    const wasMeeting = p.googleEventId || exportedEvents[event.uid];
                                    const iCancelled = p.cancelledByName === userName;
                                    const peerLabel = iCancelled ? (peerName || 'Peer') : (p.cancelledByName || peerName || 'Peer');
                                    return (
                                        <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/30 text-sm text-red-400 flex items-center gap-2">
                                            <Ban className="w-4 h-4 shrink-0" />
                                            <span>{wasMeeting
                                                ? `Canceled meeting w/ ${peerLabel}`
                                                : (iCancelled ? 'Proposal withdrawn' : `${peerLabel} withdrew their proposal`)}
                                            </span>
                                        </div>
                                    );
                                })()}

                                {/* Offline catch-up: accepted but calendar not yet created */}
                                {proposals[event.uid]?.status === 'accepted' && proposals[event.uid]?.pendingCalendarAdd && !proposals[event.uid]?.googleEventId && (
                                    <button
                                        onClick={() => handleAddToMyCalendar(event)}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
                                    >
                                        <CalendarPlus className="w-4 h-4" />
                                        Add to My Google Calendar
                                    </button>
                                )}

                                {/* 4-button Action Bar */}
                                {(() => {
                                    const p = proposals[event.uid];
                                    const status: ProposalStatus = p?.status ?? 'none';
                                    const isMeProposer = p?.proposedBy === 'me';
                                    const isHistory = viewMode === 'HISTORY' && !sessionId;
                                    const canPropose = !isHistory && (status === 'none' || status === 'rejected_by_me' || status === 'cancelled');
                                    const canAccept = !isHistory && status === 'proposed' && !isMeProposer;
                                    const canReject = !isHistory && status === 'proposed' && !isMeProposer;
                                    const canCancel = (status === 'proposed' && isMeProposer) || status === 'accepted';
                                    return (
                                        <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-1.5 pt-2 border-t border-zinc-700/40" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handlePropose(event)}
                                                disabled={!canPropose || proposingEventId === event.uid}
                                                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-700/60 hover:bg-primary/20 hover:text-primary disabled:hover:bg-zinc-700/60 disabled:hover:text-current"
                                            >
                                                {proposingEventId === event.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarCheck className="w-3 h-3" />}
                                                Propose
                                            </button>
                                            <button
                                                onClick={() => handleAccept(event)}
                                                disabled={!canAccept}
                                                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-700/60 hover:bg-emerald-600/20 hover:text-emerald-400 disabled:hover:bg-zinc-700/60 disabled:hover:text-current"
                                            >
                                                <Check className="w-3 h-3" />
                                                Accept
                                            </button>
                                            <button
                                                onClick={() => handleReject(event.uid)}
                                                disabled={!canReject}
                                                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-700/60 hover:bg-red-500/20 hover:text-red-400 disabled:hover:bg-zinc-700/60 disabled:hover:text-current"
                                            >
                                                <X className="w-3 h-3" />
                                                Reject
                                            </button>
                                            <button
                                                onClick={() => handleCancel(event.uid)}
                                                disabled={!canCancel}
                                                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-700/60 hover:bg-orange-500/20 hover:text-orange-400 disabled:hover:bg-zinc-700/60 disabled:hover:text-current"
                                            >
                                                <Ban className="w-3 h-3" />
                                                Cancel
                                            </button>
                                        </div>
                                    );
                                })()}

                                {/* Google Calendar Private Notes Section */}
                                {(activePrivateNoteId === event.uid || privateNotes[event.uid]) && (
                                    <div className="pt-3 border-t border-zinc-700/50" onClick={e => e.stopPropagation()}>
                                        {privateNotes[event.uid] && activePrivateNoteId !== event.uid && (
                                            <div className="mb-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-sm">
                                                <span className="text-xs text-amber-500/70 flex items-center gap-1 mb-1">
                                                    <Lock className="w-3 h-3" /> Private Note {exportedEvents[event.uid] ? '(Synced to Google)' : '(Local Only)'}:
                                                </span>
                                                <span className="text-amber-100">{privateNotes[event.uid]}</span>
                                            </div>
                                        )}
                                        {activePrivateNoteId === event.uid && (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Add a private note (exports to Google Calendar)..."
                                                    value={privateNoteText}
                                                    onChange={(e) => setPrivateNoteText(e.target.value)}
                                                    className="flex-1 bg-zinc-900 border border-amber-500/50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                    disabled={savingNoteId === event.uid}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleSavePrivateNote(event.uid); }}
                                                />
                                                <button
                                                    onClick={() => handleSavePrivateNote(event.uid)}
                                                    disabled={savingNoteId === event.uid}
                                                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center"
                                                >
                                                    {savingNoteId === event.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                </div>{/* end card body wrapper */}
                            </div>

                        )) : (
                            <div className="space-y-6 mt-4">
                                {Object.entries(matches.reduce((acc, match) => {
                                    const dateStr = new Date(match.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                                    if (!acc[dateStr]) acc[dateStr] = [];
                                    acc[dateStr].push(match);
                                    return acc;
                                }, {} as Record<string, CalendarEvent[]>)).map(([date, dayEvents]) => (
                                    <div key={date} className="bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
                                        <div className="bg-zinc-800/80 px-4 py-2 text-primary font-bold text-sm">
                                            {date}
                                        </div>
                                        <div className="divide-y divide-zinc-800/50">
                                            {dayEvents.map(event => (
                                                <div
                                                    key={event.uid}
                                                    onClick={() => event.url && window.open(event.url, '_blank', 'noopener,noreferrer')}
                                                    className={`group p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${
                                                        event.url ? 'cursor-pointer' : ''
                                                    } hover:bg-violet-950/20 hover:shadow-[inset_0_0_20px_rgba(139,92,246,0.07)]`}
                                                >
                                                    <div>
                                                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                                                            {new Date(event.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                                            {event.url && (
                                                                <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                                                            )}
                                                        </div>
                                                        <h4 className="font-bold group-hover:text-violet-100 transition-colors">{event.title}</h4>
                                                        {event.location && (
                                                            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 group-hover:text-zinc-400 transition-colors">
                                                                <MapPin className="w-3 h-3 shrink-0" />
                                                                {event.location}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleExportToGoogle(event)}
                                                            disabled={exportingEventId === event.uid || !!exportedEvents[event.uid]}
                                                            className={`p-1.5 rounded-md transition-colors ${exportedEvents[event.uid] ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'}`}
                                                            title="Export to Google"
                                                        >
                                                            {exportingEventId === event.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                                                            exportedEvents[event.uid] ? <Check className="w-4 h-4" /> : <CalendarPlus className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {matches.length === 0 && (
                            <p className="text-center text-zinc-500">No overlaps found.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

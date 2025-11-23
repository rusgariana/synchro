'use client';

import { useState } from 'react';
import { fetchCalendar, parseICS, CalendarEvent } from '@/lib/calendar';
import { Loader2 } from 'lucide-react';

interface Props {
    onCalendarLoaded: (events: CalendarEvent[]) => void;
}

export function CalendarInput({ onCalendarLoaded }: Props) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const icsContent = await fetchCalendar(url);
            const events = parseICS(icsContent);
            if (events.length === 0) {
                setError('No events found in calendar.');
            } else {
                onCalendarLoaded(events);
            }
        } catch (err) {
            setError('Failed to load calendar. Please check the URL.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <label htmlFor="cal-url" className="text-sm font-medium text-zinc-400">
                        Lu.ma Calendar URL (ICS)
                    </label>
                    <input
                        id="cal-url"
                        type="url"
                        placeholder="https://lu.ma/ics/..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        required
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {loading && <Loader2 className="animate-spin w-4 h-4" />}
                    Load Calendar
                </button>
            </form>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-400">
                <p className="font-bold text-zinc-300 mb-2">How to find your URL:</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Go to <strong>Settings</strong> → <strong>Calendar Syncing</strong></li>
                    <li>Click <strong>Add iCal Subscription</strong></li>
                    <li>Copy the URL that appears</li>
                </ol>
                <p className="mt-3 text-xs text-zinc-500">
                    Note: This is your private feed. We process it locally in your browser to extract event IDs. Your schedule is never sent to our servers.
                </p>
            </div>

            {error && (
                <p className="text-red-500 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                    {error}
                </p>
            )}
        </div>
    );
}

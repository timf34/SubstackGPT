import React, { useState, ReactNode } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

interface AlertProps {
    children: ReactNode;
    variant?: 'default' | 'destructive';
}

interface AlertDescriptionProps {
    children: ReactNode;
}

const Alert = ({ children, variant = 'default' }: AlertProps) => (
    <div className={`p-4 rounded-md ${variant === 'destructive' ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900'}`}>
        {children}
    </div>
);

const AlertDescription = ({ children }: AlertDescriptionProps) => <div className="text-sm">{children}</div>;

interface SubstackURLInputProps {
    onScrapeComplete: (data: any) => void;
    onBack: () => void;
}

interface Progress {
    current: number;
    total: number;
    currentTitle?: string;
}

declare global {
    interface Window {
        activeEventSource?: EventSource;
    }
}

const SubstackURLInput = ({ onScrapeComplete, onBack }: SubstackURLInputProps) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [progress, setProgress] = useState<Progress | null>(null);

    const saveWriter = async (data: any) => {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { error } = await supabase
            .from('writers')
            .upsert({
                name: data.author,
                substack_url: data.url,
                last_scraped_at: new Date().toISOString()
            }, {
                onConflict: 'substack_url',
                update: {
                    last_scraped_at: new Date().toISOString()
                }
            });

        if (error) {
            console.error('Error saving writer:', error);
            throw error;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setProgress(null);
        setIsLoading(true);

        // Close any existing EventSource
        if (window.activeEventSource) {
            window.activeEventSource.close();
        }

        try {
            console.log('Creating EventSource connection...');
            const eventSource = new EventSource(`/api/scrape-substack?url=${encodeURIComponent(url)}`);
            // Store the EventSource instance globally so we can close it if needed
            window.activeEventSource = eventSource;
            
            eventSource.onmessage = async (event) => {
                try {
                    console.log('Raw SSE message:', event.data);
                    const data = JSON.parse(event.data);
                    console.log('Parsed SSE data:', data);
                    
                    switch (data.type) {
                        case 'start':
                            console.log('Scraping started');
                            break;
                            
                        case 'progress':
                            console.log(`Progress update: ${data.current}/${data.total}`);
                            setProgress({
                                current: data.current,
                                total: data.total,
                                currentTitle: data.currentTitle
                            });
                            break;
                            
                        case 'complete':
                            console.log('Scraping complete!');
                            eventSource.close();
                            try {
                                await saveWriter(data.result);
                                setSuccess('Successfully scraped and saved Substack posts!');
                                onScrapeComplete(data.result);
                            } catch (err) {
                                setError('Failed to save writer information');
                            }
                            setIsLoading(false);
                            break;
                            
                        case 'error':
                            console.error('Error from SSE:', data.message);
                            eventSource.close();
                            setError(data.message || 'Failed to scrape Substack');
                            setIsLoading(false);
                            break;
                    }
                } catch (err) {
                    console.error('Error parsing SSE message:', err);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                eventSource.close();
                setError('Connection error. Please try again.');
                setIsLoading(false);
            };

            eventSource.onopen = () => {
                console.log('SSE connection opened successfully');
            };
        } catch (err) {
            console.error('Error in handleSubmit:', err);
            setError('Failed to scrape Substack. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-4">
            <button
                onClick={onBack}
                className="mb-4 text-sm text-gray-600 hover:text-gray-900"
            >
                ← Back to writer selection
            </button>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col space-y-2">
                    <label htmlFor="substack-url" className="text-sm font-medium">
                        Enter Substack URL
                    </label>
                    <div className="flex space-x-2">
                        <input
                            id="substack-url"
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.substack.com"
                            className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex items-center space-x-2 rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <ExternalLink size={20} />
                            )}
                            <span>Scrape</span>
                        </button>
                    </div>
                </div>

                {progress && (
                    <div className="mt-4 p-4 border rounded-lg bg-white shadow-sm">
                        <div className="mb-2">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                                <div 
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Progress: {Math.round((progress.current / progress.total) * 100)}%</span>
                                <span>{progress.current} of {progress.total} posts</span>
                            </div>
                        </div>
                        {progress.currentTitle && (
                            <div className="text-sm text-gray-600 mt-2">
                                <span className="font-medium">Currently processing:</span>
                                <span className="italic ml-2">{progress.currentTitle}</span>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert>
                        <AlertDescription>{success}</AlertDescription>
                    </Alert>
                )}
            </form>
        </div>
    );
};

export default SubstackURLInput;
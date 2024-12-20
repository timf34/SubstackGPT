import React, { useState, ReactNode } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

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
}

interface Progress {
    current: number;
    total: number;
    currentTitle?: string;
}

const SubstackURLInput = ({ onScrapeComplete }: SubstackURLInputProps) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [progress, setProgress] = useState<Progress | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setProgress(null);

        // TODO: Add validation for URL... tricky to do as custom domains can be used. Should use .xml/ .rss to validate

        setIsLoading(true);

        try {
            const eventSource = new EventSource(`/api/scrape-substack?url=${encodeURIComponent(url)}`);
            
            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'progress') {
                    setProgress({
                        current: data.current,
                        total: data.total,
                        currentTitle: data.currentTitle
                    });
                } else if (data.type === 'complete') {
                    eventSource.close();
                    setSuccess('Successfully scraped Substack posts!');
                    onScrapeComplete(data.result);
                    setIsLoading(false);
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                setError('Failed to scrape Substack. Please try again.');
                setIsLoading(false);
            };
        } catch (err) {
            setError('Failed to scrape Substack. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-4">
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
                    <div className="mt-4">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            ></div>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                            Scraped {progress.current} of {progress.total} posts
                            {progress.currentTitle && (
                                <span className="block italic">
                                    Currently processing: {progress.currentTitle}
                                </span>
                            )}
                        </p>
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
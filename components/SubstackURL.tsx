import React, { useState } from 'react';
import { IconExternalLink, IconLoader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const SubstackURLInput = ({ onScrapeComplete }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const validateSubstackUrl = (url: string) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('substack.com') ||
                urlObj.hostname.split('.').length === 2; // For custom domains like "world.hey.com"
        } catch {
            return false;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!validateSubstackUrl(url)) {
            setError('Please enter a valid Substack URL');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/scrape-substack', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                throw new Error('Failed to scrape Substack');
            }

            const data = await response.json();
            setSuccess('Successfully scraped Substack posts!');
            onScrapeComplete(data);
        } catch (err) {
            setError('Failed to scrape Substack. Please try again.');
        } finally {
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
                                <IconLoader2 className="animate-spin" />
                            ) : (
                                <IconExternalLink size={20} />
                            )}
                            <span>Scrape</span>
                        </button>
                    </div>
                </div>

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
import { NextApiRequest, NextApiResponse } from 'next';
import { SubstackScraper } from '@/scripts/substack_scraper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Helper function to send SSE messages
    const sendSSE = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        // Flush the response to ensure the client receives it immediately
        if (res.flush) {
            res.flush();
        }
    };

    try {
        console.log('Starting scrape with SSE...');
        sendSSE({ type: 'start' });

        const scraper = new SubstackScraper(url, {
            onProgress: (current, total, currentTitle) => {
                console.log(`Sending progress: ${current}/${total}`);
                sendSSE({
                    type: 'progress',
                    current,
                    total,
                    currentTitle
                });
            }
        });

        const data = await scraper.scrape();
        
        sendSSE({
            type: 'complete',
            result: data
        });
        
        res.end();
    } catch (error: any) {
        console.error('Scraping error:', error);
        sendSSE({
            type: 'error',
            message: error.message
        });
        res.end();
    }
}
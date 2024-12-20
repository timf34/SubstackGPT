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

    try {
        const scraper = new SubstackScraper(url, {
            onProgress: (current, total, currentTitle) => {
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    current,
                    total,
                    currentTitle
                })}\n\n`);
            }
        });

        const data = await scraper.scrape();
        
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            result: data
        })}\n\n`);
        
        res.end();
    } catch (error: any) {
        res.write(`data: ${JSON.stringify({
            type: 'error',
            message: error.message
        })}\n\n`);
        res.end();
    }
}
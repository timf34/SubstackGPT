import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import axios from 'axios';
import { encode } from 'gpt-3-encoder';

interface SubstackPost {
    title: string;
    url: string;
    date: string;
    content: string;
    length: number;
    tokens: number;
    chunks: PostChunk[];
}

interface PostChunk {
    essay_title: string;
    essay_url: string;
    essay_date: string;
    content: string;
    content_length: number;
    content_tokens: number;
    embedding: number[];
}

interface SubstackJSON {
    current_date: string;
    author: string;
    url: string;
    length: number;
    tokens: number;
    essays: SubstackPost[];
}

const CHUNK_SIZE = 200;

interface ScraperOptions {
    onProgress?: (current: number, total: number, currentTitle?: string) => void;
}

export class SubstackScraper {
    private readonly baseUrl: string;
    private readonly writerName: string;
    private readonly turndownService: TurndownService;
    private readonly options: ScraperOptions;

    constructor(baseSubstackUrl: string, options: ScraperOptions = {}) {
        this.baseUrl = baseSubstackUrl.endsWith('/') ? baseSubstackUrl : `${baseSubstackUrl}/`;
        this.writerName = this.extractMainPart(baseSubstackUrl);
        this.turndownService = new TurndownService();
        this.options = options;
        console.log(`🚀 Initialized SubstackScraper for ${this.writerName} at ${this.baseUrl}`);
    }

    private extractMainPart(url: string): string {
        const parts = new URL(url).hostname.split('.');
        return parts[0] === 'www' ? parts[1] : parts[0];
    }

    private async fetchUrlsFromSitemap(): Promise<string[]> {
        try {
            const sitemapUrl = `${this.baseUrl}sitemap.xml`;
            console.log(`📑 Attempting to fetch sitemap from ${sitemapUrl}`);
            const response = await axios.get(sitemapUrl);
            console.log(`✅ Sitemap fetched successfully`);
            
            const parser = new XMLParser();
            const result = parser.parse(response.data);
            console.log(`✅ Sitemap parsed successfully`);

            const urls = result.urlset.url.map((entry: any) => entry.loc);
            const filteredUrls = this.filterUrls(urls);
            console.log(`📝 Found ${urls.length} total URLs, ${filteredUrls.length} after filtering`);
            return filteredUrls;
        } catch (error) {
            console.error('❌ Error fetching sitemap:', error.message);
            throw error; // Propagate error up
        }
    }

    private filterUrls(urls: string[]): string[] {
        const KEYWORDS_TO_FILTER = ['about', 'archive', 'podcast'];
        return urls.filter(url =>
            !KEYWORDS_TO_FILTER.some(keyword => url.includes(keyword))
        );
    }

    private async getPostContent(url: string): Promise<SubstackPost | null> {
        try {
            console.log(`📥 Fetching content from ${url}`);
            const response = await axios.get(url);
            console.log(`✅ Content fetched successfully for ${url}`);
            
            const dom = new JSDOM(response.data);
            const document = dom.window.document;

            // Check for paywall
            const paywall = document.querySelector('h2.paywall-title');
            if (paywall) {
                console.log(`🔒 Skipping premium article: ${url}`);
                return null;
            }

            const title = document.querySelector('h1.post-title, h2')?.textContent?.trim() ?? 'Untitled';
            console.log(`📝 Processing article: "${title}"`);
            
            const date = document.querySelector('div[class*="_meta_"]')?.textContent?.trim() ?? 'Date not found';
            const contentElement = document.querySelector('div.available-content');
            
            if (!contentElement) {
                console.error(`❌ Content element not found for ${url}`);
                throw new Error('Content element not found');
            }

            console.log(`🔄 Converting HTML to Markdown for "${title}"`);
            const markdown = this.turndownService.turndown(contentElement.outerHTML);
            console.log(`✅ Markdown conversion complete for "${title}"`);
            
            const chunks = this.createChunks(markdown, title, url, date);
            console.log(`✂️  Created ${chunks.length} chunks for "${title}"`);

            return {
                title,
                url,
                date,
                content: markdown,
                length: markdown.length,
                tokens: encode(markdown).length,
                chunks
            };
        } catch (error: unknown) {
            if (error instanceof Error) {
            console.error(`❌ Error processing ${url}:`, error.message);
            } else {
                console.error(`❌ Error processing ${url}:`, String(error));
            }
            return null;
        }
    }

    private createChunks(content: string, title: string, url: string, date: string): PostChunk[] {
        const chunks: PostChunk[] = [];
        const contentTokens = encode(content);

        if (contentTokens.length > CHUNK_SIZE) {
            const split = content.split(". ");
            let chunkText = "";

            for (let i = 0; i < split.length; i++) {
                const sentence = split[i];
                const sentenceTokenLength = encode(sentence).length;
                const chunkTextTokenLength = encode(chunkText).length;

                if (chunkTextTokenLength + sentenceTokenLength > CHUNK_SIZE) {
                    chunks.push(this.createChunk(chunkText.trim(), title, url, date));
                    chunkText = "";
                }

                if (sentence[sentence.length - 1].match(/[a-z0-9]/i)) {
                    chunkText += sentence + ". ";
                } else {
                    chunkText += sentence + " ";
                }
            }

            if (chunkText.trim().length > 0) {
                chunks.push(this.createChunk(chunkText.trim(), title, url, date));
            }
        } else {
            chunks.push(this.createChunk(content.trim(), title, url, date));
        }

        return chunks;
    }

    private createChunk(content: string, title: string, url: string, date: string): PostChunk {
        return {
            essay_title: title,
            essay_url: url,
            essay_date: date,
            content: content,
            content_length: content.length,
            content_tokens: encode(content).length,
            embedding: [] // Will be filled later by the embedding process
        };
    }

    public async scrape(): Promise<SubstackJSON> {
        const urls = await this.fetchUrlsFromSitemap();
        const essays: SubstackPost[] = [];

        // Apply development mode limit if enabled
        const devMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
        const devLimit = parseInt(process.env.DEV_MODE_ARTICLE_LIMIT || '5');
        const urlsToProcess = devMode ? urls.slice(0, devLimit) : urls;

        if (devMode) {
            console.log(`🔧 Development mode: Processing only ${devLimit} articles`);
        }

        for (let index = 0; index < urlsToProcess.length; index++) {
            const url = urlsToProcess[index];
            console.log(`🔄 Scraping post ${index + 1}/${urlsToProcess.length}: ${url}`);
            const post = await this.getPostContent(url);
            if (post) {
                essays.push(post);
                this.options.onProgress?.(index + 1, urlsToProcess.length, post.title);
                console.log(`✅ Successfully scraped: ${post.title}`);
            }
        }

        const json: SubstackJSON = {
            current_date: new Date().toISOString().split('T')[0],
            author: this.writerName,
            url: this.baseUrl,
            length: essays.reduce((acc, essay) => acc + essay.length, 0),
            tokens: essays.reduce((acc, essay) => acc + essay.tokens, 0),
            essays
        };

        // Save to file
        const outputPath = path.join(process.cwd(), 'scripts', `${this.writerName}.json`);
        console.log(`💾 Saving results to ${outputPath}`);
        await fs.writeFile(outputPath, JSON.stringify(json, null, 2));
        console.log(`✨ Scraping complete! Processed ${essays.length} posts with ${json.tokens} tokens`);

        return json;
    }
}

export default SubstackScraper;
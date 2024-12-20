import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import axios from 'axios';
import sanitize from 'sanitize-filename';

// Configuration constants
const BASE_MD_DIR = 'substack_md_files';
const KEYWORDS_TO_FILTER = ['about', 'archive', 'podcast'];

interface PostMetadata {
    title: string;
    subtitle: string | null;
    date: string;
    likeCount: string;
}

interface PostData extends PostMetadata {
    content: string;
    url: string;
}

interface ScraperOptions {
    plainTextMode?: boolean;
}

class SubstackScraper {
    private readonly baseUrl: string;
    private readonly writerName: string;
    private readonly mdSaveDir: string;
    private readonly turndownService: TurndownService;
    private readonly options: ScraperOptions;

    constructor(baseSubstackUrl: string, options: ScraperOptions = {}) {
        this.baseUrl = baseSubstackUrl.endsWith('/') ? baseSubstackUrl : `${baseSubstackUrl}/`;
        this.writerName = this.extractMainPart(baseSubstackUrl);
        this.mdSaveDir = path.join(BASE_MD_DIR, this.writerName);
        this.options = options;

        this.turndownService = new TurndownService();

        if (this.options.plainTextMode) {
            // Configure turndown to strip all formatting
            this.turndownService.remove(['style', 'script']); // Remove style and script tags
            this.turndownService.addRule('removeImages', {
                filter: ['img', 'figure'],
                replacement: () => ''
            });
            this.turndownService.addRule('removeLinks', {
                filter: ['a'],
                replacement: (content) => content
            });
            this.turndownService.addRule('removeFormatting', {
                filter: ['strong', 'em', 'i', 'b', 'code', 'pre', 'blockquote'],
                replacement: (content) => content
            });
        }
    }

    private extractMainPart(url: string): string {
        const parts = new URL(url).hostname.split('.');
        return parts[0] === 'www' ? parts[1] : parts[0];
    }

    private async ensureDirectoryExists(): Promise<void> {
        try {
            await fs.access(this.mdSaveDir);
        } catch {
            await fs.mkdir(this.mdSaveDir, { recursive: true });
            console.log(`Created directory ${this.mdSaveDir}`);
        }
    }

    private async fetchUrlsFromSitemap(): Promise<string[]> {
        try {
            const sitemapUrl = `${this.baseUrl}sitemap.xml`;
            console.log(`Fetching sitemap from: ${sitemapUrl}`);
            const response = await axios.get(sitemapUrl);
            console.log('Sitemap fetched, parsing XML...');
            const parser = new XMLParser();
            const result = parser.parse(response.data);

            const urls = result.urlset.url.map((entry: any) => entry.loc);
            return this.filterUrls(urls);
        } catch (error) {
            console.error('Error fetching sitemap:', error);
            return [];
        }
    }

    private async fetchUrlsFromFeed(): Promise<string[]> {
        try {
            console.log('Falling back to feed.xml (limited to ~22 most recent posts)');
            const feedUrl = `${this.baseUrl}feed.xml`;
            console.log(`Fetching feed from: ${feedUrl}`);
            const response = await axios.get(feedUrl);
            const parser = new XMLParser();
            const result = parser.parse(response.data);

            const items = Array.isArray(result.rss.channel.item)
                ? result.rss.channel.item
                : [result.rss.channel.item];

            const urls = items.map((item: any) => item.link);
            return this.filterUrls(urls);
        } catch (error) {
            console.error('Error fetching feed:', error);
            return [];
        }
    }

    private filterUrls(urls: string[]): string[] {
        return urls.filter(url =>
            !KEYWORDS_TO_FILTER.some(keyword => url.includes(keyword))
        );
    }

    private async getPostContent(url: string): Promise<PostData | null> {
        try {
            console.log(`Fetching post content from: ${url}`);
            const response = await axios.get(url);
            console.log('Post content fetched, parsing HTML...');
            const dom = new JSDOM(response.data);
            const document = dom.window.document;

            // Check for paywall
            const paywall = document.querySelector('h2.paywall-title');
            if (paywall) {
                console.log(`Skipping premium article: ${url}`);
                return null;
            }

            const title = document.querySelector('h1.post-title, h2')?.textContent?.trim() ?? 'Untitled';
            const subtitle = document.querySelector('h3.subtitle')?.textContent?.trim() ?? null;
            const date = document.querySelector('div[class*="_meta_"]')?.textContent?.trim() ?? 'Date not found';
            const likeCount = document.querySelector('a.post-ufi-button .label')?.textContent?.trim() ?? '0';

            const contentElement = document.querySelector('div.available-content');
            if (!contentElement) {
                throw new Error('Content element not found');
            }

            // Convert the element to string to avoid type issues with turndown
            const contentHtml = contentElement.outerHTML;
            const markdown = this.turndownService.turndown(contentHtml);

            return {
                title,
                subtitle,
                date,
                likeCount,
                content: markdown,
                url
            };
        } catch (error) {
            console.error(`Error fetching post ${url}:`, error);
            return null;
        }
    }

    private combineMetadataAndContent(postData: PostData): string {
        let content = '';

        if (this.options.plainTextMode) {
            // Plain text mode - no formatting
            content = `${postData.title}\n\n`;
            if (postData.subtitle) {
                content += `${postData.subtitle}\n\n`;
            }
            content += `Date: ${postData.date}\n`;
            content += postData.content;
        } else {
            // Regular markdown mode
            content = `# ${postData.title}\n\n`;
            if (postData.subtitle) {
                content += `## ${postData.subtitle}\n\n`;
            }
            content += `**${postData.date}**\n\n`;
            content += `**Likes:** ${postData.likeCount}\n\n`;
            content += postData.content;
        }

        return content;
    }

    private async saveToFile(filename: string, content: string): Promise<void> {
        const filepath = path.join(this.mdSaveDir, filename);

        try {
            await fs.access(filepath);
            console.log(`File already exists: ${filepath}`);
            return;
        } catch {
            await fs.writeFile(filepath, content, 'utf-8');
            console.log(`Saved: ${filepath}`);
        }
    }

    private getFilenameFromUrl(url: string): string {
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        return `${sanitize(lastPart)}.md`;
    }

    public async scrapePosts(numPostsToScrape: number = 0): Promise<void> {
        await this.ensureDirectoryExists();

        let urls = await this.fetchUrlsFromSitemap();
        if (urls.length === 0) {
            urls = await this.fetchUrlsFromFeed();
        }

        if (numPostsToScrape > 0) {
            urls = urls.slice(0, numPostsToScrape);
        }

        console.log(`Found ${urls.length} posts to scrape`);

        for (const url of urls) {
            const postData = await this.getPostContent(url);

            if (postData) {
                const markdown = this.combineMetadataAndContent(postData);
                const filename = this.getFilenameFromUrl(url);
                await this.saveToFile(filename, markdown);
            }
        }
    }
}

// Example usage
async function main() {
    const scraper = new SubstackScraper('https://www.thefitzwilliam.com/', {
        plainTextMode: true
    });
    await scraper.scrapePosts(3);
}

main().catch(console.error);

export default SubstackScraper;
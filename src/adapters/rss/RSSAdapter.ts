import { createLogger } from '../../utils/logger.js';

export interface FeedItem {
  source: string;
  title: string;
  link: string;
  published: Date;
  snippet?: string;
}

interface FeedConfig {
  name: string;
  url: string;
}

const FEEDS: FeedConfig[] = [
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/' },
  { name: 'Lawfare', url: 'https://www.lawfaremedia.org/rss.xml' },
  { name: 'Marginal Revolution', url: 'https://marginalrevolution.com/feed' },
  { name: "Scholar's Stage", url: 'https://scholars-stage.org/feed/' },
  { name: 'Naked Capitalism', url: 'https://www.nakedcapitalism.com/feed' },
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/' },
  { name: 'Overcoming Bias', url: 'https://www.overcomingbias.com/feed' },
  { name: 'Ribbonfarm', url: 'https://www.ribbonfarm.com/feed/' },
  { name: 'Crooked Timber', url: 'https://crookedtimber.org/feed/' },
  { name: 'Duck of Minerva', url: 'https://www.duckofminerva.com/feed' },
  { name: 'Calculated Risk', url: 'https://www.calculatedriskblog.com/feeds/posts/default?alt=rss' },
  { name: 'Epsilon Theory', url: 'https://www.epsilontheory.com/feed/' },
];

export class RSSAdapter {
  private readonly logger = createLogger({ adapter: 'RSSAdapter' });

  async fetchAll(): Promise<FeedItem[]> {
    const logger = this.logger.child({ method: 'fetchAll' });
    logger.info({ feedCount: FEEDS.length }, 'Fetching RSS feeds');

    const results = await Promise.allSettled(
      FEEDS.map((feed) => this.fetchFeed(feed))
    );

    const items: FeedItem[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const feed = FEEDS[i];
      if (result && result.status === 'fulfilled') {
        items.push(...result.value);
      } else if (result && result.status === 'rejected') {
        logger.warn({ feed: feed?.name, error: result.reason }, 'Failed to fetch feed');
      }
    }

    // Sort by published date (most recent first)
    items.sort((a, b) => b.published.getTime() - a.published.getTime());

    // Return items from last 48 hours only
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const recentItems = items.filter((item) => item.published.getTime() > cutoff);

    logger.info({ totalItems: recentItems.length }, 'RSS feeds fetched');

    return recentItems;
  }

  private async fetchFeed(feed: FeedConfig): Promise<FeedItem[]> {
    const logger = this.logger.child({ method: 'fetchFeed', feed: feed.name });

    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'PersonalAssistant/1.0 (RSS Reader)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = this.parseXML(xml, feed.name);

    logger.debug({ itemCount: items.length }, 'Feed parsed');

    return items;
  }

  private parseXML(xml: string, sourceName: string): FeedItem[] {
    const items: FeedItem[] = [];

    // Try RSS format first (most common)
    const rssItems = this.extractMatches(xml, /<item[^>]*>([\s\S]*?)<\/item>/gi);
    for (const itemXml of rssItems) {
      const title = this.extractTag(itemXml, 'title');
      const link = this.extractTag(itemXml, 'link') || this.extractAttr(itemXml, 'link', 'href');
      const pubDate = this.extractTag(itemXml, 'pubDate') || this.extractTag(itemXml, 'dc:date');
      const description = this.extractTag(itemXml, 'description');

      if (title && link) {
        items.push({
          source: sourceName,
          title: this.decodeHtmlEntities(title.trim()),
          link: link.trim(),
          published: pubDate ? new Date(pubDate) : new Date(),
          snippet: description ? this.cleanSnippet(description) : undefined,
        });
      }
    }

    // Try Atom format if no RSS items found
    if (items.length === 0) {
      const atomEntries = this.extractMatches(xml, /<entry[^>]*>([\s\S]*?)<\/entry>/gi);
      for (const entryXml of atomEntries) {
        const title = this.extractTag(entryXml, 'title');
        const link = this.extractAttr(entryXml, 'link', 'href') || this.extractTag(entryXml, 'link');
        const published = this.extractTag(entryXml, 'published') || this.extractTag(entryXml, 'updated');
        const summary = this.extractTag(entryXml, 'summary') || this.extractTag(entryXml, 'content');

        if (title && link) {
          items.push({
            source: sourceName,
            title: this.decodeHtmlEntities(title.trim()),
            link: link.trim(),
            published: published ? new Date(published) : new Date(),
            snippet: summary ? this.cleanSnippet(summary) : undefined,
          });
        }
      }
    }

    return items;
  }

  private extractMatches(xml: string, regex: RegExp): string[] {
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
      if (match[1]) matches.push(match[1]);
    }
    return matches;
  }

  private extractTag(xml: string, tagName: string): string | null {
    // Handle CDATA
    const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
    const cdataMatch = xml.match(cdataRegex);
    if (cdataMatch?.[1]) return cdataMatch[1];

    // Handle regular content
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match?.[1] ?? null;
  }

  private extractAttr(xml: string, tagName: string, attrName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']*)["'][^>]*`, 'i');
    const match = xml.match(regex);
    return match?.[1] ?? null;
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  private cleanSnippet(html: string): string {
    // Remove HTML tags
    let text = html.replace(/<[^>]+>/g, ' ');
    // Decode entities
    text = this.decodeHtmlEntities(text);
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Truncate
    if (text.length > 200) {
      text = text.slice(0, 197) + '...';
    }
    return text;
  }
}

import { client as seedClient, getFeedItemsBySchemaName } from '@seedprotocol/sdk';
import pluralize from 'pluralize';
import type { FeedFormat, GraphQLItem, TransformOptions, FeedConfig } from './types';
import { generateRssFeed, generateAtomFeed, generateJsonFeed } from 'feedsmith';
import { gql } from 'graphql-request';

let client: any;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the Seed Protocol client
 * This should be called as soon as the app is ready
 */
export const initializeSeedClient = async (): Promise<void> => {
  // If already initializing, wait for that to complete
  if (initializationPromise) {
    return initializationPromise;
  }

  // If already initialized, return immediately
  if (client) {
    return;
  }

  initializationPromise = (async () => {
    try {
      console.log('Initializing Seed Protocol client...');

      
      await seedClient.init({ config: {
        endpoints: {
          filePaths: 'app-files',
          files: '/app-files',
        },
        arweaveDomain: 'arweave.net',
      }, addresses: [], });
      console.log('✅ Seed Protocol client initialized successfully');
      client = seedClient;
      initializationPromise = null; // Clear the promise after successful initialization
    } catch (error) {
      console.error('❌ Failed to initialize Seed Protocol client:', error);
      initializationPromise = null; // Clear the promise on error so we can retry
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Get the Seed Protocol client, initializing it if necessary
 * This function can be called from any context (Electron main process or Vite dev server)
 */
export const getClient = async (): Promise<any> => {
  // If client is already initialized, return it
  if (client) {
    return client;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    await initializationPromise;
    return client;
  }

  // Otherwise, initialize it now
  await initializeSeedClient();
  return client;
}


/**
 * Teardown the Seed Protocol client
 * This should be called when the app is quitting
 */
export const teardownSeedClient = async (): Promise<void> => {
  try {
    console.log('Tearing down Seed Protocol client...');
    
    if (typeof seedClient.stop === 'function') {
      await seedClient.stop();
      console.log('✅ Seed Protocol client stopped');
    }
    
    if (typeof seedClient.unload === 'function') {
      await seedClient.unload();
      console.log('✅ Seed Protocol client unloaded');
    }
    
    console.log('✅ Seed Protocol client teardown complete');
  } catch (error) {
    console.error('❌ Failed to teardown Seed Protocol client:', error);
    // Don't throw - we want the app to quit even if teardown fails
  }
}

// ============================================================================
// Configuration
// ============================================================================

const SITE_CONFIG: FeedConfig = {
  title: 'Seed Protocol',
  description: 'Content published via Seed Protocol',
  siteUrl: 'https://seedprotocol.io',
  feedUrl: 'https://feed.seedprotocol.io',
  language: 'en',
  copyright: `© ${new Date().getFullYear()} All rights reserved`,
  author: {
    name: 'Seed Protocol',
    email: 'info@seedprotocol.io',
    link: 'https://seedprotocol.io',
  },
}

// ============================================================================
// GraphQL Client (replace with your actual client)
// ============================================================================

const GET_SCHEMAS = gql`
  query GetSchemas($where: SchemaWhereInput!) {
    schemas: schemata(where: $where) {
      id
      schema
      schemaNames {
        name
      }
    }
  }
`

export const GET_SEEDS = gql`
  query GetSeeds($where: AttestationWhereInput!) {
    itemSeeds: attestations(where: $where, orderBy: [{ timeCreated: desc }]) {
      id
      decodedDataJson
      attester
      schema {
        schemaNames {
          name
        }
      }
      refUID
      revoked
      schemaId
      timeCreated
      isOffchain
    }
  }
`

// ============================================================================
// Feed Transformation
// ============================================================================

/**
 * Transforms GraphQL items into feed items.
 * This function preserves all dynamic properties from the items.
 */
function transformToFeedItems(
  items: GraphQLItem[],
  options: TransformOptions
): any[] {
  const { schemaName, siteUrl } = options

  return items.map((item: any) => {
    // Determine item ID - try multiple possible fields
    const itemId = item.id || item.seedUid || item.SeedUid || item.storageTransactionId || item.storage_transaction_id
    
    // Determine item URL - prefer link/Link, then import_url/importUrl, fallback to constructed URL
    const itemUrl = item.link || item.Link || item.import_url || item.importUrl || `${siteUrl}/${pluralize(schemaName)}/${itemId}`
    
    // Determine publication date - try multiple sources
    let date: Date
    if (item.pubDate || item.PubDate) {
      // pubDate might be a string like "Mon, 07 Apr 2025 00:03:29 GMT"
      const pubDateStr = item.pubDate || item.PubDate
      date = new Date(pubDateStr)
    } else if (item.timeCreated) {
      // timeCreated is a Unix timestamp
      date = new Date(item.timeCreated * 1000)
    } else if (item.publishedAt || item.createdAt || item.updatedAt) {
      const dateValue = item.publishedAt || item.createdAt || item.updatedAt
      date = dateValue && typeof dateValue === 'object' && dateValue.constructor === Date
        ? dateValue as Date
        : new Date(dateValue as string | number)
    } else {
      date = new Date()
    }

    // Start with all properties from the item to preserve dynamic schema
    const feedItem: any = {
      ...item, // Preserve all dynamic properties first
      // Map to standard feed fields
      id: itemId,
      title: item.title || item.Title || 'Untitled',
      link: itemUrl,
      description: item.summary || item.description || '',
      content: item.html || item.content || item.summary || '',
      pubDate: date,
      date: date,
      // Map guid if available
      guid: item.guid || item.Guid || item.link || item.Link || itemId,
    }

    // Convert any date-like string properties to Date objects
    Object.keys(feedItem).forEach((key) => {
      const value = feedItem[key]
      if (typeof value === 'string' && /date|time|published|created|updated/i.test(key) && key !== 'pubDate' && key !== 'date') {
        const dateValue = new Date(value)
        if (!isNaN(dateValue.getTime())) {
          feedItem[key] = dateValue
        }
      }
    })

    return feedItem
  })
}

// ============================================================================
// Feed Generator
// ============================================================================

export const createFeed = (
  items: GraphQLItem[],
  schemaName: string,
  format: FeedFormat
): Promise<string> => {
  const collectionName = pluralize(schemaName)
  const feedUrl = `${SITE_CONFIG.siteUrl}/${collectionName}/${format}`
  const feedTitle = `${SITE_CONFIG.title} - ${capitalize(collectionName)}`
  const now = new Date()

  // Transform items to preserve all dynamic properties
  const transformedItems = transformToFeedItems(items, {
    schemaName,
    siteUrl: SITE_CONFIG.siteUrl,
  })

  // Generate feed based on format using FeedSmith
  switch (format) {
    case 'atom': {
      // Atom feed requires: id, title, updated, links, entries
      const atomFeed = {
        id: feedUrl,
        title: feedTitle,
        updated: now,
        links: [
          { href: feedUrl, rel: 'self' },
          { href: SITE_CONFIG.siteUrl },
        ],
        subtitle: SITE_CONFIG.description,
        rights: SITE_CONFIG.copyright,
        author: SITE_CONFIG.author ? {
          name: SITE_CONFIG.author.name,
          email: SITE_CONFIG.author.email,
          uri: SITE_CONFIG.author.link,
        } : undefined,
        entries: transformedItems.map((item) => {
          // Atom entries require: id, title, updated, links
          const entry: any = {
            id: item.id || item.link,
            title: item.title || 'Untitled',
            updated: item.date || item.pubDate || now,
            links: item.link ? [{ href: item.link }] : [],
            ...item, // Preserve all dynamic properties
          }
          if (item.content) entry.content = item.content
          if (item.description) entry.summary = item.description
          return entry
        }),
      }
      return Promise.resolve(generateAtomFeed(atomFeed) as string)
    }
    case 'json': {
      // JSON feed requires: title, items (with id)
      const jsonFeed = {
        title: feedTitle,
        home_page_url: SITE_CONFIG.siteUrl,
        feed_url: feedUrl,
        description: SITE_CONFIG.description,
        author: SITE_CONFIG.author ? {
          name: SITE_CONFIG.author.name,
          url: SITE_CONFIG.author.link,
        } : undefined,
        items: transformedItems.map((item) => {
          // JSON items require: id
          const jsonItem: any = {
            id: item.id || item.link,
            ...item, // Preserve all dynamic properties
          }
          if (item.title) jsonItem.title = item.title
          if (item.link) jsonItem.url = item.link
          if (item.content) jsonItem.content_html = item.content
          if (item.description) jsonItem.summary = item.description
          if (item.date || item.pubDate) jsonItem.date_published = item.date || item.pubDate
          return jsonItem
        }),
      }
      const jsonResult = generateJsonFeed(jsonFeed)
      return Promise.resolve(typeof jsonResult === 'string' ? jsonResult : JSON.stringify(jsonResult))
    }
    case 'rss':
    default: {
      // RSS feed requires: title, link, description, items
      const rssFeed = {
        title: feedTitle,
        link: SITE_CONFIG.siteUrl,
        description: SITE_CONFIG.description,
        language: SITE_CONFIG.language,
        copyright: SITE_CONFIG.copyright,
        webMaster: SITE_CONFIG.author?.email,
        pubDate: now,
        lastBuildDate: now,
        items: transformedItems.map((item: any) => {
          // RSS items can have dynamic properties
          const rssItem: any = {
            ...item, // Preserve all dynamic properties
          }
          
          // Ensure required/standard RSS fields
          if (item.title) rssItem.title = item.title
          if (item.link) rssItem.link = item.link
          if (item.description) rssItem.description = item.description
          if (item.date || item.pubDate) rssItem.pubDate = item.date || item.pubDate
          
          // Map guid - RSS requires guid for proper item identification
          if (item.guid) {
            rssItem.guid = {
              value: item.guid,
              isPermaLink: typeof item.guid === 'string' && (item.guid.startsWith('http://') || item.guid.startsWith('https://'))
            }
          } else if (item.id) {
            rssItem.guid = {
              value: item.id,
              isPermaLink: typeof item.id === 'string' && (item.id.startsWith('http://') || item.id.startsWith('https://'))
            }
          }
          
          // Map feature_image to enclosure for RSS (media attachments)
          if (item.feature_image || item.featureImage) {
            const imageUrl = item.feature_image || item.featureImage
            // If it's a URL, use it directly; if it's an Arweave transaction ID, construct URL
            const enclosureUrl = typeof imageUrl === 'string' && imageUrl.startsWith('http')
              ? imageUrl
              : `https://arweave.net/${imageUrl}`
            
            rssItem.enclosures = [{
              url: enclosureUrl,
              type: 'image/jpeg', // Default, could be determined from URL or metadata
            }]
          }
          
          // Use Dublin Core namespace for additional metadata
          rssItem.dc = {}
          
          // Add date using dc namespace (supports multiple dates)
          if (item.date || item.pubDate) {
            rssItem.dc.date = item.date || item.pubDate
          }
          if (item.timeCreated) {
            // Convert Unix timestamp to Date for dc namespace
            const timeCreatedDate = new Date(item.timeCreated * 1000)
            if (!rssItem.dc.dates) rssItem.dc.dates = []
            rssItem.dc.dates.push(timeCreatedDate)
          }
          
          // Add identifier using dc namespace
          if (item.seedUid || item.SeedUid) {
            if (!rssItem.dc.identifier) rssItem.dc.identifier = []
            rssItem.dc.identifier.push(item.seedUid || item.SeedUid)
          }
          if (item.storageTransactionId || item.storage_transaction_id) {
            if (!rssItem.dc.identifier) rssItem.dc.identifier = []
            rssItem.dc.identifier.push(item.storageTransactionId || item.storage_transaction_id)
          }
          
          // Add source/relation for import_url
          if (item.import_url || item.importUrl) {
            rssItem.dc.source = item.import_url || item.importUrl
          }
          
          // Include raw custom fields as well (FeedSmith may preserve them)
          if (item.seedUid || item.SeedUid) rssItem.seedUid = item.seedUid || item.SeedUid
          if (item.storageTransactionId || item.storage_transaction_id) {
            rssItem.storageTransactionId = item.storageTransactionId || item.storage_transaction_id
          }
          if (item.timeCreated) rssItem.timeCreated = item.timeCreated
          
          return rssItem
        }),
      }
      return Promise.resolve(generateRssFeed(rssFeed) as string)
    }
  }
}

// ============================================================================
// Route Handler
// ============================================================================

function getContentType(format: FeedFormat): string {
  switch (format) {
    case 'atom':
      return 'application/atom+xml; charset=utf-8'
    case 'json':
      return 'application/feed+json; charset=utf-8'
    case 'rss':
    default:
      return 'application/rss+xml; charset=utf-8'
  }
}

function parseFormat(segment: string): FeedFormat | null {
  const normalized = segment.toLowerCase()
  if (['rss', 'atom', 'json'].includes(normalized)) {
    return normalized as FeedFormat
  }
  return null
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Main route handler for feed generation.
 * 
 * URL Pattern: /:collection/:format
 * Examples:
 *   - /posts/rss    → RSS feed of posts
 *   - /posts/atom   → Atom feed of posts
 *   - /identities/json → JSON feed of identities
 */
export async function handleFeedRequest(
  collectionSegment: string,
  formatSegment: string
): Promise<Response> {
  // Validate format
  const format = parseFormat(formatSegment)
  if (!format) {
    return new Response(
      JSON.stringify({ error: `Invalid feed format: ${formatSegment}` }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // De-pluralize the collection name to get model type
  const schemaName = pluralize.singular(collectionSegment.toLowerCase())
  const collectionName = pluralize(schemaName)

  console.log(`Schema name: ${schemaName}`);
  console.log(`Collection name: ${collectionName}`);

  try {
    const client = await getClient()
    if (client) {
      console.log(`Client initialized: ${client.isInitialized()}`);
    }
    // const models = getModels()
    // console.log(`Models: ${Object.keys(models)}`);

    const feedItems = await getFeedItemsBySchemaName(schemaName)

    console.log(`Found ${feedItems.length} feed items for schema ${schemaName}`)

    console.log(JSON.stringify(feedItems[0], null, 2))

    // Generate the feed
    const feedContent = await createFeed(feedItems as GraphQLItem[], schemaName, format)

    return new Response(feedContent, {
      status: 200,
      headers: {
        'Content-Type': getContentType(format),
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Feed-Schema': schemaName,
        'X-Feed-Format': format,
      },
    })
  } catch (error) {
    console.error('Feed generation error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to generate feed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
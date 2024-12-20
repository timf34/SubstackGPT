import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';
import { SubstackJSON } from '@/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Improved rate limiter with better concurrency management
class RateLimiter {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private activeRequests = 0;
  private lastRequestTime = 0;
  private requestInterval = 500; // 500ms between requests
  private maxConcurrent = 3;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNextRequest();
    });
  }

  private async processNextRequest() {
    if (
      this.queue.length === 0 || 
      this.activeRequests >= this.maxConcurrent
    ) {
      return;
    }

    const now = Date.now();
    const timeToWait = Math.max(0, this.requestInterval - (now - this.lastRequestTime));

    if (timeToWait > 0) {
      await sleep(timeToWait);
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeRequests--;
      this.processNextRequest();
    }

    // Process next requests in parallel if possible
    if (this.activeRequests < this.maxConcurrent) {
      this.processNextRequest();
    }
  }
}

const rateLimiter = new RateLimiter();

// Batch processor for chunks
async function processBatch(
  chunks: any[],
  openai: OpenAIApi,
  supabase: any,
  author: string,
  essay: any,
  retryCount = 0,
  maxRetries = 3,
  baseDelay = 1000
): Promise<boolean> {
  try {
    console.log(`    Generating embeddings for batch of ${chunks.length} chunks (attempt ${retryCount + 1})`);
    
    // Process embeddings with better progress tracking
    const embeddingResponses = await Promise.all(
      chunks.map(async (chunk, index) => {
        try {
          const response = await rateLimiter.add(() => 
            openai.createEmbedding({
              model: 'text-embedding-ada-002',
              input: chunk.content,
            })
          );
          console.log(`      ✓ Generated embedding ${index + 1}/${chunks.length}`);
          return response;
        } catch (error) {
          console.error(`      ✗ Failed to generate embedding ${index + 1}/${chunks.length}`);
          throw error;
        }
      })
    );

    // Prepare bulk insert data
    const insertData = chunks.map((chunk, idx) => ({
      author,
      essay_title: essay.title,
      essay_url: essay.url,
      essay_date: essay.date,
      content: chunk.content,
      content_length: chunk.content_length,
      content_tokens: chunk.content_tokens,
      embedding: embeddingResponses[idx].data.data[0].embedding,
    }));

    // Split bulk insert into smaller chunks if needed
    const SUPABASE_CHUNK_SIZE = 5;
    for (let i = 0; i < insertData.length; i += SUPABASE_CHUNK_SIZE) {
      const chunk = insertData.slice(i, i + SUPABASE_CHUNK_SIZE);
      console.log(`    Inserting chunk ${Math.floor(i/SUPABASE_CHUNK_SIZE) + 1}/${Math.ceil(insertData.length/SUPABASE_CHUNK_SIZE)}`);
      
      const { error: insertError } = await supabase
        .from('substack_embeddings')
        .insert(chunk);

      if (insertError) {
        throw new Error(`Supabase error: ${insertError.message}`);
      }
    }

    console.log('    Successfully processed batch');
    return true;
  } catch (error: any) {
    if (retryCount >= maxRetries) {
      console.error(`    Failed after ${maxRetries} retries:`, error?.response?.data || error.message);
      return false;
    }

    const waitTime = baseDelay * Math.pow(1.5, retryCount);
    console.log(`    Error occurred, waiting ${waitTime/1000} seconds before retry ${retryCount + 1}/${maxRetries}`);
    await sleep(waitTime);
    return processBatch(chunks, openai, supabase, author, essay, retryCount + 1, maxRetries, baseDelay);
  }
}

const generateEmbeddings = async (substackData: SubstackJSON) => {
  console.log('Starting embedding generation process...');
  
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  console.log('OPENAI_API_KEY', process.env.OPENAI_API_KEY);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`Connected to Supabase, clearing existing embeddings for ${substackData.author}`);

  const { error: deleteError } = await supabase
    .from('substack_embeddings')
    .delete()
    .eq('author', substackData.author);

  if (deleteError) {
    console.error('Error clearing existing embeddings:', deleteError);
    throw deleteError;
  }

  console.log(`Generating embeddings for ${substackData.essays.length} essays...`);
  
  const BATCH_SIZE = 10; // Process 10 chunks at a time
  let totalChunks = 0;
  let processedChunks = 0;

  // Calculate total chunks for progress tracking
  substackData.essays.forEach(essay => {
    totalChunks += essay.chunks.length;
  });

  for (let i = 0; i < substackData.essays.length; i++) {
    const essay = substackData.essays[i];
    console.log(`Processing essay ${i + 1}/${substackData.essays.length}: "${essay.title}"`);
    
    // Process chunks in batches
    for (let j = 0; j < essay.chunks.length; j += BATCH_SIZE) {
      const batch = essay.chunks.slice(j, j + BATCH_SIZE);
      console.log(`  Processing batch ${Math.floor(j/BATCH_SIZE) + 1}/${Math.ceil(essay.chunks.length/BATCH_SIZE)}`);
      
      const success = await processBatch(
        batch,
        openai,
        supabase,
        substackData.author,
        essay
      );

      if (!success) {
        console.error(`  Failed to process batch after all retries`);
        continue;
      }

      processedChunks += batch.length;
      const progress = ((processedChunks / totalChunks) * 100).toFixed(1);
      console.log(`Progress: ${progress}% (${processedChunks}/${totalChunks} chunks)`);
    }
  }
  
  console.log('Embedding generation complete!');
};

export { generateEmbeddings }; 
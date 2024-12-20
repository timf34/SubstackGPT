import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';
import { SubstackJSON } from '@/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate limiting helper
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestInterval = 3000; // 3 seconds between requests

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestInterval) {
      await sleep(this.requestInterval - timeSinceLastRequest);
    }

    const fn = this.queue.shift();
    if (fn) {
      this.lastRequestTime = Date.now();
      await fn();
    }

    await this.processQueue();
  }
}

const rateLimiter = new RateLimiter();

async function processChunkWithRetry(
  chunk: any,
  openai: OpenAIApi,
  supabase: any,
  author: string,
  essay: any,
  retryCount = 0,
  maxRetries = 5,
  baseDelay = 5000
): Promise<boolean> {
  try {
    console.log(`    Generating embedding (attempt ${retryCount + 1})`);
    
    const embeddingResponse = await rateLimiter.add(() => 
      openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: chunk.content,
      })
    );

    const [{ embedding }] = embeddingResponse.data.data;

    console.log('    Inserting into Supabase...');
    const { error: insertError } = await supabase.from('substack_embeddings').insert({
      author,
      essay_title: essay.title,
      essay_url: essay.url,
      essay_date: essay.date,
      content: chunk.content,
      content_length: chunk.content_length,
      content_tokens: chunk.content_tokens,
      embedding,
    });

    if (insertError) {
      throw new Error(`Supabase error: ${insertError.message}`);
    }

    console.log('    Successfully processed chunk');
    return true;
  } catch (error: any) {
    if (retryCount >= maxRetries) {
      console.error(`    Failed after ${maxRetries} retries:`, error?.response?.data || error.message);
      return false;
    }

    const waitTime = baseDelay * Math.pow(2, retryCount);
    console.log(`    Error occurred, waiting ${waitTime/1000} seconds before retry ${retryCount + 1}/${maxRetries}`);
    await sleep(waitTime);
    return processChunkWithRetry(chunk, openai, supabase, author, essay, retryCount + 1, maxRetries, baseDelay);
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

  for (let i = 0; i < substackData.essays.length; i++) {
    const essay = substackData.essays[i];
    console.log(`Processing essay ${i + 1}/${substackData.essays.length}: "${essay.title}"`);
    
    for (let j = 0; j < essay.chunks.length; j++) {
      const chunk = essay.chunks[j];
      console.log(`  Processing chunk ${j + 1}/${essay.chunks.length}`);
      
      const success = await processChunkWithRetry(
        chunk,
        openai,
        supabase,
        substackData.author,
        essay
      );

      if (!success) {
        console.error(`  Failed to process chunk ${j + 1} after all retries`);
        continue;
      }
    }
  }
  
  console.log('Embedding generation complete!');
};

export { generateEmbeddings }; 
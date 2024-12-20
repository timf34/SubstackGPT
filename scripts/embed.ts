import { PGEssay, PGJSON } from "@/types";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import dotenv from "dotenv";

// Environment setup remains the same...
delete process.env.OPENAI_API_KEY;

const envPath = path.resolve(process.cwd(), '.env.local');
console.log("Loading env from:", envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  throw new Error(`Error loading .env.local: ${result.error.message}`);
}

const requiredEnvVars = [
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// New helper functions for parallel processing
async function processChunkWithRetry(
  chunk: any,
  openai: OpenAIApi,
  supabase: any,
  retryCount = 0,
  maxRetries = 8,
  baseDelay = 100
): Promise<boolean> {
  try {
    const embeddingResponse = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: chunk.content
    });

    const [{ embedding }] = embeddingResponse.data.data;

    const { error: supabaseError } = await supabase
      .from("pg")
      .insert({
        essay_title: chunk.essay_title,
        essay_url: chunk.essay_url,
        essay_date: chunk.essay_date,
        essay_thanks: chunk.essay_thanks,
        content: chunk.content,
        content_length: chunk.content_length,
        content_tokens: chunk.content_tokens,
        embedding
      });

    if (supabaseError) throw new Error(`Supabase error: ${supabaseError.message}`);
    
    return true;

  } catch (error: any) {
    if (retryCount >= maxRetries) {
      console.error(`Failed after ${maxRetries} retries:`, error?.response?.data || error.message);
      return false;
    }

    if (error?.response?.status === 429) {
      const waitTime = Math.min(baseDelay * Math.pow(2, retryCount), 120000);
      console.log(`Rate limited. Waiting ${waitTime/1000} seconds before retry ${retryCount + 1}/${maxRetries}`);
      await sleep(waitTime);
      return processChunkWithRetry(chunk, openai, supabase, retryCount + 1, maxRetries, baseDelay);
    }

    if (error?.response?.data?.error?.type === 'insufficient_quota') {
      console.error('OpenAI API quota exceeded. Please check your billing settings.');
      process.exit(1);
    }

    await sleep(baseDelay);
    return processChunkWithRetry(chunk, openai, supabase, retryCount + 1, maxRetries, baseDelay);
  }
}

async function processBatchOfChunks(chunks: any[], openai: OpenAIApi, supabase: any, batchSize: number) {
  const results = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchPromises = batch.map(chunk => processChunkWithRetry(chunk, openai, supabase));
    
    console.log(`Processing batch ${i/batchSize + 1}, chunks ${i + 1}-${i + batch.length}`);
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to prevent rate limiting
    if (i + batchSize < chunks.length) {
      await sleep(200);
    }
  }
  return results;
}

const generateEmbeddings = async (essays: PGEssay[]) => {
  const configuration = new Configuration({ 
    apiKey: process.env.OPENAI_API_KEY 
  });
  const openai = new OpenAIApi(configuration);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Flatten all chunks into a single array
  const allChunks = essays.flatMap(essay => 
    essay.chunks.map(chunk => ({
      ...chunk,
      essay_title: essay.title
    }))
  );

  console.log(`Starting to process ${allChunks.length} total chunks`);

  // Process in batches of 5 chunks concurrently
  const BATCH_SIZE = 5;
  const results = await processBatchOfChunks(allChunks, openai, supabase, BATCH_SIZE);

  // Generate report
  const successCount = results.filter(Boolean).length;
  const failureCount = results.filter(r => !r).length;

  console.log("\n=== Processing Complete ===");
  console.log(`Successfully processed: ${successCount}/${allChunks.length} chunks`);
  if (failureCount > 0) {
    console.log(`Failed chunks: ${failureCount}`);
  }
};

// Main execution
(async () => {
  try {
    console.log("Loading essays from pg.json...");
    const jsonPath = path.resolve(process.cwd(), "scripts/pg.json");
    
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Could not find pg.json at ${jsonPath}`);
    }

    const book: PGJSON = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const ESSAYS_TO_PROCESS = 10;
    const selectedEssays = book.essays.slice(0, ESSAYS_TO_PROCESS);
    
    console.log(`Loaded ${book.essays.length} total essays`);
    console.log(`Will process first ${ESSAYS_TO_PROCESS} essays`);
    
    await generateEmbeddings(selectedEssays);

  } catch (error: any) {
    console.error("Fatal error:", error.message);
    if (error?.response?.data) {
      console.error("API response:", error.response.data);
    }
    process.exit(1);
  }
})();
import { PGEssay, PGJSON } from "@/types";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import dotenv from "dotenv";

// Clear any existing env variables to prevent conflicts
delete process.env.OPENAI_API_KEY;

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
console.log("Loading env from:", envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  throw new Error(`Error loading .env.local: ${result.error.message}`);
}

// Validate environment variables
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

const generateEmbeddings = async (essays: PGEssay[]) => {
  // Initialize OpenAI
  const configuration = new Configuration({ 
    apiKey: process.env.OPENAI_API_KEY 
  });
  const openai = new OpenAIApi(configuration);

  // Initialize Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Track progress
  let totalChunks = essays.reduce((acc, essay) => acc + essay.chunks.length, 0);
  let processedChunks = 0;
  const failedChunks: Array<{essay: string, chunk: number, error: any}> = [];

  console.log(`Starting to process ${totalChunks} chunks from ${essays.length} essays`);

  for (let i = 0; i < essays.length; i++) {
    const section = essays[i];
    console.log(`\nProcessing essay ${i + 1}/${essays.length}: "${section.title}"`);

    for (let j = 0; j < section.chunks.length; j++) {
      const chunk = section.chunks[j];
      let retries = 0;
      const maxRetries = 8;
      let lastError = null;
      const baseDelay = 100; // 0.2 seconds base delay

      while (retries < maxRetries) {
        try {
          // Log progress
          console.log(`\nProcessing chunk ${j + 1}/${section.chunks.length} of essay "${section.title}"`);
          console.log(`Overall progress: ${processedChunks}/${totalChunks} chunks (${Math.round(processedChunks/totalChunks*100)}%)`);

          // Get embedding
          const embeddingResponse = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: chunk.content
          });

          const [{ embedding }] = embeddingResponse.data.data;

          // Save to Supabase
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

          if (supabaseError) {
            throw new Error(`Supabase error: ${supabaseError.message}`);
          }

          processedChunks++;
          console.log(`✓ Successfully processed chunk ${j + 1}/${section.chunks.length}`);
          
          // Wait between successful requests
          await sleep(baseDelay);
          break;

        } catch (error: any) {
          lastError = error;
          retries++;
          
          // Handle different types of errors
          if (error?.response?.status === 429) {
            const waitTime = Math.min(baseDelay * Math.pow(2, retries), 120000); // Max 2 minutes
            console.log(`Rate limited. Waiting ${waitTime/1000} seconds before retry ${retries}/${maxRetries}`);
            await sleep(waitTime);
            continue;
          }

          if (error?.response?.data?.error?.type === 'insufficient_quota') {
            console.error('OpenAI API quota exceeded. Please check your billing settings.');
            process.exit(1);
          }
          
          console.error(`Error processing chunk ${i},${j}:`, error?.response?.data || error.message);
          
          if (retries === maxRetries) {
            failedChunks.push({
              essay: section.title,
              chunk: j,
              error: error?.response?.data || error.message
            });
            console.error(`Failed after ${maxRetries} retries. Moving to next chunk.`);
            break;
          }
          
          await sleep(baseDelay);
        }
      }

      if (lastError && retries === maxRetries) {
        console.error(`Skipping chunk ${i},${j} after max retries. Last error:`, lastError);
      }
    }
  }

  // Final report
  console.log("\n=== Processing Complete ===");
  console.log(`Successfully processed: ${processedChunks}/${totalChunks} chunks`);
  
  if (failedChunks.length > 0) {
    console.log(`\nFailed chunks (${failedChunks.length}):`);
    const failedLog = failedChunks.map(f => ({
      essay: f.essay,
      chunk: f.chunk,
      error: f.error
    }));
    
    // Save failed chunks to file
    fs.writeFileSync(
      'failed_chunks.json', 
      JSON.stringify(failedLog, null, 2)
    );
    console.log("Failed chunks have been saved to failed_chunks.json");
  }
};

(async () => {
  try {
    console.log("Loading essays from pg.json...");
    const jsonPath = path.resolve(process.cwd(), "scripts/pg.json");
    
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Could not find pg.json at ${jsonPath}`);
    }

    const book: PGJSON = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    
    // Add this section to limit the number of essays
    const ESSAYS_TO_PROCESS = 10; // Change this number to process different amounts
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
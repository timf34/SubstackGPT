import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, matches = 5, authorName } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'No query provided' });
  }

  if (!authorName) {
    return res.status(400).json({ error: 'No author provided' });
  }

  try {
    console.log(`Processing search query for author: ${authorName}`);
    
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);

    console.log('Generating embedding for query...');
    const embedding = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: query,
    });

    console.log('Connecting to Supabase...');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('Searching for matches...');
    const { data: chunks, error } = await supabase.rpc('match_substack_embeddings', {
      query_embedding: embedding.data.data[0].embedding,
      match_threshold: 0.5,
      match_count: matches,
      author_name: authorName,
    });

    if (error) {
      console.error('Error matching embeddings:', error);
      return res.status(500).json({ 
        error: 'Error matching embeddings',
        details: error.message 
      });
    }

    if (!chunks || chunks.length === 0) {
      console.log('No matches found');
      return res.status(404).json({ 
        error: 'No matches found',
        details: 'No content matches your query closely enough' 
      });
    }

    console.log(`Found ${chunks.length} matches`);
    return res.status(200).json(chunks);
  } catch (error: any) {
    console.error('Error in search:', error);
    return res.status(500).json({ 
      error: 'Error processing search',
      details: error.message 
    });
  }
}

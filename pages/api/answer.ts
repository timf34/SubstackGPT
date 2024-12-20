import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIStream } from '@/utils/OpenAIStream';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  try {
    const stream = await OpenAIStream(prompt, process.env.OPENAI_API_KEY!);
    return new Response(stream);
  } catch (error) {
    console.error('Error in answer API:', error);
    return res.status(500).json({ error: 'Error generating answer' });
  }
}

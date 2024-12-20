import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIStream } from '@/utils/OpenAIStream';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response('No prompt provided', { status: 400 });
    }

    const stream = await OpenAIStream(prompt, process.env.OPENAI_API_KEY!);

    return new Response(stream);
  } catch (error: any) {
    console.error('Error in answer API:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Error generating answer',
        details: error.message 
      }), 
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

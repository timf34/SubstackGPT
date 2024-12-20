import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

interface Writer {
  id: string;
  name: string;
  substack_url: string;
  avatar_url: string | null;
  last_scraped_at: string;
}

interface WriterSelectProps {
  onWriterSelect: (writer: Writer) => void;
  onNewWriter: () => void;
}

export default function WriterSelect({ onWriterSelect, onNewWriter }: WriterSelectProps) {
  const [writers, setWriters] = useState<Writer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWriters = async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase
        .from('writers')
        .select('*')
        .order('last_scraped_at', { ascending: false });

      if (error) {
        setError('Failed to load writers');
        setLoading(false);
        return;
      }

      setWriters(data);
      setLoading(false);
    };

    fetchWriters();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Choose a Writer to Chat With</h2>
      
      <div className="grid gap-4 md:grid-cols-2">
        {writers.map((writer) => (
          <button
            key={writer.id}
            onClick={() => onWriterSelect(writer)}
            className="flex items-center p-4 border rounded-lg hover:border-blue-500 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-gray-200 mr-4">
              {writer.avatar_url && (
                <img
                  src={writer.avatar_url}
                  alt={writer.name}
                  className="w-full h-full rounded-full object-cover"
                />
              )}
            </div>
            <div className="text-left">
              <h3 className="font-semibold">{writer.name}</h3>
              <p className="text-sm text-gray-500">
                Last updated: {new Date(writer.last_scraped_at).toLocaleDateString()}
              </p>
            </div>
          </button>
        ))}

        <button
          onClick={onNewWriter}
          className="flex items-center justify-center p-4 border-2 border-dashed rounded-lg hover:border-blue-500 transition-colors"
        >
          <span className="text-lg">+ Add New Writer</span>
        </button>
      </div>
    </div>
  );
} 
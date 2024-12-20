/// <reference types="react" />

// pages/index.tsx
import { useRef, useState, KeyboardEvent, useEffect } from 'react';
import Head from 'next/head';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import SubstackURLInput from '@/components/SubstackURLInput';
import { Answer } from '@/components/Answer/Answer';
import { ArrowRight, ExternalLink, Search } from 'lucide-react';
import { PGChunk } from '@/types';
import WriterSelect from '@/components/WriterSelect';

// Update the type to match our Substack structure
interface SubstackChunk {
  id: number;
  author: string;
  essay_title: string;
  essay_url: string;
  essay_date: string;
  content: string;
  content_length: number;
  content_tokens: number;
  similarity: number;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState<string>("");
  const [chunks, setChunks] = useState<SubstackChunk[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [mode, setMode] = useState<"search" | "chat">("chat");
  const [matchCount, setMatchCount] = useState<number>(5);

  // New state for Substack integration
  const [isScraped, setIsScraped] = useState<boolean>(false);
  const [authorName, setAuthorName] = useState<string>("");
  const [substackData, setSubstackData] = useState<any>(null);

  const [showWriterSelect, setShowWriterSelect] = useState(true);
  const [selectedWriter, setSelectedWriter] = useState<any>(null);

  const handleSearch = async () => {
    if (!query) {
      alert("Please enter a query.");
      return;
    }

    if (!isScraped) {
      alert("Please scrape a Substack first.");
      return;
    }

    setAnswer("");
    setChunks([]);
    setLoading(true);

    try {
      const searchResponse = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          matches: matchCount,
          authorName
        })
      });

      if (!searchResponse.ok) {
        setLoading(false);
        const errorData = await searchResponse.json();
        throw new Error(errorData.details || searchResponse.statusText);
      }

      const results: SubstackChunk[] = await searchResponse.json();
      setChunks(results);
      setLoading(false);
      inputRef.current?.focus();

      return results;
    } catch (error: unknown) {
      console.error('Search error:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
      }
      setLoading(false);
    }
  };

  const handleAnswer = async () => {
    if (!query) {
      alert("Please enter a query.");
      return;
    }

    if (!isScraped) {
      alert("Please scrape a Substack first.");
      return;
    }

    setAnswer("");
    setChunks([]);
    setLoading(true);

    try {
      const searchResponse = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          matches: matchCount,
          authorName
        })
      });

      if (!searchResponse.ok) {
        setLoading(false);
        const errorData = await searchResponse.json();
        throw new Error(errorData.details || searchResponse.statusText);
      }

      const results: SubstackChunk[] = await searchResponse.json();
      setChunks(results);

      const prompt = `Use the following passages from ${authorName}'s Substack posts to provide an answer to the query: "${query}"

      ${results?.map((d: any) => d.content).join("\n\n")}`;

      const answerResponse = await fetch("/api/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      if (!answerResponse.ok) {
        setLoading(false);
        throw new Error(answerResponse.statusText);
      }

      const data = answerResponse.body;

      if (!data) {
        return;
      }

      setLoading(false);

      const reader = data.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        setAnswer((prev) => prev + chunkValue);
      }

      inputRef.current?.focus();
    } catch (error) {
      console.error('Answer error:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (mode === "search") {
        handleSearch();
      } else {
        handleAnswer();
      }
    }
  };

  const handleScrapeComplete = (data: any) => {
    console.log('Scraping completed:', data);
    setIsScraped(true);
    setAuthorName(data.author);
    setSubstackData(data);
  };

  const handleWriterSelect = (writer: any) => {
    setSelectedWriter(writer);
    setAuthorName(writer.name);
    setIsScraped(true);  // Add this line to enable chat immediately
    setShowWriterSelect(false);
    setSubstackData({    // Add this to set minimal required data
      author: writer.name,
      url: writer.substack_url
    });
  };

  const handleNewWriter = () => {
    setShowWriterSelect(false);
  };

  const handleBackToWriters = () => {
    setShowWriterSelect(true);
    setSelectedWriter(null);
    setAuthorName('');
    setIsScraped(false);  // Reset scrape state
    setSubstackData(null);
    setChunks([]);       // Clear any existing chat/search results
    setAnswer('');
  };

  return (
      <>
        <Head>
          <title>{authorName ? `${authorName} GPT` : 'Substack GPT'}</title>
          <meta
              name="description"
              content="AI-powered search and chat for Substack newsletters."
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <div className="flex flex-col h-screen">
          <Navbar authorName={authorName} substackUrl={substackData?.url} />
          <div className="flex-1 overflow-auto">
            <div className="mx-auto flex h-full w-full max-w-[750px] flex-col items-center px-3 pt-4 sm:pt-8">
              {showWriterSelect ? (
                <WriterSelect
                  onWriterSelect={handleWriterSelect}
                  onNewWriter={handleNewWriter}
                />
              ) : !isScraped ? (
                <SubstackURLInput 
                  onScrapeComplete={handleScrapeComplete}
                  onBack={handleBackToWriters}
                />
              ) : (
                  <>
                    <button
                        className="mt-4 flex cursor-pointer items-center space-x-2 rounded-full border border-zinc-600 px-3 py-1 text-sm hover:opacity-50"
                        onClick={() => setShowSettings(!showSettings)}
                    >
                      {showSettings ? "Hide" : "Show"} Settings
                    </button>

                    {showSettings && (
                        <div className="w-[340px] sm:w-[400px]">
                          <div>
                            <div>Mode</div>
                            <select
                                className="max-w-[400px] block w-full cursor-pointer rounded-md border border-gray-300 p-2 text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                value={mode}
                                onChange={(e) => setMode(e.target.value as "search" | "chat")}
                            >
                              <option value="search">Search</option>
                              <option value="chat">Chat</option>
                            </select>
                          </div>

                          <div className="mt-2">
                            <div>Passage Count</div>
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={matchCount}
                                onChange={(e) => setMatchCount(Number(e.target.value))}
                                className="max-w-[400px] block w-full rounded-md border border-gray-300 p-2 text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                            />
                          </div>
                        </div>
                    )}

                    <div className="relative w-full mt-4">
                      <Search className="absolute top-3 w-10 left-1 h-6 rounded-full opacity-50 sm:left-3 sm:top-4 sm:h-8" />

                      <input
                          ref={inputRef}
                          className="h-12 w-full rounded-full border border-zinc-600 pr-12 pl-11 focus:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-800 sm:h-16 sm:py-2 sm:pr-16 sm:pl-16 sm:text-lg"
                          type="text"
                          placeholder={`Ask a question about ${authorName}'s writing...`}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={handleKeyDown}
                      />

                      <button>
                        <ArrowRight
                            onClick={mode === "search" ? handleSearch : handleAnswer}
                            className="absolute right-2 top-2.5 h-7 w-7 rounded-full bg-blue-500 p-1 hover:cursor-pointer hover:bg-blue-600 sm:right-3 sm:top-3 sm:h-10 sm:w-10 text-white"
                        />
                      </button>
                    </div>

                    {loading ? (
                        <div className="mt-6 w-full">
                          {mode === "chat" && (
                              <>
                                <div className="font-bold text-2xl">Answer</div>
                                <div className="animate-pulse mt-2">
                                  <div className="h-4 bg-gray-300 rounded"></div>
                                  <div className="h-4 bg-gray-300 rounded mt-2"></div>
                                  <div className="h-4 bg-gray-300 rounded mt-2"></div>
                                  <div className="h-4 bg-gray-300 rounded mt-2"></div>
                                  <div className="h-4 bg-gray-300 rounded mt-2"></div>
                                </div>
                              </>
                          )}

                          <div className="font-bold text-2xl mt-6">Passages</div>
                          <div className="animate-pulse mt-2">
                            <div className="h-4 bg-gray-300 rounded"></div>
                            <div className="h-4 bg-gray-300 rounded mt-2"></div>
                            <div className="h-4 bg-gray-300 rounded mt-2"></div>
                            <div className="h-4 bg-gray-300 rounded mt-2"></div>
                            <div className="h-4 bg-gray-300 rounded mt-2"></div>
                          </div>
                        </div>
                    ) : answer ? (
                        <div className="mt-6">
                          <div className="font-bold text-2xl mb-2">Answer</div>
                          <Answer text={answer} />

                          <div className="mt-6 mb-16">
                            <div className="font-bold text-2xl">Passages</div>

                            {chunks.map((chunk, index) => (
                                <div key={index}>
                                  <div className="mt-4 border border-zinc-600 rounded-lg p-4">
                                    <div className="flex justify-between">
                                      <div>
                                        <div className="font-bold text-xl">{chunk.essay_title}</div>
                                        <div className="mt-1 font-bold text-sm">{chunk.essay_date}</div>
                                      </div>
                                      <a
                                          className="hover:opacity-50 ml-2"
                                          href={chunk.essay_url}
                                          target="_blank"
                                          rel="noreferrer"
                                      >
                                        <ExternalLink />
                                      </a>
                                    </div>
                                    <div className="mt-2">{chunk.content}</div>
                                  </div>
                                </div>
                            ))}
                          </div>
                        </div>
                    ) : chunks.length > 0 ? (
                        <div className="mt-6 pb-16">
                          <div className="font-bold text-2xl">Passages</div>
                          {chunks.map((chunk, index) => (
                              <div key={index}>
                                <div className="mt-4 border border-zinc-600 rounded-lg p-4">
                                  <div className="flex justify-between">
                                    <div>
                                      <div className="font-bold text-xl">{chunk.essay_title}</div>
                                      <div className="mt-1 font-bold text-sm">{chunk.essay_date}</div>
                                    </div>
                                    <a
                                        className="hover:opacity-50 ml-2"
                                        href={chunk.essay_url}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                      <ExternalLink />
                                    </a>
                                  </div>
                                  <div className="mt-2">{chunk.content}</div>
                                </div>
                              </div>
                          ))}
                        </div>
                    ) : (
                        <div className="mt-6 text-center text-lg">
                          {`AI-powered search & chat for ${authorName}'s Substack posts.`}
                        </div>
                    )}
                  </>
              )}
              {error && (
                <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}
            </div>
          </div>
          <Footer />
        </div>
      </>
  );
}
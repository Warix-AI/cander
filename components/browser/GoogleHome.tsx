"use client";

import { useEffect, useState } from "react";
import { Camera, Mic, Search } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";

const shortcuts = [
  { label: "Gmail", letter: "M", color: "#EA4335" },
  { label: "Images", letter: "I", color: "#4285F4" },
  { label: "YouTube", letter: "Y", color: "#FF0000" },
  { label: "Drive", letter: "D", color: "#34A853" },
  { label: "Maps", letter: "P", color: "#FBBC05" },
  { label: "News", letter: "N", color: "#4285F4" },
];

const results = [
  {
    url: "https://www.cander.com",
    crumb: "cander.com",
    title: "Cander — AI that ships with you",
    snippet:
      "Cander is the workspace for building, researching, and shipping product. Start a new Build, open Explore, or browse the web beside chat.",
  },
  {
    url: "https://about.google",
    crumb: "about.google › products",
    title: "Our products – Google",
    snippet:
      "Discover a selection of Google products across Search, Maps, Play, Gmail, YouTube, Drive, and more.",
  },
  {
    url: "https://www.google.com/search?q=one+ai",
    crumb: "support.google.com › search",
    title: "How Search works",
    snippet:
      "Google Search organizes the world’s information and makes it universally accessible. Type a query, then refine with images, news, and shopping.",
  },
];

export function GoogleHome() {
  const { browserSearch } = useApp();
  const [query, setQuery] = useState(browserSearch ?? "");
  const [searched, setSearched] = useState<string | null>(browserSearch);

  useEffect(() => {
    setQuery(browserSearch ?? "");
    setSearched(browserSearch);
  }, [browserSearch]);

  const submit = () => {
    const next = query.trim();
    if (!next) return;
    setSearched(next);
  };

  if (searched) {
    return (
      <div className="min-h-full bg-white text-[#202124]">
        <header className="flex items-center gap-6 border-b border-[#dfe1e5] px-6 py-3">
          <button
            type="button"
            onClick={() => {
              setSearched(null);
              setQuery("");
            }}
            aria-label="Back to Google"
            className="shrink-0"
          >
            <GoogleWordmark className="h-7 w-[92px]" />
          </button>
          <form
            className="flex h-11 max-w-[42rem] flex-1 items-center gap-2 rounded-full border border-[#dfe1e5] bg-white px-4 shadow-[0_1px_6px_rgba(32,33,36,0.12)]"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Search className="h-4 w-4 text-[#9aa0a6]" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            <Mic className="h-4 w-4 text-[#4285F4]" strokeWidth={1.8} />
          </form>
        </header>
        <div className="px-6 py-3 text-[13px] text-[#70757a] sm:pl-[calc(92px+3.5rem)]">
          About 12,400,000 results (0.28 seconds)
        </div>
        <div className="max-w-[40rem] space-y-7 px-6 pb-16 sm:pl-[calc(92px+3.5rem)]">
          {results.map((item) => (
            <article key={item.url}>
              <p className="text-[13px] text-[#202124]">{item.crumb}</p>
              <p className="mt-0.5 text-[20px] leading-snug text-[#1a0dab]">
                {item.title}
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-[#4d5156]">
                {item.snippet}
              </p>
            </article>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-white text-[#202124]">
      <header className="flex items-center justify-end gap-4 px-6 py-3 text-[13px]">
        <span className="text-[#202124]">Gmail</span>
        <span className="text-[#202124]">Images</span>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1a73e8] text-[13px] font-medium text-white">
          C
        </span>
      </header>

      <div className="flex flex-1 flex-col items-center px-6 pt-[12vh]">
        <GoogleWordmark className="h-[72px] w-[272px]" />
        <form
          className="mt-8 flex h-12 w-full max-w-[36rem] items-center gap-3 rounded-full border border-[#dfe1e5] bg-white px-4 shadow-[0_1px_6px_rgba(32,33,36,0.28)]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-[#9aa0a6]" strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Google or type a URL"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[#80868b]"
          />
          <Mic className="h-[18px] w-[18px] shrink-0 text-[#4285F4]" strokeWidth={1.8} />
          <Camera className="h-[18px] w-[18px] shrink-0 text-[#4285F4]" strokeWidth={1.8} />
        </form>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={submit}
            className="h-9 rounded-[4px] bg-[#f8f9fa] px-4 text-[14px] text-[#3c4043] hover:border hover:border-[#dadce0] hover:shadow-[0_1px_1px_rgba(0,0,0,0.1)]"
          >
            Google Search
          </button>
          <button
            type="button"
            className="h-9 rounded-[4px] bg-[#f8f9fa] px-4 text-[14px] text-[#3c4043] hover:border hover:border-[#dadce0] hover:shadow-[0_1px_1px_rgba(0,0,0,0.1)]"
          >
            I&apos;m Feeling Lucky
          </button>
        </div>

        <div className="mt-12 grid w-full max-w-[22rem] grid-cols-3 gap-x-6 gap-y-8 sm:max-w-[28rem] sm:grid-cols-6">
          {shortcuts.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-medium text-white"
                style={{ background: item.color }}
              >
                {item.letter}
              </span>
              <span className="text-[12px] text-[#202124]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <footer className="mt-auto border-t border-[#dfe1e5] bg-[#f2f2f2] px-6 py-3 text-[13px] text-[#70757a]">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>About</span>
          <span>Advertising</span>
          <span>Business</span>
          <span>How Search works</span>
          <span className="sm:ml-auto">Privacy</span>
          <span>Terms</span>
          <span>Settings</span>
        </div>
      </footer>
    </div>
  );
}

function GoogleWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 272 92"
      className={className}
      aria-label="Google"
      role="img"
    >
      <path
        fill="#4285F4"
        d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"
      />
      <path
        fill="#EA4335"
        d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"
      />
      <path
        fill="#FBBC05"
        d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.87h.34v-3.53h9.25zm-8.83 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z"
      />
      <path fill="#4285F4" d="M225 3v65h-9.5V3h9.5z" />
      <path
        fill="#34A853"
        d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.87-8.23-4.87-4.95 0-11.84 4.37-11.59 13.1z"
      />
      <path
        fill="#EA4335"
        d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z"
      />
    </svg>
  );
}

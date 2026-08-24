"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders a research report Markdown string in the monochrome editorial style. */
export function ReportView({ markdown }: { markdown: string }) {
  return (
    <div className="prose-serif max-w-none text-[0.98rem] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 mt-2 text-3xl leading-tight">{children}</h1>,
          h2: ({ children }) => (
            <h2 className="mb-3 mt-8 border-b border-line pb-1 text-xl">{children}</h2>
          ),
          h3: ({ children }) => <h3 className="mb-2 mt-6 text-lg">{children}</h3>,
          p: ({ children }) => <p className="my-3 text-muted">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-inside space-y-1 text-muted">{children}</ul>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="text-ink">{children}</strong>,
          code: ({ children }) => (
            <code className="border border-line bg-subtle px-1 text-[0.85em]">{children}</code>
          ),
          hr: () => <hr className="my-6 border-t border-line" />,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-ink pl-4 text-muted">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto border border-line">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-ink">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-normal uppercase tracking-[0.1em] text-faint">{children}</th>
          ),
          td: ({ children }) => <td className="tnum border-b border-line px-3 py-2 text-muted">{children}</td>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

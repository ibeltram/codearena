'use client';

/**
 * MarkdownViewer Component
 *
 * Renders markdown content with styling.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  // Simple markdown rendering without external dependencies
  // In production, use react-markdown with rehype plugins
  const renderMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang = '';
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const ListTag = listType;
        elements.push(
          <ListTag key={elements.length} className={listType === 'ul' ? 'list-disc ml-6 my-2' : 'list-decimal ml-6 my-2'}>
            {listItems.map((item, i) => (
              <li key={i} className="my-1">{renderInline(item)}</li>
            ))}
          </ListTag>
        );
        listItems = [];
        listType = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={elements.length} className="bg-gray-900 text-gray-100 p-4 rounded-lg my-4 overflow-x-auto">
              <code className={`language-${codeBlockLang}`}>
                {codeBlockLines.join('\n')}
              </code>
            </pre>
          );
          codeBlockLines = [];
          inCodeBlock = false;
        } else {
          flushList();
          codeBlockLang = line.slice(3).trim() || 'text';
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Headers
      if (line.startsWith('# ')) {
        flushList();
        elements.push(<h1 key={elements.length} className="text-3xl font-bold my-4">{renderInline(line.slice(2))}</h1>);
        continue;
      }
      if (line.startsWith('## ')) {
        flushList();
        elements.push(<h2 key={elements.length} className="text-2xl font-bold my-3">{renderInline(line.slice(3))}</h2>);
        continue;
      }
      if (line.startsWith('### ')) {
        flushList();
        elements.push(<h3 key={elements.length} className="text-xl font-bold my-2">{renderInline(line.slice(4))}</h3>);
        continue;
      }
      if (line.startsWith('#### ')) {
        flushList();
        elements.push(<h4 key={elements.length} className="text-lg font-bold my-2">{renderInline(line.slice(5))}</h4>);
        continue;
      }

      // Horizontal rule
      if (line.match(/^[-*_]{3,}$/)) {
        flushList();
        elements.push(<hr key={elements.length} className="my-4 border-gray-300" />);
        continue;
      }

      // Unordered list
      if (line.match(/^[-*+]\s/)) {
        if (listType !== 'ul') {
          flushList();
          listType = 'ul';
        }
        listItems.push(line.slice(2));
        continue;
      }

      // Ordered list
      if (line.match(/^\d+\.\s/)) {
        if (listType !== 'ol') {
          flushList();
          listType = 'ol';
        }
        listItems.push(line.replace(/^\d+\.\s/, ''));
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        flushList();
        elements.push(
          <blockquote key={elements.length} className="border-l-4 border-gray-300 pl-4 my-2 text-gray-600 italic">
            {renderInline(line.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        flushList();
        continue;
      }

      // Paragraph
      flushList();
      elements.push(<p key={elements.length} className="my-2">{renderInline(line)}</p>);
    }

    flushList();
    return elements;
  };

  const renderInline = (text: string): React.ReactNode => {
    // Replace inline code
    let result: React.ReactNode[] = [];
    const parts = text.split(/`([^`]+)`/);

    parts.forEach((part, index) => {
      if (index % 2 === 1) {
        // Code
        result.push(
          <code key={index} className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">
            {part}
          </code>
        );
      } else {
        // Regular text - process bold and italic
        const processed = processBoldItalic(part);
        result.push(<React.Fragment key={index}>{processed}</React.Fragment>);
      }
    });

    return result;
  };

  const processBoldItalic = (text: string): React.ReactNode => {
    // Bold: **text** or __text__
    // Italic: *text* or _text_
    // Links: [text](url)

    const elements: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Links
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch && linkMatch.index === 0) {
        elements.push(
          <a key={key++} href={linkMatch[2]} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Bold
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
      if (boldMatch && boldMatch.index === 0) {
        elements.push(<strong key={key++}>{boldMatch[1] || boldMatch[2]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic
      const italicMatch = remaining.match(/\*([^*]+)\*|_([^_]+)_/);
      if (italicMatch && italicMatch.index === 0) {
        elements.push(<em key={key++}>{italicMatch[1] || italicMatch[2]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Find next special character
      const nextSpecial = remaining.search(/[*_\[]/);
      if (nextSpecial === -1) {
        elements.push(remaining);
        break;
      } else if (nextSpecial > 0) {
        elements.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      } else {
        // No match at position 0, just take the character
        elements.push(remaining[0]);
        remaining = remaining.slice(1);
      }
    }

    return elements;
  };

  return (
    <div className={cn('prose prose-gray dark:prose-invert max-w-none p-6', className)}>
      {renderMarkdown(content)}
    </div>
  );
}

export default MarkdownViewer;

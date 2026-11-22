'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Bot,
  X,
  Send,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Lock,
  Unlock,
  Clock,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Receipt,
  FileText,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { INVOICES_CHANGE_EVENT } from '@/lib/invoices';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  requiresAuth?: boolean;
  updatedBill?: {
    billNumber: string;
    vehicleNumber?: string;
    place?: string;
    tdsRate?: number;
    netAmount?: number;
    status?: string;
    runningDistance?: number;
  };
}

function InlineFormatted({ text }: { text: string }) {
  if (!text) return null;

  // Split by inline code `...`, bold **...**, italic *...*
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('`') && part.endsWith('`')) {
          const code = part.slice(1, -1);
          if (code === 'PAID') {
            return (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              >
                PAID
              </span>
            );
          }
          if (code === 'PENDING') {
            return (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              >
                PENDING
              </span>
            );
          }
          if (code === 'ACTIVE') {
            return (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              >
                ACTIVE
              </span>
            );
          }
          return (
            <code
              key={idx}
              className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 font-mono text-[10px] text-blue-700 dark:text-blue-300 border border-gray-200/80 dark:border-zinc-700"
            >
              {code}
            </code>
          );
        }

        if (part.startsWith('**') && part.endsWith('**')) {
          const bold = part.slice(2, -2);
          if (bold.includes('₹') || bold.includes('Rs.')) {
            return (
              <strong
                key={idx}
                className="font-bold text-emerald-600 dark:text-emerald-400"
              >
                {bold}
              </strong>
            );
          }
          return (
            <strong key={idx} className="font-bold text-gray-950 dark:text-white">
              {bold}
            </strong>
          );
        }

        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <em key={idx} className="italic text-gray-600 dark:text-zinc-300">
              {part.slice(1, -1)}
            </em>
          );
        }

        if (part.includes('₹') || part.includes('Rs.')) {
          return (
            <span key={idx} className="font-semibold text-emerald-600 dark:text-emerald-400">
              {part}
            </span>
          );
        }

        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

type ContentBlock =
  | { type: 'header'; level: number; text: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'bullet'; text: string }
  | { type: 'code'; code: string }
  | { type: 'paragraph'; text: string };

function parseMarkdownBlocks(rawText: string): ContentBlock[] {
  const lines = rawText.split('\n');
  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'code', code: codeLines.join('\n') });
      continue;
    }

    // Table block (starts and ends with |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());

        const headers = parseRow(tableLines[0]);
        const dataRows = tableLines.slice(1).filter((r) => !r.match(/^\|(?:\s*:?-+:?\s*\|)+$/));
        const rows = dataRows.map(parseRow);

        blocks.push({ type: 'table', headers, rows });
        continue;
      }
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    // Headers (#, ##, ###)
    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        blocks.push({
          type: 'header',
          level: match[1].length,
          text: match[2],
        });
        i++;
        continue;
      }
    }

    // Bullet line
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      blocks.push({
        type: 'bullet',
        text: trimmed.replace(/^[-•*]\s+/, ''),
      });
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push({ type: 'paragraph', text: line });
    i++;
  }

  return blocks;
}

/**
 * Enhanced Visual Content Formatter for AI FAB
 * Renders full Markdown tables, blockquotes, code blocks, headers, and badges
 */
function FormattedAiContent({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="space-y-2 text-xs leading-relaxed text-gray-800 dark:text-zinc-200">
      {blocks.map((block, idx) => {
        if (block.type === 'header') {
          return (
            <div
              key={idx}
              className="pt-2 pb-1 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-2 first:pt-0"
            >
              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                <InlineFormatted text={block.text} />
              </h4>
            </div>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={idx}
              className="my-2 pl-3 py-2 border-l-3 border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 rounded-r-xl text-blue-950 dark:text-blue-200 text-[11px] leading-relaxed shadow-2xs space-y-1"
            >
              {block.lines.map((ql, qIdx) => (
                <p key={qIdx}>
                  <InlineFormatted text={ql} />
                </p>
              ))}
            </blockquote>
          );
        }

        if (block.type === 'table') {
          return (
            <div
              key={idx}
              className="my-2.5 overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-700/80 shadow-2xs scrollbar-thin"
            >
              <table className="w-full text-left text-[11px] border-collapse min-w-[340px]">
                <thead className="bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 font-bold border-b border-gray-200 dark:border-zinc-700">
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-2.5 py-1.5 whitespace-nowrap">
                        <InlineFormatted text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-blue-50/40 dark:hover:bg-zinc-800/50 odd:bg-gray-50/30 dark:odd:bg-zinc-900/50 transition-colors"
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-2.5 py-1.5 whitespace-nowrap text-gray-800 dark:text-zinc-200"
                        >
                          <InlineFormatted text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'bullet') {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <div className="flex-1 text-gray-800 dark:text-zinc-200">
                <InlineFormatted text={block.text} />
              </div>
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <pre
              key={idx}
              className="my-2 p-2.5 rounded-xl bg-gray-950 text-gray-100 overflow-x-auto text-[11px] font-mono border border-gray-800"
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        return (
          <p key={idx} className="py-0.5 text-gray-800 dark:text-zinc-200">
            <InlineFormatted text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

export function AiAssistantFab() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Authentication check: Hide AI assistant on /login page and only show when user is logged in
  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser()
        .then(({ data: { user } }) => {
          setIsAuthenticated(!!user);
        })
        .catch(() => {
          setIsAuthenticated(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsAuthenticated(!!session?.user);
      });

      return () => {
        subscription?.unsubscribe();
      };
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  // Authentication & 5-minute strict timer state
  const [isEditAuthorized, setIsEditAuthorized] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [authError, setAuthError] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: '### Welcome to AUS Transport AI Assistant\n\n> Complete visibility across all 7 operational categories in your database.\n\n| Category | Available Data |\n| :--- | :--- |\n| **Invoices** | Bill numbers, trip legs, TDS, payments, branches |\n| **Fleet** | Odometer KM, vehicle registration, active trucks |\n| **Drivers** | Driver directory, phone numbers, KM rates |\n| **Fuel** | Bunk names, liters, fuel rates, total costs |\n| **Maintenance** | Workshop repairs, service categories, costs |\n| **Expenses** | FASTag, tolls, driver bata, loading charges |\n| **P&L** | Revenue vs. fuel & operating profit |\n\n*Read-Only mode is active. To make edits, unlock with your Supabase login password.*',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ticking countdown timer for the 5-minute session
  useEffect(() => {
    if (!isEditAuthorized || secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsEditAuthorized(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isEditAuthorized, secondsRemaining]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  // Automatically register Telegram bot webhook when running on production domain
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      fetch('/api/telegram/setup', {
        headers: { Accept: 'application/json' },
      }).catch(() => {});
    }
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleUnlockPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim() || isLoading) return;

    setAuthError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '/unlock ' + passwordInput.trim(),
          passwordAttempt: passwordInput.trim(),
        }),
      });

      const data = await res.json();

      if (data.isEditAuthorized) {
        setIsEditAuthorized(true);
        setSecondsRemaining(data.remainingSeconds || 300);
        setShowPasswordModal(false);
        setPasswordInput('');

        setMessages((prev) => [
          ...prev,
          {
            id: `ai_auth_${Date.now()}`,
            sender: 'ai',
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        setAuthError(data.text || 'Incorrect password.');
      }
    } catch {
      setAuthError('Connection error while verifying password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend }),
      });

      const data = await res.json();

      if (data.requiresAuth) {
        setShowPasswordModal(true);
      }

      if (data.isEditAuthorized !== undefined) {
        setIsEditAuthorized(data.isEditAuthorized);
        if (data.remainingSeconds) {
          setSecondsRemaining(data.remainingSeconds);
        }
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: data.text || 'Done.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        updatedBill: data.updatedBill || undefined,
        requiresAuth: data.requiresAuth,
      };

      setMessages((prev) => [...prev, aiMsg]);

      // If a bill was updated in Supabase, trigger local custom event to notify website UI immediately
      if (data.updatedBill) {
        window.dispatchEvent(new CustomEvent(INVOICES_CHANGE_EVENT, { detail: null }));
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unable to connect to AI server';
      let formattedNotice = `### Notice\n\n> ${errMsg}\n\n*The AI Assistant is active in Read-Only mode. You can ask for **recent bills**, **pending payments**, **fleet KMs**, **fuel**, or **maintenance** directly.*`;
      if (errMsg.includes('Permission denied') || errMsg.includes('service')) {
        formattedNotice = `### Google Gemini API Notice\n\n> Google Generative AI reported: *${errMsg}*\n\nTo resolve this in Google Cloud / Vercel:\n1. Ensure your Google Cloud Project has **Generative Language API** enabled, or generate a free key from **Google AI Studio** (https://aistudio.google.com/app/apikey).\n2. Update \`GEMINI_API_KEY\` in your Vercel Project Settings > Environment Variables.\n\n*Live database queries remain fully functional across all categories.*`;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          sender: 'ai',
          text: formattedNotice,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickPrompts = [
    { label: '[Invoices]', query: 'Show recent invoices with final price and status' },
    { label: '[Pending Bills]', query: 'List pending unpaid bills awaiting payment' },
    { label: '[Fleet KMs]', query: 'Show active fleet vehicles with current odometer KM' },
    { label: '[Fuel Records]', query: 'Show fuel management logs and bunk diesel refills' },
    { label: '[Maintenance]', query: 'Show vehicle repairs and maintenance logs' },
    { label: '[Expenses]', query: 'Show fleet expenses including FASTag, tolls, and loading' },
    { label: '[Drivers]', query: 'Show drivers directory with mobile numbers and rates' },
    { label: '[Profit & Loss]', query: 'Show profit and loss overview across fleet vehicles' },
  ];

  // Strict User Requirement: AI Assistant must NOT be present on /login and ONLY available after successful login
  if (pathname === '/login' || isAuthenticated !== true) {
    return null;
  }

  return (
    <>
      {/* FLOATING ACTION BUTTON - Offset to right-24 so it NEVER overlaps the invoice '+' action button */}
      <div className="fixed bottom-6 right-24 sm:right-24 z-40 flex items-center gap-2 group">
        {!isOpen && (
          <div className="hidden sm:flex items-center px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-md text-xs font-semibold text-gray-700 dark:text-zinc-200 pointer-events-none transition-all opacity-0 group-hover:opacity-100 -translate-x-1">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                isEditAuthorized ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'
              }`}
            />
            {isEditAuthorized
              ? `Edit Active (${formatTimer(secondsRemaining)})`
              : 'AI Assistant (Read-Only)'}
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Toggle AI Assistant"
          className="relative w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-xl hover:shadow-2xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer ring-4 ring-blue-500/20"
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <>
              <Bot className="w-7 h-7" />
              <span
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-950 ${
                  isEditAuthorized ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
              />
            </>
          )}
        </button>
      </div>

      {/* CHAT POPUP DRAWER */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[460px] h-[620px] max-h-[85vh] rounded-3xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800 bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-transparent dark:from-zinc-900 dark:to-zinc-900/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    AUS AI Assistant
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300">
                    gemini-flash
                  </span>
                </div>

                {/* Live Auth Timer Badge */}
                <div className="flex items-center gap-2 mt-0.5">
                  {isEditAuthorized ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <Unlock className="w-3 h-3" />
                      <span>Edit Mode: {formatTimer(secondsRemaining)}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-zinc-400">
                      <Lock className="w-3 h-3 text-gray-400" />
                      <span>Read-Only Mode</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Unlock Button in Header */}
              {!isEditAuthorized && (
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Enter Supabase login password to unlock 5-minute edit mode"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Unlock</span>
                </button>
              )}

              {/* Telegram Link */}
              <a
                href="https://t.me/aus_transport_assistant_bot"
                target="_blank"
                rel="noreferrer"
                title="Open in Telegram (@aus_transport_assistant_bot)"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              {/* Close */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2 bg-gray-50/80 dark:bg-zinc-900/60 border-b border-gray-100 dark:border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 text-xs">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(p.query)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/80 text-[11px] font-medium text-gray-700 dark:text-zinc-200 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl p-3.5 leading-relaxed shadow-xs ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-gray-50/95 dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 rounded-bl-xs border border-gray-200/70 dark:border-zinc-700/60'
                  }`}
                >
                  {m.sender === 'user' ? (
                    <p className="whitespace-pre-wrap font-medium">{m.text}</p>
                  ) : (
                    <FormattedAiContent text={m.text} />
                  )}

                  {/* Requires Auth Banner inside message */}
                  {m.requiresAuth && !isEditAuthorized && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-[11px]">
                        <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>Authentication needed to modify records</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPasswordModal(true)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shadow-2xs shrink-0 cursor-pointer"
                      >
                        Enter Password
                      </button>
                    </div>
                  )}

                  {/* Render Updated Bill Card if applicable */}
                  {m.updatedBill && (
                    <div className="mt-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs space-y-2 text-gray-900 dark:text-zinc-100">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Saved to Supabase
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                          Bill #{m.updatedBill.billNumber}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-gray-100 dark:border-zinc-800">
                        {m.updatedBill.vehicleNumber && (
                          <div>
                            <span className="text-gray-500 dark:text-zinc-400 block text-[10px]">
                              Vehicle
                            </span>
                            <span className="font-semibold font-mono">
                              {m.updatedBill.vehicleNumber}
                            </span>
                          </div>
                        )}
                        {m.updatedBill.place && (
                          <div>
                            <span className="text-gray-500 dark:text-zinc-400 block text-[10px]">
                              Branch / Place
                            </span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {m.updatedBill.place}
                            </span>
                          </div>
                        )}
                        {m.updatedBill.runningDistance !== undefined && (
                          <div>
                            <span className="text-gray-500 dark:text-zinc-400 block text-[10px]">
                              Distance
                            </span>
                            <span className="font-semibold font-mono">
                              {m.updatedBill.runningDistance.toLocaleString('en-IN')} KM
                            </span>
                          </div>
                        )}
                        {m.updatedBill.netAmount !== undefined && (
                          <div>
                            <span className="text-gray-500 dark:text-zinc-400 block text-[10px]">
                              Final Net Amount
                            </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              ₹ {Math.round(m.updatedBill.netAmount).toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-gray-100 dark:bg-zinc-800/80 text-gray-500 dark:text-zinc-400 w-fit">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium">Assistant is processing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Password Prompt Drawer Modal */}
          {showPasswordModal && (
            <div className="p-4 bg-blue-50/90 dark:bg-zinc-950/90 border-t border-blue-200 dark:border-blue-900/60 backdrop-blur-xs animate-in slide-in-from-bottom-2 duration-150">
              <form onSubmit={handleUnlockPassword} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200">
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    <span>Enter Supabase Login Password</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[11px] text-gray-600 dark:text-zinc-400">
                  Enter the password you use to log in to the website. This grants a strict 5-minute timer to edit and update records.
                </p>

                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Your Supabase login password..."
                    disabled={isLoading}
                    className="w-full px-3 py-2 pr-9 rounded-xl bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-xs text-gray-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {authError && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                    {authError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!passwordInput.trim() || isLoading}
                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? 'Verifying...' : 'Unlock for 5 Min'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Input Box */}
          <div className="p-3 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-gray-100 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700/80 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isEditAuthorized
                    ? 'Edit mode active: tell me what bill to update...'
                    : 'Ask about bills, prices, status, or fleet KM...'
                }
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-hidden disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-700 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-zinc-500 px-1 pt-1.5">
              <span>
                {isEditAuthorized
                  ? `Edit unlocked (${formatTimer(secondsRemaining)})`
                  : 'Read-only mode active'}
              </span>
              <a
                href="https://t.me/aus_transport_assistant_bot"
                target="_blank"
                rel="noreferrer"
                className="hover:underline text-blue-600 dark:text-blue-400 flex items-center gap-1"
              >
                <span>Telegram Bot</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

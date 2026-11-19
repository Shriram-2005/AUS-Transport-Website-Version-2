'use client';

import React, { useState, useRef, useEffect } from 'react';
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

/**
 * Enhanced Message Formatter for AI FAB
 * Formats markdown headers, bullets, bill cards, and badges cleanly
 */
function FormattedAiContent({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-xs leading-relaxed text-gray-800 dark:text-zinc-200">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Header 3
        if (trimmed.startsWith('### ')) {
          return (
            <h4
              key={idx}
              className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 pt-1 pb-0.5 border-b border-gray-200 dark:border-zinc-800"
            >
              {trimmed.replace('### ', '')}
            </h4>
          );
        }

        // Bill Header line: **Bill #439** ...
        if (trimmed.startsWith('• **Bill #') || trimmed.startsWith('**Bill #')) {
          const clean = trimmed.replace(/^[•*]+\s*/, '');
          return (
            <div
              key={idx}
              className="mt-2.5 pt-2 border-t border-gray-200/80 dark:border-zinc-700/80 first:border-t-0 first:pt-0"
            >
              <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{clean.replace(/\*\*/g, '')}</span>
              </div>
            </div>
          );
        }

        // Bullet line
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          const content = trimmed.replace(/^[-•]\s*/, '');
          const parts = content.split(/(\*\*.*?\*\*)/g);

          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <div className="flex-1">
                {parts.map((p, pIdx) => {
                  if (p.startsWith('**') && p.endsWith('**')) {
                    const boldText = p.replace(/\*\*/g, '');
                    return (
                      <span key={pIdx} className="font-semibold text-gray-900 dark:text-white">
                        {boldText}
                      </span>
                    );
                  }
                  if (p.includes('₹') || p.includes('Rs.')) {
                    return (
                      <span key={pIdx} className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {p}
                      </span>
                    );
                  }
                  if (p.includes('PAID')) {
                    return (
                      <span
                        key={pIdx}
                        className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                      >
                        PAID
                      </span>
                    );
                  }
                  if (p.includes('PENDING') || p.includes('NOT RECEIVED') || p.includes('UNPAID')) {
                    return (
                      <span
                        key={pIdx}
                        className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                      >
                        PENDING
                      </span>
                    );
                  }
                  return <span key={pIdx}>{p}</span>;
                })}
              </div>
            </div>
          );
        }

        // Generic italic or note line
        if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
          return (
            <p key={idx} className="text-[11px] text-gray-500 dark:text-zinc-400 italic">
              {trimmed.replace(/\*/g, '')}
            </p>
          );
        }

        // Standard prose line with bold parsing
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={idx}>
            {parts.map((p, pIdx) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return (
                  <strong key={pIdx} className="font-bold text-gray-900 dark:text-zinc-100">
                    {p.replace(/\*\*/g, '')}
                  </strong>
                );
              }
              return <span key={pIdx}>{p}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function AiAssistantFab() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      text: '### Welcome to AUS AI Assistant\n\nBy default, I am in **Read-Only Mode** to fetch details safely.\n\n• **Ask me:** *"recent bill number and its final price and status"*\n• **Pending:** *"pending bills awaiting payment"*\n• **Vehicles:** *"fleet odometer status"*\n\n*To edit or update any bill details, unlock edit mode with your Supabase login password (grants a strict 5-minute session).*',
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
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          sender: 'ai',
          text: `Error: ${err.message || 'Unable to connect to AI server'}`,
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
    'Recent bill number and final price and status',
    'Pending bills awaiting payment',
    'Fleet vehicles distance',
    'Total revenue this month',
  ];

  return (
    <>
      {/* FLOATING ACTION BUTTON */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 group">
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
                    gemini-3.8-flash
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
                onClick={() => handleSendMessage(p)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/80 text-[11px] font-medium text-gray-600 dark:text-zinc-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
              >
                {p}
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

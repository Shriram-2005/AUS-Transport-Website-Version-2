'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  X,
  Send,
  Loader2,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronRight,
  TrendingUp,
  Receipt,
  Truck,
} from 'lucide-react';
import { INVOICES_CHANGE_EVENT, getStoredInvoices } from '@/lib/invoices';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
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

export function AiAssistantFab() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am your AUS Transport AI Assistant powered by Gemini 3.8 Flash.\n\nYou can ask about bill numbers, check pending payments, or tell me to update any bill directly in natural language (e.g. "Update bill 439 with driver Murugan, closing km 45800, freight 16000, branch Nilakottai").',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

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

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response from AI');
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: data.text || 'Done.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        updatedBill: data.updatedBill || undefined,
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
          text: `Error: ${err.message || 'Unable to connect to Gemini AI'}`,
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
    'Show recent bills',
    'Pending bills awaiting payment',
    'Total revenue this month',
    'Fleet vehicles distance',
  ];

  return (
    <>
      {/* FLOATING ACTION BUTTON */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 group">
        {!isOpen && (
          <div className="hidden sm:flex items-center px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-md text-xs font-semibold text-gray-700 dark:text-zinc-200 pointer-events-none transition-all opacity-0 group-hover:opacity-100 -translate-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
            AI Assistant (Gemini 3.8)
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
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950" />
            </>
          )}
        </button>
      </div>

      {/* CHAT POPUP DRAWER */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[440px] h-[600px] max-h-[82vh] rounded-3xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800/80 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-transparent dark:from-zinc-900 dark:to-zinc-900/40 flex items-center justify-between shrink-0">
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
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Online and connected to Supabase</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
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
          <div className="px-4 py-2 bg-gray-50/70 dark:bg-zinc-900/50 border-b border-gray-100 dark:border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 text-xs">
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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs shadow-xs'
                      : 'bg-gray-100 dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 rounded-bl-xs border border-gray-200/50 dark:border-zinc-700/50'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {/* Render Updated Bill Card if applicable */}
                  {m.updatedBill && (
                    <div className="mt-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs space-y-2 text-gray-900 dark:text-zinc-100">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Updated in Supabase
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
                              Net Amount
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
                <span className="text-xs font-medium">Gemini 3.8 is processing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800/80 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-gray-100 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700/80 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about bills, fleet, or update details..."
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
              <span>Press Enter to send</span>
              <a
                href="https://t.me/aus_transport_assistant_bot"
                target="_blank"
                rel="noreferrer"
                className="hover:underline text-blue-600 dark:text-blue-400 flex items-center gap-1"
              >
                <span>Telegram Bot: @aus_transport_assistant_bot</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


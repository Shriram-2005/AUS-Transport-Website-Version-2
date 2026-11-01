'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { getDictionary } from '@/i18n/dictionaries';
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const dict = getDictionary('en');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError(dict.auth.errorMessage);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || dict.auth.errorMessage);
        setLoading(false);
        return;
      }

      setSuccess(dict.auth.successMessage);
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError(dict.auth.errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-black text-black dark:text-white transition-colors duration-200">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-md mx-auto">
          {/* Back Link - returns to the page from where it came from */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/');
                }
              }}
              className="inline-flex items-center gap-2 text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0 select-none active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>

          {/* Login Card */}
          <div className="border border-black/10 dark:border-white/10 rounded-2xl p-6 sm:p-8 bg-white/50 dark:bg-black/50 backdrop-blur-sm shadow-sm">
            <div className="mb-8 text-center">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
                {dict.auth.title}
              </h1>
              <p className="text-sm text-black/60 dark:text-white/60">
                {dict.auth.subtitle}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium"
              >
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div
                role="status"
                className="mb-6 p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium"
              >
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-2 text-black/80 dark:text-white/80"
                >
                  {dict.auth.emailLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black/40 dark:text-white/40">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={dict.auth.emailPlaceholder}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-2 text-black/80 dark:text-white/80"
                >
                  {dict.auth.passwordLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black/40 dark:text-white/40">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={dict.auth.passwordPlaceholder}
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? dict.auth.hidePassword : dict.auth.showPassword}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold text-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{dict.auth.signingIn}</span>
                  </>
                ) : (
                  <span>{dict.auth.submitButton}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

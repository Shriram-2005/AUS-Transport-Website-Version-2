'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import StaggeredMenu, { StaggeredMenuItem } from './StaggeredMenu';
import { getDictionary } from '@/i18n/dictionaries';
import { createClient } from '@/lib/supabase/client';

export function Header() {
  const router = useRouter();
  const dict = getDictionary('en');
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(65);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!headerRef.current) return;
    const updateHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    try {
      const supabase = createClient();

      supabase.auth.getUser()
        .then(({ data: { user } }) => {
          setUserEmail(user?.email ?? null);
        })
        .catch(() => {
          setUserEmail(null);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      });

      return () => {
        subscription?.unsubscribe();
      };
    } catch {
      setUserEmail(null);
    }
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    router.push('/');
    router.refresh();
  };

  const menuItems: StaggeredMenuItem[] = userEmail
    ? [
        { label: dict.menu.items[0].label, ariaLabel: dict.menu.items[0].ariaLabel, link: '/' },
        { label: dict.auth.signOut, ariaLabel: dict.auth.signOutAria, link: '#', onClick: handleSignOut },
      ]
    : [
        { label: dict.menu.items[0].label, ariaLabel: dict.menu.items[0].ariaLabel, link: '/' },
        { label: dict.menu.items[1].label, ariaLabel: dict.menu.items[1].ariaLabel, link: '/login' },
      ];

  return (
    <header
      ref={headerRef}
      className="w-full flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-[60] transition-colors duration-200"
    >
      <Link
        href="/"
        prefetch={false}
        className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-black dark:text-white no-underline select-none"
      >
        {dict.brand.name}
      </Link>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        <StaggeredMenu
          headerHeight={headerHeight}
          position="right"
          items={menuItems}
          displayItemNumbering={true}
          menuButtonColor="currentColor"
          openMenuButtonColor="currentColor"
          changeMenuColorOnOpen={false}
          colors={['#B497CF', '#5227FF']}
          accentColor="#5227FF"
          onMenuOpen={() => console.log('Menu opened')}
          onMenuClose={() => console.log('Menu closed')}
        />
      </div>
    </header>
  );
}

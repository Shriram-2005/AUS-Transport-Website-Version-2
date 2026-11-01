import React from 'react';
import { Header } from '@/components/Header';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      <Header />
      <main className="flex-1 w-full" />
    </div>
  );
}

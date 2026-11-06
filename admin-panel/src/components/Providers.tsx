'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
// Side effect: start listening for Chrome's install prompt on every page.
import '@/lib/installPrompt';
import { LangBridge } from './Lang';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <LangBridge />
      {children}
    </QueryClientProvider>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function ChatFab() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;
  if (pathname.startsWith('/chat')) return null;

  return (
    <Link href="/chat" className="chat-fab" aria-label="Abrir chat">
      Chat
    </Link>
  );
}

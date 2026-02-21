'use client';

import { useEffect, useMemo, useState } from 'react';

type RotatingTextProps = {
  messages: string[];
  intervalMs?: number;
};

export default function RotatingText({ messages, intervalMs = 3200 }: RotatingTextProps) {
  const cleaned = useMemo(() => messages.filter((message) => message.trim().length > 0), [messages]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (cleaned.length <= 1) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % cleaned.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [cleaned.length, intervalMs]);

  if (cleaned.length === 0) return null;

  return (
    <span className="rotating-text-wrap" aria-live="polite" aria-atomic="true">
      <span className="rotating-text" key={cleaned[index]}>
        {cleaned[index]}
      </span>
    </span>
  );
}

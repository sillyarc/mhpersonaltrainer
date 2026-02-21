import type { ReactNode } from 'react';
import AiAccessStatus from '@/components/AiAccessStatus';

export default function AcademyAiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ai-route-shell">
      <AiAccessStatus className="ai-route-access" />
      {children}
    </div>
  );
}


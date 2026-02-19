import type { Metadata } from 'next';
import MarketingNav from '@/components/MarketingNav';
import MarketingFooter from '@/components/MarketingFooter';
import { DEFAULT_DESCRIPTION } from '@/lib/seo';

export const metadata: Metadata = {
  description: DEFAULT_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-page">
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}

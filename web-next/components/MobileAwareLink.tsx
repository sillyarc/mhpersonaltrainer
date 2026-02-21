'use client';

import Link from 'next/link';
import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from 'react';

import { isMobileOrTablet } from '@/lib/device';
import { getMobileAppUrl } from '@/lib/mobileApp';

type MobileAwareLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> & {
  href: string;
  mobilePath?: string;
  className?: string;
  children: ReactNode;
};

export default function MobileAwareLink({
  href,
  mobilePath,
  onClick,
  children,
  ...props
}: MobileAwareLinkProps) {
  const mobileHref = mobilePath ? getMobileAppUrl(mobilePath) : '';

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !mobileHref) return;
    if (isMobileOrTablet()) {
      event.preventDefault();
      window.location.href = mobileHref;
    }
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}

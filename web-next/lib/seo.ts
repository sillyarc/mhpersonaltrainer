import type { Metadata } from 'next';

export const SITE_URL = 'https://mhpersonaltrainer.com.br';
export const SITE_NAME = 'MH Personal Trainer';
export const DEFAULT_OG_IMAGE = '/icon-512.png';

export const DEFAULT_DESCRIPTION =
  'Plataforma fitness para alunos, personais e academias com treinos, agenda, avaliacao, chat e recursos com IA.';

const normalizePath = (path: string) => {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

export const absoluteUrl = (path = '/') => {
  const normalizedPath = normalizePath(path);
  return new URL(normalizedPath, SITE_URL).toString();
};

export const buildMarketingMetadata = ({
  title,
  description,
  path,
  keywords = [],
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata => {
  const canonical = absoluteUrl(path);
  return {
    title,
    description,
    keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      locale: 'pt_BR',
      images: [
        {
          url: absoluteUrl(DEFAULT_OG_IMAGE),
          width: 512,
          height: 512,
          alt: 'MH Personal Trainer',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteUrl(DEFAULT_OG_IMAGE)],
    },
  };
};

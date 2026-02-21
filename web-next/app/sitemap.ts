import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

const MARKETING_ROUTES = [
  '/',
  '/academia',
  '/beneficios',
  '/equipe',
  '/privacy',
  '/terms',
  '/account-deletion',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return MARKETING_ROUTES.map((route) => ({
    url: absoluteUrl(route),
    lastModified: now,
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));
}

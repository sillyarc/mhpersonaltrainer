import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/academy/',
          '/app/',
          '/ai/',
          '/chat/',
          '/documents/',
          '/evaluations/',
          '/feedbacks/',
          '/financeiro/',
          '/help/',
          '/mh-agenda-fit/',
          '/notifications/',
          '/personal/',
          '/profile/',
          '/progress/',
          '/schedule/',
          '/settings/',
          '/students/',
          '/support/',
          '/workout/',
          '/workouts/',
          '/login',
          '/login-aluno',
          '/personal-login',
          '/academy-login',
          '/register',
          '/register-aluno',
          '/register-personal',
          '/register-academy',
          '/forgot-password',
          '/invite',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

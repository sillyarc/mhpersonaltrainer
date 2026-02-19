const mobileAppBaseUrl = (process.env.NEXT_PUBLIC_MOBILE_APP_URL || '').trim();

export const getMobileAppUrl = (path: string) => {
  if (!mobileAppBaseUrl) return '';
  const base = mobileAppBaseUrl.endsWith('/') ? mobileAppBaseUrl.slice(0, -1) : mobileAppBaseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

export const hasMobileAppUrl = Boolean(mobileAppBaseUrl);

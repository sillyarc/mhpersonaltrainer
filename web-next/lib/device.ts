export const isMobileOrTablet = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaMatch =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone|Tablet/i.test(ua);
  const widthMatch = window.matchMedia
    ? window.matchMedia('(max-width: 1024px)').matches
    : window.innerWidth <= 1024;
  const touchMatch = window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : 'ontouchstart' in window;
  return uaMatch || (widthMatch && touchMatch);
};

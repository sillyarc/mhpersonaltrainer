import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';

interface ResponsiveInfo {
  width: number;
  height: number;
  deviceType: DeviceType;
  orientation: Orientation;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  columns: number;
  padding: number;
  fontSize: {
    small: number;
    medium: number;
    large: number;
    xlarge: number;
  };
}

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const deviceType: DeviceType = 
      width >= BREAKPOINTS.desktop ? 'desktop' :
      width >= BREAKPOINTS.tablet ? 'tablet' : 'mobile';

    const orientation: Orientation = width > height ? 'landscape' : 'portrait';

    const isMobile = deviceType === 'mobile';
    const isTablet = deviceType === 'tablet';
    const isDesktop = deviceType === 'desktop';

    const columns = isDesktop ? 3 : isTablet ? 2 : 1;
    
    const padding = isDesktop ? 32 : isTablet ? 24 : 16;

    const fontScale = isDesktop ? 1.2 : isTablet ? 1.1 : 1;
    const fontSize = {
      small: 12 * fontScale,
      medium: 14 * fontScale,
      large: 18 * fontScale,
      xlarge: 24 * fontScale,
    };

    return {
      width,
      height,
      deviceType,
      orientation,
      isMobile,
      isTablet,
      isDesktop,
      isPortrait: orientation === 'portrait',
      isLandscape: orientation === 'landscape',
      columns,
      padding,
      fontSize,
    };
  }, [width, height]);
}

export function useBreakpoint() {
  const { deviceType } = useResponsive();

  return {
    isSmall: deviceType === 'mobile',
    isMedium: deviceType === 'tablet',
    isLarge: deviceType === 'desktop',
  };
}

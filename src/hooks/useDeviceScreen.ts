import { useState, useEffect } from 'react';

export type DeviceType = 'phone' | 'foldable' | 'pad' | 'desktop';
export type ScreenState = 
  | 'phone-portrait' 
  | 'phone-landscape' 
  | 'foldable-folded' 
  | 'foldable-unfolded' 
  | 'pad-portrait' 
  | 'pad-landscape' 
  | 'desktop-wide';

export interface DeviceScreenInfo {
  width: number;
  height: number;
  aspectRatio: number;
  deviceType: DeviceType;
  screenState: ScreenState;
  isFoldable: boolean;
  isFolded: boolean;
  isPad: boolean;
  isPhone: boolean;
  isDesktop: boolean;
  isWideScreen: boolean;
  isDualScreenSpanning: boolean;
  orientation: 'portrait' | 'landscape' | 'square';
  isTransitioning: boolean;
}

export function useDeviceScreen(): DeviceScreenInfo {
  const getScreenInfo = (isTransitioning = false): DeviceScreenInfo => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const height = typeof window !== 'undefined' ? window.innerHeight : 768;
    const aspectRatio = height > 0 ? width / height : 1;
    
    // Check Spanning Media Query (Web standard for dual screen / foldables)
    const isSpanningVertical = typeof window !== 'undefined' && window.matchMedia && 
      (window.matchMedia('(spanning: single-fold-vertical)').matches || window.matchMedia('(screen-spanning: single-fold-vertical)').matches);
    const isSpanningHorizontal = typeof window !== 'undefined' && window.matchMedia && 
      (window.matchMedia('(spanning: single-fold-horizontal)').matches || window.matchMedia('(screen-spanning: single-fold-horizontal)').matches);
    const isDualScreenSpanning = isSpanningVertical || isSpanningHorizontal;

    // Check Device Posture API if available in browser
    const posture = typeof navigator !== 'undefined' && (navigator as any).devicePosture ? (navigator as any).devicePosture.type : null;
    const isPostureFolded = posture === 'folded' || posture === 'half-opened';

    // Screen orientation classification
    let orientation: 'portrait' | 'landscape' | 'square' = 'portrait';
    if (aspectRatio > 1.15) {
      orientation = 'landscape';
    } else if (aspectRatio >= 0.85 && aspectRatio <= 1.15) {
      orientation = 'square';
    } else {
      orientation = 'portrait';
    }

    // Determine foldability & screen type purely from viewport & screen metrics
    // Foldables unfolded typically have near 1:1 aspect ratio (0.85 <= ratio <= 1.25) or spanning folds
    // Foldables folded typically have tall narrow aspect ratios (ratio < 0.50 i.e. height/width > 2) or width < 520px
    const isFoldableRatio = (aspectRatio >= 0.82 && aspectRatio <= 1.22 && width >= 540 && width <= 1000) || isDualScreenSpanning || isPostureFolded;
    
    let deviceType: DeviceType = 'desktop';
    let screenState: ScreenState = 'desktop-wide';
    let isFoldable = isFoldableRatio;
    let isFolded = false;

    if (width >= 1280) {
      deviceType = 'desktop';
      screenState = 'desktop-wide';
    } else if (isFoldableRatio) {
      deviceType = 'foldable';
      if (isPostureFolded || (aspectRatio < 0.55 && width < 540)) {
        isFolded = true;
        screenState = 'foldable-folded';
      } else {
        isFolded = false;
        screenState = 'foldable-unfolded';
      }
    } else if (width >= 720 || (width >= 600 && height >= 800)) {
      deviceType = 'pad';
      screenState = orientation === 'landscape' ? 'pad-landscape' : 'pad-portrait';
    } else {
      deviceType = 'phone';
      // Check if it's a folded foldable phone outer display (extremely tall narrow screen e.g. 21:9 or 22:9)
      if (aspectRatio <= 0.48 || (height > 800 && width <= 430)) {
        isFoldable = true;
        isFolded = true;
        screenState = 'foldable-folded';
      } else {
        screenState = orientation === 'landscape' ? 'phone-landscape' : 'phone-portrait';
      }
    }

    const isPad = deviceType === 'pad' || (deviceType === 'foldable' && !isFolded);
    const isPhone = deviceType === 'phone' || (deviceType === 'foldable' && isFolded);
    const isDesktop = deviceType === 'desktop';
    const isWideScreen = width >= 768;

    return {
      width,
      height,
      aspectRatio,
      deviceType,
      screenState,
      isFoldable,
      isFolded,
      isPad,
      isPhone,
      isDesktop,
      isWideScreen,
      isDualScreenSpanning,
      orientation,
      isTransitioning,
    };
  };

  const [screenInfo, setScreenInfo] = useState<DeviceScreenInfo>(() => getScreenInfo(false));

  useEffect(() => {
    let resizeTimer: NodeJS.Timeout | null = null;
    let prevWidth = window.innerWidth;
    let prevHeight = window.innerHeight;

    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;

      // Detect significant layout change (e.g., unfolding/folding screen or rotation)
      const isSignificantChange = 
        Math.abs(currentWidth - prevWidth) > 50 || 
        Math.abs(currentHeight - prevHeight) > 50;

      prevWidth = currentWidth;
      prevHeight = currentHeight;

      if (isSignificantChange) {
        setScreenInfo(getScreenInfo(true));
      } else {
        setScreenInfo(getScreenInfo(false));
      }

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setScreenInfo(getScreenInfo(false));
      }, 400); // 400ms matching HarmonyOS spring duration
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Device Posture listener if available
    if (typeof navigator !== 'undefined' && (navigator as any).devicePosture) {
      (navigator as any).devicePosture.addEventListener?.('change', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (typeof navigator !== 'undefined' && (navigator as any).devicePosture) {
        (navigator as any).devicePosture.removeEventListener?.('change', handleResize);
      }
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  return screenInfo;
}

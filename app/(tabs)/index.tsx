import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
  runOnJS,
} from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Control timeout durations (in milliseconds)
const TIMEOUT_DURATIONS = {
  TO_OFF: 250,        // Short - when going to fully off
  TO_PARTIAL: 1000,    // Long - when going to partial brightness
  TO_FULL: 500,       // Medium - when going to full brightness
};

// Ring light customization settings
const RING_LIGHT_SETTINGS = {
  // Maximum coverage when fully on (as percentage of screen)
  MAX_COVERAGE: {
    VERTICAL: 0.25,    // 25% of screen height from top/bottom (was 0.35)
    HORIZONTAL: 0.20,  // 20% of screen width from left/right (was 0.30)
  },
  
  // Corner rounding settings
  CORNER_RADIUS: {
    SIZE_MULTIPLIER: 0.15,  // Corner size as percentage of screen (was 0.20)
    BORDER_RADIUS: 40,      // Border radius for rounded corners (was 50)
  },
  
  // Feathering/shadow settings
  FEATHERING: {
    INTENSITY: 0.7,         // Shadow opacity (0.0 - 1.0, was 0.9)
    SPREAD: 25,             // Shadow radius/spread (was 40)
    OFFSET: 10,             // Shadow offset distance (was 15)
  },
};

export default function MirrorScreen() {
  const [facing] = useState<CameraType>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [showSlider, setShowSlider] = useState(false);
  
  // Animated values
  const translateX = useSharedValue(0);
  const ringIntensity = useSharedValue(0);
  const sliderOpacity = useSharedValue(0);
  const sliderScale = useSharedValue(0.8);
  
  // Store the current intensity to enable cumulative gestures
  const currentIntensity = useSharedValue(0);
  const previousIntensity = useSharedValue(0);
  
  // Timer ref for hiding slider
  const hideSliderTimer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  const showSliderWithAnimation = () => {
    setShowSlider(true);
    sliderOpacity.value = withTiming(1, { duration: 200 });
    sliderScale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const hideSliderWithAnimation = () => {
    sliderOpacity.value = withTiming(0, { duration: 300 });
    sliderScale.value = withTiming(0.8, { duration: 300 });
    setTimeout(() => setShowSlider(false), 300);
  };

  const getTimeoutDuration = (newIntensity: number, oldIntensity: number) => {
    // Determine the appropriate timeout based on the transition
    if (newIntensity === 0) {
      // Going to off
      return TIMEOUT_DURATIONS.TO_OFF;
    } else if (newIntensity === 1) {
      // Going to full
      return TIMEOUT_DURATIONS.TO_FULL;
    } else {
      // Going to partial
      return TIMEOUT_DURATIONS.TO_PARTIAL;
    }
  };

  const resetHideTimer = (newIntensity?: number) => {
    if (hideSliderTimer.current) {
      clearTimeout(hideSliderTimer.current);
    }
    
    const intensity = newIntensity !== undefined ? newIntensity : currentIntensity.value;
    const timeout = getTimeoutDuration(intensity, previousIntensity.value);
    
    hideSliderTimer.current = setTimeout(() => {
      runOnJS(hideSliderWithAnimation)();
    }, timeout);
  };

  const gestureHandler = useAnimatedGestureHandler({
    onStart: () => {
      // Store the current intensity as the starting point for this gesture
      previousIntensity.value = currentIntensity.value;
      runOnJS(showSliderWithAnimation)();
    },
    onActive: (event) => {
      translateX.value = event.translationX;
      
      // Calculate gesture intensity based on translation
      // Use a wider range to make it easier to control
      const gestureRange = screenWidth * 0.5; // 50% of screen width for full range
      const gestureIntensity = interpolate(
        event.translationX,
        [-gestureRange, 0, gestureRange], // Left swipe negative, right swipe positive
        [-1, 0, 1], // Full range from -1 to 1
        Extrapolate.CLAMP
      );
      
      // Combine previous intensity with current gesture
      // This allows both increasing and decreasing from current position
      const newIntensity = Math.max(0, Math.min(1, previousIntensity.value + gestureIntensity));
      
      ringIntensity.value = newIntensity;
      currentIntensity.value = newIntensity;
    },
    onEnd: (event) => {
      translateX.value = withSpring(0);
      
      // Calculate final intensity based on the gesture
      const gestureRange = screenWidth * 0.5;
      const gestureIntensity = interpolate(
        event.translationX,
        [-gestureRange, 0, gestureRange],
        [-1, 0, 1],
        Extrapolate.CLAMP
      );
      
      let finalIntensity = Math.max(0, Math.min(1, previousIntensity.value + gestureIntensity));
      
      // Snap to off if very low (within 10% of minimum)
      if (finalIntensity < 0.1) {
        finalIntensity = 0;
      }
      
      // Snap to full if very high (within 10% of maximum)
      if (finalIntensity > 0.9) {
        finalIntensity = 1;
      }
      
      ringIntensity.value = withTiming(finalIntensity, { duration: 300 });
      currentIntensity.value = finalIntensity;
      
      runOnJS(resetHideTimer)(finalIntensity);
    },
  });

  // Ring light animated styles with customizable coverage
  const ringLightTopStyle = useAnimatedStyle(() => {
    const height = interpolate(
      ringIntensity.value,
      [0, 1],
      [0, screenHeight * RING_LIGHT_SETTINGS.MAX_COVERAGE.VERTICAL],
      Extrapolate.CLAMP
    );

    return {
      height,
      opacity: ringIntensity.value > 0 ? 1 : 0,
    };
  });

  const ringLightBottomStyle = useAnimatedStyle(() => {
    const height = interpolate(
      ringIntensity.value,
      [0, 1],
      [0, screenHeight * RING_LIGHT_SETTINGS.MAX_COVERAGE.VERTICAL],
      Extrapolate.CLAMP
    );

    return {
      height,
      opacity: ringIntensity.value > 0 ? 1 : 0,
    };
  });

  const ringLightLeftStyle = useAnimatedStyle(() => {
    const width = interpolate(
      ringIntensity.value,
      [0, 1],
      [0, screenWidth * RING_LIGHT_SETTINGS.MAX_COVERAGE.HORIZONTAL],
      Extrapolate.CLAMP
    );

    return {
      width,
      opacity: ringIntensity.value > 0 ? 1 : 0,
    };
  });

  const ringLightRightStyle = useAnimatedStyle(() => {
    const width = interpolate(
      ringIntensity.value,
      [0, 1],
      [0, screenWidth * RING_LIGHT_SETTINGS.MAX_COVERAGE.HORIZONTAL],
      Extrapolate.CLAMP
    );

    return {
      width,
      opacity: ringIntensity.value > 0 ? 1 : 0,
    };
  });

  // Corner pieces with customizable size and rounding
  const cornerStyle = useAnimatedStyle(() => {
    const size = interpolate(
      ringIntensity.value,
      [0, 1],
      [0, Math.min(screenWidth, screenHeight) * RING_LIGHT_SETTINGS.CORNER_RADIUS.SIZE_MULTIPLIER],
      Extrapolate.CLAMP
    );

    return {
      width: size,
      height: size,
      opacity: ringIntensity.value > 0 ? 1 : 0,
    };
  });

  // Slider animated style
  const sliderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sliderOpacity.value,
    transform: [{ scale: sliderScale.value }],
  }));

  // Slider fill animated style
  const sliderFillStyle = useAnimatedStyle(() => {
    const width = interpolate(
      ringIntensity.value,
      [0, 1],
      [0, 200], // 200px is the slider width
      Extrapolate.CLAMP
    );

    return {
      width,
    };
  });

  if (!permission) {
    return <View style={styles.loadingContainer} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera access is required for the mirror to work
        </Text>
      </View>
    );
  }

  // For web platform, provide a simplified version without gestures
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <CameraView 
          style={styles.camera} 
          facing={facing}
        />
        <View style={styles.webNotice}>
          <Text style={styles.webNoticeText}>
            Gesture controls are available on mobile devices
          </Text>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={styles.container}>
          <CameraView 
            style={styles.camera} 
            facing={facing}
          />
          
          {/* Ring Light Overlay with Customizable Rounded Corners */}
          {/* Top edge */}
          <Animated.View style={[styles.ringLightTop, ringLightTopStyle]} />
          
          {/* Bottom edge */}
          <Animated.View style={[styles.ringLightBottom, ringLightBottomStyle]} />
          
          {/* Left edge */}
          <Animated.View style={[styles.ringLightLeft, ringLightLeftStyle]} />
          
          {/* Right edge */}
          <Animated.View style={[styles.ringLightRight, ringLightRightStyle]} />
          
          {/* Corner pieces with customizable rounding */}
          <Animated.View style={[styles.cornerTopLeft, cornerStyle]} />
          <Animated.View style={[styles.cornerTopRight, cornerStyle]} />
          <Animated.View style={[styles.cornerBottomLeft, cornerStyle]} />
          <Animated.View style={[styles.cornerBottomRight, cornerStyle]} />
          
          {/* Slider */}
          {showSlider && (
            <Animated.View style={[styles.sliderContainer, sliderAnimatedStyle]}>
              <View style={styles.sliderTrack}>
                <Animated.View style={[styles.sliderFill, sliderFillStyle]} />
              </View>
              <View style={styles.sliderIcon}>
                <View style={styles.lightBulbIcon} />
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '300',
  },
  webNotice: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  webNoticeText: {
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  // Ring light edge effects with customizable feathering
  ringLightTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: {
      width: 0,
      height: RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD,
    elevation: 25,
    opacity: 0.98,
  },
  ringLightBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: {
      width: 0,
      height: -RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD,
    elevation: 25,
    opacity: 0.98,
  },
  ringLightLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: {
      width: RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
      height: 0,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD,
    elevation: 25,
    opacity: 0.98,
  },
  ringLightRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: {
      width: -RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
      height: 0,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD,
    elevation: 25,
    opacity: 0.98,
  },
  // Corner pieces with customizable rounding
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#ffffff',
    borderBottomRightRadius: RING_LIGHT_SETTINGS.CORNER_RADIUS.BORDER_RADIUS,
    shadowColor: '#ffffff',
    shadowOffset: {
      width: RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
      height: RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD * 0.75, // Slightly less spread for corners
    elevation: 25,
    opacity: 0.98,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: RING_LIGHT_SETTINGS.CORNER_RADIUS.BORDER_RADIUS,
    shadowColor: '#ffffff',
    shadowOffset: {
      width: -RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
      height: RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD * 0.75,
    elevation: 25,
    opacity: 0.98,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
    borderTopRightRadius: RING_LIGHT_SETTINGS.CORNER_RADIUS.BORDER_RADIUS,
    shadowColor: '#ffffff',
    shadowOffset: {
      width: RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
      height: -RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD * 0.75,
    elevation: 25,
    opacity: 0.98,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: RING_LIGHT_SETTINGS.CORNER_RADIUS.BORDER_RADIUS,
    shadowColor: '#ffffff',
    shadowOffset: {
      width: -RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
      height: -RING_LIGHT_SETTINGS.FEATHERING.OFFSET,
    },
    shadowOpacity: RING_LIGHT_SETTINGS.FEATHERING.INTENSITY,
    shadowRadius: RING_LIGHT_SETTINGS.FEATHERING.SPREAD * 0.75,
    elevation: 25,
    opacity: 0.98,
  },
  sliderContainer: {
    position: 'absolute',
    bottom: 120,
    left: '50%',
    marginLeft: -120,
    width: 240,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 30,
    paddingHorizontal: 20,
  },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginRight: 15,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  sliderIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightBulbIcon: {
    width: 16,
    height: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#fff',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
});
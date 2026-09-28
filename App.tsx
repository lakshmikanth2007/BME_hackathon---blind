/**
 * EyeSight root component.
 *
 * The screen is deliberately minimal and never required: the whole surface is
 * a double-tap target that starts listening (the wake-word fallback), and every
 * bit of information is spoken. A long-press in the corner opens the developer
 * debug screen.
 *
 * Camera wiring: this component mounts <Camera> from react-native-vision-camera
 * with frame processors for OCR (ML Kit) and object detection (TFLite), and
 * registers a CameraBridge so the feature controllers can capture photos/video,
 * grab live frames, and read depth rays. Those native frame processors require
 * an Expo dev build; see README. Until then the app runs voice-only and says
 * "camera not ready" where a frame is needed.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AppState,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppController } from '@/app/AppController';
import { makeAppHooks } from '@/app/cameraHooks';
import { DebugScreen } from '@/app/DebugScreen';
import { TIMING } from '@/config/thresholds';
import { checkOnline } from '@/services/connectivity';
import { hasVlmKey } from '@/config/env';

export default function App(): React.JSX.Element {
  const [showDebug, setShowDebug] = useState(false);
  const [listenState, setListenState] = useState('idle');
  const lastTap = useRef(0);

  const app = useMemo(() => {
    const hooks = makeAppHooks(TIMING.VIDEO_MAX_MS);
    const controller = new AppController(hooks);
    // Surface listen-state to the (visual, secondary) UI.
    (controller.voice as unknown as { cb: { onListenState?: (s: string) => void } }).cb.onListenState =
      setListenState;
    return controller;
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility('EyeSight starting.');
    app.greet();
    void (async () => {
      const online = await checkOnline();
      if (!online || !hasVlmKey()) {
        app.voice.answer('No internet, some features are limited.');
      }
    })();

    const sub = AppState.addEventListener('change', (s) => {
      // Pause listening when the app is backgrounded / screen off.
      if (s !== 'active') void app.voice.stopListening();
    });
    return () => {
      sub.remove();
      void app.dispose();
    };
  }, [app]);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      app.onDoubleTap();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  if (showDebug) {
    return (
      <Pressable style={styles.flex} onLongPress={() => setShowDebug(false)}>
        <DebugScreen />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.root}
      onPress={handleTap}
      onLongPress={() => setShowDebug(true)}
      accessibilityRole="button"
      accessibilityLabel="EyeSight. Double tap anywhere to talk."
    >
      <StatusBar style="light" />
      <Text style={styles.brand}>EyeSight</Text>
      <Text style={styles.hint}>Double-tap to talk</Text>
      <Text style={styles.state}>{listenState === 'listening' ? 'Listening…' : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    backgroundColor: '#0a0a12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: 1 },
  hint: { color: '#9aa', fontSize: 20, marginTop: 16 },
  state: { color: '#6cf', fontSize: 22, marginTop: 40, height: 28 },
});

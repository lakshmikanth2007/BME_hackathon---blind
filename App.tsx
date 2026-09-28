/**
 * EyeSight root component.
 *
 * The whole surface is a double-tap target that starts listening (the wake-word
 * fallback), and every bit of information is spoken. A long-press in the corner
 * opens the developer debug screen.
 *
 * The camera (react-native-vision-camera) is mounted full-screen and kept
 * active so photo capture and live frame grabs work. It registers a
 * CameraBridge so the feature controllers can take photos and grab frames.
 * On-device ML frame processors (OCR, object detection, depth) still need the
 * worklets-core native module; without it those specific features degrade, but
 * "describe this", live mode and navigation reasoning work via the cloud model.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  AppState,
  AccessibilityInfo,
  PermissionsAndroid,
  Platform,
  View,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Camera,
  useCameraDevice,
} from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';
import { AppController } from '@/app/AppController';
import { makeAppHooks, registerCamera } from '@/app/cameraHooks';
import { DebugScreen } from '@/app/DebugScreen';
import { TIMING } from '@/config/thresholds';
import { debugLog } from '@/state/debugLog';

export default function App(): React.JSX.Element {
  const [showDebug, setShowDebug] = useState(false);
  const [listenState, setListenState] = useState('idle');
  const [ready, setReady] = useState(false);
  const lastTap = useRef(0);
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');

  const app = useMemo(() => {
    const hooks = makeAppHooks(TIMING.VIDEO_MAX_MS);
    const controller = new AppController(hooks);
    (controller.voice as unknown as { cb: { onListenState?: (s: string) => void } }).cb.onListenState =
      setListenState;
    return controller;
  }, []);

  // Register the real camera bridge so features can capture photos/frames.
  useEffect(() => {
    async function readBase64(path: string): Promise<string> {
      const uri = path.startsWith('file://') ? path : `file://${path}`;
      return FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    async function takePhoto() {
      if (!cameraRef.current) return null;
      try {
        const photo = await cameraRef.current.takePhoto({
          qualityPrioritization: 'speed',
          enableShutterSound: false,
        });
        const base64 = await readBase64(photo.path);
        return { imagesBase64: [base64] };
      } catch (e) {
        debugLog('camera', `takePhoto failed: ${String(e)}`, 'error');
        return null;
      }
    }

    registerCamera({
      takePhoto,
      // Simple video fallback: capture one representative frame.
      recordVideo: async () => takePhoto(),
      grabFrame: async () => {
        const media = await takePhoto();
        if (!media) return null;
        const base64 = media.imagesBase64[0];
        return { base64, hash: '' };
      },
      depthRays: () => [],
    });
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility('EyeSight starting.');
    void (async () => {
      // Camera + microphone permissions, requested up front.
      let camStatus = 'not-determined';
      try {
        camStatus = await Camera.requestCameraPermission();
        await Camera.requestMicrophonePermission();
      } catch {
        /* ignore */
      }
      if (Platform.OS === 'android') {
        try {
          const res = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            PermissionsAndroid.PERMISSIONS.CAMERA,
          ]);
          if (
            res[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted'
          ) {
            camStatus = 'granted';
          }
        } catch {
          /* ignore */
        }
      }
      setReady(true);
      app.greet();

      // If the camera was previously denied (Android won't re-prompt), guide
      // the user and open the system settings page so they can enable it.
      if (camStatus !== 'granted') {
        app.voice.answer(
          'Camera access is turned off. I am opening settings. Please enable the camera permission for EyeSight, then come back.'
        );
        setTimeout(() => {
          Linking.openSettings().catch(() => {});
        }, 3500);
      }
    })();

    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void app.voice.stopListening();
    });
    return () => {
      sub.remove();
      void app.dispose();
    };
  }, [app]);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 400) {
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
    <View style={styles.root}>
      <StatusBar style="light" />
      {device && ready ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
        />
      ) : null}
      {/* Full-screen touch layer over the camera preview. */}
      <Pressable
        style={styles.overlay}
        onPress={handleTap}
        onLongPress={() => setShowDebug(true)}
        accessibilityRole="button"
        accessibilityLabel="EyeSight. Double tap anywhere to talk."
      >
        <Text style={styles.brand}>EyeSight</Text>
        <Text style={styles.hint}>Double-tap to talk</Text>
        <Text style={styles.state}>
          {listenState === 'listening' ? 'Listening…' : ''}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: '#0a0a12' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,18,0.45)',
  },
  brand: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: 1 },
  hint: { color: '#cdd', fontSize: 20, marginTop: 16 },
  state: { color: '#6cf', fontSize: 22, marginTop: 40, height: 28 },
});

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera'; // <--- NEW
import { Mic, Square, Volume2, Eye, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { globalStyles, theme } from '../src/styles';
import WebSocketService from '../src/services/websocket';

export default function Page() {
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions(); // <--- NEW
  
  const [status, setStatus] = useState<string>('idle'); 
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false); // <--- NEW
  const cameraRef = useRef<CameraView>(null); // <--- NEW
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
        await requestPermission();
        await requestCameraPermission(); // Ask for Camera
        
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
    })();

    WebSocketService.connect();

    WebSocketService.onReceiveAudio = async (base64Data: string) => {
        console.log("🔊 Received Audio Payload");
        setStatus('speaking');
        setIsCameraOpen(false); // Close camera when she speaks

        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                playThroughEarpieceAndroid: false,
            });

            const { sound } = await Audio.Sound.createAsync(
                { uri: `data:audio/mp3;base64,${base64Data}` },
                { shouldPlay: true } 
            );

            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    setStatus('idle');
                    sound.unloadAsync();
                }
            });

        } catch (error) {
            console.error("❌ Error playing audio:", error);
            setStatus('idle');
        }
    };
  }, []);

  async function startRecording() {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setStatus('recording');
    } catch (err) { console.error("Failed to start recording", err); }
  }

  async function stopRecording() {
    setStatus('processing');
    startPulse();
    
    if (recording) {
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI(); 
            setRecording(null);

            if (uri) {
                const base64String = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                WebSocketService.sendAudioChunk(base64String);
            }
        } catch (error) {
            setStatus('idle');
            stopPulse();
        }
    }
  }

  // --- NEW: CAMERA LOGIC ---
  async function takePicture() {
    if (cameraRef.current) {
        setStatus('processing');
        startPulse();
        console.log("📸 Snapping photo...");
        
        try {
            const photo = await cameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.5, // Low quality for speed
            });

            if (photo && photo.base64) {
                console.log("📤 Sending Image to Brain...");
                // Send specific Image message type
                WebSocketService.socket?.send(JSON.stringify({
                    type: 'image_input',
                    data: photo.base64
                }));
            }
        } catch (e) {
            console.error(e);
            setStatus('idle');
        }
    }
  }

  // ... (Animations Logic stays same) ...
  const startPulse = () => {
    Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
    ])).start();
  };
  const stopPulse = () => pulseAnim.setValue(1);
  const getButtonColor = () => {
      if (status === 'recording') return theme.colors.red;
      if (status === 'processing') return theme.colors.amber;
      if (status === 'speaking') return theme.colors.green;
      return theme.colors.blue;
  };
  const getStatusText = () => {
      if (isCameraOpen) return "Show me something...";
      if (status === 'speaking') return "Myra is speaking...";
      if (status === 'processing') return "Myra is thinking...";
      return "Tap to talk";
  };

  return (
    <View style={globalStyles.container}>
      {/* HEADER: Avatar OR Camera */}
      <View style={globalStyles.header}>
        {isCameraOpen ? (
             <View style={styles.cameraContainer}>
                 <CameraView style={styles.camera} ref={cameraRef} facing="back" />
                 <TouchableOpacity style={styles.closeCam} onPress={() => setIsCameraOpen(false)}>
                     <X color="#FFF" size={30} />
                 </TouchableOpacity>
             </View>
        ) : (
            <Image 
            source={require('../logo-elderkeep.png')} 
            style={globalStyles.avatar} 
            />
        )}
      </View>

      <View style={globalStyles.statusContainer}>
        <Text style={globalStyles.statusText}>{getStatusText()}</Text>
      </View>

      <View style={globalStyles.footer}>
        {/* MAIN BUTTON */}
        <TouchableOpacity 
          onPress={isCameraOpen ? takePicture : (status === 'recording' ? stopRecording : startRecording)}
          disabled={status === 'processing' || status === 'speaking'}
        >
          <Animated.View style={[
            globalStyles.bigButton, 
            { backgroundColor: getButtonColor(), transform: [{ scale: status === 'processing' ? pulseAnim : 1 }] }
          ]}>
            {isCameraOpen ? <Eye color="#FFF" size={60} /> :
             status === 'recording' ? <Square color="#FFF" size={60} fill="#FFF" /> : 
             status === 'speaking' ? <Volume2 color="#FFF" size={60} /> :
             status === 'processing' ? <ActivityIndicator size="large" color="#FFF" /> :
             <Mic color="#FFF" size={60} />}
          </Animated.View>
        </TouchableOpacity>
        
        {/* SECONDARY BUTTON: Toggle Camera */}
        {!isCameraOpen && status === 'idle' && (
            <TouchableOpacity style={styles.smallButton} onPress={() => setIsCameraOpen(true)}>
                <Eye color="#636E72" size={24} />
                <Text style={styles.smallButtonText}>Show Myra something</Text>
            </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
    cameraContainer: {
        width: 300,
        height: 300,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
    },
    camera: {
        flex: 1,
    },
    closeCam: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 5,
        borderRadius: 20,
    },
    smallButton: {
        marginTop: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E1E8ED',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 30,
    },
    smallButtonText: {
        marginLeft: 10,
        fontSize: 16,
        color: '#636E72',
        fontWeight: '600'
    }
});
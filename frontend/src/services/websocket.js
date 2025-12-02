// Replace with your Laptop's IP Address (Keep port 8000)
// Example: 'ws://192.168.1.45:8000/ws/chat'
const WS_URL = 'ws://192.168.236.137:8000/ws/chat';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.onReceiveAudio = null; // Callback function for when audio arrives
  }

  connect() {
    this.socket = new WebSocket(WS_URL);

    this.socket.onopen = () => {
      console.log('✅ WebSocket Connected to Brain');
    };

    this.socket.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        
        // If backend sends audio, trigger the callback
        if (message.type === 'audio' && this.onReceiveAudio) {
          this.onReceiveAudio(message.data); // data is base64 string
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    this.socket.onclose = () => {
      console.log('⚠️ WebSocket Disconnected. Reconnecting...');
      setTimeout(() => this.connect(), 3000); // Auto-reconnect after 3s
    };

    this.socket.onerror = (e) => {
      console.log('WebSocket Error:', e.message);
    };
  }

  // Send the recorded audio (Base64 string) to the backend
  sendAudioChunk(base64Audio) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'audio_input',
        data: base64Audio
      }));
    } else {
      console.warn('Cannot send audio: WebSocket not open');
    }
  }
}

// Export a single instance (Singleton)
export default new WebSocketService();
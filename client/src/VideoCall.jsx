// client/src/VideoCall.jsx
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Repeat, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

// Replace with your signaling server URL
const SIGNALING_SERVER_URL = 'http://localhost:5000'; // or your deployed server

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  // Add TURN servers here if available in production
];

export default function VideoCall({ roomID, onLeave }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);

  const [isCaller, setIsCaller] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const localStreamRef = useRef(null);

  // Local audio/video enabled states
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
  // Peer audio/video enabled states (default true until notified)
  const [peerAudioEnabled, setPeerAudioEnabled] = useState(true);
  const [peerVideoEnabled, setPeerVideoEnabled] = useState(true);

  useEffect(() => {
    const socket = io(SIGNALING_SERVER_URL);
    socketRef.current = socket;

    // 1. Get media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setStatus('Local media ready');
        socket.emit('join', roomID);
      })
      .catch((err) => {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera/microphone: ' + err.message);
      });

    // Signaling handlers
    socket.on('created', () => {
      console.log('Created room', roomID);
      setIsCaller(true);
      setStatus('Waiting for peer to join...');
    });
    socket.on('joined', () => {
      console.log('Joined room', roomID);
      setIsCaller(false);
      setStatus('Joined room, waiting for signaling...');
    });
    socket.on('full', () => {
      alert('Room is full. Cannot join.');
      cleanupAndLeave();
    });
    socket.on('ready', () => {
      console.log('Both peers present, start WebRTC');
      setStatus('Establishing connection...');
      createPeerConnection(isCaller);
    });
    socket.on('offer', async (offer) => {
      console.log('Received offer');
      if (!pcRef.current) {
        createPeerConnection(false);
      }
      try {
        await pcRef.current.setRemoteDescription(offer);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit('answer', { answer, roomID });
        console.log('Sent answer');
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });
    socket.on('answer', async (answer) => {
      console.log('Received answer');
      try {
        await pcRef.current.setRemoteDescription(answer);
      } catch (err) {
        console.error('Error setting remote description from answer:', err);
      }
    });
    socket.on('ice-candidate', async (candidate) => {
      if (candidate && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(candidate);
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });
    socket.on('peer-left', () => {
      console.log('Peer left');
      setPeerConnected(false);
      setStatus('Peer disconnected. Waiting for someone to join...');
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      setPeerAudioEnabled(true);
      setPeerVideoEnabled(true);
    });
    socket.on('toggle-audio', (enabled) => {
      console.log('Peer audio toggled:', enabled);
      setPeerAudioEnabled(enabled);
    });
    socket.on('toggle-video', (enabled) => {
      console.log('Peer video toggled:', enabled);
      setPeerVideoEnabled(enabled);
    });
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => {
      cleanupAndLeave();
    };
  }, [roomID]);

  const cleanupAndLeave = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave', roomID);
      socketRef.current.disconnect();
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    onLeave();
  };

  const createPeerConnection = (isOfferer) => {
    console.log('Creating RTCPeerConnection, isOfferer:', isOfferer);
    setStatus('Creating peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      console.log('Remote track received');
      setPeerConnected(true);
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setStatus('Connected');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    if (isOfferer) {
      pc.onnegotiationneeded = async () => {
        console.log('Starting negotiation (offer)...');
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current.emit('offer', { offer: pc.localDescription, roomID });
          console.log('Offer sent');
        } catch (err) {
          console.error('Error during negotiation (offer):', err);
        }
      };
    }
  };

  const handleToggleAudio = () => {
    if (!localStreamRef.current) return;
    const newEnabled = !localAudioEnabled;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = newEnabled;
    });
    setLocalAudioEnabled(newEnabled);
    if (socketRef.current) {
      socketRef.current.emit('toggle-audio', { enabled: newEnabled, roomID });
    }
  };

  const handleToggleVideo = () => {
    if (!localStreamRef.current) return;
    const newEnabled = !localVideoEnabled;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = newEnabled;
    });
    setLocalVideoEnabled(newEnabled);
    if (socketRef.current) {
      socketRef.current.emit('toggle-video', { enabled: newEnabled, roomID });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex-grow relative">
        {/* Main video (User 01 - Remote) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-black"
        />
        {/* Overlay video (User 02 - Local) */}
        <div className="absolute bottom-4 right-4 w-32 h-32 bg-black rounded overflow-hidden">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
        {/* Navigation buttons */}
        <div className="absolute bottom-4 left-4 flex space-x-2">
          <button
            onClick={handleToggleAudio}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title={localAudioEnabled ? "Mute audio" : "Unmute audio"}
          >
            {localAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={handleToggleVideo}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title={localVideoEnabled ? "Turn video off" : "Turn video on"}
          >
            {localVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button
            onClick={cleanupAndLeave}
            className="p-2 bg-red-600 rounded hover:bg-red-500 transition"
            title="Leave call"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
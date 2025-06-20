// client/src/VideoCall.jsx
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

// Replace with your signaling server URL
const SIGNALING_SERVER_URL = 'http://localhost:5000'; // or your deployed server

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  // Add TURN servers if available in production
];

export default function VideoCall({ roomID, onLeave }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);

  const [isCaller, setIsCaller] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(false);
  const [localAudioEnabled, setLocalAudioEnabled] = useState(false);
  const [peerVideoEnabled, setPeerVideoEnabled] = useState(false);

  useEffect(() => {
    const socket = io(SIGNALING_SERVER_URL);
    socketRef.current = socket;

    socket.emit('join', roomID);

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
      console.log('Both peers present, starting WebRTC');
      setStatus('Establishing connection...');
      createPeerConnection();
    });
    socket.on('offer', async (offer) => {
      console.log('Received offer');
      if (!pcRef.current) createPeerConnection();
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
        console.error('Error setting remote description:', err);
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
      setRemoteStream(null);
      setPeerVideoEnabled(false);
    });
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => cleanupAndLeave();
  }, [roomID]);

  const cleanupAndLeave = () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (socketRef.current) {
      socketRef.current.emit('leave', roomID);
      socketRef.current.disconnect();
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    onLeave();
  };

  const createPeerConnection = () => {
    console.log('Creating RTCPeerConnection');
    setStatus('Creating peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      console.log('Remote track received');
      const [stream] = event.streams;
      setRemoteStream(stream);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setPeerConnected(true);
      setPeerVideoEnabled(stream.getVideoTracks().length > 0);
      setStatus('Connected');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected') {
        setPeerConnected(false);
        setRemoteStream(null);
        setPeerVideoEnabled(false);
      }
    };

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
  };

  const renegotiate = async () => {
    if (!pcRef.current) return;
    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      socketRef.current.emit('offer', { offer: pcRef.current.localDescription, roomID });
      console.log('Renegotiation offer sent');
    } catch (err) {
      console.error('Error during renegotiation:', err);
    }
  };

  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setLocalVideoEnabled(true);
      setLocalAudioEnabled(true);
      if (pcRef.current) {
        stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
        await renegotiate();
      }
    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert('Could not access camera or microphone. Please check permissions.');
    }
  };

  const toggleVideo = async () => {
    if (!localStream) {
      await startMedia();
    } else {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setLocalVideoEnabled(videoTrack.enabled);
      if (pcRef.current) await renegotiate();
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setLocalAudioEnabled(audioTrack.enabled);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex-grow relative">
        {/* Remote Video */}
        <div className="relative w-full h-full">
          {peerConnected && remoteStream && peerVideoEnabled ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-teal-800">
              <p className="text-white text-lg">User 2 camera is off or not connected</p>
            </div>
          )}
        </div>
        {/* Local Video */}
        <div className="absolute bottom-4 right-4 w-32 h-32 bg-purple-800 rounded overflow-hidden">
          {localStream && localVideoEnabled ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-white text-sm">User 1 camera is off</p>
            </div>
          )}
        </div>
        {/* Controls */}
        <div className="absolute bottom-4 left-4 flex space-x-2">
          <button
            onClick={toggleAudio}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title={localAudioEnabled ? 'Mute audio' : 'Unmute audio'}
          >
            {localAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleVideo}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title={localVideoEnabled ? 'Turn video off' : 'Turn video on'}
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
        {/* Status */}
        <div className="absolute top-4 left-4 text-sm">{status}</div>
      </div>
    </div>
  );
}
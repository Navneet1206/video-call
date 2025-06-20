// src/VideoCall.jsx
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Repeat, PhoneOff } from 'lucide-react';

// Replace with your signaling server URL
const SIGNALING_SERVER_URL = 'http://localhost:5000'; // or your deployed server

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  // you can add TURN servers here if you have any
];

export default function VideoCall({ roomID, onLeave }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);

  const [isCaller, setIsCaller] = useState(false);
  const [joined, setJoined] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [mainIsLocal, setMainIsLocal] = useState(true);
  const [status, setStatus] = useState('Initializing...');

  // Tracks local stream
  const localStreamRef = useRef(null);

  useEffect(() => {
    // 1. Connect to signaling server
    const socket = io(SIGNALING_SERVER_URL);
    socketRef.current = socket;

    // 2. Get media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setStatus('Obtained local media');
        // 3. Join room
        socket.emit('join', roomID);
      })
      .catch((err) => {
        console.error('Error accessing media devices.', err);
        alert('Could not access camera/microphone: ' + err.message);
      });

    // Socket event handlers
    socket.on('created', () => {
      console.log('Created room', roomID);
      setIsCaller(true);
      setStatus('Waiting for peer to join...');
    });

    socket.on('joined', () => {
      console.log('Joined room', roomID);
      setIsCaller(false);
      setStatus('Joined room, signaling...');
    });

    socket.on('full', () => {
      alert('Room is full. Cannot join.');
      cleanupAndLeave();
    });

    socket.on('ready', () => {
      console.log('Both peers are present, ready to start WebRTC');
      setJoined(true);
      if (isCaller) {
        createPeerConnection(true);
      }
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
        console.error('Error handling offer: ', err);
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
      // candidate may be null?
      if (candidate && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(candidate);
          console.log('Added ICE candidate');
        } catch (err) {
          console.error('Error adding received ICE candidate', err);
        }
      }
    });

    socket.on('peer-left', () => {
      console.log('Peer left');
      setPeerConnected(false);
      setStatus('Peer disconnected. Waiting for someone to join...');
      // Close existing peer connection:
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      // remote video clear:
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      // If someone joins later, signaling 'ready' will fire and new negotiation can occur.
    });

    // Cleanup on unmount
    return () => {
      cleanupAndLeave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupAndLeave = () => {
    // Inform peer
    if (socketRef.current) {
      socketRef.current.emit('leave', roomID);
      socketRef.current.disconnect();
    }
    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    // Stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    // Go back
    onLeave();
  };

  const createPeerConnection = (isOfferer) => {
    console.log('Creating RTCPeerConnection, isOfferer:', isOfferer);
    setStatus('Creating peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // On track from remote
    pc.ontrack = (event) => {
      console.log('Remote track received');
      setPeerConnected(true);
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setStatus('Connected');
    };

    // On ICE candidate
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        // treat as peer left
        // we rely on 'peer-left' from socket.io as well
      }
    };

    if (isOfferer) {
      // Create offer
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

  const handleToggleMain = () => {
    setMainIsLocal((prev) => !prev);
  };

  // Render
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex-grow relative flex items-center justify-center">
        {/* Main video */}
        <div className={`bg-black flex items-center justify-center overflow-hidden
            ${mainIsLocal ? '' : 'hidden md:block'}
            md:flex-grow md:mr-0
            w-full h-full`}>
          <video
            ref={mainIsLocal ? localVideoRef : remoteVideoRef}
            autoPlay
            playsInline
            muted={mainIsLocal} // mute local to avoid echo
            className="w-full h-full object-cover"
          />
          {/* If remote not yet connected */}
          {!mainIsLocal && !peerConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <p>Waiting for peer...</p>
            </div>
          )}
        </div>
        {/* Secondary video */}
        <div className={`absolute bottom-20 right-4 bg-black border border-gray-700 rounded overflow-hidden
            ${mainIsLocal ? '' : 'hidden md:block'}
          `}
          style={{ width: '150px', height: '150px' }}
        >
          <video
            ref={mainIsLocal ? remoteVideoRef : localVideoRef}
            autoPlay
            playsInline
            muted={mainIsLocal ? false : true}
            className="w-full h-full object-cover"
          />
          {/* If remote not yet */}
          {mainIsLocal && !peerConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <p>Waiting...</p>
            </div>
          )}
        </div>

        {/* On small screens: stack below */}
        <div className="md:hidden flex flex-col items-center mt-4 space-y-4">
          {/* Show both videos stacked */}
          <div className="w-11/12 bg-black rounded overflow-hidden">
            <video
              ref={ mainIsLocal ? localVideoRef : remoteVideoRef }
              autoPlay
              playsInline
              muted={ mainIsLocal }
              className="w-full h-60 object-cover"
            />
            {!mainIsLocal && !peerConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <p>Waiting for peer...</p>
              </div>
            )}
          </div>
          <div className="w-11/12 bg-black rounded overflow-hidden">
            <video
              ref={ mainIsLocal ? remoteVideoRef : localVideoRef }
              autoPlay
              playsInline
              muted={ mainIsLocal ? false : true }
              className="w-full h-60 object-cover"
            />
            {mainIsLocal && !peerConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <p>Waiting...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar: status, toggle button, leave */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div className="text-sm">{status}</div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleToggleMain}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title="Toggle main/secondary"
          >
            <Repeat className="w-5 h-5" />
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

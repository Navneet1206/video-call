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
  const [mainIsLocal, setMainIsLocal] = useState(true);
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
        // Attach to local video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setStatus('Local media ready');
        // 2. Join room
        socket.emit('join', roomID);
      })
      .catch((err) => {
        console.error('Error accessing media devices.', err);
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
          // console.log('Added ICE candidate');
        } catch (err) {
          console.error('Error adding received ICE candidate:', err);
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
      // Clear remote video
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      // Reset peer audio/video flags
      setPeerAudioEnabled(true);
      setPeerVideoEnabled(true);
      // When a new peer joins, server will emit 'ready' again and negotiation restarts
    });

    // Handle peer toggle events
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
    onLeave();
  };

  const createPeerConnection = (isOfferer) => {
    console.log('Creating RTCPeerConnection, isOfferer:', isOfferer);
    setStatus('Creating peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // When remote track arrives
    pc.ontrack = (event) => {
      console.log('Remote track received');
      setPeerConnected(true);
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setStatus('Connected');
    };

    // ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        // We rely on 'peer-left' event from signaling server to fully clean up
      }
    };

    if (isOfferer) {
      // Create offer when negotiation is needed
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

  // Toggle main/secondary view
  const handleToggleMain = () => {
    setMainIsLocal((prev) => !prev);
  };

  // Mute/unmute audio
  const handleToggleAudio = () => {
    if (!localStreamRef.current) return;
    const newEnabled = !localAudioEnabled;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = newEnabled;
    });
    setLocalAudioEnabled(newEnabled);
    // Notify peer
    if (socketRef.current) {
      socketRef.current.emit('toggle-audio', { enabled: newEnabled, roomID });
    }
  };

  // Video on/off
  const handleToggleVideo = () => {
    if (!localStreamRef.current) return;
    const newEnabled = !localVideoEnabled;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = newEnabled;
    });
    setLocalVideoEnabled(newEnabled);
    // Notify peer
    if (socketRef.current) {
      socketRef.current.emit('toggle-video', { enabled: newEnabled, roomID });
    }
  };

  // Render a placeholder when remote video is off or not yet available
  const renderRemoteVideoOrPlaceholder = () => {
    // If peer not connected yet: show waiting overlay
    if (!peerConnected) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <p className="text-white">Waiting for peer...</p>
        </div>
      );
    }
    // Peer connected:
    if (!peerVideoEnabled) {
      // Show placeholder with camera-off icon
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
          <VideoOff className="w-12 h-12 text-white mb-2" />
          <p className="text-white">Camera Off</p>
        </div>
      );
    }
    // Otherwise no overlay, actual video element is showing
    return null;
  };

  // Render a mic-off indicator overlay on remote if peer muted audio
  const renderRemoteMicIndicator = () => {
    if (peerConnected && !peerAudioEnabled) {
      // show a small mic-off icon at bottom-left
      return (
        <div className="absolute bottom-1 left-1 bg-gray-800 bg-opacity-60 p-1 rounded-full">
          <MicOff className="w-4 h-4 text-white" />
        </div>
      );
    }
    return null;
  };

  // Similarly, overlay on local video when you mute yourself
  const renderLocalMicIndicator = () => {
    if (!localAudioEnabled) {
      return (
        <div className="absolute bottom-1 left-1 bg-gray-800 bg-opacity-60 p-1 rounded-full">
          <MicOff className="w-4 h-4 text-white" />
        </div>
      );
    }
    return null;
  };

  // Overlay on local when video off? We can hide local video if disabled, and show placeholder
  const renderLocalVideoOrPlaceholder = () => {
    if (!peerConnected) {
      // Always show local video even if peer not connected, but overlay waiting
      return (
        <>
          <video
            ref={mainIsLocal ? localVideoRef : remoteVideoRef}
            autoPlay
            playsInline
            muted={mainIsLocal}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <p className="text-white">Waiting for peer...</p>
          </div>
          {renderLocalMicIndicator()}
        </>
      );
    }
    // Peer connected
    if (!localVideoEnabled && mainIsLocal) {
      // Show placeholder instead of your video in main view
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
          <VideoOff className="w-12 h-12 text-white mb-2" />
          <p className="text-white">Camera Off</p>
          {renderLocalMicIndicator()}
        </div>
      );
    }
    // Otherwise show your video normally
    return (
      <>
        <video
          ref={mainIsLocal ? localVideoRef : remoteVideoRef}
          autoPlay
          playsInline
          muted={mainIsLocal}
          className="w-full h-full object-cover"
        />
        { mainIsLocal && renderLocalMicIndicator() }
      </>
    );
  };

  // NOTE: Because our code structure uses same ref for video element based on mainIsLocal,
  // we handle overlay logic within the JSX below.

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex-grow relative flex items-center justify-center">
        {/* Main video container (md+ and small) */}
        <div
          className={`bg-black flex items-center justify-center overflow-hidden relative
            md:flex-grow w-full h-full`}
        >
          {/* Decide which video to show in main: local or remote */}
          {mainIsLocal ? (
            // Local in main
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!localVideoEnabled ? 'hidden' : ''}`}
              />
              { /* Overlay placeholder if local video off */ }
              {peerConnected && !localVideoEnabled && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
                  <VideoOff className="w-12 h-12 text-white mb-2" />
                  <p className="text-white">Camera Off</p>
                </div>
              )}
              { /* Waiting overlay until peer connects */ }
              {!peerConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <p className="text-white">Waiting for peer...</p>
                </div>
              )}
              { renderLocalMicIndicator() }
            </>
          ) : (
            // Remote in main
            <>
              {/* If remote video enabled, show video element; else hide it */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={false}
                className={`w-full h-full object-cover ${!peerVideoEnabled ? 'hidden' : ''}`}
              />
              {renderRemoteVideoOrPlaceholder()}
              {renderRemoteMicIndicator()}
            </>
          )}
        </div>

        {/* Secondary video overlay on md+ */}
        <div
          className={`hidden md:block absolute bottom-20 right-4 bg-black border border-gray-700 rounded overflow-hidden`}
          style={{ width: '150px', height: '150px' }}
        >
          {mainIsLocal ? (
            // Secondary is remote
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={false}
                className={`w-full h-full object-cover ${!peerVideoEnabled ? 'hidden' : ''}`}
              />
              {renderRemoteVideoOrPlaceholder()}
              {renderRemoteMicIndicator()}
            </>
          ) : (
            // Secondary is local
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!localVideoEnabled ? 'hidden' : ''}`}
              />
              {peerConnected && !localVideoEnabled && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
                  <VideoOff className="w-12 h-12 text-white mb-2" />
                  <p className="text-white">Camera Off</p>
                </div>
              )}
              {!peerConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <p className="text-white">Waiting for peer...</p>
                </div>
              )}
              {renderLocalMicIndicator()}
            </>
          )}
        </div>

        {/* On small screens: stack both videos */}
        <div className="md:hidden flex flex-col items-center mt-4 space-y-4 w-full px-4">
          {/* Top box */}
          <div className="w-full bg-black rounded overflow-hidden relative h-60">
            {mainIsLocal ? (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!localVideoEnabled ? 'hidden' : ''}`}
                />
                {peerConnected && !localVideoEnabled && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
                    <VideoOff className="w-12 h-12 text-white mb-2" />
                    <p className="text-white">Camera Off</p>
                  </div>
                )}
                {!peerConnected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <p className="text-white">Waiting for peer...</p>
                  </div>
                )}
                {renderLocalMicIndicator()}
              </>
            ) : (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  className={`w-full h-full object-cover ${!peerVideoEnabled ? 'hidden' : ''}`}
                />
                {renderRemoteVideoOrPlaceholder()}
                {renderRemoteMicIndicator()}
              </>
            )}
          </div>
          {/* Bottom box */}
          <div className="w-full bg-black rounded overflow-hidden relative h-60">
            {mainIsLocal ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  className={`w-full h-full object-cover ${!peerVideoEnabled ? 'hidden' : ''}`}
                />
                {renderRemoteVideoOrPlaceholder()}
                {renderRemoteMicIndicator()}
              </>
            ) : (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!localVideoEnabled ? 'hidden' : ''}`}
                />
                {peerConnected && !localVideoEnabled && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
                    <VideoOff className="w-12 h-12 text-white mb-2" />
                    <p className="text-white">Camera Off</p>
                  </div>
                )}
                {!peerConnected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <p className="text-white">Waiting for peer...</p>
                  </div>
                )}
                {renderLocalMicIndicator()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar: status, toggle-main, mute/unmute, video on/off, leave */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div className="text-sm break-words">{status}</div>
        <div className="flex items-center space-x-3">
          {/* Toggle main/secondary */}
          <button
            onClick={handleToggleMain}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title="Toggle main/secondary"
          >
            <Repeat className="w-5 h-5 text-white" />
          </button>
          {/* Mute/unmute audio */}
          <button
            onClick={handleToggleAudio}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title={localAudioEnabled ? "Mute audio" : "Unmute audio"}
          >
            {localAudioEnabled
              ? <Mic className="w-5 h-5 text-white" />
              : <MicOff className="w-5 h-5 text-white" />
            }
          </button>
          {/* Video on/off */}
          <button
            onClick={handleToggleVideo}
            className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition"
            title={localVideoEnabled ? "Turn video off" : "Turn video on"}
          >
            {localVideoEnabled
              ? <Video className="w-5 h-5 text-white" />
              : <VideoOff className="w-5 h-5 text-white" />
            }
          </button>
          {/* Leave call */}
          <button
            onClick={cleanupAndLeave}
            className="p-2 bg-red-600 rounded hover:bg-red-500 transition"
            title="Leave call"
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

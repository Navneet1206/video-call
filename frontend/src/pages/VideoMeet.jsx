import React, { useState, useRef, useEffect } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Monitor, 
  MessageSquare, 
  Send,
  Settings,
  MoreVertical,
  Users,
  Copy,
  Phone
} from 'lucide-react';

// >>> Import socket.io-client here <<<
import { io } from 'socket.io-client';

const VideoCallApp = () => {
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isInCall, setIsInCall] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);

  // Replace with your backend URL if different:
  const SOCKET_SERVER_URL = 'http://localhost:8000';

  // Initialize WebSocket connection once when component mounts
  useEffect(() => {
    // Do not connect immediately if you prefer to wait until joinCall.
    // But here we connect on mount so we can listen to room-full etc.
    socketRef.current = io(SOCKET_SERVER_URL);

    // Handle events before join
    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current.id);
    });

    socketRef.current.on('room-full', () => {
      alert('Room is full. Only 2 participants allowed.');
      // Optionally you can reset state or navigate away
      // leaveCall or similar
    });

    // When someone joins the same room
    socketRef.current.on('user-joined', (socketId, users) => {
      console.log('User joined:', socketId, users);
      // If more than 2, backend should already emit room-full and reject join
      setParticipants(users);

      // If exactly 2 and we are already in call flow, create peer connection
      if (users.length === 2) {
        // If we haven't set up peer connection yet, do so
        if (!peerConnectionRef.current) {
          createPeerConnection(users);
        } else {
          // If peerConnection exists (e.g. rejoin), you might renegotiate
          // But in most flows, we only create once
        }
      }
    });

    socketRef.current.on('user-left', (socketId) => {
      console.log('User left:', socketId);
      setParticipants(prev => prev.filter(id => id !== socketId));
      // Clean up remote video
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      // Close and clear peerConnection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      // Keep localMedia if you want to let user wait for new peer
    });

    // Signaling handler
    socketRef.current.on('signal', (fromId, message) => {
      console.log('Received signal from', fromId, message);
      handleSignal(fromId, message);
    });

    // Chat messages
    socketRef.current.on('chat-message', (data, sender, senderId) => {
      setChatMessages(prev => [...prev, { message: data, sender, senderId, timestamp: new Date() }]);
    });

    return () => {
      // Cleanup on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Get user media
  const getUserMediaStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  };

  // Join call: called when user clicks "Join"
  const joinCall = async () => {
    if (!roomId.trim() || !userName.trim()) {
      alert('Please enter room ID and your name');
      return;
    }

    setIsJoining(true);
    try {
      // 1. get local media
      await getUserMediaStream();

      // 2. emit join-call with roomId and maybe userName if needed
      socketRef.current.emit('join-call', roomId);

      setIsInCall(true);
      setIsCallActive(true);
    } catch (error) {
      console.error('Error joining call:', error);
      alert('Failed to access camera/microphone');
    }
    setIsJoining(false);
  };

  // Create PeerConnection when we know two participants are in room
  // users: array of socket IDs in room
  const createPeerConnection = async (users) => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // add TURN servers if available
      ]
    };
    const pc = new RTCPeerConnection(configuration);
    peerConnectionRef.current = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Remote stream handling
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    pc.ontrack = (event) => {
      console.log('Remote track event:', event.streams);
      event.streams.forEach(stream => {
        stream.getTracks().forEach(track => {
          remoteStream.addTrack(track);
        });
      });
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send candidate to the other peer
        const otherId = users.find(id => id !== socketRef.current.id);
        if (otherId) {
          socketRef.current.emit('signal', otherId, {
            type: 'ice-candidate',
            candidate: event.candidate
          });
        }
      }
    };

    // Determine if we should create an offer:
    // E.g., the first in the participants array can be the caller.
    const otherId = users.find(id => id !== socketRef.current.id);
    if (!otherId) {
      console.warn('No other participant ID found');
      return;
    }
    // Check if we are initiator (e.g. smaller socket id or first in array)
    // Here: if our socket id is users[0], we create offer
    if (users[0] === socketRef.current.id) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('signal', otherId, {
          type: 'offer',
          sdp: offer.sdp
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    }
  };

  // Handle incoming signals
  const handleSignal = async (fromId, message) => {
    if (!peerConnectionRef.current) {
      console.warn('PeerConnection not established yet. Storing?');
      // In some flows you may want to store the offer and set up PC once local media is ready.
      return;
    }
    const pc = peerConnectionRef.current;
    try {
      if (message.type === 'offer') {
        // message.sdp should be the SDP offer string
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit('signal', fromId, {
          type: 'answer',
          sdp: answer.sdp
        });
      } else if (message.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
      } else if (message.type === 'ice-candidate') {
        if (message.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        }
      }
    } catch (err) {
      console.error('Error handling signal:', err);
    }
  };

  // Leave call
  const leaveCall = () => {
    // Stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    // Disconnect socket or leave room
    if (socketRef.current) {
      socketRef.current.emit('leave-call', roomId); // optionally handle on backend
      // Or simply disconnect if you don't reuse socket for other rooms
      // socketRef.current.disconnect();
    }
    setIsInCall(false);
    setIsCallActive(false);
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsVideoOn(true);
    setIsAudioOn(true);
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
      }
    }
  };

  // Screen sharing
  const toggleScreenShare = async () => {
    if (!peerConnectionRef.current) return;
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        // Replace the existing video track sender
        const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
        setIsScreenSharing(true);
        // When user stops sharing from browser UI:
        screenTrack.onended = () => {
          stopScreenShare();
        };
      } else {
        // Stop screen share: get camera again
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const camTrack = camStream.getVideoTracks()[0];
        const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(camTrack);
        }
        setIsScreenSharing(false);
        // Stop the extra tracks
        // Note: old screenTrack was stopped automatically by onended
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  };

  const stopScreenShare = async () => {
    // Called when screenTrack.onended triggers
    if (!peerConnectionRef.current) return;
    try {
      // Restore camera
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const camTrack = camStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(camTrack);
      }
    } catch (err) {
      console.error('Error restoring camera after screen share ended:', err);
    }
    setIsScreenSharing(false);
  };

  // Send chat message
  const sendMessage = () => {
    if (currentMessage.trim()) {
      socketRef.current.emit('chat-message', currentMessage, userName);
      setCurrentMessage('');
    }
  };

  // Copy room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert('Room ID copied to clipboard!');
  };

  // Generate room ID
  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 15);
    setRoomId(id);
  };

  // RENDER
  if (!isInCall) {
    // Join Screen
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Video Call</h1>
            <p className="text-gray-600 mt-2">Join or create a video call</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter room ID"
                />
                <button
                  onClick={generateRoomId}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Generate
                </button>
              </div>
            </div>

            <button
              onClick={joinCall}
              disabled={isJoining || !roomId.trim() || !userName.trim()}
              className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isJoining ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Joining...
                </>
              ) : (
                <>
                  <Phone className="w-5 h-5" />
                  Join Call
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // In-call UI
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Video Call</h1>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Users className="w-4 h-4" />
            <span>{participants.length}/2</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyRoomId}
            className="px-3 py-1 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm"
          >
            <Copy className="w-4 h-4" />
            <span className="hidden sm:inline">Room: {roomId}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Video Area */}
        <div className="flex-1 relative bg-black">
          {participants.length === 2 ? (
            <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-1">
              {/* Remote Video */}
              <div className="relative bg-gray-800 rounded-lg overflow-hidden">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  Participant
                </div>
              </div>

              {/* Local Video */}
              <div className="relative bg-gray-800 rounded-lg overflow-hidden">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  You {isScreenSharing && '(Screen)'}
                </div>
                {!isVideoOn && (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center">
                      <VideoOff className="w-8 h-8 text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-white">
                <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Waiting for others to join...</h3>
                <p className="text-gray-400">Share the room ID with someone to start the call</p>
                <div className="mt-4 p-3 bg-gray-800 rounded-lg inline-block">
                  <span className="text-sm">Room ID: <strong>{roomId}</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        {isChatOpen && (
          <div className="w-full lg:w-80 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Chat</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className="flex flex-col">
                  <div className="text-xs text-gray-500 mb-1">
                    {msg.sender} • {msg.timestamp.toLocaleTimeString()}
                  </div>
                  <div className="bg-gray-100 rounded-lg p-2 text-sm">
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={sendMessage}
                  className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 p-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition-colors ${
              isAudioOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isAudioOn ? (
              <Mic className="w-5 h-5 text-white" />
            ) : (
              <MicOff className="w-5 h-5 text-white" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition-colors ${
              isVideoOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isVideoOn ? (
              <Video className="w-5 h-5 text-white" />
            ) : (
              <VideoOff className="w-5 h-5 text-white" />
            )}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-3 rounded-full transition-colors ${
              isScreenSharing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <Monitor className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            <MessageSquare className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={leaveCall}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCallApp;

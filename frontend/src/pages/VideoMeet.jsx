import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, Monitor, MessageCircle, X, Send, LogOut, User } from 'lucide-react';
import server from '../environment';

const server_url = server;

const peerConfigConnections = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const CustomModal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const ControlButton = ({ icon: Icon, isActive, onClick, label }) => (
  <button
    className={`p-3 rounded-full ${isActive ? 'bg-green-600' : 'bg-gray-600'} hover:bg-opacity-80 transition duration-300 flex items-center justify-center relative`}
    onClick={onClick}
    title={label}
  >
    <Icon size={24} className="text-white" />
    {!isActive && <div className="absolute w-8 h-1 bg-red-500 rotate-45" />}
  </button>
);

export default function VideoMeet() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoRef = useRef();
  const chatContainerRef = useRef();
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [screen, setScreen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [newMessages, setNewMessages] = useState(0);
  const [username, setUsername] = useState('');
  const videoRef = useRef([]);
  const [videos, setVideos] = useState([]);
  const connections = useRef({});
  const [peerStates, setPeerStates] = useState({});

  useEffect(() => {
    getPermissions();
  }, []);

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(!!videoPermission);
      const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(!!audioPermission);
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
      if (videoAvailable || audioAvailable) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
        window.localStream = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Permission error:', error);
    }
  };

  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
      socketRef.current?.emit('update-state', { socketId: socketIdRef.current, video, audio });
    }
  }, [video, audio]);

  useEffect(() => {
    if (screen !== undefined) getDisplayMedia();
  }, [screen]);

  useEffect(() => {
    if (showChat && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, showChat]);

  const getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .catch((e) => console.error('getUserMedia error:', e));
    } else {
      try {
        let tracks = localVideoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {}
    }
  };

  const getUserMediaSuccess = (stream) => {
    try {
      window.localStream?.getTracks().forEach((track) => track.stop());
    } catch (e) {}
    window.localStream = stream;
    localVideoRef.current.srcObject = stream;
    for (let id in connections.current) {
      if (id === socketIdRef.current) continue;
      connections.current[id].addStream(window.localStream);
      connections.current[id]
        .createOffer()
        .then((description) => {
          connections.current[id]
            .setLocalDescription(description)
            .then(() => {
              socketRef.current.emit('signal', id, JSON.stringify({ sdp: connections.current[id].localDescription }));
            })
            .catch((e) => console.error('setLocalDescription error:', e));
        })
        .catch((e) => console.error('createOffer error:', e));
    }
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setVideo(false);
        setAudio(false);
        socketRef.current?.emit('update-state', { socketId: socketIdRef.current, video: false, audio: false });
        handleStreamEnd();
      };
    });
  };

  const getDisplayMedia = () => {
    if (screen && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices
        .getDisplayMedia({ video: true, audio: true })
        .then(getDisplayMediaSuccess)
        .catch((e) => console.error('getDisplayMedia error:', e));
    }
  };

  const getDisplayMediaSuccess = (stream) => {
    try {
      window.localStream?.getTracks().forEach((track) => track.stop());
    } catch (e) {}
    window.localStream = stream;
    localVideoRef.current.srcObject = stream;
    for (let id in connections.current) {
      if (id === socketIdRef.current) continue;
      connections.current[id].addStream(window.localStream);
      connections.current[id]
        .createOffer()
        .then((description) => {
          connections.current[id]
            .setLocalDescription(description)
            .then(() => {
              socketRef.current.emit('signal', id, JSON.stringify({ sdp: connections.current[id].localDescription }));
            })
            .catch((e) => console.error('setLocalDescription error:', e));
        })
        .catch((e) => console.error('createOffer error:', e));
    }
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setScreen(false);
        handleStreamEnd();
      };
    });
  };

  const handleStreamEnd = () => {
    try {
      let tracks = localVideoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (e) {}
    const blackSilence = () => new MediaStream([black(), silence()]);
    window.localStream = blackSilence();
    localVideoRef.current.srcObject = window.localStream;
    for (let id in connections.current) {
      connections.current[id].addStream(window.localStream);
      connections.current[id]
        .createOffer()
        .then((description) => {
          connections.current[id]
            .setLocalDescription(description)
            .then(() => {
              socketRef.current.emit('signal', id, JSON.stringify({ sdp: connections.current[id].localDescription }));
            })
            .catch((e) => console.error('setLocalDescription error:', e));
        })
        .catch((e) => console.error('createOffer error:', e));
    }
  };

  const silence = () => {
    let ctx = new AudioContext();
    let oscillator = ctx.createOscillator();
    let dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement('canvas'), { width, height });
    canvas.getContext('2d').fillRect(0, 0, width, height);
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections.current[fromId]
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === 'offer') {
              connections.current[fromId]
                .createAnswer()
                .then((description) => {
                  connections.current[fromId]
                    .setLocalDescription(description)
                    .then(() => {
                      socketRef.current.emit('signal', fromId, JSON.stringify({ sdp: connections.current[fromId].localDescription }));
                    })
                    .catch((e) => console.error('setLocalDescription error:', e));
                })
                .catch((e) => console.error('createAnswer error:', e));
            }
          })
          .catch((e) => console.error('setRemoteDescription error:', e));
      }
      if (signal.ice) {
        connections.current[fromId]
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch((e) => console.error('addIceCandidate error:', e));
      }
    }
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });
    socketRef.current.on('signal', gotMessageFromServer);
    socketRef.current.on('connect', () => {
      socketRef.current.emit('join-call', window.location.href);
      socketIdRef.current = socketRef.current.id;
      socketRef.current.on('chat-message', addMessage);
      socketRef.current.on('user-left', (id) => {
        setVideos((prevVideos) => prevVideos.filter((video) => video.socketId !== id));
        setPeerStates((prev) => {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        });
      });
      socketRef.current.on('user-joined', (id, clients) => {
        clients.forEach((socketListId) => {
          connections.current[socketListId] = new RTCPeerConnection(peerConfigConnections);
          connections.current[socketListId].onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current.emit('signal', socketListId, JSON.stringify({ ice: event.candidate }));
            }
          };
          connections.current[socketListId].onaddstream = (event) => {
            const videoExists = videoRef.current.find((video) => video.socketId === socketListId);
            if (videoExists) {
              setVideos((prevVideos) =>
                prevVideos.map((video) =>
                  video.socketId === socketListId ? { ...video, stream: event.stream } : video
                )
              );
            } else {
              const newVideo = {
                socketId: socketListId,
                stream: event.stream,
                autoplay: true,
                playsinline: true,
              };
              setVideos((prevVideos) => [...prevVideos, newVideo]);
              videoRef.current = [...videoRef.current, newVideo];
            }
          };
          if (window.localStream) {
            connections.current[socketListId].addStream(window.localStream);
          } else {
            const blackSilence = () => new MediaStream([black(), silence()]);
            window.localStream = blackSilence();
            connections.current[socketListId].addStream(window.localStream);
          }
        });
        if (id === socketIdRef.current) {
          for (let id2 in connections.current) {
            if (id2 === socketIdRef.current) continue;
            connections.current[id2].addStream(window.localStream);
            connections.current[id2]
              .createOffer()
              .then((description) => {
                connections.current[id2]
                  .setLocalDescription(description)
                  .then(() => {
                    socketRef.current.emit('signal', id2, JSON.stringify({ sdp: connections.current[id2].localDescription }));
                  })
                  .catch((e) => console.error('setLocalDescription error:', e));
              })
              .catch((e) => console.error('createOffer error:', e));
          }
        }
      });
      socketRef.current.on('update-state', ({ socketId, video, audio }) => {
        setPeerStates((prev) => ({
          ...prev,
          [socketId]: { video, audio },
        }));
      });
    });
  };

  const handleVideo = () => {
    setVideo(!video);
    socketRef.current?.emit('update-state', { socketId: socketIdRef.current, video: !video, audio });
  };

  const handleAudio = () => {
    setAudio(!audio);
    socketRef.current?.emit('update-state', { socketId: socketIdRef.current, video, audio: !audio });
  };

  const handleScreen = () => setScreen(!screen);

  const handleEndCall = () => {
    try {
      let tracks = localVideoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (e) {}
    window.location.href = '/';
  };

  const openChat = () => {
    setShowChat(true);
    setNewMessages(0);
  };

  const closeChat = () => setShowChat(false);

  const handleMessage = (e) => setMessage(e.target.value);

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prev) => [...prev, { sender, data, socketId: socketIdSender }]);
    if (socketIdSender !== socketIdRef.current && !showChat) {
      setNewMessages((prev) => prev + 1);
    }
  };

  const sendMessage = () => {
    if (message.trim()) {
      socketRef.current.emit('chat-message', message, username, socketIdRef.current);
      setMessage('');
    }
  };

  const connect = () => {
    if (username.trim()) {
      setShowUsernameModal(false);
      connectToSocketServer();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <CustomModal isOpen={showUsernameModal} onClose={() => {}} title="Join the Meeting">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-2">
            <User size={20} className="text-gray-300" />
            <input
              type="text"
              className="w-full p-2 bg-transparent text-white placeholder-gray-400 focus:outline-none"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && connect()}
            />
          </div>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 flex items-center justify-center gap-2"
            onClick={connect}
            disabled={!username.trim()}
          >
            <User size={20} />
            Join Meeting
          </button>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            className="w-full rounded-lg mt-4 border border-gray-600"
          />
        </div>
      </CustomModal>

      {!showUsernameModal && (
        <>
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 p-6 flex flex-col">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto">
                <div className="relative bg-gray-800 rounded-xl overflow-hidden shadow-lg aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded-md text-sm flex items-center gap-2">
                    You ({username})
                    {!video && <VideoOff size={16} className="text-red-500" />}
                    {!audio && <MicOff size={16} className="text-red-500" />}
                  </div>
                  <div className="absolute top-2 right-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded-md text-sm">
                    My Screen
                  </div>
                </div>
                {videos.map((video) => (
                  <div
                    key={video.socketId}
                    className="relative bg-gray-800 rounded-xl overflow-hidden shadow-lg aspect-video"
                  >
                    <video
                      data-socket={video.socketId}
                      ref={(ref) => {
                        if (ref && video.stream) ref.srcObject = video.stream;
                      }}
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded-md text-sm flex items-center gap-2">
                      Participant
                      {peerStates[video.socketId]?.video === false && <VideoOff size={16} className="text-red-500" />}
                      {peerStates[video.socketId]?.audio === false && <MicOff size={16} className="text-red-500" />}
                    </div>
                    <div className="absolute top-2 right-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded-md text-sm">
                      User Screen
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-4 mt-6">
                <ControlButton
                  icon={video ? Video : VideoOff}
                  isActive={video}
                  onClick={handleVideo}
                  label={video ? 'Turn off video' : 'Turn on video'}
                />
                <ControlButton
                  icon={audio ? Mic : MicOff}
                  isActive={audio}
                  onClick={handleAudio}
                  label={audio ? 'Mute microphone' : 'Unmute microphone'}
                />
                {screenAvailable && (
                  <ControlButton
                    icon={Monitor}
                    isActive={screen}
                    onClick={handleScreen}
                    label={screen ? 'Stop sharing' : 'Share screen'}
                  />
                )}
                <ControlButton
                  icon={MessageCircle}
                  isActive={showChat}
                  onClick={openChat}
                  label="Open chat"
                >
                  {newMessages > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {newMessages}
                    </span>
                  )}
                </ControlButton>
                <ControlButton
                  icon={LogOut}
                  isActive={false}
                  onClick={handleEndCall}
                  label="Leave meeting"
                />
              </div>
            </div>
            {showChat && (
              <div className="w-96 bg-white shadow-xl flex flex-col border-l border-gray-200">
                <div className="p-4 bg-gray-800 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-white">Meeting Chat</h3>
                  <button onClick={closeChat} className="text-gray-300 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                <div
                  ref={chatContainerRef}
                  className="flex-1 p-4 overflow-y-auto bg-gray-50"
                >
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div
                        key={index}
                        className={`mb-4 ${
                          item.socketId === socketIdRef.current ? 'text-right' : 'text-left'
                        }`}
                      >
                        <p className="text-sm text-gray-600">{item.sender}</p>
                        <p
                          className={`inline-block p-2 rounded-lg ${
                            item.socketId === socketIdRef.current
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-gray-800'
                          }`}
                        >
                          {item.data}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center">No messages yet</p>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 p-2 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={message}
                      onChange={handleMessage}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                    />
                    <button
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300"
                      onClick={sendMessage}
                      disabled={!message.trim()}
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
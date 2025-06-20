import React, { useState } from 'react';
import VideoCall from './VideoCall';

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomID, setRoomID] = useState('');
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPermissionsGranted(true);
      // Stream is not stored here; VideoCall.jsx will request it again
    } catch (err) {
      console.error('Permissions denied:', err);
      alert('Please allow camera and microphone access to join the call.');
    }
  };

  const handleJoin = () => {
    const trimmed = roomID.trim();
    if (trimmed) {
      setInCall(true);
    } else {
      alert('Please enter a room ID');
    }
  };

  const handleLeaveCall = () => {
    setInCall(false);
  };

  if (!permissionsGranted) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-semibold mb-4 text-center">Video Call App</h1>
          <p className="mb-4 text-center">Please allow camera and microphone access to join the call.</p>
          <button
            onClick={requestPermissions}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Allow Camera and Microphone
          </button>
        </div>
      </div>
    );
  }

  if (!inCall) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-semibold mb-4 text-center">Join a Room</h1>
          <input
            type="text"
            placeholder="Enter Room ID (e.g., 1234)"
            className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={roomID}
            onChange={(e) => setRoomID(e.target.value)}
          />
          <button
            onClick={handleJoin}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <VideoCall roomID={roomID.trim()} onLeave={handleLeaveCall} />
  );
}

export default App;
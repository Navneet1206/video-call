import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/landing";
import VideoMeet from "./pages/VideoMeet";

function App() {
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/:url" element={<VideoMeet />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
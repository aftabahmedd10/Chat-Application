
import './App.css';
import { Routes, Route } from "react-router-dom";
import HomePage from './HomePage';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';
import ChatPage from './ChatPage';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
         <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </div>
  );
}

export default App;

// App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import io from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Initialize socket connection when user is authenticated
    if (user) {
      const newSocket = io(BACKEND_URL, {
        auth: {
          token: user.token
        }
      });
      setSocket(newSocket);

      return () => newSocket.close();
    }
  }, [user]);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          !user ? <Login onLogin={handleLogin} /> : <Navigate to="/dashboard" />
        } />
        <Route path="/dashboard" element={
          user ? <Dashboard socket={socket} user={user} /> : <Navigate to="/login" />
        } />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
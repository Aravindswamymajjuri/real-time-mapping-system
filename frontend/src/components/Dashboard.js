import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Replace with your Mapbox token
mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN';

const Dashboard = ({ socket, user }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [locations, setLocations] = useState({});
  const markers = useRef({});

  useEffect(() => {
    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.5, 40], // Default location
        zoom: 9
      });
    }

    // Watch current user's location
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        socket?.emit('updateLocation', { latitude, longitude });
      },
      (error) => console.error(error),
      { enableHighAccuracy: true }
    );

    // Listen for location updates from other users
    socket?.on('locations', (updatedLocations) => {
      setLocations(updatedLocations);
    });

    return () => {
      socket?.off('locations');
    };
  }, [socket]);

  // Update markers when locations change
  useEffect(() => {
    Object.entries(locations).forEach(([userId, location]) => {
      if (!markers.current[userId]) {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'marker';
        el.style.backgroundColor = userId === user.id ? '#4CAF50' : '#2196F3';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';

        markers.current[userId] = new mapboxgl.Marker(el)
          .setLngLat([location.longitude, location.latitude])
          .setPopup(new mapboxgl.Popup().setHTML(`<h3>${location.username}</h3>`))
          .addTo(map.current);
      } else {
        // Update existing marker
        markers.current[userId].setLngLat([location.longitude, location.latitude]);
      }
    });

    // Remove markers for disconnected users
    Object.keys(markers.current).forEach(userId => {
      if (!locations[userId]) {
        markers.current[userId].remove();
        delete markers.current[userId];
      }
    });
  }, [locations, user.id]);

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-blue-600 text-white p-4">
        <h1 className="text-xl">Location Tracker</h1>
        <p>Welcome, {user.username}</p>
      </div>
      <div className="flex-1" ref={mapContainer} />
      <div className="bg-white p-4 border-t">
        <h2 className="font-bold mb-2">Online Users</h2>
        <ul>
          {Object.entries(locations).map(([userId, location]) => (
            <li key={userId} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              {location.username}
              {userId === user.id && " (You)"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
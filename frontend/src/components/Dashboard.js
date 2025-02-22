// Dashboard.js
import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

const GOOGLE_API_KEY = 'AIzaSyDrU78Kvj2h2jURwtvH5MZSoi6f8fHhUrc'; // Move API key to constant
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};


const mapLayers = {
  detailed: [
    {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }
    },
    {
      url: 'https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
      options: {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
      }
    }
  ],
  satellite: [
    {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    }
  ],
  topo: [
    {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 17,
        attribution: '© OpenTopoMap contributors'
      }
    }
  ]
};

const Dashboard = ({ socket, user }) => {
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const [locations, setLocations] = useState({});
  const markers = useRef({});
  const [mapType, setMapType] = useState('detailed');
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [mapError, setMapError] = useState(null);
  const [locationStatus, setLocationStatus] = useState('initializing');
  const [fallbackLocation, setFallbackLocation] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const accuracyCircle = useRef(null);
  const userLocationMarker = useRef(null);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  
  const createLayerWithFallback = (layerConfigs) => {
    let currentLayerIndex = 0;
    let layer = L.tileLayer(
      layerConfigs[0].url,
      {
        ...layerConfigs[0].options,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      }
    );

    layer.on('tileerror', function(e) {
      console.warn(`Tile error on layer ${currentLayerIndex}, attempting fallback...`);
      currentLayerIndex = (currentLayerIndex + 1) % layerConfigs.length;
      if (currentLayerIndex !== 0) {
        const newConfig = layerConfigs[currentLayerIndex];
        layer.setUrl(newConfig.url);
        Object.assign(layer.options, newConfig.options);
      }
    });

    return layer;
  };

  const getFallbackLocation = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      return {
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        accuracy: 5000
      };
    } catch (error) {
      console.error('Fallback location error:', error);
      return null;
    }
  };

  const handleGeolocationError = async (error) => {
    let errorMessage = '';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location access denied. Please enable location services or enter location manually.';
        setShowManualInput(true);
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information unavailable. Trying fallback location...';
        const fallback = await getFallbackLocation();
        if (fallback) {
          setFallbackLocation(fallback);
          mapInstance.current?.setView([fallback.latitude, fallback.longitude], 10);
          socket?.emit('updateLocation', fallback);
          setLocationStatus('using-fallback');
          return;
        }
        setShowManualInput(true);
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out. Please check your connection or enter location manually.';
        setShowManualInput(true);
        break;
      default:
        errorMessage = 'An unknown error occurred. Please try again or enter location manually.';
        setShowManualInput(true);
    }
    setMapError(errorMessage);
    setLocationStatus('error');
  };
  

  const handleManualLocation = (event) => {
    event.preventDefault();
    const lat = parseFloat(event.target.latitude.value);
    const lng = parseFloat(event.target.longitude.value);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      if (mapInstance.current) {
        mapInstance.current.setView([lat, lng], 13);
        socket?.emit('updateLocation', { latitude: lat, longitude: lng });
        setLocationStatus('manual');
        setShowManualInput(false);
        setMapError(null);
      }
    } else {
      setMapError('Invalid coordinates. Please enter valid latitude (-90 to 90) and longitude (-180 to 180).');
    }
  };

  const updateLocationWithAddress = async (latitude, longitude) => {
    try {
      const geocodeURL = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
      const response = await axios.get(geocodeURL);
      console.log('Geocoding response:', response.data);
      const formattedAddress = response.data.results[0]?.formatted_address;
      console.log('Address from Google API:', formattedAddress);
      socket?.emit('updateLocation', { latitude, longitude, address: formattedAddress });
    } catch (err) {
      console.error('Geocoding error:', err);
      // Still emit location update even if geocoding fails
      socket?.emit('updateLocation', { latitude, longitude });
    }
  };

  const updateUserLocationMarkers = (latitude, longitude, accuracy) => {
    if (!mapInstance.current) return;

    // Update user location marker
    if (!userLocationMarker.current) {
      userLocationMarker.current = L.circleMarker([latitude, longitude], {
        radius: 10,
        fillColor: '#007bff',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(mapInstance.current);
    } else {
      userLocationMarker.current.setLatLng([latitude, longitude]);
    }

    // Update accuracy circle
    if (!accuracyCircle.current) {
      accuracyCircle.current = L.circle([latitude, longitude], {
        radius: accuracy,
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 0.2,
      }).addTo(mapInstance.current);
    } else {
      accuracyCircle.current.setLatLng([latitude, longitude]);
      accuracyCircle.current.setRadius(accuracy);
    }
  };

  const handlePositionUpdate = async (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    
    if (mapInstance.current) {
      mapInstance.current.setView([latitude, longitude], 13);
      updateUserLocationMarkers(latitude, longitude, accuracy);
      await updateLocationWithAddress(latitude, longitude);
      
      if (locationStatus !== 'success') {
        setLocationStatus('success');
        setMapError(null);
      }
    }
  };

  const initializeGeolocation = async () => {
    if ("geolocation" in navigator) {
      try {
        setLocationStatus('requesting');
        setShowManualInput(false);

        if (permissionStatus === 'denied') {
          await handleGeolocationError({
            code: 1,
            message: 'Location permission denied'
          });
          return;
        }

        navigator.geolocation.getCurrentPosition(
          handlePositionUpdate,
          async (error) => {
            console.warn('Geolocation error:', error);
            await handleGeolocationError(error);
          },
          GEOLOCATION_OPTIONS
        );

        const watchId = navigator.geolocation.watchPosition(
          handlePositionUpdate,
          async (error) => {
            console.warn('Error retrieving position:', error);
            await handleGeolocationError(error);
          },
          GEOLOCATION_OPTIONS
        );

        return () => navigator.geolocation.clearWatch(watchId);
      } catch (error) {
        console.error('Geolocation setup error:', error);
        await handleGeolocationError({ code: 2, message: 'Failed to initialize geolocation' });
      }
    } else {
      setLocationStatus('unsupported');
      setMapError('Geolocation is not supported by your browser. Please enter location manually.');
      setShowManualInput(true);
    }
  };
  


  useEffect(() => {
    if (mapContainer.current && !mapInstance.current) {
      try {
        mapInstance.current = L.map(mapContainer.current, {
          zoomControl: false,
        });

        L.control.zoom({
          position: 'topright'
        }).addTo(mapInstance.current);

        const layers = {
          detailed: createLayerWithFallback(mapLayers.detailed),
          satellite: createLayerWithFallback(mapLayers.satellite),
          topo: createLayerWithFallback(mapLayers.topo)
        };

        mapInstance.current.setView([40, -74.5], 9);

        layers[mapType].addTo(mapInstance.current);

        const baseLayers = {
          "Detailed Street Map": layers.detailed,
          "Satellite": layers.satellite,
          "Topographic Map": layers.topo
        };
        
        L.control.layers(baseLayers, null, {
          position: 'topright'
        }).addTo(mapInstance.current);

        L.control.scale({
          imperial: true,
          metric: true,
          position: 'bottomright'
        }).addTo(mapInstance.current);

        setIsMapLoading(false);
        initializeGeolocation();
      } catch (error) {
        console.error('Map initialization error:', error);
        setMapError('Failed to initialize map. Please refresh the page.');
        setIsMapLoading(false);
      }
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [mapType]);

  useEffect(() => {
    if (socket) {
      socket.on('locations', (updatedLocations) => {
        setLocations(updatedLocations);
      });

      return () => {
        socket.off('locations');
      };
    }
  }, [socket]);

  useEffect(() => {
    if (!mapInstance.current) return;

    Object.entries(locations).forEach(([userId, location]) => {
      if (!markers.current[userId]) {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            width: 24px;
            height: 24px;
            background-color: ${userId === user.id ? '#4CAF50' : '#2196F3'};
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
          "></div>`,
        });

        markers.current[userId] = L.marker([location.latitude, location.longitude], { icon })
          .bindPopup(`
            <div class="text-center">
              <h3 class="font-bold">${location.username}</h3>
              <p>Lat: ${location.latitude.toFixed(4)}</p>
              <p>Lng: ${location.longitude.toFixed(4)}</p>
            </div>
          `)
          .addTo(mapInstance.current);
      } else {
        markers.current[userId].setLatLng([location.latitude, location.longitude]);
      }
    });

    Object.keys(markers.current).forEach(userId => {
      if (!locations[userId] && mapInstance.current) {
        mapInstance.current.removeLayer(markers.current[userId]);
        delete markers.current[userId];
      }
    });
  }, [locations, user.id]);

  
  const checkPermissionStatus = async () => {
    try {
      // Check if the browser supports the permissions API
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(result.state);
        
        // Listen for permission changes
        result.addEventListener('change', () => {
          setPermissionStatus(result.state);
          if (result.state === 'granted') {
            initializeGeolocation();
          } else if (result.state === 'denied') {
            handleGeolocationError({ code: 1, message: 'Location permission denied' });
          }
        });
      }
    } catch (error) {
      console.warn('Permission check failed:', error);
      // Fallback to direct geolocation check
      if ("geolocation" in navigator) {
        initializeGeolocation();
      } else {
        setLocationStatus('unsupported');
        setMapError('Geolocation is not supported by your browser');
      }
    }
  };

  const requestPermission = async () => {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
      
      setPermissionStatus('granted');
      setLocationStatus('success');
      setMapError(null);
      
      const { latitude, longitude } = position.coords;
      if (mapInstance.current) {
        mapInstance.current.setView([latitude, longitude], 13);
        socket?.emit('updateLocation', { latitude, longitude });
      }
      
      initializeGeolocation();
    } catch (error) {
      console.warn('Permission request failed:', error);
      await handleGeolocationError(error);
    }
  };

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const getLocationStatusMessage = () => {
    switch (locationStatus) {
      case 'requesting':
        return 'Requesting location access...';
      case 'using-fallback':
        return 'Using approximate location';
      case 'manual':
        return 'Using manually entered location';
      case 'error':
        return mapError;
      case 'unsupported':
        return 'Location services not supported';
      default:
        return permissionStatus === 'granted' ? 
               'Location access granted' : 
               'Location access not granted';
    }
  };
  

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Location Tracker</h1>
          <p className="dashboard-welcome">Welcome, {user.username}</p>
        </div>
      </div>
      
      <div className="map-container relative" ref={mapContainer}>
        {isMapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75 z-10">
            <div className="text-lg">Loading map...</div>
          </div>
        )}
  
        {showManualInput && (
          <div className="absolute top-4 left-4 z-20 bg-white p-4 rounded-lg shadow-lg">
            <form onSubmit={handleManualLocation} className="space-y-4">
              <div>
                <input
                  type="number"
                  step="any"
                  name="latitude"
                  placeholder="Latitude"
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div>
                <input
                  type="number"
                  step="any"
                  name="longitude"
                  placeholder="Longitude"
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Set Location
                </button>
                <button
                  type="button"
                  onClick={initializeGeolocation}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Try Auto-Location
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="map-controls absolute top-4 right-4 z-20">
          <select
            value={mapType}
            onChange={(e) => setMapType(e.target.value)}
            className="px-4 py-2 bg-white rounded shadow"
          >
            <option value="detailed">Detailed Street Map</option>
            <option value="satellite">Satellite</option>
            <option value="topo">Topographic Map</option>
          </select>
        </div>

        {(locationStatus !== 'success' || permissionStatus !== 'granted') && (
  <div className="absolute bottom-4 left-4 z-20 bg-white px-4 py-2 rounded-lg shadow">
    <span className={`${
      permissionStatus === 'denied' || locationStatus === 'error' ? 'text-red-600' : 'text-gray-600'
    } ${locationStatus === 'using-fallback' ? 'text-yellow-600' : ''}`}>
      {getLocationStatusMessage()}
    </span>
  </div>
)}

      </div>

      <div className="users-panel">
        <div className="users-list">
          {Object.entries(locations).map(([userId, location]) => (
            <div key={userId} className="user-item">
              <span 
                className="user-status"
                style={{
                  backgroundColor: userId === user.id ? '#4CAF50' : '#2196F3'
                }}
              />
              <span className="user-name">
                {location.username}
                {userId === user.id && " (You)"}
              </span>
              <span className="user-coords">
                ({location.latitude.toFixed(4)}, {location.longitude.toFixed(4)})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Clock, Shield, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';

const SharedLocationView = ({ token }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircle = useRef(null);

  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Fetch real location data from API
  const fetchLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      // Use full backend URL if running frontend and backend on different ports
      const apiUrl =
        window.location.hostname === 'localhost'
          ? `http://localhost:3001/api/share-location/${token}`
          : `/api/share-location/${token}`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error('Invalid or expired share link');
      }
      // Defensive: check content-type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server error: Invalid response format');
      }
      const data = await res.json();
      setLocation(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load location');
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = () => {
    if (!location || !mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current).setView(
      [location.latitude, location.longitude], 
      15
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance.current);

    updateLocationMarker();
  };

  const updateLocationMarker = () => {
    if (!mapInstance.current || !location) return;

    // Update main marker
    if (!markerRef.current) {
      const icon = L.divIcon({
        className: 'custom-shared-marker',
        html: `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="
              background: rgba(59, 130, 246, 0.95);
              color: white;
              font-size: 12px;
              font-weight: bold;
              padding: 6px 12px;
              border-radius: 16px;
              margin-bottom: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              white-space: nowrap;
              border: 2px solid white;
            ">
              📍 ${location.username}
            </div>
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: linear-gradient(135deg, #3b82f6, #1d4ed8);
              border: 4px solid white;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 18px;
            ">
              ${location.username.charAt(0).toUpperCase()}
            </div>
          </div>
        `,
        iconSize: [50, 70],
        iconAnchor: [25, 70],
        popupAnchor: [0, -70]
      });

      markerRef.current = L.marker([location.latitude, location.longitude], { icon })
        .bindPopup(`
          <div class="p-4 min-w-48">
            <h3 class="font-bold text-lg mb-3 text-center">${location.username}'s Location</h3>
            <div class="space-y-2 text-sm">
              <p><strong>Status:</strong> <span class="text-green-600">● Online</span></p>
              <p><strong>Coordinates:</strong><br>
                 Lat: ${location.latitude.toFixed(6)}<br>
                 Lng: ${location.longitude.toFixed(6)}
              </p>
              ${location.shareOptions?.shareAccuracy ? 
                `<p><strong>Accuracy:</strong> ±${Math.round(location.accuracy)}m</p>` : ''
              }
              <p><strong>Last Updated:</strong><br>${lastUpdated?.toLocaleString()}</p>
            </div>
          </div>
        `)
        .addTo(mapInstance.current);
    } else {
      markerRef.current.setLatLng([location.latitude, location.longitude]);
    }

    // Update accuracy circle if sharing accuracy
    if (location.shareOptions?.shareAccuracy) {
      if (!accuracyCircle.current) {
        accuracyCircle.current = L.circle([location.latitude, location.longitude], {
          radius: location.accuracy,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(mapInstance.current);
      } else {
        accuracyCircle.current.setLatLng([location.latitude, location.longitude]);
        accuracyCircle.current.setRadius(location.accuracy);
      }
    }
  };

  const handleRefresh = () => {
    fetchLocation();
  };

  const handleAutoRefreshToggle = () => {
    setAutoRefresh(!autoRefresh);
  };

  const centerOnLocation = () => {
    if (location && mapInstance.current) {
      mapInstance.current.setView([location.latitude, location.longitude], 15);
      if (markerRef.current) {
        markerRef.current.openPopup();
      }
    }
  };

  const openInMaps = () => {
    if (location) {
      const url = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
      window.open(url, '_blank');
    }
  };

  const getDirections = () => {
    if (location) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
      window.open(url, '_blank');
    }
  };

  const isExpired = () => {
    return location?.shareOptions?.expiresAt && new Date() > new Date(location.shareOptions.expiresAt);
  };

  const getTimeRemaining = () => {
    if (!location?.shareOptions?.expiresAt) return null;
    
    const now = new Date();
    const expiresAt = new Date(location.shareOptions.expiresAt);
    const diff = expiresAt - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  // Initialize and fetch location
  useEffect(() => {
    fetchLocation();
  }, [token]);

  // Initialize map when location is available
  useEffect(() => {
    if (location && !mapInstance.current) {
      // Load Leaflet CSS and JS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!window.L) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => {
          setTimeout(initializeMap, 100);
        };
        document.head.appendChild(script);
      } else {
        initializeMap();
      }
    }
  }, [location]);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh && location?.shareOptions?.allowTracking && !isExpired()) {
      const interval = setInterval(() => {
        fetchLocation();
      }, 30000); // Refresh every 30 seconds
      
      setRefreshInterval(interval);
      
      return () => clearInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh, location?.shareOptions?.allowTracking]);

  // Update markers when location changes
  useEffect(() => {
    if (location && mapInstance.current) {
      updateLocationMarker();
    }
  }, [location, lastUpdated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shared location...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Location</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (isExpired()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <Clock className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Location Share Expired</h2>
          <p className="text-gray-600 mb-4">
            This location share link has expired. Please ask {location.username} to share their location again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MapPin className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {location.username}'s Location
                </h1>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <span className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Live</span>
                  </span>
                  {location.shareOptions?.expiresAt && (
                    <span>• {getTimeRemaining()}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleAutoRefreshToggle}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                  autoRefresh 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                <span className="text-sm">
                  {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
                </span>
              </button>

              <button
                onClick={handleRefresh}
                className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Map */}
        <div className="flex-1 relative">
          <div 
            ref={mapRef} 
            className="w-full h-full"
            style={{ minHeight: '500px' }}
          />

          {/* Map Controls */}
          <div className="absolute top-4 right-4 flex flex-col space-y-2">
            <button
              onClick={centerOnLocation}
              className="bg-white p-3 rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
              title="Center on location"
            >
              <Navigation className="w-5 h-5 text-gray-700" />
            </button>

            <button
              onClick={openInMaps}
              className="bg-white p-3 rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
              title="Open in Google Maps"
            >
              <ExternalLink className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          {/* Status Info */}
          <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-sm">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-5 h-5 text-green-600" />
              <span className="font-medium text-gray-900">Shared Location</span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>Last updated: {lastUpdated?.toLocaleTimeString()}</p>
              {location.shareOptions?.shareAccuracy && (
                <p>Accuracy: ±{Math.round(location.accuracy)}m</p>
              )}
              {location.shareOptions?.allowTracking && (
                <p className="text-green-600">Real-time tracking enabled</p>
              )}
            </div>
          </div>
        </div>

        {/* Info Panel */}
        <div className="w-80 bg-white border-l border-gray-200 p-6">
          <div className="space-y-6">
            {/* User Info */}
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                {location.username.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{location.username}</h3>
              <p className="text-sm text-gray-600">is sharing their location with you</p>
            </div>

            {/* Location Details */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Location Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Latitude:</span>
                  <span className="font-mono">{location.latitude.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Longitude:</span>
                  <span className="font-mono">{location.longitude.toFixed(6)}</span>
                </div>
                {location.shareOptions?.shareAccuracy && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Accuracy:</span>
                    <span>±{Math.round(location.accuracy)}m</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Updated:</span>
                  <span>{lastUpdated?.toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            {/* Share Info */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Share Settings</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    location.shareOptions?.allowTracking ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                  <span>
                    {location.shareOptions?.allowTracking ? 'Real-time tracking' : 'Static location'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    location.shareOptions?.shareAccuracy ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                  <span>
                    {location.shareOptions?.shareAccuracy ? 'Accuracy shared' : 'Accuracy hidden'}
                  </span>
                </div>
                {location.shareOptions?.expiresAt && (
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>{getTimeRemaining()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={getDirections}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Navigation className="w-4 h-4" />
                <span>Get Directions</span>
              </button>
              
              <button
                onClick={openInMaps}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in Maps</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedLocationView;
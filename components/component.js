import React, { useEffect, useState } from "react";
import mapboxgl from 'mapbox-gl';
import mapboxSdk from '@mapbox/mapbox-sdk/services/geocoding';
import Modal from 'react-modal';
import 'mapbox-gl/dist/mapbox-gl.css';
import styles from "../styles/style.module.css";

// Airtable setup
const AIRTABLE_BASE_ID = 'appTxnvKxOeLPaZau';
const AIRTABLE_API_KEY = 'patRH8HKZBvltgwAe.5d9119f89fe8ab95f51dc75fdbea0cb39ae2b885238cb87316712f46b8811025';
const AIRTABLE_TABLE_NAME = 'Locations';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZW5yaXF1ZXRjaGF0IiwiYSI6ImNrczVvdnJ5eTFlNWEycHJ3ZXlqZjFhaXUifQ.71mYPeoLXSujYlj4X5bQnQ';
const mapboxClient = mapboxSdk({ accessToken: mapboxgl.accessToken });

const radiusOptions = [
  { value: 10, label: '10 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
  { value: 'any', label: 'Any distance' },
];

const premiumOptions = [
  { value: 'all', label: 'All locations' },
  { value: 'premium', label: 'Premium only' },
];

// Custom Modal styles
const customModalStyles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 1000,
  },
  content: {
    position: 'relative',
    margin: 'auto',
    width: '70%',
    maxWidth: '90%',
    borderRadius: '12px',
    padding: '30px',
    backgroundColor: '#fff',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
  },
};

// Haversine formula for distance calculation
function haversineDistance(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceInMeters = R * c; // in meters
  return distanceInMeters / 1609.34; // Convert meters to miles
}

const Component = () => {
  const mapContainer = React.useRef(null);
  const [map, setMap] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [searchRadius, setSearchRadius] = useState(50);
  const [premiumFilter, setPremiumFilter] = useState('all');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/streets-v12'); // Default style

  const toggleCollapse = () => {
    setIsCollapsed(prevState => !prevState);
  };

  // Fetch locations from Airtable
  const fetchLocations = async () => {
    let allRecords = [];
    let offset = null;

    try {
      do {
        const response = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}${offset ? `?offset=${offset}` : ''}`, {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });

        const data = await response.json();
        allRecords = [...allRecords, ...data.records];
        offset = data.offset;
      } while (offset);

      console.log('Fetched locations from Airtable:', allRecords);
      return allRecords;
    } catch (error) {
      console.error("Error fetching data from Airtable:", error);
      return [];
    }
  };

  const openModal = (data) => {
    setModalData(data);
    setModalIsOpen(true);
  };

  const closeModal = () => setModalIsOpen(false);

  const reverseGeocode = async (coords) => {
    try {
      const response = await mapboxClient.reverseGeocode({ query: coords, limit: 1 }).send();
      if (response.body.features.length) {
        return response.body.features[0].place_name;
      }
      return `${coords[1]}, ${coords[0]}`; // Fallback to coordinates
    } catch (error) {
      console.error("Error reverse geocoding:", error);
      return `${coords[1]}, ${coords[0]}`;
    }
  };

  const getUserLocationAndSearch = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const userCoords = [longitude, latitude];
        const address = await reverseGeocode(userCoords);
        setSearchAddress(address);
        initializeMap(userCoords);
      });
    } else {
      console.error("Geolocation is not supported by this browser.");
    }
  };

  const initializeMap = (coords) => {
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle, // Use the map style state
      center: coords,
      zoom: 10,
    });
    setMap(newMap);
  };

  const toggleMapStyle = () => {
    if (!map) return;
    
    const currentCenter = map.getCenter(); // Get the current map center
    const newStyle = mapStyle === 'mapbox://styles/mapbox/streets-v12' 
                      ? 'mapbox://styles/mapbox/satellite-streets-v12' 
                      : 'mapbox://styles/mapbox/streets-v12';

    setMapStyle(newStyle);

    // Apply the new style to the map while keeping the center
    map.setStyle(newStyle);
    map.on('style.load', () => {
      map.setCenter(currentCenter);
    });
  };

  const runSearch = async (addressOrCoords, radius, premiumFilter) => {
    if (!map) return;

    setLoading(true);
    const allLocations = await fetchLocations();
    const bounds = new mapboxgl.LngLatBounds();
    let hasValidCoords = false;

    let searchCoords;
    if (typeof addressOrCoords === 'string') {
      const searchResponse = await mapboxClient.forwardGeocode({ query: addressOrCoords, limit: 1 }).send();
      if (!searchResponse.body.features.length) return;
      searchCoords = searchResponse.body.features[0].center;
    } else {
      searchCoords = addressOrCoords;
    }

    for (const location of allLocations) {
      const locAddress = location.fields['Address'];
      const name = location.fields['Name'];
      const details = location.fields['Details'];

      try {
        const locResponse = await mapboxClient.forwardGeocode({ query: locAddress, limit: 1 }).send();
        if (!locResponse.body.features.length) continue;

        const locCoords = locResponse.body.features[0].center;
        const distanceInMiles = haversineDistance(searchCoords, locCoords);

        if (radius === 'any' || distanceInMiles <= radius) {
          const marker = new mapboxgl.Marker()
            .setLngLat(locCoords)
            .setPopup(new mapboxgl.Popup().setText(name))
            .addTo(map);

          marker.getElement().addEventListener('click', () => {
            openModal({ name, locAddress, details });
          });

          bounds.extend(locCoords);
          hasValidCoords = true;
        }
      } catch (error) {
        console.error(`Error geocoding address: ${locAddress}`, error);
      }
    }

    if (hasValidCoords) {
      map.fitBounds(bounds, { padding: 50 });
    }

    setLoading(false);
  };

  useEffect(() => {
    if (map) {
      runSearch(searchAddress, searchRadius, premiumFilter);
    }
  }, [map, premiumFilter]);

  useEffect(() => {
    getUserLocationAndSearch();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.utilityBar}>
        <button onClick={toggleMapStyle} className={styles.toggleButton}>
          Toggle Map View
        </button>
        <input
          type="text"
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="Enter address"
          className={styles.searchInput}
        />
      </div>

      {!isCollapsed && (
        <div className={styles.searchContainer}>
          <div className={styles.searchControls}>
            <select
              value={searchRadius}
              onChange={(e) => setSearchRadius(e.target.value)}
              className={styles.searchSelect}
            >
              {radiusOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={premiumFilter}
              onChange={(e) => setPremiumFilter(e.target.value)}
              className={styles.searchSelect}
            >
              {premiumOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button onClick={() => runSearch(searchAddress, searchRadius, premiumFilter)} className={styles.searchButton}>
              Search
            </button>
            {loading && <img src="/loading.gif" alt="Loading..." className={styles.loadingGif} />}
          </div>
        </div>
      )}

      <div ref={mapContainer} className={styles.mapContainer} />

      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Location Details" style={customModalStyles}>
        {modalData && (
          <div className={styles.modalContent}>
            <h2>{modalData.name}</h2>
            <p><strong>Address:</strong> {modalData.locAddress}</p>
            <p><strong>Details:</strong> {modalData.details}</p>
            <button onClick={closeModal}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Component;

import React, { useEffect, useState } from "react";
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw'; // Import Mapbox GL Draw
import GeocodingService from '@mapbox/mapbox-sdk/services/geocoding'; // Correct import for geocoding service
import Modal from 'react-modal';
import * as turf from '@turf/turf';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'; // Import draw plugin CSS
import styles from "../styles/style.module.css";

// Airtable setup
const AIRTABLE_BASE_ID = 'appTxnvKxOeLPaZau';
const AIRTABLE_API_KEY = 'patRH8HKZBvltgwAe.5d911f89fe8ab95f51dc75fdbea0cb39ae2b885238cb87316712f46b8811025';
const AIRTABLE_TABLE_NAME = 'Locations';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZW5yaXF1ZXRjaGF0IiwiYSI6ImNrczVvdnJ5eTFlNWEycHJ3ZXlqZjFhaXUifQ.71mYPeoLXSujYlj4X5bQnQ';

// Initialize the Mapbox Geocoding Service
const geocodingClient = GeocodingService({ accessToken: mapboxgl.accessToken });

// Define custom modal styles
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

const Component = () => {
  const mapContainer = React.useRef(null);
  const [map, setMap] = useState(null);
  const [draw, setDraw] = useState(null); // State to manage draw control
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [popup, setPopup] = useState(null); // Popup state
  const [markers, setMarkers] = useState([]); // Store markers for cleanup
  const [searchAddress, setSearchAddress] = useState('');
  const [searchRadius, setSearchRadius] = useState(50);
  const [premiumFilter, setPremiumFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  // Function to clear all markers
  const clearMarkers = () => {
    markers.forEach(marker => marker.remove());
    setMarkers([]); // Reset the marker array
  };

  const openModal = (data) => {
    setModalData(data);
    setModalIsOpen(true);
  };

  const closeModal = () => setModalIsOpen(false);

  // Event listener to detect when a polygon is created or updated
  const handleDrawChange = (e) => {
    if (e.features.length === 0) {
      return;
    }

    const polygon = e.features[0];
    const bbox = turf.bbox(polygon); // Bounding box around the polygon

    console.log("Polygon bounding box:", bbox);

    // Clear any existing markers
    clearMarkers();

    // Fetch businesses within the polygon
    searchForBusinessesWithinPolygon(bbox);
  };

  // Fetch businesses within the bounding box of the drawn polygon
  const searchForBusinessesWithinPolygon = (bbox) => {
    const [minLng, minLat, maxLng, maxLat] = bbox;

    console.log('Bounding box:', { minLng, minLat, maxLng, maxLat });

    // Query Mapbox API within the bounding box
    geocodingClient.forwardGeocode({
      query: 'restaurant, grocery, gas station',
      bbox: [minLng, minLat, maxLng, maxLat], // The bounding box calculated from the polygon
      limit: 50, // You can adjust the limit as needed
    })
    .send()
    .then((response) => {
      const businesses = response.body.features;

      if (businesses.length === 0) {
        console.log("No businesses found within this polygon.");
      } else {
        console.log("Businesses found within polygon:", businesses);
        addBusinessMarkers(businesses, map); // Add markers to the map
      }
    })
    .catch((err) => {
      console.error("Error fetching businesses within polygon:", err);
    });
  };

  // Fetch businesses by manual search (address and radius)
  const runManualSearch = async () => {
    if (!map) return;

    setLoading(true);
    geocodingClient.forwardGeocode({
      query: searchAddress,
      proximity: map.getCenter(),
      limit: 10,
    })
    .send()
    .then((response) => {
      const businesses = response.body.features;
      console.log("Businesses found manually:", businesses);
      addBusinessMarkers(businesses, map);
    })
    .catch((err) => {
      console.error("Error fetching businesses:", err);
    })
    .finally(() => {
      setLoading(false);
    });
  };

  // Add business markers with hover popups
  const addBusinessMarkers = (businesses, map) => {
    const newMarkers = businesses.map(business => {
      const { center: [longitude, latitude], place_name: address } = business;
      const name = business.text;
      const properties = business.properties || {};
      const phone = properties.tel || 'N/A'; 
      const email = properties.email || 'N/A'; 
      const businessType = properties.category || 'N/A';

      console.log("Adding marker for business:", name);

      const marker = new mapboxgl.Marker()
        .setLngLat([longitude, latitude])
        .addTo(map);

      marker.getElement().addEventListener('mouseenter', () => {
        const popupContent = `
          <h4>${name}</h4>
          <p><strong>Address:</strong> ${address}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Type:</strong> ${businessType}</p>
        `;

        if (popup) {
          popup.remove();
        }

        const newPopup = new mapboxgl.Popup({ offset: 25 })
          .setLngLat([longitude, latitude])
          .setHTML(popupContent)
          .addTo(map);

        setPopup(newPopup);
      });

      marker.getElement().addEventListener('mouseleave', () => {
        if (popup) {
          popup.remove();
          setPopup(null);
        }
      });

      return marker;
    });

    setMarkers(newMarkers);
  };

  // Function to get user location and center the map
  const getUserLocationAndCenterMap = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        map.setCenter([longitude, latitude]);
        map.setZoom(14);
      }, (error) => {
        console.error("Error getting user location:", error);
      });
    } else {
      console.error("Geolocation is not supported by this browser.");
    }
  };

  useEffect(() => {
    if (!map) return;

    // Add event listeners for drawing
    map.on('draw.create', handleDrawChange);
    map.on('draw.update', handleDrawChange);
    map.on('draw.delete', clearMarkers);

    // Disable double-click zoom while drawing a polygon
    map.on('draw.modechange', (e) => {
      if (e.mode === 'draw_polygon') {
        map.doubleClickZoom.disable();
      } else {
        map.doubleClickZoom.enable();
      }
    });

    getUserLocationAndCenterMap(); // Center map on user location

  }, [map]);

  useEffect(() => {
    const initializeMap = () => {
      const newMap = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-74.5, 40],
        zoom: 9,
      });

      newMap.on('load', () => {
        const drawControl = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            polygon: true,
            trash: true,
          },
        });

        newMap.addControl(drawControl, 'top-left');
        setDraw(drawControl);
        setMap(newMap);
      });
    };

    initializeMap();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.utilityBar}>
        {/* Manual Search Inputs */}
        <input
          type="text"
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="Enter address"
          className={styles.searchInput}
        />
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
        <button onClick={runManualSearch} className={styles.searchButton}>
          Search
        </button>

        {/* Draw Perimeter Button */}
        <button onClick={() => draw.changeMode('draw_polygon')} className={styles.drawButton}>
          Draw Perimeter
        </button>

        {/* Loading GIF */}
        {loading && <img src="/loading.gif" alt="Loading..." className={styles.loadingGif} />}
      </div>

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

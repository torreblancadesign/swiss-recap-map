import React, { useEffect, useState } from "react";
import mapboxgl from 'mapbox-gl';
import mapboxSdk from '@mapbox/mapbox-sdk/services/geocoding';
import Modal from 'react-modal';
import 'mapbox-gl/dist/mapbox-gl.css';

// Airtable setup
const AIRTABLE_BASE_ID = 'appTxnvKxOeLPaZau';
const AIRTABLE_API_KEY = 'patRH8HKZBvltgwAe.5d9119f89fe8ab95f51dc75fdbea0cb39ae2b885238cb87316712f46b8811025';
const AIRTABLE_TABLE_NAME = 'Locations';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZW5yaXF1ZXRjaGF0IiwiYSI6ImNrczVvdnJ5eTFlNWEycHJ3ZXlqZjFhaXUifQ.71mYPeoLXSujYlj4X5bQnQ';
const mapboxClient = mapboxSdk({ accessToken: mapboxgl.accessToken });

// Custom Modal styles
const customModalStyles = {
  overlay: { backgroundColor: 'rgba(0, 0, 0, 0.75)', zIndex: 1000 },
  content: {
    margin: 'auto', width: '70%', maxWidth: '90%', borderRadius: '12px',
    padding: '30px', backgroundColor: '#fff', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
  },
};

const Component = () => {
  const mapContainer = React.useRef(null);
  const [map, setMap] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalData, setModalData] = useState(null);

  // Fetch locations from Airtable
  const fetchLocations = async () => {
    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
      );
      const data = await response.json();
      return data.records;
    } catch (error) {
      console.error("Error fetching data from Airtable:", error);
      return [];
    }
  };

  // Open modal with location details
  const openModal = (data) => {
    setModalData(data);
    setModalIsOpen(true);
  };

  const closeModal = () => setModalIsOpen(false);

  // Initialize the map
  const initializeMap = (locations) => {
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5795, 39.8283], // Default center (USA)
      zoom: 4,
    });

    locations.forEach((location) => {
      const { Location: address, Name: name, Details: details } = location.fields;

      // Geocode the address and add pins to the map
      mapboxClient.forwardGeocode({ query: address, limit: 1 }).send().then((response) => {
        if (response.body.features.length) {
          const coords = response.body.features[0].center;
          const marker = new mapboxgl.Marker()
            .setLngLat(coords)
            .setPopup(new mapboxgl.Popup().setText(name))
            .addTo(newMap);

          marker.getElement().addEventListener('click', () => {
            openModal({ name, address, details });
          });
        }
      });
    });

    setMap(newMap);
  };

  useEffect(() => {
    fetchLocations().then((locations) => {
      initializeMap(locations);
    });
  }, []);

  return (
    <div>
      <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />

      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Location Details" style={customModalStyles}>
        {modalData && (
          <div>
            <h2>{modalData.name}</h2>
            <p><strong>Address:</strong> {modalData.address}</p>
            <p><strong>Details:</strong> {modalData.details}</p>
            <button onClick={closeModal}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Component;

 
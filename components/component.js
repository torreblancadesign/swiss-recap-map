import React, { useEffect, useState } from "react";
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw'; // Import Mapbox GL Draw
import GeocodingService from '@mapbox/mapbox-sdk/services/geocoding'; // Correct import for geocoding service
import Modal from 'react-modal';
import * as turf from '@turf/turf';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'; // Import draw plugin CSS
import styles from "../styles/style.module.css";
import Airtable from "airtable";

// Airtable setup
const AIRTABLE_BASE_ID = 'appfneeayYzKwUswi';
const AIRTABLE_API_KEY = 'patYHNJ5hea9eGNqX.ded164971cf49f9356c1838f032ede54a9f227563dbc5f89460c7f9795aaedf2';
const AIRTABLE_TABLE_NAME = 'Map Scout';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiZW5yaXF1ZXRjaGF0IiwiYSI6ImNrczVvdnJ5eTFlNWEycHJ3ZXlqZjFhaXUifQ.71mYPeoLXSujYlj4X5bQnQ';

let base;
if (typeof window !== "undefined") {
  base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
}

const geocodingClient = GeocodingService({ accessToken: mapboxgl.accessToken });
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

const Component = () => {
  const mapContainer = React.useRef(null);
  const [map, setMap] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [popup, setPopup] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [interestingBusinesses, setInterestingBusinesses] = useState(new Set());
  const [notInterestingBusinesses, setNotInterestingBusinesses] = useState(new Set());
  const [engagementBusinesses, setEngagementBusinesses] = useState(new Set());
  const [negativeFeedbackBusinesses, setNegativeFeedbackBusinesses] = useState(new Set());

  useEffect(() => {
    if (base) {
      fetchBusinessesFromAirtable();
    }
  }, []);

  const fetchBusinessesFromAirtable = () => {
    base(AIRTABLE_TABLE_NAME)
      .select()
      .eachPage((records, fetchNextPage) => {
        const interesting = new Set();
        const notInteresting = new Set();
        const engagement = new Set();
        const negativeFeedback = new Set();
        records.forEach(record => {
          const status = record.fields.Status;
          const id = record.fields.businessID;
          if (status === 'Interesting') interesting.add(id);
          else if (status === 'Not Interesting') notInteresting.add(id);
          else if (status === 'Engagement') engagement.add(id);
          else if (status === 'Negative Feedback') negativeFeedback.add(id);
        });
        setInterestingBusinesses(interesting);
        setNotInterestingBusinesses(notInteresting);
        setEngagementBusinesses(engagement);
        setNegativeFeedbackBusinesses(negativeFeedback);
        fetchNextPage();
      });
  };

  const clearMarkers = () => {
    markers.forEach(marker => marker.remove());
    setMarkers([]);
  };

  const openModal = (data) => {
    setModalData(data);
    setModalIsOpen(true);
  };

  const closeModal = () => setModalIsOpen(false);

  const addBusinessMarkers = (businesses, map) => {
    const newMarkers = businesses.map(business => {
      const { center: [longitude, latitude], place_name: address, id: businessID } = business;
      const name = business.text;
      const isInteresting = interestingBusinesses.has(businessID);
      const isNotInteresting = notInterestingBusinesses.has(businessID);
      const isEngagement = engagementBusinesses.has(businessID);
      const isNegativeFeedback = negativeFeedbackBusinesses.has(businessID);

      let markerColor = '#3FB1CE';
      if (isInteresting) markerColor = "green";
      else if (isNotInteresting) markerColor = "grey";
      else if (isEngagement) markerColor = "gold";
      else if (isNegativeFeedback) markerColor = "red";

      const marker = new mapboxgl.Marker({ color: markerColor })
        .setLngLat([longitude, latitude])
        .addTo(map);

      const buttonDisabled = {
        interesting: isInteresting ? 'disabled' : '',
        notInteresting: isNotInteresting ? 'disabled' : '',
        engagement: isEngagement ? 'disabled' : '',
        negativeFeedback: isNegativeFeedback ? 'disabled' : '',
      };

      marker.getElement().addEventListener('mouseenter', () => {
        const popupContent = `
          <h4>${name}</h4>
          <p><strong>Address:</strong> ${address}</p>
          <button ${buttonDisabled.interesting} id="interesting-${businessID}" class="interesting-button">Interesting</button>
          <button ${buttonDisabled.notInteresting} id="not-interesting-${businessID}" class="not-interesting-button">Not Interesting</button>
          <button ${buttonDisabled.engagement} id="engagement-${businessID}" class="engagement-button">Engagement</button>
          <button ${buttonDisabled.negativeFeedback} id="negativeFeedback-${businessID}" class="negative-feedback-button">Negative Feedback</button>
        `;

        const newPopup = new mapboxgl.Popup({ offset: 25 })
          .setLngLat([longitude, latitude])
          .setHTML(popupContent)
          .addTo(map);

        setPopup(newPopup);

        document.getElementById(`interesting-${businessID}`).addEventListener('click', () => updateBusinessStatus(business, 'Interesting', 'green'));
        document.getElementById(`not-interesting-${businessID}`).addEventListener('click', () => updateBusinessStatus(business, 'Not Interesting', 'grey'));
        document.getElementById(`engagement-${businessID}`).addEventListener('click', () => updateBusinessStatus(business, 'Engagement', 'gold'));
        document.getElementById(`negativeFeedback-${businessID}`).addEventListener('click', () => updateBusinessStatus(business, 'Negative Feedback', 'red'));
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

  const updateMarkerColor = (business, newColor) => {
    business.marker.remove();
    const newMarker = new mapboxgl.Marker({ color: newColor })
      .setLngLat([business.longitude, business.latitude])
      .addTo(map);
    business.marker = newMarker;
  };

  const updateBusinessStatus = (business, status, newColor) => {
    base(AIRTABLE_TABLE_NAME)
      .select({ filterByFormula: `{businessID} = '${business.businessID}'` })
      .firstPage((err, records) => {
        if (err) return console.error('Error finding business in Airtable:', err);
        
        const recordId = records.length > 0 ? records[0].id : null;
        const data = {
          Name: business.name,
          Address: business.address,
          latitude: business.latitude,
          longitude: business.longitude,
          Status: status,
          businessID: business.businessID
        };
        
        if (recordId) {
          base(AIRTABLE_TABLE_NAME).update(recordId, data, (err) => {
            if (err) console.error('Error updating business status:', err);
            else console.log(`Business ${business.businessID} updated to ${status}.`);
          });
        } else {
          base(AIRTABLE_TABLE_NAME).create(data, (err) => {
            if (err) console.error('Error adding new business to Airtable:', err);
            else console.log(`Business ${business.businessID} added as ${status}.`);
          });
        }

        updateMarkerColor(business, newColor);
      });
  };

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

    map.on('draw.create', handleDrawChange);
    map.on('draw.update', handleDrawChange);
    map.on('draw.delete', clearMarkers);

    map.on('draw.modechange', (e) => {
      if (e.mode === 'draw_polygon') {
        map.doubleClickZoom.disable();
      } else {
        map.doubleClickZoom.enable();
      }
    });

    getUserLocationAndCenterMap();
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
      <div ref={mapContainer} className={styles.mapContainer} />
      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Location Details" style={customModalStyles}>
        {modalData && (
          <div className={styles.modalContent}>
            <h2>{modalData.name}</h2>
            <p><strong>Address:</strong> {modalData.locAddress}</p>
            <button onClick={closeModal}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Component;

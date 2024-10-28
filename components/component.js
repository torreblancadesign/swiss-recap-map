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

const Component = () => {
  const mapContainer = React.useRef(null);
  const [map, setMap] = useState(null);
  const [draw, setDraw] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [popup, setPopup] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [interestingBusinesses, setInterestingBusinesses] = useState(new Set());
  const [notInterestingBusinesses, setNotInterestingBusinesses] = useState(new Set());
  const [engagementBusinesses, setEngagementBusinesses] = useState(new Set());
  const [negativeFeedbackBusinesses, setNegativeFeedbackBusinesses] = useState(new Set());

  useEffect(() => {
    if (base) {
      fetchBusinessesFromAirtable();
    }
  }, []);

  useEffect(() => {
    if (map) {
      initializeMapEvents();
    }
  }, [map]);

  const fetchBusinessesFromAirtable = () => {
    base(AIRTABLE_TABLE_NAME)
      .select()
      .eachPage((records, fetchNextPage) => {
        const interesting = new Set();
        const notInteresting = new Set();
        const engagement = new Set();
        const negativeFeedback = new Set();
        records.forEach(record => {
          if (record.fields.Status === 'Interesting') {
            interesting.add(record.fields.businessID);
          } else if (record.fields.Status === 'Not Interesting') {
            notInteresting.add(record.fields.businessID);
          } else if (record.fields.Status === 'Engagement') {
            engagement.add(record.fields.businessID);
          } else if (record.fields.Status === 'Negative Feedback') {
            negativeFeedback.add(record.fields.businessID);
          }
        });
        setInterestingBusinesses(interesting);
        setNotInterestingBusinesses(notInteresting);
        setEngagementBusinesses(engagement);
        setNegativeFeedbackBusinesses(negativeFeedback);
        fetchNextPage();
      });
  };

  const initializeMapEvents = () => {
    const drawControl = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    map.addControl(drawControl, 'top-left');
    setDraw(drawControl);

    map.on('draw.create', handleDrawCreate);
    map.on('draw.update', handleDrawUpdate);
    map.on('draw.delete', clearMarkers);
  };

  const handleDrawCreate = (e) => {
    const features = e.features;
    if (features.length) {
      const polygon = features[0];
      const bbox = turf.bbox(polygon);
      searchForBusinessesWithinPolygon(bbox);
    }
  };

  const handleDrawUpdate = (e) => {
    clearMarkers();
    handleDrawCreate(e);
  };

  const clearMarkers = () => {
    markers.forEach(marker => marker.remove());
    setMarkers([]);
  };

  const searchForBusinessesWithinPolygon = (bbox) => {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    geocodingClient.forwardGeocode({
      query: 'restaurant, grocery, gas station',
      bbox: [minLng, minLat, maxLng, maxLat],
      limit: 50,
    })
    .send()
    .then((response) => {
      const businesses = response.body.features;
      if (businesses.length) {
        addBusinessMarkers(businesses, map);
      }
    })
    .catch((err) => {
      console.error("Error fetching businesses within polygon:", err);
    });
  };

  const addBusinessMarkers = (businesses, map) => {
    const newMarkers = businesses.map(business => {
      const { center: [longitude, latitude], place_name: address, id: businessID } = business;
      const name = business.text;
      const properties = business.properties || {};
      const phone = properties.tel || 'N/A';
      const email = properties.email || 'N/A';
      const businessType = properties.category || 'N/A';
      const isInteresting = interestingBusinesses.has(businessID);
      const isNotInteresting = notInterestingBusinesses.has(businessID);
      const isEngagement = engagementBusinesses.has(businessID);
      const isNegativeFeedback = negativeFeedbackBusinesses.has(businessID);

      let markerColor = "#3FB1CE";
      if (isInteresting) markerColor = "green";
      if (isNotInteresting) markerColor = "grey";
      if (isEngagement) markerColor = "gold";
      if (isNegativeFeedback) markerColor = "red";

      const marker = new mapboxgl.Marker({ color: markerColor })
        .setLngLat([longitude, latitude])
        .addTo(map);

      marker.getElement().addEventListener('mouseenter', () => {
        const popupContent = `
          <h4>${name}</h4>
          <p><strong>Address:</strong> ${address}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Type:</strong> ${businessType}</p>
          <button ${isInteresting ? 'disabled' : ''} id="interesting-${businessID}" class="interesting-button">Interesting</button>
          <button ${isNotInteresting ? 'disabled' : ''} id="not-interesting-${businessID}" class="not-interesting-button">Not Interesting</button>
          <button ${isEngagement ? 'disabled' : ''} id="engagement-${businessID}" class="engagement-button">Engagement</button>
          <button ${isNegativeFeedback ? 'disabled' : ''} id="negative-feedback-${businessID}" class="negative-feedback-button">Negative Feedback</button>
        `;

        if (popup) {
          popup.remove();
        }

        const newPopup = new mapboxgl.Popup({ offset: 25 })
          .setLngLat([longitude, latitude])
          .setHTML(popupContent)
          .addTo(map);

        setPopup(newPopup);

        document.getElementById(`interesting-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Interesting', "green");
        });

        document.getElementById(`not-interesting-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Not Interesting', "grey");
        });

        document.getElementById(`engagement-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Engagement', "gold");
        });

        document.getElementById(`negative-feedback-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Negative Feedback', "red");
        });
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

  const updateBusinessStatus = (business, status, newColor) => {
    const updateSets = {
      'Interesting': setInterestingBusinesses,
      'Not Interesting': setNotInterestingBusinesses,
      'Engagement': setEngagementBusinesses,
      'Negative Feedback': setNegativeFeedbackBusinesses,
    };

    Object.keys(updateSets).forEach(key => {
      if (key === status) {
        updateSets[key](prev => new Set(prev).add(business.businessID));
      } else {
        updateSets[key](prev => {
          const newSet = new Set(prev);
          newSet.delete(business.businessID);
          return newSet;
        });
      }
    });

    updateMarkerColor(business, newColor);

    base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{businessID} = '${business.businessID}'`
      })
      .firstPage((err, records) => {
        if (err) {
          console.error('Error finding business in Airtable:', err);
          return;
        }

        if (records.length > 0) {
          const recordId = records[0].id;
          base(AIRTABLE_TABLE_NAME).update(recordId, {
            "Status": status
          }, (updateErr) => {
            if (updateErr) {
              console.error('Error updating business status:', updateErr);
            } else {
              console.log(`Business ${business.businessID} updated to ${status}.`);
            }
          });
        } else {
          base(AIRTABLE_TABLE_NAME).create({
            "Name": business.name,
            "Address": business.address,
            "latitude": business.latitude,
            "longitude": business.longitude,
            "Status": status,
            "businessID": business.businessID
          }, (createErr) => {
            if (createErr) {
              console.error('Error adding new business to Airtable:', createErr);
            } else {
              console.log(`Business ${business.businessID} added as ${status}.`);
            }
          });
        }
      });
  };

  const updateMarkerColor = (business, newColor) => {
    business.marker.getElement().style.backgroundColor = newColor;
  };

  useEffect(() => {
    if (!map) {
      const initializeMap = () => {
        const newMap = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-74.5, 40],
          zoom: 9,
        });

        newMap.on('load', () => {
          setMap(newMap);
        });
      };

      initializeMap();
    }
  }, [map]);

  return (
    <div className={styles.container}>
      <div className={styles.utilityBar}>
        <input
          type="text"
          placeholder="Enter address"
          className={styles.searchInput}
        />
        <button className={styles.searchButton}>
          Search
        </button>
        <button onClick={() => draw && draw.changeMode('draw_polygon')} className={styles.drawButton}>
          Draw Perimeter
        </button>
      </div>

      <div ref={mapContainer} className={styles.mapContainer} />
      <Modal isOpen={modalIsOpen} onRequestClose={() => setModalIsOpen(false)} contentLabel="Location Details" style={customModalStyles}>
        {modalData && (
          <div className={styles.modalContent}>
            <h2>{modalData.name}</h2>
            <p><strong>Address:</strong> {modalData.locAddress}</p>
            <p><strong>Details:</strong> {modalData.details}</p>
            <button onClick={() => setModalIsOpen(false)}>Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Component;

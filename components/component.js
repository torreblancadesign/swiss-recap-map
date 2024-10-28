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
  const [interestingBusinesses, setInterestingBusinesses] = useState(new Set());
  const [notInterestingBusinesses, setNotInterestingBusinesses] = useState(new Set()); // Track Not Interesting businesses
  const [engagementBusinesses, setEngagementBusinesses] = useState(new Set());
  const [negativeBusinesses, setNegativeBusinesses] = useState(new Set()); // Track Not Interesting businesses

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
        const negative = new Set();
        records.forEach(record => {
          if (record.fields.Status === 'Interesting') {
            interesting.add(record.fields.businessID);
          } else if (record.fields.Status === 'Not Interesting') {
            notInteresting.add(record.fields.businessID);
          } else if (record.fields.Status === 'Engagement') {
            engagement.add(record.fields.businessID);
          } else if (record.fields.Status === 'Negative Feedback') {
            negative.add(record.fields.businessID);
          }
          
        });
        setInterestingBusinesses(interesting);
        setNotInterestingBusinesses(notInteresting);
        setEngagementBusinesses(engagement);
        setNegativeBusinesses(negative);
        fetchNextPage();
      });
  };

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

  const searchForBusinessesWithinPolygon = async (bbox) => {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cellSize = 0.1; // Adjust cell size as needed
  const maxPages = 5; // Maximum pages per proximity location

  const allBusinesses = new Set();

  // Helper to create unique keys for deduplication
  const getUniqueKey = (business) => `${business.id}-${business.place_name}`;

  // Function to fetch businesses for a specific proximity location
  const fetchBusinessesAtLocation = async (lng, lat, page) => {
    try {
      const response = await geocodingClient
        .forwardGeocode({
          query: 'restaurant, grocery, gas station',
          proximity: [lng, lat],
          limit: 10, // Limit per query for pagination
        })
        .send();

      const businesses = response.body?.features;
      if (businesses && businesses.length > 0) {
        businesses.forEach(business => allBusinesses.add(getUniqueKey(business)));
      }
    } catch (error) {
      console.error("Error fetching businesses:", error);
    }
  };

  // Loop through the bounding box in a grid pattern
  for (let lng = minLng; lng < maxLng; lng += cellSize) {
    for (let lat = minLat; lat < maxLat; lat += cellSize) {
      for (let page = 1; page <= maxPages; page++) {
        await fetchBusinessesAtLocation(lng, lat, page);
      }
    }
  }

  // Convert the Set of unique businesses to an array of business objects
  const uniqueBusinesses = Array.from(allBusinesses).map(businessKey => {
    const [id, placeName] = businessKey.split('-');
    return { id, place_name: placeName };
  });

  if (uniqueBusinesses.length === 0) {
    console.log("No businesses found within this polygon.");
  } else {
    console.log("Businesses found within polygon:", uniqueBusinesses);
    addBusinessMarkers(uniqueBusinesses, map); // Add markers to the map
  }
};



  // Fetch businesses within the bounding box of the drawn polygon
  /*const searchForBusinessesWithinPolygon = (bbox) => {
    const [minLng, minLat, maxLng, maxLat] = bbox;

    console.log('Bounding box:', { minLng, minLat, maxLng, maxLat });

    // Query Mapbox API within the bounding box
    geocodingClient.forwardGeocode({
      query: 'restaurant, grocery, gas station',
      bbox: [minLng, minLat, maxLng, maxLat], // The bounding box calculated from the polygon
      limit: 100, // You can adjust the limit as needed
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
*/
  // Fetch businesses by manual search (address and radius)
  const runManualSearch = async () => {
    if (!map) return;

    setLoading(true);
    geocodingClient.forwardGeocode({
      query: searchAddress,
      proximity: map.getCenter(),
      limit: 100,
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
      const { center: [longitude, latitude], place_name: address, id: businessID } = business;
      const name = business.text;
      const properties = business.properties || {};
      const phone = properties.tel || 'N/A'; 
      const email = properties.email || 'N/A'; 
      const businessType = properties.category || 'N/A';
      const isInteresting = interestingBusinesses.has(businessID);
      const isNotInteresting = notInterestingBusinesses.has(businessID);
      const engagement = engagementBusinesses.has(businessID);
      const negative = negativeBusinesses.has(businessID);

      console.log("Adding marker for business:", name);

      const markerColor = isInteresting ? "#008000" : isNotInteresting ? "#808080"  : engagement ? "#FFD700" : negative ? "#FF0000" : "#3FB1CE";
      const marker = new mapboxgl.Marker({ color: markerColor })
        .setLngLat([longitude, latitude])
        .addTo(map);

      const buttonDisabledInteresting = isInteresting ? 'disabled' : '';
      const buttonDisabledNotInteresting = isNotInteresting ? 'disabled' : '';
      const buttonDisabledEngagement = engagement ? 'disabled' : '';
      const buttonDisabledNegative = negative ? 'disabled' : '';

      marker.getElement().addEventListener('mouseenter', () => {
        const popupContent = `
          <h4>${name}</h4>
          <p><strong>Address:</strong> ${address}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Type:</strong> ${businessType}</p>
          <button ${buttonDisabledInteresting} id="interesting-${businessID}" class="interesting-button">Interesting</button>
          <button ${buttonDisabledNotInteresting} id="not-interesting-${businessID}" class="not-interesting-button">Not Interesting</button>
          <button ${buttonDisabledEngagement} id="engagement-${businessID}" class="engagement-button">Engagement</button>
          <button ${buttonDisabledNegative} id="negative-${businessID}" class="negative-button">Negative Feedback</button>
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
          }, 'Interesting', "#008000");
        });

        document.getElementById(`not-interesting-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Not Interesting', "#808080");
        });

        document.getElementById(`engagement-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Engagement', "#FFD700");
        });

        document.getElementById(`negative-${businessID}`).addEventListener('click', () => {
          updateBusinessStatus({
            name,
            address,
            latitude,
            longitude,
            businessID,
            marker,
          }, 'Negative Feedback', "#FF0000");
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

 const updateMarkerColor = (business, newColor) => {
  // Remove the old marker
  business.marker.remove();

  // Create a new marker at the same coordinates with the new color
  const newMarker = new mapboxgl.Marker({ color: newColor })
    .setLngLat([business.longitude, business.latitude])
    .addTo(map);

  // Reattach hover and click event listeners for the new marker
  newMarker.getElement().addEventListener('mouseenter', () => {
    const isInteresting = interestingBusinesses.has(business.businessID);
    const isNotInteresting = notInterestingBusinesses.has(business.businessID);
    const isEngagement = engagementBusinesses.has(business.businessID);
    const isNegative = negativeBusinesses.has(business.businessID);

    // Disable/Enable buttons based on both 'Interesting' and 'Not Interesting' sets
    const buttonDisabledInteresting = isInteresting ? 'disabled' : '';
    const buttonDisabledNotInteresting = isNotInteresting ? 'disabled' : '';
    const buttonDisabledEngagement = isEngagement ? 'disabled' : '';
    const buttonDisabledNegative = isNegative ? 'disabled' : '';

    const popupContent = `
      <h4>${business.name}</h4>
      <p><strong>Address:</strong> ${business.address}</p>
      <p><strong>Phone:</strong> ${business.phone || 'N/A'}</p>
      <p><strong>Email:</strong> ${business.email || 'N/A'}</p>
      <p><strong>Type:</strong> ${business.businessType || 'N/A'}</p>
      <button ${buttonDisabledInteresting} id="interesting-${business.businessID}" class="interesting-button">Interesting</button>
      <button ${buttonDisabledNotInteresting} id="not-interesting-${business.businessID}" class="not-interesting-button">Not Interesting</button>
      <button ${buttonDisabledEngagement} id="engagement-${business.businessID}" class="engagement-button">Engagement</button>
      <button ${buttonDisabledNegative} id="negative-${business.businessID}" class="negative-button">Negative Feedback</button>
    `;

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setLngLat([business.longitude, business.latitude])
      .setHTML(popupContent)
      .addTo(map);

    setPopup(popup);

    // Add click event listeners for buttons
    document.getElementById(`interesting-${business.businessID}`).addEventListener('click', () => {
      updateBusinessStatus(business, 'Interesting', "#008000");
    });

    document.getElementById(`not-interesting-${business.businessID}`).addEventListener('click', () => {
      updateBusinessStatus(business, 'Not Interesting', "#808080");
    });

    document.getElementById(`engagement-${business.businessID}`).addEventListener('click', () => {
      updateBusinessStatus(business, 'Engagement', "#FFD700");
    });

    document.getElementById(`negative-${business.businessID}`).addEventListener('click', () => {
      updateBusinessStatus(business, 'Negative Feedback', "#FF0000");
    });
  });

  newMarker.getElement().addEventListener('mouseleave', () => {
    if (popup) {
      popup.remove();
      setPopup(null);
    }
  });

  // Update the business object with the new marker
  business.marker = newMarker;
};

// Function to update business status in Airtable
const updateBusinessStatus = (business, status, newColor) => {
  const interestingButton = document.getElementById(`interesting-${business.businessID}`);
  const notInterestingButton = document.getElementById(`not-interesting-${business.businessID}`);
  const engagementButton = document.getElementById(`engagement-${business.businessID}`);
  const negativeButton = document.getElementById(`negative-${business.businessID}`);

  // Disable the button that was clicked
  if (status === 'Interesting') {
    interestingButton.setAttribute('disabled', 'disabled');
    notInterestingButton.removeAttribute('disabled');
    engagementButton.removeAttribute('disabled');
    negativeButton.removeAttribute('disabled');
    interestingBusinesses.add(business.businessID);
    notInterestingBusinesses.delete(business.businessID); // Remove from 'Not Interesting' set
    engagementBusinesses.delete(business.businessID);
    negativeBusinesses.delete(business.businessID);
  } 
  else if (status === 'Engagement') {
    engagementButton.setAttribute('disabled', 'disabled');
    notInterestingButton.removeAttribute('disabled');
    interestingButton.removeAttribute('disabled');
    negativeButton.removeAttribute('disabled');
    engagementBusinesses.add(business.businessID);
    notInterestingBusinesses.delete(business.businessID); // Remove from 'Not Interesting' set
    interestingBusinesses.delete(business.businessID);
    negativeBusinesses.delete(business.businessID);
  } 
  else if (status === 'Negative Feedback') {
    negativeButton.setAttribute('disabled', 'disabled');
    notInterestingButton.removeAttribute('disabled');
    engagementButton.removeAttribute('disabled');
    interestingButton.removeAttribute('disabled');
    negativeBusinesses.add(business.businessID);
    notInterestingBusinesses.delete(business.businessID); // Remove from 'Not Interesting' set
    engagementBusinesses.delete(business.businessID);
    interestingBusinesses.delete(business.businessID);
  }
  else if (status === 'Not Interesting') {
    notInterestingButton.setAttribute('disabled', 'disabled');
    negativeButton.removeAttribute('disabled');
    engagementButton.removeAttribute('disabled');
    interestingButton.removeAttribute('disabled');
    notInterestingBusinesses.add(business.businessID);
    negativeBusinesses.delete(business.businessID); // Remove from 'Not Interesting' set
    engagementBusinesses.delete(business.businessID);
    interestingBusinesses.delete(business.businessID);
  }

  // Update the marker color immediately
  updateMarkerColor(business, newColor);

  // Check if a record for this business already exists, if so, update it
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
        // Update the existing record
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
        // Add a new record if not found
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

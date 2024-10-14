import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import styles from "../styles/style.module.css";

mapboxgl.accessToken = 'YOUR_ACCESS_TOKEN_HERE';

const Component = () => {
  const mapContainerRef = useRef(null);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [-95.7129, 37.0902], // longitude, latitude
      zoom: 3
    });

    map.on('load', () => {
      // Add first location marker
      new mapboxgl.Marker()
        .setLngLat([-74.0060, 40.7128])  // New York coordinates
        .addTo(map);
      
      // Add second location marker
      new mapboxgl.Marker()
        .setLngLat([-118.2437, 34.0522])  // Los Angeles coordinates
        .addTo(map);
    });

    // Clean up on unmount
    return () => map.remove();
  }, []);

  return (
    <div ref={mapContainerRef} className={styles.mapContainer} />
  );
};

export default Component;
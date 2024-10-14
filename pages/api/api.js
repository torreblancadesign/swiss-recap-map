// File: pages/api/locations.js

export default function handler(req, res) {
  // Check if the method is GET
  if (req.method === 'GET') {
    // Data for pinned locations on the map
    const locations = [
      {
        id: 1,
        name: "Location 1",
        coordinates: { lat: 40.712776, lng: -74.005974 } // Example coordinates for New York
      },
      {
        id: 2,
        name: "Location 2",
        coordinates: { lat: 34.052235, lng: -118.243683 } // Example coordinates for Los Angeles
      }
      // Additional locations can be added here
    ];

    // Send the array of locations as JSON
    res.status(200).json(locations);
  } else {
    // Respond with method not allowed if not GET request
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
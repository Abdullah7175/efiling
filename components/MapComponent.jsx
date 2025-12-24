"use client";

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  GiPositionMarker 
} from 'react-icons/gi';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const MapComponent = () => {
  const mapRef = useRef(null);
  const markersRef = useRef(L.layerGroup());
  const [mapData, setMapData] = useState([]);
  const [filters, setFilters] = useState({
    district_id: '',
    town_id: '',
    subtown_id: '',
    complaint_type_id: '',
    complaint_subtype_id: '',
    status_id: '',
    creator_type: '',
    date_from: '',
    date_to: ''
  });
  const [filterOptions, setFilterOptions] = useState({
    districts: [],
    towns: [],
    subtowns: [],
    complaintTypes: [],
    complaintSubtypes: [],
    statuses: [],
    creatorTypes: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const response = await fetch('/api/dashboard/filters');
        if (response.ok) {
          const data = await response.json();
          setFilterOptions(data);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };
    fetchFilterOptions();
  }, []);

  // Fetch map data
  useEffect(() => {
    const fetchMapData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
        
        const response = await fetch(`/api/dashboard/map?${params}`);
        if (response.ok) {
          const data = await response.json();
          setMapData(data.data);
        }
      } catch (error) {
        console.error('Error fetching map data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMapData();
  }, [filters]);

  const getIconByStatus = (status) => {
    let icon;

    switch (status) {
      case "Completed":
        icon = <GiPositionMarker color="green" size={32} />;
        break;
      case "In Progress":
        icon = <GiPositionMarker color="orange" size={32} />;
        break;
      case "Pending":
        icon = <GiPositionMarker color="red" size={32} />;
        break;
      case "Assigned":
        icon = <GiPositionMarker color="blue" size={32} />;
        break;
      case "Cancelled":
        icon = <GiPositionMarker color="gray" size={32} />;
        break;
      default:
        icon = <GiPositionMarker color="gray" size={32} />;
    }

    return L.divIcon({
      html: renderToStaticMarkup(icon),
      className: 'custom-icon',
      iconSize: [32, 32],
    });
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('karachiMap').setView([24.866, 67.0255], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapRef.current);

      markersRef.current.addTo(mapRef.current);
    }
  }, []);

  // Update markers when map data changes
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.clearLayers();

    mapData.forEach((request) => {
      const { position, status, title, description, address, town, district, subtown, complaintType, complaintSubtype, creator, creatorType, executiveEngineer, contractor, requestDate, budgetCode, fileType, natureOfWork, mediaCounts, assignedAgentsCount, additionalLocations } = request;

      if (position.lat && position.lng) {
        const marker = L.marker([position.lat, position.lng], {
          icon: getIconByStatus(status),
        });

        // const popupContent = `
        //   <div style="font-family: sans-serif; line-height: 1.5; max-width: 350px;">
        //     <h3 style="margin-bottom: 10px; color: #2c3e50;">${title}</h3>
        //     <p><strong>Status:</strong> <span style="color: ${status === 'Completed' ? 'green' : status === 'Pending' ? 'red' : status === 'In Progress' ? 'orange' : 'blue'}">${status}</span></p>
        //     <p><strong>Description:</strong> ${description}</p>
        //     <p><strong>Address:</strong> ${address}</p>
        //     <p><strong>Location:</strong> ${town}${district ? `, ${district}` : ''}${subtown ? `, ${subtown}` : ''}</p>
        //     <p><strong>Department:</strong> ${complaintType}</p>
        //     ${complaintSubtype ? `<p><strong>Work Type:</strong> ${complaintSubtype}</p>` : ''}
        //     <p><strong>Created by:</strong> ${creator} (${creatorType})</p>
        //     ${executiveEngineer ? `<p><strong>Executive Engineer:</strong> ${executiveEngineer}</p>` : ''}
        //     ${contractor ? `<p><strong>Contractor:</strong> ${contractor}</p>` : ''}
        //     <p><strong>Request Date:</strong> ${new Date(requestDate).toLocaleDateString()}</p>
        //     ${budgetCode ? `<p><strong>Budget Code:</strong> ${budgetCode}</p>` : ''}
        //     ${fileType ? `<p><strong>File Type:</strong> ${fileType}</p>` : ''}
        //     ${natureOfWork ? `<p><strong>Nature of Work:</strong> ${natureOfWork}</p>` : ''}
        //     <p><strong>Media:</strong> ${mediaCounts.images} images, ${mediaCounts.videos} videos, ${mediaCounts.finalVideos} final videos</p>
        //     <p><strong>Assigned Agents:</strong> ${assignedAgentsCount}</p>
        //     ${additionalLocations.length > 0 ? `<p><strong>Additional Locations:</strong> ${additionalLocations.length}</p>` : ''}
        //   </div>
        // `;

        // marker.bindPopup(popupContent);
        
        // Add click handler to show detailed popup
        marker.on('click', () => {
          setSelectedRequest(request);
        });

        markersRef.current.addLayer(marker);
      }
    });
  }, [mapData]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      district_id: '',
      town_id: '',
      subtown_id: '',
      complaint_type_id: '',
      complaint_subtype_id: '',
      status_id: '',
      creator_type: '',
      date_from: '',
      date_to: ''
    });
  };

  // Ensure modal appears above map
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .leaflet-container {
        z-index: 1 !important;
      }
      .leaflet-control-container {
        z-index: 2 !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="relative">
      {/* Filter Controls */}
      <div className="mb-4 flex flex-wrap gap-4 items-end">
        <Button
          onClick={() => setShowFilters(!showFilters)}
          variant="outline"
          className="mb-2"
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>
        
        {showFilters && (
          <>
            <div className="space-y-4">
              {/* First Row - Geographic Filters */}
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                  <select
                    className="border rounded px-3 py-2 shadow w-[180px]"
                    value={filters.district_id}
                    onChange={(e) => handleFilterChange('district_id', e.target.value)}
                  >
                    <option value="">All Districts</option>
                    {filterOptions.districts.map(district => (
                      <option key={district.id} value={district.id}>{district.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Town</label>
                  <select
                    className="border rounded px-3 py-2 shadow w-[180px]"
                    value={filters.town_id}
                    onChange={(e) => handleFilterChange('town_id', e.target.value)}
                  >
                    <option value="">All Towns</option>
                    {filterOptions.towns.map(town => (
                      <option key={town.id} value={town.id}>{town.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subtown</label>
                  <select
                    className="border rounded px-3 py-2 shadow w-[180px]"
                    value={filters.subtown_id}
                    onChange={(e) => handleFilterChange('subtown_id', e.target.value)}
                  >
                    <option value="">All Subtowns</option>
                    {filterOptions.subtowns.map(subtown => (
                      <option key={subtown.id} value={subtown.id}>{subtown.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Second Row - Work Type Filters */}
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    className="border rounded px-3 py-2 shadow min-w-[150px]"
                    value={filters.complaint_type_id}
                    onChange={(e) => handleFilterChange('complaint_type_id', e.target.value)}
                  >
                    <option value="">All Departments</option>
                    {filterOptions.complaintTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                  <select
                    className="border rounded px-3 py-2 shadow min-w-[150px]"
                    value={filters.complaint_subtype_id}
                    onChange={(e) => handleFilterChange('complaint_subtype_id', e.target.value)}
                  >
                    <option value="">All Work Types</option>
                    {filterOptions.complaintSubtypes.map(subtype => (
                      <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    className="border rounded px-3 py-2 shadow min-w-[150px]"
                    value={filters.status_id}
                    onChange={(e) => handleFilterChange('status_id', e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    {filterOptions.statuses.map(status => (
                      <option key={status.id} value={status.id}>{status.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Creator Type</label>
                  <select
                    className="border rounded px-3 py-2 shadow min-w-[150px]"
                    value={filters.creator_type}
                    onChange={(e) => handleFilterChange('creator_type', e.target.value)}
                  >
                    <option value="">All Creator Types</option>
                    {filterOptions.creatorTypes.map(type => (
                      <option key={type.name} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Third Row - Date Filters and Clear Button */}
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                  <input
                    type="date"
                    className="border rounded px-3 py-2 shadow"
                    value={filters.date_from}
                    onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                  <input
                    type="date"
                    className="border rounded px-3 py-2 shadow"
                    value={filters.date_to}
                    onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  />
                </div>

                <div>
                  <Button onClick={clearFilters} variant="outline">
                    Clear Filters
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Map Container */}
      <div className="relative">
    <div id="karachiMap" className="h-[500px] w-full rounded shadow" />
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
            <div className="text-lg">Loading map data...</div>
          </div>
        )}
      </div>

      {/* Selected Request Details Modal */}
      {selectedRequest && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedRequest(null);
            }
          }}
        >
          <Card 
            className="max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Request #{selectedRequest.id}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRequest(null)}
                >
                  Close
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Status:</strong>
                  <Badge variant={selectedRequest.status === 'Completed' ? 'success' : selectedRequest.status === 'Pending' ? 'destructive' : 'default'}>
                    {selectedRequest.status}
                  </Badge>
                </div>
                <div>
                  <strong>Request Date:</strong> {new Date(selectedRequest.requestDate).toLocaleDateString()}
                </div>
                <div>
                  <strong>Town:</strong> {selectedRequest.town}
                </div>
                <div>
                  <strong>District:</strong> {selectedRequest.district}
                </div>
                <div>
                  <strong>Department:</strong> {selectedRequest.complaintType}
                </div>
                <div>
                  <strong>Work Type:</strong> {selectedRequest.complaintSubtype || 'N/A'}
                </div>
                <div>
                  <strong>Created by:</strong> {selectedRequest.creator} ({selectedRequest.creatorType})
                </div>
                <div>
                  <strong>Executive Engineer:</strong> {selectedRequest.executiveEngineer || 'N/A'}
                </div>
                <div>
                  <strong>Contractor:</strong> {selectedRequest.contractor || 'N/A'}
                </div>
                <div>
                  <strong>Budget Code:</strong> {selectedRequest.budgetCode || 'N/A'}
                </div>
                <div>
                  <strong>File Type:</strong> {selectedRequest.fileType || 'N/A'}
                </div>
                <div>
                  <strong>Nature of Work:</strong> {selectedRequest.natureOfWork || 'N/A'}
                </div>
              </div>
              
              <div>
                <strong>Description:</strong>
                <p className="mt-1 p-3 bg-gray-50 rounded">{selectedRequest.description}</p>
              </div>
              
              <div>
                <strong>Address:</strong>
                <p className="mt-1 p-3 bg-gray-50 rounded">{selectedRequest.address}</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">{selectedRequest.mediaCounts.images}</div>
                  <div className="text-sm text-gray-600">Images</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">{selectedRequest.mediaCounts.videos}</div>
                  <div className="text-sm text-gray-600">Videos</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded">
                  <div className="text-2xl font-bold text-purple-600">{selectedRequest.mediaCounts.finalVideos}</div>
                  <div className="text-sm text-gray-600">Final Videos</div>
                </div>
              </div>

              {selectedRequest.additionalLocations.length > 0 && (
                <div>
                  <strong>Additional Locations ({selectedRequest.additionalLocations.length}):</strong>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.additionalLocations.map((location, index) => (
                      <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                        <div><strong>Location {index + 1}:</strong> {location.latitude}, {location.longitude}</div>
                        {location.description && <div><strong>Description:</strong> {location.description}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
  </div>
  );
};

export default MapComponent;

// Country data with coordinates for major cities (EU Member States + UK)
// Distinct fill colors (no red/blue families — routes use red & blue on the map).
const countryData = {
    'Austria': { center: [47.5162, 14.5501], color: '#7B68A6' },
    'Belgium': { center: [50.5039, 4.4699], color: '#BF6516' },
    'Bulgaria': { center: [42.7339, 25.4858], color: '#008B6B' },
    'Croatia': { center: [45.1000, 15.2000], color: '#9B3192' },
    'Cyprus': { center: [35.1264, 33.4299], color: '#C9A227' },
    'Czech Republic': { center: [49.8175, 15.4730], color: '#5C4D7D' },
    'Denmark': { center: [56.2639, 9.5018], color: '#0D6961' },
    'Estonia': { center: [58.5953, 25.0136], color: '#C15A9B' },
    'Finland': { center: [61.9241, 25.7482], color: '#2E8B57' },
    'France': { center: [46.2276, 2.2137], color: '#6B2D5C' },
    'Germany': { center: [51.1657, 10.4515], color: '#3D9970' },
    'Greece': { center: [39.0742, 21.8243], color: '#D47300' },
    'Hungary': { center: [47.1625, 19.5033], color: '#8B6914' },
    'Ireland': { center: [53.1424, -7.6921], color: '#1B7F3A' },
    'Italy': { center: [41.8719, 12.5674], color: '#A23B72' },
    'Latvia': { center: [56.8796, 24.6032], color: '#4B296B' },
    'Lithuania': { center: [55.1694, 23.8813], color: '#E6A800' },
    'Luxembourg': { center: [49.8153, 6.1296], color: '#A0522D' },
    'Malta': { center: [35.9375, 14.3754], color: '#1B5E20' },
    'Netherlands': { center: [52.1326, 5.2913], color: '#EF6C00' },
    'Poland': { center: [51.9194, 19.1451], color: '#AB47BC' },
    'Portugal': { center: [39.3999, -8.2245], color: '#00A896' },
    'Romania': { center: [45.9432, 24.9668], color: '#A65E2E' },
    'Slovakia': { center: [48.6690, 19.6990], color: '#558B2F' },
    'Slovenia': { center: [46.1512, 14.9955], color: '#7D3885' },
    'Spain': { center: [40.4637, -3.7492], color: '#BBA000' },
    'Sweden': { center: [60.1282, 18.6435], color: '#512DA8' },
    'United Kingdom': { center: [55.3781, -3.4360], color: '#33691E' }
};

// GeoJSON (datasets/geo-countries) uses different names than our UI for some countries
const GEOJSON_NAME_TO_APP_COUNTRY = {
    'Czechia': 'Czech Republic'
};

function appCountryKeyFromGeoJSON(geojsonName) {
    return GEOJSON_NAME_TO_APP_COUNTRY[geojsonName] || geojsonName;
}

// Global data storage
let selectedCountries = new Set();
let accommodations = [];
let visitedCities = [];
let cityGeocodingCache = {};
let map;
let layers = {
    accommodationLines: [],
    visitedCityLines: [],
    markers: []
};
let showNonSelectedCountries = true;
let showRoads = true;
let geojsonLayer = null;
let customCountryColors = {};

const DEFAULT_TRIP_TITLE = 'Travel Map';
let tripTitle = DEFAULT_TRIP_TITLE;

// Initialize map
function initMap() {
    map = L.map('map').setView([20, 0], 2);
    
    // Use a minimal map layer that shows geography but no labels
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    // Country fills below routes/markers (overlayPane is 400; tiles ~200)
    const countriesPane = map.createPane('countriesPane');
    countriesPane.style.zIndex = 350;

    // Accommodation polylines + stay markers above countries, visited lines, and markerPane (600)
    const accommodationsTopPane = map.createPane('accommodationsTop');
    accommodationsTopPane.style.zIndex = 620;

    // Accommodation labels above polylines
    const accommodationLabelsPane = map.createPane('accommodationLabels');
    accommodationLabelsPane.style.zIndex = 630;

    // Load country boundaries GeoJSON
    fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
        .then(response => response.json())
        .then(data => {
            geojsonLayer = L.geoJSON(data, {
                pane: 'countriesPane',
                style: function(feature) {
                    const countryName = appCountryKeyFromGeoJSON(feature.properties.name);
                    const isSelected = selectedCountries.has(countryName);
                    
                    // Get color from countryData or use a default
                    const color = isSelected ? (countryData[countryName]?.color || '#2ecc71') : '#d3d3d3';
                    
                    return {
                        fillColor: color,
                        weight: isSelected ? 2 : 1,
                        opacity: 1,
                        color: isSelected ? '#333' : '#bbb',
                        fillOpacity: isSelected ? 0.7 : 0.2
                    };
                },
                onEachFeature: function(feature, layer) {
                    const countryName = appCountryKeyFromGeoJSON(feature.properties.name);
                    const isSelected = selectedCountries.has(countryName);
                    if (isSelected) {
                        layer.bindPopup(`<strong>${countryName}</strong>`);
                    }
                }
            }).addTo(map);
            refreshGeojsonCountryStyles();
        })
        .catch(error => console.error('Error loading GeoJSON:', error));

    // Add legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'legend');
        let isExpanded = false; // Start collapsed
        
        div.innerHTML = `
            <div class="legend-header">
                <strong style="flex: 1;">Legend</strong>
                <button class="legend-toggle-btn" title="Toggle legend">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <div class="legend-content">
                <div class="legend-item">
                    <div class="legend-color" style="background: #e74c3c;"></div>
                    <span>Accommodation → Accommodation</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #3498db;"></div>
                    <span>Accommodation → Visited Places</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #d3d3d3;"></div>
                    <span>Not Visited</span>
                </div>
            </div>
        `;
        
        const toggleBtn = div.querySelector('.legend-toggle-btn');
        const header = div.querySelector('.legend-header');
        const content = div.querySelector('.legend-content');
        
        const toggleLegend = function(e) {
            e.stopPropagation();
            isExpanded = !isExpanded;
            if (isExpanded) {
                content.classList.add('expanded');
                toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
            } else {
                content.classList.remove('expanded');
                toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
            }
        };
        
        header.addEventListener('click', toggleLegend);
        
        return div;
    };
    legend.addTo(map);
}

function getMapContainerEl() {
    return document.getElementById('mapContainer');
}

function isMapFullscreen() {
    const fs = document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement;
    return fs && fs.id === 'mapContainer';
}

function toggleMapFullscreen() {
    const btn = document.getElementById('mapFullscreenToggle');
    if (btn && btn.disabled) return;

    const el = getMapContainerEl();
    if (!el) return;

    const requestFs = el.requestFullscreen
        || el.webkitRequestFullscreen
        || el.mozRequestFullScreen
        || el.msRequestFullscreen;
    if (!requestFs) {
        alert('Fullscreen is not supported in this browser.');
        return;
    }

    if (isMapFullscreen()) {
        if (document.exitFullscreen) void document.exitFullscreen();
        else if (document.webkitExitFullscreen) void document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) void document.mozCancelFullScreen();
        else if (document.msExitFullscreen) void document.msExitFullscreen();
    } else {
        void requestFs.call(el);
    }
}

function onMapFullscreenChanged() {
    const btn = document.getElementById('mapFullscreenToggle');
    if (!btn) return;
    const on = isMapFullscreen();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Exit fullscreen' : 'Fullscreen map';
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    }
    if (typeof map !== 'undefined' && map) {
        requestAnimationFrame(function() {
            map.invalidateSize(true);
        });
        setTimeout(function() {
            map.invalidateSize(true);
        }, 200);
    }
}

function initMapFullscreenUi() {
    const el = getMapContainerEl();
    const btn = document.getElementById('mapFullscreenToggle');
    const canFs = el && (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
    if (btn && !canFs) {
        btn.disabled = true;
        btn.title = 'Fullscreen not supported';
    }
    document.addEventListener('fullscreenchange', onMapFullscreenChanged);
    document.addEventListener('webkitfullscreenchange', onMapFullscreenChanged);
    document.addEventListener('mozfullscreenchange', onMapFullscreenChanged);
    document.addEventListener('MSFullscreenChange', onMapFullscreenChanged);
}

// Initialize country selection
function initCountrySelect() {
    const container = document.getElementById('countrySelect');
    
    container.innerHTML = '';
    
    Object.keys(countryData).sort().forEach(country => {
        // Add to country selection
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `
            <input type="checkbox" value="${country}" onchange="toggleCountry('${country}')">
            <label style="margin: 0;">${country}</label>
        `;
        container.appendChild(label);
    });
    
    updateAccommodationCountrySelect();
}

// Update accommodation country select dropdown
function updateAccommodationCountrySelect() {
    const select = document.getElementById('accommodationCountry');
    select.innerHTML = '<option value="">Select a country...</option>';
    
    Array.from(selectedCountries).sort().forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}

// Toggle country selection
function toggleCountry(country) {
    if (selectedCountries.has(country)) {
        selectedCountries.delete(country);
    } else {
        selectedCountries.add(country);
    }
    
    // Update GeoJSON layer colors
    refreshGeojsonCountryStyles();
    
    updateSelectedCountriesTags();
    updateAccommodationCountrySelect();
    updateColorCountrySelect();
    updateMap();
}

function updateSidebarCounts() {
    const hc = document.getElementById('hdrCountriesCount');
    const ha = document.getElementById('hdrAccommodationsCount');
    if (hc) hc.textContent = selectedCountries.size;
    if (ha) ha.textContent = accommodations.length;
}

function syncTripTitleUI() {
    const input = document.getElementById('tripTitleInput');
    if (input) input.value = tripTitle;
    document.title = `${tripTitle} — Travel map visualizer`;
}

function onTripTitleInput() {
    const input = document.getElementById('tripTitleInput');
    if (!input) return;
    tripTitle = input.value.trim() || DEFAULT_TRIP_TITLE;
    document.title = `${tripTitle} — Travel map visualizer`;
}

// Update selected countries visual tags
function updateSelectedCountriesTags() {
    const container = document.getElementById('selectedCountriesTags');
    container.innerHTML = '';

    if (selectedCountries.size === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 0.85em; margin: 0;">No countries selected</p>';
        updateSidebarCounts();
        return;
    }

    Array.from(selectedCountries).sort().forEach(country => {
        const tag = document.createElement('div');
        tag.className = 'country-tag';
        const color = getCountryColor(country);
        tag.style.backgroundColor = color;
        tag.innerHTML = `
            <span>${country}</span>
            <button onclick="removeCountryTag('${country}')" title="Remove">✕</button>
        `;
        container.appendChild(tag);
    });
    updateSidebarCounts();
}

// Remove country from selection via tag
function removeCountryTag(country) {
    selectedCountries.delete(country);
    
    // Uncheck the checkbox
    document.querySelectorAll('.country-select input[type="checkbox"]').forEach(cb => {
        if (cb.value === country) {
            cb.checked = false;
        }
    });

    // Update GeoJSON layer colors
    refreshGeojsonCountryStyles();

    updateSelectedCountriesTags();
    updateAccommodationCountrySelect();
    updateColorCountrySelect();
    updateMap();
}

// Filter countries by search input
function filterCountries() {
    const searchInput = document.getElementById('countrySearch').value.toLowerCase();
    const checkboxItems = document.querySelectorAll('.country-select .checkbox-item');
    
    checkboxItems.forEach(item => {
        const label = item.querySelector('label').textContent.toLowerCase();
        if (label.includes(searchInput)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Get country color with custom colors override
function getCountryColor(country) {
    if (customCountryColors[country]) {
        return customCountryColors[country];
    }
    return countryData[country]?.color || '#d3d3d3';
}

function refreshGeojsonCountryStyles() {
    if (!geojsonLayer) return;
    geojsonLayer.setStyle(function(feature) {
        const countryName = appCountryKeyFromGeoJSON(feature.properties.name);
        const isSelected = selectedCountries.has(countryName);
        const color = isSelected ? getCountryColor(countryName) : '#d3d3d3';
        return {
            fillColor: color,
            weight: isSelected ? 2 : 1,
            opacity: 1,
            color: isSelected ? '#333' : '#bbb',
            fillOpacity: isSelected ? 0.7 : 0.2
        };
    });
}

// Update map display
function updateMap() {
    // Clear existing layers
    layers.accommodationLines.forEach(line => map.removeLayer(line));
    layers.visitedCityLines.forEach(line => map.removeLayer(line));
    layers.markers.forEach(marker => map.removeLayer(marker));
    layers.accommodationLines = [];
    layers.visitedCityLines = [];
    layers.markers = [];

    // Draw accommodation lines (red)
    if (showRoads && accommodations.length > 1) {
        for (let i = 0; i < accommodations.length - 1; i++) {
            const from = accommodations[i];
            const to = accommodations[i + 1];
            if (from.coords && to.coords) {
                const line = L.polyline([from.coords, to.coords], {
                    pane: 'accommodationsTop',
                    color: '#e74c3c',
                    weight: 3,
                    opacity: 0.8,
                    dashArray: '5, 5'
                }).addTo(map);
                layers.accommodationLines.push(line);
            }
        }
    }

    // Draw visited cities lines (blue) and add markers
    if (showRoads) {
        visitedCities.forEach(city => {
            if (city.accommodationCoords && city.coords) {
                const line = L.polyline([city.accommodationCoords, city.coords], {
                    color: '#3498db',
                    weight: 2,
                    opacity: 0.7
                }).addTo(map);
                layers.visitedCityLines.push(line);

                // Add marker for visited city
                const marker = L.circleMarker(city.coords, {
                    radius: 6,
                    fillColor: '#3498db',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).bindPopup(`<strong>${city.name}</strong><br>Visited from: ${city.accommodationName}`).addTo(map);
                layers.markers.push(marker);
                
                // Add label for visited city
                const cityLabel = L.marker(city.coords, {
                    icon: L.divIcon({
                        html: `<div style="
                            background: rgba(52, 152, 219, 0.9);
                            color: white;
                            padding: 3px 6px;
                            border-radius: 3px;
                            font-size: 11px;
                            font-weight: bold;
                            text-align: center;
                            white-space: nowrap;
                            margin-top: 8px;
                            pointer-events: none;
                        ">${city.name}</div>`,
                        className: 'visited-city-label',
                        iconSize: null
                    })
                }).addTo(map);
                layers.markers.push(cityLabel);
            }
        });
    }

    // Add accommodation markers
    accommodations.forEach(acc => {
        if (acc.coords) {
            const marker = L.circleMarker(acc.coords, {
                pane: 'accommodationsTop',
                radius: 8,
                fillColor: '#e74c3c',
                color: '#fff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9
            }).bindPopup(`<strong>${acc.city}</strong><br>${acc.country}`).addTo(map);
            layers.markers.push(marker);
            
            // Add label for accommodation
            const accLabel = L.marker(acc.coords, {
                pane: 'accommodationLabels',
                icon: L.divIcon({
                    html: `<div style="
                        background: rgba(231, 76, 60, 0.9);
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 11px;
                        font-weight: bold;
                        text-align: center;
                        white-space: nowrap;
                        margin-top: 8px;
                        pointer-events: none;
                    ">${acc.city}</div>`,
                    className: 'accommodation-label',
                    iconSize: null
                })
            }).addTo(map);
            layers.markers.push(accLabel);
        }
    });
}

// Geocode city name to coordinates (simplified - uses country center + offset)
async function geocodeCity(city, country) {
    const cacheKey = `${city}_${country}`;
    
    if (cityGeocodingCache[cacheKey]) {
        return cityGeocodingCache[cacheKey];
    }

    try {
        // Use Nominatim (OSM) geocoding API
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)},${encodeURIComponent(country)}&format=json&limit=1`
        );
        const data = await response.json();
        
        if (data && data.length > 0) {
            const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            cityGeocodingCache[cacheKey] = coords;
            return coords;
        }
    } catch (error) {
        console.error('Geocoding error:', error);
    }

    // Fallback: use country center
    if (countryData[country]) {
        return countryData[country].center;
    }
    
    return null;
}

// Add accommodation
async function addAccommodation() {
    const country = document.getElementById('accommodationCountry').value;
    const city = document.getElementById('accommodationCity').value;

    if (!country || !city) {
        alert('Please select a country and enter a city name');
        return;
    }

    // Geocode the city
    const coords = await geocodeCity(city, country);
    
    if (!coords) {
        alert('Could not find coordinates for this city. Try another name.');
        return;
    }

    const accommodation = { city, country, coords };
    accommodations.push(accommodation);

    // Add to selected countries
    selectedCountries.add(country);

    // Clear inputs
    document.getElementById('accommodationCity').value = '';
    document.getElementById('accommodationCountry').value = '';

    // Update UI
    renderAccommodationList();
    updateVisitedAccommodationSelect();
    updateMap();
    updateSidebarCounts();
}

// Render accommodation list
function renderAccommodationList() {
    const container = document.getElementById('accommodationList');
    container.innerHTML = '';

    const lastIdx = accommodations.length - 1;

    accommodations.forEach((acc, index) => {
        const div = document.createElement('div');
        div.className = 'accommodation-item';
        div.innerHTML = `
            <h4>${index + 1}. ${acc.city}</h4>
            <p>📍 ${acc.country}</p>
            <p style="font-size: 0.8em; color: #999;">Lat: ${acc.coords[0].toFixed(3)}, Lon: ${acc.coords[1].toFixed(3)}</p>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" onclick="moveAccommodationUp(${index})" title="Move up" ${index === 0 ? 'disabled' : ''} style="flex: 1; background: #7f8c8d; font-size: 0.85em; ${index === 0 ? 'opacity: 0.45; cursor: not-allowed;' : ''}"><i class="fa-solid fa-chevron-up"></i> Up</button>
                <button type="button" onclick="moveAccommodationDown(${index})" title="Move down" ${index === lastIdx ? 'disabled' : ''} style="flex: 1; background: #7f8c8d; font-size: 0.85em; ${index === lastIdx ? 'opacity: 0.45; cursor: not-allowed;' : ''}"><i class="fa-solid fa-chevron-down"></i> Down</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="openCoordinateModal('accommodation', ${index})" style="flex: 1; background: #3498db; font-size: 0.85em;">📍 Edit Coords</button>
                <button onclick="updateAccommodation(${index})" style="flex: 1; background: #f39c12;">✏️ Update</button>
                <button class="btn-danger" onclick="removeAccommodation(${index})" style="flex: 1;">🗑️ Delete</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// Keep visited place labels/lines aligned with stays after reorder
function syncVisitedCityAccommodationRefs() {
    visitedCities.forEach(city => {
        const acc = accommodations[city.accommodationIndex];
        if (acc) {
            city.accommodationName = `${acc.city}, ${acc.country}`;
            city.accommodationCoords = acc.coords;
        }
    });
}

// Swap stays at lowerIndex and lowerIndex + 1; fix visited city indices
function swapAccommodationsAdjacent(lowerIndex) {
    const i = lowerIndex;
    const j = i + 1;
    if (j >= accommodations.length) return;

    const tmp = accommodations[i];
    accommodations[i] = accommodations[j];
    accommodations[j] = tmp;

    visitedCities.forEach(city => {
        if (city.accommodationIndex === i) {
            city.accommodationIndex = j;
        } else if (city.accommodationIndex === j) {
            city.accommodationIndex = i;
        }
    });

    syncVisitedCityAccommodationRefs();
    renderAccommodationList();
    renderVisitedPlacesList();
    updateVisitedAccommodationSelect();
    updateMap();
}

function moveAccommodationUp(index) {
    if (index <= 0) return;
    swapAccommodationsAdjacent(index - 1);
}

function moveAccommodationDown(index) {
    if (index >= accommodations.length - 1) return;
    swapAccommodationsAdjacent(index);
}

// Remove accommodation
function removeAccommodation(index) {
    accommodations.splice(index, 1);
    visitedCities = visitedCities.filter(city => city.accommodationIndex !== index);
    
    // Adjust visited city accommodation indices
    visitedCities.forEach(city => {
        if (city.accommodationIndex > index) {
            city.accommodationIndex--;
        }
    });

    renderAccommodationList();
    renderVisitedPlacesList();
    updateVisitedAccommodationSelect();
    updateMap();
    updateSidebarCounts();
}

// Update accommodation
function updateAccommodation(index) {
    const acc = accommodations[index];
    document.getElementById('accommodationCountry').value = acc.country;
    document.getElementById('accommodationCity').value = acc.city;
    
    // Scroll to the input section
    document.querySelector('.section').scrollIntoView({ behavior: 'smooth' });
    
    // Remove the old accommodation
    accommodations.splice(index, 1);
    visitedCities = visitedCities.filter(city => city.accommodationIndex !== index);
    visitedCities.forEach(city => {
        if (city.accommodationIndex > index) {
            city.accommodationIndex--;
        }
    });
    
    renderAccommodationList();
    renderVisitedPlacesList();
    updateVisitedAccommodationSelect();
    updateMap();
    updateSidebarCounts();
}

// Update visited accommodation select dropdown
function updateVisitedAccommodationSelect() {
    const select = document.getElementById('visitedAccommodation');
    select.innerHTML = '<option value="">Select an accommodation...</option>';

    accommodations.forEach((acc, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${acc.city}, ${acc.country}`;
        select.appendChild(option);
    });
}

// Add visited city
async function addVisitedCity() {
    const accommodationIndex = document.getElementById('visitedAccommodation').value;
    const city = document.getElementById('visitedCity').value;

    if (accommodationIndex === '' || !city) {
        alert('Please select an accommodation and enter a city name');
        return;
    }

    const accommodation = accommodations[accommodationIndex];
    
    // Geocode the visited city
    const coords = await geocodeCity(city, accommodation.country);
    
    if (!coords) {
        alert('Could not find coordinates for this city. Try another name.');
        return;
    }

    const visitedCity = {
        name: city,
        accommodationName: `${accommodation.city}, ${accommodation.country}`,
        accommodationIndex: parseInt(accommodationIndex),
        accommodationCoords: accommodation.coords,
        coords: coords
    };

    visitedCities.push(visitedCity);

    // Clear inputs
    document.getElementById('visitedCity').value = '';
    document.getElementById('visitedAccommodation').value = '';

    // Update UI
    renderVisitedPlacesList();
    updateMap();
}

// Render visited places list
function renderVisitedPlacesList() {
    const container = document.getElementById('visitedPlacesList');
    if (!container) return;
    
    container.innerHTML = '';

    visitedCities.forEach((city, index) => {
        const div = document.createElement('div');
        div.className = 'accommodation-item';
        div.innerHTML = `
            <h4>${city.name}</h4>
            <p>📍 From: ${city.accommodationName}</p>
            <p style="font-size: 0.8em; color: #999;">Lat: ${city.coords[0].toFixed(3)}, Lon: ${city.coords[1].toFixed(3)}</p>
            <div style="display: flex; gap: 8px;">
                <button onclick="openCoordinateModal('place', ${index})" style="flex: 1; background: #3498db; font-size: 0.85em;">📍 Edit Coords</button>
                <button onclick="updateVisitedPlace(${index})" style="flex: 1; background: #f39c12;">✏️ Update</button>
                <button class="btn-danger" onclick="removeVisitedCity(${index})" style="flex: 1;">🗑️ Delete</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// Remove visited city
function removeVisitedCity(index) {
    visitedCities.splice(index, 1);
    renderVisitedPlacesList();
    updateMap();
}

// Update visited place
function updateVisitedPlace(index) {
    const place = visitedCities[index];
    document.getElementById('visitedAccommodation').value = place.accommodationIndex;
    document.getElementById('visitedCity').value = place.name;
    
    // Scroll to the input section
    document.querySelector('.section').scrollIntoView({ behavior: 'smooth' });
    
    // Remove the old place
    visitedCities.splice(index, 1);
    
    renderVisitedPlacesList();
    updateMap();
}

// Clear all data
function clearAll() {
    if (confirm('Are you sure you want to clear all data?')) {
        selectedCountries.clear();
        accommodations = [];
        visitedCities = [];
        cityGeocodingCache = {};
        customCountryColors = {};
        tripTitle = DEFAULT_TRIP_TITLE;
        syncTripTitleUI();

        document.getElementById('accommodationCity').value = '';
        document.getElementById('accommodationCountry').value = '';
        document.getElementById('visitedCity').value = '';
        document.getElementById('visitedAccommodation').value = '';

        // Uncheck all checkboxes
        document.querySelectorAll('.country-select input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });

        refreshGeojsonCountryStyles();

        renderAccommodationList();
        renderVisitedPlacesList();
        updateSelectedCountriesTags();
        updateAccommodationCountrySelect();
        updateColorCountrySelect();
        updateVisitedAccommodationSelect();
        updateMap();
    }
}

// Export data to JSON file
function exportData() {
    const data = {
        tripTitle: tripTitle,
        selectedCountries: Array.from(selectedCountries),
        accommodations: accommodations,
        visitedCities: visitedCities,
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    const safeBase = tripTitle.replace(/[^\w\-\s\u00C0-\u024f]/gi, '').trim().replace(/\s+/g, '_').slice(0, 48) || 'travel_map';
    link.download = `${safeBase}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert('Travel data exported successfully!');
}

// Import data from JSON file
function importData() {
    document.getElementById('importFile').click();
}

function applyTravelData(data) {
    if (!data.selectedCountries || !Array.isArray(data.selectedCountries) ||
        !data.accommodations || !Array.isArray(data.accommodations) ||
        !data.visitedCities || !Array.isArray(data.visitedCities)) {
        throw new Error('Invalid file format');
    }

    selectedCountries = new Set(data.selectedCountries);
    accommodations = data.accommodations;
    visitedCities = data.visitedCities;

    tripTitle = (typeof data.tripTitle === 'string' && data.tripTitle.trim())
        ? data.tripTitle.trim()
        : DEFAULT_TRIP_TITLE;
    syncTripTitleUI();

    document.querySelectorAll('.country-select input[type="checkbox"]').forEach(cb => {
        cb.checked = selectedCountries.has(cb.value);
    });

    refreshGeojsonCountryStyles();

    renderAccommodationList();
    renderVisitedPlacesList();
    updateSelectedCountriesTags();
    updateAccommodationCountrySelect();
    updateColorCountrySelect();
    updateVisitedAccommodationSelect();
    updateMap();
    updateSidebarCounts();
}

async function tryLoadDefaultJson() {
    try {
        const response = await fetch('default.json', { cache: 'no-store' });
        if (!response.ok) return false;

        const data = await response.json();
        applyTravelData(data);
        console.info('Loaded travel data from default.json');
        return true;
    } catch (e) {
        console.debug('default.json not loaded:', e);
        return false;
    }
}

// Handle file import
async function handleFileImport() {
    const file = document.getElementById('importFile').files[0];
    
    if (!file) return;

    try {
        const fileContent = await file.text();
        const data = JSON.parse(fileContent);
        applyTravelData(data);

        alert(`Travel data imported successfully!\n\nLoaded:\n- ${selectedCountries.size} countries\n- ${accommodations.length} accommodations\n- ${visitedCities.length} visited cities`);
    } catch (error) {
        alert('Error importing file: ' + error.message);
    }

    // Reset file input
    document.getElementById('importFile').value = '';
}

// Store current editing context
let editingContext = { type: null, index: null };

// Open coordinate modal
function openCoordinateModal(type, index) {
    editingContext = { type, index };
    
    let coords;
    if (type === 'accommodation') {
        coords = accommodations[index].coords;
    } else {
        coords = visitedCities[index].coords;
    }
    
    document.getElementById('editLat').value = coords[0].toFixed(4);
    document.getElementById('editLon').value = coords[1].toFixed(4);
    
    document.getElementById('coordinateModal').style.display = 'block';
}

// Close coordinate modal
function closeCoordinateModal() {
    document.getElementById('coordinateModal').style.display = 'none';
    editingContext = { type: null, index: null };
}

// Save edited coordinates
function saveCoordinates() {
    const lat = parseFloat(document.getElementById('editLat').value);
    const lon = parseFloat(document.getElementById('editLon').value);
    
    // Validate coordinates
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        alert('Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.');
        return;
    }
    
    if (editingContext.type === 'accommodation') {
        accommodations[editingContext.index].coords = [lat, lon];
        
        // Update visited cities that reference this accommodation
        visitedCities.forEach(city => {
            if (city.accommodationIndex === editingContext.index) {
                city.accommodationCoords = [lat, lon];
            }
        });
    } else if (editingContext.type === 'place') {
        visitedCities[editingContext.index].coords = [lat, lon];
    }
    
    renderAccommodationList();
    renderVisitedPlacesList();
    updateMap();
    closeCoordinateModal();
    alert('Coordinates updated successfully!');
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('coordinateModal');
    if (event.target == modal) {
        closeCoordinateModal();
    }
}

// Update color country select dropdown
function updateColorCountrySelect() {
    const select = document.getElementById('colorCountrySelect');
    select.innerHTML = '<option value="">Choose a country...</option>';
    
    Array.from(selectedCountries).sort().forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}

// Update color picker when country is selected
function updateColorPicker() {
    const select = document.getElementById('colorCountrySelect');
    const country = select.value;
    const colorPickerGroup = document.getElementById('colorPickerGroup');
    
    if (!country) {
        colorPickerGroup.style.display = 'none';
        return;
    }
    
    colorPickerGroup.style.display = 'block';
    const currentColor = getCountryColor(country);
    document.getElementById('colorPicker').value = currentColor;
}

// Update country color
function updateCountryColor() {
    const select = document.getElementById('colorCountrySelect');
    const country = select.value;
    const newColor = document.getElementById('colorPicker').value;
    
    if (!country) return;
    
    customCountryColors[country] = newColor;
    
    refreshGeojsonCountryStyles();
    
    updateSelectedCountriesTags();
    updateMap();
}

// Reset country color to default
function resetCountryColor() {
    const select = document.getElementById('colorCountrySelect');
    const country = select.value;
    
    if (!country) return;
    
    delete customCountryColors[country];
    document.getElementById('colorPicker').value = getCountryColor(country);
    
    refreshGeojsonCountryStyles();
    
    updateSelectedCountriesTags();
    updateMap();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    initMap();
    initMapFullscreenUi();
    initCountrySelect();

    const loadedDefault = await tryLoadDefaultJson();

    if (!loadedDefault) {
        renderAccommodationList();
        renderVisitedPlacesList();
        updateSelectedCountriesTags();
        updateAccommodationCountrySelect();
        updateColorCountrySelect();
        updateVisitedAccommodationSelect();
        updateMap();
    }
    syncTripTitleUI();
});

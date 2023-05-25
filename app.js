const mapStyle = [{
    'featureType': 'administrative',
    'elementType': 'all',
    'stylers': [{
        'visibility': 'on',
    },
        {
            'lightness': 33,
        },
    ],
},
    {
        'featureType': 'landscape',
        'elementType': 'all',
        'stylers': [{
            'color': '#f2e5d4',
        }],
    },
    {
        'featureType': 'poi.park',
        'elementType': 'geometry',
        'stylers': [{
            'color': '#c5dac6',
        }],
    },
    {
        'featureType': 'poi.park',
        'elementType': 'labels',
        'stylers': [{
            'visibility': 'on',
        },
            {
                'lightness': 20,
            },
        ],
    },
    {
        'featureType': 'road',
        'elementType': 'all',
        'stylers': [{
            'lightness': 20,
        }],
    },
    {
        'featureType': 'road.highway',
        'elementType': 'geometry',
        'stylers': [{
            'color': '#c5c6c6',
        }],
    },
    {
        'featureType': 'road.arterial',
        'elementType': 'geometry',
        'stylers': [{
            'color': '#e4d7c6',
        }],
    },
    {
        'featureType': 'road.local',
        'elementType': 'geometry',
        'stylers': [{
            'color': '#fbfaf7',
        }],
    },
    {
        'featureType': 'water',
        'elementType': 'all',
        'stylers': [{
            'visibility': 'on',
        },
            {
                'color': '#acbcc9',
            },
        ],
    },
];
var originLocation, map;
var storeLocArr = [];
storeLocArr[0] = [];
var directionsService;
var directionsRenderer;

function initMap() {
    // Create the map.
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 13.25,
        center: {lat: 10.3105615, lng: 123.9154884},
        styles: mapStyle,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();


    // Load the stores GeoJSON onto the map.
    map.data.loadGeoJson('stores.json?v=1', {idPropertyName: 'storeid'});

    // Define the custom marker icons, using the store's "category".
    map.data.setStyle((feature) => {
        return {
            icon: {
                url: `img/icon_${feature.getProperty('category')}.png`,
                scaledSize: new google.maps.Size(64, 64),
            },
        };
    });

    const apiKey = 'AIzaSyBLtKg1Z2d6waCedEn3YV2p7f35sYJMBJQ';
    const infoWindow = new google.maps.InfoWindow();

    // Show the information for a store when its marker is clicked.
    map.data.addListener('click', (event) => {
        const category = event.feature.getProperty('category');
        const name = event.feature.getProperty('name');
        const description = event.feature.getProperty('description');
        const hours = event.feature.getProperty('hours');
        const phone = event.feature.getProperty('phone');
        const img_specialty = event.feature.getProperty('img_specialty');
        const position = event.feature.getGeometry().get();
        var image_label = category == "restaurant" ? "Food Specialty" : "Banner";
        const content = `
        <img style="float:left; width:200px; margin-top:30px" src="img/logo_${category}.png">
        <div style="margin-left:220px; margin-bottom:20px;">
          <h2>${name}</h2><p>${description}</p>
          <p><b>Open:</b> ${hours}<br/><b>Phone:</b> ${phone}</p>
          <p>
            <span>${image_label}</span><br>
            <img src="img/specialty/${img_specialty}" width="200px">
          </p>
        </div>
        `;

        infoWindow.setContent(content);
        infoWindow.setPosition(position);
        infoWindow.setOptions({pixelOffset: new google.maps.Size(0, -30)});
        infoWindow.open(map);
    });

    // Build and add the search bar
    const card = document.createElement('div');
    const titleBar = document.createElement('div');
    const title = document.createElement('div');
    const container = document.createElement('div');
    const input = document.createElement('input');
    const options = {
        types: ['address'],
        componentRestrictions: {country: 'ph'},
    };

    card.setAttribute('id', 'pac-card');
    title.setAttribute('id', 'title');
    title.textContent = 'Find the nearest store';
    titleBar.appendChild(title);
    container.setAttribute('id', 'pac-container');
    input.setAttribute('id', 'pac-input');
    input.setAttribute('type', 'text');
    input.setAttribute('placeholder', 'Enter you location address');
    container.appendChild(input);
    card.appendChild(titleBar);
    card.appendChild(container);
    map.controls[google.maps.ControlPosition.TOP_RIGHT].push(card);

    // Make the search bar into a Places Autocomplete search bar and select
    // which detail fields should be returned about the place that
    // the user selects from the suggestions.
    const autocomplete = new google.maps.places.Autocomplete(input, options);

    autocomplete.setFields(
        ['address_components', 'geometry', 'name']);

    // Set the origin point when the user selects an address
    const originMarker = new google.maps.Marker({map: map});
    originMarker.setVisible(false);
    originLocation = map.getCenter();

    autocomplete.addListener('place_changed', async () => {
        originMarker.setVisible(false);
        originLocation = map.getCenter();
        const place = autocomplete.getPlace();

        if (!place.geometry) {
            // User entered the name of a Place that was not suggested and
            // pressed the Enter key, or the Place Details request failed.
            window.alert('No address available for input: \'' + place.name + '\'');
            return;
        }

        // Recenter the map to the selected address
        originLocation = place.geometry.location;
        map.setCenter(originLocation);
        map.setZoom(13.5);
        console.log(place);

        originMarker.setPosition(originLocation);
        originMarker.setVisible(true);

        // Use the selected address as the origin to calculate distances
        // to each of the store locations
        const rankedStores = await calculateDistances(map.data, originLocation, map);
        showStoresList(map.data, rankedStores);

        return;
    });


}


async function calculateDistances(data, origin, map) {
    const stores = [];
    const destinations = [];

    // Build parallel arrays for the store IDs and destinations
    data.forEach((store) => {
        const storeNum = store.getProperty('storeid');
        const storeLoc = store.getGeometry().get();

        stores.push(storeNum);
        destinations.push(storeLoc);
        storeLocArr[storeNum] = {lat: storeLoc.lat(), lng: storeLoc.lng()}
    });

    // Retrieve the distances of each store from the origin
    // The returned list will be in the same order as the destinations list
    const service = new google.maps.DistanceMatrixService();
    const getDistanceMatrix =
        (service, parameters) => new Promise((resolve, reject) => {
            service.getDistanceMatrix(parameters, (response, status) => {
                if (status != google.maps.DistanceMatrixStatus.OK) {
                    reject(response);
                } else {
                    const distances = [];
                    const results = response.rows[0].elements;
                    for (let j = 0; j < results.length; j++) {
                        const element = results[j];
                        const distanceText = element.distance.text;
                        const distanceVal = element.distance.value;
                        const distanceObject = {
                            storeid: stores[j],
                            distanceText: distanceText,
                            distanceVal: distanceVal,
                        };
                        distances.push(distanceObject);
                    }

                    resolve(distances);
                }
            });
        });

    const distancesList = await getDistanceMatrix(service, {
        origins: [origin],
        destinations: destinations,
        travelMode: 'DRIVING',
        unitSystem: google.maps.UnitSystem.METRIC,
    });

    distancesList.sort((first, second) => {
        return first.distanceVal - second.distanceVal;
    });

    return distancesList;
}

function drawLine(storeid) {


    directionsRenderer.setMap(map);
    directionsRenderer.setOptions({suppressMarkers: true});

    var request = {
        origin: originLocation.lat() + ',' + originLocation.lng(),
        destination: storeLocArr[storeid].lat + ',' + storeLocArr[storeid].lng,
        travelMode: 'DRIVING',
    };

    //DRAW LINE
    directionsService.route(request, function (result, status) {
        if (status == 'OK') {
            directionsRenderer.setDirections(result);
        }
    });
}


function showStoresList(data, stores) {
    if (stores.length == 0) {
        console.log('empty stores');
        return;
    }

    let panel = document.createElement('div');
    // If the panel already exists, use it. Else, create it and add to the page.
    if (document.getElementById('panel')) {
        panel = document.getElementById('panel');
        // If panel is already open, close it
        if (panel.classList.contains('open')) {
            panel.classList.remove('open');
        }
    } else {
        panel.setAttribute('id', 'panel');
        const body = document.body;
        body.insertBefore(panel, body.childNodes[0]);
    }


    // Clear the previous details
    while (panel.lastChild) {
        panel.removeChild(panel.lastChild);
    }

    var layerLabel = document.createElement('p');
    layerLabel.classList.add('layerlabel');
    layerLabel.textContent = "Layer";
    panel.appendChild(layerLabel);

    var checkBoxRestaurant = document.createElement("input");
    checkBoxRestaurant.setAttribute("type", "checkbox");
    checkBoxRestaurant.value = "Restaurant"
    checkBoxRestaurant.id = "Restaurant"
    checkBoxRestaurant.checked = true
    checkBoxRestaurant.onclick = function () {
        checkFilter();
    };
    panel.appendChild(checkBoxRestaurant);

    var checkBoxRestaurantLbl = document.createElement("label");
    checkBoxRestaurantLbl.setAttribute("type", "checkbox");
    checkBoxRestaurantLbl.textContent = "Restaurant"
    panel.appendChild(checkBoxRestaurantLbl);

    var checkBoxMallLbl = document.createElement("br");
    panel.appendChild(checkBoxMallLbl);

    var checkBoxMall = document.createElement("input");
    checkBoxMall.setAttribute("type", "checkbox");
    checkBoxMall.value = "Mall"
    checkBoxMall.id = "Mall"
    checkBoxMall.checked = true
    checkBoxMall.onclick = function () {
        checkFilter();
    };
    panel.appendChild(checkBoxMall);

    var checkBoxMallLbl = document.createElement("label");
    checkBoxMallLbl.setAttribute("type", "checkbox");
    checkBoxMallLbl.textContent = "Mall"
    panel.appendChild(checkBoxMallLbl);

    var checkBoxMallLbl = document.createElement("hr");
    panel.appendChild(checkBoxMallLbl);


    stores.forEach((store) => {
        // Add store details with text formatting
        const name = document.createElement('p');
        name.classList.add('place');
        const currentStore = data.getFeatureById(store.storeid);
        name.textContent = currentStore.getProperty('name');
        panel.appendChild(name);
        const distanceText = document.createElement('p');
        distanceText.classList.add('distanceText');
        distanceText.textContent = store.distanceText;
        panel.appendChild(distanceText);
        const distanceButton = document.createElement('button');
        distanceButton.classList.add('distanceButton');
        distanceButton.textContent = "Directions";
        //distanceButton.addEventListener('click', drawLine);
        distanceButton.onclick = function () {
            drawLine(store.storeid);
        };
        panel.appendChild(distanceButton);
    });

    // Open the panel
    panel.classList.add('open');

    return;
}


function checkFilter() {
    var isCheckMall = document.getElementById('Mall').checked;
    var isCheckRestaurant = document.getElementById('Restaurant').checked;

    // //SET ICON
    map.data.setStyle((feature) => {
        if (isCheckMall && feature.getProperty('category') == "mall") {
            return {
                icon: {
                    url: `img/icon_${feature.getProperty('category')}.png`,
                    scaledSize: new google.maps.Size(64, 64),
                },
            };
        } else if (isCheckRestaurant && feature.getProperty('category') == "restaurant") {
            return {
                icon: {
                    url: `img/icon_${feature.getProperty('category')}.png`,
                    scaledSize: new google.maps.Size(64, 64),
                },
            };
        } else {
            return {visible: false}
        }

    });


}
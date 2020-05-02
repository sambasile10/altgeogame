function initPano() {
    var panorama = new google.maps.StreetViewPanorama(
        document.getElementById('map'), {
            position: {lat: vLat, lng: vLong},
            addressControlOptions: {
                position: google.maps.ControlPosition.BOTTOM_CENTER
            },
            linksControl: false,
            panControl: false,
            enableCloseButton: false
        });
}
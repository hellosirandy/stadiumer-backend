var db = require('../firebase').db;
var GOOGLE_MAP_API_KEY = require('../secrets').GOOGLE_API_KEY;
var rp = require('request-promise');
var firestore = require('firebase-admin').firestore;

db.collection('stadium').where('name', '==', 'Wanda Metropolitano').get().then(function (querySnapshot) {
  querySnapshot.docs.forEach(docSnapshot => {
    var stadium = docSnapshot.data();
    var geoUri = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + 
        encodeURIComponent(stadium.name) + '&types=establishment&location=' + 
        stadium.location.latitude + ',' + stadium.location.longitude + 
        '&radius=50&key=' + GOOGLE_MAP_API_KEY;
    rp({ uri: geoUri, json: true }).then(function (response) {
      var placeId = response.predictions[0].place_id;
      var placeUri = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + 
        placeId + '&fields=formatted_address,name,website,rating,formatted_phone_number,photos&key=' + 
        GOOGLE_MAP_API_KEY;
        return rp({ uri: placeUri, json: true });
    }).then(function (response) {
      var photoReferences = (response.result.photos || []).map(photo => photo.photo_reference);
      return db.doc(`stadium/${docSnapshot.id}`).update({ photoReferences })
    }).then(() => {
      console.log(stadium.name, 'Updated');
    }).catch(err => {
      console.log(stadium.name, docSnapshot.id, err);
    });
  })
  
});
var db = require('../firestore').db;
var GOOGLE_MAP_API_KEY = require('../secrets').GOOGLE_API_KEY;
var rp = require('request-promise');
var firestore = require('firebase-admin').firestore;

var ref = db.collection('stadium');
ref.get().then(function (querySnapshot) {
  querySnapshot.docs.forEach(function (doc) {
    var data = doc.data();
    var geoUri = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + encodeURIComponent(data.name) + '&types=establishment&location=' + data.location.latitude + ',' + data.location.longitude + '&radius=500&key=' + GOOGLE_MAP_API_KEY
    rp({ uri: geoUri, json: true }).then(function (result) {
      var placeId = result.predictions[0].place_id;
      var placeUri = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + placeId + '&fields=formatted_address,name,website,rating,formatted_phone_number&key=' + GOOGLE_MAP_API_KEY
      return rp({ uri: placeUri, json: true })
    }).then(function (result) {
      ref.doc(doc.id).update({phone: result.result.formatted_phone_number, website: result.result.website, address: result.result.formatted_address}).then(function () {
        console.log(data.name, 'updated');
      })
    }).catch(function (err) {
      console.log(err);
    });
  });
});
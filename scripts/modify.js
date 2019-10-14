var db = require('../firestore').db;
var GOOGLE_MAP_API_KEY = require('../secrets').GOOGLE_API_KEY;
var rp = require('request-promise');
var firestore = require('firebase-admin').firestore;

var ref = db.collection('stadium');
ref.get().then(function (querySnapshot) {
  querySnapshot.docs.forEach(function (doc) {
    var data = doc.data();
    var uri = 'https://maps.googleapis.com/maps/api/geocode/json?result_type=sublocality&latlng=' + data.location.latitude + ',' + data.location.longitude + '&key=' + GOOGLE_MAP_API_KEY;
    rp({uri: uri, json: true}).then(function (result) {
      console.log(result.results[0].formatted_address);
    });
    // var leagues = [];
    // Object.keys(data.sports).forEach(function (sport) {
    //   Object.keys(data.sports[sport].leagues).forEach(function (league) {
    //     leagues.push(league);
    //   });
    // });
    // var updates = {leagues: leagues};
    // ref.doc(doc.id).update({leagues: leagues}).then(function () {
    //   console.log(data.name, 'updated');
    // })
  });
});
var admin = require("firebase-admin");

var serviceAccount = require("./secrets").firebaseAdmin;

var defaultApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stadiumer-a6302.firebaseio.com"
});

var firestore = defaultApp.firestore();

module.exports = {
    db: firestore,
};
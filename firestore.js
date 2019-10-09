var admin = require("firebase-admin");

var serviceAccount = require("./secrets").firebaseAdmin;

var defaultApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stadiumer-a6302.firebaseio.com"
});

var firestore = defaultApp.database().app.firestore();

module.exports = {
    db: firestore
};
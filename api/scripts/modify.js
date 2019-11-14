const GOOGLE_MAP_API_KEY = require('../../secrets').GOOGLE_API_KEY;
const admin = require("firebase-admin");
const serviceAccount = require('../../secrets').firebaseAdmin;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stadiumer-a6302.firebaseio.com",
  storageBucket: 'stadiumer-a6302.appspot.com'
});
const rp = require('request-promise');
const firestore = admin.firestore;
const db = firestore();

const modify = async () => {
  const querySnapshot = await db.collection('follow').get();
  await Promise.all(querySnapshot.docs.map(async doc => {
    const data = doc.data();
    console.log(doc.id)
    await db.collection('follows').doc(doc.id).set(data);
    const [followingQuerySnapshot, followersQuerySnapshot] = await Promise.all([
      await db.collection('follow').doc(doc.id).collection('following').get(),
      await db.collection('follow').doc(doc.id).collection('followers').get()
    ]);
    if (!followingQuerySnapshot.empty) {
      await Promise.all(followingQuerySnapshot.docs.map(
        followingDoc => db.collection('follows').doc(doc.id).collection('following').doc(followingDoc.id).set(followingDoc.data()))
      )
    }
    if (!followersQuerySnapshot.empty) {
      await Promise.all(followersQuerySnapshot.docs.map(
        followerDoc => db.collection('follows').doc(doc.id).collection('followers').doc(followerDoc.id).set(followerDoc.data()))
      )
    }
  }));
}

modify();
const firebase = require('firebase-admin');
const db = firebase.firestore();

class StadiumList {
  async getRecommended() {
    const querySnapshot = await db.collection('stadiums').limit(8).get();
    return querySnapshot.docs.map(doc => Object.assign(doc.data(), { id: doc.id }));
  }

  async getByLeagueOrTournament(type, value, limit=8) {
    const querySnapshot = await db.collection('stadiums').limit(limit).where(type, 'array-contains', value).get();
    return querySnapshot.docs.map(doc => Object.assign(doc.data(), { id: doc.id }));
  }

  async getCount() {
    const docSnapshot = await db.collection('counter').doc('stadium').get();
    return docSnapshot.data().count;
  }
}

module.exports = StadiumList;
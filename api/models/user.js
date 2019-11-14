const firebase = require('firebase-admin');
const db = firebase.firestore();

class User {
  constructor(uid) {
    if (!uid) {
      throw String('User ID is required.');
    }
    this.uid = uid;
  }
  async get() {
    const docSnapshot = await db.collection('users').doc(this.uid).get();
    if (!docSnapshot.exists) {
      throw String('Invalid User ID');
    }
    return Object.assign(docSnapshot.data(), { id: this.uid });
  }

  async getReviewsIds() {
    const querySnapshot = await db.collection('users').doc(this.uid).collection('reviews').get();
    return querySnapshot.docs.map(doc => doc.id);
  }

  async create(options) {
    return db.collection('users').doc(this.uid).set({
      firstName: options.firstName,
      lastName: options.lastName
    });
  }

  async checkFollowing(uid) {
    const docSnapshot = await db.collection('follows').doc(this.uid).collection('following').doc(uid).get();
    if (docSnapshot.exists) {
      return true;
    } else {
      return false;
    }
  }

  async update(options) {
    const updates = {};
    updates.firstName = options.firstName;
    updates.lastName = options.lastName;
    updates.profilePic = options.profilePic;
    Object.keys(updates).forEach((key) => {
      if (!updates[key]) {
        delete updates[key];
      }
    });
    await db.collection('users').doc(this.uid).update(updates);
    return this.get();
  }

  async getFollow(collection) {
    const querySnapshot = await db.collection('follows').doc(this.uid).collection(collection).get();
    return querySnapshot.docs.map(doc => doc.id);
  }

  followUser(uid) {
    return Promise.all([
      db.collection('follows').doc(this.uid).collection('following').doc(uid).set({}),
      db.collection('follows').doc(uid).collection('followers').doc(this.uid).set({})
    ]);
  }

  unFollowUser(uid) {
    return Promise.all([
      db.collection('follows').doc(this.uid).collection('following').doc(uid).delete(),
      db.collection('follows').doc(uid).collection('followers').doc(this.uid).delete()
    ]);
  }

  addReview(rid, timestamp) {
    return db.collection('users').doc(this.uid).collection('reviews').doc(rid).set({ timestamp });
  }

  removeReview(rid) {
    return db.collection('users').doc(this.uid).collection('reviews').doc(rid).delete();
  }
}

module.exports = User;
var express = require('express');
var router = express.Router();
var rp = require('request-promise');
const admin = require('firebase-admin');
const auth = admin.auth();
const db = admin.firestore();
var FIREBASE_API_KEY = require('../../secrets').FIREBASE_API_KEY;
var processReviewData = require('./review').professReviewData;
const verifyIdToken = require('../middlewares').verifyIdToken;
const getThumbnail = require('../utils').getThumbnail;

router.post('/', async (req, res) => {
  try {
    const payload = await rp.post({
      uri: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FIREBASE_API_KEY,
      form: {
        email: req.body.email,
        password: req.body.password,
        returnSecureToken: true
      },
      json: true
    });
    const token = payload.idToken;
    const expirationTime = Date.now() + Number(payload.expiresIn) * 1000;
    const refreshToken = payload.refreshToken;
    await db.collection('user').doc(payload.localId).set({
      firstName: req.body.firstName,
      lastName: req.body.lastName
    });
    return res.json({ token, expirationTime, refreshToken });
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.post('/signin', async (req, res) => {
  try {
    const payload = await rp.post({
      uri: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY,
      form: {
        email: req.body.email,
        password: req.body.password,
        returnSecureToken: true
      },
      json: true
    });
    return res.json({ 
      token: payload.idToken,
      expirationTime: Date.now() + Number(payload.expiresIn) * 1000,
      refreshToken: payload.refreshToken
    });
  } catch (e) {
    return res.status(401).json(e);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const payload = await rp.post({
      uri: 'https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY,
      form: {
        grant_type: 'refresh_token',
        refresh_token: req.body.refreshToken,
      },
      json: true
    });
    return res.json({
      token: payload.access_token,
      expirationTime: Date.now() + Number(payload.expires_in) * 1000,
      refreshToken: payload.refresh_token
    });
  } catch (e) {
    return res.status(401).json(e);
  }
});

router.get('/profile/:userId', (req, res) => {
  getUser(req.params.userId, async (err, result) => {
    if (err) {
      return res.status(400).json(err);
    }
    try {
      const decodedIdToken = await auth.verifyIdToken(req.headers.authorization || '');
      const docSnapshot = await db.collection('follow').doc(decodedIdToken.uid).collection('following').doc(req.params.userId).get();
      if (docSnapshot.exists) {
        result.following = true;
      } else {
        result.following = false;
      }
      return res.json(result);
    } catch (e) {
      result.following = false;
      return res.json(result);
    }
  });
});

router.post('/batchPreview', async (req, res) => {
  try {
    const users = await Promise.all((req.body.ids || []).map(async id => {
      const docSnapshot = await db.collection('user').doc(id).get();
      const data = docSnapshot.data();
      return {
        name: data.firstName + ' ' + data.lastName,
        profilePic: data.profilePic,
        id: docSnapshot.id
      }
    }));
    return res.json(users);
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.put('/', verifyIdToken, async (req, res) => {
  const updates = {};
  updates.firstName = req.body.firstName;
  updates.lastName = req.body.lastName;
  updates.profilePic = req.body.profilePic;
  Object.keys(updates).forEach((key) => {
    if (!updates[key]) {
      delete updates[key];
    }
  });
  try {
    await db.collection('user').doc(req.user.uid).update(updates);
    const docSnapshot = await db.collection('user').doc(req.user.uid).get();
    const data = docSnapshot.data();
    return res.status(201).json(Object.assign(data, {
      id:docSnapshot.id,
      profilePic: await getThumbnail(req.user.uid, data.profilePic),
    }));
  } catch (e) {
    return res.status(400).json({message: e.toString()});
  }
})

router.get('/', verifyIdToken, async (req, res) => {
  const uid = req.user.uid;
  return getUser(uid, (err, result) => {
    if (err) {
      return res.status(400).json(err);
    }
    return res.json(result);
  });
});

router.get('/resetPassword', verifyIdToken, async (req, res) => {
  try {
    await rp.post({
      uri: 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FIREBASE_API_KEY,
      form: {
        email: req.user.email,
        requestType: 'PASSWORD_RESET'
      },
      json: true
    });
    return res.json({ message: 'Success.' });
  } catch (e) {
    console.log(e);
    return res.status(401).json(e);
  }
});

const getUser = async (uid, callback) => {
  try {
    const [profile, reviews, follow] = await Promise.all([
      new Promise(async (resolve, reject) => {
        try {
          const docSnapshot = await db.collection('user').doc(uid).get();
          const data = docSnapshot.data();
          resolve(Object.assign(data, {
            id: uid,
            profilePic: await getThumbnail(uid, data.profilePic)
          }))
        } catch (e) {
          console.log(e);
          reject(e);
        }
      }),
      new Promise(async (resolve, reject) => {
        try {
          const querySnapshot = await db.collection('review').where('author', '==', uid).orderBy('timestamp', 'desc').get();
          const stadiumids = Array.from(new Set(querySnapshot.docs.map((doc) => {
            return doc.data().stadiumId;
          })));
          const stadiumsArray = await Promise.all(stadiumids.map(async (sid) => {
            const docSnapshot = await db.collection('stadium').doc(sid).get();
            return docSnapshot.data();
          }));
          const stadiums = {};
          stadiumids.forEach((sid, idx) => {
            stadiums[sid] = stadiumsArray[idx];
          });
          const reviews = Promise.all(querySnapshot.docs.map((doc) => {
            return processReviewData(Object.assign(doc.data(), {id: doc.id}), { stadium: stadiums[doc.data().stadiumId] });
          }));
          resolve(reviews);
        } catch (e) {
          reject(e);
        }
      }),
      new Promise(async (resolve) => {
        const [followingSnapshot, followersSnapshot] = await Promise.all([
          db.collection('follow').doc(uid).collection('following').get(),
          db.collection('follow').doc(uid).collection('followers').get(),
        ]);
        const following = followingSnapshot.docs.map(doc => doc.id);
        const followers = followersSnapshot.docs.map(doc => doc.id);
        const uids = Array.from(new Set(following.concat(followers)));
        const usersArray = await Promise.all(uids.map(async (uid) => {
          const docSnapshot = await db.collection('user').doc(uid).get();
          const data = docSnapshot.data();
          return {
            name: data.firstName + ' ' + data.lastName,
            profilePic: await getThumbnail(uid, data.profilePic),
            id: docSnapshot.id
          };
        }));
        const users = {};
        uids.forEach((uid, idx) => {
          users[uid] = usersArray[idx];
        });
        const resultFollowing = {};
        const resultFollowers = {};
        following.forEach((uid) => {
          resultFollowing[uid] = users[uid];
        });
        followers.forEach((uid) => {
          resultFollowers[uid] = users[uid];
        });
        resolve({
          following: resultFollowing,
          followers: resultFollowers
        });
      })
    ]);
    return callback(null, { profile, reviews, follow, id: uid });
  } catch (e) {
    return callback(e);
  }
}

module.exports = router;

const storage = require('firebase-admin').storage();

exports.getThumbnail = async (uid, filename) => {
  if (!filename) {
    return undefined;
  }
  const profilePicSplit = filename.split('.');
  const profilePic = profilePicSplit[0] + '_300x300.' + profilePicSplit[1];
  const urls = await storage.bucket().file('/images/profile/' + uid + '/thumbs/' + profilePic).getSignedUrl({action: 'read', expires: new Date('12/31/2030')});
  return urls[0];
}
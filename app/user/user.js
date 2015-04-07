'use strict';

var Promise = require('bluebird'),
    mongoose = Promise.promisifyAll(require('mongoose')),
    bcrypt = Promise.promisifyAll(require('bcrypt')),
    SALT_WORK_FACTOR = 10,
    Schema = mongoose.Schema;

var FollowerSchema = new Schema({
  userId: { type: Schema.Types.ObjectId },
  name: String
});

var UserSchema = new Schema({
  email: { 
    type: String, 
    required: '{PATH} is required!', 
    unique: true, 
    lowercase: true 
  },
  name: String,
  password: String,
  facebook: {
    id: String,
    email: String,
    name: String
  },
  followers: { type: [ FollowerSchema ] } 
});

UserSchema.pre('save', function (next) { 
  var user = this;
  if (!user.isModified('password')) { return next(); }

  bcrypt.genSaltAsync(SALT_WORK_FACTOR).then(function (salt) {
    return bcrypt.hashAsync(user.password, salt);
  }).then(function (hash) {
    user.password = hash;
    next();
  });
});

// User Graph functions 

UserSchema.statics.follow = function (fromUser, toUserId) {
  var query = {
    _id: toUserId,
    'followers.userId': { $ne: fromUser.id }
  };
  var update = {
    '$push': {
      'followers': {
        userId: fromUser.id,
        name: fromUser.name
      }
    }
  };
  return this.findOneAndUpdateAsync(query, update).then(function () {});
};

UserSchema.statics.unfollow = function (fromUser, toUserId) {
  var update = {
    '$pull': {
      'followers': {
        userId: fromUser.id
      }
    }
  };
  return this.findByIdAndUpdateAsync(toUserId, update).then(function () {});
};

UserSchema.statics.getFollowers = function (userId, options) {
  options = options || {};
  options.skip = options.skip || 0;
  options.limit = options.limit || 100;
  var project = { 
    'followers': { $slice: [options.skip, options.limit] },
    'followers._id': 0, 
  };
  return this.findByIdAsync(userId, project).then(function (result) {
    //TODO: handle case when result is null
    return result.followers;
  });
};

UserSchema.statics.getFollowerCount = function (userId) {
  return this.aggregateAsync([
    { $match: { "_id": mongoose.Types.ObjectId(userId) } },
    { $project: { numFollowers: { $size: '$followers' } } }
  ]).then(function (result) {
    return result[0] ? result[0].numFollowers : null;
  });
};

UserSchema.statics.getFollowing = function (userId, options) {
  options = options || {};
  options.skip = options.skip || 0;
  options.limit = options.limit || 100;
  return this.aggregateAsync([
    { $match: { 'followers.userId': mongoose.Types.ObjectId(userId) } },
    { $skip: options.skip }, 
    { $limit: options.limit },
    { $project: { name: 1, userId: '$_id', _id: 0 } }
  ]);
};

UserSchema.statics.getFollowingCount = function (userId) {
  var query = this.find({ 'followers.userId': userId });
  return query.countAsync();
};

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compareAsync(candidatePassword, this.password);
};


//Add toJSON option to transform document before returnig the result
UserSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.followers;
    delete ret.password;
  }
};
 
module.exports = mongoose.model('User', UserSchema);
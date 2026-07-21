const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const MAX_FAILED_ATTEMPTS = 6;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Owner" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinHash: { type: String, required: true }, // hashed PIN (replaces insecure localStorage PIN)
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePin = function (pin) {
  return bcrypt.compare(pin, this.pinHash);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

// Called after a failed PIN attempt. Locks the account for LOCK_DURATION_MS
// once MAX_FAILED_ATTEMPTS is reached, so a guesser can't just keep trying
// (whether from one IP or spread across many, since the rate limiter alone
// only protects per-IP).
userSchema.methods.registerFailedAttempt = async function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    this.failedLoginAttempts = 0;
  }
  await this.save();
};

userSchema.methods.registerSuccessfulLogin = async function () {
  if (this.failedLoginAttempts > 0 || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    await this.save();
  }
};

userSchema.statics.hashPin = function (pin) {
  return bcrypt.hash(pin, 10);
};

module.exports = mongoose.model("User", userSchema);

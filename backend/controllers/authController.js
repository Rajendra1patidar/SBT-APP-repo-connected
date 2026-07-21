const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Settings = require("../models/Settings");

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// POST /api/auth/register  { email, pin, name }
// Creates the owner account. Intended to be called once during setup.
exports.register = async (req, res, next) => {
  try {
    const { email, pin, name } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    if (String(pin).length < 4) {
      return res.status(400).json({ message: "PIN must be at least 4 digits" });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    const pinHash = await User.hashPin(String(pin));
    const user = await User.create({ email: email.toLowerCase(), pinHash, name: name || "Owner" });
    await Settings.create({ owner: user._id });

    res.status(201).json({ token: signToken(user._id), user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login  { email, pin }
exports.login = async (req, res, next) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or PIN" });

    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` });
    }

    const match = await user.comparePin(String(pin));
    if (!match) {
      await user.registerFailedAttempt();
      return res.status(401).json({ message: "Invalid email or PIN" });
    }

    await user.registerSuccessfulLogin();
    res.json({ token: signToken(user._id), user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-pin  { currentPin, newPin }  (protected)
exports.changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ message: "New PIN must be at least 4 digits" });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` });
    }

    const match = await user.comparePin(String(currentPin));
    if (!match) {
      await user.registerFailedAttempt();
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    await user.registerSuccessfulLogin();
    user.pinHash = await User.hashPin(String(newPin));
    await user.save();
    res.json({ message: "PIN updated" });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me  (protected)
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("-pinHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// config/db.js
const mongoose = require("mongoose");

// Set strictQuery explicitly to suppress the warning
//mongoose.set('strictQuery', true);

/**
 * Connects the API process to the configured development or production MongoDB database.
 * A failed initial connection is fatal because ticket and authentication operations
 * cannot run without persistent storage.
 *
 * @returns {Promise<void>} Resolves after connection or terminates the process on failure.
 */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);  // Remove deprecated options
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

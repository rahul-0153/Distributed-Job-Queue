const mongoose = require("mongoose");
require("dotenv").config();

const connectMongoDB = async () => {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/jobqueue";

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("🔄 MongoDB reconnected");
});

module.exports = { connectMongoDB };

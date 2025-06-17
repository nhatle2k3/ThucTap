const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  company: {
    type: String,
    required: true
  },
  route: {
    from: {
      type: String,
      required: true
    },
    to: {
      type: String,
      required: true
    }
  },
  departureTime: {
    type: Date,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  seats: {
    type: Number,
    required: true
  },
  availableSeats: {
    type: Number,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Bus', busSchema);
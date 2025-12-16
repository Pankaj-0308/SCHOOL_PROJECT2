import mongoose from 'mongoose';

const entrySchema = new mongoose.Schema({
  day: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], required: true },
  classNumber: { type: Number, required: true },
  subject: { type: String, required: true },
  period: { type: Number, default: 1 },
  startTime: { type: String }, // e.g., '09:00'
  endTime: { type: String },   // e.g., '09:45'
});

const scheduleSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  entries: [entrySchema],
});

export default mongoose.model('Schedule', scheduleSchema);

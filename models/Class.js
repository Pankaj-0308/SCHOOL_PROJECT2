import mongoose from 'mongoose';

const classSubjectSchema = new mongoose.Schema({
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  schedule: [{
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      required: true
    },
    startTime: { type: String, required: true }, // Format: "HH:MM"
    endTime: { type: String, required: true },   // Format: "HH:MM"
    room: String
  }],
  academicYear: {
    type: String, // Format: "2023-2024"
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const classSchema = new mongoose.Schema({
  classNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  section: {
    type: String,
    uppercase: true,
    default: 'A'
  },
  classTeacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  subjects: [classSubjectSchema],
  students: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    academicYear: { type: String },
    _id: false
  }],
  academicYear: {
    type: String, // Format: "2023-2024"
  },
  capacity: {
    type: Number,
    default: 40
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Add compound index to ensure unique class-section combination per academic year
classSchema.index({ classNumber: 1, section: 1, academicYear: 1 }, { unique: true });

export default mongoose.model('Class', classSchema);

import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    classNumber: { type: Number, required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    present: { type: Boolean, default: true },
    markedBy: { type: String, enum: ['teacher', 'student'], required: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);

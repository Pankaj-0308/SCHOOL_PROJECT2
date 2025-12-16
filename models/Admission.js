import mongoose from 'mongoose';

const admissionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testScore: { type: Number },
  documents: [{ type: String }],
  status: { type: String, enum: ['pending', 'test', 'documents', 'verified', 'rejected'], default: 'pending' },
  studentId: { type: String },
  requestedClass: { type: Number },
});

export default mongoose.model('Admission', admissionSchema);

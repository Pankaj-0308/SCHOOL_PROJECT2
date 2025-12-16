import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    classNumber: { type: Number, required: true },
    subject: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    dueDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Assignment', assignmentSchema);

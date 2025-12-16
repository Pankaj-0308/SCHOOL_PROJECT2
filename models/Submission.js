import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String }, // URL or text
    submittedAt: { type: Date, default: Date.now },
    grade: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model('Submission', submissionSchema);

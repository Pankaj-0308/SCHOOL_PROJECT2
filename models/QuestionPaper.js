import mongoose from 'mongoose';

const questionPaperSchema = new mongoose.Schema(
  {
    classNumber: { type: Number, required: true },
    subject: { type: String, required: true },
    year: { type: Number, required: true },
    title: { type: String, required: true },
    url: { type: String },
    content: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('QuestionPaper', questionPaperSchema);

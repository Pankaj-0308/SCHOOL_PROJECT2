import mongoose from 'mongoose';

const subjectMapSchema = new mongoose.Schema({
  classNumber: { type: Number, required: true, unique: true },
  subjects: [{ type: String, required: true }], // exactly 5 subjects per class
});

export default mongoose.model('SubjectMap', subjectMapSchema);

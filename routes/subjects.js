import express from 'express';
import SubjectMap from '../models/SubjectMap.js';

const router = express.Router();

// Get subjects for a class number
router.get('/:classNumber', async (req, res) => {
  const classNumber = Number(req.params.classNumber);
  const doc = await SubjectMap.findOne({ classNumber });
  res.json(doc ? doc.subjects : []);
});

export default router;

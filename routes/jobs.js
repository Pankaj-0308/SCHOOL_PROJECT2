import express from 'express';
import Job from '../models/Job.js';
import JobApplication from '../models/JobApplication.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public: list open jobs
router.get('/', async (req, res) => {
  const jobs = await Job.find({ status: 'open' }).sort({ createdAt: -1 });
  res.json(jobs);
});

// Admin: create job
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { title, description, classNumbers = [], subjects = [] } = req.body;
    const job = new Job({ title, description, classNumbers, subjects, createdBy: req.user.userId });
    await job.save();
    res.status(201).json(job);
  } catch (e) {
    res.status(500).json({ message: 'Failed to create job' });
  }
});

// Admin: update job
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (e) {
    res.status(500).json({ message: 'Failed to update job' });
  }
});

// Admin: close/delete job
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job deleted' });
  } catch (e) {
    res.status(500).json({ message: 'Failed to delete job' });
  }
});

// Teacher: apply to job
router.post('/:id/apply', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || job.status !== 'open') return res.status(400).json({ message: 'Job not open' });
    const existing = await JobApplication.findOne({ job: job._id, teacher: req.user.userId });
    if (existing) return res.status(400).json({ message: 'Already applied' });
    const app = new JobApplication({ job: job._id, teacher: req.user.userId, coverLetter: req.body.coverLetter || '' });
    await app.save();
    res.status(201).json(app);
  } catch (e) {
    res.status(500).json({ message: 'Failed to apply' });
  }
});

// Admin: list applications for a job
router.get('/:id/applications', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const apps = await JobApplication.find({ job: req.params.id }).populate('teacher', 'name email');
    res.json(apps);
  } catch (e) {
    res.status(500).json({ message: 'Failed to list applications' });
  }
});

// Admin: review application
router.post('/applications/:appId/review', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { decision, notes } = req.body; // decision: 'approved' | 'rejected'
    const app = await JobApplication.findByIdAndUpdate(
      req.params.appId,
      { status: decision, notes: notes || '' },
      { new: true }
    );
    if (!app) return res.status(404).json({ message: 'Application not found' });
    res.json(app);
  } catch (e) {
    res.status(500).json({ message: 'Failed to review application' });
  }
});

export default router;

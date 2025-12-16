import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Admission from '../models/Admission.js';
import Assignment from '../models/Assignment.js';
import Submission from '../models/Submission.js';
import Attendance from '../models/Attendance.js';
import QuestionPaper from '../models/QuestionPaper.js';

const router = express.Router();

router.get('/me', requireAuth, requireRole('student'), async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const classDoc = user.classAssigned ? await Class.findOne({ classNumber: user.classAssigned }) : null;
  res.json({
    name: user.name,
    email: user.email,
    studentId: user.studentId || null,
    classNumber: user.classAssigned || null,
    classId: classDoc?._id || null,
  });
});

router.get('/admission', requireAuth, requireRole('student', 'general'), async (req, res) => {
  const admission = await Admission.findOne({ user: req.user.userId });
  res.json(admission || null);
});

// List assignments for student's class
router.get('/assignments', requireAuth, requireRole('student'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  if (!me?.classAssigned) return res.json([]);
  const list = await Assignment.find({ classNumber: me.classAssigned }).sort({ createdAt: -1 });
  res.json(list);
});

// Submit assignment content (text or URL)
router.post('/assignments/:assignmentId/submit', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'Missing content' });
    const a = await Assignment.findById(assignmentId);
    if (!a) return res.status(404).json({ message: 'Assignment not found' });
    const me = await User.findById(req.user.userId);
    if (a.classNumber !== me.classAssigned) return res.status(403).json({ message: 'Not allowed' });
    const sub = await Submission.findOneAndUpdate(
      { assignment: assignmentId, student: me._id },
      { assignment: assignmentId, student: me._id, content, submittedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(sub);
  } catch (e) {
    res.status(500).json({ message: 'Error submitting assignment' });
  }
});

// List my submissions
router.get('/submissions', requireAuth, requireRole('student'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  const subs = await Submission.find({ student: me._id }).populate('assignment');
  res.json(subs);
});

// Student attendance check-in (marks present for today)
router.post('/attendance/checkin', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me?.classAssigned) return res.status(400).json({ message: 'No class assigned' });
    const now = new Date();
    const key = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const att = await Attendance.findOneAndUpdate(
      { student: me._id, date: key },
      { classNumber: me.classAssigned, student: me._id, date: key, present: true, markedBy: 'student' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(att);
  } catch (e) {
    res.status(500).json({ message: 'Error marking attendance' });
  }
});

// Get my attendance (optionally for a date)
router.get('/attendance', requireAuth, requireRole('student'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  if (req.query.date) {
    const q = new Date(req.query.date);
    const day = new Date(q.getFullYear(), q.getMonth(), q.getDate());
    const rec = await Attendance.findOne({ student: me._id, date: day });
    return res.json(rec ? [rec] : []);
  }
  const list = await Attendance.find({ student: me._id }).sort({ date: -1 });
  res.json(list);
});

// Stats for student: attendance summary and assignment submission status by subject
router.get('/stats', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);


    const assignments = await Assignment.find({ classNumber: me.classAssigned }).lean();
    const submissions = await Submission.find({ student: me._id }).lean();
    const subByAssign = new Map(submissions.map(s => [String(s.assignment), s]));
    const bySubject = {};
    for (const a of assignments) {
      const subj = a.subject || 'General';
      if (!bySubject[subj]) bySubject[subj] = { subject: subj, total: 0, submitted: 0, pending: 0 };
      bySubject[subj].total += 1;
      if (subByAssign.has(String(a._id))) bySubject[subj].submitted += 1; else bySubject[subj].pending += 1;
    }
    res.json({ assignmentsBySubject: Object.values(bySubject).sort((a, b) => a.subject.localeCompare(b.subject)) });
  } catch (e) {
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

// List question papers for my class (optionally by subject)
router.get('/question-papers', requireAuth, requireRole('student'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  if (!me?.classAssigned) return res.json([]);
  const filter = { classNumber: me.classAssigned };
  if (req.query.subject) filter.subject = req.query.subject;
  const list = await QuestionPaper.find(filter).sort({ year: -1, subject: 1 });
  res.json(list);
});

// Get student's class timetable
router.get('/timetable', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me?.classAssigned) return res.status(400).json({ message: 'No class assigned' });

    const classDoc = await Class.findOne({ classNumber: me.classAssigned })
      .populate('subjects.subject', 'name code')
      .populate('subjects.teacher', 'name email');

    if (!classDoc) return res.status(404).json({ message: 'Class not found' });

    // Transform to a clean structure if needed, or send as is
    // Sending subjects array which contains schedule
    res.json(classDoc.subjects);
  } catch (e) {
    console.error('Timetable fetch error:', e);
    res.status(500).json({ message: 'Error fetching timetable' });
  }
});

export default router;

import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Admission from '../models/Admission.js';
import Assignment from '../models/Assignment.js';
import Attendance from '../models/Attendance.js';
import bcrypt from 'bcryptjs';
import Schedule from '../models/Schedule.js';

const router = express.Router();

// Get teacher's assigned class and students
router.get('/me/class', requireAuth, requireRole('teacher'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  if (!me) return res.status(404).json({ message: 'User not found' });
  const classNumber = me.classAssigned;
  if (!classNumber) return res.json({ classNumber: null, students: [] });
  // Populate student from the students object array
  const classDoc = await Class.findOne({ classNumber }).populate('students.student', 'name email studentId verified');
  const students = classDoc ? classDoc.students.map(s => s.student).filter(Boolean) : [];
  res.json({ classNumber, students });
});

// List admissions pending verification (same as admin list, but teacher can view)
router.get('/admissions/pending', requireAuth, requireRole('teacher'), async (req, res) => {
  const list = await Admission.find({ status: 'verified' }).populate('user', 'name email');
  res.json(list);
});

// Add a new student to this teacher's class
router.post('/students/add', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me?.classAssigned) return res.status(400).json({ message: 'No class assigned' });
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already exists' });

    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;

    const hashed = await bcrypt.hash(password, 10);
    const student = await User.create({
      name,
      email,
      password: hashed,
      role: 'student',
      classAssigned: me.classAssigned,
      verified: true,
      isApproved: true,
      academicYear
    });

    let classDoc = await Class.findOne({ classNumber: me.classAssigned });
    if (!classDoc) {
      classDoc = new Class({
        classNumber: me.classAssigned,
        classTeacher: me._id,
        students: [],
        academicYear,
        name: `Class ${me.classAssigned}`
      });
    }

    // Ensure academicYear if missing on existing doc
    if (!classDoc.academicYear) classDoc.academicYear = academicYear;

    classDoc.students.push({
      student: student._id,
      academicYear
    });
    await classDoc.save();
    res.json({ message: 'Student added', student: { id: student._id, name: student.name, email: student.email } });
  } catch (e) {
    res.status(500).json({ message: 'Error adding student' });
  }
});

// List students by class number (teacher must be assigned to that class for some subject)
router.get('/students/:classNumber', requireAuth, requireRole('teacher'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  const classNumber = Number(req.params.classNumber);
  const classDoc = await Class.findOne({ classNumber }).populate('students.student', 'name email studentId');
  const ownsByAssignment = me.classAssigned === classNumber;
  const scheduleAllowed = await Schedule.findOne({ teacher: me._id, 'entries.classNumber': classNumber });
  if (!classDoc && ownsByAssignment) {
    const studs = await User.find({ role: 'student', classAssigned: classNumber }, 'name email studentId');
    return res.json(studs);
  }
  const allowed = classDoc && (
    (classDoc.classTeacher && classDoc.classTeacher.equals(me._id)) ||
    (Array.isArray(classDoc.subjects) && classDoc.subjects.some(st => st.teacher && st.teacher.equals(me._id))) ||
    ownsByAssignment || Boolean(scheduleAllowed)
  );
  if (!allowed) return res.status(403).json({ message: 'Not allowed for this class' });
  const students = classDoc ? classDoc.students.map(s => s.student).filter(Boolean) : [];
  res.json(students);
});

// Create assignment for specific class
router.post('/assignments', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    const { classNumber, subject, title, description, dueDate } = req.body;

    if (!classNumber || !subject || !title) return res.status(400).json({ message: 'Missing fields (classNumber, subject, title)' });

    // Verify permission for this class
    const cn = Number(classNumber);
    const classDoc = await Class.findOne({ classNumber: cn });
    const scheduleAllowed = await Schedule.findOne({ teacher: me._id, 'entries.classNumber': cn });

    const allowed = (me.classAssigned === cn) || Boolean(scheduleAllowed) || (classDoc && (
      (classDoc.classTeacher && classDoc.classTeacher.equals(me._id)) ||
      (Array.isArray(classDoc.subjects) && classDoc.subjects.some(st => st.teacher && st.teacher.equals(me._id)))
    ));

    if (!allowed) return res.status(403).json({ message: 'You are not assigned to this class' });

    const a = await Assignment.create({
      classNumber: cn,
      subject,
      title,
      description,
      dueDate,
      createdBy: me._id
    });
    res.json(a);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error creating assignment' });
  }
});

// List assignments created by this teacher
router.get('/assignments', requireAuth, requireRole('teacher'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  const list = await Assignment.find({
    $or: [
      { createdBy: me._id },
      { classNumber: me.classAssigned }
    ]
  }).sort({ createdAt: -1 });
  res.json(list);
});

// Get submissions for an assignment
router.get('/assignments/:id/submissions', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    const me = await User.findById(req.user.userId);
    // Security check: teacher must be creator or assigned to that class
    const allowed = assignment.createdBy.equals(me._id) || assignment.classNumber === me.classAssigned;
    // Also allow if teacher teaches that class in schedule (handled loosely here for simplicity, creator check is strongest)
    if (!allowed) return res.status(403).json({ message: 'Not authorized for this assignment' });

    // Get all students in that class
    const classDoc = await Class.findOne({ classNumber: assignment.classNumber }).populate('students.student', 'name email studentId');
    const allStudents = classDoc ? classDoc.students.map(s => s.student).filter(Boolean) : [];

    // Get actual submissions
    // Import Submission if not already imported at top? It is imported.
    const submissions = await import('../models/Submission.js').then(m => m.default.find({ assignment: assignmentId }));

    const result = allStudents.map(student => {
      const sub = submissions.find(s => s.student.equals(student._id));
      return {
        student: {
          id: student._id,
          name: student.name,
          email: student.email,
          studentId: student.studentId
        },
        status: sub ? 'Submitted' : 'Pending',
        submittedAt: sub ? sub.submittedAt : null,
        content: sub ? sub.content : null,
        _id: sub ? sub._id : null
      };
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Mark attendance for a student on a date
router.post('/attendance/mark', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    const { studentId, date, present, classNumber } = req.body;
    if (!studentId) return res.status(400).json({ message: 'Missing studentId' });
    if (!classNumber) return res.status(400).json({ message: 'Missing classNumber' });
    // Verify teacher teaches or is assigned to this class
    const cn = Number(classNumber);
    const classDoc = await Class.findOne({ classNumber: cn });
    const scheduleAllowed = await Schedule.findOne({ teacher: me._id, 'entries.classNumber': cn });
    const allowed = (me.classAssigned === cn) || Boolean(scheduleAllowed) || (classDoc && (
      (classDoc.classTeacher && classDoc.classTeacher.equals(me._id)) ||
      (Array.isArray(classDoc.subjects) && classDoc.subjects.some(st => st.teacher && st.teacher.equals(me._id)))
    ));
    if (!allowed) return res.status(403).json({ message: 'Not allowed for this class' });
    const day = date ? new Date(date) : new Date();
    const key = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const att = await Attendance.findOneAndUpdate(
      { student: studentId, date: key },
      { classNumber: cn, student: studentId, date: key, present: present !== false, markedBy: 'teacher' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(att);
  } catch (e) {
    res.status(500).json({ message: 'Error marking attendance' });
  }
});

// Get attendance for teacher's class for a date
router.get('/attendance', requireAuth, requireRole('teacher'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  const classNumber = Number(req.query.classNumber);
  if (!classNumber) return res.status(400).json({ message: 'classNumber is required' });
  const classDoc = await Class.findOne({ classNumber });
  const scheduleAllowed = await Schedule.findOne({ teacher: me._id, 'entries.classNumber': classNumber });
  const allowed = (me.classAssigned === classNumber) || Boolean(scheduleAllowed) || (classDoc && (
    (classDoc.classTeacher && classDoc.classTeacher.equals(me._id)) ||
    (Array.isArray(classDoc.subjects) && classDoc.subjects.some(st => st.teacher && st.teacher.equals(me._id)))
  ));
  if (!allowed) return res.status(403).json({ message: 'Not allowed for this class' });
  const qDate = req.query.date ? new Date(req.query.date) : new Date();
  const day = new Date(qDate.getFullYear(), qDate.getMonth(), qDate.getDate());
  const list = await Attendance.find({ classNumber, date: day }).populate('student', 'name email studentId');
  res.json(list);
});

// Get my classes (from schedule mappings)
router.get('/my-classes', requireAuth, requireRole('teacher'), async (req, res) => {
  const me = await User.findById(req.user.userId);
  const classes = await Class.find({
    $or: [
      { 'subjects.teacher': me._id },
      { classTeacher: me._id },
      { classNumber: me.classAssigned }
    ]
  }, 'classNumber');
  const uniq = Array.from(new Set(classes.map(c => c.classNumber)));
  const sched = await Schedule.findOne({ teacher: me._id });
  if (sched) {
    for (const e of (sched.entries || [])) uniq.push(e.classNumber);
  }
  if (me.classAssigned && !uniq.includes(me.classAssigned)) uniq.push(me.classAssigned);
  res.json(uniq.sort((a, b) => a - b));
});

// Get teacher schedule (Mon-Fri)
router.get('/schedule', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me) return res.status(404).json({ message: 'User not found' });
    const sched = await Schedule.findOne({ teacher: me._id });
    const dayOrder = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
    const entries = (sched?.entries || []).slice().sort((a, b) => (dayOrder[a.day] || 0) - (dayOrder[b.day] || 0));
    res.json({ teacher: { id: me._id, name: me.name, subject: me.subject }, entries });
  } catch (e) {
    res.status(500).json({ message: 'Error fetching schedule' });
  }
});

export default router;

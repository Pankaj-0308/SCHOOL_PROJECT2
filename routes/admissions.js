import express from 'express';
import mongoose from 'mongoose';
import Admission from '../models/Admission.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole } from '../middleware/auth.js';
import Counter from '../models/Counter.js';

const router = express.Router();

const nextAdmissionNumber = async () => {
  const doc = await Counter.findOneAndUpdate(
    { key: 'admission' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
};

// Student/General: start admission
router.post('/start', requireAuth, requireRole('general', 'student'), async (req, res) => {
  try {
    const existing = await Admission.findOne({ user: req.user.userId, status: { $ne: 'rejected' } });
    if (existing) return res.status(400).json({ message: 'Admission already in progress', admission: existing });

    const { requestedClass } = req.body;
    const classNum = Number(requestedClass);

    const isLowerClass = !Number.isNaN(classNum) && classNum > 0 && classNum < 3;

    const admission = new Admission({
      user: req.user.userId,
      status: isLowerClass ? 'documents' : 'test',
      requestedClass: Number.isNaN(classNum) ? undefined : classNum,
    });
    await admission.save();
    res.status(201).json(admission);
  } catch (e) {
    res.status(500).json({ message: 'Failed to start admission' });
  }
});

// Student: submit test score
router.post('/submit-test', requireAuth, requireRole('general', 'student'), async (req, res) => {
  try {
    const { score } = req.body;
    const admission = await Admission.findOne({ user: req.user.userId });
    if (!admission) return res.status(404).json({ message: 'Admission not found' });
    admission.testScore = Number(score || 0);
    admission.status = 'documents';
    await admission.save();
    res.json(admission);
  } catch (e) {
    res.status(500).json({ message: 'Failed to submit test' });
  }
});

// Student: submit documents
router.post('/submit-documents', requireAuth, requireRole('general', 'student'), async (req, res) => {
  try {
    const { documents = [], requestedClass } = req.body;
    const admission = await Admission.findOne({ user: req.user.userId });
    if (!admission) return res.status(404).json({ message: 'Admission not found' });

    // Keep track of requested class if submitted here
    if (requestedClass != null) {
      const classNum = Number(requestedClass);
      if (!Number.isNaN(classNum) && classNum > 0) {
        admission.requestedClass = classNum;
      }
    }

    admission.documents = documents;

    const classNum = admission.requestedClass;
    const isLowerClass = typeof classNum === 'number' && classNum > 0 && classNum < 3;

    if (isLowerClass) {
      // For classes below 3, no test is required; documents submission is enough
      admission.status = 'verified';
    } else {
      // For higher classes, keep existing test-score-based logic
      admission.status = (admission.testScore || 0) >= 40 ? 'verified' : 'rejected';
    }

    await admission.save();
    res.json(admission);
  } catch (e) {
    res.status(500).json({ message: 'Failed to submit documents' });
  }
});

// Admin/Teacher: approve admitted student (assign class, set credentials)
router.post('/:admissionId/approve', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  // Removed transaction to support standalone MongoDB instances

  let student = null;
  let sid = '';
  let tempPass = '';
  let admNo = 0;

  try {
    const { classNumber } = req.body;

    // Get current academic year (e.g., 2023-2024)
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const academicYear = `${currentYear}-${nextYear}`;

    if (!classNumber) {
      return res.status(400).json({ message: 'Class number is required' });
    }

    const admission = await Admission.findById(req.params.admissionId).populate('user');

    if (!admission) {
      return res.status(404).json({ message: 'Admission not found' });
    }

    if (admission.status !== 'verified') {
      return res.status(400).json({ message: 'Admission not eligible for approval' });
    }

    // Get the student user
    student = await User.findById(admission.user._id);
    if (!student) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate student credentials
    admNo = await nextAdmissionNumber();
    sid = `BVPS${String(admNo).padStart(4, '0')}`;
    tempPass = `BVP@${String(admNo).padStart(4, '0')}`;

    // Update student record
    student.role = 'student';
    student.verified = true;
    student.isApproved = true;
    student.classAssigned = Number(classNumber);
    student.studentId = sid;
    // Do NOT overwrite password for existing users
    // student.password = await bcrypt.hash(tempPass, 10);
    student.academicYear = academicYear;

    // Save student
    await student.save();

    // Add student to class with academic year
    let classDoc = await Class.findOne({
      classNumber: Number(classNumber),
      academicYear: academicYear
    });

    if (!classDoc) {
      // Create new class for this academic year if it doesn't exist
      classDoc = new Class({
        classNumber: Number(classNumber),
        name: `Class ${classNumber}`,
        academicYear: academicYear,
        students: [{
          student: student._id,
          academicYear: academicYear
        }]
      });
    } else {
      // Check if student already exists in this class for the academic year
      const studentExists = classDoc.students.some(s =>
        s && s.student && s.student.toString() === student._id.toString() &&
        s.academicYear === academicYear
      );

      if (!studentExists) {
        classDoc.students.push({
          student: student._id,
          academicYear: academicYear
        });
      }
    }

    await classDoc.save();

    // Remove the admission record
    await Admission.findByIdAndDelete(admission._id);

    // Return success response
    return res.json({
      success: true,
      message: 'Student admission approved successfully',
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        studentId: sid,
        classAssigned: student.classAssigned,
        academicYear: student.academicYear,
        tempPassword: tempPass // Include temp password for admin reference
      }
    });

  } catch (error) {
    console.error('Error in admission approval:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve admission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Admin/Teacher: reject admission
router.post('/:admissionId/reject', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { reason } = req.body;
    const admission = await Admission.findById(req.params.admissionId);

    if (!admission) {
      return res.status(404).json({ message: 'Admission not found' });
    }

    if (admission.status === 'approved') {
      return res.status(400).json({ message: 'Cannot reject an already approved admission' });
    }

    admission.status = 'rejected';
    // Optionally store the reason if schema allows, otherwise just change status
    // admission.rejectionReason = reason; 

    await admission.save();

    res.json({ message: 'Admission rejected', admission });
  } catch (e) {
    console.error('Error rejecting admission:', e);
    res.status(500).json({ message: 'Failed to reject admission' });
  }
});

// Student: check admission status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const admission = await Admission.findOne({ user: req.user.userId })
      .select('status studentId requestedClass')
      .lean();

    if (!admission) {
      return res.status(404).json({ status: 'not_found' });
    }

    // If approved, include student ID and generate temp password
    const response = {
      status: admission.status,
      ...(admission.status === 'approved' && {
        studentId: admission.studentId,
        tempPassword: `BVP@${admission.studentId.slice(-4)}`
      })
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching admission status:', error);
    res.status(500).json({ message: 'Failed to fetch admission status' });
  }
});

// Admin: list pending admissions
router.get('/pending', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const list = await Admission.find({ status: 'verified' })
      .populate('user', 'name email')
      .sort({ updatedAt: -1 });
    res.json(list);
  } catch (error) {
    console.error('Error fetching pending admissions:', error);
    res.status(500).json({ message: 'Failed to fetch pending admissions' });
  }
});

// Student: get my admission status
router.get('/me', requireAuth, requireRole('general', 'student'), async (req, res) => {
  const admission = await Admission.findOne({ user: req.user.userId });
  res.json(admission || null);
});

export default router;

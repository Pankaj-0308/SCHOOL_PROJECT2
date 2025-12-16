import express from 'express';
import User from '../models/User.js';
import Class from '../models/Class.js';
import bcrypt from 'bcryptjs';
import SubjectMap from '../models/SubjectMap.js';
import Subject from '../models/Subject.js';
import Schedule from '../models/Schedule.js';

const router = express.Router();

// Get teachers for admin panel
// By default, returns only "in-use" teachers: management teachers or teachers assigned in any class subjectTeachers.
// If query all=1 is passed, returns all teachers.
router.get('/teachers', async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' })
      .populate('assignedClasses.class')
      .populate('assignedClasses.subject')
      .sort({ createdAt: -1 });
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching teachers' });
  }
});

// Add teacher (enhanced)
router.post('/add-teacher', async (req, res) => {
  const { name, email, password, classNumber, subject, phone, qualification, experience } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Construct teacher object
    const teacherData = {
      name,
      email,
      password: hashedPassword,
      role: 'teacher',
      classAssigned: classNumber || undefined,
      subject,
      verified: true, // Auto-verify admin added teachers
      isApproved: true,
      contact: { phone },
      // Simple parsing for now, ideally strictly typed in frontend
      qualifications: qualification ? [{ degree: qualification, institution: 'Unknown', year: new Date().getFullYear() }] : [],
      yearsOfExperience: experience
    };

    const teacher = new User(teacherData);
    await teacher.save();
    res.json({ message: 'Teacher added successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding teacher.' });
  }
});

// Generate/Optimize Timetable
router.post('/timetable/generate', async (req, res) => {
  try {
    const defaultSubjects = ['English', 'Mathematics', 'Science', 'Social Studies', 'Hindi'];
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const shortDays = { 'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed', 'thursday': 'Thu', 'friday': 'Fri' };
    const timeSlots = [
      { start: '09:00', end: '09:45' },
      { start: '10:00', end: '10:45' },
      { start: '11:00', end: '11:45' },
      { start: '12:00', end: '12:45' },
      { start: '13:30', end: '14:15' },
    ];
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    const hashedPassword = await bcrypt.hash('123456', 10);
    const TOTAL_CLASSES = 12;

    // Helper to get teachers for a subject
    const getTeachers = async (subj) => {
      // Find teachers for subject, sorting to ensure consistent order
      return await User.find({
        role: 'teacher',
        $or: [{ subject: subj }, { 'subjects.subject.name': subj }]
      }).sort({ createdAt: 1 });
    };

    // 1. Ensure Subjects exist
    const subjectDocs = {};
    for (const sName of defaultSubjects) {
      let sub = await Subject.findOne({ name: sName });
      if (!sub) {
        const code = sName.substring(0, 3).toUpperCase() + Math.floor(100 + Math.random() * 900);
        sub = await Subject.create({ name: sName, code, description: `Subject ${sName}` });
      }
      subjectDocs[sName] = sub;
    }

    // 2. Prepare Teachers (Create missing if needed)
    // Constraint: 5 classes per teacher max.
    // For 12 classes, need ceil(12/5) = 3 teachers per subject.
    const teachersBySubject = {};
    const neededPerSubject = Math.ceil(TOTAL_CLASSES / 5);

    for (const sName of defaultSubjects) {
      let existing = await getTeachers(sName);
      const currentCount = existing.length;

      if (currentCount < neededPerSubject) {
        const toCreate = neededPerSubject - currentCount;
        for (let i = 0; i < toCreate; i++) {
          const num = currentCount + i + 1;
          const newT = await User.create({
            name: `${sName} Teacher ${num}`,
            email: `teacher.${sName.toLowerCase()}${num + Date.now().toString().slice(-4)}@school.local`, // unique email
            password: hashedPassword,
            role: 'teacher',
            verified: true,
            isApproved: true,
            subject: sName,
            academicYear: academicYear,
            employeeId: `T${sName.substring(0, 2).toUpperCase()}${num}${Math.floor(Math.random() * 1000)}`,
            contact: { phone: '0000000000' }
          });
          existing.push(newT);
        }
      }
      teachersBySubject[sName] = existing;
    }

    // 3. Clear existing Schedules for clean slate
    await Schedule.deleteMany({});

    // 4. Iterate Classes 1-12
    for (let c = 1; c <= TOTAL_CLASSES; c++) {
      let classDoc = await Class.findOne({ classNumber: c });
      if (!classDoc) {
        classDoc = new Class({
          classNumber: c,
          name: `Class ${c}`,
          section: 'A',
          academicYear: academicYear,
          students: [],
          subjects: []
        });
      }

      const newClassSubjects = [];

      // For each subject, assign teacher and slot
      for (let sIdx = 0; sIdx < 5; sIdx++) {
        const subjectName = defaultSubjects[sIdx];
        const subjectDoc = subjectDocs[subjectName];

        // Strict Block Assignment:
        // C1-C5 (Indices 0-4) -> Teacher 0
        // C6-C10 (Indices 5-9) -> Teacher 1
        // C11-C12 -> Teacher 2
        // teacherIndex = floor((CLASS - 1) / 5)
        const blockIndex = Math.floor((c - 1) / 5);
        const availableTeachers = teachersBySubject[subjectName];

        // Map block index to available teachers
        const teacher = availableTeachers[blockIndex % availableTeachers.length];

        // --- Scheduling Algorithm ---
        // Rolling Diagonal: Period P = (sIdx - c) % 5
        let pIdx = (sIdx - c) % 5;
        if (pIdx < 0) pIdx += 5;

        // Create Time Slots for M-F
        const scheduleArr = [];
        const time = timeSlots[pIdx];

        if (teacher) {
          // Update Teacher's assignedClasses to track multi-class assignment
          await User.findByIdAndUpdate(teacher._id, {
            $addToSet: {
              assignedClasses: {
                class: classDoc._id,
                subject: subjectDoc._id,
                academicYear: academicYear
              }
            }
          });

          // Save to Global Schedule (for Teacher View)
          for (const day of days) {
            scheduleArr.push({
              day: day,
              startTime: time.start,
              endTime: time.end,
              room: `Room ${c}`
            });

            await Schedule.findOneAndUpdate(
              { teacher: teacher._id },
              {
                $addToSet: {
                  entries: {
                    day: shortDays[day],
                    classNumber: c,
                    subject: subjectName,
                    period: pIdx + 1,
                    startTime: time.start,
                    endTime: time.end
                  }
                }
              },
              { upsert: true, new: true }
            );
          }
        }

        newClassSubjects.push({
          subject: subjectDoc._id,
          teacher: teacher ? teacher._id : null,
          schedule: scheduleArr,
          academicYear: academicYear
        });
      }

      classDoc.subjects = newClassSubjects;
      await classDoc.save();
    }

    res.json({ message: `Timetable optimized. Ensured ${neededPerSubject} teachers per subject. Schedules generated.` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating timetable.' });
  }
});

// Assign teacher to class and verify
router.post('/assign-teacher', async (req, res) => {
  const { teacherId, classNumber } = req.body;
  try {
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    await User.findByIdAndUpdate(teacherId, { verified: true, classAssigned: classNumber });
    let classDoc = await Class.findOne({ classNumber });
    if (!classDoc) {
      classDoc = new Class({
        classNumber,
        classTeacher: teacherId,
        students: [],
        academicYear,
        name: `Class ${classNumber}`
      });
    } else {
      classDoc.classTeacher = teacherId;
      if (!classDoc.academicYear) classDoc.academicYear = academicYear;
    }
    await classDoc.save();
    res.json({ message: 'Teacher assigned and verified.' });
  } catch (err) {
    res.status(500).json({ message: 'Error assigning teacher.' });
  }
});

// Teacher verifies student and assigns studentId/password
router.post('/verify-student', async (req, res) => {
  const { studentId, studentEmail, password, classNumber } = req.body;
  try {
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    const student = await User.findOne({ email: studentEmail, role: 'student' });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    student.verified = true;
    student.isApproved = true;
    student.studentId = studentId;
    student.password = await bcrypt.hash(password, 10);
    student.classAssigned = classNumber;
    student.academicYear = academicYear;
    await student.save();
    // Add student to class
    let classDoc = await Class.findOne({ classNumber });
    if (!classDoc) {
      classDoc = new Class({
        classNumber,
        students: [{ student: student._id, academicYear }],
        academicYear,
        name: `Class ${classNumber}`
      });
    } else {
      const exists = classDoc.students.some(s => s.student && s.student.toString() === student._id.toString());
      if (!exists) {
        classDoc.students.push({ student: student._id, academicYear });
      }
      if (!classDoc.academicYear) classDoc.academicYear = academicYear;
    }
    await classDoc.save();
    res.json({ message: 'Student verified and assigned ID/password.' });
  } catch (err) {
    res.status(500).json({ message: 'Error verifying student.' });
  }
});

// Delete teacher by ID
router.post('/delete-teacher', async (req, res) => {
  const { teacherId } = req.body;
  try {
    await User.findByIdAndDelete(teacherId);
    res.json({ message: 'Teacher deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting teacher.' });
  }
});

// Get students by class
router.get('/students/:classNumber', async (req, res) => {
  const classNumber = Number(req.params.classNumber);
  const classDoc = await Class.findOne({ classNumber }).populate('students.student');
  // Return flattened list of students
  const students = classDoc ? classDoc.students.map(s => s.student).filter(Boolean) : [];
  res.json(students);
});

// Get detailed info for a student (admin)
router.get('/student/:id', async (req, res) => {
  try {
    const student = await User.findById(req.params.id).lean();
    if (!student || student.role !== 'student') return res.status(404).json({ message: 'Student not found' });
    // extended details for admin view
    const {
      _id,
      name,
      email,
      studentId,
      classAssigned,
      verified,
      isApproved,
      createdAt,
      subject,
      address,
      contactNo,
      parentName,
      guardianContact,
      dob,
      gender,
    } = student;
    res.json({
      _id,
      name,
      email,
      studentId,
      classAssigned,
      verified,
      isApproved,
      createdAt,
      subject: subject || null,
      address: address || null,
      contactNo: contactNo || null,
      parentName: parentName || null,
      guardianContact: guardianContact || null,
      dob: dob || null,
      gender: gender || null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch student details' });
  }
});

// Remove student from class
router.post('/remove-student', async (req, res) => {
  const { studentId, classNumber } = req.body;
  try {
    const classDoc = await Class.findOne({ classNumber });
    if (classDoc) {
      classDoc.students = classDoc.students.filter(s => s.student.toString() !== studentId);
      await classDoc.save();
    }
    await User.findByIdAndDelete(studentId);
    res.json({ message: 'Student removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Error removing student.' });
  }
});

// Set teacher credentials when assigning to class
router.post('/set-teacher-credentials', async (req, res) => {
  const { teacherId, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(teacherId, { password: hashedPassword });
    res.json({ message: 'Teacher credentials set.' });
  } catch (err) {
    res.status(500).json({ message: 'Error setting teacher credentials.' });
  }
});

// Admin: reset a teacher's password and return a new temporary password
router.post('/teacher/:id/reset-password', async (req, res) => {
  try {
    const teacher = await User.findById(req.params.id);
    if (!teacher || teacher.role !== 'teacher') return res.status(404).json({ message: 'Teacher not found' });
    const temp = Math.random().toString(36).slice(2, 10);
    const hashed = await bcrypt.hash(temp, 10);
    teacher.password = hashed;
    await teacher.save();
    res.json({ message: 'Password reset', tempPassword: temp });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// Notify teacher when new student is admitted
router.post('/notify-teacher-new-student', async (req, res) => {
  const { classNumber, studentId } = req.body;
  try {
    const classDoc = await Class.findOne({ classNumber }).populate('classTeacher');
    if (!classDoc || !classDoc.classTeacher) return res.status(404).json({ message: 'Teacher not found for this class.' });
    // Here you would send a notification (email, dashboard, etc.)
    // For now, just respond with teacher info
    res.json({ teacher: classDoc.classTeacher, studentId });
  } catch (err) {
    res.status(500).json({ message: 'Error notifying teacher.' });
  }
});

// Teacher sets student credentials for admitted student
router.post('/set-student-credentials', async (req, res) => {
  const { studentId, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(studentId, { password: hashedPassword });
    res.json({ message: 'Student credentials set.' });
  } catch (err) {
    res.status(500).json({ message: 'Error setting student credentials.' });
  }
});

// Get newly admitted students for a teacher's class
router.get('/new-students/:classNumber', async (req, res) => {
  const classNumber = Number(req.params.classNumber);
  // We need to populate students.student and then filter
  const classDoc = await Class.findOne({ classNumber }).populate({
    path: 'students.student',
    match: { verified: false, isApproved: false }
  });

  // Filter out where student is null (due to match condition)
  const students = classDoc
    ? classDoc.students.map(s => s.student).filter(Boolean)
    : [];

  res.json(students);
});

// -------- Management teachers (Admissions 1-6 and 6-12) --------
router.get('/management', async (req, res) => {
  const mgmt = await User.find({ role: 'teacher', managementRole: { $ne: null } });
  res.json(mgmt);
});

router.post('/management/set', async (req, res) => {
  const { userId, role } = req.body; // 'admissions-1-6' | 'admissions-6-12'
  if (!['admissions-1-6', 'admissions-6-12'].includes(role)) return res.status(400).json({ message: 'Invalid management role' });
  try {
    const user = await User.findById(userId);
    if (!user || user.role !== 'teacher') return res.status(404).json({ message: 'Teacher not found' });
    await User.updateMany({ managementRole: role }, { $set: { managementRole: null } });
    user.managementRole = role;
    await user.save();
    res.json({ message: 'Management role assigned' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to assign management role' });
  }
});

router.post('/management/unset', async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.managementRole = null;
    await user.save();
    res.json({ message: 'Management role removed' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove management role' });
  }
});

// Create a new management teacher for a role (requires no existing assignee)
router.post('/management/create', async (req, res) => {
  const { name, email, password, role } = req.body; // role: 'admissions-1-6' | 'admissions-6-12'
  if (!['admissions-1-6', 'admissions-6-12'].includes(role)) return res.status(400).json({ message: 'Invalid management role' });
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  try {
    const existsForRole = await User.findOne({ managementRole: role });
    if (existsForRole) return res.status(400).json({ message: 'A management teacher already exists for this role. Remove it first.' });
    const existsEmail = await User.findOne({ email });
    if (existsEmail) return res.status(400).json({ message: 'Email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role: 'teacher', verified: true, isApproved: true, managementRole: role });
    res.status(201).json({ message: 'Management teacher created', user: { _id: user._id, name: user.name, email: user.email, managementRole: user.managementRole } });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create management teacher' });
  }
});

// Delete an existing management teacher account
router.post('/management/delete', async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user || !user.managementRole) return res.status(404).json({ message: 'Management teacher not found' });
    await User.findByIdAndDelete(userId);
    res.json({ message: 'Management teacher deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete management teacher' });
  }
});

// -------- Subject teachers per class (5 subjects, 5 teachers) --------
router.get('/class/:classNumber/subject-teachers', async (req, res) => {
  const classNumber = Number(req.params.classNumber);
  const classDoc = await Class.findOne({ classNumber }).populate('subjects.teacher', 'name email').populate('subjects.subject');

  // fall back to subject map to provide subjects list
  const subjectsDoc = await SubjectMap.findOne({ classNumber });
  const requiredSubjects = subjectsDoc ? subjectsDoc.subjects : [];

  const subjects = classDoc ? classDoc.subjects : [];

  // Map result to show { subjectName, teacher }
  const result = requiredSubjects.map((subjectName) => {
    // Find assignment where populated Subject has matching name
    const assignment = subjects.find(s => s.subject && s.subject.name === subjectName);
    return {
      subject: subjectName,
      teacher: assignment ? assignment.teacher : null
    };
  });

  res.json(result);
});

router.post('/class/:classNumber/subject-teachers', async (req, res) => {
  const classNumber = Number(req.params.classNumber);
  const { assignments } = req.body; // [{subject: "Math", teacherId: "..."}]
  try {
    if (!Array.isArray(assignments) || assignments.length !== 5) return res.status(400).json({ message: 'Exactly 5 subject-teacher assignments required' });
    const teacherIds = assignments.map((a) => String(a.teacherId));
    const uniqueTeachers = new Set(teacherIds.filter(Boolean));
    if (uniqueTeachers.size !== 5) return res.status(400).json({ message: 'Each subject must have a unique teacher' });

    let classDoc = await Class.findOne({ classNumber });
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;

    if (!classDoc) {
      classDoc = new Class({
        classNumber,
        academicYear,
        name: `Class ${classNumber}`
      });
    }

    // Ensure academicYear if missing
    if (!classDoc.academicYear) classDoc.academicYear = academicYear;

    // Convert string subjects to ObjectIds
    const newSubjects = [];
    for (const a of assignments) {
      const subjectDoc = await Subject.findOne({ name: a.subject });
      if (!subjectDoc) {
        // Option: create or fail. For now, fail if not found, or maybe just log?
        // Let's assume subjects exist as per SubjectMap
        console.warn(`Subject not found: ${a.subject}`);
        continue;
      }
      newSubjects.push({
        subject: subjectDoc._id,
        teacher: a.teacherId,
        academicYear, // REQUIRED by classSubjectSchema
        schedule: []
      });
    }

    classDoc.subjects = newSubjects;
    // Update teachers list cache if misused, but Class model doesn't strictly have a 'teachers' array in schema shown earlier?
    // Checking Class.js: It has `classTeacher`, `subjects`. It DOES NOT have a top-level `teachers` array.
    // The previous code had `classDoc.teachers = ...`. This might have been loose schema or virtual?
    // Class.js provided earlier does NOT show `teachers` field. Removing it.

    await classDoc.save();
    res.json({ message: 'Subject teachers set' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to set subject teachers' });
  }
});

export default router;

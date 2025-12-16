
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import User from './models/User.js';
import Class from './models/Class.js';
import SubjectMap from './models/SubjectMap.js';
import Schedule from './models/Schedule.js';
import Subject from './models/Subject.js';
import Attendance from './models/Attendance.js';
import Assignment from './models/Assignment.js';
import Submission from './models/Submission.js';

const mongoUri = 'mongodb://localhost:27017/school_management';
const logFile = './seed_debug.log';

// Clear log file
try { fs.unlinkSync(logFile); } catch (e) { }

function log(msg) {
    try {
        fs.appendFileSync(logFile, msg + '\n');
    } catch (e) { }
    console.log(msg);
}

// User provided data
const teachersList = [
    { name: 'Mr. Iyer', subject: 'Physics' },
    { name: 'Mrs. Bose', subject: 'Chemistry' },
    { name: 'Mr. Francis', subject: 'Biology' },
    { name: 'Ms. Rao', subject: 'GK / Moral Science' },
    { name: 'Mr. Sharma', subject: 'Math' },
    { name: 'Ms. Verma', subject: 'English' },
    { name: 'Mr. Das', subject: 'Science' },
    { name: 'Mrs. Roy', subject: 'History' },
    { name: 'Mr. Khan', subject: 'Art' },
    { name: 'Ms. Singh', subject: 'Computer' },
    { name: 'Mr. Mehta', subject: 'Geography' },
    { name: 'Mrs. Gupta', subject: 'Hindi' }
];

// Map Subject Name to Code (Simple generation)
const getCode = (name) => name.substring(0, 3).toUpperCase() + '101';

const classSchedules = {
    1: ['Physics', 'Chemistry', 'Biology', 'GK / Moral Science', 'Math'],
    2: ['Chemistry', 'Biology', 'Math', 'English', 'GK / Moral Science'],
    3: ['Biology', 'Math', 'English', 'Science', 'History'],
    4: ['GK / Moral Science', 'Math', 'English', 'Science', 'History'],
    5: ['Math', 'English', 'Science', 'History', 'Art'],
    6: ['English', 'Science', 'History', 'Art', 'Computer'],
    7: ['Science', 'History', 'Art', 'Computer', 'Geography'],
    8: ['History', 'Art', 'Computer', 'Geography', 'Hindi'],
    9: ['Art', 'Computer', 'Geography', 'Hindi', 'Physics'],
    10: ['Computer', 'Geography', 'Hindi', 'Physics', 'Chemistry'],
    11: ['Geography', 'Hindi', 'Physics', 'Chemistry', 'Biology'],
    12: ['Hindi', 'Physics', 'Chemistry', 'Biology', 'GK / Moral Science']
};

const connectDB = async () => {
    try {
        await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        log('MongoDB connected');
    } catch (err) {
        log('MongoDB connection error: ' + err);
        process.exit(1);
    }
};

const seed = async () => {
    await connectDB();

    log('Starting seed process...');
    log('WARNING: Clearing existing data to ensure clean state...');

    // Clear existing data
    await Promise.all([
        User.deleteMany({ role: { $in: ['student', 'teacher'] } }),
        Class.deleteMany({}),
        Schedule.deleteMany({}),
        SubjectMap.deleteMany({}),
        Subject.deleteMany({}),
        Attendance.deleteMany({}),
        Assignment.deleteMany({}),
        Submission.deleteMany({})
    ]);

    log('Data cleared.');

    const hashedPassword = await bcrypt.hash('123456', 10);
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;

    // 1. Create Subjects and Teachers
    const subjectDocs = {}; // Name -> Doc
    const teacherDocs = {}; // Name -> Doc

    // Unique subjects list from teachersList
    const uniqueSubjects = [...new Set(teachersList.map(t => t.subject))];

    for (const sName of uniqueSubjects) {
        // Only create if not exists (handle potential duplicates if any)
        if (!subjectDocs[sName]) {
            const sub = await Subject.create({
                name: sName,
                code: getCode(sName),
                description: `Subject ${sName}`
            });
            subjectDocs[sName] = sub;
            log(`Created Subject: ${sName}`);
        }
    }

    for (const tData of teachersList) {
        // Construct email: firstname.subject@school.local
        // Mr. Iyer -> iyer.physics@school.local
        // Remove "Mr. ", "Mrs. ", "Ms. "
        const cleanName = tData.name.replace(/^(Mr\.|Mrs\.|Ms\.)\s+/, '').replace(/\s+/g, '').toLowerCase();
        const cleanSubject = tData.subject.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const email = `${cleanName}.${cleanSubject}@school.local`;

        const teacher = await User.create({
            name: tData.name,
            email: email,
            password: hashedPassword,
            role: 'teacher',
            verified: true,
            isApproved: true,
            subject: tData.subject,
            academicYear: academicYear,
            employeeId: `T${tData.name.substring(0, 3).toUpperCase()}${Math.floor(Math.random() * 1000)}`
        });
        teacherDocs[tData.name] = teacher;
        log(`Created Teacher: ${tData.name} (${email})`);
    }

    // 2. Create Classes and Assignments
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const shortDays = { 'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed', 'thursday': 'Thu', 'friday': 'Fri' };

    // 5 Periods per day
    const timeSlots = [
        { start: '09:00', end: '09:45' },
        { start: '10:00', end: '10:45' },
        { start: '11:00', end: '11:45' },
        { start: '12:00', end: '12:45' },
        { start: '13:30', end: '14:15' },
    ];

    for (let c = 1; c <= 12; c++) {
        log(`Processing Class ${c}...`);

        let classDoc = await Class.create({
            classNumber: c,
            name: `Class ${c}`,
            section: 'A',
            academicYear: academicYear,
            students: [],
            subjects: []
        });

        // Add 5 Students per class
        for (let i = 1; i <= 5; i++) {
            const studentEmail = `student${i}.class${c}@school.local`;
            const student = await User.create({
                name: `Student ${i} Class ${c}`,
                email: studentEmail,
                password: hashedPassword,
                role: 'student',
                classAssigned: c,
                verified: true,
                isApproved: true,
                studentId: `S${c}${String(i).padStart(3, '0')}`,
                academicYear: academicYear
            });
            classDoc.students.push({ student: student._id, academicYear: academicYear });
        }

        // Assign Subjects based on classSchedules
        const subjectNames = classSchedules[c];
        const newClassSubjects = [];

        for (let periodIdx = 0; periodIdx < subjectNames.length; periodIdx++) {
            if (periodIdx >= timeSlots.length) break;

            const sName = subjectNames[periodIdx];
            const subjectDoc = subjectDocs[sName];

            // Find teacher for this subject
            // We use the teachersList to find the exact teacher name associated with the subject
            // The list is: { name: 'Mr. Iyer', subject: 'Physics' }
            const teacherObj = teachersList.find(t => t.subject === sName);

            if (!teacherObj) {
                log(`Error: No teacher found for subject ${sName}`);
                continue;
            }
            const teacherDoc = teacherDocs[teacherObj.name];

            const time = timeSlots[periodIdx];
            const scheduleArr = [];

            for (const day of days) {
                scheduleArr.push({
                    day: day,
                    startTime: time.start,
                    endTime: time.end,
                    room: `Room ${c}`
                });

                // Update Teacher Schedule
                await Schedule.findOneAndUpdate(
                    { teacher: teacherDoc._id },
                    {
                        $addToSet: {
                            entries: {
                                day: shortDays[day],
                                classNumber: c,
                                subject: sName,
                                period: periodIdx + 1,
                                startTime: time.start,
                                endTime: time.end
                            }
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            newClassSubjects.push({
                subject: subjectDoc._id,
                teacher: teacherDoc._id,
                schedule: scheduleArr,
                academicYear: academicYear
            });
        }

        classDoc.subjects = newClassSubjects;
        await classDoc.save();
    }

    log('Seed process completed successfully.');
    process.exit(0);
};

seed();


import mongoose from 'mongoose';
import User from './models/User.js';
import Schedule from './models/Schedule.js';
import Class from './models/Class.js';
import SubjectMap from './models/SubjectMap.js';

const mongoUri = 'mongodb://localhost:27017/school_management';

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

const clean = async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected. Cleaning...');

        // 1. Delete ALL teachers
        const deleteResult = await User.deleteMany({ role: 'teacher' });
        console.log(`Deleted ${deleteResult.deletedCount} existing teachers.`);

        // 2. Create ONLY the 12 approved teachers
        for (const t of teachersList) {
            const cleanName = t.name.replace(/^(Mr\.|Mrs\.|Ms\.)\s+/, '').replace(/\s+/g, '').toLowerCase();
            const cleanSubject = t.subject.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const email = `${cleanName}.${cleanSubject}@school.local`;

            await User.create({
                name: t.name,
                email: email,
                password: '$2a$10$X7.123456789012345678901234567890', // Dummy hash
                role: 'teacher',
                verified: true,
                isApproved: true,
                subject: t.subject
            });
            console.log(`Created ${t.name}`);
        }

        const finalCount = await User.countDocuments({ role: 'teacher' });
        console.log(`Final Teacher Count: ${finalCount}`);
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

clean();

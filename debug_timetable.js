
import mongoose from 'mongoose';
import User from './models/User.js';
import Class from './models/Class.js';
import Subject from './models/Subject.js';

const mongoUri = 'mongodb://localhost:27017/school_management';

const debug = async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const email = 'student1.class1@school.local';
        const student = await User.findOne({ email });
        if (!student) {
            console.log('Student not found:', email);
            return;
        }
        console.log('Student found:', student.name, 'Class:', student.classAssigned);

        const classDoc = await Class.findOne({ classNumber: student.classAssigned })
            .populate('subjects.subject')
            .populate('subjects.teacher');

        if (!classDoc) {
            console.log('Class not found for number:', student.classAssigned);
            return;
        }

        console.log('Class found:', classDoc.name);
        console.log('Subjects count:', classDoc.subjects?.length);

        if (classDoc.subjects?.length > 0) {
            console.log('First Subject:', JSON.stringify(classDoc.subjects[0], null, 2));
        } else {
            console.log('Subjects array is empty!');
            console.log('Class Doc:', JSON.stringify(classDoc, null, 2));
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
};

debug();

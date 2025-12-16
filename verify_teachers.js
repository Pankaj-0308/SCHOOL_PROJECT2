import mongoose from 'mongoose';
import User from './models/User.js';

const run = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/school_management');
        const count = await User.countDocuments({ role: 'teacher' });
        console.log('Teacher Count:', count);
        const teachers = await User.find({ role: 'teacher' }, 'name email');
        console.log('Teachers List:');
        teachers.forEach(t => console.log(`- ${t.name}`));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();

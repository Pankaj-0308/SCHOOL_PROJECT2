import mongoose from 'mongoose';
import User from './models/User.js';

mongoose.connect('mongodb://127.0.0.1:27017/school_management', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(async () => {
        try {
            const teacher = await User.findOne({ role: 'teacher' });
            if (teacher) {
                console.log('---CREDENTIALS---');
                console.log(`Email: ${teacher.email}`);
                console.log('Password: 123456');
                console.log('-----------------');
            } else {
                console.log('No teachers found.');
            }
        } catch (e) {
            console.error(e);
        } finally {
            mongoose.connection.close();
        }
    })
    .catch(err => console.error(err));

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';

const run = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/school_management', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        const email = 'iyer.physics@school.local';
        const hashedPassword = await bcrypt.hash('123456', 10);

        const result = await User.findOneAndUpdate(
            { email: email },
            {
                $set: {
                    password: hashedPassword,
                    role: 'teacher',
                    verified: true,
                    isApproved: true
                }
            },
            { new: true }
        );

        if (result) {
            console.log(`SUCCESS: Password for ${email} has been reset to 123456`);
            console.log(`Role: ${result.role}`);
        } else {
            console.log(`ERROR: User ${email} not found.`);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

run();

import mongoose from 'mongoose';
import User from './models/User.js';
import bcrypt from 'bcryptjs';

const MONGO_URI = 'mongodb://127.0.0.1:27017/school_management'; // Default local

const debugUser = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'a@gmail.com'; // The email user logic is failing on

        console.log(`Looking for user with email: ${email}`);

        // 1. Exact match
        const user = await User.findOne({ email });
        console.log('\n--- Exact Match Result ---');
        if (user) {
            console.log('User ID:', user._id);
            console.log('Email:', user.email);
            console.log('Role:', user.role);
            console.log('Password Hash:', user.password);

            const isMatch = await bcrypt.compare('123456', user.password);
            console.log(`Target password '123456' matches? ${isMatch}`);

            if (!isMatch) {
                console.log('Resetting password to 123456 for testing...');
                const newHash = await bcrypt.hash('123456', 10);
                user.password = newHash;
                await user.save();
                console.log('Password reset successful.');
            }
        } else {
            console.log('User not found via exact match.');
        }

        // 2. Case insensitive search
        console.log('\n--- Case Insensitive Search ---');
        const regexUsers = await User.find({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        console.log(`Found ${regexUsers.length} users via regex.`);
        regexUsers.forEach(u => {
            console.log(`- ${u.email} (Role: ${u.role})`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Debug script error:', err);
    }
};

debugUser();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

async function resetAdmin() {
  try {
    // Kết nối MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Đã kết nối MongoDB');

    // Xóa tất cả tài khoản admin cũ
    await User.deleteMany({ role: 'admin' });
    console.log('Đã xóa tài khoản admin cũ');

    // Tạo tài khoản admin mới
    const admin = await User.create({
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      fullName: 'Administrator',
      email: 'admin@example.com',
      role: 'admin'
    });

    console.log('Đã tạo tài khoản admin mới thành công:');
    console.log('Username:', admin.username);
    console.log('Password: admin123');
    console.log('Email:', admin.email);

  } catch (error) {
    console.error('Lỗi:', error);
  } finally {
    // Đóng kết nối MongoDB
    await mongoose.connection.close();
    process.exit(0);
  }
}

resetAdmin(); 
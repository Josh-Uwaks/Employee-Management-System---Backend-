const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Department = require('../src/models/department');
const User = require('../src/models/staff');
require('dotenv').config();

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Create ONE Department for the Super Admin
    console.log('\n📁 Creating department for Super Admin...');
    
    const departmentData = {
      name: 'Administration',
      code: 'ADMIN',
      description: 'System Administration Department'
    };

    let department;
    
    // Check if department exists
    const existingDept = await Department.findOne({ 
      $or: [
        { name: 'Administration' },
        { code: 'ADMIN' }
      ]
    });

    if (!existingDept) {
      department = await Department.create(departmentData);
      console.log(`✅ Created department: ${department.name} (${department.code})`);
      console.log(`   Department ID: ${department._id}`);
    } else {
      department = existingDept;
      console.log(`⚠️ Department already exists: ${department.name}`);
      console.log(`   Using existing department ID: ${department._id}`);
    }

    // 2. Create ONE Super Admin User
    console.log('\n👑 Creating Super Admin user...');
    
    const adminData = {
      id_card: 'KE175',
      email: '**************',
      password: await bcrypt.hash('********', 10),
      first_name: '*****',
      last_name: '*****',
      region: '*****',
      branch: '**',
      department: department._id,
      position: 'System Administrator',
      role: 'SUPER_ADMIN',
      reportsTo: null,
      isAdmin: true,
      isVerified: true,
      is_active: true
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      $or: [
        { id_card: '*****' },
        { email: '*******' }
      ]
    });

    if (!existingAdmin) {
      const adminUser = await User.create(adminData);
      
      console.log('\n🎉 SUPER ADMIN CREATED SUCCESSFULLY!');
      console.log('========================================');
      console.log(`👤 ID Card: ${adminUser.id_card}`);
      console.log(`📧 Email: ${adminUser.email}`);
      console.log(`🔑 Password: ******`);
      console.log(`🎯 Role: ${adminUser.role}`);
      console.log(`📍 Department: ${department.name} (${department.code})`);
      console.log(`🆔 Department ID: ${department._id}`);
      console.log('========================================');
      console.log('\n💡 Use these credentials to login and create other users/departments.');
    } else {
      console.log('\n⚠️ Super Admin already exists!');
      console.log('========================================');
      console.log(`👤 ID Card: ${existingAdmin.id_card}`);
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log(`🔑 Password: [Use existing password or reset]`);
      console.log(`🎯 Role: ${existingAdmin.role}`);
      console.log('========================================');
    }

    console.log('\n✅ Seed script completed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seed script failed:');
    console.error(error.message);
    process.exit(1);
  }
};

// Run the seed script node ./scripts/seed.js
seedDatabase();
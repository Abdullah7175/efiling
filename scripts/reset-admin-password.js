/**
 * Utility script to reset admin password
 * Usage: node scripts/reset-admin-password.js <new-password>
 * 
 * This script will reset the password for admin@admin.com
 * WARNING: Only use this in development or when you have database access
 */

// Try loading .env.local first, then .env
const fs = require('fs');
const path = require('path');
if (fs.existsSync(path.join(__dirname, '..', '.env.local'))) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} else if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} else {
  require('dotenv').config(); // Try default locations
}

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  user: process.env.DB_USER || 'root',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'warehouse',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function resetAdminPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    console.error('Error: Password must be at least 6 characters long');
    process.exit(1);
  }

  const client = await pool.connect();
  
  try {
    console.log('Connecting to database...');
    
    // Hash the new password with 12 rounds (matching current system)
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update admin user password
    console.log('Updating admin password for admin@admin.com...');
    const result = await client.query(
      `UPDATE users 
       SET password = $1, updated_date = CURRENT_TIMESTAMP 
       WHERE email = 'admin@admin.com' 
       RETURNING id, name, email, role`,
      [hashedPassword]
    );
    
    if (result.rows.length === 0) {
      console.error('Error: Admin user (admin@admin.com) not found in database');
      process.exit(1);
    }
    
    const user = result.rows[0];
    console.log('\n✅ Password reset successful!');
    console.log('User details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role: ${user.role}`);
    console.log(`\nNew password hash: ${hashedPassword.substring(0, 20)}...`);
    console.log('\nYou can now login with the new password.');
    
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Get password from command line argument
const newPassword = process.argv[2];

if (!newPassword) {
  console.error('Usage: node scripts/reset-admin-password.js <new-password>');
  console.error('Example: node scripts/reset-admin-password.js "MyNewPassword123"');
  process.exit(1);
}

resetAdminPassword(newPassword);


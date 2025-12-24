/**
 * Script to fix existing files with problematic filenames (spaces, special characters)
 * This script will:
 * 1. Find all files in the database with spaces or special characters
 * 2. Rename the physical files on disk
 * 3. Update the database with the new sanitized filenames
 */

const { connectToDatabase } = require('../lib/db');
const fs = require('fs');
const path = require('path');

// Sanitize filename function (same as in fileUploadOptimized.js)
function sanitizeFilename(filename) {
  const ext = path.extname(filename);
  let name = path.basename(filename, ext);
  
  // Replace spaces with hyphens
  name = name.replace(/\s+/g, '-');
  
  // Remove special characters except hyphens and underscores
  name = name.replace(/[^a-zA-Z0-9-_]/g, '');
  
  // Remove multiple consecutive hyphens
  name = name.replace(/-+/g, '-');
  
  // Remove leading/trailing hyphens
  name = name.replace(/^-+|-+$/g, '');
  
  // If name is empty after sanitization, use a default
  if (!name) {
    name = 'file';
  }
  
  // Limit length to 50 characters
  if (name.length > 50) {
    name = name.substring(0, 50);
  }
  
  return name + ext;
}

// Check if filename needs sanitization
function needsSanitization(filename) {
  if (!filename) return false;
  
  // Check for spaces
  if (filename.includes(' ')) return true;
  
  // Check for special characters (excluding hyphens, underscores, dots, and forward slashes for paths)
  const hasSpecialChars = /[^a-zA-Z0-9-_./]/.test(filename);
  return hasSpecialChars;
}

// Process files from a table
async function processTable(client, tableName, linkColumn = 'link') {
  console.log(`\n=== Processing ${tableName} table ===`);
  
  try {
    const query = `SELECT id, ${linkColumn} FROM ${tableName} WHERE ${linkColumn} IS NOT NULL`;
    const result = await client.query(query);
    
    console.log(`Found ${result.rows.length} records in ${tableName}`);
    
    let processed = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];
    
    for (const row of result.rows) {
      const oldLink = row[linkColumn];
      if (!needsSanitization(oldLink)) {
        continue;
      }
      
      processed++;
      
      try {
        // Parse the old path
        const oldPath = oldLink.startsWith('/') ? oldLink.substring(1) : oldLink;
        const oldFilePath = path.join(process.cwd(), 'public', oldPath);
        
        // Check if file exists
        if (!fs.existsSync(oldFilePath)) {
          console.warn(`  ⚠ File not found: ${oldFilePath}`);
          errors.push({ id: row.id, error: 'File not found', oldLink });
          failed++;
          continue;
        }
        
        // Generate new sanitized filename
        const dirname = path.dirname(oldPath);
        const oldFilename = path.basename(oldPath);
        const sanitizedFilename = sanitizeFilename(oldFilename);
        
        // If filename is the same after sanitization, skip
        if (oldFilename === sanitizedFilename) {
          continue;
        }
        
        const newPath = path.join(dirname, sanitizedFilename);
        const newFilePath = path.join(process.cwd(), 'public', newPath);
        const newLink = '/' + newPath.replace(/\\/g, '/');
        
        // Check if target file already exists
        if (fs.existsSync(newFilePath)) {
          // Add a random suffix to avoid collision
          const ext = path.extname(sanitizedFilename);
          const nameWithoutExt = path.basename(sanitizedFilename, ext);
          const uniqueFilename = `${nameWithoutExt}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
          const uniquePath = path.join(dirname, uniqueFilename);
          const uniqueFilePath = path.join(process.cwd(), 'public', uniquePath);
          const uniqueLink = '/' + uniquePath.replace(/\\/g, '/');
          
          // Rename the file
          fs.renameSync(oldFilePath, uniqueFilePath);
          
          // Update database
          const updateQuery = `UPDATE ${tableName} SET ${linkColumn} = $1 WHERE id = $2`;
          await client.query(updateQuery, [uniqueLink, row.id]);
          
          console.log(`  ✓ [${row.id}] Renamed (with unique suffix): ${oldFilename} -> ${uniqueFilename}`);
          updated++;
        } else {
          // Rename the file
          fs.renameSync(oldFilePath, newFilePath);
          
          // Update database
          const updateQuery = `UPDATE ${tableName} SET ${linkColumn} = $1 WHERE id = $2`;
          await client.query(updateQuery, [newLink, row.id]);
          
          console.log(`  ✓ [${row.id}] Renamed: ${oldFilename} -> ${sanitizedFilename}`);
          updated++;
        }
      } catch (error) {
        console.error(`  ✗ [${row.id}] Error: ${error.message}`);
        errors.push({ id: row.id, error: error.message, oldLink });
        failed++;
      }
    }
    
    console.log(`\n${tableName} Summary:`);
    console.log(`  - Records checked: ${result.rows.length}`);
    console.log(`  - Needing sanitization: ${processed}`);
    console.log(`  - Successfully updated: ${updated}`);
    console.log(`  - Failed: ${failed}`);
    
    if (errors.length > 0) {
      console.log(`\nErrors in ${tableName}:`);
      errors.forEach(err => {
        console.log(`  - ID ${err.id}: ${err.error} (${err.oldLink})`);
      });
    }
    
    return { processed, updated, failed, errors };
  } catch (error) {
    console.error(`Error processing ${tableName}:`, error);
    return { processed: 0, updated: 0, failed: 0, errors: [{ error: error.message }] };
  }
}

async function main() {
  console.log('===========================================');
  console.log('Starting filename sanitization script...');
  console.log('===========================================');
  
  let client;
  
  try {
    client = await connectToDatabase();
    
    // Process each table
    const tables = [
      { name: 'images', linkColumn: 'link' },
      { name: 'videos', linkColumn: 'link' },
      { name: 'final_videos', linkColumn: 'link' },
      { name: 'before_content', linkColumn: 'link' }
    ];
    
    const results = {};
    
    for (const table of tables) {
      results[table.name] = await processTable(client, table.name, table.linkColumn);
    }
    
    // Print summary
    console.log('\n\n===========================================');
    console.log('OVERALL SUMMARY');
    console.log('===========================================');
    
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    
    for (const [tableName, result] of Object.entries(results)) {
      console.log(`\n${tableName}:`);
      console.log(`  - Processed: ${result.processed}`);
      console.log(`  - Updated: ${result.updated}`);
      console.log(`  - Failed: ${result.failed}`);
      
      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalFailed += result.failed;
    }
    
    console.log('\n-------------------------------------------');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Total failed: ${totalFailed}`);
    console.log('===========================================');
    
    if (totalFailed > 0) {
      console.log('\n⚠ Some files failed to update. Please check the errors above.');
      process.exit(1);
    } else {
      console.log('\n✓ All files processed successfully!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    if (client && client.release) {
      client.release();
    }
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { sanitizeFilename, needsSanitization };


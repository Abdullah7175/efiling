import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const uploadDir = path.join(process.cwd(), 'public/uploads/users');

export async function saveFile(file) {
  try {
    // Create uploads directory if it doesn't exist
    await fs.mkdir(uploadDir, { recursive: true });

    const buffer = await file.arrayBuffer();
    const uniqueName = `${uuidv4()}_${file.name}`;
    const filePath = path.join(uploadDir, uniqueName);
    
    await fs.writeFile(filePath, Buffer.from(buffer));
    
    return `/uploads/users/${uniqueName}`;
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
}

export async function deleteFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), 'public', filePath);
    await fs.unlink(fullPath);
  } catch (error) {
    console.error('Error deleting file:', error);
  }
}
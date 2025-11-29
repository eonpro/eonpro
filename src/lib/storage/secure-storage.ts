/**
 * Secure File Storage Service
 * HIPAA-compliant file storage outside public directory
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

// Private storage directory (outside public)
const PRIVATE_STORAGE_BASE = process.env.PRIVATE_STORAGE_PATH || 
  path.join(process.cwd(), 'private-storage');

// Ensure private storage directory exists
async function ensureStorageDir(subPath: string): Promise<string> {
  const fullPath = path.join(PRIVATE_STORAGE_BASE, subPath);
  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

/**
 * Generate secure filename to prevent path traversal
 */
function generateSecureFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}${ext}`;
}

/**
 * Validate file type for medical documents
 */
export function isAllowedFileType(mimeType: string): boolean {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  return allowedTypes.includes(mimeType.toLowerCase());
}

/**
 * Store file securely outside public directory
 */
export async function storeFile(
  file: Buffer | Uint8Array,
  originalName: string,
  category: string,
  metadata: {
    patientId: number;
    clinicId?: number;
    uploadedBy: number;
    mimeType: string;
  }
): Promise<{
  filename: string;
  path: string;
  size: number;
}> {
  try {
    // Validate file type
    if (!isAllowedFileType(metadata.mimeType)) {
      throw new Error(`File type not allowed: ${metadata.mimeType}`);
    }
    
    // Generate secure filename
    const filename = generateSecureFilename(originalName);
    
    // Create directory structure: /clinicId/patientId/category/
    const relativePath = path.join(
      String(metadata.clinicId || 'default'),
      String(metadata.patientId),
      category
    );
    
    const storageDir = await ensureStorageDir(relativePath);
    const fullPath = path.join(storageDir, filename);
    
    // Write file
    await fs.writeFile(fullPath, file);
    
    // Get file stats
    const stats = await fs.stat(fullPath);
    
    // Log file storage for audit
    logger.db('CREATE', 'file_storage', {
      filename,
      path: relativePath,
      size: stats.size,
      patientId: metadata.patientId,
      uploadedBy: metadata.uploadedBy
    });
    
    return {
      filename,
      path: path.join(relativePath, filename),
      size: stats.size
    };
  } catch (error) {
    logger.error('Failed to store file securely:', error);
    throw new Error('Failed to store file');
  }
}

/**
 * Retrieve file from secure storage
 */
export async function retrieveFile(
  filePath: string,
  expectedPatientId?: number
): Promise<{
  data: Buffer;
  mimeType?: string;
}> {
  try {
    // Prevent path traversal attacks
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new Error('Invalid file path');
    }
    
    // Verify patient ID in path if provided
    if (expectedPatientId && !normalizedPath.includes(String(expectedPatientId))) {
      throw new Error('File access denied');
    }
    
    const fullPath = path.join(PRIVATE_STORAGE_BASE, normalizedPath);
    
    // Check file exists
    await fs.access(fullPath);
    
    // Read file
    const data = await fs.readFile(fullPath);
    
    // Determine MIME type from extension
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    
    return {
      data,
      mimeType: mimeTypes[ext] || 'application/octet-stream'
    };
  } catch (error) {
    logger.error('Failed to retrieve file:', error);
    throw new Error('File not found or access denied');
  }
}

/**
 * Delete file from secure storage
 */
export async function deleteFile(
  filePath: string,
  expectedPatientId?: number
): Promise<boolean> {
  try {
    // Prevent path traversal
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new Error('Invalid file path');
    }
    
    // Verify patient ID in path if provided
    if (expectedPatientId && !normalizedPath.includes(String(expectedPatientId))) {
      throw new Error('File access denied');
    }
    
    const fullPath = path.join(PRIVATE_STORAGE_BASE, normalizedPath);
    
    // Delete file
    await fs.unlink(fullPath);
    
    logger.db('DELETE', 'file_storage', {
      path: normalizedPath
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to delete file:', error);
    return false;
  }
}

/**
 * Move existing public files to secure storage
 */
export async function migratePublicFiles(): Promise<{
  migrated: number;
  failed: number;
}> {
  const results = {
    migrated: 0,
    failed: 0
  };
  
  try {
    // Check public directories
    const publicDirs = [
      path.join(process.cwd(), 'public', 'uploads', 'documents'),
      path.join(process.cwd(), 'public', 'intake-pdfs')
    ];
    
    for (const dir of publicDirs) {
      try {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          try {
            const sourcePath = path.join(dir, file);
            const stats = await fs.stat(sourcePath);
            
            if (stats.isFile()) {
              // Read file
              const data = await fs.readFile(sourcePath);
              
              // Store in secure location
              // Note: You'll need to determine patient/clinic from filename or database
              const stored = await storeFile(
                data,
                file,
                'migrated',
                {
                  patientId: 0, // You'll need to lookup from database
                  clinicId: 1,
                  uploadedBy: 0, // System migration
                  mimeType: 'application/octet-stream'
                }
              );
              
              // Delete original
              await fs.unlink(sourcePath);
              
              results.migrated++;
              logger.info(`Migrated file: ${file} to ${stored.path}`);
            }
          } catch (error) {
            logger.error(`Failed to migrate file ${file}:`, error);
            results.failed++;
          }
        }
      } catch (error) {
        logger.error(`Cannot read directory ${dir}:`, error);
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

// Cleanup old temp files
export async function cleanupTempFiles(olderThanHours: number = 24): Promise<number> {
  let cleaned = 0;
  
  try {
    const tempDir = path.join(PRIVATE_STORAGE_BASE, 'temp');
    const files = await fs.readdir(tempDir).catch(() => []);
    
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < cutoffTime) {
        await fs.unlink(filePath);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} temporary files`);
    }
    
    return cleaned;
  } catch (error) {
    logger.error('Temp file cleanup failed:', error);
    return cleaned;
  }
}

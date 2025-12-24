"use client";
import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState(null);

  const uploadFile = useCallback(async (file, endpoint, formData, options = {}) => {
    const {
      onProgress = () => {},
      onSuccess = () => {},
      onError = () => {},
      chunkSize = 5 * 1024 * 1024, // 5MB chunks
      maxRetries = 3,
      maxFileSize = 100 * 1024 * 1024 // 100MB default max for videos
    } = options;

    setUploading(true);
    setProgress(0);
    setError(null);
    setUploadStatus('Preparing upload...');

    try {
      // Validate file size before upload
      if (file.size > maxFileSize) {
        const error = new Error(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${maxFileSize / (1024 * 1024)}MB`);
        setError(error.message);
        setUploadStatus('Upload failed');
        onError(error);
        toast({
          title: "File Too Large",
          description: error.message,
          variant: "destructive"
        });
        throw error;
      }

      // For files larger than 50MB, use chunked upload
      if (file.size > 50 * 1024 * 1024) {
        return await uploadFileChunked(file, endpoint, formData, {
          chunkSize,
          maxRetries,
          onProgress,
          onSuccess,
          onError
        });
      } else {
        return await uploadFileStandard(file, endpoint, formData, {
          onProgress,
          onSuccess,
          onError
        });
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
      setUploadStatus('Upload failed');
      onError(err);
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to upload file",
        variant: "destructive"
      });
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const uploadFileStandard = async (file, endpoint, formData, { onProgress, onSuccess, onError }) => {
    setUploadStatus('Uploading file...');
    
    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100);
          setUploadStatus('Upload completed');
          const response = JSON.parse(xhr.responseText);
          onSuccess(response);
          toast({
            title: "Upload Successful",
            description: "File uploaded successfully",
            variant: "success"
          });
          resolve(response);
        } else {
          const error = new Error(`Upload failed: ${xhr.statusText}`);
          setError(error.message);
          onError(error);
          reject(error);
        }
      });

      xhr.addEventListener('error', () => {
        const error = new Error('Network error during upload');
        setError(error.message);
        onError(error);
        reject(error);
      });

      xhr.addEventListener('abort', () => {
        const error = new Error('Upload was aborted');
        setError(error.message);
        onError(error);
        reject(error);
      });

      xhr.open('POST', endpoint);
      xhr.send(formData);
    });
  };

  const uploadFileChunked = async (file, endpoint, formData, { chunkSize, maxRetries, onProgress, onSuccess, onError }) => {
    setUploadStatus('Uploading file in chunks...');
    
    const totalChunks = Math.ceil(file.size / chunkSize);
    let uploadedChunks = 0;
    const uploadId = Date.now().toString();
    
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        setUploadStatus(`Uploading chunk ${chunkIndex + 1} of ${totalChunks}...`);
        
        const chunkFormData = new FormData();
        chunkFormData.append('chunk', chunk);
        chunkFormData.append('chunkIndex', chunkIndex);
        chunkFormData.append('totalChunks', totalChunks);
        chunkFormData.append('uploadId', uploadId);
        chunkFormData.append('fileName', file.name);
        chunkFormData.append('fileSize', file.size);
        
        // Add original form data fields
        for (const [key, value] of formData.entries()) {
          if (key !== 'file' && key !== 'img' && key !== 'vid' && key !== 'videoFile') {
            chunkFormData.append(key, value);
          }
        }
        
        let retryCount = 0;
        let chunkUploaded = false;
        
        while (retryCount < maxRetries && !chunkUploaded) {
          try {
            const response = await fetch(`${endpoint}/chunk`, {
              method: 'POST',
              body: chunkFormData,
            });
            
            if (!response.ok) {
              throw new Error(`Chunk upload failed: ${response.statusText}`);
            }
            
            chunkUploaded = true;
            uploadedChunks++;
            const progress = Math.round((uploadedChunks / totalChunks) * 100);
            setProgress(progress);
            onProgress(progress);
            
          } catch (chunkError) {
            retryCount++;
            if (retryCount >= maxRetries) {
              throw new Error(`Failed to upload chunk ${chunkIndex + 1} after ${maxRetries} retries: ${chunkError.message}`);
            }
            setUploadStatus(`Retrying chunk ${chunkIndex + 1}... (attempt ${retryCount + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
          }
        }
      }
      
      // Finalize upload
      setUploadStatus('Finalizing upload...');
      
      // Collect all form data fields to pass to finalize
      const finalizeData = {
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        totalChunks
      };
      
      // Add all form data fields for database entry
      for (const [key, value] of formData.entries()) {
        if (key !== 'file' && key !== 'img' && key !== 'vid' && key !== 'videoFile') {
          finalizeData[key] = value;
        }
      }
      
      const finalizeResponse = await fetch(`${endpoint}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalizeData),
      });
      
      if (!finalizeResponse.ok) {
        throw new Error('Failed to finalize upload');
      }
      
      const result = await finalizeResponse.json();
      setProgress(100);
      setUploadStatus('Upload completed');
      onSuccess(result);
      toast({
        title: "Upload Successful",
        description: "File uploaded successfully",
        variant: "success"
      });
      return result;
      
    } catch (error) {
      setError(error.message);
      setUploadStatus('Upload failed');
      onError(error);
      throw error;
    }
  };

  const reset = useCallback(() => {
    setUploading(false);
    setProgress(0);
    setUploadStatus('');
    setError(null);
  }, []);

  return {
    uploading,
    progress,
    uploadStatus,
    error,
    uploadFile,
    reset
  };
}

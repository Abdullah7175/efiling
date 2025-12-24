"use client";
import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Upload, CheckCircle, AlertCircle } from 'lucide-react';

export function UploadProgressIndicator({ 
  isVisible, 
  onClose, 
  files = [], 
  onRetry,
  onCancel 
}) {
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [status, setStatus] = useState('uploading'); // uploading, completed, error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setCurrentFile('');
      setStatus('uploading');
      setErrorMessage('');
    }
  }, [isVisible]);

  // Simulate progress for demonstration
  useEffect(() => {
    if (isVisible && status === 'uploading') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            setStatus('completed');
            clearInterval(interval);
            return 100;
          }
          return prev + Math.random() * 10;
        });
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isVisible, status]);

  const handleRetry = () => {
    setProgress(0);
    setStatus('uploading');
    setErrorMessage('');
    onRetry?.();
  };

  const handleCancel = () => {
    onCancel?.();
    onClose?.();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Uploading Files</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={status === 'uploading'}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>

          {/* Current File */}
          {currentFile && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Current:</span> {currentFile}
            </div>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Files:</div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Upload className="w-3 h-3 text-blue-500" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-gray-500">({formatFileSize(file.size)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2">
            {status === 'uploading' && (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-sm text-blue-600">Uploading...</span>
              </>
            )}
            {status === 'completed' && (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">Upload completed!</span>
              </>
            )}
            {status === 'error' && (
              <>
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600">Upload failed</span>
              </>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {status === 'error' && (
              <Button onClick={handleRetry} size="sm">
                Retry Upload
              </Button>
            )}
            {status === 'uploading' && (
              <Button onClick={handleCancel} variant="outline" size="sm">
                Cancel
              </Button>
            )}
            {status === 'completed' && (
              <Button onClick={onClose} size="sm">
                Close
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

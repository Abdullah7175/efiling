"use client";
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Upload, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export function UploadProgressCard({ 
  isVisible, 
  onClose, 
  uploading, 
  progress, 
  uploadStatus, 
  error,
  fileName,
  fileSize,
  onRetry,
  onCancel 
}) {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    if (error) return <AlertCircle className="w-5 h-5 text-red-500" />;
    if (progress === 100) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (uploading) return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
    return <Upload className="w-5 h-5 text-gray-500" />;
  };

  const getStatusColor = () => {
    if (error) return 'text-red-600';
    if (progress === 100) return 'text-green-600';
    if (uploading) return 'text-blue-600';
    return 'text-gray-600';
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">File Upload</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={uploading && !error}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* File Info */}
          {fileName && (
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-900 truncate">
                {fileName}
              </div>
              {fileSize && (
                <div className="text-xs text-gray-500">
                  {formatFileSize(fileSize)}
                </div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={`text-sm ${getStatusColor()}`}>
              {uploadStatus || (uploading ? 'Uploading...' : 'Ready')}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              <div className="font-medium mb-1">Upload Failed</div>
              <div>{error}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {error && onRetry && (
              <Button onClick={onRetry} size="sm" className="flex-1">
                Retry Upload
              </Button>
            )}
            {uploading && onCancel && (
              <Button onClick={onCancel} variant="outline" size="sm" className="flex-1">
                Cancel
              </Button>
            )}
            {!uploading && !error && (
              <Button onClick={onClose} size="sm" className="flex-1">
                Close
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

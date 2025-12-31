'use client';

/**
 * ImageViewer Component
 *
 * Displays image files with zoom controls and download option.
 * Supports common image formats: PNG, JPG, JPEG, GIF, WEBP, SVG.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/types/artifact';

interface ImageViewerProps {
  /** File path for display */
  path: string;
  /** Base64 encoded image data or URL */
  src?: string;
  /** MIME type of the image */
  mimeType?: string;
  /** File size in bytes */
  size?: number;
  /** Artifact ID for constructing download URL */
  artifactId?: string;
  className?: string;
}

export function ImageViewer({
  path,
  src,
  mimeType,
  size,
  artifactId,
  className,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState(false);

  const fileName = path.split('/').pop() || path;

  // Construct image source URL
  // In production, this would be a pre-signed URL from S3
  // For now, we'll show a placeholder or use the provided src
  const imageUrl = src || (artifactId
    ? `/api/artifacts/${artifactId}/files/${encodeURIComponent(path)}`
    : null);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 400));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 25));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  if (error || !imageUrl) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🖼️</div>
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            {fileName}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {error ? 'Failed to load image preview.' : 'Image preview not available.'}
          </p>
          <div className="text-xs text-gray-400 mb-4">
            {mimeType || 'image/*'} {size ? `• ${formatFileSize(size)}` : ''}
          </div>
          <p className="text-gray-400 text-xs">
            Download the artifact to view this image.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Image header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-lg">🖼️</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {fileName}
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">{mimeType || 'image'}</span>
          {size && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-gray-500">{formatFileSize(size)}</span>
            </>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 25}
            className="px-2"
          >
            −
          </Button>
          <button
            onClick={handleResetZoom}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 min-w-[4rem] text-center"
          >
            {zoom}%
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 400}
            className="px-2"
          >
            +
          </Button>
        </div>
      </div>

      {/* Image container with scrollable area */}
      <div className="flex-1 overflow-auto bg-[#1a1a1a] dark:bg-[#0d0d0d]">
        <div
          className="min-h-full flex items-center justify-center p-4"
          style={{
            // Add checkerboard pattern for transparent images
            backgroundImage: `
              linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
              linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
              linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        >
          <img
            src={imageUrl}
            alt={fileName}
            onError={() => setError(true)}
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center',
              transition: 'transform 0.2s ease-out',
              maxWidth: zoom > 100 ? 'none' : '100%',
              maxHeight: zoom > 100 ? 'none' : '100%',
            }}
            className="shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}

export default ImageViewer;

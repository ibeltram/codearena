'use client';

/**
 * FileTree Component
 *
 * Displays a hierarchical file tree with expandable directories
 * and clickable files.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FileTreeNode,
  getFileIcon,
  formatFileSize,
} from '@/types/artifact';

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  className?: string;
}

export function FileTree({
  nodes,
  selectedPath,
  onSelectFile,
  className,
}: FileTreeProps) {
  return (
    <div className={cn('text-sm', className)}>
      {nodes.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          depth={0}
        />
      ))}
    </div>
  );
}

interface FileTreeItemProps {
  node: FileTreeNode;
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  depth: number;
}

function FileTreeItem({
  node,
  selectedPath,
  onSelectFile,
  depth,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          isSelected && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={node.isDirectory ? isExpanded : undefined}
      >
        {/* Expand/Collapse indicator for directories */}
        {node.isDirectory && (
          <span className="w-4 h-4 flex items-center justify-center text-gray-400">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}

        {/* File/Folder icon */}
        <span className="flex-shrink-0" role="img" aria-hidden>
          {getFileIcon(node)}
        </span>

        {/* File/Folder name */}
        <span className="flex-1 truncate" title={node.name}>
          {node.name}
        </span>

        {/* File size (for files only) */}
        {!node.isDirectory && node.size !== undefined && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      {/* Render children if directory is expanded */}
      {node.isDirectory && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default FileTree;

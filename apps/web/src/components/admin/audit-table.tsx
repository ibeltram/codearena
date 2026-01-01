'use client';

import { useState } from 'react';
import {
  Eye,
  AlertCircle,
  Key,
  Shield,
  Flag,
  CreditCard,
  Swords,
  Upload,
  Code,
  Trophy,
  Gift,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AuditEvent,
  AuditCategory,
  categoryLabels,
  categoryColors,
} from '@/types/audit';

// Category icon mapping
const categoryIcons: Record<AuditCategory, React.ElementType> = {
  auth: Key,
  admin: Shield,
  moderation: Flag,
  payment: CreditCard,
  match: Swords,
  submission: Upload,
  challenge: Code,
  tournament: Trophy,
  reward: Gift,
  system: Settings,
};

// Simple relative time formatter
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Format event type for display
function formatEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface AuditTableProps {
  events: AuditEvent[];
  isLoading?: boolean;
  onViewDetail?: (id: string) => void;
}

export function AuditTable({ events, isLoading, onViewDetail }: AuditTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [expandedPayloads, setExpandedPayloads] = useState<Set<string>>(new Set());

  if (isLoading) {
    return <AuditTableSkeleton />;
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-2 font-medium text-muted-foreground">No audit events found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your filters or check back later.
        </p>
      </div>
    );
  }

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <>
      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Event</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Entity</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Actor</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Time</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const CategoryIcon = categoryIcons[event.category] || Settings;
              const isExpanded = expandedPayloads.has(event.id);

              return (
                <tr
                  key={event.id}
                  className="border-b last:border-b-0 hover:bg-muted/25"
                >
                  <td className="px-4 py-3">
                    <div className="max-w-xs">
                      <div className="flex items-center gap-2">
                        <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {formatEventType(event.eventType)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                        {event.id.substring(0, 8)}...
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={categoryColors[event.category]}>
                      {categoryLabels[event.category]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {event.entityType ? (
                      <div>
                        <p className="text-sm font-medium">{event.entityType}</p>
                        {event.entityId && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {event.entityId.substring(0, 8)}...
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {event.actorUserId ? (
                      <p className="text-xs text-muted-foreground font-mono">
                        {event.actorUserId.substring(0, 8)}...
                      </p>
                    ) : (
                      <span className="text-sm text-muted-foreground">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(event.createdAt)}
                      </span>
                      {event.ipAddress && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {event.ipAddress}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {event.payload && Object.keys(event.payload).length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePayload(event.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (onViewDetail) {
                            onViewDetail(event.id);
                          } else {
                            setSelectedEvent(event);
                          }
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Event Details</DialogTitle>
            <DialogDescription>
              Event ID: {selectedEvent?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Event Type
                  </label>
                  <p className="font-medium">
                    {formatEventType(selectedEvent.eventType)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Category
                  </label>
                  <div className="mt-1">
                    <Badge className={categoryColors[selectedEvent.category]}>
                      {categoryLabels[selectedEvent.category]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Entity
                  </label>
                  <p>
                    {selectedEvent.entityType || '-'}
                    {selectedEvent.entityId && (
                      <span className="text-muted-foreground text-xs ml-2 font-mono">
                        {selectedEvent.entityId}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Actor
                  </label>
                  <p className="font-mono text-sm">
                    {selectedEvent.actorUserId || 'System'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Timestamp
                  </label>
                  <p>{new Date(selectedEvent.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    IP Address
                  </label>
                  <p className="font-mono text-sm">
                    {selectedEvent.ipAddress || '-'}
                  </p>
                </div>
                {selectedEvent.requestId && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Request ID
                    </label>
                    <p className="font-mono text-sm">{selectedEvent.requestId}</p>
                  </div>
                )}
              </div>

              {selectedEvent.payload &&
                Object.keys(selectedEvent.payload).length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Payload
                    </label>
                    <pre className="mt-1 p-3 rounded-lg bg-muted text-sm overflow-x-auto">
                      {JSON.stringify(selectedEvent.payload, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AuditTableSkeleton() {
  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Event</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Entity</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Actor</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Time</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }).map((_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-1 h-3 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-24" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="mt-1 h-3 w-24" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="mt-1 h-3 w-24" />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

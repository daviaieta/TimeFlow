'use client';

import { useEffect, useState } from 'react';
import { fetchAdapter } from '@/adapters/fetchAdapter';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { NotFound } from '@/components/not-found';
import { useRouter } from 'next/navigation';
import { useAuthUser } from '@/app/dashboard/auth-context';

export default function CustomerNotesPage({ params }: { params: { publicId: string } }) {
  const { user } = useAuthUser();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const router = useRouter();

  useEffect(() => {
    async function fetchNotes() {
      try {
        setLoading(true);
        const { data } = await fetchAdapter<{ notes: any[] }>({
          method: 'GET',
          path: `/customers/${params.publicId}/notes`,
        });
        setNotes(data.notes);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load notes');
      } finally {
        setLoading(false);
      }
    }

    fetchNotes();
  }, [params.publicId]);

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    setIsAdding(true);
    try {
      await fetchAdapter<{ note: any }>({
        method: 'POST',
        path: `/customers/${params.publicId}/notes`,
        body: { body: newNoteContent },
      });
      setNewNoteContent('');
      // Refetch notes
      const { data } = await fetchAdapter<{ notes: any[] }>({
        method: 'GET',
        path: `/customers/${params.publicId}/notes`,
      });
      setNotes(data.notes);
    } catch (err: any) {
      setError(err.message || 'Failed to add note');
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditNote = async (noteId: string) => {
    if (!editNoteContent.trim()) return;
    try {
      await fetchAdapter<{ note: any }>({
        method: 'PATCH',
        path: `/customers/${params.publicId}/notes/${noteId}`,
        body: { body: editNoteContent },
      });
      // Refetch notes
      const { data } = await fetchAdapter<{ notes: any[] }>({
        method: 'GET',
        path: `/customers/${params.publicId}/notes`,
      });
      setNotes(data.notes);
      setIsEditing(false);
      setEditNoteId(null);
      setEditNoteContent('');
    } catch (err: any) {
      setError(err.message || 'Failed to update note');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      await fetchAdapter({
        method: 'DELETE',
        path: `/customers/${params.publicId}/notes/${noteId}`,
      });
      // Refetch
      const { data } = await fetchAdapter<{ notes: any[] }>({
        method: 'GET',
        path: `/customers/${params.publicId}/notes`,
      });
      setNotes(data.notes);
    } catch (err: any) {
      setError(err.message || 'Failed to delete note');
    }
  };

  const handleStartEdit = (note: any) => {
    setEditNoteId(note.id.toString());
    setEditNoteContent(note.body);
    setIsEditing(true);
  };

  if (loading) return <Spinner />;
  if (error) return <NotFound message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Customer Notes</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => {
              setIsAdding(true);
            }}
            className="btn btn-primary"
          >
            Add Note
          </button>
        </div>
      </div>

      {/* Add Note Dialog */}
      <Dialog
        open={isAdding}
        onOpenChange={(open) => {
          if (!open) setIsAdding(false);
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-col space-y-2">
            <label htmlForm="note-content" className="font-medium">
              Note
            </label>
            <Textarea
              id="note-content"
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Write a note..."
              rows={4}
              className="w-full"
              disabled={isAdding}
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setIsAdding(false)}
              className="btn btn-outline"
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              onClick={handleAddNote}
              className="btn btn-primary"
              disabled={isAdding || !newNoteContent.trim()}
            >
              {isAdding ? 'Adding...' : 'Save'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog
        open={isEditing}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditing(false);
            setEditNoteId(null);
            setEditNoteContent('');
          }
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-col space-y-2">
            <label htmlForm="edit-note-content" className="font-medium">
              Edit Note
            </label>
            <Textarea
              id="edit-note-content"
              value={editNoteContent}
              onChange={(e) => setEditNoteContent(e.target.value)}
              placeholder="Edit note..."
              rows={4}
              className="w-full"
              disabled={isEditing}
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditNoteId(null);
                setEditNoteContent('');
              }}
              className="btn btn-outline"
              disabled={isEditing}
            >
              Cancel
            </button>
            <button
              onClick={handleEditNote}
              className="btn btn-primary"
              disabled={isEditing || !editNoteContent.trim()}
            >
              {isEditing ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Dialog>

      {notes.length === 0 ? (
        <p className="text-center text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => {
            const canEditOrDelete =
              user &&
              ((note.author && note.author.id === user.sub) || user.role === 'ADMIN');
            return (
              <div key={note.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">
                      {note.author?.name ?? 'Unknown'}
                    </span>
                    {!canEditOrDelete && (
                      <span className="text-xs text-muted-foreground">(read-only)</span>
                    )}
                  </div>
                  <time dateTime={note.createdAt} className="text-sm text-muted-foreground">
                    {new Date(note.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="text-muted-foreground">{note.body}</p>
                <div className="mt-2 flex justify-end space-x-2">
                  {canEditOrDelete && (
                    <>
                      <button
                        onClick={() => handleStartEdit(note)}
                        className="btn btn-outline btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="btn btn-error btn-sm"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}